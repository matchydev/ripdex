/**
 * Filesystem catalog store (spec §2).
 *
 * A real, working store so `pnpm pokemon:sync:*` does something useful on day
 * one without provisioning a database. It implements exactly the `CatalogStore`
 * port, so swapping in Postgres later is one adapter and no caller changes.
 * `schema/postgres.sql` holds the equivalent relational shape.
 *
 * Not intended for serving production traffic — it holds the working set in
 * memory and rewrites whole files on flush.
 */

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import type { PokemonCard, PokemonSet } from '../types.ts';
import { contentHash } from '../snapshot.ts';
import {
  emptyUpsert,
  type CatalogStore,
  type PriceRow,
  type SyncState,
  type UpsertResult,
  type VariantRow,
} from '../store.ts';

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

/** Write via a temp file + rename so an interrupted sync cannot truncate data. */
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, path);
}

/**
 * Upsert into a keyed map, classifying each row by whether it actually changed.
 * Change detection is a content hash, which is what makes a repeat run report
 * everything as unchanged.
 */
function upsertInto<T>(
  target: Map<string, T>,
  rows: T[],
  keyOf: (row: T) => string,
): { result: UpsertResult; dirty: boolean } {
  const result = emptyUpsert();
  let dirty = false;

  for (const row of rows) {
    const key = keyOf(row);
    const existing = target.get(key);
    if (existing === undefined) {
      target.set(key, row);
      result.inserted++;
      dirty = true;
    } else if (contentHash(existing) !== contentHash(row)) {
      target.set(key, row);
      result.updated++;
      dirty = true;
    } else {
      result.unchanged++;
    }
  }
  return { result, dirty };
}

interface Files {
  sets: string;
  cards: string;
  variants: string;
  prices: string;
  syncState: string;
}

export class JsonCatalogStore implements CatalogStore {
  readonly name = 'json';

  private readonly files: Files;
  private loaded = false;
  private dirty = new Set<keyof Files>();

  private sets = new Map<string, PokemonSet>();
  private cards = new Map<string, PokemonCard>();
  private variants = new Map<string, VariantRow>();
  /** Keyed by `${variantId}@${observedOn}` so one day is one row. */
  private prices = new Map<string, PriceRow>();
  private syncState = new Map<string, SyncState>();

  // Declared explicitly rather than as a constructor parameter property: those
  // emit code, so Node's strip-only TypeScript support rejects them.
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
    this.files = {
      sets: join(root, 'sets.json'),
      cards: join(root, 'cards.json'),
      variants: join(root, 'variants.json'),
      prices: join(root, 'prices.json'),
      syncState: join(root, 'sync-state.json'),
    };
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    const [sets, cards, variants, prices, state] = await Promise.all([
      readJson<PokemonSet[]>(this.files.sets, []),
      readJson<PokemonCard[]>(this.files.cards, []),
      readJson<VariantRow[]>(this.files.variants, []),
      readJson<PriceRow[]>(this.files.prices, []),
      readJson<SyncState[]>(this.files.syncState, []),
    ]);
    this.sets = new Map(sets.map((s) => [s.id, s]));
    this.cards = new Map(cards.map((c) => [c.id, c]));
    this.variants = new Map(variants.map((v) => [v.variantId, v]));
    this.prices = new Map(prices.map((p) => [`${p.variantId}@${p.observedOn}`, p]));
    this.syncState = new Map(state.map((s) => [s.key, s]));
    this.loaded = true;
  }

  async upsertSets(rows: PokemonSet[]): Promise<UpsertResult> {
    await this.load();
    const { result, dirty } = upsertInto(this.sets, rows, (r) => r.id);
    if (dirty) this.dirty.add('sets');
    return result;
  }

  async upsertCards(rows: PokemonCard[]): Promise<UpsertResult> {
    await this.load();
    // `source.fetchedAt` changes on every fetch and would make every run report
    // an update, so it is excluded from the comparison by normalizing it to the
    // value already stored for an otherwise-identical card.
    const normalized = rows.map((row) => {
      const existing = this.cards.get(row.id);
      if (!existing) return row;
      const candidate = { ...row, source: existing.source };
      return contentHash(candidate) === contentHash(existing) ? existing : row;
    });
    const { result, dirty } = upsertInto(this.cards, normalized, (r) => r.id);
    if (dirty) this.dirty.add('cards');
    return result;
  }

  async upsertVariants(rows: VariantRow[]): Promise<UpsertResult> {
    await this.load();
    // Confidence ratchets up only. sync:cards can only ever derive `inferred`
    // variants, so without this a cards run after a prices run would downgrade
    // every `reported` variant and quietly disqualify it from pack pools.
    const ratcheted = rows.map((row) => {
      const existing = this.variants.get(row.variantId);
      return existing?.confidence === 'reported' && row.confidence === 'inferred'
        ? { ...row, confidence: 'reported' as const }
        : row;
    });
    const { result, dirty } = upsertInto(this.variants, ratcheted, (r) => r.variantId);
    if (dirty) this.dirty.add('variants');
    return result;
  }

  async upsertPrices(rows: PriceRow[]): Promise<UpsertResult> {
    await this.load();
    const { result, dirty } = upsertInto(
      this.prices,
      rows,
      (r) => `${r.variantId}@${r.observedOn}`,
    );
    if (dirty) this.dirty.add('prices');
    return result;
  }

  async listSets(): Promise<PokemonSet[]> {
    await this.load();
    return [...this.sets.values()].sort((a, b) =>
      (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''),
    );
  }

  async listCards(setId?: string): Promise<PokemonCard[]> {
    await this.load();
    const all = [...this.cards.values()];
    return setId ? all.filter((c) => c.setId === setId) : all;
  }

  async listVariants(cardId?: string): Promise<VariantRow[]> {
    await this.load();
    const all = [...this.variants.values()];
    return cardId ? all.filter((v) => v.cardId === cardId) : all;
  }

  async latestPrices(variantIds?: string[]): Promise<Map<string, PriceRow>> {
    await this.load();
    const wanted = variantIds ? new Set(variantIds) : null;
    const out = new Map<string, PriceRow>();
    for (const row of this.prices.values()) {
      if (wanted && !wanted.has(row.variantId)) continue;
      const held = out.get(row.variantId);
      if (!held || row.observedOn > held.observedOn) out.set(row.variantId, row);
    }
    return out;
  }

  async priceHistory(variantId: string): Promise<PriceRow[]> {
    await this.load();
    return [...this.prices.values()]
      .filter((r) => r.variantId === variantId)
      .sort((a, b) => a.observedOn.localeCompare(b.observedOn));
  }

  async getSyncState(key: string): Promise<SyncState | null> {
    await this.load();
    return this.syncState.get(key) ?? null;
  }

  async setSyncState(state: SyncState): Promise<void> {
    await this.load();
    this.syncState.set(state.key, state);
    this.dirty.add('syncState');
  }

  async close(): Promise<void> {
    if (this.dirty.size === 0) return;
    const jobs: Promise<void>[] = [];
    if (this.dirty.has('sets')) jobs.push(writeJsonAtomic(this.files.sets, [...this.sets.values()]));
    if (this.dirty.has('cards')) jobs.push(writeJsonAtomic(this.files.cards, [...this.cards.values()]));
    if (this.dirty.has('variants')) jobs.push(writeJsonAtomic(this.files.variants, [...this.variants.values()]));
    if (this.dirty.has('prices')) jobs.push(writeJsonAtomic(this.files.prices, [...this.prices.values()]));
    if (this.dirty.has('syncState')) jobs.push(writeJsonAtomic(this.files.syncState, [...this.syncState.values()]));
    await Promise.all(jobs);
    this.dirty.clear();
  }
}
