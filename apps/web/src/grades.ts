/**
 * PSA grading — the graded value layer on top of a pull.
 *
 * A ripped card is assigned a PSA grade derived from the SAME committed seed as
 * the draw (provably fair: HMAC-SHA256(serverSeed, clientSeed:nonce:cursor) via
 * pokemon-core's floatAt), at a cursor far above any pack's card-draw cursors so
 * the grade never collides with the draw. Anyone with the revealed serverSeed,
 * the clientSeed, the nonce, GRADE_CURSOR and this table can recompute the grade.
 *
 * The grade is a MULTIPLIER on the card's frozen reference value — a PSA 10 Gem
 * Mint is worth several times a mid-grade copy, a PSA 6 a fraction. This never
 * changes the card's underlying reference price (pricing/identity are untouched);
 * it is a graded valuation applied at rip time and frozen with the pull.
 */

/** Cursor for the grade draw. Far above cardsPerPack, so it never collides with
 *  a pack's card-draw cursors (0..count-1). Per-card: GRADE_CURSOR + cardIndex. */
export const GRADE_CURSOR = 100000;
export const GRADE_TABLE_VERSION = 'psa-v1';

export interface GradeBand {
  grade: number;
  label: string;
  /** Integer weight; the published grade odds are exact ratios of these. */
  weight: number;
  /** Graded value = referenceValue * multiplier. */
  multiplier: number;
}

/**
 * Weighted so Gem Mint 10s are genuinely rare (3%) and most pulls land 7–9.
 * Multipliers echo the real market: a 10 is a premium, an 8 ≈ raw, a 6 a haircut.
 */
export const PSA_GRADES: readonly GradeBand[] = [
  { grade: 10, label: 'GEM MINT', weight: 3, multiplier: 4.0 },
  { grade: 9, label: 'MINT', weight: 20, multiplier: 1.8 },
  { grade: 8, label: 'NM-MINT', weight: 30, multiplier: 1.1 },
  { grade: 7, label: 'NEAR MINT', weight: 27, multiplier: 0.75 },
  { grade: 6, label: 'EX-MINT', weight: 20, multiplier: 0.5 },
];

const TOTAL_WEIGHT = PSA_GRADES.reduce((s, g) => s + g.weight, 0);

/**
 * Expected grade multiplier (weight-averaged). Grading adds ~11% to expected
 * value, so a pack's expected GRADED value is packEV_base * AVG_MULTIPLIER — the
 * denominator the sell price uses to hold a uniform house edge across packs.
 */
export const AVG_MULTIPLIER =
  PSA_GRADES.reduce((s, g) => s + g.weight * g.multiplier, 0) / TOTAL_WEIGHT;

export interface GradedPull {
  grade: number;
  gradeLabel: string;
  multiplier: number;
  /** Published probability of this grade. */
  probability: number;
  /** referenceValue * multiplier, rounded to cents. */
  gradedValue: number;
}

/** Map a uniform in [0,1) to a grade band by cumulative weight. */
export function bandForUniform(u: number): GradeBand {
  const target = Math.max(0, Math.min(0.999999999, u)) * TOTAL_WEIGHT;
  let cumulative = 0;
  for (const band of PSA_GRADES) {
    cumulative += band.weight;
    if (target < cumulative) return band;
  }
  return PSA_GRADES[PSA_GRADES.length - 1];
}

/** Grade a pull: pick the band from the uniform and apply it to the base value. */
export function gradePull(uniform: number, referenceValue: number): GradedPull {
  const band = bandForUniform(uniform);
  return {
    grade: band.grade,
    gradeLabel: band.label,
    multiplier: band.multiplier,
    probability: band.weight / TOTAL_WEIGHT,
    gradedValue: Math.round(referenceValue * band.multiplier * 100) / 100,
  };
}

/** Colour token for a grade, for the slab label. Gold for a 10, accent for a 9. */
export function gradeColor(grade: number): string {
  return grade >= 10 ? 'var(--gold)' : grade >= 9 ? 'var(--accent-hi)' : 'var(--text-2)';
}
