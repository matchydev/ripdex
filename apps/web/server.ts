/**
 * RIPDEX web (spec §8, §9, §10, §11).
 *
 * Reads exclusively from the catalog store — no request path touches a data
 * provider. The index is built once at boot and held in memory; swapping
 * JsonCatalogStore for a Postgres adapter changes this file by one line.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, resolve, extname, relative, isAbsolute } from 'node:path';
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
  relativeTime,
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
  type FeedEvent,
} from '../../packages/pokemon-core/src/index.ts';
import { loadPacks, packVariantIds, FEATURED_PACK_ID } from './packs/index.ts';
import { cardsPage, detailPage, grailsPage, packsPage, tile, layout } from './src/render.ts';
import { homePage } from './src/home.ts';
import { buildCardPullData, ripdexDataSection, CARD_STATS_CSS } from './src/card-stats.ts';
import { ripPage, type ReelCard } from './src/rip-page.ts';
import { RipEngine } from './src/rip-engine.ts';
import { WalletStore, STARTING_BALANCE } from './src/wallet-store.ts';
import { livePage, collectionPage } from './src/wallet-pages.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR =
  process.env.RIPDEX_DATA_DIR ?? join(HERE, '..', '..', 'packages', 'pokemon-core', 'data', 'catalog');
const PORT = Number(process.env.PORT ?? 4179);
const LEDGER_DIR =
  process.env.RIPDEX_LEDGER_DIR ?? join(HERE, '..', '..', 'packages', 'pokemon-core', 'data', 'ledger');
// The $RIP balance + portfolio store (economy layer, not the provably-fair ledger).
const WALLET_PATH =
  process.env.RIPDEX_WALLET_PATH ?? join(HERE, '..', '..', 'packages', 'pokemon-core', 'data', 'wallets.json');
const GRAIL_MIN = Number(process.env.RIPDEX_GRAIL_MIN ?? 500);
// The homepage rail shows high-value cards rather than only cards over the grail
// floor: with a small catalog the strict threshold leaves one card, and a rail
// of one reads as broken. /grails still applies GRAIL_MIN.
const HOME_RAIL_MIN = Number(process.env.RIPDEX_HOME_RAIL_MIN ?? 25);
// OpenAI-generated RIPDEX artwork, served read-only under /art/*. This is
// visual production output, never a data provider and never on a rip path.
const PUBLIC_DIR = process.env.RIPDEX_PUBLIC_DIR ?? join(HERE, '..', '..', 'public');
const ART_DIR = join(PUBLIC_DIR, 'art');
const ART_PACK_DIR = join(ART_DIR, 'packs');
const ART_TYPES: Record<string, string> = {
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.avif': 'image/avif', '.svg': 'image/svg+xml',
};

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

function notFound(res: ServerResponse, what: string): void {
  html(
    res,
    layout('Not found — RIPDEX', '', `<h1 class="page">Not found</h1><p class="lede">${what}</p>`),
    404,
  );
}

/** Serve a file from public/art read-only. Path traversal is refused. */
async function serveArt(res: ServerResponse, urlPath: string): Promise<void> {
  const resolved = resolve(ART_DIR, urlPath.slice('/art/'.length));
  const within = relative(ART_DIR, resolved);
  if (within === '' || within.startsWith('..') || isAbsolute(within)) {
    return notFound(res, 'No such asset.');
  }
  try {
    const buf = await readFile(resolved);
    res.writeHead(200, {
      'Content-Type': ART_TYPES[extname(resolved).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(buf);
  } catch {
    return notFound(res, 'No such asset.');
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Which packs have an OpenAI-generated wrapper on disk. A pack with no wrapper
 * is simply absent from the map, so the pack scene falls back to its card hero.
 * The featured pack additionally honours the showcase `grail-pack` asset.
 */
async function packWrappers(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const pack of PACKS) {
    const names: string[] = [];
    if (pack.id === FEATURED_PACK_ID) names.push('grail-pack.png', 'grail-pack.webp');
    names.push(`${pack.id}.png`, `${pack.id}.webp`);
    for (const name of names) {
      if (await fileExists(join(ART_PACK_DIR, name))) {
        out[pack.id] = `/art/packs/${name}`;
        break;
      }
    }
  }
  return out;
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

/**
 * A representative live-feed slice for the ticker and homepage rail: mostly
 * recent pulls, with a major (grail/tier-4) sprinkled in about every seventh
 * slot and a notable (tier-3) about every fourth, so the stream shows what
 * ripping actually looks like instead of a wall of the same common — the same
 * reasoning `watchLiveCursor` documents. Adjacent identical pulls (one wallet
 * spamming one card) collapse to a single entry. All events are real ledger rips.
 */
function liveMix(events: readonly FeedEvent[], limit: number): FeedEvent[] {
  const by = (p: string) => events.filter((e) => e.prominence === p);
  const major = by('major');
  const notable = by('notable');
  const normal = by('normal');
  const out: FeedEvent[] = [];
  let mi = 0;
  let ni = 0;
  let ci = 0;
  let last = '';
  for (let i = 0; out.length < limit; i++) {
    let e: FeedEvent | null = null;
    if (i % 7 === 3 && mi < major.length) e = major[mi++];
    else if (i % 4 === 2 && ni < notable.length) e = notable[ni++];
    else if (ci < normal.length) e = normal[ci++];
    else if (ni < notable.length) e = notable[ni++];
    else if (mi < major.length) e = major[mi++];
    else break;
    const key = e.card.cardId + e.wallet;
    if (key === last) continue;
    last = key;
    out.push(e);
  }
  return out;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = decodeURIComponent(url.pathname);

  if (path.startsWith('/art/')) return serveArt(res, path);

  if (path === '/') {
    // The homepage LIVE PULLS rail reads the real ledger, so it fills the moment
    // any pack has been opened rather than sitting on the empty state.
    const { events } = buildFeed(await ledger.recent(400), index, PACKS, {});
    const now = new Date();
    const feed = liveMix(events, 24).map((e) => ({
      wallet: e.wallet,
      cardName: e.card.name,
      imageSmall: e.card.imageSmall,
      value: e.referenceValue,
      when: relativeTime(e.openedAt, now),
      prominence: e.prominence,
      href: `/pokemon/${encodeURIComponent(e.card.setId)}/${encodeURIComponent(e.card.number)}`,
    }));
    return html(
      res,
      homePage(index, PACKS, topGrails(index, 20, HOME_RAIL_MIN), FEATURED_PACK_ID, feed, await packWrappers()),
    );
  }

  if (path === '/cards') return html(res, cardsPage(index));

  // The site-wide live-rip ticker in the header polls this. Real recent pulls
  // from the ledger — the social proof that the whole site is being ripped.
  if (path === '/api/ticker') {
    const { events } = buildFeed(await ledger.recent(400), index, PACKS, {});
    const now = new Date();
    return json(res, {
      items: liveMix(events, 55).map((e) => ({
        w: e.wallet,
        n: e.card.name,
        img: e.card.imageSmall,
        v: e.referenceValue,
        tier: e.tier,
        pack: e.packName,
        when: relativeTime(e.openedAt, now),
        href: `/pokemon/${encodeURIComponent(e.card.setId)}/${encodeURIComponent(e.card.number)}`,
      })),
    });
  }

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

  if (path === '/packs') return html(res, packsPage(PACKS, index, await packWrappers()));

  if (path === '/live') {
    const openings = await ledger.recent(80);
    return html(res, livePage(buildFeed(openings, index, PACKS, { limit: 80 }), new Date()));
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
    // The reel strip is filler cards drawn client-side, weighted by the SAME
    // real weights as the pool so a grail whips past as rarely as it drops. It
    // is presentation only — the outcome is settled server-side by /api/rip — so
    // this resolves every pool entry to its thumbnail, tier and weight up front.
    const reel: ReelCard[] = [];
    for (const entry of pack.pool) {
      const hit = index.byVariantId.get(entry.variantId);
      if (!hit) continue;
      reel.push({
        v: entry.variantId,
        img: hit.card.imageSmall,
        tier: hit.variant.tier ?? 'TIER_1',
        value: hit.variant.referenceValue,
        name: hit.card.name,
        weight: entry.weight,
      });
    }
    const wrappers = await packWrappers();
    return html(res, ripPage(pack, best, top, reel, wrappers[pack.id]));
  }

  if (path === '/api/rip' && req.method === 'POST') {
    const body = await readBody(req);
    let packId: string;
    try {
      packId = String(JSON.parse(body || '{}').packId ?? '');
    } catch {
      return json(res, { error: 'Malformed request body.' }, 400);
    }
    const pack = engine.getPack(packId);
    if (!pack) return json(res, { error: `Unknown pack: ${packId}` }, 404);

    // The per-browser demo identity is BOTH the provably-fair client seed and the
    // $RIP wallet key. Deduct the price synchronously BEFORE the async rip so two
    // concurrent rips on one wallet can never overspend the balance.
    const account = demoSeed(req);
    const cost = Number(pack.priceRip);
    const balance = wallets.spend(account, cost);
    if (balance === null) {
      return json(
        res,
        { error: 'Not enough $RIP to open this pack.', code: 'insufficient', balance: wallets.balance(account), price: cost },
        402,
      );
    }
    try {
      const outcome = await engine.rip(packId, account);
      wallets.recordPull(account, outcome.openingId, outcome.sellValue);
      return json(res, { ...outcome, balance });
    } catch (err) {
      wallets.credit(account, cost); // refund — never take $RIP for a failed rip
      console.error(err);
      return json(res, { error: err instanceof Error ? err.message : 'Rip failed.' }, 500);
    }
  }

  if (path === '/api/sell' && req.method === 'POST') {
    const body = await readBody(req);
    let openingId: string;
    try {
      openingId = String(JSON.parse(body || '{}').openingId ?? '');
    } catch {
      return json(res, { error: 'Malformed request body.' }, 400);
    }
    const account = demoSeed(req);
    const result = wallets.sell(account, openingId);
    if (!result.ok) {
      return json(
        res,
        {
          error: result.reason === 'already-sold' ? 'Already sold.' : 'You do not own that pull.',
          code: result.reason,
          balance: wallets.balance(account),
        },
        409,
      );
    }
    return json(res, { ok: true, credited: result.credited, balance: result.balance });
  }

  if (path === '/api/wallet') {
    return json(res, { balance: wallets.balance(demoSeed(req)), starting: STARTING_BALANCE });
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
const wallets = await WalletStore.open(WALLET_PATH);
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
