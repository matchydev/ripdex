/**
 * The pack-opening ledger (spec §17; `pack_opening` / `pack_opening_card` in
 * schema/postgres.sql).
 *
 * One row per rip, and the rip is the unit of truth for everything downstream:
 * the collection binder, the live feed and achievements all read from here
 * rather than recomputing anything from a pack config or a current price.
 *
 * A stored rip is IMMUTABLE. `referenceValue` is the price that was frozen in
 * the price snapshot at the moment the pack was opened, and it must never be
 * recomputed from current market data: the user was shown that number, the
 * odds table published that number, and a $900 Charizard that drifts to $700
 * next month does not retroactively make last month's pull a $700 pull. The
 * ledger therefore stores values, not references to a live price lookup.
 *
 * Records are addressed by `openingId`, which `openPack` derives as a content
 * hash of (pack config hash, price snapshot hash, clientSeed, nonce). Writing
 * the same rip twice is consequently a retry, not a second rip, and must be a
 * no-op — `countByVariant` feeds "times pulled" counters and achievement
 * thresholds, so a double-count is a wrong badge, not a rounding error.
 */

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import { contentHash, type PackOpenResult } from './snapshot.ts';
import type { PullTier } from './tiers.ts';
import { parseVariantId } from './variant.ts';

/* ------------------------------------------------------------------ *
 * Record shape
 * ------------------------------------------------------------------ */

export interface StoredOpeningCard {
  /** The identity. Everything downstream keys off this, never off cardId. */
  readonly variantId: string;
  /**
   * Denormalized catalog pointer, for joining to art and names without
   * re-parsing. It is deliberately NOT a key: the holo and the reverse holo of
   * one card share a cardId and have different prices, so grouping a binder by
   * cardId is a display choice, never an identity claim.
   */
  readonly cardId: string;
  /** Published odds for this outcome at rip time, from the locked pool. */
  readonly probability: number;
  /**
   * Frozen at rip time. Never null: `openPack` refuses to run when any pool
   * entry is unpriced, so a card cannot be drawn without a price. This is why
   * the field is non-nullable here while the catalog read model's is nullable —
   * an unpriced variant never reaches a rip, so "0 means unknown" has no way in.
   */
  readonly referenceValue: number;
  readonly currency: string;
  readonly tier: PullTier;
  /** 0-based position in the pack: draw order, which is also reveal order. */
  readonly slot: number;
}

export interface StoredOpeningVerification {
  readonly serverSeedHash: string;
  readonly clientSeed: string;
  readonly nonce: number;
  readonly priceSnapshotId: string;
  readonly packConfigSnapshotId: string;
  /**
   * The snapshot content hashes are carried alongside the ids because
   * `openingId` is derived from the hashes, not the ids. Without them a stored
   * rip can be looked up but not independently re-verified.
   */
  readonly priceSnapshotHash: string;
  readonly packConfigSnapshotHash: string;
  /** Populated only after the server seed is rotated and revealed. */
  readonly serverSeed: string | null;
}

export interface StoredOpening {
  readonly openingId: string;
  readonly openedAt: string;
  readonly wallet: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly cards: readonly StoredOpeningCard[];
  readonly verification: StoredOpeningVerification;
}

/* ------------------------------------------------------------------ *
 * Port
 * ------------------------------------------------------------------ */

export interface RecordOpeningResult {
  /** False when the openingId was already present, i.e. this was a retry. */
  readonly stored: boolean;
  /** The authoritative record — the previously stored one on a retry. */
  readonly opening: StoredOpening;
}

export interface ListOpeningsOptions {
  /** Omit for unbounded. Request paths should always pass one. */
  limit?: number;
  /**
   * Exclusive upper bound on `openedAt`, as an ISO instant. Ordering is
   * (openedAt desc, openingId desc), so a caller paging with the last row's
   * `openedAt` should drop openingIds it has already seen: one millisecond can
   * hold more than one rip, and this cursor cannot split a tie.
   */
  before?: string;
}

export interface BestPull {
  readonly openingId: string;
  readonly openedAt: string;
  readonly card: StoredOpeningCard;
}

export interface WalletStats {
  readonly rips: number;
  /**
   * Sum of frozen reference values across every card the wallet has pulled.
   * No FX conversion happens here — packs are single-currency today, and a
   * wallet that somehow ripped across two currencies would need a grouped
   * total, which is a stats-layer concern, not a ledger one.
   */
  readonly totalReferenceValue: number;
  /** Highest single card ever pulled. Ties keep the earliest rip. */
  readonly bestPull: BestPull | null;
  readonly firstRipAt: string | null;
  readonly lastRipAt: string | null;
}

/**
 * The ledger port. Reads are intentionally narrow: these six queries are
 * exactly what the binder, the feed and achievements need, so an adapter over
 * `pack_opening` can serve each of them with one index.
 */
export interface OpeningLedger {
  readonly name: string;

  /** Idempotent by openingId. A retry must return `stored: false`. */
  record(opening: StoredOpening): Promise<RecordOpeningResult>;

  /** Newest first. */
  listByWallet(wallet: string, opts?: ListOpeningsOptions): Promise<StoredOpening[]>;
  /** Global feed, newest first. */
  recent(limit: number): Promise<StoredOpening[]>;

  /** Times this variant has been pulled, counting duplicates inside one pack. */
  countByVariant(variantId: string): Promise<number>;
  /** Rips containing this variant, newest first; one entry per rip. */
  listByVariant(variantId: string, limit: number): Promise<StoredOpening[]>;

  walletStats(wallet: string): Promise<WalletStats>;

  /** Flush any buffered writes. */
  close(): Promise<void>;
}

/** Thrown when one openingId is presented with two different sets of contents. */
export class LedgerConflictError extends Error {}

/* ------------------------------------------------------------------ *
 * Conversion
 * ------------------------------------------------------------------ */

/**
 * Catalog card ids are minted by the provider as `${setId}-${number}` (see
 * `mapCard`), and a variantId carries both parts, so the id is derivable
 * without a catalog read. `parseVariantId` throws on a malformed id rather
 * than returning a plausible-looking wrong one.
 */
export function cardIdForVariant(variantId: string): string {
  const v = parseVariantId(variantId);
  return `${v.setId}-${v.number}`;
}

export interface FromOpenResultOptions {
  /** Override for catalogs that do not mint ids as `${setId}-${number}`. */
  cardIdFor?: (variantId: string) => string;
}

/**
 * Project a `PackOpenResult` onto the persisted record.
 *
 * The quote is flattened to (referenceValue, currency) rather than embedded
 * whole: the ledger's job is to preserve what the user was shown, and keeping
 * the full quote invites a later reader to treat `market`/`mid` as live
 * figures. The originating snapshot id is retained for anyone who needs the
 * complete pricing context.
 */
export function fromOpenResult(
  result: PackOpenResult,
  wallet: string,
  opts: FromOpenResultOptions = {},
): StoredOpening {
  const cardIdFor = opts.cardIdFor ?? cardIdForVariant;

  return freezeOpening({
    openingId: result.openingId,
    openedAt: result.openedAt,
    wallet,
    packId: result.packId,
    packVersion: result.packVersion,
    // Array index is the slot: `drawPack` returns cards in draw order, and for
    // the `slots` distribution model that order is the slot order itself.
    cards: result.cards.map((card, slot) => ({
      variantId: card.variantId,
      cardId: cardIdFor(card.variantId),
      probability: card.probability,
      referenceValue: card.quote.referenceValue,
      currency: card.quote.currency,
      tier: card.tier,
      slot,
    })),
    verification: {
      serverSeedHash: result.verification.serverSeedHash,
      clientSeed: result.verification.clientSeed,
      nonce: result.verification.nonce,
      priceSnapshotId: result.verification.priceSnapshotId,
      packConfigSnapshotId: result.verification.packConfigSnapshotId,
      priceSnapshotHash: result.verification.priceSnapshotHash,
      packConfigSnapshotHash: result.verification.packConfigSnapshotHash,
      serverSeed: result.verification.serverSeed,
    },
  });
}

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

/**
 * Pure aggregation over a set of rips, so an adapter that fetches rows can
 * reuse it and so achievements can run the same maths over a filtered subset.
 */
export function aggregateWalletStats(openings: readonly StoredOpening[]): WalletStats {
  if (openings.length === 0) {
    // A wallet with no rips is not an error and not a zero-value wallet: the
    // timestamps are null so the UI can say "no rips yet" instead of rendering
    // the epoch.
    return { rips: 0, totalReferenceValue: 0, bestPull: null, firstRipAt: null, lastRipAt: null };
  }

  let total = 0;
  let best: BestPull | null = null;
  let firstRipAt = openings[0].openedAt;
  let lastRipAt = openings[0].openedAt;

  for (const opening of openings) {
    if (opening.openedAt < firstRipAt) firstRipAt = opening.openedAt;
    if (opening.openedAt > lastRipAt) lastRipAt = opening.openedAt;

    for (const card of opening.cards) {
      total += card.referenceValue;
      const better =
        best === null ||
        card.referenceValue > best.card.referenceValue ||
        // Tie: keep the first time the wallet hit that value, which is the pull
        // the user actually remembers.
        (card.referenceValue === best.card.referenceValue && opening.openedAt < best.openedAt);
      if (better) {
        best = { openingId: opening.openingId, openedAt: opening.openedAt, card };
      }
    }
  }

  // Values are currency amounts; accumulating floats drifts (0.1 + 0.2), so
  // round the total back to cents rather than surfacing 4200.000000000001.
  return {
    rips: openings.length,
    totalReferenceValue: Math.round(total * 100) / 100,
    bestPull: best,
    firstRipAt,
    lastRipAt,
  };
}

/* ------------------------------------------------------------------ *
 * JSON implementation
 * ------------------------------------------------------------------ */

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

/** Write via a temp file + rename so an interrupted write cannot truncate the ledger. */
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, path);
}

function freezeOpening(opening: StoredOpening): StoredOpening {
  return Object.freeze({
    ...opening,
    cards: Object.freeze(opening.cards.map((c) => Object.freeze({ ...c }))),
    verification: Object.freeze({ ...opening.verification }),
  });
}

/**
 * Everything about a rip that later reads depend on, minus the two fields a
 * legitimate retry may differ in: `openedAt` (a retry stamps a fresh clock)
 * and a revealed `serverSeed` (null before the reveal, populated after). A
 * mismatch here means the same openingId is being used for materially
 * different contents, which would corrupt counts and stats — surface it.
 */
function materialFingerprint(opening: StoredOpening): string {
  return contentHash({
    wallet: opening.wallet,
    packId: opening.packId,
    packVersion: opening.packVersion,
    cards: opening.cards,
    verification: { ...opening.verification, serverSeed: null },
  });
}

/**
 * Newest first, tie-broken by openingId so paging and feeds are deterministic.
 * ISO-8601 UTC strings from `toISOString()` sort lexicographically in time
 * order, so no Date parsing is needed on the read path.
 */
function newestFirst(a: StoredOpening, b: StoredOpening): number {
  if (a.openedAt !== b.openedAt) return a.openedAt < b.openedAt ? 1 : -1;
  return a.openingId < b.openingId ? 1 : a.openingId > b.openingId ? -1 : 0;
}

/**
 * Filesystem ledger, mirroring `JsonCatalogStore`: lazy load, in-memory maps,
 * atomic whole-file flush on close. Same caveat — it holds the working set in
 * memory and is not meant to serve production traffic; `pack_opening` in
 * schema/postgres.sql is the shape an adapter should target.
 */
export class JsonOpeningLedger implements OpeningLedger {
  readonly name = 'json';

  // Declared explicitly rather than as constructor parameter properties: those
  // emit code, so Node's strip-only TypeScript support rejects them.
  private readonly root: string;
  private readonly file: string;

  private loaded = false;
  private dirty = false;

  private openings = new Map<string, StoredOpening>();
  /** wallet -> openingIds. Exact-match keys; see the note in `record`. */
  private byWallet = new Map<string, string[]>();
  /** variantId -> openingIds, deduplicated within a rip. */
  private byVariant = new Map<string, string[]>();
  /** variantId -> total copies pulled, counting duplicates within one rip. */
  private variantCounts = new Map<string, number>();

  constructor(root: string) {
    this.root = root;
    this.file = join(root, 'openings.json');
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    const rows = await readJson<StoredOpening[]>(this.file, []);
    for (const row of rows) {
      const opening = freezeOpening(row);
      this.openings.set(opening.openingId, opening);
      this.index(opening);
    }
    this.loaded = true;
  }

  /** Index one rip. Called exactly once per openingId, which is what keeps counts honest. */
  private index(opening: StoredOpening): void {
    const wallet = this.byWallet.get(opening.wallet);
    if (wallet) wallet.push(opening.openingId);
    else this.byWallet.set(opening.wallet, [opening.openingId]);

    const seen = new Set<string>();
    for (const card of opening.cards) {
      this.variantCounts.set(card.variantId, (this.variantCounts.get(card.variantId) ?? 0) + 1);
      // A pack that draws the same variant twice is two pulls but one rip, so
      // the count map and the listing map diverge here on purpose.
      if (seen.has(card.variantId)) continue;
      seen.add(card.variantId);
      const list = this.byVariant.get(card.variantId);
      if (list) list.push(opening.openingId);
      else this.byVariant.set(card.variantId, [opening.openingId]);
    }
  }

  async record(opening: StoredOpening): Promise<RecordOpeningResult> {
    await this.load();

    // Wallets are matched exactly, with no case folding. Base58 addresses are
    // case-sensitive, so lowercasing would merge two distinct wallets, and the
    // SQL adapter's (wallet, opened_at) index matches exactly too — normalizing
    // here would make the two implementations disagree. Normalization belongs
    // at the wallet-connect boundary.
    const existing = this.openings.get(opening.openingId);
    if (existing) {
      if (materialFingerprint(existing) !== materialFingerprint(opening)) {
        throw new LedgerConflictError(
          `Opening ${opening.openingId} is already recorded with different contents`,
        );
      }
      // The retry path. Nothing is re-indexed, so countByVariant and walletStats
      // see one rip no matter how many times the writer retries.
      return { stored: false, opening: existing };
    }

    const frozen = freezeOpening(opening);
    this.openings.set(frozen.openingId, frozen);
    this.index(frozen);
    this.dirty = true;
    return { stored: true, opening: frozen };
  }

  private resolve(ids: readonly string[]): StoredOpening[] {
    const out: StoredOpening[] = [];
    for (const id of ids) {
      const opening = this.openings.get(id);
      if (opening) out.push(opening);
    }
    return out;
  }

  async listByWallet(wallet: string, opts: ListOpeningsOptions = {}): Promise<StoredOpening[]> {
    await this.load();
    let rows = this.resolve(this.byWallet.get(wallet) ?? []);
    if (opts.before !== undefined) {
      const before = opts.before;
      rows = rows.filter((o) => o.openedAt < before);
    }
    rows.sort(newestFirst);
    return opts.limit === undefined ? rows : rows.slice(0, Math.max(0, opts.limit));
  }

  async recent(limit: number): Promise<StoredOpening[]> {
    await this.load();
    return [...this.openings.values()].sort(newestFirst).slice(0, Math.max(0, limit));
  }

  async countByVariant(variantId: string): Promise<number> {
    await this.load();
    return this.variantCounts.get(variantId) ?? 0;
  }

  async listByVariant(variantId: string, limit: number): Promise<StoredOpening[]> {
    await this.load();
    return this.resolve(this.byVariant.get(variantId) ?? [])
      .sort(newestFirst)
      .slice(0, Math.max(0, limit));
  }

  async walletStats(wallet: string): Promise<WalletStats> {
    await this.load();
    return aggregateWalletStats(this.resolve(this.byWallet.get(wallet) ?? []));
  }

  async close(): Promise<void> {
    if (!this.dirty) return;
    await writeJsonAtomic(this.file, [...this.openings.values()]);
    this.dirty = false;
  }
}
