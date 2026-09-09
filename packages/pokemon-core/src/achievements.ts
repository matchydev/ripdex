/**
 * Achievements (spec §18).
 *
 * Two rules shape this file.
 *
 * 1. Achievements read the LEDGER, never the market. Every value and every
 *    probability comes from the StoredOpening — the figures that were frozen at
 *    rip time and shown to the user — so a Charizard that drifts from $900 to
 *    $400 next month cannot silently revoke Grail Hunter. An achievement is a
 *    record of something that happened; re-deriving it from today's prices would
 *    make it a record of something that is currently true, which is a different
 *    and much worse product. The catalog index is joined in only for immutable
 *    card facts (name, types, dex numbers, set), and that join is deliberately
 *    typed as `CardFacts` so a predicate structurally *cannot* reach
 *    `headlineValue` — the same trick `openPack` uses to make draw-then-price
 *    impossible rather than merely discouraged.
 *
 * 2. Evaluation is one chronological pass. The context is built once and every
 *    achievement folds over the same entry stream, so a wallet with thousands of
 *    rips against dozens of achievements costs O(pulls × achievements) with a
 *    single scan. The obvious way to find `unlockedAt` — re-testing each
 *    achievement against every prefix of the wallet — is quadratic in rips, so
 *    instead each achievement unlocks in-stream and records the timestamp of the
 *    rip that crossed its threshold.
 */

import type { CardListing, CatalogIndex } from './query.ts';
import type { StoredOpening, StoredOpeningCard } from './openings.ts';
import { PullTier } from './tiers.ts';
import {
  Finish,
  Printing,
  parseVariantId,
  type CanonicalPokemonCardVariant,
} from './variant.ts';

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

/**
 * The catalog metadata an achievement may see.
 *
 * The omissions are the point: `headlineValue`, `variants` and everything else
 * price-bearing on `CardListing` is today's market, and a predicate that read
 * one would produce a badge that un-earns itself on the next price sync. Values
 * come from `entry.card`, which is frozen.
 */
export type CardFacts = Pick<
  CardListing,
  | 'cardId'
  | 'name'
  | 'setId'
  | 'setName'
  | 'setSeries'
  | 'number'
  | 'rarity'
  | 'artist'
  | 'types'
  | 'nationalPokedexNumbers'
  | 'year'
>;

/** One pulled card, denormalized against its rip and the catalog. */
export interface AchievementEntry {
  readonly openingId: string;
  readonly openedAt: string;
  readonly wallet: string;
  readonly packId: string;
  /** The immutable record: referenceValue, probability and tier as of the rip. */
  readonly card: StoredOpeningCard;
  /** Parsed once here so predicates can read finish/printing without re-parsing. */
  readonly variant: CanonicalPokemonCardVariant;
  /** Null when the catalog no longer knows the card. Predicates must tolerate it. */
  readonly facts: CardFacts | null;
}

export interface AchievementContext {
  /** Deduplicated and sorted oldest first. */
  readonly openings: readonly StoredOpening[];
  readonly index: CatalogIndex;
  /** Every pull, oldest rip first and slot order within a rip. */
  readonly entries: readonly AchievementEntry[];
  /**
   * setId -> number of cards the catalog holds for that set. Precomputed
   * because set-completion targets would otherwise re-scan the catalog once per
   * achievement per rip.
   */
  readonly setCardCounts: ReadonlyMap<string, number>;
}

/* ------------------------------------------------------------------ *
 * Definitions
 * ------------------------------------------------------------------ */

export interface AchievementDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Progress needed to unlock. `targetFor` may override it per bucket. */
  readonly target: number;

  /**
   * The predicate: does this pull count? Evaluated against the precomputed
   * context, once per pull, in chronological order.
   */
  qualifies(entry: AchievementEntry, ctx: AchievementContext): boolean;

  /**
   * Entries sharing a key advance progress once — "50 unique cards" rather than
   * "50 pulls". Omit to count every qualifying pull.
   */
  dedupeKey?(entry: AchievementEntry, ctx: AchievementContext): string;

  /** How far one qualifying pull advances progress. Default 1; use for value sums. */
  advance?(entry: AchievementEntry, ctx: AchievementContext): number;

  /**
   * Partition progress, e.g. by set for "complete a set". Each bucket races
   * toward its own target and the leading one is what the progress bar shows.
   * Returning null excludes the pull.
   */
  bucket?(entry: AchievementEntry, ctx: AchievementContext): string | null;

  /**
   * Data-dependent target. Called with the bucket, or null for the bucketless
   * target (which is also the target shown to a wallet with no progress yet).
   * Returning null falls back to `target`.
   */
  targetFor?(bucket: string | null, ctx: AchievementContext): number | null;
}

export interface AchievementProgress {
  /** Progress so far, clamped to `target` once unlocked. */
  readonly current: number;
  /** Always finite and > 0, so a progress bar can divide by it. */
  readonly target: number;
}

export interface AchievementStatus {
  readonly def: AchievementDef;
  readonly unlocked: boolean;
  /** openedAt of the rip that first satisfied it. Null while locked. */
  readonly unlockedAt: string | null;
  /** Present whether locked or not — the bar is the point of a locked badge. */
  readonly progress: AchievementProgress;
}

/* ------------------------------------------------------------------ *
 * Context building
 * ------------------------------------------------------------------ */

/**
 * Oldest first, tie-broken by openingId. ISO-8601 UTC strings from
 * `toISOString()` sort lexicographically in time order, so no Date parsing is
 * needed — the ledger relies on the same property in the other direction.
 */
function chronological(a: StoredOpening, b: StoredOpening): number {
  if (a.openedAt !== b.openedAt) return a.openedAt < b.openedAt ? -1 : 1;
  return a.openingId < b.openingId ? -1 : a.openingId > b.openingId ? 1 : 0;
}

/**
 * Catalog facts for a pulled card.
 *
 * The variant index is tried first because the variant is the identity. Falling
 * back to the card row is safe here and only here: `CardFacts` carries no price,
 * so this cannot degrade into a cross-variant price fallback. It exists for
 * catalog drift — a variant row dropped by a re-sync while the card remains.
 */
function factsFor(index: CatalogIndex, card: StoredOpeningCard): CardFacts | null {
  const hit = index.byVariantId.get(card.variantId);
  if (hit) return hit.card;
  return index.byCardId.get(card.cardId) ?? null;
}

function countCardsPerSet(index: CatalogIndex): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of index.cards) counts.set(card.setId, (counts.get(card.setId) ?? 0) + 1);
  return counts;
}

/**
 * Precompute everything every achievement needs, once.
 *
 * `openings` may arrive newest-first (that is how the ledger reads) and may
 * contain the same rip twice: a caller paging with `before` can legitimately
 * re-fetch a rip, because one millisecond can hold more than one and that cursor
 * cannot split the tie. Both are fixed here — a double-counted rip is a wrong
 * badge, not a rounding error.
 */
export function buildAchievementContext(
  openings: readonly StoredOpening[],
  index: CatalogIndex,
): AchievementContext {
  const unique = new Map<string, StoredOpening>();
  for (const opening of openings) {
    if (!unique.has(opening.openingId)) unique.set(opening.openingId, opening);
  }
  const ordered = [...unique.values()].sort(chronological);

  const entries: AchievementEntry[] = [];
  for (const opening of ordered) {
    // Slot order inside a rip: every card in one pack shares a timestamp, so
    // slot is the only tiebreak that matches the order the user watched.
    const cards = [...opening.cards].sort((a, b) => a.slot - b.slot);
    for (const card of cards) {
      entries.push({
        openingId: opening.openingId,
        openedAt: opening.openedAt,
        wallet: opening.wallet,
        packId: opening.packId,
        card,
        // Throws on a malformed id rather than resolving it to the cheap
        // default printing. A stored rip can only hold ids minted by `openPack`,
        // so a failure here is corrupt ledger data, not a display edge case.
        variant: parseVariantId(card.variantId),
        facts: factsFor(index, card),
      });
    }
  }

  return { openings: ordered, index, entries, setCardCounts: countCardsPerSet(index) };
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

interface DefState {
  readonly def: AchievementDef;
  /** Dedupe keys already counted, bucket-scoped when the def buckets. */
  readonly seen: Set<string> | null;
  /** bucket -> progress. Null for bucketless defs. */
  readonly buckets: Map<string, number> | null;
  /** Memoized targets, keyed by bucket ('' for the bucketless target). */
  readonly targets: Map<string, number>;
  /** Running total for a bucketless def. */
  total: number;
  /** What the bar shows: the bucket closest to completion. */
  lead: { value: number; target: number } | null;
  unlocked: boolean;
  unlockedAt: string | null;
}

/**
 * A target of 0, NaN or Infinity would render as a full bar, a NaN percentage or
 * an empty one — all three are worse than an honest fallback, so clamp to
 * something a UI can divide by.
 */
function safeTarget(raw: number): number {
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function targetOf(state: DefState, bucket: string | null, ctx: AchievementContext): number {
  const key = bucket ?? '';
  const cached = state.targets.get(key);
  if (cached !== undefined) return cached;
  const target = safeTarget(state.def.targetFor?.(bucket, ctx) ?? state.def.target);
  state.targets.set(key, target);
  return target;
}

/** Currency sums accumulate float error; report cents, not 1000.0000000000001. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

function fold(state: DefState, entry: AchievementEntry, ctx: AchievementContext): void {
  const def = state.def;
  if (!def.qualifies(entry, ctx)) return;

  // A null bucket from a bucketing def means the pull belongs to no partition;
  // drop it rather than folding it into a shared one.
  const bucket = def.bucket ? def.bucket(entry, ctx) : null;
  if (def.bucket && bucket === null) return;

  if (def.dedupeKey && state.seen) {
    // Scoped by bucket: one card completes one set, and the same card seen
    // again — a second copy, or another finish of it — must not advance twice.
    const key = `${bucket ?? ''}\0${def.dedupeKey(entry, ctx)}`;
    if (state.seen.has(key)) return;
    state.seen.add(key);
  }

  const step = def.advance ? def.advance(entry, ctx) : 1;
  // A non-finite step would poison the accumulator permanently, which is a
  // badge that can never unlock rather than a single bad pull.
  if (!Number.isFinite(step) || step <= 0) return;

  let value: number;
  if (bucket === null || state.buckets === null) {
    state.total += step;
    value = state.total;
  } else {
    value = (state.buckets.get(bucket) ?? 0) + step;
    state.buckets.set(bucket, value);
  }

  const target = targetOf(state, bucket, ctx);
  if (value >= target) {
    state.unlocked = true;
    // Chronological order makes this the FIRST rip that satisfied the
    // achievement, which is the one the user remembers earning it on.
    state.unlockedAt = entry.openedAt;
    // Clamp: "$8,400 / $1,000" is not a progress bar.
    state.lead = { value: target, target };
    return;
  }

  // Closest to completion is a fraction, not a count: 5 of 6 cards is nearer
  // than 40 of 102.
  if (state.lead === null || value / target > state.lead.value / state.lead.target) {
    state.lead = { value, target };
  }
}

/**
 * Evaluate every definition in a single pass over the context.
 *
 * Once an achievement unlocks it stops folding: it cannot un-unlock, and its
 * progress is pinned at the target, so continuing to count would only produce
 * "12 / 1".
 */
export function evaluateAchievements(
  ctx: AchievementContext,
  defs: readonly AchievementDef[] = DEFAULT_ACHIEVEMENTS,
): AchievementStatus[] {
  const states: DefState[] = defs.map((def) => ({
    def,
    seen: def.dedupeKey ? new Set<string>() : null,
    buckets: def.bucket ? new Map<string, number>() : null,
    targets: new Map<string, number>(),
    total: 0,
    lead: null,
    unlocked: false,
    unlockedAt: null,
  }));

  for (const entry of ctx.entries) {
    for (const state of states) {
      if (state.unlocked) continue;
      fold(state, entry, ctx);
    }
  }

  return states.map((state) => {
    // No qualifying pull yet: zero against the bucketless target, so an empty
    // wallet still renders a real bar instead of 0/0.
    const lead = state.lead ?? { value: 0, target: targetOf(state, null, ctx) };
    return {
      def: state.def,
      unlocked: state.unlocked,
      unlockedAt: state.unlockedAt,
      progress: { current: round2(lead.value), target: round2(lead.target) },
    };
  });
}

/* ------------------------------------------------------------------ *
 * Shipped achievements
 * ------------------------------------------------------------------ */

const KANTO_DEX_MAX = 151;
const CHARIZARD_DEX = 6;

const isKanto = (facts: CardFacts | null): boolean =>
  facts !== null && facts.nationalPokedexNumbers.some((n) => n >= 1 && n <= KANTO_DEX_MAX);

/**
 * The smallest set the catalog knows, used as the "complete a set" target for a
 * wallet that has not started one. It is the most achievable target, and it
 * keeps an empty wallet's bar meaningful instead of pointing at a 200-card set.
 */
function smallestSetSize(ctx: AchievementContext): number | null {
  let smallest: number | null = null;
  for (const count of ctx.setCardCounts.values()) {
    if (count > 0 && (smallest === null || count < smallest)) smallest = count;
  }
  return smallest;
}

export const DEFAULT_ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'FIRST_RIP',
    name: 'First Rip',
    description: 'Open your first pack.',
    target: 1,
    qualifies: () => true,
    // Keyed by rip, not by card: a five-card pack is one rip.
    dedupeKey: (entry) => entry.openingId,
  },
  {
    id: 'CENTURION',
    name: 'Centurion',
    description: 'Open 100 packs.',
    target: 100,
    qualifies: () => true,
    dedupeKey: (entry) => entry.openingId,
  },
  {
    id: 'FIRE_STARTER',
    name: 'Fire Starter',
    description: 'Pull a Fire-type card.',
    target: 1,
    qualifies: (entry) => entry.facts?.types.includes('Fire') ?? false,
  },
  {
    id: 'CHARIZARD_HUNTER',
    name: 'Charizard Hunter',
    description: 'Pull any Charizard.',
    target: 1,
    // Dex number first: the printed name varies wildly ("Dark Charizard",
    // "Charizard ex", "M Charizard EX") and a name match alone would miss or
    // over-match. The name check is the fallback for cards the provider left
    // without a dex number. Neither is an identity claim — the pull is still
    // recorded and counted per variant.
    qualifies: (entry) => {
      const facts = entry.facts;
      if (!facts) return false;
      return (
        facts.nationalPokedexNumbers.includes(CHARIZARD_DEX) ||
        facts.name.toLowerCase().includes('charizard')
      );
    },
  },
  {
    id: 'KANTO_COLLECTOR',
    name: 'Kanto Collector',
    description: 'Collect 50 different cards from the original 151 Pokémon.',
    target: 50,
    qualifies: (entry) => isKanto(entry.facts),
    // Card-level on purpose, and one of the few places it is right: this counts
    // binder slots, so the holo and the reverse holo of one Pikachu are one
    // card. The pull itself is still stored and priced per variant — this
    // dedupe key is a display-level grouping choice, not an identity claim.
    dedupeKey: (entry) => entry.card.cardId,
  },
  {
    id: 'GRAIL_HUNTER',
    name: 'Grail Hunter',
    description: 'Pull a Grail-tier card, worth $500 or more at rip time.',
    target: 1,
    // The tier frozen on the record, not `classifyTier` over a current price.
    // Re-classifying would let both a market move and a tier-config change
    // revoke a badge the user already earned.
    qualifies: (entry) => entry.card.tier === PullTier.Grail,
  },
  {
    id: 'ONE_IN_A_THOUSAND',
    name: 'One in a Thousand',
    description: 'Hit a card whose published odds were 0.1% or better.',
    target: 1,
    // Probability comes from the pack's published odds table at rip time, so
    // reweighting the pool later cannot retroactively grant or revoke this.
    // The `> 0` guard matters: `openPack` writes 0 when an outcome is missing
    // from the odds table, and an absent probability is unknown, not
    // infinitely rare.
    qualifies: (entry) => entry.card.probability > 0 && entry.card.probability <= 0.001,
  },
  {
    id: 'FULL_SET',
    name: 'Set Completionist',
    description: 'Own every card RIPDEX catalogs from a single set.',
    // Fallback only; the real target is the set's card count.
    target: 1,
    qualifies: (entry) => entry.facts !== null,
    bucket: (entry) => entry.facts?.setId ?? null,
    dedupeKey: (entry) => entry.card.cardId,
    targetFor: (bucket, ctx) =>
      bucket === null ? smallestSetSize(ctx) : (ctx.setCardCounts.get(bucket) ?? null),
  },
  {
    id: 'HOLO_HOARDER',
    name: 'Holo Hoarder',
    description: 'Pull 25 holofoil cards.',
    target: 25,
    // Finish is variant identity, read off the parsed id — the non-foil print
    // of the same card is a different product and does not count.
    qualifies: (entry) => entry.variant.finish === Finish.Holofoil,
  },
  {
    id: 'FIRST_EDITION',
    name: 'Edition One',
    description: 'Pull a 1st Edition printing.',
    target: 1,
    // The clearest statement of the central invariant: the unlimited print of
    // the exact same card, same set, same collector number, does not qualify.
    qualifies: (entry) => entry.variant.printing === Printing.FirstEdition,
  },
  {
    id: 'VAULT_BUILDER',
    name: 'Vault Builder',
    description: 'Accumulate $1,000 in pulled reference value.',
    target: 1000,
    qualifies: () => true,
    // Sums the frozen values, which is what makes the total stable. Summing
    // today's prices would make this badge flicker with the market.
    advance: (entry) => entry.card.referenceValue,
  },
];

export const ACHIEVEMENTS_BY_ID: ReadonlyMap<string, AchievementDef> = new Map(
  DEFAULT_ACHIEVEMENTS.map((def) => [def.id, def] as const),
);
