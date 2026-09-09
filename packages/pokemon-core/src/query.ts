/**
 * The catalog read model (spec §8, §9, §10).
 *
 * Builds a denormalized index over the store once, then answers browse queries
 * from memory. Requests never touch a provider.
 *
 * Grid rows are per CARD, not per variant, because eight near-identical
 * thumbnails of the same Charmander is a worse browse experience than one row
 * that says "2 variants". The headline price is the card's most valuable
 * priced variant; the detail view lists every variant with its own price, which
 * is where variant-exact pricing actually has to be visible.
 */

import type { CatalogStore, PriceRow, VariantRow } from './store.ts';
import type { PokemonCard, PokemonSet } from './types.ts';
import { parseVariantId, variantLabel, foilTreatmentFor, type FoilTreatment } from './variant.ts';
import { classifyTier, DEFAULT_TIER_CONFIG, type PullTier, type TierConfig } from './tiers.ts';

export interface VariantListing {
  variantId: string;
  label: string;
  finish: string;
  printing: string;
  foil: FoilTreatment;
  confidence: 'reported' | 'inferred';
  referenceValue: number | null;
  basis: string | null;
  currency: string;
  observedOn: string | null;
  sourceUrl: string | null;
  tier: PullTier | null;
  /** Present in at least one pack pool. */
  availableInPacks: boolean;
}

export interface CardListing {
  cardId: string;
  name: string;
  setId: string;
  setName: string;
  setSeries: string;
  setLogoUrl: string | null;
  setSymbolUrl: string | null;
  number: string;
  rarity: string | null;
  artist: string | null;
  types: string[];
  releaseDate: string | null;
  year: number | null;
  nationalPokedexNumbers: number[];
  imageSmall: string;
  imageLarge: string;
  variants: VariantListing[];
  /** Highest priced variant. Null when nothing on this card is priced. */
  headlineValue: number | null;
  headlineTier: PullTier | null;
  availableInPacks: boolean;
}

export interface CatalogIndex {
  cards: CardListing[];
  sets: PokemonSet[];
  byCardId: Map<string, CardListing>;
  byVariantId: Map<string, { card: CardListing; variant: VariantListing }>;
  facets: {
    sets: { id: string; name: string; series: string; count: number }[];
    series: string[];
    types: string[];
    rarities: string[];
    artists: string[];
    years: number[];
  };
}

export interface BuildIndexOptions {
  tierConfig?: TierConfig;
  /** variantIds that appear in at least one pack pool. */
  packVariantIds?: Set<string>;
}

export async function buildCatalogIndex(
  store: CatalogStore,
  opts: BuildIndexOptions = {},
): Promise<CatalogIndex> {
  const tierConfig = opts.tierConfig ?? DEFAULT_TIER_CONFIG;
  const inPacks = opts.packVariantIds ?? new Set<string>();

  const [cards, sets, variants, latest] = await Promise.all([
    store.listCards(),
    store.listSets(),
    store.listVariants(),
    store.latestPrices(),
  ]);

  const variantsByCard = new Map<string, VariantRow[]>();
  for (const v of variants) {
    const list = variantsByCard.get(v.cardId);
    if (list) list.push(v);
    else variantsByCard.set(v.cardId, [v]);
  }

  const listings: CardListing[] = cards.map((card) =>
    toListing(card, variantsByCard.get(card.id) ?? [], latest, inPacks, tierConfig),
  );

  const byCardId = new Map(listings.map((l) => [l.cardId, l]));
  const byVariantId = new Map<string, { card: CardListing; variant: VariantListing }>();
  for (const card of listings) {
    for (const variant of card.variants) byVariantId.set(variant.variantId, { card, variant });
  }

  return { cards: listings, sets, byCardId, byVariantId, facets: buildFacets(listings, sets) };
}

function toListing(
  card: PokemonCard,
  rows: VariantRow[],
  latest: Map<string, PriceRow>,
  inPacks: Set<string>,
  tierConfig: TierConfig,
): CardListing {
  const variants: VariantListing[] = rows.map((row) => {
    const price = latest.get(row.variantId) ?? null;
    const parsed = parseVariantId(row.variantId);
    const value = price?.quote.referenceValue ?? null;
    return {
      variantId: row.variantId,
      label: variantLabel(parsed),
      finish: row.finish,
      printing: row.printing,
      foil: foilTreatmentFor(card, parsed),
      confidence: row.confidence,
      referenceValue: value,
      basis: price?.quote.basis ?? null,
      currency: price?.quote.currency ?? 'USD',
      observedOn: price?.observedOn ?? null,
      sourceUrl: price?.quote.sourceUrl ?? null,
      tier: value === null ? null : classifyTier(value, tierConfig),
      availableInPacks: inPacks.has(row.variantId),
    };
  });

  variants.sort((a, b) => (b.referenceValue ?? -1) - (a.referenceValue ?? -1));
  const headline = variants.find((v) => v.referenceValue !== null) ?? null;
  const year = card.setReleaseDate ? Number(card.setReleaseDate.slice(0, 4)) : null;

  return {
    cardId: card.id,
    name: card.name,
    setId: card.setId,
    setName: card.setName,
    setSeries: card.setSeries,
    setLogoUrl: card.setLogoUrl,
    setSymbolUrl: card.setSymbolUrl,
    number: card.number,
    rarity: card.rarity,
    artist: card.artist,
    types: card.types,
    releaseDate: card.setReleaseDate,
    year: Number.isFinite(year) ? year : null,
    nationalPokedexNumbers: card.nationalPokedexNumbers,
    imageSmall: card.images.small,
    imageLarge: card.images.large,
    variants,
    headlineValue: headline?.referenceValue ?? null,
    headlineTier: headline?.tier ?? null,
    availableInPacks: variants.some((v) => v.availableInPacks),
  };
}

function buildFacets(cards: CardListing[], sets: PokemonSet[]): CatalogIndex['facets'] {
  const setCounts = new Map<string, number>();
  const types = new Set<string>();
  const rarities = new Set<string>();
  const artists = new Set<string>();
  const years = new Set<number>();
  const series = new Set<string>();

  for (const c of cards) {
    setCounts.set(c.setId, (setCounts.get(c.setId) ?? 0) + 1);
    c.types.forEach((t) => types.add(t));
    if (c.rarity) rarities.add(c.rarity);
    if (c.artist) artists.add(c.artist);
    if (c.year) years.add(c.year);
    series.add(c.setSeries);
  }

  return {
    sets: sets
      .filter((s) => setCounts.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, series: s.series, count: setCounts.get(s.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    series: [...series].sort(),
    types: [...types].sort(),
    rarities: [...rarities].sort(),
    artists: [...artists].sort(),
    years: [...years].sort((a, b) => b - a),
  };
}

/* ------------------------------------------------------------------ *
 * Querying (spec §9)
 * ------------------------------------------------------------------ */

export type CardSort =
  | 'value-desc'
  | 'value-asc'
  | 'newest'
  | 'oldest'
  | 'rarity'
  | 'name'
  | 'number';

export interface CardQuery {
  search?: string;
  setId?: string;
  series?: string;
  type?: string;
  rarity?: string;
  artist?: string;
  year?: number;
  minPrice?: number;
  maxPrice?: number;
  availableInPacks?: boolean;
  sort?: CardSort;
  page?: number;
  pageSize?: number;
}

export interface CardQueryResult {
  cards: CardListing[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

/**
 * Rarity ladder, least to most rare. A rarity string the ladder has not learned
 * yet scores BELOW every known rarity rather than throwing — new sets introduce
 * new rarity strings constantly and a browse page must not 500 on one.
 *
 * Below, not above. Every consumer of this ladder sorts rarest-first, so a
 * sentinel above `Hyper Rare` would head the list with every card from a
 * brand-new set plus every card carrying no rarity at all. Unknown is not rare,
 * it is unknown, and ranking it as the rarest thing in the catalog is the
 * failure this sentinel exists to avoid.
 */
const RARITY_ORDER = [
  'Common', 'Uncommon', 'Rare', 'Rare Holo', 'Double Rare', 'Rare Holo EX',
  'Rare Holo GX', 'Rare Holo V', 'Rare Holo VMAX', 'Rare Holo VSTAR',
  'Radiant Rare', 'Amazing Rare', 'Ultra Rare', 'Rare Ultra', 'Illustration Rare',
  'Rare Rainbow', 'Special Illustration Rare', 'Rare Secret', 'Hyper Rare',
];
/**
 * -1 for both an unrecognized rarity and a missing one. Exported so the binder's
 * rarity sort reads this ladder instead of copying it.
 */
export const rarityRank = (r: string | null): number => (r ? RARITY_ORDER.indexOf(r) : -1);

/** Numeric part of a collector number, for natural ordering ("10" after "9"). */
export const numericPart = (n: string): number => {
  const m = /\d+/.exec(n);
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
};

export function queryCards(index: CatalogIndex, q: CardQuery = {}): CardQueryResult {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 60));
  const needle = q.search?.trim().toLowerCase();

  let rows = index.cards.filter((c) => {
    if (q.setId && c.setId !== q.setId) return false;
    if (q.series && c.setSeries !== q.series) return false;
    if (q.type && !c.types.includes(q.type)) return false;
    if (q.rarity && c.rarity !== q.rarity) return false;
    if (q.artist && c.artist !== q.artist) return false;
    if (q.year && c.year !== q.year) return false;
    if (q.availableInPacks && !c.availableInPacks) return false;

    if (q.minPrice !== undefined || q.maxPrice !== undefined) {
      // An unpriced card is excluded from a price-bounded query rather than
      // treated as 0 — "cards under $5" should not be dominated by cards whose
      // price we simply do not know.
      if (c.headlineValue === null) return false;
      if (q.minPrice !== undefined && c.headlineValue < q.minPrice) return false;
      if (q.maxPrice !== undefined && c.headlineValue > q.maxPrice) return false;
    }

    if (needle) {
      const hay = `${c.name} ${c.setName} ${c.number} ${c.rarity ?? ''} ${c.artist ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  rows = sortCards(rows, q.sort ?? 'value-desc');

  const totalCount = rows.length;
  const start = (page - 1) * pageSize;
  return {
    cards: rows.slice(start, start + pageSize),
    page,
    pageSize,
    totalCount,
    hasMore: start + pageSize < totalCount,
  };
}

function sortCards(rows: CardListing[], sort: CardSort): CardListing[] {
  const out = [...rows];
  switch (sort) {
    case 'value-asc':
      // Unpriced cards sink in both value directions; they carry no signal.
      return out.sort(
        (a, b) => (a.headlineValue ?? Infinity) - (b.headlineValue ?? Infinity),
      );
    case 'newest':
      return out.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
    case 'oldest':
      return out.sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''));
    case 'rarity':
      return out.sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity));
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name));
    case 'number':
      return out.sort(
        (a, b) =>
          a.setId.localeCompare(b.setId) || numericPart(a.number) - numericPart(b.number),
      );
    default:
      return out.sort((a, b) => (b.headlineValue ?? -1) - (a.headlineValue ?? -1));
  }
}

/** Top cards by value, for the grail gallery (spec §10). */
export function topGrails(index: CatalogIndex, limit = 60, minValue = 500): CardListing[] {
  return index.cards
    .filter((c) => (c.headlineValue ?? 0) >= minValue)
    .sort((a, b) => (b.headlineValue ?? 0) - (a.headlineValue ?? 0))
    .slice(0, limit);
}

/** Resolve a canonical card route, /pokemon/:setId/:number (spec §8). */
export function findByRoute(index: CatalogIndex, setId: string, number: string): CardListing | null {
  return (
    index.cards.find((c) => c.setId === setId && c.number === number) ?? null
  );
}
