/** pnpm pokemon:sync:sets — import set metadata, logos and symbols. */
import { makeProvider, makeStore, report, die } from './_config.ts';
import { syncSets } from '../src/ingest.ts';

try {
  report('sets', await syncSets(makeProvider(), makeStore()));
} catch (err) { die(err); }
