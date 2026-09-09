/**
 * Ingestion pipeline (spec §2).
 *
 * Repeatable and idempotent by construction: every stage is an upsert keyed by
 * a stable identity, and each returns counts so a second run can be asserted to
 * report zero inserted and zero updated.
 *
 * Providers are arguments, not imports, so the same pipeline runs against the
 * public API today and the partnership feed later.
 */

import type { PokemonCatalogProvider, PokemonPricingProvider } from './provider.ts';
import type { CatalogStore, PriceRow, UpsertResult, VariantRow } from './store.ts';
import { addUpsert, emptyUpsert, variantRowFrom } from './store.ts';
import { discoverVariants } from './variant.ts';
import { resolvePrice } from './price.ts';

export interface SyncLogger {
  info(msg: string): void;
  warn(msg: string): void;
}

export const consoleLogger: SyncLogger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(`! ${m}`),
};

/** Run `work` over `items` with bounded concurrency, preserving input order. */
async function pool<T, R>(items: T[], limit: number, work: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await work(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

const today = (now: Date) => now.toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */

export async function syncSets(
  provider: PokemonCatalogProvider,
  store: CatalogStore,
  log: SyncLogger = consoleLogger,
): Promise<UpsertResult> {
  log.info(`Fetching sets from ${provider.name}…`);
  const sets = await provider.listSets();
  log.info(`  ${sets.length} sets`);

  const result = await store.upsertSets(sets);
  await store.setSyncState({
    key: 'sets',
    lastRunAt: new Date().toISOString(),
    lastCursor: null,
    note: `${sets.length} sets from ${provider.name}`,
  });
  await store.close();
  return result;
}

export interface SyncCardsOptions {
  /** Limit to one set. Omit to sync every set already in the store. */
  setId?: string;
  pageSize?: number;
}

export async function syncCards(
  provider: PokemonCatalogProvider,
  store: CatalogStore,
  opts: SyncCardsOptions = {},
  log: SyncLogger = consoleLogger,
): Promise<{ cards: UpsertResult; variants: UpsertResult }> {
  const setIds = opts.setId
    ? [opts.setId]
    : (await store.listSets()).map((s) => s.id);

  if (setIds.length === 0) {
    throw new Error('No sets in the store. Run pokemon:sync:sets first.');
  }

  let cards = emptyUpsert();
  let variants = emptyUpsert();

  for (const setId of setIds) {
    let page = 1;
    let seen = 0;
    for (;;) {
      const res = await provider.listCards({ setId, page, pageSize: opts.pageSize ?? 250 });
      if (res.cards.length === 0) break;
      seen += res.cards.length;

      cards = addUpsert(cards, await store.upsertCards(res.cards));

      // Variants are derived here from metadata alone, so they exist before any
      // pricing run. sync:prices upgrades their confidence to `reported`.
      const rows: VariantRow[] = [];
      for (const card of res.cards) {
        for (const d of discoverVariants(card, null)) {
          rows.push(variantRowFrom(d.variant, card.id, d.confidence));
        }
      }
      variants = addUpsert(variants, await store.upsertVariants(rows));

      if (seen >= res.totalCount) break;
      page++;
    }
    log.info(`  ${setId}: ${seen} cards`);
    await store.setSyncState({
      key: `cards:${setId}`,
      lastRunAt: new Date().toISOString(),
      lastCursor: null,
      note: `${seen} cards`,
    });
    await store.close();
  }

  return { cards, variants };
}

export interface SyncPricesOptions {
  setId?: string;
  now?: Date;
  concurrency?: number;
}

export async function syncPrices(
  pricing: PokemonPricingProvider,
  store: CatalogStore,
  opts: SyncPricesOptions = {},
  log: SyncLogger = consoleLogger,
): Promise<{
  prices: UpsertResult;
  variants: UpsertResult;
  /** Cards the provider genuinely has no pricing for. */
  skipped: number;
  /** Cards whose price fetch errored. Their prices are missing, not absent. */
  failed: { cardId: string; error: string }[];
}> {
  const now = opts.now ?? new Date();
  const observedOn = today(now);
  const cards = await store.listCards(opts.setId);

  if (cards.length === 0) {
    throw new Error(
      opts.setId
        ? `No cards for set ${opts.setId}. Run pokemon:sync:cards first.`
        : 'No cards in the store. Run pokemon:sync:cards first.',
    );
  }

  log.info(`Pricing ${cards.length} cards as of ${observedOn}…`);

  const priceRows: PriceRow[] = [];
  const variantRows: VariantRow[] = [];
  const failed: { cardId: string; error: string }[] = [];
  let skipped = 0;

  await pool(cards, opts.concurrency ?? 4, async (card) => {
    let report;
    try {
      report = await pricing.getPrices(card.id);
    } catch (err) {
      // A transport failure is NOT "this card has no price". Recording it
      // separately is what stops a flaky API from silently shrinking the
      // catalog: without this, two runs disagree and neither looks wrong.
      failed.push({ cardId: card.id, error: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (!report) {
      skipped++;
      return;
    }

    for (const discovered of discoverVariants(card, report)) {
      variantRows.push(variantRowFrom(discovered.variant, card.id, discovered.confidence));

      const res = resolvePrice(discovered.variant, report, { source: pricing.name });
      if (!res.ok) {
        // Expected and fine: a variant the provider lists but does not price.
        // It is recorded as a variant but gets no price row, which keeps it out
        // of any pack pool that a snapshot would refuse to open anyway.
        skipped++;
        continue;
      }
      priceRows.push({ variantId: discovered.variant.variantId, observedOn, quote: res.quote });
    }
  });

  const variants = await store.upsertVariants(variantRows);
  const prices = await store.upsertPrices(priceRows);

  await store.setSyncState({
    key: opts.setId ? `prices:${opts.setId}` : 'prices',
    lastRunAt: now.toISOString(),
    lastCursor: observedOn,
    note: `${priceRows.length} priced, ${skipped} unpriced, ${failed.length} failed`,
  });
  await store.close();

  log.info(`  ${priceRows.length} variant prices, ${skipped} unpriced`);
  if (failed.length > 0) {
    log.warn(`${failed.length} cards failed to fetch — prices for these are MISSING, not absent:`);
    for (const f of failed.slice(0, 10)) log.warn(`    ${f.cardId}: ${f.error}`);
    if (failed.length > 10) log.warn(`    (+${failed.length - 10} more)`);
    log.warn('Re-run before trusting this data for pack pools.');
  }
  return { prices, variants, skipped, failed };
}

/* ------------------------------------------------------------------ */

export interface AssetIssue {
  kind: 'card-image' | 'set-logo' | 'set-symbol';
  id: string;
  url: string;
  status: number | string;
}

export interface VerifyAssetsReport {
  checked: number;
  ok: number;
  issues: AssetIssue[];
}

/**
 * Confirm every referenced asset actually resolves (spec §2).
 *
 * Run this before a pack goes live: a pool entry whose art 404s produces a
 * reveal with a blank card, which is the single worst failure this product can
 * have in front of a paying user.
 */
export async function verifyAssets(
  store: CatalogStore,
  opts: { setId?: string; concurrency?: number; fetchImpl?: typeof fetch } = {},
  log: SyncLogger = consoleLogger,
): Promise<VerifyAssetsReport> {
  const doFetch = opts.fetchImpl ?? fetch;
  const cards = await store.listCards(opts.setId);
  const sets = await store.listSets();

  const targets: AssetIssue[] = [];
  for (const c of cards) {
    targets.push({ kind: 'card-image', id: c.id, url: c.images.large, status: 0 });
  }
  for (const s of sets) {
    if (opts.setId && s.id !== opts.setId) continue;
    if (s.logoUrl) targets.push({ kind: 'set-logo', id: s.id, url: s.logoUrl, status: 0 });
    if (s.symbolUrl) targets.push({ kind: 'set-symbol', id: s.id, url: s.symbolUrl, status: 0 });
  }

  log.info(`Verifying ${targets.length} assets…`);
  const issues: AssetIssue[] = [];

  await pool(targets, opts.concurrency ?? 8, async (t) => {
    try {
      const res = await doFetch(t.url, { method: 'HEAD' });
      if (!res.ok) issues.push({ ...t, status: res.status });
    } catch (err) {
      issues.push({ ...t, status: err instanceof Error ? err.message : 'fetch failed' });
    }
  });

  return { checked: targets.length, ok: targets.length - issues.length, issues };
}
