/**
 * Catalog read-model tests (spec §8, §9, §10).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PokemonCard, PokemonSet } from '../src/types.ts';
import type { PriceQuote } from '../src/price.ts';
import { JsonCatalogStore } from '../src/stores/json-store.ts';
import { buildCatalogIndex, queryCards, topGrails, findByRoute } from '../src/query.ts';
import { PullTier } from '../src/tiers.ts';

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

async function seed() {
  const dir = await mkdtemp(join(tmpdir(), 'ripdex-q-'));
  const store = new JsonCatalogStore(dir);

  const charizard = card({ setId: 'base1', number: '4', name: 'Charizard', rarity: 'Rare Holo', types: ['Fire'] });
  const charmander = card({ setId: 'sv3pt5', number: '4', name: 'Charmander', rarity: 'Common', types: ['Fire'], artist: 'Tomokazu Komiya' });
  // Distinct artist: sharing the fixture default would make the artist search
  // assertion below match two cards for reasons unrelated to search itself.
  const mystery = card({ setId: 'sv3pt5', number: '9', name: 'Unpriced Thing', rarity: 'Rare', types: ['Water'], artist: 'Sowsow' });

  await store.upsertSets(SETS);
  await store.upsertCards([charizard, charmander, mystery]);
  await store.upsertVariants([
    { variantId: 'base1|4|holofoil|unlimited', cardId: 'base1-4', setId: 'base1', number: '4', finish: 'holofoil', printing: 'unlimited', confidence: 'reported' },
    { variantId: 'sv3pt5|4|non-foil|unlimited', cardId: 'sv3pt5-4', setId: 'sv3pt5', number: '4', finish: 'non-foil', printing: 'unlimited', confidence: 'reported' },
    { variantId: 'sv3pt5|4|reverse-holofoil|unlimited', cardId: 'sv3pt5-4', setId: 'sv3pt5', number: '4', finish: 'reverse-holofoil', printing: 'unlimited', confidence: 'reported' },
    { variantId: 'sv3pt5|9|non-foil|unlimited', cardId: 'sv3pt5-9', setId: 'sv3pt5', number: '9', finish: 'non-foil', printing: 'unlimited', confidence: 'inferred' },
  ]);
  await store.upsertPrices([
    { variantId: 'base1|4|holofoil|unlimited', observedOn: '2026-09-08', quote: quote('base1|4|holofoil|unlimited', 897.19) },
    { variantId: 'sv3pt5|4|non-foil|unlimited', observedOn: '2026-09-08', quote: quote('sv3pt5|4|non-foil|unlimited', 0.24) },
    { variantId: 'sv3pt5|4|reverse-holofoil|unlimited', observedOn: '2026-09-08', quote: quote('sv3pt5|4|reverse-holofoil|unlimited', 0.41) },
  ]);
  await store.close();

  const index = await buildCatalogIndex(store, {
    packVariantIds: new Set(['base1|4|holofoil|unlimited']),
  });
  return { index, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('headline value is the card most valuable priced variant', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const charmander = index.byCardId.get('sv3pt5-4')!;
  assert.equal(charmander.variants.length, 2);
  assert.equal(charmander.headlineValue, 0.41, 'reverse holo outranks the normal printing');
  assert.equal(charmander.headlineTier, PullTier.Tier1);
});

test('a card with no priced variant reports no value rather than zero', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const mystery = index.byCardId.get('sv3pt5-9')!;
  assert.equal(mystery.headlineValue, null);
  assert.equal(mystery.headlineTier, null);
  assert.equal(mystery.variants[0].confidence, 'inferred');
});

test('a price filter excludes unpriced cards instead of treating them as $0', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const cheap = queryCards(index, { maxPrice: 5 });
  const names = cheap.cards.map((c) => c.name);
  assert.ok(names.includes('Charmander'));
  assert.ok(!names.includes('Unpriced Thing'), 'unknown price must not read as cheap');
});

test('value sorting puts unpriced cards last in both directions', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const desc = queryCards(index, { sort: 'value-desc' }).cards;
  assert.equal(desc[0].name, 'Charizard');
  assert.equal(desc.at(-1)?.name, 'Unpriced Thing');

  const asc = queryCards(index, { sort: 'value-asc' }).cards;
  assert.equal(asc[0].name, 'Charmander');
  assert.equal(asc.at(-1)?.name, 'Unpriced Thing');
});

test('rarity sorting ranks an unlearned rarity as unknown, not as the rarest thing in the catalog', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  // New sets invent rarity strings constantly, and a card can carry none at all.
  // Scored above the ladder rather than below it, both of these head a
  // rarest-first browse and bury the actual chase cards.
  const extra: typeof index.cards = [
    { ...index.cards[0], cardId: 'x-1', name: 'Brand New Rarity', rarity: 'Ultra Turbo Rare' },
    { ...index.cards[0], cardId: 'x-2', name: 'No Rarity', rarity: null },
  ];
  const widened = { ...index, cards: [...index.cards, ...extra] };

  const order = queryCards(widened, { sort: 'rarity' }).cards.map((c) => c.rarity);
  assert.deepEqual(order, ['Rare Holo', 'Rare', 'Common', 'Ultra Turbo Rare', null]);
});

test('search matches name, set and artist', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  assert.equal(queryCards(index, { search: 'chariz' }).totalCount, 1);
  assert.equal(queryCards(index, { search: 'CHARIZ' }).totalCount, 1, 'search is case-insensitive');
  assert.equal(queryCards(index, { search: 'Arita' }).totalCount, 1);
  assert.equal(queryCards(index, { search: '151' }).totalCount, 2);
});

test('filters compose', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  assert.equal(queryCards(index, { setId: 'sv3pt5' }).totalCount, 2);
  assert.equal(queryCards(index, { setId: 'sv3pt5', type: 'Fire' }).totalCount, 1);
  assert.equal(queryCards(index, { type: 'Water' }).totalCount, 1);
  assert.equal(queryCards(index, { year: 1999 }).totalCount, 1);
  assert.equal(queryCards(index, { availableInPacks: true }).totalCount, 1);
});

test('paging reports totals over the whole match, not the page', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  const p1 = queryCards(index, { pageSize: 2, page: 1 });
  assert.equal(p1.cards.length, 2);
  assert.equal(p1.totalCount, 3);
  assert.equal(p1.hasMore, true);

  const p2 = queryCards(index, { pageSize: 2, page: 2 });
  assert.equal(p2.cards.length, 1);
  assert.equal(p2.hasMore, false);
});

test('availableInPacks is derived from actual pool membership', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  assert.equal(index.byCardId.get('base1-4')?.availableInPacks, true);
  assert.equal(index.byCardId.get('sv3pt5-4')?.availableInPacks, false);
});

test('topGrails respects the threshold', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  assert.deepEqual(topGrails(index, 10, 500).map((c) => c.name), ['Charizard']);
  assert.equal(topGrails(index, 10, 1000).length, 0);
});

test('the canonical route resolves a card', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  assert.equal(findByRoute(index, 'base1', '4')?.name, 'Charizard');
  assert.equal(findByRoute(index, 'base1', '999'), null);
  // Same collector number in a different set must not collide.
  assert.equal(findByRoute(index, 'sv3pt5', '4')?.name, 'Charmander');
});

test('facets only list sets that actually have cards', async (t) => {
  const { index, cleanup } = await seed();
  t.after(cleanup);

  assert.deepEqual(index.facets.sets.map((s) => s.id).sort(), ['base1', 'sv3pt5']);
  assert.deepEqual(index.facets.types.sort(), ['Fire', 'Water']);
  assert.deepEqual(index.facets.years, [2023, 1999]);
});
