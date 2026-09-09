/**
 * The collection model (spec §13): binder pages, duplicates, set completion.
 *
 * Reads the pack-opening ledger and the catalog read model. It never touches a
 * provider and never re-prices anything: the ledger is the record of what a
 * wallet actually pulled, and `openings.ts` states why those frozen values must
 * not be recomputed. The catalog's current price stays reachable on every entry
 * as `entry.variant.referenceValue`, so a "market value today" view is a display
 * decision the caller makes explicitly rather than one this module makes for it.
 *
 * The invariant that shapes every function here: a collection is a set of
 * VARIANTS, but set completion is measured in CARDS. Conflating the two is the
 * bug this file is designed around — count variants and a binder holding the
 * holo and the reverse holo of one Charmander reports two cards collected out of
 * a set that only contains one, i.e. completion above 100%.
 */

import type { StoredOpening } from './openings.ts';
import {
  numericPart,
  rarityRank,
  type CardListing,
  type CatalogIndex,
  type VariantListing,
} from './query.ts';

/* ------------------------------------------------------------------ *
 * Entries
 * ------------------------------------------------------------------ */

export interface CollectionEntry {
  /** The identity. One entry per variant, never per card. */
  readonly variantId: string;
  readonly card: CardListing;
  /**
   * Carried alongside the card because a binder slot has to render the foil
   * treatment and the "Reverse Holo" label. Without it two slots of one
   * Charmander are indistinguishable on screen and the correct behaviour —
   * two entries — looks like a duplication bug.
   */
  readonly variant: VariantListing;
  /**
   * Copies owned. Duplicates within a single rip count separately, matching
   * `OpeningLedger.countByVariant`; the two numbers feed the same counters and
   * would be a visible contradiction if they disagreed.
   */
  readonly count: number;
  readonly firstPulledAt: string;
  readonly lastPulledAt: string;
  /**
   * Highest frozen reference value across the copies owned — what the best of
   * these pulls was worth when it was pulled. Not the catalog's price today:
   * see the file header.
   */
  readonly bestReferenceValue: number;
}

export interface BuildCollectionOptions {
  /**
   * Called for a pulled variantId the catalog index does not contain. Such a
   * pull is dropped rather than rendered from a synthesized card, because a
   * placeholder in a binder is indistinguishable from a real slot. It happens
   * when the ledger outlives a catalog rebuild, so it is worth logging.
   */
  onUnknownVariant?: (variantId: string) => void;
}

interface Accumulator {
  count: number;
  firstPulledAt: string;
  lastPulledAt: string;
  bestReferenceValue: number;
}

/**
 * Aggregate a wallet's rips into binder entries.
 *
 * `openings` is expected to already be one wallet's rips (`listByWallet`); no
 * wallet filtering happens here, so passing the global feed aggregates the
 * whole world's pulls.
 *
 * Duplicates are counted per VARIANT, not per card. Pulling a normal Charmander
 * and a reverse holo Charmander is two entries with count 1, not one entry with
 * count 2 — they are different products with different prices, and the project's
 * central invariant is that identity is (set, number, finish, printing). Keying
 * this map on cardId would merge a $0.24 card into a $0.41 one and make the
 * binder claim a duplicate the wallet does not own.
 */
export function buildCollection(
  openings: readonly StoredOpening[],
  index: CatalogIndex,
  opts: BuildCollectionOptions = {},
): CollectionEntry[] {
  const acc = new Map<string, Accumulator>();

  for (const opening of openings) {
    for (const pulled of opening.cards) {
      if (!index.byVariantId.has(pulled.variantId)) {
        opts.onUnknownVariant?.(pulled.variantId);
        continue;
      }

      const prev = acc.get(pulled.variantId);
      if (!prev) {
        acc.set(pulled.variantId, {
          count: 1,
          firstPulledAt: opening.openedAt,
          lastPulledAt: opening.openedAt,
          bestReferenceValue: pulled.referenceValue,
        });
        continue;
      }

      prev.count += 1;
      // Rips arrive newest-first from the ledger, so min/max rather than
      // first/last seen. ISO-8601 UTC instants compare lexicographically, which
      // is why no Date parsing is needed (same reasoning as `newestFirst`).
      if (opening.openedAt < prev.firstPulledAt) prev.firstPulledAt = opening.openedAt;
      if (opening.openedAt > prev.lastPulledAt) prev.lastPulledAt = opening.openedAt;
      if (pulled.referenceValue > prev.bestReferenceValue) {
        prev.bestReferenceValue = pulled.referenceValue;
      }
    }
  }

  const entries: CollectionEntry[] = [];
  for (const [variantId, a] of acc) {
    const hit = index.byVariantId.get(variantId)!;
    entries.push({
      variantId,
      card: hit.card,
      variant: hit.variant,
      count: a.count,
      firstPulledAt: a.firstPulledAt,
      lastPulledAt: a.lastPulledAt,
      bestReferenceValue: a.bestReferenceValue,
    });
  }

  // Returned in canonical binder order rather than Map insertion order, so two
  // callers that pass the same rips in a different order get the same binder.
  return entries.sort(bySet);
}

/* ------------------------------------------------------------------ *
 * Sorting
 * ------------------------------------------------------------------ */

export type BinderSort = 'set' | 'value' | 'pull-date' | 'rarity';

/**
 * Canonical binder order: oldest set first, then collector number, the way a
 * physical binder is filled. `variantId` is the final tiebreak because two
 * variants of one card are otherwise equal on every field above, and an
 * unstable order there would reshuffle pages between renders.
 */
function bySet(a: CollectionEntry, b: CollectionEntry): number {
  return (
    (a.card.releaseDate ?? '').localeCompare(b.card.releaseDate ?? '') ||
    a.card.setId.localeCompare(b.card.setId) ||
    numericPart(a.card.number) - numericPart(b.card.number) ||
    a.card.number.localeCompare(b.card.number) ||
    a.variantId.localeCompare(b.variantId)
  );
}

/**
 * No null handling, unlike `sortCards`: `openPack` refuses to draw an unpriced
 * variant, so every owned entry has a real frozen value and the "unpriced sinks
 * to the bottom" case cannot arise here.
 */
function byValue(a: CollectionEntry, b: CollectionEntry): number {
  return b.bestReferenceValue - a.bestReferenceValue || bySet(a, b);
}

/** Most recently pulled first — the "what did I just hit" view. */
function byPullDate(a: CollectionEntry, b: CollectionEntry): number {
  return (
    b.lastPulledAt.localeCompare(a.lastPulledAt) ||
    b.firstPulledAt.localeCompare(a.firstPulledAt) ||
    bySet(a, b)
  );
}

/**
 * Rarest first, ties broken by value. `rarityRank` scores an unrecognized or
 * missing rarity below every known one, which is what this direction needs: a
 * sentinel above `Hyper Rare` would head the binder with every card from a set
 * whose rarity strings the ladder has not learned yet.
 */
function byRarity(a: CollectionEntry, b: CollectionEntry): number {
  return rarityRank(b.card.rarity) - rarityRank(a.card.rarity) || byValue(a, b);
}

const COMPARATORS = {
  set: bySet,
  value: byValue,
  'pull-date': byPullDate,
  rarity: byRarity,
} as const;

/** Sort a copy. Every comparator is total, so the result is fully deterministic. */
export function sortCollection(
  entries: readonly CollectionEntry[],
  sort: BinderSort = 'set',
): CollectionEntry[] {
  return [...entries].sort(COMPARATORS[sort] ?? bySet);
}

/* ------------------------------------------------------------------ *
 * Binder pages (spec §13)
 * ------------------------------------------------------------------ */

/** 3x3, the standard trading-card page. */
export const BINDER_PAGE_SIZE = 9;

/**
 * Upper bound on a caller-supplied page size, matching the cap `queryCards`
 * puts on its own. A binder page is a grid that gets rendered; an unbounded one
 * is a denial of service dressed up as a query parameter.
 */
export const MAX_BINDER_PAGE_SIZE = 200;

/**
 * `pageSize` reaches here from a query string, so it arrives as whatever
 * `Number()` made of user input. `Math.max(1, x)` does not clamp that:
 * `Math.max(1, NaN)` is NaN, which makes `pageCount` NaN and the page loop skip
 * entirely — the binder renders as zero pages, the exact "Page 1 of 0" state
 * the empty-page rule below exists to prevent, except now with cards in it.
 * `Number('Infinity')` is worse: `pageCount` comes out 1 and the slot-fill loop
 * pushes nulls until the heap dies. `Number.isFinite` rejects both.
 */
function clampPageSize(raw: number | undefined): number {
  const n = Math.floor(raw ?? BINDER_PAGE_SIZE);
  if (!Number.isFinite(n)) return BINDER_PAGE_SIZE;
  return Math.min(MAX_BINDER_PAGE_SIZE, Math.max(1, n));
}

export interface BinderPage {
  /** 1-based, so it can be rendered as "Page 2 of 5" without arithmetic. */
  readonly pageNumber: number;
  /**
   * Exactly `pageSize` long, always. A null is a real slot holding an empty
   * sleeve, not a missing element — the last page of a binder is a full grid
   * with gaps, and collapsing those gaps would reflow the page every time a
   * card is added.
   */
  readonly slots: readonly (CollectionEntry | null)[];
  /** Occupied slots; `slots.length - filled` sleeves are empty. */
  readonly filled: number;
}

export interface PaginateBinderOptions {
  pageSize?: number;
  sort?: BinderSort;
}

export function paginateBinder(
  entries: readonly CollectionEntry[],
  opts: PaginateBinderOptions = {},
): BinderPage[] {
  const pageSize = clampPageSize(opts.pageSize);
  const sorted = sortCollection(entries, opts.sort ?? 'set');

  // An empty collection is one empty page, not zero pages: a binder with no
  // cards still shows nine sleeves, and zero pages renders as "Page 1 of 0".
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));

  const pages: BinderPage[] = [];
  for (let p = 0; p < pageCount; p += 1) {
    const start = p * pageSize;
    const slots: (CollectionEntry | null)[] = [];
    for (let i = 0; i < pageSize; i += 1) slots.push(sorted[start + i] ?? null);
    pages.push({
      pageNumber: p + 1,
      slots,
      filled: Math.max(0, Math.min(pageSize, sorted.length - start)),
    });
  }
  return pages;
}

/* ------------------------------------------------------------------ *
 * Set completion
 * ------------------------------------------------------------------ */

export interface SetCompletion {
  readonly setId: string;
  readonly setName: string;
  /** Distinct CARDS owned in this set. */
  readonly collected: number;
  /** Distinct cards this set has in the catalog index. */
  readonly total: number;
  /** 0-100, one decimal, rounded down, and never above 100. */
  readonly percent: number;
}

/**
 * Per-set progress, for sets the wallet has actually pulled from. Sets it has
 * never touched are omitted: a list of every synced set at 0% is a browse
 * surface, not progress.
 *
 * `total` counts the distinct cards the catalog index holds for the set, not
 * `PokemonSet.total` or `printedTotal`. The catalog is frequently a synced
 * subset, and measuring against a number whose cards are not in the index makes
 * 100% unreachable and the whole figure meaningless.
 *
 * `collected` counts distinct CARDS, not variants. Owning the normal, the
 * reverse holo and the 1st edition of one Charmander is one card toward
 * completion; counting entries instead would let a wallet report 150% of a set
 * it has barely started.
 */
export function setCompletion(
  entries: readonly CollectionEntry[],
  index: CatalogIndex,
): SetCompletion[] {
  const totals = new Map<string, number>();
  for (const card of index.cards) {
    totals.set(card.setId, (totals.get(card.setId) ?? 0) + 1);
  }

  const names = new Map(index.sets.map((s) => [s.id, s.name]));

  // setId -> distinct cardIds owned. The Set is the whole mechanism: it is what
  // makes three variants of one Charmander count once.
  const owned = new Map<string, Set<string>>();
  for (const entry of entries) {
    const cards = owned.get(entry.card.setId);
    if (cards) cards.add(entry.card.cardId);
    else owned.set(entry.card.setId, new Set([entry.card.cardId]));
  }

  const rows: SetCompletion[] = [];
  for (const [setId, cardIds] of owned) {
    const total = totals.get(setId) ?? 0;
    const collected = cardIds.size;
    rows.push({
      setId,
      // The set row can lag the card rows during a sync, so fall back to the
      // name denormalized onto the card rather than rendering a bare id.
      setName: names.get(setId) ?? entrySetName(entries, setId) ?? setId,
      collected,
      total,
      // Guard the divide: `total` is 0 only if the index lost the cards these
      // entries point at, but 0/0 renders as NaN%, which is worse than 0%.
      // Rounded DOWN, so a binder one card short of a set can never show 100%.
      //
      // Capped at 100 for the other half of the same mismatch. `entries` and
      // `index` are separate arguments, so they can be built from two different
      // catalog snapshots — the same lag this function already tolerates for set
      // names. When the newer index holds FEWER cards for a set than the entries
      // reference, collected exceeds total and the honest arithmetic prints
      // 150%, overrunning the progress bar it renders into. `collected`/`total`
      // stay as measured so the mismatch is still visible in the numbers.
      percent: total === 0 ? 0 : Math.min(100, Math.floor((collected / total) * 1000) / 10),
    });
  }

  return rows.sort(
    (a, b) =>
      b.percent - a.percent || b.collected - a.collected || a.setName.localeCompare(b.setName),
  );
}

function entrySetName(entries: readonly CollectionEntry[], setId: string): string | null {
  return entries.find((e) => e.card.setId === setId)?.card.setName ?? null;
}

/* ------------------------------------------------------------------ *
 * Duplicates
 * ------------------------------------------------------------------ */

export interface DuplicateSummary {
  /** Entries with more than one copy, most-duplicated first. */
  readonly entries: readonly CollectionEntry[];
  /**
   * Surplus copies, i.e. sum of (count - 1). Three Charizards are two
   * duplicates, not three — the first copy is the collection, the rest are the
   * trade binder, and this number is what a trade view offers up.
   */
  readonly totalDuplicates: number;
  /** Combined best-pull value of those surplus copies. */
  readonly totalValue: number;
}

export function duplicateSummary(entries: readonly CollectionEntry[]): DuplicateSummary {
  const dupes = entries.filter((e) => e.count > 1);

  let totalDuplicates = 0;
  let totalValue = 0;
  for (const entry of dupes) {
    const surplus = entry.count - 1;
    totalDuplicates += surplus;
    totalValue += surplus * entry.bestReferenceValue;
  }

  return {
    entries: dupes.sort((a, b) => b.count - a.count || byValue(a, b)),
    totalDuplicates,
    // Currency amounts accumulated as floats drift; round back to cents rather
    // than surfacing 1794.3800000000001 (same treatment as `aggregateWalletStats`).
    totalValue: Math.round(totalValue * 100) / 100,
  };
}
