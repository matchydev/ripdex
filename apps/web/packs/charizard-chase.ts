/**
 * CHARIZARD CHASE — a RIPDEX pack configuration (spec §3).
 *
 * A curated pool, not a reproduction of any physical booster's slot structure.
 * Every entry addresses a canonical variantId, so the 1st Edition and Unlimited
 * printings of one card can sit in the pool at different weights and prices.
 *
 * Weights are integers so the published odds table is exact.
 */

import type { PackConfig } from '../../../packages/pokemon-core/src/index.ts';

export const CHARIZARD_CHASE: PackConfig = {
  id: 'charizard-chase',
  name: 'CHARIZARD CHASE',
  version: '1',
  cardsPerPack: 1,
  priceRip: 100_000n,
  distributionModel: { kind: 'flat' },
  allowDuplicatesWithinPack: true,
  artwork: {
    wrapperAssetKey: 'wrapper/charizard-chase',
    heroAssetKey: 'hero/charizard',
    accentColor: '#FF6B1A',
    backgroundColor: '#0B0608',
    foilTone: 'crimson',
    texture: 'gloss',
    // Its own hero: falling back to the pool's top card would render the same
    // Base Set Charizard wrapper as BASE SET RIP, and two identical packs
    // sitting side by side on the homepage read as a bug.
    heroImageUrl: 'https://images.pokemontcg.io/sv3pt5/199_hires.png',
  },
  pool: [
    { variantId: 'sv3pt5|4|non-foil|unlimited', weight: 3400 },
    { variantId: 'sv3pt5|4|reverse-holofoil|unlimited', weight: 2100 },
    { variantId: 'sv3pt5|5|non-foil|unlimited', weight: 2000 },
    { variantId: 'sv3pt5|5|reverse-holofoil|unlimited', weight: 1400 },
    { variantId: 'sv3pt5|6|holofoil|unlimited', weight: 900 },
    { variantId: 'sv3pt5|183|holofoil|unlimited', weight: 170 },
    { variantId: 'sv3pt5|199|holofoil|unlimited', weight: 26 },
    { variantId: 'base1|4|holofoil|unlimited', weight: 4 },
  ],
};

export const PACKS: PackConfig[] = [CHARIZARD_CHASE];

export function packVariantIds(packs: PackConfig[] = PACKS): Set<string> {
  return new Set(packs.flatMap((p) => p.pool.map((e) => e.variantId)));
}
