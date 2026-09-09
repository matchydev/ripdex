/**
 * RIPDEX web (spec §8, §9, §10, §11).
 *
 * Reads exclusively from the catalog store — no request path touches a data
 * provider. The index is built once at boot and held in memory; swapping
 * JsonCatalogStore for a Postgres adapter changes this file by one line.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
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
  buildFeed,
  buildCollection,
  sortCollection,
  paginateBinder,
  setCompletion,
  duplicateSummary,
  buildAchievementContext,
  evaluateAchievements,
  type BinderSort,
  type CardQuery,
  type CardSort,
  type CatalogIndex,
  type CardListing,
} from '../../packages/pokemon-core/src/index.ts';
import { loadPacks, packVariantIds, FEATURED_PACK_ID } from './packs/index.ts';
import { cardsPage, detailPage, grailsPage, packsPage, tile, layout } from './src/render.ts';
import { homePage } from './src/home.ts';
import { buildCardPullData, ripdexDataSection, CARD_STATS_CSS } from './src/card-stats.ts';
import { ripPage, type ReelEntry } from './src/rip-page.ts';
import { RipEngine } from './src/rip-engine.ts';
import { livePage, collectionPage } from './src/wallet-pages.ts';
import { ripShareCard } from './src/share.ts';

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

const BINDER_SORTS = new Set<string>(['set', 'value', 'pull-date', 'rarity']);

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

/**
 * A share graphic is immutable: it is drawn from one ledger row whose values
 * were frozen at rip time, and the ledger is append-only, so the bytes for a
 * given openingId never change. Scrapers cache OG images hard and rarely
 * revisit, which is a problem for a mutable image and exactly right for this
 * one.
 */
function svg(res: ServerResponse, body: string): void {
  res.writeHead(200, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(body);
}

function notFound(res: ServerResponse, what: string): void {
  html(
    res,
    layout('Not found — RIPDEX', '', `<h1 class="page">Not found</h1><p class="lede">${what}</p>`),
    404,
  );
}

/** Read a JSON request body, capped so a request cannot exhaust memory. */
async function readBody(req: IncomingMessage, limit = 8192): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Per-browser demo identity. Wallet auth is not wired up, so this is a stable
 * pseudonym derived from the connection, never a claim about who the ripper is.
 */
function demoSeed(req: IncomingMessage): string {
  const cookie = /ripdex_seed=([A-Za-z0-9]+)/.exec(req.headers.cookie ?? '')?.[1];
  return cookie ?? '0xDEMOWEB' + createHash('sha1')
    .update(String(req.headers['user-agent'] ?? '') + String(req.socket.remoteAddress ?? ''))
    .digest('hex').slice(0, 12);
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

  if (path === '/live') {
    const openings = await ledger.recent(80);
    return html(res, livePage(buildFeed(openings, index, PACKS, { limit: 80 }), new Date()));
  }

  // Share graphic for one rip (spec §18). SVG rather than PNG: rasterizing
  // needs a dependency and this repo has none, so the CDN in front of it does
  // the conversion for the scrapers that insist on a raster.
  const og = /^\/og\/rip\/([^/]+?)(?:\.svg)?$/.exec(path);
  if (og) {
    const opening = await ledger.get(og[1]);
    if (!opening) return send(res, 404, 'No such rip.', 'text/plain; charset=utf-8');
    const graphic = ripShareCard(opening, index, { packs: PACKS });
    if (!graphic) return send(res, 404, 'That rip has no cards.', 'text/plain; charset=utf-8');
    return svg(res, graphic);
  }

  const wallet = /^\/collection\/([^/]+)$/.exec(path);
  if (wallet) {
    const address = wallet[1];
    // Unbounded read: a binder shows set completion and achievement progress
    // over a wallet's whole history, both of which are wrong if computed from a
    // page. Paging happens after aggregation, on the binder itself.
    const openings = await ledger.listByWallet(address);
    const stats = await ledger.walletStats(address);

    const sortRaw = url.searchParams.get('sort') ?? 'set';
    const sort = (BINDER_SORTS.has(sortRaw) ? sortRaw : 'set') as BinderSort;
    const entries = sortCollection(buildCollection(openings, index), sort);
    const pages = paginateBinder(entries);
    const pageNumber = Math.min(Math.max(1, num(url.searchParams.get('page')) ?? 1), Math.max(1, pages.length));

    return html(
      res,
      collectionPage({
        wallet: address,
        stats,
        page: pages[pageNumber - 1] ?? null,
        pageCount: Math.max(1, pages.length),
        pageNumber,
        sort,
        completion: setCompletion(entries, index),
        duplicates: duplicateSummary(entries),
        achievements: evaluateAchievements(buildAchievementContext(openings, index)),
        uniqueVariants: entries.length,
      }),
    );
  }

  const ripRoute = /^\/rip\/([^/]+)$/.exec(path);
  if (ripRoute) {
    const pack = engine.getPack(ripRoute[1]);
    if (!pack) return notFound(res, `No pack called ${ripRoute[1]}.`);
    let best: CardListing | null = null;
    for (const entry of pack.pool) {
      const hit = index.byVariantId.get(entry.variantId);
      if (hit && (hit.variant.referenceValue ?? 0) > (best?.headlineValue ?? 0)) best = hit.card;
    }
    const top = Math.max(
      ...pack.pool.map((e) => index.byVariantId.get(e.variantId)?.variant.referenceValue ?? 0),
    );

    // The reel scrolls the pack's REAL pool. Composition and weights are
    // already public on /packs, so nothing is disclosed here that the odds
    // table does not already publish — and populating from anything else would
    // make the reel a decoration rather than a view of what can actually drop.
    const totalWeight = pack.pool.reduce((n, e) => n + e.weight, 0) || 1;
    const reel: ReelEntry[] = [];
    for (const entry of pack.pool) {
      const hit = index.byVariantId.get(entry.variantId);
      if (!hit) continue;
      reel.push({
        variantId: entry.variantId,
        name: hit.card.name,
        art: hit.card.imageSmall,
        tier: hit.variant.tier ?? 'TIER_1',
        value: hit.variant.referenceValue ?? 0,
        share: entry.weight / totalWeight,
      });
    }

    return html(res, ripPage(pack, best, top, reel));
  }

  if (path === '/api/rip' && req.method === 'POST') {
    const body = await readBody(req);
    let packId: string;
    try {
      packId = String(JSON.parse(body || '{}').packId ?? '');
    } catch {
      return json(res, { error: 'Malformed request body.' }, 400);
    }
    if (!engine.getPack(packId)) return json(res, { error: `Unknown pack: ${packId}` }, 404);

    // The client seed identifies the ripper. Without wallet auth wired up this
    // is a per-browser demo identity, not a claim about who anyone is.
    const clientSeed = demoSeed(req);
    try {
      return json(res, await engine.rip(packId, clientSeed));
    } catch (err) {
      console.error(err);
      return json(res, { error: err instanceof Error ? err.message : 'Rip failed.' }, 500);
    }
  }

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

// Refuses to construct if any pool outcome is unpriced — a boot failure beats
// a pack that openPack would reject mid-rip. On a fresh clone the likely cause
// is simply that setup has not run, so say that rather than printing a stack.
let engine: RipEngine;
try {
  engine = RipEngine.create(index, ledger, PACKS);
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  if (index.cards.length === 0) {
    console.error('The catalog is empty. Run:  pnpm setup');
  } else {
    console.error('Some pack outcomes have no price. Run:  pnpm pokemon:sync:prices --set=<setId>');
  }
  process.exit(1);
}

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
