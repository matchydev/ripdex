/**
 * Normalized Pokémon catalog model (spec §1).
 *
 * This is RIPDEX's internal shape. External providers (pokemontcg.io, a
 * partner asset feed, a pricing vendor) are adapters that map INTO this.
 * UI code must never see a provider's raw response.
 */

export interface PokemonSet {
  id: string;
  name: string;
  series: string;
  symbolUrl: string | null;
  logoUrl: string | null;
  /** ISO-8601 date (YYYY-MM-DD). */
  releaseDate: string | null;
  /** Cards in the set including secret rares. */
  total: number | null;
  /** Number printed on the card ("102" of 102), excludes secrets. */
  printedTotal: number | null;
}

export interface PokemonAttack {
  name: string;
  cost: string[];
  convertedEnergyCost: number;
  damage: string;
  text: string;
}

export interface PokemonTypeModifier {
  type: string;
  value: string;
}

export interface PokemonLegalities {
  standard?: string;
  expanded?: string;
  unlimited?: string;
}

export interface PokemonImages {
  /** Thumbnail / grid use. */
  small: string;
  /** Reveal + detail page use. Never downscale this for a reveal. */
  large: string;
}

/**
 * A card as printed — the metadata that is identical across every finish of
 * the same collector number. Prices and variant identity live separately,
 * because a Base Set Charizard "normal" and "1st Edition Holofoil" share this
 * record but are emphatically not the same product. See `variant.ts`.
 */
export interface PokemonCard {
  /** Provider-stable card id, e.g. "base1-4". NOT a variant identity. */
  id: string;
  name: string;
  supertype: string;
  subtypes: string[];
  types: string[];
  hp: number | null;
  evolvesFrom: string | null;
  evolvesTo: string[];
  rules: string[];
  attacks: PokemonAttack[];
  weaknesses: PokemonTypeModifier[];
  resistances: PokemonTypeModifier[];
  retreatCost: string[];
  convertedRetreatCost: number | null;

  setId: string;
  setName: string;
  setSeries: string;
  setSymbolUrl: string | null;
  setLogoUrl: string | null;
  setReleaseDate: string | null;
  setTotal: number | null;

  /** Collector number as printed — string, because "SV107" and "TG12" exist. */
  number: string;
  artist: string | null;
  rarity: string | null;
  flavorText: string | null;
  nationalPokedexNumbers: number[];
  legalities: PokemonLegalities;
  images: PokemonImages;

  /** Provider attribution, for the source block on the detail page (§8). */
  source: {
    provider: string;
    fetchedAt: string;
  };
}

/** Raw pricing as reported by a provider, before variant resolution (§1). */
export interface PokemonPriceReport {
  tcgplayerUrl: string | null;
  tcgplayerUpdatedAt: string | null;

  normalLow: number | null;
  normalMid: number | null;
  normalHigh: number | null;
  normalMarket: number | null;

  holofoilLow: number | null;
  holofoilMid: number | null;
  holofoilHigh: number | null;
  holofoilMarket: number | null;

  reverseHolofoilLow: number | null;
  reverseHolofoilMid: number | null;
  reverseHolofoilHigh: number | null;
  reverseHolofoilMarket: number | null;

  firstEditionNormalLow: number | null;
  firstEditionNormalMid: number | null;
  firstEditionNormalHigh: number | null;
  firstEditionNormalMarket: number | null;

  firstEditionHolofoilLow: number | null;
  firstEditionHolofoilMid: number | null;
  firstEditionHolofoilHigh: number | null;
  firstEditionHolofoilMarket: number | null;

  unlimitedHolofoilLow: number | null;
  unlimitedHolofoilMid: number | null;
  unlimitedHolofoilHigh: number | null;
  unlimitedHolofoilMarket: number | null;

  /** Currency of every figure above. Providers are not all USD. */
  currency: string;
}
