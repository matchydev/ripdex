/**
 * One-command bootstrap for a fresh clone.
 *
 *   pnpm setup
 *
 * The catalog is committed, so this only has to build the things that are
 * deliberately left out of git: the rip ledger. It is idempotent — running it
 * on a machine that already has data is a no-op that just reports state.
 */

import { spawn } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'packages', 'pokemon-core', 'data', 'catalog');
const LEDGER = join(ROOT, 'packages', 'pokemon-core', 'data', 'ledger');

const [MAJOR, MINOR] = process.versions.node.split('.').map(Number);
if (MAJOR < 22 || (MAJOR === 22 && MINOR < 6)) {
  console.error(
    `RIPDEX needs Node 22.6+ (found ${process.versions.node}).\n` +
      `It runs TypeScript directly with no build step, which needs native type stripping.`,
  );
  process.exit(1);
}

const exists = (p) => access(p).then(() => true, () => false);

function run(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: ROOT, stdio: 'inherit' });
    child.on('error', reject);
    // seed-rips exits non-zero only on a fetch failure it already reported; the
    // catalog work it did still counts, so surface the code rather than throwing.
    child.on('close', (code) => resolve(code ?? 0));
  });
}

async function countCards() {
  try {
    return JSON.parse(await readFile(join(CATALOG, 'cards.json'), 'utf8')).length;
  } catch {
    return 0;
  }
}

const cards = await countCards();
if (cards === 0) {
  console.error(
    'No catalog found. It is normally committed — if you are on a fresh clone this\n' +
      'means the data directory did not come across. Rebuild it with:\n' +
      '  pnpm pokemon:sync:sets\n' +
      '  pnpm pokemon:sync:cards --set=base1   (repeat per set: base2, sv3, sv3pt5)\n' +
      '  pnpm pokemon:sync:prices --set=base1  (repeat per set)\n' +
      'The upstream API is flaky; re-run any set that reports failures.',
  );
  process.exit(1);
}
console.log(`catalog: ${cards} cards`);

if (await exists(join(LEDGER, 'openings.json'))) {
  console.log('ledger: already present, leaving it alone');
} else {
  console.log('ledger: seeding rips through the real opening sequence...');
  await run(join(ROOT, 'apps', 'web', 'packs', 'generate.ts'));
  await run(join(ROOT, 'apps', 'web', 'scripts', 'seed-rips.ts'), ['--rips=6000', '--wallets=40']);
}

console.log('\nReady.  pnpm web   ->  http://localhost:4179');
