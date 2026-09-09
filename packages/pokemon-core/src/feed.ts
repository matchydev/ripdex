/**
 * The live rip feed (spec §19, "LIVE PULLS" / "WATCH LIVE").
 *
 * A read model over the ledger: it joins immutable `StoredOpening` records to
 * the catalog read model so a rip can be rendered as art plus a name, and it
 * does nothing else. Every number it surfaces comes from the stored rip, never
 * from the live catalog — `variant.referenceValue` is today's price, and the
 * feed is a record of what happened, so a Charizard that has since drifted to
 * $700 still reads as the $897 pull the user was shown. The `CardListing` and
 * `VariantListing` are joined in for presentation only (name, art, label).
 *
 * The join can miss: the ledger is append-only and permanent while the catalog
 * index is rebuilt from whatever the provider currently returns, so a variant
 * can be pulled today and absent from the index tomorrow. That is a drift
 * signal, not a rendering mode — `buildFeed` drops those rips and counts them
 * rather than emitting an event with a blank image and an empty name.
 */

import type { PackConfig } from './odds.ts';
import type { StoredOpening, StoredOpeningCard } from './openings.ts';
import type { CardListing, CatalogIndex, VariantListing } from './query.ts';
import { PullTier } from './tiers.ts';

/* ------------------------------------------------------------------ *
 * Prominence
 * ------------------------------------------------------------------ */

/**
 * How much visual weight a pull gets in the feed. Derived from the stored
 * tier rather than from a value threshold of its own: the tier bands are
 * configuration and will move with the token price, and a feed that classified
 * by raw dollars would silently disagree with the reveal choreography the user
 * just watched.
 */
export const FeedProminence = {
  Normal: 'normal',
  Notable: 'notable',
  Major: 'major',
} as const;
export type FeedProminence = (typeof FeedProminence)[keyof typeof FeedProminence];

export function prominenceFor(tier: PullTier): FeedProminence {
  switch (tier) {
    case PullTier.Grail:
    case PullTier.Tier4:
      return FeedProminence.Major;
    case PullTier.Tier3:
      return FeedProminence.Notable;
    default:
      return FeedProminence.Normal;
  }
}

/* ------------------------------------------------------------------ *
 * Wallet display
 * ------------------------------------------------------------------ */

const ELLIPSIS = '...';

export interface AbbreviateWalletOptions {
  /** Leading characters kept. Default 6, which covers "0x" + 4 hex. */
  lead?: number;
  /** Trailing characters kept. Default 4. */
  tail?: number;
}

/**
 * "0x71C7656EC7ab88b098defB751B7401B5f6d89F2b" -> "0x71C7...9F2b".
 *
 * Case is preserved exactly. EVM addresses carry an EIP-55 checksum in their
 * capitalization and base58 addresses are case-sensitive outright, so folding
 * case here would render an address that does not verify — and the ledger
 * matches wallets byte-for-byte (see the note in `JsonOpeningLedger.record`),
 * which means a folded display string can never be pasted back into a lookup.
 *
 * Short inputs are returned untouched: once a wallet is shorter than
 * lead + tail + the ellipsis, "abbreviating" it makes the string longer while
 * destroying characters. A test wallet like "0xAB" must survive intact.
 */
export function abbreviateWallet(wallet: string, opts: AbbreviateWalletOptions = {}): string {
  const lead = Math.max(1, opts.lead ?? 6);
  const tail = Math.max(1, opts.tail ?? 4);
  if (wallet.length <= lead + tail + ELLIPSIS.length) return wallet;
  return `${wallet.slice(0, lead)}${ELLIPSIS}${wallet.slice(-tail)}`;
}

/* ------------------------------------------------------------------ *
 * Relative time
 * ------------------------------------------------------------------ */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const ago = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

/**
 * "12 seconds ago", "3 minutes ago", "2 hours ago", "5 days ago".
 *
 * `now` is a parameter, not a `Date.now()` call, because this is the one piece
 * of the feed whose output changes without its input changing — passing the
 * clock in is what makes the boundaries testable.
 *
 * Two deliberate clamps:
 *  - Anything at or ahead of `now` renders as "just now" instead of
 *    "-3 seconds ago". Server clocks and stored records disagree by small
 *    amounts routinely (NTP drift, a record stamped by another node), and a
 *    negative duration in a live feed reads as a bug to every user who sees it.
 *  - Sub-second ages collapse into the same bucket, so a fresh rip never
 *    renders as "0 seconds ago" on the way to "1 second ago".
 *
 * The largest unit is days. The feed only ever shows recent rips; a "3 months
 * ago" bucket would imply a time range this surface never displays.
 */
export function relativeTime(iso: string, now: Date): string {
  const then = Date.parse(iso);
  const nowMs = now.getTime();
  // A corrupt timestamp is not a fresh one. It gets its own word rather than
  // "just now", which would float an unreadable record to the top of the
  // reader's mental ordering.
  if (!Number.isFinite(then) || !Number.isFinite(nowMs)) return 'recently';

  const delta = nowMs - then;
  if (Math.floor(delta / SECOND) <= 0) return 'just now';
  if (delta < MINUTE) return ago(Math.floor(delta / SECOND), 'second');
  if (delta < HOUR) return ago(Math.floor(delta / MINUTE), 'minute');
  if (delta < DAY) return ago(Math.floor(delta / HOUR), 'hour');
  return ago(Math.floor(delta / DAY), 'day');
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

export interface FeedEvent {
  readonly openingId: string;
  /** ISO instant. The event carries the instant, not a rendered "3 minutes
   *  ago": a page left open would freeze that string at build time, so the
   *  renderer calls `relativeTime` on every repaint instead. */
  readonly openedAt: string;
  /** Abbreviated for display. */
  readonly wallet: string;
  /** Full address. Kept because an abbreviation cannot be expanded back, and
   *  the tile links to the wallet's profile. */
  readonly walletAddress: string;
  /** Catalog join, for art, names and labels. Both listings carry TODAY's
   *  prices, not the rip's: `card.headlineValue` and `variant.referenceValue`
   *  are live figures and must never be rendered as what this pull was worth.
   *  The rip's own frozen value is the event's `referenceValue` below. */
  readonly card: CardListing;
  readonly variant: VariantListing;
  /** Frozen at rip time, from the ledger. Never null: a card cannot be drawn
   *  from an unpriced pool entry, so the feed has no "no price" state. */
  readonly referenceValue: number;
  readonly currency: string;
  /** As classified at rip time, against the tier config then in force. */
  readonly tier: PullTier;
  /** The published odds of this outcome, from the locked pool. */
  readonly probability: number;
  readonly packId: string;
  readonly packName: string;
  readonly prominence: FeedProminence;
  /** Reveal position of the featured card inside its rip. */
  readonly slot: number;
  /** Cards in the whole rip, so a tile can say "best of 5". */
  readonly cardsInRip: number;
}

export interface FeedResult {
  readonly events: FeedEvent[];
  /**
   * Openings dropped because not one of their cards resolved against the
   * catalog index. Counted across the whole input rather than only up to
   * `limit`: the number exists to make ledger/catalog drift visible to an
   * operator, and a count that stopped at the page boundary would hide it.
   *
   * Counted per openingId, not per input row, so a rip that arrives twice from
   * two concatenated sources reports one drift signal rather than two.
   */
  readonly skipped: number;
}

export interface BuildFeedOptions {
  /** Omit for unbounded. Applied AFTER unrenderable rips are dropped, so a
   *  limit of 20 yields 20 tiles rather than 20 minus the missing ones. */
  limit?: number;
  lead?: number;
  tail?: number;
}

/**
 * Newest first, tie-broken by openingId descending. This mirrors the ledger's
 * own ordering exactly so a feed built from `recent()` rows preserves the order
 * they arrived in and stays compatible with the ledger's `before` cursor.
 * ISO-8601 UTC strings compare lexicographically in time order, which holds
 * because the ledger only ever writes `toISOString()` output.
 */
function newestFirst(a: StoredOpening, b: StoredOpening): number {
  if (a.openedAt !== b.openedAt) return a.openedAt < b.openedAt ? 1 : -1;
  return a.openingId < b.openingId ? 1 : a.openingId > b.openingId ? -1 : 0;
}

interface Featured {
  readonly stored: StoredOpeningCard;
  readonly card: CardListing;
  readonly variant: VariantListing;
}

/**
 * One event per rip, featuring the rip's best pull.
 *
 * A rip of four commons and a Charizard is remembered as the Charizard; a feed
 * that emitted an event per card would bury it under its own filler and let a
 * single 12-card pack monopolise the rail. Ranking is by the FROZEN value, not
 * by today's catalog price, so the featured card cannot change months later.
 *
 * Cards whose variant is missing from the index are passed over individually.
 * Dropping the whole rip because one common is absent would lose a real grail
 * pull; only a rip with nothing left to show is skipped.
 */
function featuredCard(opening: StoredOpening, index: CatalogIndex): Featured | null {
  let best: Featured | null = null;
  for (const stored of opening.cards) {
    const hit = index.byVariantId.get(stored.variantId);
    if (!hit) continue;
    const better =
      best === null ||
      stored.referenceValue > best.stored.referenceValue ||
      // Ties keep the lower slot — the card the user saw flip first. Compared
      // on `slot` rather than on array position, so the pick does not depend on
      // the order an adapter happened to hydrate the cards in.
      (stored.referenceValue === best.stored.referenceValue && stored.slot < best.stored.slot);
    if (better) best = { stored, card: hit.card, variant: hit.variant };
  }
  return best;
}

export function buildFeed(
  openings: readonly StoredOpening[],
  index: CatalogIndex,
  packs: readonly PackConfig[],
  opts: BuildFeedOptions = {},
): FeedResult {
  const packNames = new Map(packs.map((p) => [p.id, p.name]));
  // Sorted here rather than trusted: callers legitimately concatenate sources
  // (a wallet's rips merged into the global feed), and the ledger only
  // guarantees ordering within one query.
  const rows = [...openings].sort(newestFirst);

  const events: FeedEvent[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const opening of rows) {
    // The concatenation this function sorts for guarantees openingId
    // collisions rather than merely permitting them: a wallet's own rips are
    // already inside `recent()`, so merging the two sources duplicates every
    // rip that wallet made. openingId is the ledger's identity — writing one
    // twice is a retry, not a second rip — and the same must hold on the read
    // side, or one pull renders as two tiles and burns two `limit` slots.
    if (seen.has(opening.openingId)) continue;
    seen.add(opening.openingId);

    const featured = featuredCard(opening, index);
    if (featured === null) {
      skipped++;
      continue;
    }
    const { stored, card, variant } = featured;
    events.push({
      openingId: opening.openingId,
      openedAt: opening.openedAt,
      wallet: abbreviateWallet(opening.wallet, opts),
      walletAddress: opening.wallet,
      card,
      variant,
      referenceValue: stored.referenceValue,
      currency: stored.currency,
      tier: stored.tier,
      probability: stored.probability,
      packId: opening.packId,
      // A pack retired from the live rotation still has rips in the ledger
      // forever. Falling back to the id keeps those rows readable instead of
      // rendering "undefined" for a pack that shipped and was pulled.
      packName: packNames.get(opening.packId) ?? opening.packId,
      prominence: prominenceFor(stored.tier),
      slot: stored.slot,
      cardsInRip: opening.cards.length,
    });
  }

  return {
    events: opts.limit === undefined ? events : events.slice(0, Math.max(0, opts.limit)),
    skipped,
  };
}

/* ------------------------------------------------------------------ *
 * WATCH LIVE cursor
 * ------------------------------------------------------------------ */

/**
 * The auto-cycling schedule, by prominence. Two of every four ticks feature a
 * major pull because that is what the mode is for, but normal and notable
 * pulls each hold a guaranteed slot — a purely value-ranked cursor would show
 * the same grail forever on a feed that contains one, which is both boring and
 * dishonest about what ripping actually looks like.
 */
const WATCH_PATTERN: readonly FeedProminence[] = [
  FeedProminence.Major,
  FeedProminence.Notable,
  FeedProminence.Major,
  FeedProminence.Normal,
];

/** Where a slot's tick goes when its own class is empty. */
const WATCH_FALLBACK: Readonly<Record<FeedProminence, readonly FeedProminence[]>> = {
  major: [FeedProminence.Major, FeedProminence.Notable, FeedProminence.Normal],
  notable: [FeedProminence.Notable, FeedProminence.Major, FeedProminence.Normal],
  normal: [FeedProminence.Normal, FeedProminence.Notable, FeedProminence.Major],
};

/**
 * Pick the event to feature on tick `index` of "WATCH LIVE".
 *
 * Pure and total: the same (events, index) always yields the same event, with
 * no randomness and no cursor state held between calls. That is what lets the
 * server render the first frame and the client keep cycling from the same
 * sequence without the two disagreeing about what is on screen.
 *
 * Within a prominence class the cursor advances one position each time that
 * class comes up, so a feed with three grails rotates through all three rather
 * than pinning the top one. The position is computed from the tick
 * arithmetically instead of by replaying every previous tick, so tick
 * 1,000,000 costs the same as tick 3.
 */
export function watchLiveCursor(events: readonly FeedEvent[], index: number): FeedEvent | null {
  if (events.length === 0) return null;

  const buckets = new Map<FeedProminence, FeedEvent[]>([
    [FeedProminence.Major, []],
    [FeedProminence.Notable, []],
    [FeedProminence.Normal, []],
  ]);
  // Feed order is preserved inside each bucket, so cycling a class walks it
  // newest-first. An event whose prominence is not one of the three known
  // classes lands in `normal` instead of being dropped: this feed crosses a
  // serialization boundary (the server renders the first frame, the client
  // cycles the rest), so a string from a different release must degrade to a
  // quieter tile, not empty a bucket the slot resolver has already committed
  // to — which threw a TypeError on every frame.
  const spillover = buckets.get(FeedProminence.Normal) as FeedEvent[];
  for (const event of events) (buckets.get(event.prominence) ?? spillover).push(event);

  const nonEmpty = (key: FeedProminence): boolean => (buckets.get(key)?.length ?? 0) > 0;
  // Resolved once per call: which class each slot actually lands on depends
  // only on which buckets are populated, which is fixed for a given feed.
  // `events` is non-empty, so every slot resolves.
  const resolved = WATCH_PATTERN.map(
    (want) => WATCH_FALLBACK[want].find(nonEmpty) as FeedProminence,
  );

  // A non-finite or negative tick is clamped rather than thrown: this drives an
  // animation loop, and a broken counter must not take the page down with it.
  const tick = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  const period = resolved.length;
  const slot = tick % period;
  const key = resolved[slot];

  let perCycle = 0;
  let beforeSlot = 0;
  for (let i = 0; i < period; i++) {
    if (resolved[i] !== key) continue;
    perCycle++;
    if (i < slot) beforeSlot++;
  }

  const bucket = buckets.get(key) as FeedEvent[];
  const visits = Math.floor(tick / period) * perCycle + beforeSlot;
  return bucket[visits % bucket.length];
}
