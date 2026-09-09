/**
 * Postgres catalog store (spec §2).
 *
 * The relational twin of JsonCatalogStore, written against `schema/postgres.sql`
 * — that file is the authority on table and column names, this one only maps
 * onto it. Same port, same observable behaviour, so swapping stores is a
 * configuration change and no caller moves.
 *
 * No driver is imported. `SqlClient` is the two-method shape a `pg.Pool`
 * already has, so the caller owns the connection, the pool sizing and the
 * lifetime, and this package keeps its zero-dependency guarantee:
 *
 *     import { Pool } from 'pg';
 *     const store = new PostgresCatalogStore(new Pool({ connectionString }));
 *
 * Three decisions worth explaining before reading the SQL:
 *
 * 1. Every batch travels as ONE jsonb parameter (`jsonb_to_recordset`) rather
 *    than as a generated `($1,$2),($3,$4)` tuple list. It keeps the statement
 *    text constant (so Postgres can reuse the plan), keeps the parameter count
 *    at 1 instead of rows×columns (the wire protocol caps out at 65535), and it
 *    is the only encoding that carries `subtypes text[]` and `attacks jsonb`
 *    through intact — a text[] of text[] would have to be rectangular, and card
 *    metadata is not.
 *
 * 2. inserted/updated/unchanged is computed server-side, in the same statement
 *    as the write. Classifying in JS would mean a SELECT before every upsert:
 *    twice the round trips and a race between the read and the write.
 *
 * 3. "unchanged" is decided by comparing the pre-write row (the `prior` CTE,
 *    which sees the statement's snapshot, i.e. the state before the INSERT)
 *    against the incoming row. Without that a repeat sync would report every
 *    row as updated and §2's idempotency claim would be unobservable.
 */

import type { PokemonCard, PokemonSet } from '../types.ts';
import type { PriceQuote } from '../price.ts';
import {
  addUpsert,
  emptyUpsert,
  type CatalogStore,
  type PriceRow,
  type SyncState,
  type UpsertResult,
  type VariantRow,
} from '../store.ts';

/**
 * The slice of a database driver this store needs. `pg.Pool` and `pg.Client`
 * both satisfy it structurally — pass one in, no adapter, no import.
 */
export interface SqlClient {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

/* ------------------------------------------------------------------ *
 * SQL construction
 *
 * The fragments below interpolate COLUMN NAMES from the constant lists in this
 * file, never a value. Every value reaches Postgres as a bound parameter; there
 * is no code path where a setId, cardId or variantId is concatenated into
 * statement text.
 * ------------------------------------------------------------------ */

const qualify = (alias: string, cols: readonly string[]): string[] =>
  cols.map((c) => `${alias}.${c}`);

const rowsDistinct = (left: readonly string[], right: readonly string[]): string =>
  `(${left.join(', ')}) IS DISTINCT FROM (${right.join(', ')})`;

const setFromExcluded = (cols: readonly string[]): string =>
  cols.map((c) => `${c} = excluded.${c}`).join(',\n    ');

/**
 * The tail every upsert shares.
 *
 * `xmax = 0` on the RETURNING row is the standard test for "this tuple was
 * inserted rather than updated by ON CONFLICT". It normally agrees with the
 * `prior` CTE — a key absent from `prior` did not exist to be updated — and
 * where they disagree, xmax is the one telling the truth: if a concurrent
 * transaction committed the same key after this statement took its snapshot,
 * ON CONFLICT sees that row and updates while `prior` still shows nothing. The
 * row then falls through to the changed-vs-nothing comparison and counts as an
 * update, which is what actually happened.
 */
const countTail = (key: readonly string[], changed: string): string => {
  const on = key.join(', ');
  return `SELECT
  count(*) FILTER (WHERE u.was_insert)                          AS inserted,
  count(*) FILTER (WHERE NOT u.was_insert AND (${changed}))     AS updated,
  count(*) FILTER (WHERE NOT u.was_insert AND NOT (${changed})) AS unchanged
FROM upserted u
JOIN input i USING (${on})
LEFT JOIN prior p USING (${on})`;
};

/* ----------------------------------------------------------- sets */

const SET_COLS = [
  'name', 'series', 'symbol_url', 'logo_url', 'release_date', 'total', 'printed_total',
] as const;

const UPSERT_SETS = `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
    set_id text, name text, series text, symbol_url text, logo_url text,
    release_date date, total integer, printed_total integer
  )
),
prior AS (SELECT t.* FROM pokemon_set t JOIN input i USING (set_id)),
upserted AS (
  INSERT INTO pokemon_set AS t (set_id, ${SET_COLS.join(', ')}, updated_at)
  SELECT i.set_id, ${qualify('i', SET_COLS).join(', ')}, now() FROM input i
  ON CONFLICT (set_id) DO UPDATE SET
    ${setFromExcluded(SET_COLS)},
    updated_at = CASE
      WHEN ${rowsDistinct(qualify('t', SET_COLS), qualify('excluded', SET_COLS))}
      THEN now() ELSE t.updated_at END
  RETURNING t.set_id, (xmax = 0) AS was_insert
)
${countTail(['set_id'], rowsDistinct(qualify('p', SET_COLS), qualify('i', SET_COLS)))}`;

/* ---------------------------------------------------------- cards */

// source_fetched_at is deliberately absent: it moves on every fetch and would
// make each run report the whole catalog as updated. It is written only when
// something else about the card actually changed (see the CASE below), which
// keeps the stored row byte-identical across a repeat sync.
const CARD_COLS = [
  'set_id', 'name', 'supertype', 'subtypes', 'types', 'hp', 'evolves_from', 'evolves_to',
  'rules', 'attacks', 'weaknesses', 'resistances', 'retreat_cost', 'converted_retreat_cost',
  'number', 'artist', 'rarity', 'flavor_text', 'national_pokedex_numbers', 'legalities',
  'image_small', 'image_large', 'source_provider',
] as const;

const UPSERT_CARDS = `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
    card_id text, set_id text, name text, supertype text, subtypes text[], types text[],
    hp integer, evolves_from text, evolves_to text[], rules text[], attacks jsonb,
    weaknesses jsonb, resistances jsonb, retreat_cost text[], converted_retreat_cost integer,
    number text, artist text, rarity text, flavor_text text,
    national_pokedex_numbers integer[], legalities jsonb, image_small text, image_large text,
    source_provider text, source_fetched_at timestamptz
  )
),
prior AS (SELECT t.* FROM pokemon_card t JOIN input i USING (card_id)),
upserted AS (
  INSERT INTO pokemon_card AS t (card_id, ${CARD_COLS.join(', ')}, source_fetched_at)
  SELECT i.card_id, ${qualify('i', CARD_COLS).join(', ')}, i.source_fetched_at FROM input i
  ON CONFLICT (card_id) DO UPDATE SET
    ${setFromExcluded(CARD_COLS)},
    source_fetched_at = CASE
      WHEN ${rowsDistinct(qualify('t', CARD_COLS), qualify('excluded', CARD_COLS))}
      THEN excluded.source_fetched_at ELSE t.source_fetched_at END
  RETURNING t.card_id, (xmax = 0) AS was_insert
)
${countTail(['card_id'], rowsDistinct(qualify('p', CARD_COLS), qualify('i', CARD_COLS)))}`;

/* ------------------------------------------------------- variants */

const VARIANT_IDENTITY_COLS = ['card_id', 'set_id', 'number', 'finish', 'printing'] as const;
const VARIANT_COLS = [...VARIANT_IDENTITY_COLS, 'confidence'] as const;

// Confidence ratchets upward only. sync:cards can only ever derive `inferred`
// variants, so without this a cards run after a prices run would downgrade
// every confirmed variant — and the pack_pool_entry trigger in postgres.sql
// would then start rejecting pools that were previously legal.
const RATCHET_STORED =
  `CASE WHEN t.confidence = 'reported' THEN 'reported' ELSE excluded.confidence END`;
// Same rule expressed against the pre-write row, so a downgrade attempt is
// classified as unchanged rather than as an update that never happened.
const RATCHET_INCOMING =
  `CASE WHEN p.confidence = 'reported' THEN 'reported' ELSE i.confidence END`;

const UPSERT_VARIANTS = `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
    variant_id text, card_id text, set_id text, number text,
    finish text, printing text, confidence text
  )
),
prior AS (SELECT t.* FROM pokemon_card_variant t JOIN input i USING (variant_id)),
upserted AS (
  INSERT INTO pokemon_card_variant AS t (variant_id, ${VARIANT_COLS.join(', ')})
  SELECT i.variant_id, ${qualify('i', VARIANT_COLS).join(', ')} FROM input i
  ON CONFLICT (variant_id) DO UPDATE SET
    ${setFromExcluded(VARIANT_IDENTITY_COLS)},
    confidence = ${RATCHET_STORED}
  RETURNING t.variant_id, (xmax = 0) AS was_insert
)
${countTail(
  ['variant_id'],
  rowsDistinct(qualify('p', VARIANT_COLS), [
    ...qualify('i', VARIANT_IDENTITY_COLS),
    RATCHET_INCOMING,
  ]),
)}`;

/* --------------------------------------------------------- prices */

const PRICE_COLS = [
  'low', 'mid', 'high', 'market', 'reference_value', 'basis', 'currency', 'source',
  'source_url', 'source_updated_at',
] as const;

// The money columns are rounded to the column's own scale INSIDE the input CTE.
// Otherwise a quote of 0.245 would store as 0.25 and then compare unequal to
// the 0.245 arriving on the next run, reporting an update forever.
const UPSERT_PRICES = `
WITH input AS (
  SELECT
    variant_id, observed_on,
    low::numeric(12,2) AS low, mid::numeric(12,2) AS mid, high::numeric(12,2) AS high,
    market::numeric(12,2) AS market, reference_value::numeric(12,2) AS reference_value,
    basis, currency, source, source_url, source_updated_at
  FROM jsonb_to_recordset($1::jsonb) AS x(
    variant_id text, observed_on date, low numeric, mid numeric, high numeric,
    market numeric, reference_value numeric, basis text, currency text, source text,
    source_url text, source_updated_at timestamptz
  )
),
prior AS (
  SELECT t.* FROM pokemon_price_observation t JOIN input i USING (variant_id, observed_on)
),
upserted AS (
  INSERT INTO pokemon_price_observation AS t (variant_id, observed_on, ${PRICE_COLS.join(', ')})
  SELECT i.variant_id, i.observed_on, ${qualify('i', PRICE_COLS).join(', ')} FROM input i
  ON CONFLICT (variant_id, observed_on) DO UPDATE SET
    ${setFromExcluded(PRICE_COLS)}
  RETURNING t.variant_id, t.observed_on, (xmax = 0) AS was_insert
)
${countTail(
  ['variant_id', 'observed_on'],
  rowsDistinct(qualify('p', PRICE_COLS), qualify('i', PRICE_COLS)),
)}`;

/* ---------------------------------------------------------- reads */

// DATE columns are rendered with to_char rather than handed to the driver as a
// JS Date: `new Date('1999-01-09')` is UTC midnight, printed back in a negative
// offset it becomes 1999-01-08, and a set silently slips a day every read.
const SELECT_SETS = `
SELECT set_id, name, series, symbol_url, logo_url,
       to_char(release_date, 'YYYY-MM-DD') AS release_date,
       total, printed_total
FROM pokemon_set
ORDER BY release_date ASC NULLS FIRST, set_id`;

const CARD_SELECT_LIST = `c.card_id, ${qualify('c', CARD_COLS).join(', ')}, c.source_fetched_at,
       s.name AS set_name, s.series AS set_series, s.symbol_url AS set_symbol_url,
       s.logo_url AS set_logo_url,
       to_char(s.release_date, 'YYYY-MM-DD') AS set_release_date,
       s.total AS set_total`;

// Inner join: pokemon_card.set_id is a FK, so the set always exists, and the
// denormalized set fields on PokemonCard are not nullable.
// Collector number sorts lexically because it is text — "SV107" and "TG12" have
// no numeric order to sort by.
const SELECT_CARDS = `
SELECT ${CARD_SELECT_LIST}
FROM pokemon_card c
JOIN pokemon_set s ON s.set_id = c.set_id
WHERE $1::text IS NULL OR c.set_id = $1::text
ORDER BY c.set_id, c.number`;

const SELECT_VARIANTS = `
SELECT variant_id, ${VARIANT_COLS.join(', ')}
FROM pokemon_card_variant
WHERE $1::text IS NULL OR card_id = $1::text
ORDER BY variant_id`;

const PRICE_SELECT_LIST = `variant_id, to_char(observed_on, 'YYYY-MM-DD') AS observed_on,
       ${PRICE_COLS.join(', ')}`;

// One row per variant, chosen by DISTINCT ON — the index
// price_observation_recent_idx (variant_id, observed_on DESC) serves this order
// directly. A null filter means "every variant"; an empty array means none.
const SELECT_LATEST_PRICES = `
SELECT DISTINCT ON (variant_id) ${PRICE_SELECT_LIST}
FROM pokemon_price_observation
WHERE $1::text[] IS NULL OR variant_id = ANY($1::text[])
ORDER BY variant_id, observed_on DESC`;

const SELECT_PRICE_HISTORY = `
SELECT ${PRICE_SELECT_LIST}
FROM pokemon_price_observation
WHERE variant_id = $1::text
ORDER BY observed_on ASC`;

const SELECT_SYNC_STATE = `
SELECT key, last_run_at, last_cursor, note FROM sync_state WHERE key = $1::text`;

const UPSERT_SYNC_STATE = `
INSERT INTO sync_state (key, last_run_at, last_cursor, note)
VALUES ($1::text, $2::timestamptz, $3::text, $4::text)
ON CONFLICT (key) DO UPDATE SET
  last_run_at = excluded.last_run_at,
  last_cursor = excluded.last_cursor,
  note = excluded.note`;

/* ------------------------------------------------------------------ *
 * Row mapping
 * ------------------------------------------------------------------ */

/** NUMERIC arrives as a string (the driver refuses to lose precision to float). */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** TIMESTAMPTZ arrives as a Date; the model carries ISO-8601 strings. */
function isoOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

/**
 * Guard for NOT NULL columns. Throwing beats coercing: a missing
 * reference_value that defaulted to 0 would render as a free card rather than
 * as "no price", which is the one thing §16 forbids.
 */
function need<T>(v: T | null | undefined, column: string): T {
  if (v === null || v === undefined) {
    throw new Error(`postgres-store: ${column} is NOT NULL but came back empty`);
  }
  return v;
}

function toSet(r: any): PokemonSet {
  return {
    id: r.set_id,
    name: r.name,
    series: r.series,
    symbolUrl: r.symbol_url ?? null,
    logoUrl: r.logo_url ?? null,
    releaseDate: r.release_date ?? null,
    total: numOrNull(r.total),
    printedTotal: numOrNull(r.printed_total),
  };
}

function toCard(r: any): PokemonCard {
  return {
    id: r.card_id,
    name: r.name,
    supertype: r.supertype,
    subtypes: r.subtypes ?? [],
    types: r.types ?? [],
    hp: numOrNull(r.hp),
    evolvesFrom: r.evolves_from ?? null,
    evolvesTo: r.evolves_to ?? [],
    rules: r.rules ?? [],
    attacks: r.attacks ?? [],
    weaknesses: r.weaknesses ?? [],
    resistances: r.resistances ?? [],
    retreatCost: r.retreat_cost ?? [],
    convertedRetreatCost: numOrNull(r.converted_retreat_cost),
    setId: r.set_id,
    setName: r.set_name,
    setSeries: r.set_series,
    setSymbolUrl: r.set_symbol_url ?? null,
    setLogoUrl: r.set_logo_url ?? null,
    setReleaseDate: r.set_release_date ?? null,
    setTotal: numOrNull(r.set_total),
    number: r.number,
    artist: r.artist ?? null,
    rarity: r.rarity ?? null,
    flavorText: r.flavor_text ?? null,
    nationalPokedexNumbers: r.national_pokedex_numbers ?? [],
    legalities: r.legalities ?? {},
    images: { small: r.image_small, large: r.image_large },
    source: {
      provider: r.source_provider,
      fetchedAt: need(isoOrNull(r.source_fetched_at), 'pokemon_card.source_fetched_at'),
    },
  };
}

function toVariantRow(r: any): VariantRow {
  return {
    variantId: r.variant_id,
    cardId: r.card_id,
    setId: r.set_id,
    number: r.number,
    finish: r.finish,
    printing: r.printing,
    confidence: r.confidence,
  };
}

function toPriceRow(r: any): PriceRow {
  const quote: PriceQuote = {
    variantId: r.variant_id,
    low: numOrNull(r.low),
    mid: numOrNull(r.mid),
    high: numOrNull(r.high),
    market: numOrNull(r.market),
    referenceValue: need(
      numOrNull(r.reference_value),
      'pokemon_price_observation.reference_value',
    ),
    basis: r.basis as PriceQuote['basis'],
    currency: r.currency,
    source: r.source,
    sourceUrl: r.source_url ?? null,
    sourceUpdatedAt: isoOrNull(r.source_updated_at),
  };
  return { variantId: r.variant_id, observedOn: r.observed_on, quote };
}

/** count() is bigint, and the driver hands bigint back as a string. */
function toUpsertResult(row: any): UpsertResult {
  return {
    inserted: Number(row?.inserted ?? 0),
    updated: Number(row?.updated ?? 0),
    unchanged: Number(row?.unchanged ?? 0),
  };
}

/**
 * Last write wins, matching the Map-based store. Postgres additionally requires
 * it: "ON CONFLICT DO UPDATE command cannot affect row a second time" aborts
 * the entire statement if one batch carries the same key twice, and a provider
 * page that repeats a card would otherwise fail the whole sync.
 */
function dedupe<T>(rows: readonly T[], keyOf: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(keyOf(row), row);
  return [...byKey.values()];
}

export interface PostgresCatalogStoreOptions {
  /** Rows per statement. A set sync writes hundreds; this bounds each payload. */
  batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 500;

export class PostgresCatalogStore implements CatalogStore {
  readonly name = 'postgres';

  // Declared and assigned in the body rather than as constructor parameter
  // properties: those emit code, and Node's strip-only TypeScript rejects them.
  private readonly client: SqlClient;
  private readonly batchSize: number;

  constructor(client: SqlClient, options: PostgresCatalogStoreOptions = {}) {
    this.client = client;
    this.batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  }

  /**
   * Run one upsert statement over the rows in slices.
   *
   * Each slice is its own transaction. That is deliberate: a `SqlClient` may be
   * a pool, where consecutive queries land on different connections, so a
   * BEGIN issued here would not cover the next call. An interrupted sync
   * therefore leaves a prefix applied — harmless, because every write is an
   * idempotent upsert and the next run converges.
   */
  private async upsertBatched(sql: string, rows: unknown[]): Promise<UpsertResult> {
    let total = emptyUpsert();
    for (let i = 0; i < rows.length; i += this.batchSize) {
      const slice = rows.slice(i, i + this.batchSize);
      const { rows: counted } = await this.client.query(sql, [JSON.stringify(slice)]);
      total = addUpsert(total, toUpsertResult(counted[0]));
    }
    return total;
  }

  async upsertSets(sets: PokemonSet[]): Promise<UpsertResult> {
    if (sets.length === 0) return emptyUpsert();
    const payload = dedupe(sets, (s) => s.id).map((s) => ({
      set_id: s.id,
      name: s.name,
      series: s.series,
      symbol_url: s.symbolUrl,
      logo_url: s.logoUrl,
      release_date: s.releaseDate,
      total: s.total,
      printed_total: s.printedTotal,
    }));
    return this.upsertBatched(UPSERT_SETS, payload);
  }

  async upsertCards(cards: PokemonCard[]): Promise<UpsertResult> {
    if (cards.length === 0) return emptyUpsert();
    const payload = dedupe(cards, (c) => c.id).map((c) => ({
      card_id: c.id,
      set_id: c.setId,
      name: c.name,
      supertype: c.supertype,
      subtypes: c.subtypes,
      types: c.types,
      hp: c.hp,
      evolves_from: c.evolvesFrom,
      evolves_to: c.evolvesTo,
      rules: c.rules,
      attacks: c.attacks,
      weaknesses: c.weaknesses,
      resistances: c.resistances,
      retreat_cost: c.retreatCost,
      converted_retreat_cost: c.convertedRetreatCost,
      number: c.number,
      artist: c.artist,
      rarity: c.rarity,
      flavor_text: c.flavorText,
      national_pokedex_numbers: c.nationalPokedexNumbers,
      legalities: c.legalities,
      image_small: c.images.small,
      image_large: c.images.large,
      source_provider: c.source.provider,
      source_fetched_at: c.source.fetchedAt,
    }));
    return this.upsertBatched(UPSERT_CARDS, payload);
  }

  async upsertVariants(rows: VariantRow[]): Promise<UpsertResult> {
    if (rows.length === 0) return emptyUpsert();
    // The ratchet itself lives in UPSERT_VARIANTS: doing it here would need a
    // read of the current confidence first, and two clients racing on the same
    // variant could still write a downgrade between the read and the write.
    const payload = dedupe(rows, (r) => r.variantId).map((r) => ({
      variant_id: r.variantId,
      card_id: r.cardId,
      set_id: r.setId,
      number: r.number,
      finish: r.finish,
      printing: r.printing,
      confidence: r.confidence,
    }));
    return this.upsertBatched(UPSERT_VARIANTS, payload);
  }

  async upsertPrices(rows: PriceRow[]): Promise<UpsertResult> {
    if (rows.length === 0) return emptyUpsert();
    // Keyed by (variant_id, observed_on): one observation per variant per day,
    // so re-running a sync overwrites today rather than appending a duplicate.
    // The quote's own variantId is ignored in favour of the row's — they are
    // the same identity, and the row is what the primary key is built from.
    // NUL joins the two halves because it is the one byte a variantId cannot
    // contain, so no pair of distinct rows can collide into one key.
    const payload = dedupe(rows, (r) => `${r.variantId}\0${r.observedOn}`).map((r) => ({
      variant_id: r.variantId,
      observed_on: r.observedOn,
      low: r.quote.low,
      mid: r.quote.mid,
      high: r.quote.high,
      market: r.quote.market,
      reference_value: r.quote.referenceValue,
      basis: r.quote.basis,
      currency: r.quote.currency,
      source: r.quote.source,
      source_url: r.quote.sourceUrl,
      source_updated_at: r.quote.sourceUpdatedAt,
    }));
    return this.upsertBatched(UPSERT_PRICES, payload);
  }

  async listSets(): Promise<PokemonSet[]> {
    const { rows } = await this.client.query(SELECT_SETS, []);
    return rows.map(toSet);
  }

  async listCards(setId?: string): Promise<PokemonCard[]> {
    const { rows } = await this.client.query(SELECT_CARDS, [setId ?? null]);
    return rows.map(toCard);
  }

  async listVariants(cardId?: string): Promise<VariantRow[]> {
    const { rows } = await this.client.query(SELECT_VARIANTS, [cardId ?? null]);
    return rows.map(toVariantRow);
  }

  async latestPrices(variantIds?: string[]): Promise<Map<string, PriceRow>> {
    const { rows } = await this.client.query(SELECT_LATEST_PRICES, [variantIds ?? null]);
    const out = new Map<string, PriceRow>();
    for (const r of rows) {
      const row = toPriceRow(r);
      out.set(row.variantId, row);
    }
    return out;
  }

  async priceHistory(variantId: string): Promise<PriceRow[]> {
    const { rows } = await this.client.query(SELECT_PRICE_HISTORY, [variantId]);
    return rows.map(toPriceRow);
  }

  async getSyncState(key: string): Promise<SyncState | null> {
    const { rows } = await this.client.query(SELECT_SYNC_STATE, [key]);
    const r = rows[0];
    if (!r) return null;
    return {
      key: r.key,
      lastRunAt: need(isoOrNull(r.last_run_at), 'sync_state.last_run_at'),
      lastCursor: r.last_cursor ?? null,
      note: r.note ?? null,
    };
  }

  async setSyncState(state: SyncState): Promise<void> {
    await this.client.query(UPSERT_SYNC_STATE, [
      state.key,
      state.lastRunAt,
      state.lastCursor,
      state.note,
    ]);
  }

  /**
   * Nothing is buffered — every method above has already committed by the time
   * it resolves — and the connection belongs to whoever constructed the client,
   * so this does not close their pool out from under them.
   */
  async close(): Promise<void> {}
}
