/**
 * Pack pool generator.
 *
 * Derives a curated pool from the ingested catalog and writes a PINNED config
 * to packs/generated/<id>.json.
 *
 * The pinning is the point. Deriving a pool at server boot would mean the
 * published odds silently changed every time the market moved, which is exactly
 * the property a provably-fair product cannot have. So this is a deliberate
 * offline step: a human runs it, reviews the diff, and commits the result.
 * Bump `version` whenever the pool or weights change.
 *
 *   node apps/web/packs/generate.ts
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  JsonCatalogStore,
  buildCatalogIndex,
  type CardListing,
  type CatalogIndex,
} from '../../../packages/pokemon-core/src/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', '..', '..', 'packages', 'pokemon-core', 'data', 'catalog');
const OUT_DIR = join(HERE, 'generated');

interface PackRecipe {
  id: string;
  name: string;
  version: string;
  priceRip: string;
  setId?: string;
  /** Restrict to cards whose name contains one of these (case-insensitive). */
  nameMatches?: string[];
  /** How many outcomes the pool should hold. */
  size: number;
  artwork: Record<string, string>;
  /** Card used as the wrapper hero. */
  heroCardId: string;
}

const RECIPES: PackRecipe[] = [
  {
    id: 'base-set-rip',
    name: 'BASE SET RIP',
    version: '1',
    priceRip: '250000',
    setId: 'base1',
    size: 24,
    heroCardId: 'base1-4',
    artwork: {
      wrapperAssetKey: 'wrapper/base-set-rip',
      heroAssetKey: 'hero/base-set',
      accentColor: '#C9A227',
      backgroundColor: '#0A0806',
      foilTone: 'gold',
      texture: 'aged',
    },
  },
  {
    id: '151-rip',
    name: '151 RIP',
    version: '1',
    priceRip: '60000',
    setId: 'sv3pt5',
    size: 28,
    heroCardId: 'sv3pt5-151',
    artwork: {
      wrapperAssetKey: 'wrapper/151-rip',
      heroAssetKey: 'hero/151',
      accentColor: '#E14B4B',
      backgroundColor: '#080A0F',
      foilTone: 'cool',
      texture: 'clean',
    },
  },
  {
    // Vintage Jungle: a small set, but stacked — Snorlax, Jolteon, Scyther.
    id: 'jungle-rip',
    name: 'JUNGLE RIP',
    version: '1',
    priceRip: '600000',
    setId: 'base2',
    size: 14,
    heroCardId: 'base2-11',
    artwork: {
      wrapperAssetKey: 'wrapper/jungle-rip',
      heroAssetKey: 'hero/jungle',
      accentColor: '#43B85F',
      backgroundColor: '#060A07',
      foilTone: 'cool',
      texture: 'aged',
    },
  },
  {
    // The big modern set. Cheaper case, deeper pool, a Charizard ex up top.
    id: 'obsidian-flames-rip',
    name: 'OBSIDIAN FLAMES',
    version: '1',
    priceRip: '45000',
    setId: 'sv3',
    size: 30,
    heroCardId: 'sv3-223',
    artwork: {
      wrapperAssetKey: 'wrapper/obsidian-flames',
      heroAssetKey: 'hero/obsidian',
      accentColor: '#F0562A',
      backgroundColor: '#0B0605',
      foilTone: 'crimson',
      texture: 'gloss',
    },
  },
  {
    // A cross-set themed case: the three Kanto starter lines, cheap Charmanders
    // to a $897 Base Set Charizard. The clearest "themed gambling case".
    id: 'kanto-starters-rip',
    name: 'KANTO STARTERS',
    version: '1',
    priceRip: '90000',
    nameMatches: [
      'Charizard', 'Charmeleon', 'Charmander',
      'Blastoise', 'Wartortle', 'Squirtle',
      'Venusaur', 'Ivysaur', 'Bulbasaur',
    ],
    size: 22,
    heroCardId: 'base1-4',
    artwork: {
      wrapperAssetKey: 'wrapper/kanto-starters',
      heroAssetKey: 'hero/kanto-starters',
      accentColor: '#E9A23B',
      backgroundColor: '#0A0806',
      foilTone: 'warm',
      texture: 'clean',
    },
  },
];

/**
 * Weight is inversely proportional to value, so cheap cards are common and
 * expensive ones are rare. The exponent controls how steep that is: at 1.0 a
 * $100 card is 100x rarer than a $1 card, which makes grails effectively
 * unreachable. 0.85 keeps the tail hittable while preserving the ordering.
 */
const CURVE = 0.85;
const MIN_WEIGHT = 1;

function weightFor(value: number): number {
  // Floor the value so a $0.01 common does not get an absurd weight.
  const v = Math.max(0.15, value);
  return Math.max(MIN_WEIGHT, Math.round(10_000 / Math.pow(v, CURVE)));
}

function eligible(index: CatalogIndex, recipe: PackRecipe): CardListing[] {
  return index.cards.filter((c) => {
    if (recipe.setId && c.setId !== recipe.setId) return false;
    if (c.headlineValue === null) return false;
    // Only variants a pricing provider confirmed can enter a pool: an inferred
    // variant has no trustworthy price and therefore no trustworthy odds.
    if (!c.variants.some((v) => v.confidence === 'reported' && v.referenceValue !== null)) {
      return false;
    }
    if (recipe.nameMatches) {
      const n = c.name.toLowerCase();
      if (!recipe.nameMatches.some((m) => n.includes(m.toLowerCase()))) return false;
    }
    return true;
  });
}

/**
 * Pick `size` cards spanning the value range rather than the top `size` by
 * value — a pool of nothing but chase cards has no texture, and one of nothing
 * but commons has no chase. Take the most valuable few, then sample evenly
 * across the rest by value rank.
 */
function selectSpread(cards: CardListing[], size: number): CardListing[] {
  const sorted = [...cards].sort((a, b) => (b.headlineValue ?? 0) - (a.headlineValue ?? 0));
  if (sorted.length <= size) return sorted;

  const topCount = Math.min(6, Math.floor(size / 4));
  const picked = sorted.slice(0, topCount);
  const rest = sorted.slice(topCount);
  const step = rest.length / (size - topCount);
  for (let i = 0; i < size - topCount; i++) {
    picked.push(rest[Math.floor(i * step)]);
  }
  return picked;
}

async function main(): Promise<void> {
  const store = new JsonCatalogStore(DATA_DIR);
  const index = await buildCatalogIndex(store);
  await mkdir(OUT_DIR, { recursive: true });

  for (const recipe of RECIPES) {
    const pool = selectSpread(eligible(index, recipe), recipe.size).map((card) => {
      // Use the card's most valuable REPORTED variant — headlineValue may come
      // from a variant we would not put in a pool.
      const variant = card.variants.find(
        (v) => v.confidence === 'reported' && v.referenceValue !== null,
      )!;
      return {
        variantId: variant.variantId,
        weight: weightFor(variant.referenceValue ?? 1),
        _card: `${card.name} (${card.setName} ${card.number}) ${variant.label}`,
        _value: variant.referenceValue,
      };
    });

    const total = pool.reduce((s, e) => s + e.weight, 0);
    const ev = pool.reduce((s, e) => s + (e.weight / total) * (e._value ?? 0), 0);
    const hero = index.byCardId.get(recipe.heroCardId) ?? null;

    const config = {
      id: recipe.id,
      name: recipe.name,
      version: recipe.version,
      cardsPerPack: 1,
      priceRip: recipe.priceRip,
      distributionModel: { kind: 'flat' },
      allowDuplicatesWithinPack: true,
      artwork: { ...recipe.artwork, heroImageUrl: hero?.imageLarge ?? null },
      pool: pool.map(({ variantId, weight }) => ({ variantId, weight })),
      _generated: {
        note: 'Generated by packs/generate.ts. Review before committing. Do not hand-edit.',
        totalWeight: total,
        expectedReferenceValue: Number(ev.toFixed(4)),
        outcomes: pool
          .map((e) => ({
            card: e._card,
            value: e._value,
            odds: `${((e.weight / total) * 100).toFixed(4)}%`,
          }))
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
      },
    };

    const path = join(OUT_DIR, `${recipe.id}.json`);
    await writeFile(path, JSON.stringify(config, null, 2) + '\n', 'utf8');
    console.log(
      `${recipe.name}: ${pool.length} outcomes, EV $${ev.toFixed(2)}, ` +
        `top $${Math.max(...pool.map((e) => e._value ?? 0)).toFixed(2)} -> ${path}`,
    );
  }
}

await main();
