/**
 * Provider seams (spec §24).
 *
 * Metadata, images and pricing are three independent concerns with three
 * independent contracts. Swapping any one of them — a public API today, the
 * partnership asset feed later — is a config change plus one adapter, and
 * touches no UI.
 */

import type { PokemonCard, PokemonSet, PokemonPriceReport } from './types.ts';

export interface CardPage {
  cards: PokemonCard[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface ListCardsQuery {
  setId?: string;
  /** Free-text name search. */
  name?: string;
  page?: number;
  pageSize?: number;
}

/** Card and set metadata. Replaces the old generic CardCatalogProvider. */
export interface PokemonCatalogProvider {
  readonly name: string;
  listSets(): Promise<PokemonSet[]>;
  getSet(setId: string): Promise<PokemonSet | null>;
  listCards(query: ListCardsQuery): Promise<CardPage>;
  getCard(cardId: string): Promise<PokemonCard | null>;
}

/** Market data. Separate because pricing vendors change more often than metadata. */
export interface PokemonPricingProvider {
  readonly name: string;
  readonly currency: string;
  getPrices(cardId: string): Promise<PokemonPriceReport | null>;
  getPricesBatch(cardIds: string[]): Promise<Map<string, PokemonPriceReport>>;
}

export type ImageIntent = 'thumbnail' | 'grid' | 'detail' | 'reveal' | 'social';

/**
 * Resolves a source image URL into a delivery URL. Implementations may point
 * at a CDN, an image-optimizing proxy, or pass the origin through unchanged.
 *
 * `reveal` and `social` intents must never be downscaled below the source
 * resolution (spec §1, §21) — implementations are expected to honour that.
 */
export interface ImageDeliveryProvider {
  readonly name: string;
  resolve(sourceUrl: string, intent: ImageIntent): string;
  /** srcset for responsive grids. Empty array means "use resolve() only". */
  srcSet(sourceUrl: string, intent: ImageIntent): { url: string; width: number }[];
}

/** Pass-through delivery, for development before a CDN is configured. */
export class PassthroughImageDelivery implements ImageDeliveryProvider {
  readonly name = 'passthrough';
  resolve(sourceUrl: string): string {
    return sourceUrl;
  }
  srcSet(): { url: string; width: number }[] {
    return [];
  }
}
