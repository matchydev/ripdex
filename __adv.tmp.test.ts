/** Adversarial probes against achievements.ts. Scratch only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = 'C:/Users/Holden Goodwin/Documents/GitHub/ripdex/packages/pokemon-core/src/';
const load = (f: string): Promise<any> => import(pathToFileURL(SRC + f).href);

const [ach, openings, tiers, queryMod, jsonStore] = await Promise.all([
  load('achievements.ts'),
  load('openings.ts'),
  load('tiers.ts'),
  load('query.ts'),
  load('stores/json-store.ts'),
]);

const SETS: any[] = [
  { id: 'base1', name: 'Base', series: 'Base', symbolUrl: null, logoUrl: null, releaseDate: '1999-01-09', total: 102, printedTotal: 102 },
];

function card(over: any): any {
  return {
    id: `${over.setId}-${over.number}`, name: 'X', supertype: 'Pokémon', subtypes: [],
    types: ['Water'], hp: 60, evolvesFrom: null, evolvesTo: [], rules: [], attacks: [],
    weaknesses: [], resistances: [], retreatCost: [], convertedRetreatCost: null,
    setId: over.setId, setName: 'Base', setSeries: 'Base', setSymbolUrl: null,
    setLogoUrl: null, setReleaseDate: '1999-01-09', setTotal: 102,
    artist: 'A', rarity: 'Common', flavorText: null,
    nationalPokedexNumbers: [], legalities: {},
    images: { small: 's.png', large: 'l.png' },
    source: { provider: 'test', fetchedAt: '2026-09-08T00:00:00.000Z' },
    ...over,
  };
}

async function seed(): Promise<{ index: any; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'ripdex-adv-'));
  const store = new jsonStore.JsonCatalogStore(dir);
  await store.upsertSets(SETS);
  const cards: any[] = [];
  const variants: any[] = [];
  for (let n = 1; n <= 60; n++) {
    cards.push(card({ setId: 'base1', number: String(n), name: `C${n}`, nationalPokedexNumbers: [n] }));
    variants.push({ variantId: `base1|${n}|non-foil|unlimited`, cardId: `base1-${n}`, setId: 'base1', number: String(n), finish: 'non-foil', printing: 'unlimited', confidence: 'reported' });
  }
  await store.upsertCards(cards);
  await store.upsertVariants(variants);
  await store.close();
  const index = await queryMod.buildCatalogIndex(store);
  return { index, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const at = (m: number): string => new Date(Date.UTC(2026, 0, 1, 0, 0, m)).toISOString();

function rip(id: string, when: string, list: { variantId: string; value?: number; probability?: number }[], wallet = '0xA'): any {
  return {
    openingId: id, openedAt: when, wallet, packId: 'p', packVersion: 'v1',
    cards: list.map((p, slot) => ({
      variantId: p.variantId,
      cardId: openings.cardIdForVariant(p.variantId),
      probability: p.probability ?? 0.25,
      referenceValue: p.value ?? 2,
      currency: 'USD',
      tier: tiers.classifyTier(p.value ?? 2),
      slot,
    })),
    verification: { serverSeedHash: 'h', clientSeed: 'c', nonce: 1, priceSnapshotId: 'ps', packConfigSnapshotId: 'pc', priceSnapshotHash: 'ph', packConfigSnapshotHash: 'ch', serverSeed: null },
  };
}

const byId = (list: any[], id: string): any => list.find((s) => s.def.id === id);
const evaluate = (o: any[], index: any): any[] =>
  ach.evaluateAchievements(ach.buildAchievementContext(o, index));

/* ---------------- PROBE 1: float accumulation on VAULT_BUILDER ---------------- */

test('PROBE 1: exactly $1000 of 2dp values should unlock Vault Builder', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  // These 35 values sum to exactly 100000 cents, but IEEE-754 addition in this
  // order lands on 999.9999999999999.
  const vals = [24.88, 11.19, 41.99, 39.56, 18.65, 28.21, 17.99, 26.91, 40.03, 17.24,
    26.04, 45.04, 37.1, 23.9, 6.14, 38.14, 27.11, 43.72, 34.39, 40.29, 28.17, 1.45,
    26.29, 47.81, 17.31, 43.12, 49.23, 46.25, 25.55, 23.93, 0.85, 28.74, 34.27, 20.64, 17.87];
  const cents = vals.reduce((a, b) => a + Math.round(b * 100), 0);
  assert.equal(cents, 100000, 'fixture really is exactly $1000.00');

  const wallet = vals.map((v, i) => rip(`r${i}`, at(i), [{ variantId: `base1|${(i % 60) + 1}|non-foil|unlimited`, value: v }]));
  const vault = byId(evaluate(wallet, index), 'VAULT_BUILDER');
  console.log('VAULT_BUILDER =>', JSON.stringify(vault.progress), 'unlocked=', vault.unlocked);
  assert.deepEqual(vault.progress, { current: 1000, target: 1000 });
  assert.equal(vault.unlocked, true, 'full bar but locked is the defect');
});

/* ---------------- PROBE 2: mixed wallets ---------------- */

test('PROBE 2: two wallets in one context', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);
  const st = evaluate([
    rip('r1', at(0), [{ variantId: 'base1|1|non-foil|unlimited' }], '0xA'),
    rip('r2', at(1), [{ variantId: 'base1|2|non-foil|unlimited' }], '0xB'),
  ], index);
  console.log('mixed-wallet CENTURION =>', JSON.stringify(byId(st, 'CENTURION').progress));
});

/* ---------------- PROBE 3: NaN / negative frozen value ---------------- */

test('PROBE 3: NaN referenceValue does not poison the accumulator', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);
  const st = evaluate([
    rip('r1', at(0), [{ variantId: 'base1|1|non-foil|unlimited', value: NaN }]),
    rip('r2', at(1), [{ variantId: 'base1|2|non-foil|unlimited', value: 600 }]),
  ], index);
  const v = byId(st, 'VAULT_BUILDER');
  console.log('NaN probe VAULT =>', JSON.stringify(v.progress), v.unlocked);
  assert.ok(Number.isFinite(v.progress.current));
});

/* ---------------- PROBE 4: empty-card rip ---------------- */

test('PROBE 4: a rip with no cards', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);
  const st = evaluate([rip('r1', at(0), [])], index);
  console.log('empty rip FIRST_RIP =>', byId(st, 'FIRST_RIP').unlocked, JSON.stringify(byId(st, 'FIRST_RIP').progress));
});

/* ---------------- PROBE 5: catalog drift, facts null ---------------- */

test('PROBE 5: pull of a variant the catalog no longer knows', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);
  const st = evaluate([rip('r1', at(0), [{ variantId: 'ghost|99|holofoil|1st-edition', value: 900 }])], index);
  console.log('drift =>', st.map((s: any) => `${s.def.id}:${s.unlocked}`).join(' '));
  assert.equal(byId(st, 'FIRST_EDITION').unlocked, true, 'variant identity needs no catalog');
  assert.equal(byId(st, 'GRAIL_HUNTER').unlocked, true, 'frozen tier needs no catalog');
  assert.equal(byId(st, 'FULL_SET').progress.target > 0, true);
});

/* ---------------- PROBE 6: bucket lead regression ---------------- */

test('PROBE 6: progress never goes backwards across buckets', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);
  // one set only here, so just check monotonic growth
  const o: any[] = [];
  for (let n = 1; n <= 10; n++) o.push(rip(`r${n}`, at(n), [{ variantId: `base1|${n}|non-foil|unlimited` }]));
  const st = evaluate(o, index);
  console.log('FULL_SET =>', JSON.stringify(byId(st, 'FULL_SET').progress));
});

/* ---------------- PROBE 7: duplicate openingId, different contents ---------------- */

test('PROBE 7: same openingId different contents keeps first seen', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);
  const a = rip('dup', at(0), [{ variantId: 'base1|1|non-foil|unlimited', value: 1 }]);
  const b = rip('dup', at(0), [{ variantId: 'base1|2|non-foil|unlimited', value: 999 }]);
  const st = evaluate([a, b], index);
  console.log('dup-conflict VAULT =>', JSON.stringify(byId(st, 'VAULT_BUILDER').progress));
});
