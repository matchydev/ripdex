/**
 * Collection model tests (spec §13).
 *
 * The fixture is deliberately variant-heavy: Base Charizard in two printings and
 * 151 Charmander in two finishes, so every "is this a duplicate?" and "how much
 * of the set is this?" question has a wrong answer available to fail into.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PokemonCard, PokemonSet } from '../src/types.ts';
import type { PriceQuote } from '../src/price.ts';
import { JsonCatalogStore } from '../src/stores/json-store.ts';
import { buildCatalogIndex, type CatalogIndex } from '../src/query.ts';
import { classifyTier } from '../src/tiers.ts';
import { cardIdForVariant, type StoredOpening, type StoredOpeningCard } from '../src/openings.ts';
import {
  buildCollection,
  duplicateSummary,
  paginateBinder,
  setCompletion,
  sortCollection,
  BINDER_PAGE_SIZE,
  MAX_BINDER_PAGE_SIZE,
  type CollectionEntry,
} from '../src/collection.ts';

const WALLET = '0xRipper';

const ZARD_1ST = 'base1|4|holofoil|1st-edition';
const ZARD_UNL = 'base1|4|holofoil|unlimited';
const BLASTOISE = 'base1|2|holofoil|unlimited';
const CHARMANDER = 'sv3pt5|4|non-foil|unlimited';
const CHARMANDER_RH = 'sv3pt5|4|reverse-holofoil|unlimited';
const BULBASAUR = 'sv3pt5|9|non-foil|unlimited';
const PIKACHU = 'sv3pt5|25|non-foil|unlimited';
const MYSTERY = 'sv3pt5|101|non-foil|unlimited';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const SETS: PokemonSet[] = [
  { id: 'base1', name: 'Base', series: 'Base', symbolUrl: null, logoUrl: null, releaseDate: '1999-01-09', total: 102, printedTotal: 102 },
  { id: 'sv3pt5', name: '151', series: 'Scarlet & Violet', symbolUrl: null, logoUrl: null, releaseDate: '2023-09-22', total: 207, printedTotal: 165 },
];

function card(over: Partial<PokemonCard>): PokemonCard {
  const setId = over.setId ?? 'base1';
  const set = SETS.find((s) => s.id === setId)!;
  return {
    id: `${setId}-${over.number ?? '1'}`, name: 'X', supertype: 'Pokémon', subtypes: [],
    types: ['Fire'], hp: 60, evolvesFrom: null, evolvesTo: [], rules: [], attacks: [],
    weaknesses: [], resistances: [], retreatCost: [], convertedRetreatCost: null,
    setId, setName: set.name, setSeries: set.series, setSymbolUrl: null, setLogoUrl: null,
    setReleaseDate: set.releaseDate, setTotal: set.total,
    number: '1', artist: 'Mitsuhiro Arita', rarity: 'Common', flavorText: null,
    nationalPokedexNumbers: [], legalities: {},
    images: { small: 's.png', large: 'l.png' },
    source: { provider: 'test', fetchedAt: '2026-09-08T00:00:00.000Z' },
    ...over,
  };
}

function quote(variantId: string, value: number): PriceQuote {
  return {
    variantId, low: value, mid: value, high: value, market: value,
    referenceValue: value, basis: 'market', currency: 'USD',
    source: 'test', sourceUrl: null, sourceUpdatedAt: '2026-09-08T00:00:00.000Z',
  };
}

function variantRow(variantId: string) {
  const [setId, number, finish, printing] = variantId.split('|');
  return {
    variantId, cardId: `${setId}-${number}`, setId, number, finish, printing,
    confidence: 'reported' as const,
  };
}

function pull(variantId: string, value: number, slot: number): StoredOpeningCard {
  return {
    variantId,
    cardId: cardIdForVariant(variantId),
    probability: 0.01,
    referenceValue: value,
    currency: 'USD',
    tier: classifyTier(value),
    slot,
  };
}

function rip(openingId: string, openedAt: string, pulls: [string, number][]): StoredOpening {
  return {
    openingId,
    openedAt,
    wallet: WALLET,
    packId: 'vintage-base',
    packVersion: 'v1',
    cards: pulls.map(([variantId, value], slot) => pull(variantId, value, slot)),
    verification: {
      serverSeedHash: `ssh-${openingId}`,
      clientSeed: 'client-seed',
      nonce: 1,
      priceSnapshotId: 'ps_test',
      packConfigSnapshotId: 'pc_test',
      priceSnapshotHash: 'price-hash',
      packConfigSnapshotHash: 'config-hash',
      serverSeed: null,
    },
  };
}

/**
 * base1 holds 2 cards, sv3pt5 holds 4 — the catalog totals set completion is
 * measured against. Pikachu is never pulled, so 151 can never read 100%.
 */
async function seed(): Promise<{ index: CatalogIndex; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'ripdex-coll-'));
  const store = new JsonCatalogStore(dir);

  await store.upsertSets(SETS);
  await store.upsertCards([
    card({ setId: 'base1', number: '2', name: 'Blastoise', rarity: 'Rare Holo' }),
    card({ setId: 'base1', number: '4', name: 'Charizard', rarity: 'Rare Holo' }),
    card({ setId: 'sv3pt5', number: '4', name: 'Charmander', rarity: 'Common' }),
    card({ setId: 'sv3pt5', number: '9', name: 'Bulbasaur', rarity: 'Illustration Rare' }),
    card({ setId: 'sv3pt5', number: '25', name: 'Pikachu', rarity: 'Common' }),
    // A rarity string the ladder in query.ts has never seen. New sets invent
    // these constantly.
    card({ setId: 'sv3pt5', number: '101', name: 'Mystery Slab', rarity: 'Brand New Rarity' }),
  ]);
  await store.upsertVariants([
    BLASTOISE, ZARD_UNL, ZARD_1ST, CHARMANDER, CHARMANDER_RH, BULBASAUR, PIKACHU, MYSTERY,
  ].map(variantRow));
  await store.upsertPrices([
    // Deliberately not the values frozen into the rips below.
    { variantId: ZARD_1ST, observedOn: '2026-09-08', quote: quote(ZARD_1ST, 20000) },
    { variantId: ZARD_UNL, observedOn: '2026-09-08', quote: quote(ZARD_UNL, 897.19) },
    { variantId: BLASTOISE, observedOn: '2026-09-08', quote: quote(BLASTOISE, 410) },
    { variantId: CHARMANDER, observedOn: '2026-09-08', quote: quote(CHARMANDER, 0.24) },
    { variantId: CHARMANDER_RH, observedOn: '2026-09-08', quote: quote(CHARMANDER_RH, 0.41) },
    { variantId: BULBASAUR, observedOn: '2026-09-08', quote: quote(BULBASAUR, 5) },
    { variantId: PIKACHU, observedOn: '2026-09-08', quote: quote(PIKACHU, 0.1) },
    // MYSTERY is intentionally unpriced in the catalog.
  ]);
  await store.close();

  const index = await buildCatalogIndex(store);
  return { index, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const OPENINGS: StoredOpening[] = [
  rip('rip_c', '2026-03-01T00:00:00.000Z', [
    [BLASTOISE, 410], [CHARMANDER, 0.22], [BULBASAUR, 5], [MYSTERY, 3],
  ]),
  rip('rip_b', '2026-02-01T00:00:00.000Z', [
    [ZARD_UNL, 897.19], [CHARMANDER, 0.3], [CHARMANDER_RH, 0.41],
  ]),
  rip('rip_a', '2026-01-01T00:00:00.000Z', [[ZARD_1ST, 12500], [CHARMANDER, 0.24]]),
];

const ids = (entries: readonly (CollectionEntry | null)[]): (string | null)[] =>
  entries.map((e) => e?.variantId ?? null);

/* ------------------------------------------------------------------ *
 * Duplicates are per variant
 * ------------------------------------------------------------------ */

test('duplicates are counted per variant, never per card', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const entries = buildCollection(OPENINGS, index);
  const byId = new Map(entries.map((e) => [e.variantId, e]));

  // Both are Charmander sv3pt5-4. Same card, two products.
  assert.equal(byId.get(CHARMANDER)!.card.cardId, byId.get(CHARMANDER_RH)!.card.cardId);
  assert.equal(byId.get(CHARMANDER)!.count, 3, 'three normal Charmanders across three rips');
  assert.equal(byId.get(CHARMANDER_RH)!.count, 1, 'the reverse holo is not a fourth copy');

  // Same for Charizard: 1st edition and unlimited are one cardId, two entries.
  assert.equal(byId.get(ZARD_1ST)!.card.cardId, byId.get(ZARD_UNL)!.card.cardId);
  assert.equal(byId.get(ZARD_1ST)!.count, 1);
  assert.equal(byId.get(ZARD_UNL)!.count, 1);

  assert.equal(entries.length, 7);
});

test('a variant pulled twice inside one rip is two copies', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const [entry] = buildCollection(
    [rip('rip_twins', '2026-04-01T00:00:00.000Z', [[CHARMANDER, 0.24], [CHARMANDER, 0.26]])],
    index,
  );
  assert.equal(entry.count, 2, 'matches OpeningLedger.countByVariant, which also counts in-pack dupes');
  assert.equal(entry.firstPulledAt, entry.lastPulledAt);
  assert.equal(entry.bestReferenceValue, 0.26);
});

test('pull timestamps and best value span every rip that produced the variant', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const charmander = buildCollection(OPENINGS, index).find((e) => e.variantId === CHARMANDER)!;
  assert.equal(charmander.firstPulledAt, '2026-01-01T00:00:00.000Z');
  assert.equal(charmander.lastPulledAt, '2026-03-01T00:00:00.000Z');
  assert.equal(charmander.bestReferenceValue, 0.3, 'the best of 0.24 / 0.30 / 0.22');
});

test('best value is the frozen ledger figure, not the catalog price today', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const zard = buildCollection(OPENINGS, index).find((e) => e.variantId === ZARD_1ST)!;
  assert.equal(zard.bestReferenceValue, 12500, 'what the pull was worth when it was pulled');
  assert.equal(zard.variant.referenceValue, 20000, 'the live catalog price stays reachable');
});

test('an owned variant the catalog cannot price is still owned, and is not worth 0', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const mystery = buildCollection(OPENINGS, index).find((e) => e.variantId === MYSTERY)!;
  assert.equal(mystery.variant.referenceValue, null, 'no price, not zero');
  assert.equal(mystery.bestReferenceValue, 3);
});

test('a pulled variant missing from the catalog is dropped and reported', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const unknown: string[] = [];
  const entries = buildCollection(
    [rip('rip_ghost', '2026-04-01T00:00:00.000Z', [['base1|999|holofoil|unlimited', 42], [BLASTOISE, 410]])],
    index,
    { onUnknownVariant: (id) => unknown.push(id) },
  );

  assert.deepEqual(ids(entries), [BLASTOISE]);
  assert.deepEqual(unknown, ['base1|999|holofoil|unlimited']);
});

/* ------------------------------------------------------------------ *
 * Set completion
 * ------------------------------------------------------------------ */

test('set completion counts cards, so many variants of one card cannot exceed 100%', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const entries = buildCollection(OPENINGS, index);
  const rows = setCompletion(entries, index);

  const base = rows.find((r) => r.setId === 'base1')!;
  // Three base1 ENTRIES (Charizard 1st ed, Charizard unlimited, Blastoise) over
  // a 2-card set. Counting variants here would report 3/2 = 150%.
  assert.equal(entries.filter((e) => e.card.setId === 'base1').length, 3);
  assert.equal(base.collected, 2);
  assert.equal(base.total, 2);
  assert.equal(base.percent, 100);

  for (const row of rows) {
    assert.ok(row.collected <= row.total, `${row.setId} collected ${row.collected}/${row.total}`);
    assert.ok(row.percent <= 100, `${row.setId} is ${row.percent}%`);
    assert.ok(Number.isFinite(row.percent));
  }
});

test('set completion measures against the catalog, rounds down, and sorts by percent', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const rows = setCompletion(buildCollection(OPENINGS, index), index);
  assert.deepEqual(rows.map((r) => r.setId), ['base1', 'sv3pt5']);

  const modern = rows.find((r) => r.setId === 'sv3pt5')!;
  assert.equal(modern.setName, '151');
  assert.equal(modern.collected, 3, 'Charmander counts once despite two finishes owned');
  // 4, not PokemonSet.total (207): the catalog holds a subset, and measuring
  // against cards that are not in the index makes 100% unreachable.
  assert.equal(modern.total, 4);
  assert.equal(modern.percent, 75);
});

test('a set one card short never rounds up to 100%', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  // 999 of 1000 cards is 99.9%, and a naive Math.round would print 100.
  const entries: CollectionEntry[] = [];
  const anchor = buildCollection(OPENINGS, index)[0];
  const fake: CatalogIndex = { ...index, cards: [] };
  for (let i = 0; i < 1000; i += 1) {
    const cardId = `big-${i}`;
    fake.cards.push({ ...anchor.card, cardId, setId: 'big', setName: 'Big Set', number: String(i) });
    if (i < 999) entries.push({ ...anchor, variantId: `big|${i}|non-foil|unlimited`, card: fake.cards[i] });
  }

  const [row] = setCompletion(entries, fake);
  assert.equal(row.collected, 999);
  assert.equal(row.total, 1000);
  assert.equal(row.percent, 99.9);
});

test('completion stays at 100% when the index holds fewer cards than the binder', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const entries = buildCollection(OPENINGS, index);
  // `entries` and `index` are separate arguments, so a caller can pair a binder
  // built from one catalog snapshot with a newer, smaller index — here sv3pt5
  // loses Bulbasaur. Uncapped this reports 3/2 = 150% and overruns the bar.
  const shrunk: CatalogIndex = { ...index, cards: index.cards.filter((c) => c.cardId !== 'sv3pt5-9') };
  const modern = setCompletion(entries, shrunk).find((r) => r.setId === 'sv3pt5')!;

  assert.equal(modern.collected, 3, 'the count stays honest so the mismatch is visible');
  assert.equal(modern.total, 3);
  assert.equal(modern.percent, 100);

  const worse: CatalogIndex = { ...index, cards: index.cards.filter((c) => c.setId !== 'sv3pt5' || c.cardId === 'sv3pt5-4') };
  const row = setCompletion(entries, worse).find((r) => r.setId === 'sv3pt5')!;
  assert.equal(row.collected, 3);
  assert.equal(row.total, 1);
  assert.equal(row.percent, 100, 'never above 100, whatever the two snapshots disagree about');
});

test('sets the wallet has never pulled from are omitted rather than listed at 0%', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const onlyModern = setCompletion(
    buildCollection([rip('rip_x', '2026-05-01T00:00:00.000Z', [[BULBASAUR, 5]])], index),
    index,
  );
  assert.deepEqual(onlyModern.map((r) => r.setId), ['sv3pt5']);
});

/* ------------------------------------------------------------------ *
 * Empty collection
 * ------------------------------------------------------------------ */

test('an empty collection yields zeros, not NaN', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const entries = buildCollection([], index);
  assert.deepEqual(entries, []);
  assert.deepEqual(setCompletion(entries, index), []);

  const dupes = duplicateSummary(entries);
  assert.deepEqual(dupes.entries, []);
  assert.equal(dupes.totalDuplicates, 0);
  assert.equal(dupes.totalValue, 0);
  assert.ok(Number.isFinite(dupes.totalValue));

  // A wallet that has ripped a pack whose contents the catalog has since lost
  // is the 0/0 path: entries exist for no set, so nothing divides.
  assert.deepEqual(setCompletion(buildCollection(OPENINGS, index), { ...index, cards: [] }).map((r) => ({ percent: r.percent, total: r.total })),
    [{ percent: 0, total: 0 }, { percent: 0, total: 0 }]);
});

test('an empty binder is one page of empty sleeves, not zero pages', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const pages = paginateBinder(buildCollection([], index));
  assert.equal(pages.length, 1, 'zero pages would render as "Page 1 of 0"');
  assert.equal(pages[0].slots.length, BINDER_PAGE_SIZE);
  assert.equal(pages[0].filled, 0);
  assert.ok(pages[0].slots.every((s) => s === null));
});

/* ------------------------------------------------------------------ *
 * Binder pagination
 * ------------------------------------------------------------------ */

test('the final binder page pads to a full 3x3 with visible nulls', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const entries = buildCollection(OPENINGS, index);
  const [page] = paginateBinder(entries);

  assert.equal(page.slots.length, 9, '7 cards still render nine sleeves');
  assert.equal(page.filled, 7);
  assert.deepEqual(page.slots.slice(7), [null, null]);
});

test('pagination splits without losing or reordering entries', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const entries = buildCollection(OPENINGS, index);
  const pages = paginateBinder(entries, { pageSize: 3 });

  assert.deepEqual(pages.map((p) => p.pageNumber), [1, 2, 3]);
  assert.deepEqual(pages.map((p) => p.filled), [3, 3, 1]);
  assert.deepEqual(ids(pages[2].slots), [MYSTERY, null, null]);

  const flat = pages.flatMap((p) => p.slots).filter((s): s is CollectionEntry => s !== null);
  assert.deepEqual(ids(flat), ids(sortCollection(entries, 'set')));
});

test('a nonsense page size cannot produce a ragged or endless binder', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const entries = buildCollection(OPENINGS, index);
  const pages = paginateBinder(entries, { pageSize: 0 });
  assert.equal(pages.length, 7);
  assert.ok(pages.every((p) => p.slots.length === 1));
});

test('a non-numeric page size falls back instead of emptying the binder', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const entries = buildCollection(OPENINGS, index);
  // What Number() makes of "?pageSize=abc". Math.max(1, NaN) is NaN, and a NaN
  // page count makes the paging loop skip every page — 7 owned cards rendering
  // as zero pages.
  const pages = paginateBinder(entries, { pageSize: Number('abc') });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].slots.length, BINDER_PAGE_SIZE);
  assert.equal(pages[0].filled, 7);
});

test('an unbounded page size is capped rather than allocated', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const entries = buildCollection(OPENINGS, index);
  // "?pageSize=Infinity". Unclamped, the slot-fill loop pushes nulls until the
  // heap dies; this test hangs the run rather than failing it if that regresses.
  const huge = paginateBinder(entries, { pageSize: Infinity });
  assert.equal(huge.length, 1);
  assert.equal(huge[0].slots.length, BINDER_PAGE_SIZE);

  const capped = paginateBinder(entries, { pageSize: 10_000 });
  assert.equal(capped[0].slots.length, MAX_BINDER_PAGE_SIZE);
  assert.equal(capped[0].filled, 7);
});

/* ------------------------------------------------------------------ *
 * Sort orders
 * ------------------------------------------------------------------ */

test('binder sort: set puts the oldest set first, in natural collector order', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const pages = paginateBinder(buildCollection(OPENINGS, index), { sort: 'set' });
  assert.deepEqual(ids(pages[0].slots).slice(0, 7), [
    BLASTOISE,      // base1 #2
    ZARD_1ST,       // base1 #4, printings tie-broken by variantId
    ZARD_UNL,
    CHARMANDER,     // sv3pt5 #4, finishes tie-broken by variantId
    CHARMANDER_RH,
    BULBASAUR,      // #9 before #101 — string ordering would invert these
    MYSTERY,
  ]);
});

test('binder sort: value ranks by the best frozen pull', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  assert.deepEqual(ids(sortCollection(buildCollection(OPENINGS, index), 'value')), [
    ZARD_1ST,       // 12500
    ZARD_UNL,       // 897.19
    BLASTOISE,      // 410
    BULBASAUR,      // 5
    MYSTERY,        // 3
    CHARMANDER_RH,  // 0.41
    CHARMANDER,     // 0.30
  ]);
});

test('binder sort: pull-date is newest last-pull first', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  assert.deepEqual(ids(sortCollection(buildCollection(OPENINGS, index), 'pull-date')), [
    BLASTOISE,      // last 03-01, first 03-01
    BULBASAUR,      // last 03-01, first 03-01
    MYSTERY,        // last 03-01, first 03-01
    CHARMANDER,     // last 03-01 but first pulled 01-01, so it trails the new hits
    ZARD_UNL,       // last 02-01
    CHARMANDER_RH,  // last 02-01
    ZARD_1ST,       // last 01-01
  ]);
});

test('binder sort: rarity is rarest first, with unrecognized rarities last', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  assert.deepEqual(ids(sortCollection(buildCollection(OPENINGS, index), 'rarity')), [
    BULBASAUR,      // Illustration Rare
    ZARD_1ST,       // Rare Holo, ties broken by value
    ZARD_UNL,
    BLASTOISE,
    CHARMANDER_RH,  // Common
    CHARMANDER,
    // "Brand New Rarity" outranks nothing. query.ts scores an unknown rarity
    // above every known one, which sorted rarest-first would head the binder.
    MYSTERY,
  ]);
});

test('sorting copies rather than reordering the caller array', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const entries = buildCollection(OPENINGS, index);
  const before = ids(entries);
  sortCollection(entries, 'value');
  assert.deepEqual(ids(entries), before);
});

/* ------------------------------------------------------------------ *
 * Duplicate summary
 * ------------------------------------------------------------------ */

test('the duplicate summary counts surplus copies, ordered most-duplicated first', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const openings = [
    ...OPENINGS,
    rip('rip_d', '2026-04-01T00:00:00.000Z', [[BLASTOISE, 400], [CHARMANDER_RH, 0.5]]),
  ];
  const summary = duplicateSummary(buildCollection(openings, index));

  assert.deepEqual(ids(summary.entries), [CHARMANDER, BLASTOISE, CHARMANDER_RH]);
  // 3 Charmanders + 2 Blastoise + 2 reverse holos = 7 copies, 3 kept, 4 spare.
  assert.equal(summary.totalDuplicates, 4);
  assert.equal(summary.totalValue, 411.1, '2*0.30 + 1*410 + 1*0.50, held to cents');
  assert.ok(summary.entries.every((e) => e.count > 1));
});
