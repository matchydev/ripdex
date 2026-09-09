/** Shared wiring for the pokemon:* commands. Providers and store come from
 *  configuration so no script hardcodes a vendor (spec §24). */
import { join, resolve } from 'node:path';
import { PokemonTcgProvider } from '../src/providers/pokemontcg.ts';
import { JsonCatalogStore } from '../src/stores/json-store.ts';

export function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf('=');
  return eq === -1 ? '' : hit.slice(eq + 1);
}

export function dataDir(): string {
  return resolve(arg('data') || process.env.RIPDEX_DATA_DIR || join(process.cwd(), 'data', 'catalog'));
}

export function makeProvider() {
  return new PokemonTcgProvider({
    apiKey: process.env.POKEMON_API_KEY,
    baseUrl: process.env.POKEMON_API_BASE,
  });
}

export function makeStore() {
  return new JsonCatalogStore(dataDir());
}

export function report(label: string, r: { inserted: number; updated: number; unchanged: number }): void {
  console.log(`${label}: ${r.inserted} inserted, ${r.updated} updated, ${r.unchanged} unchanged`);
}

export function die(err: unknown): never {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
