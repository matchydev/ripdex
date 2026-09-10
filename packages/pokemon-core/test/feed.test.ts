/**
 * Live rip feed tests (spec §19).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PokemonCard, PokemonSet } from '../src/types.ts';
import type { PriceQuote } from '../src/price.ts';
import type { PackConfig } from '../src/odds.ts';
import { JsonCatalogStore } from '../src/stores/json-store.ts';
import { buildCatalogIndex, type CatalogIndex } from '../src/query.ts';
import { classifyTier, PullTier } from '../src/tiers.ts';
import { cardIdForVariant, type StoredOpening, type StoredOpeningCard } from '../src/openings.ts';
import {
  FeedProminence,
  abbreviateWallet,
  buildFeed,
  prominenceFor,
  relativeTime,
  watchLiveCursor,
  type FeedEvent,
} from '../src/feed.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const CHARIZARD = 'base1|4|holofoil|1st-edition';
/** Same card, same number, different print run, an order of magnitude cheaper.
 *  Present so a join keyed on cardId has somewhere wrong to land. */
const CHARIZARD_UNLIMITED = 'base1|4|holofoil|unlimited';
const BLASTOISE = 'base1|2|holofoil|unlimited';
const MACHOKE = 'base1|34|holofoil|unlimited';
const PIDGEY = 'base1|57|non-foil|unlimited';
/** Deliberately never ingested: the ledger outlives any single catalog build. */
const GHOST = 'base1|9|holofoil|shadowless';

const WALLET = '0x71C7656EC7ab88b098defB751B7401B5f6d89F2b';

const SETS: PokemonSet[] = [
  {
    id: 'base1', name: 'Base', series: 'Base', symbolUrl: null, logoUrl: null,
    releaseDate: '1999-01-09', total: 102, printedTotal: 102,
  },
];

function card(number: string, name: string): PokemonCard {
  return {
    id: `base1-${number}`, name, supertype: 'Pokémon', subtypes: [], types: ['Fire'], hp: 60,
    evolvesFrom: null, evolvesTo: [], rules: [], attacks: [], weaknesses: [], resistances: [],
    retreatCost: [], convertedRetreatCost: null,
    setId: 'base1', setName: 'Base', setSeries: 'Base', setSymbolUrl: null, setLogoUrl: null,
    setReleaseDate: '1999-01-09', setTotal: 102,
    number, artist: 'Mitsuhiro Arita', rarity: 'Rare Holo', flavorText: null,
    nationalPokedexNumbers: [], legalities: {},
    images: { small: `${number}-s.png`, large: `${number}-l.png` },
    source: { provider: 'test', fetchedAt: '2026-09-08T00:00:00.000Z' },
  };
}

function quote(variantId: string, value: number): PriceQuote {
  return {
    variantId, low: value, mid: value, high: value, market: value,
    referenceValue: value, basis: 'market', currency: 'USD',
    source: 'test', sourceUrl: null, sourceUpdatedAt: '2026-09-08T00:00:00.000Z',
  };
}

const PACKS: PackConfig[] = [
  {
    id: 'vintage-base',
    name: 'Vintage Base',
    version: 'v1',
    cardsPerPack: 2,
    priceRip: 1000n,
    distributionModel: { kind: 'flat' },
    pool: [
      { variantId: CHARIZARD, weight: 1 },
      { variantId: PIDGEY, weight: 999 },
    ],
    artwork: {
      wrapperAssetKey: 'wrapper/base', heroAssetKey: null, accentColor: '#FF6B1A',
      backgroundColor: '#080403', foilTone: 'warm', texture: 'aged',
    },
    allowDuplicatesWithinPack: true,
  },
];

async function index(t: { after(fn: () => unknown): void }): Promise<CatalogIndex> {
  const dir = await mkdtemp(join(tmpdir(), 'ripdex-feed-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const store = new JsonCatalogStore(dir);
  await store.upsertSets(SETS);
  await store.upsertCards([
    card('4', 'Charizard'),
    card('2', 'Blastoise'),
    card('34', 'Machoke'),
    card('57', 'Pidgey'),
  ]);
  await store.upsertVariants([
    { variantId: CHARIZARD, cardId: 'base1-4', setId: 'base1', number: '4', finish: 'holofoil', printing: '1st-edition', confidence: 'reported' },
    { variantId: CHARIZARD_UNLIMITED, cardId: 'base1-4', setId: 'base1', number: '4', finish: 'holofoil', printing: 'unlimited', confidence: 'reported' },
    { variantId: BLASTOISE, cardId: 'base1-2', setId: 'base1', number: '2', finish: 'holofoil', printing: 'unlimited', confidence: 'reported' },
    { variantId: MACHOKE, cardId: 'base1-34', setId: 'base1', number: '34', finish: 'holofoil', printing: 'unlimited', confidence: 'reported' },
    { variantId: PIDGEY, cardId: 'base1-57', setId: 'base1', number: '57', finish: 'non-foil', printing: 'unlimited', confidence: 'reported' },
  ]);
  await store.upsertPrices([
    // Today's catalog price for the Charizard is deliberately NOT the value the
    // rips below froze, so a test that reads the wrong one fails loudly.
    { variantId: CHARIZARD, observedOn: '2026-09-08', quote: quote(CHARIZARD, 700) },
    { variantId: CHARIZARD_UNLIMITED, observedOn: '2026-09-08', quote: quote(CHARIZARD_UNLIMITED, 95) },
    { variantId: BLASTOISE, observedOn: '2026-09-08', quote: quote(BLASTOISE, 180) },
    { variantId: MACHOKE, observedOn: '2026-09-08', quote: quote(MACHOKE, 42) },
    { variantId: PIDGEY, observedOn: '2026-09-08', quote: quote(PIDGEY, 0.24) },
  ]);
  await store.close();

  return buildCatalogIndex(store);
}

function pull(variantId: string, value: number, slot: number): StoredOpeningCard {
  return {
    variantId,
    cardId: cardIdForVariant(variantId),
    probability: 0.001,
    referenceValue: value,
    currency: 'USD',
    tier: classifyTier(value),
    slot,
  };
}

function rip(
  openingId: string,
  openedAt: string,
  pulls: StoredOpeningCard[],
  over: Partial<StoredOpening> = {},
): StoredOpening {
  return {
    openingId,
    openedAt,
    wallet: WALLET,
    packId: 'vintage-base',
    packVersion: 'v1',
    cards: pulls,
    verification: {
      serverSeedHash: `ssh-${openingId}`, clientSeed: 'seed', nonce: 1,
      priceSnapshotId: 'ps_test', packConfigSnapshotId: 'pc_test',
      priceSnapshotHash: 'price-hash', packConfigSnapshotHash: 'config-hash',
      serverSeed: null,
    },
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * Prominence
 * ------------------------------------------------------------------ */

test('prominence follows the stored tier', () => {
  assert.equal(prominenceFor(PullTier.Grail), FeedProminence.Major);
  assert.equal(prominenceFor(PullTier.Tier4), FeedProminence.Major);
  assert.equal(prominenceFor(PullTier.Tier3), FeedProminence.Notable);
  assert.equal(prominenceFor(PullTier.Tier2), FeedProminence.Normal);
  assert.equal(prominenceFor(PullTier.Tier1), FeedProminence.Normal);
});

/* ------------------------------------------------------------------ *
 * Relative time
 * ------------------------------------------------------------------ */

const NOW = new Date('2026-09-08T12:00:00.000Z');
const at = (msAgo: number): string => new Date(NOW.getTime() - msAgo).toISOString();

test('relative time renders each unit', () => {
  assert.equal(relativeTime(at(12_000), NOW), '12 seconds ago');
  assert.equal(relativeTime(at(3 * 60_000), NOW), '3 minutes ago');
  assert.equal(relativeTime(at(2 * 3_600_000), NOW), '2 hours ago');
  assert.equal(relativeTime(at(5 * 86_400_000), NOW), '5 days ago');
});

test('relative time singularizes one of each unit', () => {
  assert.equal(relativeTime(at(1_000), NOW), '1 second ago');
  assert.equal(relativeTime(at(60_000), NOW), '1 minute ago');
  assert.equal(relativeTime(at(3_600_000), NOW), '1 hour ago');
  assert.equal(relativeTime(at(86_400_000), NOW), '1 day ago');
});

test('relative time rolls over at the unit boundaries, not past them', () => {
  assert.equal(relativeTime(at(59_999), NOW), '59 seconds ago', 'one ms short of a minute');
  assert.equal(relativeTime(at(60_000), NOW), '1 minute ago', 'exactly 60s is not "60 seconds"');
  assert.equal(relativeTime(at(3_599_999), NOW), '59 minutes ago');
  assert.equal(relativeTime(at(3_600_000), NOW), '1 hour ago', 'exactly 1h is not "60 minutes"');
  assert.equal(relativeTime(at(86_399_999), NOW), '23 hours ago');
  assert.equal(relativeTime(at(86_400_000), NOW), '1 day ago');
});

test('relative time collapses zero and sub-second ages to "just now"', () => {
  assert.equal(relativeTime(at(0), NOW), 'just now');
  assert.equal(relativeTime(at(999), NOW), 'just now', 'never renders "0 seconds ago"');
});

test('a future timestamp clamps to "just now" rather than going negative', () => {
  // Clock skew between the node that stamped the rip and the node rendering it.
  assert.equal(relativeTime(at(-3_000), NOW), 'just now');
  assert.equal(relativeTime(at(-86_400_000), NOW), 'just now');
});

test('an unparseable timestamp does not claim to be fresh', () => {
  assert.equal(relativeTime('not-a-date', NOW), 'recently');
  assert.equal(relativeTime(at(12_000), new Date('nonsense')), 'recently');
});

/* ------------------------------------------------------------------ *
 * Wallet abbreviation
 * ------------------------------------------------------------------ */

test('wallet abbreviation keeps the head, the tail and the exact case', () => {
  assert.equal(abbreviateWallet(WALLET), '0x71C7...9F2b');
  assert.equal(abbreviateWallet('7bqfEHkKtTb6JJ1jRLmYQ2xDpS9uWnA4V5cZgTxRipD'), '7bqfEH...RipD');
});

test('a wallet too short to abbreviate is returned untouched', () => {
  assert.equal(abbreviateWallet('0xAB'), '0xAB');
  // 13 chars = lead + tail + "..." exactly: abbreviating would save nothing
  // while destroying three characters, so it must not happen.
  assert.equal(abbreviateWallet('0x71C7ab889F2'), '0x71C7ab889F2');
  assert.equal(abbreviateWallet(''), '');
});

test('wallet abbreviation honours custom lead and tail lengths', () => {
  assert.equal(abbreviateWallet(WALLET, { lead: 4, tail: 6 }), '0x71...d89F2b');
});

/* ------------------------------------------------------------------ *
 * buildFeed
 * ------------------------------------------------------------------ */

test('events are newest first regardless of input order', async (t) => {
  const idx = await index(t);
  const openings = [
    rip('rip_old', '2026-09-08T11:00:00.000Z', [pull(PIDGEY, 0.24, 0)]),
    rip('rip_new', '2026-09-08T11:59:00.000Z', [pull(MACHOKE, 42, 0)]),
    rip('rip_mid', '2026-09-08T11:30:00.000Z', [pull(BLASTOISE, 180, 0)]),
  ];

  const { events, skipped } = buildFeed(openings, idx, PACKS);
  assert.equal(skipped, 0);
  assert.deepEqual(events.map((e) => e.openingId), ['rip_new', 'rip_mid', 'rip_old']);
});

test('ties on openedAt are broken by openingId so the order is stable', async (t) => {
  const idx = await index(t);
  const stamp = '2026-09-08T11:00:00.000Z';
  const openings = [
    rip('rip_aaa', stamp, [pull(PIDGEY, 0.24, 0)]),
    rip('rip_zzz', stamp, [pull(PIDGEY, 0.24, 0)]),
  ];

  const forward = buildFeed(openings, idx, PACKS).events.map((e) => e.openingId);
  const reversed = buildFeed([...openings].reverse(), idx, PACKS).events.map((e) => e.openingId);
  assert.deepEqual(forward, ['rip_zzz', 'rip_aaa']);
  assert.deepEqual(reversed, forward);
});

test('the event carries the frozen rip value, not today catalog price', async (t) => {
  const idx = await index(t);
  const { events } = buildFeed(
    [rip('rip_1', '2026-09-08T11:00:00.000Z', [pull(PIDGEY, 0.24, 0), pull(CHARIZARD, 897.19, 1)])],
    idx,
    PACKS,
  );

  const [event] = events;
  assert.equal(event.card.name, 'Charizard', 'the rip is featured by its best pull');
  assert.equal(event.referenceValue, 897.19);
  assert.equal(event.card.headlineValue, 700, 'the live catalog price moved and did not win');
  assert.equal(event.tier, PullTier.Grail);
  assert.equal(event.prominence, FeedProminence.Major);
  assert.equal(event.variant.variantId, CHARIZARD, 'variant-exact, not the unlimited holo');
  assert.equal(event.variant.label, '1st Edition Holofoil');
  assert.equal(event.wallet, '0x71C7...9F2b');
  assert.equal(event.walletAddress, WALLET);
  assert.equal(event.packName, 'Vintage Base');
  assert.equal(event.slot, 1);
  assert.equal(event.cardsInRip, 2);
});

test('two printings of one card do not blur into each other', async (t) => {
  const idx = await index(t);
  const { events } = buildFeed(
    [rip('rip_1', '2026-09-08T11:00:00.000Z', [pull(CHARIZARD_UNLIMITED, 95, 0)])],
    idx,
    PACKS,
  );

  const [event] = events;
  // The fixture can actually fail: base1-4 carries BOTH printings, and the
  // 1st Edition one is the card's $700 headline. Anything that resolved the
  // join through cardId, or that reached for the card's best price, lands
  // there instead of on the $95 unlimited holo that was really pulled.
  assert.equal(event.card.variants.length, 2, 'both printings are in the index');
  assert.equal(event.card.cardId, 'base1-4');
  assert.equal(event.variant.variantId, CHARIZARD_UNLIMITED);
  assert.equal(event.variant.label, 'Holofoil', 'not "1st Edition Holofoil"');
  assert.equal(event.referenceValue, 95, 'not repriced at the sibling variant');
  assert.equal(event.tier, PullTier.Tier4);
  assert.equal(event.prominence, FeedProminence.Major);
});

test('a rip that arrives from two sources renders once', async (t) => {
  const idx = await index(t);
  // recent() concatenated with listByWallet() — the pattern buildFeed sorts
  // for. The wallet's own rips are already inside recent(), so every one of
  // them arrives twice.
  const dup = rip('rip_dup', '2026-09-08T11:30:00.000Z', [pull(BLASTOISE, 180, 0)]);
  const other = rip('rip_other', '2026-09-08T11:00:00.000Z', [pull(MACHOKE, 42, 0)]);
  const merged = [dup, other, dup];

  const { events, skipped } = buildFeed(merged, idx, PACKS);
  assert.deepEqual(events.map((e) => e.openingId), ['rip_dup', 'rip_other']);
  assert.equal(skipped, 0);

  // ...and the copy must not eat a tile out of the page either.
  assert.deepEqual(
    buildFeed(merged, idx, PACKS, { limit: 2 }).events.map((e) => e.openingId),
    ['rip_dup', 'rip_other'],
  );
});

test('a duplicated unrenderable rip is one drift signal, not two', async (t) => {
  const idx = await index(t);
  const ghost = rip('rip_ghost', '2026-09-08T11:00:00.000Z', [pull(GHOST, 5000, 0)]);
  assert.equal(buildFeed([ghost, ghost], idx, PACKS).skipped, 1);
});

test('a rip on a pack no longer in the rotation still renders', async (t) => {
  const idx = await index(t);
  const { events } = buildFeed(
    [rip('rip_1', '2026-09-08T11:00:00.000Z', [pull(MACHOKE, 42, 0)], { packId: 'retired-pack' })],
    idx,
    PACKS,
  );
  assert.equal(events[0].packName, 'retired-pack', 'never "undefined"');
});

test('an opening whose variants are all unknown is skipped and counted', async (t) => {
  const idx = await index(t);
  const openings = [
    rip('rip_ok', '2026-09-08T11:00:00.000Z', [pull(MACHOKE, 42, 0)]),
    rip('rip_ghost', '2026-09-08T11:30:00.000Z', [pull(GHOST, 5000, 0)]),
  ];

  const { events, skipped } = buildFeed(openings, idx, PACKS);
  assert.equal(skipped, 1);
  assert.deepEqual(events.map((e) => e.openingId), ['rip_ok']);
});

test('equal-value pulls in one rip are featured by the earlier slot', async (t) => {
  const idx = await index(t);
  const { events } = buildFeed(
    // Hydrated out of slot order on purpose: the pick must follow `slot`, not
    // the order the cards arrived in.
    [rip('rip_1', '2026-09-08T11:00:00.000Z', [pull(MACHOKE, 180, 1), pull(BLASTOISE, 180, 0)])],
    idx,
    PACKS,
  );
  assert.equal(events[0].card.name, 'Blastoise');
  assert.equal(events[0].slot, 0);
});

test('a rip keeps its renderable cards when only some variants are unknown', async (t) => {
  const idx = await index(t);
  const { events, skipped } = buildFeed(
    [rip('rip_1', '2026-09-08T11:00:00.000Z', [pull(GHOST, 5000, 0), pull(MACHOKE, 42, 1)])],
    idx,
    PACKS,
  );

  assert.equal(skipped, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].card.name, 'Machoke', 'the missing card is passed over, not the rip');
  assert.equal(events[0].referenceValue, 42);
});

test('the limit counts renderable events, and skips are counted past it', async (t) => {
  const idx = await index(t);
  const openings = [
    rip('rip_a', '2026-09-08T11:50:00.000Z', [pull(MACHOKE, 42, 0)]),
    rip('rip_b', '2026-09-08T11:40:00.000Z', [pull(GHOST, 5000, 0)]),
    rip('rip_c', '2026-09-08T11:30:00.000Z', [pull(BLASTOISE, 180, 0)]),
    rip('rip_d', '2026-09-08T11:20:00.000Z', [pull(GHOST, 5000, 0)]),
    rip('rip_e', '2026-09-08T11:10:00.000Z', [pull(PIDGEY, 0.24, 0)]),
  ];

  const { events, skipped } = buildFeed(openings, idx, PACKS, { limit: 2 });
  assert.deepEqual(events.map((e) => e.openingId), ['rip_a', 'rip_c'], 'two tiles, not two rows');
  assert.equal(skipped, 2, 'drift past the page boundary is still reported');

  assert.equal(buildFeed(openings, idx, PACKS, { limit: 0 }).events.length, 0);
});

test('an empty ledger produces an empty feed, not an error', async (t) => {
  const idx = await index(t);
  assert.deepEqual(buildFeed([], idx, PACKS), { events: [], skipped: 0 });
});

/* ------------------------------------------------------------------ *
 * WATCH LIVE cursor
 * ------------------------------------------------------------------ */

function event(id: string, prominence: FeedEvent['prominence']): FeedEvent {
  return { openingId: id, prominence } as FeedEvent;
}

const MAJOR_A = event('major-a', FeedProminence.Major);
const MAJOR_B = event('major-b', FeedProminence.Major);
const NOTABLE = event('notable', FeedProminence.Notable);
const NORMAL_A = event('normal-a', FeedProminence.Normal);
const NORMAL_B = event('normal-b', FeedProminence.Normal);
const MIXED = [MAJOR_A, NOTABLE, NORMAL_A, MAJOR_B, NORMAL_B];

const cycle = (events: readonly FeedEvent[], ticks: number): string[] =>
  Array.from({ length: ticks }, (_, i) => watchLiveCursor(events, i)?.openingId ?? 'none');

test('the watch cursor favours majors while still reaching every class', () => {
  const ids = cycle(MIXED, 8);
  assert.deepEqual(ids, [
    'major-a', 'notable', 'major-b', 'normal-a',
    'major-a', 'notable', 'major-b', 'normal-b',
  ]);

  const majors = ids.filter((id) => id.startsWith('major')).length;
  assert.equal(majors, 4, 'half the ticks');
  assert.ok(ids.includes('normal-a') && ids.includes('normal-b'), 'normals are not starved');
});

test('the watch cursor is deterministic and stateless across calls', () => {
  assert.equal(watchLiveCursor(MIXED, 2)?.openingId, 'major-b');
  assert.equal(watchLiveCursor(MIXED, 2)?.openingId, 'major-b', 'no hidden cursor state');
  assert.deepEqual(cycle(MIXED, 8), cycle(MIXED, 8));
  // Far-future ticks land where the arithmetic says, without replaying history.
  assert.equal(watchLiveCursor(MIXED, 1_000_000)?.openingId, watchLiveCursor(MIXED, 0)?.openingId);
});

test('the watch cursor falls back when a prominence class is empty', () => {
  const normalsOnly = [NORMAL_A, NORMAL_B];
  assert.deepEqual(cycle(normalsOnly, 5), [
    'normal-a', 'normal-b', 'normal-a', 'normal-b', 'normal-a',
  ]);

  // One grail and nothing else: every slot resolves to it rather than to null.
  assert.deepEqual(cycle([MAJOR_A], 3), ['major-a', 'major-a', 'major-a']);
});

test('the watch cursor survives an unrecognized prominence class', () => {
  // A feed serialized by a server on a different release. This drives an
  // animation loop, so an unknown class must degrade to a quiet tile rather
  // than throw on every frame.
  const alien = { openingId: 'alien', prominence: 'legendary' } as unknown as FeedEvent;
  assert.equal(watchLiveCursor([alien], 0)?.openingId, 'alien', 'reachable, not dropped');
  assert.deepEqual(cycle([alien, NOTABLE], 4), ['notable', 'notable', 'notable', 'alien']);
});

test('the watch cursor tolerates an empty feed and a broken tick counter', () => {
  assert.equal(watchLiveCursor([], 0), null);
  assert.equal(watchLiveCursor([], 7), null);
  assert.equal(watchLiveCursor(MIXED, -5)?.openingId, 'major-a', 'clamped, not thrown');
  assert.equal(watchLiveCursor(MIXED, Number.NaN)?.openingId, 'major-a');
  assert.equal(watchLiveCursor(MIXED, 1.9)?.openingId, 'notable', 'floored');
});
