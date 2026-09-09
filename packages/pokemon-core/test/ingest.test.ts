/**
 * Ingestion tests (spec §2). No network: providers are fakes, so these assert
 * pipeline behaviour rather than the upstream API's mood.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PokemonCard, PokemonSet, PokemonPriceReport } from '../src/types.ts';
import type { PokemonCatalogProvider, PokemonPricingProvider, CardPage } from '../src/provider.ts';
import { JsonCatalogStore } from '../src/stores/json-store.ts';
import { syncSets, syncCards, syncPrices, verifyAssets } from '../src/ingest.ts';
import type { SyncLogger } from '../src/ingest.ts';

const quiet: SyncLogger = { info: () => {}, warn: () => {} };

async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), 'ripdex-'));
  return { dir, store: () => new JsonCatalogStore(dir), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/* --- fixtures --- */

const SET: PokemonSet = {
  id: 'sv3pt5', name: '151', series: 'Scarlet & Violet',
  symbolUrl: 'https://img.test/sv3pt5/symbol.png',
  logoUrl: 'https://img.test/sv3pt5/logo.png',
  releaseDate: '2023-09-22', total: 207, printedTotal: 165,
};

function card(id: string, number: string, rarity: string): PokemonCard {
  return {
    id, name: 'Charmander', supertype: 'Pokémon', subtypes: [], types: ['Fire'], hp: 60,
    evolvesFrom: null, evolvesTo: ['Charmeleon'], rules: [], attacks: [], weaknesses: [],
    resistances: [], retreatCost: ['Colorless'], convertedRetreatCost: 1,
    setId: 'sv3pt5', setName: '151', setSeries: 'Scarlet & Violet',
    setSymbolUrl: SET.symbolUrl, setLogoUrl: SET.logoUrl,
    setReleaseDate: '2023-09-22', setTotal: 207,
    number, artist: 'Tomokazu Komiya', rarity, flavorText: null,
    nationalPokedexNumbers: [4], legalities: { standard: 'Legal' },
    images: { small: `https://img.test/sv3pt5/${number}.png`, large: `https://img.test/sv3pt5/${number}_hires.png` },
    source: { provider: 'fake', fetchedAt: new Date().toISOString() },
  };
}

const CARDS = [card('sv3pt5-4', '4', 'Common'), card('sv3pt5-5', '5', 'Uncommon')];

function priceReport(over: Partial<PokemonPriceReport> = {}): PokemonPriceReport {
  const nulls = {
    normalLow: null, normalMid: null, normalHigh: null, normalMarket: null,
    holofoilLow: null, holofoilMid: null, holofoilHigh: null, holofoilMarket: null,
    reverseHolofoilLow: null, reverseHolofoilMid: null, reverseHolofoilHigh: null, reverseHolofoilMarket: null,
    firstEditionNormalLow: null, firstEditionNormalMid: null, firstEditionNormalHigh: null, firstEditionNormalMarket: null,
    firstEditionHolofoilLow: null, firstEditionHolofoilMid: null, firstEditionHolofoilHigh: null, firstEditionHolofoilMarket: null,
    unlimitedHolofoilLow: null, unlimitedHolofoilMid: null, unlimitedHolofoilHigh: null, unlimitedHolofoilMarket: null,
  };
  return {
    tcgplayerUrl: 'https://prices.test/x', tcgplayerUpdatedAt: '2026-09-08T00:00:00.000Z',
    currency: 'USD', ...nulls,
    normalMarket: 0.24, reverseHolofoilMarket: 0.41,
    ...over,
  };
}

class FakeCatalog implements PokemonCatalogProvider {
  readonly name = 'fake';
  async listSets(): Promise<PokemonSet[]> { return [SET]; }
  async getSet(): Promise<PokemonSet | null> { return SET; }
  async listCards(): Promise<CardPage> {
    return { cards: CARDS, page: 1, pageSize: 250, totalCount: CARDS.length };
  }
  async getCard(): Promise<PokemonCard | null> { return CARDS[0]; }
}

class FakePricing implements PokemonPricingProvider {
  readonly name = 'fake';
  readonly currency = 'USD';
  failOn: Set<string>;
  unpriced: Set<string>;
  constructor(failOn: Set<string> = new Set(), unpriced: Set<string> = new Set()) {
    this.failOn = failOn;
    this.unpriced = unpriced;
  }
  async getPrices(cardId: string): Promise<PokemonPriceReport | null> {
    if (this.failOn.has(cardId)) throw new Error('502 upstream');
    if (this.unpriced.has(cardId)) return null;
    return priceReport();
  }
  async getPricesBatch(): Promise<Map<string, PokemonPriceReport>> { return new Map(); }
}

/* ------------------------------------------------------------------ */

test('syncSets is idempotent', async (t) => {
  const { store, cleanup } = await tempStore();
  t.after(cleanup);

  const first = await syncSets(new FakeCatalog(), store(), quiet);
  assert.deepEqual(first, { inserted: 1, updated: 0, unchanged: 0 });

  const second = await syncSets(new FakeCatalog(), store(), quiet);
  assert.deepEqual(second, { inserted: 0, updated: 0, unchanged: 1 });
});

test('syncCards is idempotent despite a changing fetchedAt', async (t) => {
  const { store, cleanup } = await tempStore();
  t.after(cleanup);
  await syncSets(new FakeCatalog(), store(), quiet);

  const first = await syncCards(new FakeCatalog(), store(), {}, quiet);
  assert.equal(first.cards.inserted, 2);

  // A second fetch stamps a new source.fetchedAt; that alone must not count as
  // an update, or every run would look like the catalog changed.
  const second = await syncCards(new FakeCatalog(), store(), {}, quiet);
  assert.deepEqual(second.cards, { inserted: 0, updated: 0, unchanged: 2 });
});

test('syncPrices splits variants and prices each one from its own fields', async (t) => {
  const { store, cleanup } = await tempStore();
  t.after(cleanup);
  await syncSets(new FakeCatalog(), store(), quiet);
  await syncCards(new FakeCatalog(), store(), {}, quiet);

  const res = await syncPrices(new FakePricing(), store(), { now: new Date('2026-09-08') }, quiet);
  assert.equal(res.failed.length, 0);

  const latest = await store().latestPrices();
  assert.equal(latest.get('sv3pt5|4|non-foil|unlimited')?.quote.referenceValue, 0.24);
  assert.equal(latest.get('sv3pt5|4|reverse-holofoil|unlimited')?.quote.referenceValue, 0.41);
});

test('syncPrices is idempotent within a day and appends across days', async (t) => {
  const { store, cleanup } = await tempStore();
  t.after(cleanup);
  await syncSets(new FakeCatalog(), store(), quiet);
  await syncCards(new FakeCatalog(), store(), {}, quiet);

  await syncPrices(new FakePricing(), store(), { now: new Date('2026-09-08') }, quiet);
  const same = await syncPrices(new FakePricing(), store(), { now: new Date('2026-09-08') }, quiet);
  assert.equal(same.prices.inserted, 0);
  assert.equal(same.prices.updated, 0);

  await syncPrices(new FakePricing(), store(), { now: new Date('2026-09-09') }, quiet);
  const history = await store().priceHistory('sv3pt5|4|non-foil|unlimited');
  assert.deepEqual(history.map((h) => h.observedOn), ['2026-09-08', '2026-09-09']);
});

test('a fetch failure is reported, never counted as "no price"', async (t) => {
  const { store, cleanup } = await tempStore();
  t.after(cleanup);
  await syncSets(new FakeCatalog(), store(), quiet);
  await syncCards(new FakeCatalog(), store(), {}, quiet);

  const res = await syncPrices(
    new FakePricing(new Set(['sv3pt5-4']), new Set(['sv3pt5-5'])),
    store(), { now: new Date('2026-09-08') }, quiet,
  );

  assert.equal(res.failed.length, 1, 'the 502 must surface as a failure');
  assert.equal(res.failed[0].cardId, 'sv3pt5-4');
  assert.equal(res.skipped, 1, 'the genuinely unpriced card is a skip, not a failure');
});

test('variant confidence ratchets up and never back down', async (t) => {
  const { store, cleanup } = await tempStore();
  t.after(cleanup);
  await syncSets(new FakeCatalog(), store(), quiet);
  await syncCards(new FakeCatalog(), store(), {}, quiet);

  const beforePrices = await store().listVariants('sv3pt5-4');
  assert.ok(beforePrices.every((v) => v.confidence === 'inferred'));

  await syncPrices(new FakePricing(), store(), { now: new Date('2026-09-08') }, quiet);
  const afterPrices = await store().listVariants('sv3pt5-4');
  assert.ok(afterPrices.some((v) => v.confidence === 'reported'));

  // Re-running cards must not drag confirmed variants back to inferred.
  await syncCards(new FakeCatalog(), store(), {}, quiet);
  const afterRerun = await store().listVariants('sv3pt5-4');
  const nonFoil = afterRerun.find((v) => v.variantId === 'sv3pt5|4|non-foil|unlimited');
  assert.equal(nonFoil?.confidence, 'reported');
});

test('verifyAssets reports a broken card image', async (t) => {
  const { store, cleanup } = await tempStore();
  t.after(cleanup);
  await syncSets(new FakeCatalog(), store(), quiet);
  await syncCards(new FakeCatalog(), store(), {}, quiet);

  const fakeFetch = (async (url: string | URL) =>
    new Response(null, { status: String(url).includes('/4_hires') ? 404 : 200 })) as unknown as typeof fetch;

  const report = await verifyAssets(store(), { fetchImpl: fakeFetch }, quiet);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].kind, 'card-image');
  assert.equal(report.issues[0].status, 404);
});

test('the store survives a reopen', async (t) => {
  const { dir, store, cleanup } = await tempStore();
  t.after(cleanup);
  await syncSets(new FakeCatalog(), store(), quiet);
  await syncCards(new FakeCatalog(), store(), {}, quiet);

  const reopened = new JsonCatalogStore(dir);
  assert.equal((await reopened.listSets()).length, 1);
  assert.equal((await reopened.listCards('sv3pt5')).length, 2);
});

test('a corrupt catalog file fails loudly rather than starting empty', async (t) => {
  const { dir, cleanup } = await tempStore();
  t.after(cleanup);
  await writeFile(join(dir, 'sets.json'), '{ this is not json', 'utf8');
  await assert.rejects(() => new JsonCatalogStore(dir).listSets());
});
