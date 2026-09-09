/**
 * RIPDEX web (spec §8, §9, §10, §11).
 *
 * Reads exclusively from the catalog store — no request path touches a data
 * provider. The index is built once at boot and held in memory; swapping
 * JsonCatalogStore for a Postgres adapter changes this file by one line.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  JsonCatalogStore,
  JsonOpeningLedger,
  type StoredOpening,
  buildCatalogIndex,
  queryCards,
  topGrails,
  findByRoute,
  oddsTable,
  validatePackConfig,
  type CardQuery,
  type CardSort,
  type CatalogIndex,
} from '../../packages/pokemon-core/src/index.ts';
import { loadPacks, packVariantIds, FEATURED_PACK_ID } from './packs/index.ts';
import { cardsPage, detailPage, grailsPage, packsPage, tile, layout } from './src/render.ts';
import { homePage } from './src/home.ts';
import { buildCardPullData, ripdexDataSection, CARD_STATS_CSS } from './src/card-stats.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR =
  process.env.RIPDEX_DATA_DIR ?? join(HERE, '..', '..', 'packages', 'pokemon-core', 'data', 'catalog');
const PORT = Number(process.env.PORT ?? 4179);
const LEDGER_DIR =
  process.env.RIPDEX_LEDGER_DIR ?? join(HERE, '..', '..', 'packages', 'pokemon-core', 'data', 'ledger');
const GRAIL_MIN = Number(process.env.RIPDEX_GRAIL_MIN ?? 500);
// The homepage rail shows high-value cards rather than only cards over the grail
// floor: with a small catalog the strict threshold leaves one card, and a rail
// of one reads as broken. /grails still applies GRAIL_MIN.
const HOME_RAIL_MIN = Number(process.env.RIPDEX_HOME_RAIL_MIN ?? 25);

const SORTS = new Set<CardSort>([
  'value-desc', 'value-asc', 'newest', 'oldest', 'rarity', 'name', 'number',
]);

let index: CatalogIndex;

function num(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function toQuery(sp: URLSearchParams): CardQuery {
  const sortRaw = sp.get('sort') as CardSort | null;
  return {
    search: sp.get('search') ?? undefined,
    setId: sp.get('setId') ?? undefined,
    series: sp.get('series') ?? undefined,
    type: sp.get('type') ?? undefined,
    rarity: sp.get('rarity') ?? undefined,
    artist: sp.get('artist') ?? undefined,
    year: num(sp.get('year')),
    minPrice: num(sp.get('minPrice')),
    maxPrice: num(sp.get('maxPrice')),
    availableInPacks: sp.get('availableInPacks') === '1',
    // An unknown sort falls back rather than 500s: these values arrive from a
    // query string, which anyone can edit.
    sort: sortRaw && SORTS.has(sortRaw) ? sortRaw : 'value-desc',
    page: num(sp.get('page')) ?? 1,
    pageSize: num(sp.get('pageSize')) ?? 60,
  };
}

function send(res: ServerResponse, status: number, body: string, type: string): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(body);
}

const html = (res: ServerResponse, body: string, status = 200) =>
  send(res, status, body, 'text/html; charset=utf-8');
const json = (res: ServerResponse, value: unknown, status = 200) =>
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8');

function notFound(res: ServerResponse, what: string): void {
  html(
    res,
    layout('Not found — RIPDEX', '', `<h1 class="page">Not found</h1><p class="lede">${what}</p>`),
    404,
  );
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = decodeURIComponent(url.pathname);

  if (path === '/') {
    return html(res, homePage(index, PACKS, topGrails(index, 20, HOME_RAIL_MIN), FEATURED_PACK_ID, []));
  }

  if (path === '/cards') return html(res, cardsPage(index));

  if (path === '/api/cards') {
    const result = queryCards(index, toQuery(url.searchParams));
    return json(res, {
      html: result.cards.map(tile).join(''),
      page: result.page,
      totalCount: result.totalCount,
      hasMore: result.hasMore,
    });
  }

  if (path === '/grails') {
    return html(res, grailsPage(topGrails(index, 120, GRAIL_MIN), GRAIL_MIN));
  }

  if (path === '/packs') return html(res, packsPage(PACKS, index));

  const card = /^\/pokemon\/([^/]+)\/([^/]+)$/.exec(path);
  if (card) {
    const listing = findByRoute(index, card[1], card[2]);
    if (!listing) return notFound(res, `No card at ${card[1]} ${card[2]}.`);

    // Pull stats are per variant, never per card: the holo and the reverse holo
    // of one Charmander have different odds, and a shared counter would let the
    // common printing borrow the rare one's scarcity.
    const counts = new Map<string, number>();
    const openings: StoredOpening[] = [];
    for (const v of listing.variants) {
      counts.set(v.variantId, await ledger.countByVariant(v.variantId));
      openings.push(...(await ledger.listByVariant(v.variantId, 12)));
    }
    const data = buildCardPullData(listing, PACKS, counts, openings);
    return html(
      res,
      detailPage(listing, ripdexDataSection(listing, data, Date.now()), CARD_STATS_CSS),
    );
  }

  notFound(res, 'That page does not exist.');
}

const store = new JsonCatalogStore(DATA_DIR);
const ledger = new JsonOpeningLedger(LEDGER_DIR);
const PACKS = await loadPacks();
const inPacks = packVariantIds(PACKS);

// Fail at boot, not mid-request: a pool referencing a variant that is not in
// the catalog means the pack cannot be opened, and that should be loud.
for (const pack of PACKS) {
  validatePackConfig(pack);
  const total = oddsTable(pack.pool).reduce((s, r) => s + r.probability, 0);
  if (Math.abs(total - 1) > 1e-9) throw new Error(`${pack.id}: odds do not sum to 1`);
}

index = await buildCatalogIndex(store, { packVariantIds: inPacks });

const missing = [...inPacks].filter((v) => !index.byVariantId.has(v));
if (missing.length > 0) {
  console.warn(
    `! ${missing.length} pack variant(s) are not in the catalog — run pokemon:sync:*:\n  ${missing.join('\n  ')}`,
  );
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    send(res, 500, 'internal error', 'text/plain');
  });
}).listen(PORT, () => {
  console.log(
    `RIPDEX web on http://localhost:${PORT} — ${index.cards.length} cards, ` +
      `${index.byVariantId.size} variants, ${index.facets.sets.length} sets`,
  );
});
