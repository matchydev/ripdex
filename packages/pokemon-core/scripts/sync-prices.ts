/** pnpm pokemon:sync:prices [--set=sv3pt5] — observe one price row per variant per day. */
import { arg, makeProvider, makeStore, report, die } from './_config.ts';
import { syncPrices } from '../src/ingest.ts';

try {
  const setId = arg('set') || undefined;
  const { prices, variants, skipped, failed } = await syncPrices(
    makeProvider(),
    makeStore(),
    { setId },
  );
  report('prices', prices);
  report('variants', variants);
  console.log(`unpriced variants: ${skipped}`);

  // A partial price sync must not exit 0. A pool built on incomplete prices
  // would be missing outcomes, and openPack() would refuse it at snapshot time
  // anyway — better to fail here, where the cause is still visible.
  if (failed.length > 0) {
    console.error(`FAILED: ${failed.length} cards did not fetch. Re-run.`);
    process.exit(1);
  }
} catch (err) { die(err); }
