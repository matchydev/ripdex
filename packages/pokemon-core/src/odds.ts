/**
 * RIPDEX pack configuration and the odds engine (spec §3, §11).
 *
 * A RIPDEX pack is an application construct with a curated pool. It is not a
 * simulation of a physical booster's slot structure unless a config explicitly
 * says so — see `distributionModel`.
 *
 * Pool entries address variantIds, never card ids, so a pool can hold the
 * 1st Edition holo and the unlimited holo of the same Charizard as two
 * separate outcomes with their own weights and their own prices.
 */

import type { DrawInputs } from './random.ts';
import { floatAt } from './random.ts';
import { parseVariantId } from './variant.ts';

export interface PackPoolEntry {
  /** Canonical variant id from `variant.ts`. */
  variantId: string;
  /**
   * Relative weight. Integers are strongly preferred: they make the published
   * odds table exact and auditable instead of a float-rounding artifact.
   */
  weight: number;
}

export type DistributionModel =
  /** Every card drawn independently from the whole pool. */
  | { kind: 'flat' }
  /** Ordered slots, each with its own sub-pool. Use to mirror a real booster. */
  | { kind: 'slots'; slots: { name: string; pool: PackPoolEntry[] }[] };

export interface PackArtwork {
  /** Config keys resolved against the asset provider, never inlined URLs. */
  wrapperAssetKey: string;
  heroAssetKey: string | null;
  /** Tailwind-free raw values; the wrapper renderer maps these to CSS vars. */
  accentColor: string;
  backgroundColor: string;
  foilTone: 'warm' | 'cool' | 'gold' | 'electric' | 'crimson' | 'mono';
  texture: 'clean' | 'distressed' | 'aged' | 'gloss';
  /**
   * Resolved hero artwork URL. Generated packs pin one; hand-authored packs may
   * omit it and let the renderer fall back to the pack's most valuable outcome.
   */
  heroImageUrl?: string | null;
}

export interface PackConfig {
  readonly id: string;
  readonly name: string;
  /** Bump whenever pool or weights change. Snapshots pin this. */
  readonly version: string;
  readonly cardsPerPack: number;
  /** Price in the smallest unit of $RIP. */
  readonly priceRip: bigint;
  readonly distributionModel: DistributionModel;
  readonly pool: readonly PackPoolEntry[];
  readonly artwork: PackArtwork;
  /** Draw the same variant more than once within one pack? */
  readonly allowDuplicatesWithinPack: boolean;
}

export interface OddsRow {
  variantId: string;
  weight: number;
  /** Exact probability as a fraction of total weight. */
  probability: number;
  /** "0.10%" — for the published table. */
  probabilityLabel: string;
}

export class PackConfigError extends Error {}

/**
 * Validate a pack config. Called at ingest time and again when a snapshot is
 * frozen, because an invalid pool must never reach a paying user.
 */
export function validatePackConfig(config: PackConfig): void {
  if (config.cardsPerPack < 1) {
    throw new PackConfigError(`${config.id}: cardsPerPack must be >= 1`);
  }
  if (config.pool.length === 0) {
    throw new PackConfigError(`${config.id}: pool is empty`);
  }

  const seen = new Set<string>();
  for (const entry of config.pool) {
    if (!Number.isFinite(entry.weight) || entry.weight <= 0) {
      throw new PackConfigError(
        `${config.id}: entry ${entry.variantId} has non-positive weight ${entry.weight}`,
      );
    }
    // A typo must not become a live outcome. Reported as a PackConfigError so
    // callers have one error type to catch for "this config is not shippable".
    try {
      parseVariantId(entry.variantId);
    } catch (err) {
      throw new PackConfigError(
        `${config.id}: pool entry "${entry.variantId}" is not a canonical variant id — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    if (seen.has(entry.variantId)) {
      throw new PackConfigError(`${config.id}: duplicate pool entry ${entry.variantId}`);
    }
    seen.add(entry.variantId);
  }

  if (!config.allowDuplicatesWithinPack && config.cardsPerPack > config.pool.length) {
    throw new PackConfigError(
      `${config.id}: cannot draw ${config.cardsPerPack} distinct cards from a pool of ${config.pool.length}`,
    );
  }
}

export function totalWeight(pool: readonly PackPoolEntry[]): number {
  return pool.reduce((sum, e) => sum + e.weight, 0);
}

/** The exact, published odds table (spec §11 requires this be available). */
export function oddsTable(pool: readonly PackPoolEntry[]): OddsRow[] {
  const total = totalWeight(pool);
  return pool
    .map((e) => {
      const probability = e.weight / total;
      return {
        variantId: e.variantId,
        weight: e.weight,
        probability,
        probabilityLabel: formatProbability(probability),
      };
    })
    .sort((a, b) => b.probability - a.probability);
}

/**
 * Format small odds without collapsing them to "0.00%". A 1-in-20,000 grail
 * needs to read as 0.005%, not as zero.
 */
export function formatProbability(p: number): string {
  const pct = p * 100;
  if (pct === 0) return '0%';
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  if (pct >= 0.01) return `${pct.toFixed(3)}%`;
  if (pct >= 0.0001) return `${pct.toFixed(5)}%`;
  return `${pct.toExponential(2)}%`;
}

/**
 * Select one entry by cumulative weight. `u` must be in [0, 1).
 */
export function selectByWeight(pool: readonly PackPoolEntry[], u: number): PackPoolEntry {
  if (pool.length === 0) throw new PackConfigError('Cannot draw from an empty pool');
  if (!(u >= 0 && u < 1)) throw new RangeError(`Uniform out of range: ${u}`);

  const target = u * totalWeight(pool);
  let cumulative = 0;
  for (const entry of pool) {
    cumulative += entry.weight;
    if (target < cumulative) return entry;
  }
  // Only reachable through floating-point drift at the very top of the range.
  return pool[pool.length - 1];
}

/**
 * Draw the full contents of one pack. Deterministic given the seed inputs:
 * the same (serverSeed, clientSeed, nonce) always yields the same cards, which
 * is what makes the reveal verifiable after the fact.
 */
export function drawPack(config: PackConfig, inputs: DrawInputs): PackPoolEntry[] {
  validatePackConfig(config);

  if (config.distributionModel.kind === 'slots') {
    const results: PackPoolEntry[] = [];
    config.distributionModel.slots.forEach((slot, i) => {
      results.push(selectByWeight(slot.pool, floatAt(inputs, i)));
    });
    return results;
  }

  const results: PackPoolEntry[] = [];
  let remaining = [...config.pool];
  let cursor = 0;

  for (let i = 0; i < config.cardsPerPack; i++) {
    const pick = selectByWeight(remaining, floatAt(inputs, cursor++));
    results.push(pick);
    if (!config.allowDuplicatesWithinPack) {
      remaining = remaining.filter((e) => e.variantId !== pick.variantId);
    }
  }
  return results;
}
