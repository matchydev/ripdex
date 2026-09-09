/**
 * The pack registry.
 *
 * Hand-authored configs live beside generated ones. Generated pools are pinned
 * JSON produced by generate.ts and reviewed by a human before commit — see the
 * note at the top of that file for why they are not derived at boot.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PackConfig } from '../../../packages/pokemon-core/src/index.ts';
import { CHARIZARD_CHASE } from './charizard-chase.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = join(HERE, 'generated');

interface GeneratedPack {
  id: string;
  name: string;
  version: string;
  cardsPerPack: number;
  /** String in JSON — JSON has no bigint, and $RIP amounts must not go through a float. */
  priceRip: string;
  distributionModel: { kind: string };
  allowDuplicatesWithinPack: boolean;
  artwork: Record<string, string | null>;
  pool: { variantId: string; weight: number }[];
}

function hydrate(raw: GeneratedPack): PackConfig {
  return {
    id: raw.id,
    name: raw.name,
    version: raw.version,
    cardsPerPack: raw.cardsPerPack,
    priceRip: BigInt(raw.priceRip),
    distributionModel: { kind: 'flat' },
    allowDuplicatesWithinPack: raw.allowDuplicatesWithinPack,
    artwork: raw.artwork as unknown as PackConfig['artwork'],
    pool: raw.pool,
  };
}

export async function loadPacks(): Promise<PackConfig[]> {
  const packs: PackConfig[] = [CHARIZARD_CHASE];
  let files: string[] = [];
  try {
    files = (await readdir(GENERATED_DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    // No generated directory yet: run `node apps/web/packs/generate.ts`.
    return packs;
  }

  for (const file of files.sort()) {
    const raw = JSON.parse(await readFile(join(GENERATED_DIR, file), 'utf8')) as GeneratedPack;
    packs.push(hydrate(raw));
  }
  return packs;
}

export function packVariantIds(packs: PackConfig[]): Set<string> {
  return new Set(packs.flatMap((p) => p.pool.map((e) => e.variantId)));
}

/** The pack the homepage leads with. */
export const FEATURED_PACK_ID = 'charizard-chase';
