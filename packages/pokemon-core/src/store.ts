/**
 * The catalog read/write port (spec §2).
 *
 * External APIs are data providers; this store is the application read layer.
 * Nothing in a request path should ever call a provider — it reads from here.
 *
 * Every write is an upsert that reports what actually changed, so "repeatable
 * and idempotent" is observable rather than asserted: run a sync twice and the
 * second run must report zero inserted and zero updated.
 */

import type { PokemonCard, PokemonSet } from './types.ts';
import type { PriceQuote } from './price.ts';
import type { CanonicalPokemonCardVariant } from './variant.ts';

export interface UpsertResult {
  inserted: number;
  updated: number;
  unchanged: number;
}

export function emptyUpsert(): UpsertResult {
  return { inserted: 0, updated: 0, unchanged: 0 };
}

export function addUpsert(a: UpsertResult, b: UpsertResult): UpsertResult {
  return {
    inserted: a.inserted + b.inserted,
    updated: a.updated + b.updated,
    unchanged: a.unchanged + b.unchanged,
  };
}

/** A variant that exists for a card, materialized so pack pools can reference it. */
export interface VariantRow {
  variantId: string;
  cardId: string;
  setId: string;
  number: string;
  finish: string;
  printing: string;
  confidence: 'reported' | 'inferred';
}

/**
 * One observation of a variant's price.
 *
 * Rows are append-only per (variantId, observedOn) so §8's 24h/7d/30d movement
 * has real history to read. Re-running a sync on the same day overwrites that
 * day's row rather than appending a duplicate, which keeps the job idempotent
 * without freezing the series.
 */
export interface PriceRow {
  variantId: string;
  /** ISO date, YYYY-MM-DD. One row per variant per day. */
  observedOn: string;
  quote: PriceQuote;
}

/** Bookkeeping so a sync can resume and so runs are auditable. */
export interface SyncState {
  key: string;
  lastRunAt: string;
  lastCursor: string | null;
  note: string | null;
}

export interface CatalogStore {
  readonly name: string;

  upsertSets(sets: PokemonSet[]): Promise<UpsertResult>;
  upsertCards(cards: PokemonCard[]): Promise<UpsertResult>;
  /**
   * Implementations MUST ratchet `confidence` upward only: an incoming
   * `inferred` row must not overwrite a stored `reported` one. sync:cards can
   * only derive `inferred` variants, so without this rule running it after
   * sync:prices would downgrade every confirmed variant.
   */
  upsertVariants(rows: VariantRow[]): Promise<UpsertResult>;
  upsertPrices(rows: PriceRow[]): Promise<UpsertResult>;

  listSets(): Promise<PokemonSet[]>;
  listCards(setId?: string): Promise<PokemonCard[]>;
  listVariants(cardId?: string): Promise<VariantRow[]>;

  /** Most recent price observation per variant. */
  latestPrices(variantIds?: string[]): Promise<Map<string, PriceRow>>;
  /** Full observed series for one variant, oldest first. */
  priceHistory(variantId: string): Promise<PriceRow[]>;

  getSyncState(key: string): Promise<SyncState | null>;
  setSyncState(state: SyncState): Promise<void>;

  /** Flush any buffered writes. */
  close(): Promise<void>;
}

export function variantRowFrom(
  variant: CanonicalPokemonCardVariant,
  cardId: string,
  confidence: 'reported' | 'inferred',
): VariantRow {
  return {
    variantId: variant.variantId,
    cardId,
    setId: variant.setId,
    number: variant.number,
    finish: variant.finish,
    printing: variant.printing,
    confidence,
  };
}
