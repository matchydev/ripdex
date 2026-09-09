/**
 * Postgres adapter tests (spec §2).
 *
 * No database. The adapter's job is to emit correct SQL and to map rows back
 * into the model, so the client is faked and the SQL it receives is the thing
 * under test. What a live database would additionally prove — that the counts
 * are right — is asserted structurally here: the statements must classify
 * inserts, updates and unchanged rows server-side, or idempotency cannot hold.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { PokemonCard, PokemonSet } from '../src/types.ts';
import type { CatalogStore, PriceRow, VariantRow } from '../src/store.ts';
import { PostgresCatalogStore, type SqlClient } from '../src/stores/postgres-store.ts';

/* ------------------------------------------------------------------ *
 * Fake client
 * ------------------------------------------------------------------ */

interface Call {
  text: string;
  params: unknown[];
}

type Responder = (text: string, params: unknown[]) => any[];

const countRow = [{ inserted: '2', updated: '1', unchanged: '3' }];

/** Upserts end in a counting SELECT; everything else is a read. */
const defaultResponder: Responder = (text) => (text.includes('AS inserted') ? countRow : []);

function fakeClient(responder: Responder = defaultResponder) {
  const calls: Call[] = [];
  const client: SqlClient = {
    async query(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      const rows = responder(text, params);
      return { rows, rowCount: rows.length };
    },
  };
  return { client, calls };
}

function store(responder?: Responder) {
  const { client, calls } = fakeClient(responder);
  return { store: new PostgresCatalogStore(client), calls };
}

/** The one call whose SQL mentions `marker`. Fails loudly if it is ambiguous. */
function sqlFor(calls: Call[], marker: string): string {
  const hits = calls.filter((c) => c.text.includes(marker));
  assert.equal(hits.length, 1, `expected exactly one statement mentioning ${marker}`);
  return hits[0].text;
}

/* ------------------------------------------------------------------ *
 * Fixtures — every identifier carries a SQL payload, so an interpolated
 * value would be visible in the statement text rather than merely wrong.
 * ------------------------------------------------------------------ */

const EVIL = {
  setId: `base1'; DROP TABLE pokemon_set; --`,
  cardId: `base1-4'); DELETE FROM pokemon_card; --`,
  variantId: `base1|4|holofoil|1st-edition' OR '1'='1`,
  syncKey: `sets'; TRUNCATE sync_state; --`,
  cursor: `page-2'; --`,
};

const SET: PokemonSet = {
  id: EVIL.setId,
  name: 'Base',
  series: 'Base',
  symbolUrl: null,
  logoUrl: null,
  releaseDate: '1999-01-09',
  total: 102,
  printedTotal: 102,
};

const CARD: PokemonCard = {
  id: EVIL.cardId,
  name: 'Charizard',
  supertype: 'Pokémon',
  subtypes: ['Stage 2'],
  types: ['Fire'],
  hp: 120,
  evolvesFrom: 'Charmeleon',
  evolvesTo: [],
  rules: [],
  attacks: [
    { name: 'Fire Spin', cost: ['Fire', 'Fire'], convertedEnergyCost: 2, damage: '100', text: '' },
  ],
  weaknesses: [{ type: 'Water', value: '×2' }],
  resistances: [],
  retreatCost: ['Colorless'],
  convertedRetreatCost: 3,
  setId: EVIL.setId,
  setName: 'Base',
  setSeries: 'Base',
  setSymbolUrl: null,
  setLogoUrl: null,
  setReleaseDate: '1999-01-09',
  setTotal: 102,
  number: '4',
  artist: 'Mitsuhiro Arita',
  rarity: 'Rare Holo',
  flavorText: null,
  nationalPokedexNumbers: [6],
  legalities: { unlimited: 'Legal' },
  images: { small: 's.png', large: 'l.png' },
  source: { provider: 'pokemontcg', fetchedAt: '2026-09-08T00:00:00.000Z' },
};

const VARIANT: VariantRow = {
  variantId: EVIL.variantId,
  cardId: EVIL.cardId,
  setId: EVIL.setId,
  number: '4',
  finish: 'holofoil',
  printing: '1st-edition',
  confidence: 'inferred',
};

const PRICE: PriceRow = {
  variantId: EVIL.variantId,
  observedOn: '2026-09-08',
  quote: {
    variantId: EVIL.variantId,
    low: 4200.0,
    mid: 5100.5,
    high: 9000.0,
    market: 5500.25,
    referenceValue: 5500.25,
    basis: 'market',
    currency: 'USD',
    source: 'tcgplayer',
    sourceUrl: null,
    sourceUpdatedAt: '2026-09-08T00:00:00.000Z',
  },
};

async function exerciseEveryMethod(s: PostgresCatalogStore): Promise<void> {
  await s.upsertSets([SET]);
  await s.upsertCards([CARD]);
  await s.upsertVariants([VARIANT]);
  await s.upsertPrices([PRICE]);
  await s.listSets();
  await s.listCards(EVIL.setId);
  await s.listVariants(EVIL.cardId);
  await s.latestPrices([EVIL.variantId]);
  await s.priceHistory(EVIL.variantId);
  await s.getSyncState(EVIL.syncKey);
  await s.setSyncState({
    key: EVIL.syncKey,
    lastRunAt: '2026-09-08T00:00:00.000Z',
    lastCursor: EVIL.cursor,
    note: null,
  });
  await s.close();
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

test('the adapter satisfies the CatalogStore port', async () => {
  const { client } = fakeClient();
  // Compile-time: this assignment is the actual assertion. The runtime loop
  // catches a method that exists on the interface but was never implemented.
  const s: CatalogStore = new PostgresCatalogStore(client);

  assert.equal(s.name, 'postgres');
  for (const method of [
    'upsertSets', 'upsertCards', 'upsertVariants', 'upsertPrices',
    'listSets', 'listCards', 'listVariants',
    'latestPrices', 'priceHistory', 'getSyncState', 'setSyncState', 'close',
  ]) {
    assert.equal(typeof (s as any)[method], 'function', `${method} is missing`);
  }
});

test('no value is ever concatenated into statement text', async () => {
  const { store: s, calls } = store();
  await exerciseEveryMethod(s);

  assert.ok(calls.length >= 11, 'every method should have reached the client');

  for (const call of calls) {
    for (const [name, payload] of Object.entries(EVIL)) {
      assert.ok(
        !call.text.includes(payload),
        `${name} was interpolated into SQL:\n${call.text}`,
      );
    }
    // Placeholders and bound values must correspond exactly. A statement that
    // binds nothing (listSets takes no arguments) must also reference nothing;
    // a mismatch in either direction is how a query silently binds the wrong
    // column — or how a value ended up in the text instead.
    const indexes = [...call.text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    const highest = indexes.length === 0 ? 0 : Math.max(...indexes);
    assert.equal(
      highest,
      call.params.length,
      `statement references $${highest} but bound ${call.params.length} params:\n${call.text}`,
    );
  }

  // And the payloads did make it to the database — as data.
  const seen = JSON.stringify(calls.map((c) => c.params));
  for (const payload of Object.values(EVIL)) {
    assert.ok(seen.includes(JSON.stringify(payload).slice(1, -1)), 'payload never reached params');
  }
});

test('each upsert classifies insert / update / unchanged in one statement', async () => {
  const { store: s, calls } = store();
  await s.upsertSets([SET]);
  await s.upsertCards([CARD]);
  await s.upsertVariants([VARIANT]);
  await s.upsertPrices([PRICE]);

  assert.equal(calls.length, 4, 'one round trip per batch, not per row');
  for (const call of calls) {
    assert.match(call.text, /ON CONFLICT/, 'writes must be upserts');
    assert.match(call.text, /xmax = 0\) AS was_insert/, 'insert vs update is undecidable');
    assert.match(call.text, /IS DISTINCT FROM/, 'unchanged rows must be detectable');
    assert.match(call.text, /AS inserted/);
    assert.match(call.text, /AS updated/);
    assert.match(call.text, /AS unchanged/);
    // The pre-write snapshot is what makes a repeat run report "unchanged".
    assert.match(call.text, /prior AS \(\s*SELECT/);
  }
});

test('upsertVariants ratchets confidence upward in SQL', async () => {
  const { store: s, calls } = store();
  await s.upsertVariants([VARIANT]);
  const sql = sqlFor(calls, 'pokemon_card_variant');

  // A stored 'reported' survives an incoming 'inferred'.
  assert.match(
    sql,
    /confidence = CASE WHEN t\.confidence = 'reported' THEN 'reported' ELSE excluded\.confidence END/,
  );
  // ...and the change detection applies the same rule, so a refused downgrade
  // is counted as unchanged rather than as a phantom update.
  assert.match(sql, /CASE WHEN p\.confidence = 'reported' THEN 'reported' ELSE i\.confidence END/);
  // Nothing else may assign confidence.
  assert.ok(
    !/confidence = excluded\.confidence/.test(sql),
    'an unguarded assignment would let inferred overwrite reported',
  );
});

test('upsertPrices keys on (variant_id, observed_on)', async () => {
  const { store: s, calls } = store();
  await s.upsertPrices([PRICE]);
  const sql = sqlFor(calls, 'pokemon_price_observation');

  assert.match(sql, /ON CONFLICT \(variant_id, observed_on\)/);
  // Money is rounded to the column's scale before comparison, otherwise a
  // fractional cent would report an update on every run.
  assert.match(sql, /reference_value::numeric\(12,2\)/);
});

test('latestPrices asks for exactly one row per variant', async () => {
  const { store: s, calls } = store();
  await s.latestPrices(['a|1|non-foil|unlimited']);
  const sql = calls[0].text;

  assert.match(sql, /SELECT DISTINCT ON \(variant_id\)/);
  assert.match(sql, /ORDER BY variant_id, observed_on DESC/);
  assert.deepEqual(calls[0].params, [['a|1|non-foil|unlimited']]);
});

test('latestPrices without ids asks for every variant, with an empty list asks for none', async () => {
  const { store: s, calls } = store();
  await s.latestPrices();
  await s.latestPrices([]);

  // NULL is the "no filter" sentinel; an empty array matches nothing, which is
  // what an empty request means.
  assert.deepEqual(calls[0].params, [null]);
  assert.deepEqual(calls[1].params, [[]]);
  assert.match(calls[0].text, /\$1::text\[\] IS NULL OR variant_id = ANY\(\$1::text\[\]\)/);
});

test('list filters are bound, not appended', async () => {
  const { store: s, calls } = store();
  await s.listCards();
  await s.listCards('base1');
  await s.listVariants('base1-4');

  assert.deepEqual(calls[0].params, [null]);
  assert.deepEqual(calls[1].params, ['base1']);
  assert.deepEqual(calls[2].params, ['base1-4']);
  assert.equal(calls[0].text, calls[1].text, 'the filter must not change the statement text');
});

test('dates are rendered as text, never handed over as timestamps', async () => {
  const { store: s, calls } = store();
  await s.listSets();
  await s.priceHistory('a|1|non-foil|unlimited');

  // A DATE returned as a JS Date is UTC midnight; printed back in a negative
  // offset it becomes the previous day.
  assert.match(calls[0].text, /to_char\(release_date, 'YYYY-MM-DD'\) AS release_date/);
  assert.match(calls[1].text, /to_char\(observed_on, 'YYYY-MM-DD'\) AS observed_on/);
  assert.match(calls[1].text, /ORDER BY observed_on ASC/, 'history is oldest first');
});

test('rows are batched rather than sent one per round trip', async () => {
  const { client, calls } = fakeClient();
  const s = new PostgresCatalogStore(client, { batchSize: 500 });

  const many = Array.from({ length: 1200 }, (_, n) => ({ ...SET, id: `set-${n}` }));
  await s.upsertSets(many);

  assert.equal(calls.length, 3, '1200 rows in batches of 500');
  assert.equal(JSON.parse(calls[0].params[0] as string).length, 500);
  assert.equal(JSON.parse(calls[2].params[0] as string).length, 200);
});

test('counts are summed across batches and returned as numbers', async () => {
  const { client } = fakeClient();
  const s = new PostgresCatalogStore(client, { batchSize: 1 });

  const result = await s.upsertSets([SET, { ...SET, id: 'base2' }]);
  // The fake reports 2/1/3 per statement; bigint counts arrive as strings and
  // must not concatenate.
  assert.deepEqual(result, { inserted: 4, updated: 2, unchanged: 6 });
});

test('a duplicated key inside one batch is collapsed', async () => {
  const { store: s, calls } = store();
  // Postgres aborts the whole statement with "cannot affect row a second time"
  // if the same conflict key appears twice, so the last write must win here.
  await s.upsertVariants([VARIANT, { ...VARIANT, confidence: 'reported' }]);

  const payload = JSON.parse(calls[0].params[0] as string);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].confidence, 'reported');
});

test('a price row is one observation per variant per day', async () => {
  const { store: s, calls } = store();
  const tomorrow: PriceRow = { ...PRICE, observedOn: '2026-09-09' };
  await s.upsertPrices([PRICE, tomorrow, { ...PRICE, quote: { ...PRICE.quote, market: 1 } }]);

  const payload = JSON.parse(calls[0].params[0] as string);
  // Two days survive; the repeat of day one collapses onto its last value.
  assert.equal(payload.length, 2);
  assert.deepEqual(
    payload.map((r: any) => r.observed_on),
    ['2026-09-08', '2026-09-09'],
  );
  assert.equal(payload[0].market, 1);
  // Every quote field lands on its own column — nothing is dropped on the way.
  assert.equal(payload[0].variant_id, EVIL.variantId);
  assert.equal(payload[0].reference_value, 5500.25);
  assert.equal(payload[0].basis, 'market');
  assert.equal(payload[0].currency, 'USD');
  assert.equal(payload[0].source, 'tcgplayer');
  assert.equal(payload[0].source_url, null);
  assert.equal(payload[0].source_updated_at, '2026-09-08T00:00:00.000Z');
});

test('an empty batch performs no work', async () => {
  const { store: s, calls } = store();
  assert.deepEqual(await s.upsertSets([]), { inserted: 0, updated: 0, unchanged: 0 });
  assert.deepEqual(await s.upsertCards([]), { inserted: 0, updated: 0, unchanged: 0 });
  assert.deepEqual(await s.upsertVariants([]), { inserted: 0, updated: 0, unchanged: 0 });
  assert.deepEqual(await s.upsertPrices([]), { inserted: 0, updated: 0, unchanged: 0 });
  assert.equal(calls.length, 0);
});

test('the card batch carries arrays and json through as structure', async () => {
  const { store: s, calls } = store();
  await s.upsertCards([CARD]);

  const [row] = JSON.parse(calls[0].params[0] as string);
  assert.deepEqual(row.subtypes, ['Stage 2']);
  assert.deepEqual(row.national_pokedex_numbers, [6]);
  assert.equal(row.attacks[0].name, 'Fire Spin');
  assert.equal(row.legalities.unlimited, 'Legal');
  assert.equal(row.image_large, 'l.png');
  assert.match(calls[0].text, /subtypes text\[\]/);
  assert.match(calls[0].text, /attacks jsonb/);
});

test('source_fetched_at is excluded from card change detection', async () => {
  const { store: s, calls } = store();
  await s.upsertCards([CARD]);
  const sql = calls[0].text;

  // It moves on every fetch; comparing it would report the whole catalog as
  // updated on each run.
  assert.ok(
    !/p\.source_fetched_at/.test(sql),
    'the timestamp must not take part in the unchanged comparison',
  );
  assert.match(sql, /source_fetched_at = CASE\s+WHEN/, 'and is only rewritten on a real change');
});

test('numeric columns come back as numbers, and a null price stays null', async () => {
  const { store: s } = store(() => [
    {
      variant_id: 'base1|4|holofoil|1st-edition',
      observed_on: '2026-09-08',
      // The driver hands NUMERIC over as a string to protect precision.
      low: null,
      mid: null,
      high: null,
      market: null,
      reference_value: '5500.25',
      basis: 'low',
      currency: 'USD',
      source: 'tcgplayer',
      source_url: null,
      source_updated_at: new Date('2026-09-08T00:00:00.000Z'),
    },
  ]);

  const latest = await s.latestPrices();
  const row = latest.get('base1|4|holofoil|1st-edition')!;

  assert.equal(row.observedOn, '2026-09-08');
  assert.equal(row.quote.referenceValue, 5500.25);
  assert.equal(typeof row.quote.referenceValue, 'number');
  // An absent figure is absent. Zero would render as a free card.
  assert.equal(row.quote.low, null);
  assert.equal(row.quote.market, null);
  assert.equal(row.quote.sourceUpdatedAt, '2026-09-08T00:00:00.000Z');
  assert.equal(row.quote.variantId, row.variantId, 'the quote is keyed to its own variant');
});

test('a NOT NULL price column coming back empty throws instead of reading as free', async () => {
  const { store: s } = store(() => [
    {
      variant_id: 'base1|4|holofoil|1st-edition',
      observed_on: '2026-09-08',
      low: null, mid: null, high: null, market: null,
      reference_value: null,
      basis: 'market', currency: 'USD', source: 'tcgplayer',
      source_url: null, source_updated_at: null,
    },
  ]);

  await assert.rejects(() => s.latestPrices(), /reference_value/);
});

test('cards are rebuilt from the joined set row', async () => {
  const { store: s } = store(() => [
    {
      card_id: 'base1-4', set_id: 'base1', name: 'Charizard', supertype: 'Pokémon',
      subtypes: ['Stage 2'], types: ['Fire'], hp: 120, evolves_from: 'Charmeleon',
      evolves_to: [], rules: [], attacks: [], weaknesses: [], resistances: [],
      retreat_cost: [], converted_retreat_cost: 3, number: '4', artist: 'Mitsuhiro Arita',
      rarity: 'Rare Holo', flavor_text: null, national_pokedex_numbers: [6],
      legalities: { unlimited: 'Legal' }, image_small: 's.png', image_large: 'l.png',
      source_provider: 'pokemontcg',
      source_fetched_at: new Date('2026-09-08T00:00:00.000Z'),
      set_name: 'Base', set_series: 'Base', set_symbol_url: null, set_logo_url: null,
      set_release_date: '1999-01-09', set_total: 102,
    },
  ]);

  const [card] = await s.listCards('base1');
  assert.equal(card.id, 'base1-4');
  assert.equal(card.setName, 'Base');
  assert.equal(card.setReleaseDate, '1999-01-09');
  assert.equal(card.images.large, 'l.png');
  assert.equal(card.source.fetchedAt, '2026-09-08T00:00:00.000Z');
  assert.equal(card.hp, 120);
});

test('sync state round-trips through bound parameters', async () => {
  const { store: s, calls } = store((text) =>
    text.startsWith('\nSELECT key')
      ? [{
          key: 'sets',
          last_run_at: new Date('2026-09-08T00:00:00.000Z'),
          last_cursor: null,
          note: 'ok',
        }]
      : [],
  );

  const state = await s.getSyncState('sets');
  assert.deepEqual(state, {
    key: 'sets',
    lastRunAt: '2026-09-08T00:00:00.000Z',
    lastCursor: null,
    note: 'ok',
  });

  await s.setSyncState({
    key: 'sets',
    lastRunAt: '2026-09-09T00:00:00.000Z',
    lastCursor: 'page-2',
    note: null,
  });
  assert.deepEqual(calls[1].params, ['sets', '2026-09-09T00:00:00.000Z', 'page-2', null]);
  assert.match(calls[1].text, /ON CONFLICT \(key\) DO UPDATE SET/);
});

test('an unknown sync key reads as null rather than an empty record', async () => {
  const { store: s } = store(() => []);
  assert.equal(await s.getSyncState('nope'), null);
});

test('close does not touch the caller connection', async () => {
  const { store: s, calls } = store();
  await s.close();
  assert.equal(calls.length, 0, 'the pool belongs to the caller');
});
