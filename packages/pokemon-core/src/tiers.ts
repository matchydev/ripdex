/**
 * Pull tier classification (spec §7). Thresholds are configuration, not
 * constants, because the token price and pack economics will move.
 */

export const PullTier = {
  Tier1: 'TIER_1',
  Tier2: 'TIER_2',
  Tier3: 'TIER_3',
  Tier4: 'TIER_4',
  Grail: 'GRAIL',
} as const;
export type PullTier = (typeof PullTier)[keyof typeof PullTier];

export interface TierBand {
  tier: PullTier;
  label: string;
  /** Inclusive lower bound in the snapshot currency. */
  minValue: number;
  /** Exclusive upper bound, or null for open-ended. */
  maxValue: number | null;
}

export interface TierConfig {
  readonly version: string;
  readonly currency: string;
  readonly bands: readonly TierBand[];
}

export const DEFAULT_TIER_CONFIG: TierConfig = {
  version: 'tiers-v1',
  currency: 'USD',
  bands: [
    { tier: PullTier.Tier1, label: 'Tier 1', minValue: 0, maxValue: 5 },
    { tier: PullTier.Tier2, label: 'Tier 2', minValue: 5, maxValue: 25 },
    { tier: PullTier.Tier3, label: 'Tier 3', minValue: 25, maxValue: 100 },
    { tier: PullTier.Tier4, label: 'Tier 4', minValue: 100, maxValue: 500 },
    { tier: PullTier.Grail, label: 'Grail', minValue: 500, maxValue: null },
  ],
};

export function classifyTier(value: number, config: TierConfig = DEFAULT_TIER_CONFIG): PullTier {
  for (const band of config.bands) {
    const aboveFloor = value >= band.minValue;
    const belowCeiling = band.maxValue === null || value < band.maxValue;
    if (aboveFloor && belowCeiling) return band.tier;
  }
  return PullTier.Tier1;
}

export function isGrail(value: number, config: TierConfig = DEFAULT_TIER_CONFIG): boolean {
  return classifyTier(value, config) === PullTier.Grail;
}

/**
 * Reveal choreography per tier (spec §6, §7). The reveal layer reads this
 * rather than hardcoding timings, so pacing can be tuned without touching
 * animation code.
 */
export interface RevealChoreography {
  /** Milliseconds the card holds face-down before it can flip. */
  suspenseMs: number;
  /** Flip duration. */
  flipMs: number;
  /** Dim the surrounding UI. */
  dimBackground: boolean;
  /** Hide all chrome and run the full grail sequence. */
  fullTakeover: boolean;
  /** Delay before name + reference value appear, so the card lands first. */
  metadataDelayMs: number;
}

export function choreographyFor(tier: PullTier): RevealChoreography {
  switch (tier) {
    case PullTier.Grail:
      return { suspenseMs: 2200, flipMs: 1400, dimBackground: true, fullTakeover: true, metadataDelayMs: 1100 };
    case PullTier.Tier4:
      return { suspenseMs: 1400, flipMs: 1000, dimBackground: true, fullTakeover: false, metadataDelayMs: 800 };
    case PullTier.Tier3:
      return { suspenseMs: 900, flipMs: 750, dimBackground: true, fullTakeover: false, metadataDelayMs: 600 };
    case PullTier.Tier2:
      return { suspenseMs: 500, flipMs: 600, dimBackground: false, fullTakeover: false, metadataDelayMs: 450 };
    default:
      return { suspenseMs: 220, flipMs: 450, dimBackground: false, fullTakeover: false, metadataDelayMs: 300 };
  }
}
