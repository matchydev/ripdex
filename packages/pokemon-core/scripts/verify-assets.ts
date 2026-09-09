/** pnpm pokemon:verify-assets [--set=sv3pt5] — confirm every referenced asset resolves. */
import { arg, makeStore, die } from './_config.ts';
import { verifyAssets } from '../src/ingest.ts';

try {
  const setId = arg('set') || undefined;
  const rep = await verifyAssets(makeStore(), { setId });
  console.log(`checked ${rep.checked}, ok ${rep.ok}, issues ${rep.issues.length}`);
  for (const i of rep.issues.slice(0, 40)) {
    console.log(`  ${i.kind} ${i.id} -> ${i.status}  ${i.url}`);
  }
  if (rep.issues.length > 40) console.log(`  (+${rep.issues.length - 40} more)`);
  process.exit(rep.issues.length === 0 ? 0 : 1);
} catch (err) { die(err); }
