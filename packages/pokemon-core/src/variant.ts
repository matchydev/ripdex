/**
 * Canonical variant identity (spec §16).
 *
 * The rule this file exists to enforce: a card's identity is NOT its name, and
 * it is not even (set, number). It is (set, number, finish, printing). Base Set
 * Charizard 4/102 is a modest card in one printing and a five-figure card in
 * another. Everything downstream — pricing, odds, tiers, collection, social
 * graphics — keys off CanonicalPokemonCardVariant.
 */

import type { PokemonCard, PokemonPriceReport } from './types.ts';

/** How the card's surface is printed. */
export const Finish = {
  NonFoil: 'non-foil',
  Holofoil: 'holofoil',
  ReverseHolofoil: 'reverse-holofoil',
} as const;
export type Finish = (typeof Finish)[keyof typeof Finish];

/** Which print run the card came from. */
export const Printing = {
  Unlimited: 'unlimited',
  FirstEdition: '1st-edition',
  Shadowless: 'shadowless',
} as const;
export type Printing = (typeof Printing)[keyof typeof Printing];

export interface CanonicalPokemonCardVariant {
  /** Stable, sortable, URL-safe: "base1|4|holofoil|1st-edition". */
  readonly variantId: string;
  readonly setId: string;
  readonly number: string;
  readonly finish: Finish;
  readonly printing: Printing;
}

/**
 * Field separator. A pipe is used because collector numbers legitimately
 * contain hyphens (and set ids contain digits), so a hyphen-delimited id
 * cannot be parsed back unambiguously.
 */
const SEP = '|';

export function makeVariant(
  setId: string,
  number: string,
  finish: Finish,
  printing: Printing = Printing.Unlimited,
): CanonicalPokemonCardVariant {
  if (setId.includes(SEP) || number.includes(SEP)) {
    throw new Error(`setId/number may not contain "${SEP}": ${setId} ${number}`);
  }
  return {
    variantId: [setId, number, finish, printing].join(SEP),
    setId,
    number,
    finish,
    printing,
  };
}

export function variantForCard(
  card: Pick<PokemonCard, 'setId' | 'number'>,
  finish: Finish,
  printing: Printing = Printing.Unlimited,
): CanonicalPokemonCardVariant {
  return makeVariant(card.setId, card.number, finish, printing);
}

const FINISHES = new Set<string>(Object.values(Finish));
const PRINTINGS = new Set<string>(Object.values(Printing));

/**
 * Parse a variantId back into identity. Throws rather than guessing — a
 * malformed id must never silently resolve to the unlimited/non-foil default,
 * because that default is usually the cheap version of the card.
 */
export function parseVariantId(variantId: string): CanonicalPokemonCardVariant {
  const parts = variantId.split(SEP);
  if (parts.length !== 4) {
    throw new Error(`Malformed variantId (expected 4 segments): ${variantId}`);
  }
  const [setId, number, finish, printing] = parts;
  if (!setId) throw new Error(`Missing setId in ${variantId}`);
  if (!number) throw new Error(`Missing collector number in ${variantId}`);
  if (!FINISHES.has(finish)) throw new Error(`Unknown finish "${finish}" in ${variantId}`);
  if (!PRINTINGS.has(printing)) throw new Error(`Unknown printing "${printing}" in ${variantId}`);

  return {
    variantId,
    setId,
    number,
    finish: finish as Finish,
    printing: printing as Printing,
  };
}

export function sameVariant(
  a: CanonicalPokemonCardVariant,
  b: CanonicalPokemonCardVariant,
): boolean {
  return a.variantId === b.variantId;
}

/** Human label for UI: "1st Edition Holofoil", "Reverse Holo", "Normal". */
export function variantLabel(v: CanonicalPokemonCardVariant): string {
  const finish =
    v.finish === Finish.Holofoil ? 'Holofoil'
    : v.finish === Finish.ReverseHolofoil ? 'Reverse Holo'
    : 'Normal';
  const printing =
    v.printing === Printing.FirstEdition ? '1st Edition '
    : v.printing === Printing.Shadowless ? 'Shadowless '
    : '';
  return `${printing}${finish}`;
}

/* ------------------------------------------------------------------ *
 * Foil treatment (spec §4)
 * ------------------------------------------------------------------ */

/**
 * Which shader the reveal uses. Deliberately coarse — the point of §4 is that
 * rare cards look meaningfully different, not that every rarity string gets a
 * bespoke effect.
 */
export const FoilTreatment = {
  Normal: 'normal',
  Holo: 'holo',
  ReverseHolo: 'reverse-holo',
  FullArt: 'full-art',
  SpecialIllustration: 'special-illustration',
  Gold: 'gold',
} as const;
export type FoilTreatment = (typeof FoilTreatment)[keyof typeof FoilTreatment];

// Matched longest-prefix-first within each tier, and tiers are checked in
// descending order of visual weight, so "Rare Secret" beats "Rare".
const GOLD_RARITIES = ['rare secret', 'hyper rare'];
const SIR_RARITIES = ['special illustration rare', 'rare rainbow', 'rare shiny gx'];
const FULL_ART_RARITIES = [
  'rare ultra',
  'ultra rare',
  'illustration rare',
  'trainer gallery rare holo',
  'rare holo vmax',
  'rare holo vstar',
  'rare holo v',
  'rare holo ex',
  'rare holo gx',
];
const HOLO_RARITIES = [
  'double rare',
  'amazing rare',
  'radiant rare',
  'rare break',
  'rare prime',
  'rare ace',
  'legend',
  'rare holo',
  'rare shiny',
];

/**
 * Pick the shader from rarity + finish. Reverse holo wins over the card's base
 * rarity because the foil pattern is a property of the print run, not of the
 * rarity slot.
 */
export function foilTreatmentFor(
  card: Pick<PokemonCard, 'rarity'>,
  variant: CanonicalPokemonCardVariant,
): FoilTreatment {
  if (variant.finish === Finish.ReverseHolofoil) return FoilTreatment.ReverseHolo;

  const rarity = (card.rarity ?? '').toLowerCase().trim();
  const has = (list: string[]) => list.some((r) => rarity === r || rarity.startsWith(r));

  if (has(GOLD_RARITIES)) return FoilTreatment.Gold;
  if (has(SIR_RARITIES)) return FoilTreatment.SpecialIllustration;
  if (has(FULL_ART_RARITIES)) return FoilTreatment.FullArt;
  if (has(HOLO_RARITIES)) return FoilTreatment.Holo;

  // A holofoil print of an otherwise plain rarity still gets a holo sheen.
  if (variant.finish === Finish.Holofoil) return FoilTreatment.Holo;
  return FoilTreatment.Normal;
}

/* ------------------------------------------------------------------ *
 * Variant discovery
 * ------------------------------------------------------------------ */

export interface DiscoveredVariant {
  variant: CanonicalPokemonCardVariant;
  /**
   * `reported` — the pricing provider returned a price block for this variant,
   * so we know it exists. `inferred` — we believe it exists from rarity, but no
   * provider confirmed it. Ingestion must not build pack pool entries from
   * `inferred` variants without review, because an unconfirmed variant has no
   * trustworthy price and therefore no trustworthy tier.
   */
  confidence: 'reported' | 'inferred';
}

/**
 * Derive the variants that actually exist for a card, preferring what the
 * pricing provider reported over what rarity implies.
 */
export function discoverVariants(
  card: PokemonCard,
  prices: PokemonPriceReport | null,
): DiscoveredVariant[] {
  const out: DiscoveredVariant[] = [];
  const add = (f: Finish, p: Printing, confidence: 'reported' | 'inferred') => {
    const variant = variantForCard(card, f, p);
    if (!out.some((d) => d.variant.variantId === variant.variantId)) {
      out.push({ variant, confidence });
    }
  };
  const any = (...vals: (number | null)[]) => vals.some((v) => v !== null);

  if (prices) {
    if (any(prices.normalLow, prices.normalMid, prices.normalHigh, prices.normalMarket))
      add(Finish.NonFoil, Printing.Unlimited, 'reported');
    if (any(prices.holofoilLow, prices.holofoilMid, prices.holofoilHigh, prices.holofoilMarket))
      add(Finish.Holofoil, Printing.Unlimited, 'reported');
    if (any(prices.reverseHolofoilLow, prices.reverseHolofoilMid, prices.reverseHolofoilHigh, prices.reverseHolofoilMarket))
      add(Finish.ReverseHolofoil, Printing.Unlimited, 'reported');
    if (any(prices.firstEditionNormalLow, prices.firstEditionNormalMid, prices.firstEditionNormalHigh, prices.firstEditionNormalMarket))
      add(Finish.NonFoil, Printing.FirstEdition, 'reported');
    if (any(prices.firstEditionHolofoilLow, prices.firstEditionHolofoilMid, prices.firstEditionHolofoilHigh, prices.firstEditionHolofoilMarket))
      add(Finish.Holofoil, Printing.FirstEdition, 'reported');
    if (any(prices.unlimitedHolofoilLow, prices.unlimitedHolofoilMid, prices.unlimitedHolofoilHigh, prices.unlimitedHolofoilMarket))
      add(Finish.Holofoil, Printing.Unlimited, 'reported');
  }

  if (out.length === 0) {
    const rarity = (card.rarity ?? '').toLowerCase();
    add(rarity.includes('holo') ? Finish.Holofoil : Finish.NonFoil, Printing.Unlimited, 'inferred');
  }
  return out;
}
