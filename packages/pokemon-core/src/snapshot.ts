/**
 * Immutable price + config snapshots and the pack-opening sequence (spec §17).
 *
 * The ordering requirement is enforced structurally rather than by convention.
 * `openPack` takes an already-frozen price snapshot and refuses to run unless
 * every variant in the pool is priced inside it. There is therefore no code
 * path where a card is drawn and a price is looked up afterwards, because by
 * the time randomness is generated the prices are already immutable and the
 * function has no provider handle to call.
 */

import { createHash } from 'node:crypto';
import type { PriceQuote } from './price.ts';
import type { DrawInputs } from './random.ts';
import { sha256 } from './random.ts';
import {
  drawPack,
  validatePackConfig,
  oddsTable,
  totalWeight,
  type PackConfig,
  type PackPoolEntry,
} from './odds.ts';
import {
  classifyTier,
  DEFAULT_TIER_CONFIG,
  type PullTier,
  type TierConfig,
} from './tiers.ts';

/* ------------------------------------------------------------------ *
 * Deterministic hashing
 * ------------------------------------------------------------------ */

/** Stable stringify: object keys sorted, so the hash is reproducible. */
function canonicalJson(value: unknown): string {
  // BigInt must be handled before the primitive branch: JSON.stringify throws
  // on it, and PackConfig.priceRip is a bigint.
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function contentHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

/* ------------------------------------------------------------------ *
 * Price snapshot
 * ------------------------------------------------------------------ */

export interface PriceSnapshot {
  readonly snapshotId: string;
  readonly createdAt: string;
  readonly validUntil: string;
  readonly currency: string;
  readonly provider: string;
  /** variantId -> frozen quote. */
  readonly quotes: Readonly<Record<string, PriceQuote>>;
  readonly contentHash: string;
}

export interface BuildSnapshotOptions {
  provider: string;
  currency: string;
  ttlMs: number;
  now?: Date;
}

export function buildPriceSnapshot(
  quotes: Record<string, PriceQuote>,
  opts: BuildSnapshotOptions,
): PriceSnapshot {
  const now = opts.now ?? new Date();
  const createdAt = now.toISOString();
  const validUntil = new Date(now.getTime() + opts.ttlMs).toISOString();

  for (const [variantId, q] of Object.entries(quotes)) {
    if (q.variantId !== variantId) {
      throw new Error(`Snapshot key ${variantId} does not match quote ${q.variantId}`);
    }
    if (q.currency !== opts.currency) {
      throw new Error(
        `Mixed currency in snapshot: ${q.variantId} is ${q.currency}, snapshot is ${opts.currency}`,
      );
    }
  }

  const body = { createdAt, validUntil, currency: opts.currency, provider: opts.provider, quotes };
  const hash = contentHash(body);
  return Object.freeze({ ...body, snapshotId: `ps_${hash.slice(0, 24)}`, contentHash: hash, quotes: Object.freeze(quotes) });
}

export function isSnapshotValid(snapshot: PriceSnapshot, now: Date = new Date()): boolean {
  return now.getTime() < Date.parse(snapshot.validUntil);
}

/* ------------------------------------------------------------------ *
 * Pack config snapshot
 * ------------------------------------------------------------------ */

export interface PackConfigSnapshot {
  readonly snapshotId: string;
  readonly createdAt: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly config: PackConfig;
  readonly totalWeight: number;
  readonly contentHash: string;
}

export function lockPackConfig(config: PackConfig, now: Date = new Date()): PackConfigSnapshot {
  validatePackConfig(config);
  const createdAt = now.toISOString();
  const hash = contentHash({ createdAt, config });
  return Object.freeze({
    snapshotId: `pc_${hash.slice(0, 24)}`,
    createdAt,
    packId: config.id,
    packVersion: config.version,
    config: Object.freeze(config),
    totalWeight: totalWeight(config.pool),
    contentHash: hash,
  });
}

/* ------------------------------------------------------------------ *
 * Opening
 * ------------------------------------------------------------------ */

export class SnapshotIntegrityError extends Error {}

export interface PulledCard {
  variantId: string;
  weight: number;
  probability: number;
  /** Frozen at snapshot time. Never re-queried. */
  quote: PriceQuote;
  tier: PullTier;
}

export interface PackOpenResult {
  readonly openingId: string;
  readonly openedAt: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly cards: readonly PulledCard[];
  /** Everything a third party needs to recompute this opening. */
  readonly verification: {
    readonly serverSeedHash: string;
    readonly clientSeed: string;
    readonly nonce: number;
    readonly priceSnapshotId: string;
    readonly priceSnapshotHash: string;
    readonly packConfigSnapshotId: string;
    readonly packConfigSnapshotHash: string;
    /** Populated only after the server seed is rotated and revealed. */
    readonly serverSeed: string | null;
  };
}

export interface OpenPackParams {
  packSnapshot: PackConfigSnapshot;
  priceSnapshot: PriceSnapshot;
  inputs: DrawInputs;
  tierConfig?: TierConfig;
  now?: Date;
}

/**
 * Steps 1-7 of §17, in order, with the guarantee stated at the top of the file.
 *
 * Note the argument list: this function is given frozen snapshots and a seed.
 * It has no provider, no database handle, and no clock dependency beyond
 * stamping the result. It physically cannot price a card after drawing it.
 */
export function openPack(params: OpenPackParams): PackOpenResult {
  const { packSnapshot, priceSnapshot, inputs } = params;
  const now = params.now ?? new Date();
  const tierConfig = params.tierConfig ?? DEFAULT_TIER_CONFIG;

  // 1 + 2. The price snapshot arrives already frozen; verify it is still valid
  // and has not been tampered with since it was built.
  if (!isSnapshotValid(priceSnapshot, now)) {
    throw new SnapshotIntegrityError(
      `Price snapshot ${priceSnapshot.snapshotId} expired at ${priceSnapshot.validUntil}`,
    );
  }
  const expectedPriceHash = contentHash({
    createdAt: priceSnapshot.createdAt,
    validUntil: priceSnapshot.validUntil,
    currency: priceSnapshot.currency,
    provider: priceSnapshot.provider,
    quotes: priceSnapshot.quotes,
  });
  if (expectedPriceHash !== priceSnapshot.contentHash) {
    throw new SnapshotIntegrityError(`Price snapshot ${priceSnapshot.snapshotId} failed hash check`);
  }

  // 3. Pack configuration is locked, and every outcome it can produce must
  // already be priced. This is the check that makes draw-then-price impossible:
  // if a variant is unpriced we refuse the opening rather than proceed and
  // improvise a value later.
  const unpriced = packSnapshot.config.pool
    .map((e) => e.variantId)
    .filter((id) => !(id in priceSnapshot.quotes));
  if (unpriced.length > 0) {
    throw new SnapshotIntegrityError(
      `Pack ${packSnapshot.packId} has ${unpriced.length} unpriced variant(s) in snapshot ` +
        `${priceSnapshot.snapshotId}: ${unpriced.slice(0, 5).join(', ')}` +
        (unpriced.length > 5 ? ` (+${unpriced.length - 5} more)` : ''),
    );
  }

  // 4. Accept the opening: from here the outcome is fully determined by inputs
  // that are already committed.
  const openedAt = now.toISOString();

  // 5 + 6. Randomness, then the draw.
  const drawn: PackPoolEntry[] = drawPack(packSnapshot.config, inputs);
  const odds = new Map(oddsTable(packSnapshot.config.pool).map((r) => [r.variantId, r.probability]));

  const cards: PulledCard[] = drawn.map((entry) => {
    const quote = priceSnapshot.quotes[entry.variantId];
    return {
      variantId: entry.variantId,
      weight: entry.weight,
      probability: odds.get(entry.variantId) ?? 0,
      quote,
      tier: classifyTier(quote.referenceValue, tierConfig),
    };
  });

  // 7. Result, addressed by a hash of everything that produced it.
  const openingId = `rip_${sha256(
    [
      packSnapshot.contentHash,
      priceSnapshot.contentHash,
      inputs.clientSeed,
      String(inputs.nonce),
    ].join(':'),
  ).slice(0, 20)}`;

  return Object.freeze({
    openingId,
    openedAt,
    packId: packSnapshot.packId,
    packVersion: packSnapshot.packVersion,
    cards: Object.freeze(cards),
    verification: Object.freeze({
      serverSeedHash: sha256(inputs.serverSeed),
      clientSeed: inputs.clientSeed,
      nonce: inputs.nonce,
      priceSnapshotId: priceSnapshot.snapshotId,
      priceSnapshotHash: priceSnapshot.contentHash,
      packConfigSnapshotId: packSnapshot.snapshotId,
      packConfigSnapshotHash: packSnapshot.contentHash,
      serverSeed: null,
    }),
  });
}
