/**
 * Achievement tests (spec §18).
 *
 * The load-bearing ones are the last three: an achievement must unlock on the
 * rip that first earned it, must survive a price change, and must never divide
 * by a zero target on an empty wallet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PokemonCard, PokemonSet } from '../src/types.ts';
import type { PriceQuote } from '../src/price.ts';
import type { VariantRow } from '../src/store.ts';
import { JsonCatalogStore } from '../src/stores/json-store.ts';
import { buildCatalogIndex, type CatalogIndex } from '../src/query.ts';
import { classifyTier } from '../src/tiers.ts';
import { cardIdForVariant, type StoredOpening, type StoredOpeningCard } from '../src/openings.ts';
import {
  DEFAULT_ACHIEVEMENTS,
  buildAchievementContext,
  evaluateAchievements,
  type AchievementStatus,
} from '../src/achievements.ts';

/* ------------------------------------------------------------------ *
 * Catalog fixture
 * ------------------------------------------------------------------ */

const SETS: PokemonSet[] = [
  { id: 'base1', name: 'Base', series: 'Base', symbolUrl: null, logoUrl: null, releaseDate: '1999-01-09', total: 102, printedTotal: 102 },
  // Three cards, so "complete a set" is reachable in a test.
  { id: 'tiny', name: 'Tiny Promos', series: 'Promo', symbolUrl: null, logoUrl: null, releaseDate: '2024-05-01', total: 3, printedTotal: 3 },
];

const BASE_CARD_COUNT = 60;
const TINY_CARD_COUNT = 3;

function card(over: Partial<PokemonCard> & { setId: string; number: string }): PokemonCard {
  const set = SETS.find((s) => s.id === over.setId)!;
  return {
    id: `${over.setId}-${over.number}`, name: 'X', supertype: 'Pokémon', subtypes: [],
    types: ['Water'], hp: 60, evolvesFrom: null, evolvesTo: [], rules: [], attacks: [],
    weaknesses: [], resistances: [], retreatCost: [], convertedRetreatCost: null,
    setId: over.setId, setName: set.name, setSeries: set.series, setSymbolUrl: null,
    setLogoUrl: null, setReleaseDate: set.releaseDate, setTotal: set.total,
    artist: 'Mitsuhiro Arita', rarity: 'Common', flavorText: null,
    nationalPokedexNumbers: [], legalities: {},
    images: { small: 's.png', large: 'l.png' },
    source: { provider: 'test', fetchedAt: '2026-09-08T00:00:00.000Z' },
    ...over,
  };
}

function catalogCards(): PokemonCard[] {
  const out: PokemonCard[] = [];
  for (let n = 1; n <= BASE_CARD_COUNT; n++) {
    if (n === 4) {
      out.push(card({ setId: 'base1', number: '4', name: 'Charizard', rarity: 'Rare Holo', types: ['Fire'], nationalPokedexNumbers: [6] }));
    } else if (n === 57) {
      out.push(card({ setId: 'base1', number: '57', name: 'Pidgey', types: ['Colorless'], nationalPokedexNumbers: [16] }));
    } else {
      // Dex numbers are offset into 21..80: every generic card is still Kanto,
      // and none of them collides with Charizard's 6.
      out.push(card({ setId: 'base1', number: String(n), name: `Kanto ${n}`, nationalPokedexNumbers: [n + 20] }));
    }
  }
  // Deliberately outside 1..151, so completing this set does not also count
  // toward Kanto Collector.
  for (const [i, letter] of ['a', 'b', 'c'].entries()) {
    out.push(card({ setId: 'tiny', number: letter, name: `Tiny ${letter}`, types: ['Psychic'], nationalPokedexNumbers: [900 + i] }));
  }
  return out;
}

function catalogVariants(): VariantRow[] {
  const rows: VariantRow[] = [];
  const add = (setId: string, number: string, finish: string, printing: string) =>
    rows.push({
      variantId: `${setId}|${number}|${finish}|${printing}`,
      cardId: `${setId}-${number}`,
      setId, number, finish, printing, confidence: 'reported',
    });

  for (let n = 1; n <= BASE_CARD_COUNT; n++) {
    add('base1', String(n), 'non-foil', 'unlimited');
    add('base1', String(n), 'holofoil', 'unlimited');
  }
  add('base1', '4', 'holofoil', '1st-edition');
  for (const letter of ['a', 'b', 'c']) add('tiny', letter, 'non-foil', 'unlimited');
  return rows;
}

function quote(variantId: string, value: number): PriceQuote {
  return {
    variantId, low: value, mid: value, high: value, market: value,
    referenceValue: value, basis: 'market', currency: 'USD',
    source: 'test', sourceUrl: null, sourceUpdatedAt: '2026-09-08T00:00:00.000Z',
  };
}

/**
 * `priceScale` is the whole point of the fixture being parameterized: the same
 * ledger evaluated against a catalog whose prices moved must produce identical
 * achievements.
 */
async function seed(priceScale = 1): Promise<{ index: CatalogIndex; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'ripdex-ach-'));
  const store = new JsonCatalogStore(dir);

  await store.upsertSets(SETS);
  await store.upsertCards(catalogCards());
  await store.upsertVariants(catalogVariants());
  await store.upsertPrices([
    { variantId: CHARIZARD_1ST, observedOn: '2026-09-08', quote: quote(CHARIZARD_1ST, 8400.5 * priceScale) },
    { variantId: CHARIZARD_HOLO, observedOn: '2026-09-08', quote: quote(CHARIZARD_HOLO, 900 * priceScale) },
    { variantId: PIDGEY, observedOn: '2026-09-08', quote: quote(PIDGEY, 1.75 * priceScale) },
  ]);
  await store.close();

  const index = await buildCatalogIndex(store);
  return { index, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/* ------------------------------------------------------------------ *
 * Ledger fixture
 * ------------------------------------------------------------------ */

const CHARIZARD_1ST = 'base1|4|holofoil|1st-edition';
const CHARIZARD_HOLO = 'base1|4|holofoil|unlimited';
const PIDGEY = 'base1|57|non-foil|unlimited';
const TINY = ['tiny|a|non-foil|unlimited', 'tiny|b|non-foil|unlimited', 'tiny|c|non-foil|unlimited'];

const baseNonFoil = (n: number): string => `base1|${n}|non-foil|unlimited`;
const baseHolo = (n: number): string => `base1|${n}|holofoil|unlimited`;

interface Pull {
  variantId: string;
  value?: number;
  probability?: number;
}

function pulls(list: Pull[]): StoredOpeningCard[] {
  return list.map((p, slot) => {
    const value = p.value ?? 2;
    return {
      variantId: p.variantId,
      cardId: cardIdForVariant(p.variantId),
      probability: p.probability ?? 0.25,
      referenceValue: value,
      currency: 'USD',
      tier: classifyTier(value),
      slot,
    };
  });
}

function rip(openingId: string, openedAt: string, list: Pull[]): StoredOpening {
  return {
    openingId,
    openedAt,
    wallet: '0xRipper',
    packId: 'vintage-base',
    packVersion: 'v1',
    cards: pulls(list),
    verification: {
      serverSeedHash: `ssh-${openingId}`, clientSeed: 'client-seed', nonce: 1,
      priceSnapshotId: 'ps_test', packConfigSnapshotId: 'pc_test',
      priceSnapshotHash: 'price-hash', packConfigSnapshotHash: 'config-hash',
      serverSeed: null,
    },
  };
}

/** Distinct, increasing, and ordered the same lexicographically as in time. */
const at = (minute: number): string => new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();

function evaluate(openings: StoredOpening[], index: CatalogIndex): AchievementStatus[] {
  return evaluateAchievements(buildAchievementContext(openings, index));
}

function byId(statuses: AchievementStatus[], id: string): AchievementStatus {
  const hit = statuses.find((s) => s.def.id === id);
  assert.ok(hit, `no achievement ${id}`);
  return hit;
}

/**
 * A wallet that earns every shipped achievement: one loaded opening rip, fifty
 * holo rips that also collect fifty distinct Kanto cards, and filler up to 100
 * packs.
 */
function loadedWallet(): StoredOpening[] {
  const out: StoredOpening[] = [
    rip('rip_000', at(0), [
      { variantId: CHARIZARD_1ST, value: 8400.5, probability: 0.0005 },
      ...TINY.map((variantId) => ({ variantId, value: 1, probability: 0.4 })),
    ]),
  ];
  for (let n = 1; n <= 50; n++) {
    out.push(rip(`rip_${String(n).padStart(3, '0')}`, at(n), [{ variantId: baseHolo(n) }]));
  }
  for (let i = 51; i <= 99; i++) {
    out.push(rip(`rip_${String(i).padStart(3, '0')}`, at(i), [{ variantId: PIDGEY, value: 1.75 }]));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

test('an empty wallet unlocks nothing and reports zero progress without NaN', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const statuses = evaluate([], index);
  assert.equal(statuses.length, DEFAULT_ACHIEVEMENTS.length);

  for (const s of statuses) {
    assert.equal(s.unlocked, false, `${s.def.id} should be locked`);
    assert.equal(s.unlockedAt, null);
    assert.equal(s.progress.current, 0, `${s.def.id} progress`);
    assert.ok(Number.isFinite(s.progress.target), `${s.def.id} target is finite`);
    assert.ok(s.progress.target > 0, `${s.def.id} target is divisible`);
  }

  // A data-dependent target still resolves: the smallest catalogued set, not 0/0.
  assert.deepEqual(byId(statuses, 'FULL_SET').progress, { current: 0, target: TINY_CARD_COUNT });
});

test('one cheap rip unlocks only First Rip and leaves the rest with real progress', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const statuses = evaluate([rip('rip_1', at(0), [{ variantId: PIDGEY, value: 1.75, probability: 0.5 }])], index);

  for (const s of statuses) {
    assert.equal(s.unlocked, s.def.id === 'FIRST_RIP', `${s.def.id} unlocked`);
  }

  assert.deepEqual(byId(statuses, 'FIRST_RIP').progress, { current: 1, target: 1 });
  assert.deepEqual(byId(statuses, 'CENTURION').progress, { current: 1, target: 100 });
  assert.deepEqual(byId(statuses, 'VAULT_BUILDER').progress, { current: 1.75, target: 1000 });
  // Pidgey is Kanto and lives in base1, so both counters moved by one.
  assert.deepEqual(byId(statuses, 'KANTO_COLLECTOR').progress, { current: 1, target: 50 });
  assert.deepEqual(byId(statuses, 'FULL_SET').progress, { current: 1, target: BASE_CARD_COUNT });
  // Nothing about a non-foil Colorless common qualifies for these.
  assert.deepEqual(byId(statuses, 'FIRE_STARTER').progress, { current: 0, target: 1 });
  assert.deepEqual(byId(statuses, 'HOLO_HOARDER').progress, { current: 0, target: 25 });
  assert.deepEqual(byId(statuses, 'FIRST_EDITION').progress, { current: 0, target: 1 });
  assert.deepEqual(byId(statuses, 'GRAIL_HUNTER').progress, { current: 0, target: 1 });
});

test('a loaded wallet unlocks every shipped achievement, with progress pinned at target', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const statuses = evaluate(loadedWallet(), index);

  for (const s of statuses) {
    assert.equal(s.unlocked, true, `${s.def.id} should be unlocked`);
    assert.ok(s.unlockedAt !== null, `${s.def.id} has an unlock time`);
    assert.equal(s.progress.current, s.progress.target, `${s.def.id} bar is full`);
  }

  // Each unlock lands on the rip that actually earned it.
  assert.equal(byId(statuses, 'FIRST_RIP').unlockedAt, at(0));
  assert.equal(byId(statuses, 'GRAIL_HUNTER').unlockedAt, at(0), '$8,400 Charizard, first rip');
  assert.equal(byId(statuses, 'ONE_IN_A_THOUSAND').unlockedAt, at(0), '0.05% hit, first rip');
  assert.equal(byId(statuses, 'FIRST_EDITION').unlockedAt, at(0));
  assert.equal(byId(statuses, 'FULL_SET').unlockedAt, at(0), 'three cards completed the tiny set');
  assert.equal(byId(statuses, 'CENTURION').unlockedAt, at(99), 'the hundredth pack');
  // 25 holos: the 1st Edition Charizard plus the first 24 holo rips.
  assert.equal(byId(statuses, 'HOLO_HOARDER').unlockedAt, at(24));
  assert.deepEqual(byId(statuses, 'FULL_SET').progress, { current: TINY_CARD_COUNT, target: TINY_CARD_COUNT });
  assert.deepEqual(byId(statuses, 'VAULT_BUILDER').progress, { current: 1000, target: 1000 }, 'clamped, not $8,400 / $1,000');
});

test('unlockedAt is the first qualifying rip, not the latest, whatever order rips arrive in', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  // Ledger reads arrive newest first; the context must reorder them.
  const statuses = evaluate(
    [
      // Cheap Charizards at ordinary odds: they earn the Charizard and Fire
      // badges but must not stand in for the grail or the long-shot ones.
      rip('rip_c', at(30), [{ variantId: CHARIZARD_HOLO, value: 12, probability: 0.002 }]),
      rip('rip_a', at(10), [{ variantId: CHARIZARD_HOLO, value: 12, probability: 0.002 }]),
      rip('rip_b', at(20), [{ variantId: CHARIZARD_1ST, value: 8400.5, probability: 0.0005 }]),
    ],
    index,
  );

  assert.equal(byId(statuses, 'CHARIZARD_HUNTER').unlockedAt, at(10));
  assert.equal(byId(statuses, 'FIRE_STARTER').unlockedAt, at(10));
  assert.equal(byId(statuses, 'FIRST_RIP').unlockedAt, at(10));
  // These were only earned by the middle rip, so they must not inherit at(10).
  assert.equal(byId(statuses, 'GRAIL_HUNTER').unlockedAt, at(20));
  assert.equal(byId(statuses, 'ONE_IN_A_THOUSAND').unlockedAt, at(20));
  assert.equal(byId(statuses, 'FIRST_EDITION').unlockedAt, at(20));
});

test('progress is reported while locked, and repeat pulls of one card do not advance it', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const openings: StoredOpening[] = [];
  for (let n = 1; n <= 12; n++) {
    openings.push(rip(`rip_${n}`, at(n), [{ variantId: baseNonFoil(n) }]));
  }
  // The same card again as a second copy AND as a different finish. Both are
  // real pulls, neither is a new binder slot.
  openings.push(rip('rip_dupe', at(20), [
    { variantId: baseNonFoil(1) },
    { variantId: baseHolo(1) },
  ]));

  const statuses = evaluate(openings, index);
  const kanto = byId(statuses, 'KANTO_COLLECTOR');

  assert.equal(kanto.unlocked, false);
  assert.equal(kanto.unlockedAt, null);
  assert.deepEqual(kanto.progress, { current: 12, target: 50 }, '12 cards, not 14 pulls');
  assert.deepEqual(byId(statuses, 'FULL_SET').progress, { current: 12, target: BASE_CARD_COUNT });
  // Pull counts, unlike unique-card counts, do move on a duplicate.
  assert.deepEqual(byId(statuses, 'HOLO_HOARDER').progress, { current: 1, target: 25 });
  assert.deepEqual(byId(statuses, 'CENTURION').progress, { current: 13, target: 100 });
});

test('set completion tracks the set closest to done, by fraction rather than by count', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const statuses = evaluate(
    [
      // 20 of 60 in base1 (0.33) against 2 of 3 in tiny (0.67).
      ...Array.from({ length: 20 }, (_, i) => rip(`rip_b${i}`, at(i), [{ variantId: baseNonFoil(i + 1) }])),
      rip('rip_t', at(30), [{ variantId: TINY[0] }, { variantId: TINY[1] }]),
    ],
    index,
  );

  const full = byId(statuses, 'FULL_SET');
  assert.equal(full.unlocked, false);
  assert.deepEqual(full.progress, { current: 2, target: TINY_CARD_COUNT }, '2/3 beats 20/60');
});

test('a later price change cannot revoke an unlocked achievement', async (t) => {
  const rich = await seed(1);
  const crashed = await seed(0.00001);
  t.after(rich.cleanup);
  t.after(crashed.cleanup);

  // Sanity: the catalog really did move. The Charizard is now worth cents.
  assert.ok((rich.index.byCardId.get('base1-4')?.headlineValue ?? 0) > 500);
  assert.ok((crashed.index.byCardId.get('base1-4')?.headlineValue ?? 0) < 1);

  const wallet = loadedWallet();
  const before = evaluate(wallet, rich.index);
  const after = evaluate(wallet, crashed.index);

  const shape = (list: AchievementStatus[]) =>
    list.map((s) => ({ id: s.def.id, unlocked: s.unlocked, unlockedAt: s.unlockedAt, progress: s.progress }));
  assert.deepEqual(shape(after), shape(before));

  // Named explicitly because these two are the ones a naive implementation
  // would recompute from the catalog.
  assert.equal(byId(after, 'GRAIL_HUNTER').unlocked, true, 'earned at rip time, still earned');
  assert.deepEqual(byId(after, 'VAULT_BUILDER').progress, { current: 1000, target: 1000 });
});

test('an absent probability is unknown, not an ultra-rare hit', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const unknownOdds = evaluate([rip('rip_0', at(0), [{ variantId: PIDGEY, probability: 0 }])], index);
  assert.equal(byId(unknownOdds, 'ONE_IN_A_THOUSAND').unlocked, false);

  const justOutside = evaluate([rip('rip_0', at(0), [{ variantId: PIDGEY, probability: 0.0011 }])], index);
  assert.equal(byId(justOutside, 'ONE_IN_A_THOUSAND').unlocked, false);

  const onTheLine = evaluate([rip('rip_0', at(0), [{ variantId: PIDGEY, probability: 0.001 }])], index);
  assert.equal(byId(onTheLine, 'ONE_IN_A_THOUSAND').unlocked, true, '0.1% is inclusive');
});

test('printing is part of identity: the unlimited holo does not earn Edition One', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const unlimited = evaluate([rip('rip_0', at(0), [{ variantId: CHARIZARD_HOLO, value: 900 }])], index);
  assert.equal(byId(unlimited, 'FIRST_EDITION').unlocked, false, 'same card, different print run');
  assert.equal(byId(unlimited, 'CHARIZARD_HUNTER').unlocked, true);

  const firstEd = evaluate([rip('rip_0', at(0), [{ variantId: CHARIZARD_1ST, value: 8400.5 }])], index);
  assert.equal(byId(firstEd, 'FIRST_EDITION').unlocked, true);
});

test('the same rip handed over twice counts once', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  // Two overlapping ledger pages: the `before` cursor cannot split a timestamp
  // tie, so a caller can legitimately re-send a rip.
  const one = rip('rip_1', at(0), [{ variantId: PIDGEY, value: 1.75 }]);
  const statuses = evaluate([one, rip('rip_2', at(1), [{ variantId: PIDGEY, value: 1.75 }]), one], index);

  assert.deepEqual(byId(statuses, 'CENTURION').progress, { current: 2, target: 100 });
  assert.deepEqual(byId(statuses, 'VAULT_BUILDER').progress, { current: 3.5, target: 1000 });
});

test('evaluating a subset of definitions returns just that subset, in order', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const defs = DEFAULT_ACHIEVEMENTS.filter((d) => d.id === 'GRAIL_HUNTER' || d.id === 'FIRST_RIP');
  const ctx = buildAchievementContext(loadedWallet(), index);
  const statuses = evaluateAchievements(ctx, defs);

  assert.deepEqual(statuses.map((s) => s.def.id), defs.map((d) => d.id));
  assert.equal(ctx.openings.length, 100);
  assert.equal(ctx.entries.length, 100 + 3, 'four cards in the first rip, one in each of the rest');
  assert.equal(ctx.entries[0].openedAt, at(0), 'entries are oldest first');
});
