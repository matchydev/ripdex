/**
 * Seed the ledger with real rips.
 *
 * This is not a fixture generator: it drives the actual §17 sequence end to
 * end — build a price snapshot from the ingested catalog, lock each pack
 * config, commit a server seed, then call `openPack` for real. Every stored
 * rip is therefore independently verifiable with the same maths a user would
 * use, and the feed, binder and achievements read genuine data.
 *
 *   node apps/web/scripts/seed-rips.ts [--rips=200] [--wallets=12]
 *
 * The server seed is written to the ledger directory in the clear, because
 * these are demo rips whose whole point is being checkable. A production
 * seeder would keep it secret until rotation.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';

import {
  JsonCatalogStore,
  JsonOpeningLedger,
  buildCatalogIndex,
  buildPriceSnapshot,
  lockPackConfig,
  openPack,
  fromOpenResult,
  createSeedCommitment,
  type PackConfig,
  type PriceQuote,
} from '../../../packages/pokemon-core/src/index.ts';
import { loadPacks } from '../packs/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const DATA_DIR = join(ROOT, 'packages', 'pokemon-core', 'data', 'catalog');
const LEDGER_DIR = join(ROOT, 'packages', 'pokemon-core', 'data', 'ledger');

function arg(name: string, fallback: number): number {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  const n = hit ? Number(hit.split('=')[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Deterministic pseudo-wallets. Real addresses are not needed and inventing
 * plausible-looking ones that might collide with real accounts is worse than
 * an obviously synthetic prefix.
 */
function demoWallet(i: number): string {
  const hex = (i * 2654435761 >>> 0).toString(16).padStart(8, '0');
  return `0xDEMO${hex}${(i * 40503 >>> 0).toString(16).padStart(6, '0').slice(0, 6)}`;
}

async function main(): Promise<void> {
  const ripCount = arg('rips', 200);
  const walletCount = arg('wallets', 12);

  const store = new JsonCatalogStore(DATA_DIR);
  const index = await buildCatalogIndex(store);
  const packs = await loadPacks();

  // 1-2. One snapshot covering every outcome in every pack. openPack refuses
  // to run if a pool entry is missing from it, so any gap fails loudly here
  // rather than producing a rip with an improvised value.
  const quotes: Record<string, PriceQuote> = {};
  const missing: string[] = [];
  for (const pack of packs) {
    for (const entry of pack.pool) {
      if (quotes[entry.variantId]) continue;
      const hit = index.byVariantId.get(entry.variantId);
      const value = hit?.variant.referenceValue ?? null;
      if (value === null) {
        missing.push(entry.variantId);
        continue;
      }
      quotes[entry.variantId] = {
        variantId: entry.variantId,
        low: null, mid: null, high: null, market: value,
        referenceValue: value,
        basis: 'market',
        currency: hit?.variant.currency ?? 'USD',
        source: 'catalog-snapshot',
        sourceUrl: hit?.variant.sourceUrl ?? null,
        sourceUpdatedAt: hit?.variant.observedOn ?? null,
      };
    }
  }

  if (missing.length) {
    console.error(
      `${missing.length} pool variant(s) have no price in the catalog. ` +
        `Run pokemon:sync:prices for their sets first:\n  ${missing.slice(0, 8).join('\n  ')}`,
    );
    process.exit(1);
  }

  const priceSnapshot = buildPriceSnapshot(quotes, {
    provider: 'catalog-snapshot',
    currency: 'USD',
    // Long TTL: a seeding run walks a simulated clock backwards over days, and
    // openPack rejects an expired snapshot.
    ttlMs: 365 * 24 * 60 * 60 * 1000,
  });

  // 3. Lock every pack config.
  const locked = new Map(packs.map((p: PackConfig) => [p.id, lockPackConfig(p)]));

  // 4-5. Commit a server seed up front — this is the hash a user would have
  // been shown before ripping.
  const commitment = createSeedCommitment();
  const ledger = new JsonOpeningLedger(LEDGER_DIR);

  const now = Date.now();
  let stored = 0;
  const tiers = new Map<string, number>();
  let best: { name: string; value: number } | null = null;

  for (let i = 0; i < ripCount; i++) {
    const wallet = demoWallet(i % walletCount);
    const pack = packs[i % packs.length];
    const packSnapshot = locked.get(pack.id)!;

    // Spread rips backwards over ~10 days so relative timestamps and the
    // binder's pull-date sort have a real spread to work with.
    const openedAt = new Date(now - Math.floor((i / ripCount) * 10 * 86_400_000) - i * 1000);

    // 6. Draw.
    const result = openPack({
      packSnapshot,
      priceSnapshot,
      inputs: { serverSeed: commitment.serverSeed, clientSeed: wallet, nonce: i },
      now: openedAt,
    });

    // 7. Store.
    const record = await ledger.record(fromOpenResult(result, wallet));
    if (record.stored) stored++;

    for (const card of result.cards) {
      tiers.set(card.tier, (tiers.get(card.tier) ?? 0) + 1);
      const name = index.byVariantId.get(card.variantId)?.card.name ?? card.variantId;
      if (!best || card.quote.referenceValue > best.value) {
        best = { name, value: card.quote.referenceValue };
      }
    }
  }

  await ledger.close();
  await mkdir(LEDGER_DIR, { recursive: true });
  await writeFile(
    join(LEDGER_DIR, 'seed-reveal.json'),
    JSON.stringify(
      {
        note: 'Demo seed, revealed so every rip above can be recomputed.',
        serverSeed: commitment.serverSeed,
        serverSeedHash: commitment.serverSeedHash,
        priceSnapshotId: priceSnapshot.snapshotId,
        priceSnapshotHash: priceSnapshot.contentHash,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(`${stored} rips stored across ${walletCount} wallets and ${packs.length} packs`);
  console.log(`tiers: ${[...tiers].sort().map(([t, n]) => `${t}=${n}`).join('  ')}`);
  console.log(`best pull: ${best?.name} at $${best?.value.toFixed(2)}`);
}

await main();
