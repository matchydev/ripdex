/**
 * Variant-aware price normalization (spec §16).
 *
 * The one invariant: a price is only ever read from the fields belonging to
 * the exact variant being priced. There is no cross-variant fallback, at all,
 * ever. If the reverse holo has no market price, the answer is "no price" —
 * not the normal printing's price wearing a reverse holo's name.
 *
 * Falling back WITHIN a variant (market -> mid -> low) is allowed and recorded
 * in `basis`, because those are three measurements of the same product.
 */

import type { PokemonPriceReport } from './types.ts';
import {
  Finish,
  Printing,
  type CanonicalPokemonCardVariant,
} from './variant.ts';

export type PriceBasis = 'market' | 'mid' | 'low';

export interface PriceQuote {
  readonly variantId: string;
  readonly low: number | null;
  readonly mid: number | null;
  readonly high: number | null;
  readonly market: number | null;
  /** The figure RIPDEX shows as "reference value". */
  readonly referenceValue: number;
  /** Which field `referenceValue` came from. Surface this in the UI. */
  readonly basis: PriceBasis;
  readonly currency: string;
  readonly source: string;
  readonly sourceUrl: string | null;
  readonly sourceUpdatedAt: string | null;
}

export type PriceUnavailableReason =
  /** No pricing report exists for the card at all. */
  | 'no-report'
  /** The provider does not price this variant. Shadowless is the common case. */
  | 'variant-not-priced'
  /** Fields exist but are all null/zero. */
  | 'no-usable-figure'
  /** Report is older than the caller's freshness requirement. */
  | 'stale';

export type PriceResolution =
  | { ok: true; quote: PriceQuote }
  | { ok: false; reason: PriceUnavailableReason; detail: string };

interface FieldSet {
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
}

const NO_FIELDS: FieldSet = { low: null, mid: null, high: null, market: null };

function firstNonEmpty(...sets: FieldSet[]): FieldSet {
  for (const s of sets) {
    if (s.low !== null || s.mid !== null || s.high !== null || s.market !== null) return s;
  }
  return NO_FIELDS;
}

/**
 * Map a canonical variant onto the exact provider fields for that variant.
 * Returns null when the provider has no concept of this variant — which is a
 * hard stop, not an invitation to substitute a different printing.
 */
function fieldsForVariant(
  variant: CanonicalPokemonCardVariant,
  p: PokemonPriceReport,
): FieldSet | null {
  const { finish, printing } = variant;

  if (printing === Printing.Shadowless) {
    // No mainstream pricing provider exposes a shadowless field today. Rather
    // than quietly serving the unlimited price for a card worth many times
    // more, we refuse. A dedicated shadowless provider can be added later.
    return null;
  }

  if (printing === Printing.FirstEdition) {
    if (finish === Finish.NonFoil) {
      return {
        low: p.firstEditionNormalLow,
        mid: p.firstEditionNormalMid,
        high: p.firstEditionNormalHigh,
        market: p.firstEditionNormalMarket,
      };
    }
    if (finish === Finish.Holofoil) {
      return {
        low: p.firstEditionHolofoilLow,
        mid: p.firstEditionHolofoilMid,
        high: p.firstEditionHolofoilHigh,
        market: p.firstEditionHolofoilMarket,
      };
    }
    // 1st edition reverse holo did not exist as a print run.
    return null;
  }

  // printing === Unlimited
  if (finish === Finish.NonFoil) {
    return { low: p.normalLow, mid: p.normalMid, high: p.normalHigh, market: p.normalMarket };
  }
  if (finish === Finish.Holofoil) {
    // `holofoil` and `unlimitedHolofoil` denote the same product; providers
    // disagree about which key they use per set. This is a synonym, not a
    // cross-variant fallback.
    return firstNonEmpty(
      { low: p.holofoilLow, mid: p.holofoilMid, high: p.holofoilHigh, market: p.holofoilMarket },
      {
        low: p.unlimitedHolofoilLow,
        mid: p.unlimitedHolofoilMid,
        high: p.unlimitedHolofoilHigh,
        market: p.unlimitedHolofoilMarket,
      },
    );
  }
  return {
    low: p.reverseHolofoilLow,
    mid: p.reverseHolofoilMid,
    high: p.reverseHolofoilHigh,
    market: p.reverseHolofoilMarket,
  };
}

export interface ResolvePriceOptions {
  /** Reject reports whose sourceUpdatedAt is older than this. */
  maxAgeMs?: number;
  now?: Date;
  /** Provider name recorded on the quote. */
  source?: string;
}

const usable = (n: number | null): n is number =>
  n !== null && Number.isFinite(n) && n > 0;

/**
 * Resolve the reference price for exactly one variant.
 */
export function resolvePrice(
  variant: CanonicalPokemonCardVariant,
  report: PokemonPriceReport | null,
  opts: ResolvePriceOptions = {},
): PriceResolution {
  if (!report) {
    return { ok: false, reason: 'no-report', detail: `No price report for ${variant.variantId}` };
  }

  if (opts.maxAgeMs !== undefined) {
    if (!report.tcgplayerUpdatedAt) {
      return {
        ok: false,
        reason: 'stale',
        detail: `No sourceUpdatedAt on report for ${variant.variantId}; cannot prove freshness`,
      };
    }
    const updated = Date.parse(report.tcgplayerUpdatedAt);
    const now = (opts.now ?? new Date()).getTime();
    if (!Number.isFinite(updated) || now - updated > opts.maxAgeMs) {
      return {
        ok: false,
        reason: 'stale',
        detail: `Price for ${variant.variantId} updated ${report.tcgplayerUpdatedAt}, older than ${opts.maxAgeMs}ms`,
      };
    }
  }

  const fields = fieldsForVariant(variant, report);
  if (fields === null) {
    return {
      ok: false,
      reason: 'variant-not-priced',
      detail: `Provider does not price ${variant.finish}/${variant.printing} for ${variant.setId}-${variant.number}`,
    };
  }

  let referenceValue: number;
  let basis: PriceBasis;
  if (usable(fields.market)) {
    referenceValue = fields.market;
    basis = 'market';
  } else if (usable(fields.mid)) {
    referenceValue = fields.mid;
    basis = 'mid';
  } else if (usable(fields.low)) {
    referenceValue = fields.low;
    basis = 'low';
  } else {
    return {
      ok: false,
      reason: 'no-usable-figure',
      detail: `All price fields empty for ${variant.variantId}`,
    };
  }

  return {
    ok: true,
    quote: {
      variantId: variant.variantId,
      low: fields.low,
      mid: fields.mid,
      high: fields.high,
      market: fields.market,
      referenceValue,
      basis,
      currency: report.currency,
      source: opts.source ?? 'tcgplayer',
      sourceUrl: report.tcgplayerUrl,
      sourceUpdatedAt: report.tcgplayerUpdatedAt,
    },
  };
}

/** Display helper. Keeps cents, because a $4.99 card is not a $5 card. */
export function formatReferenceValue(quote: PriceQuote): string {
  const n = quote.referenceValue;
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: quote.currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return fmt.format(n);
}
