/** pnpm pokemon:sync:cards [--set=sv3pt5] — import cards and derive variants. */
import { arg, makeProvider, makeStore, report, die } from './_config.ts';
import { syncCards } from '../src/ingest.ts';

try {
  const setId = arg('set') || undefined;
  const { cards, variants } = await syncCards(makeProvider(), makeStore(), { setId });
  report('cards', cards);
  report('variants', variants);
} catch (err) { die(err); }
