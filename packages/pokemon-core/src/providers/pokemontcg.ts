/**
 * pokemontcg.io adapter (spec §2, §24).
 *
 * A development-time data provider. It implements the same contracts the
 * partnership asset feed will implement, so swapping it out later is a config
 * change, not a rewrite.
 *
 * Verified against the live API on 2026-09-08. The price key inventory is
 * exactly: normal, holofoil, reverseHolofoil, 1stEditionNormal,
 * 1stEditionHolofoil, unlimitedHolofoil.
 */

import type {
  PokemonCard,
  PokemonSet,
  PokemonPriceReport,
  PokemonAttack,
  PokemonTypeModifier,
} from '../types.ts';
import type {
  PokemonCatalogProvider,
  PokemonPricingProvider,
  CardPage,
  ListCardsQuery,
} from '../provider.ts';

const PROVIDER = 'pokemontcg.io';
const DEFAULT_BASE = 'https://api.pokemontcg.io/v2';

/**
 * The resource genuinely does not exist. Distinct from a transport failure so
 * ingestion can tell 'no such card' from 'the API is having a bad minute' —
 * conflating them turns a 502 into a silently missing price.
 */
export class NotFoundError extends Error {}

interface RawPriceBlock {
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  directLow: number | null;
}

interface RawCard {
  id: string;
  name: string;
  supertype?: string;
  subtypes?: string[];
  types?: string[];
  hp?: string;
  evolvesFrom?: string;
  evolvesTo?: string[];
  rules?: string[];
  attacks?: PokemonAttack[];
  weaknesses?: PokemonTypeModifier[];
  resistances?: PokemonTypeModifier[];
  retreatCost?: string[];
  convertedRetreatCost?: number;
  set: RawSet;
  number: string;
  artist?: string;
  rarity?: string;
  flavorText?: string;
  nationalPokedexNumbers?: number[];
  legalities?: Record<string, string>;
  images: { small: string; large: string };
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: Record<string, RawPriceBlock>;
  };
}

interface RawSet {
  id: string;
  name: string;
  series: string;
  printedTotal?: number;
  total?: number;
  releaseDate?: string;
  images?: { symbol?: string; logo?: string };
}

/**
 * The API returns dates as "YYYY/MM/DD". Normalize to ISO-8601 so every
 * downstream freshness check can use a single format. Returns null rather than
 * an invalid date, because `price.ts` treats an unparseable timestamp as
 * "cannot prove freshness" and refuses the price.
 */
export function normalizeApiDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const m = /^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(value.trim());
  if (!m) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
}

function block(prices: Record<string, RawPriceBlock> | undefined, key: string): RawPriceBlock {
  return prices?.[key] ?? { low: null, mid: null, high: null, market: null, directLow: null };
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export function mapSet(raw: RawSet): PokemonSet {
  return {
    id: raw.id,
    name: raw.name,
    series: raw.series,
    symbolUrl: raw.images?.symbol ?? null,
    logoUrl: raw.images?.logo ?? null,
    releaseDate: normalizeApiDate(raw.releaseDate)?.slice(0, 10) ?? null,
    total: raw.total ?? null,
    printedTotal: raw.printedTotal ?? null,
  };
}

export function mapCard(raw: RawCard, fetchedAt: string): PokemonCard {
  return {
    id: raw.id,
    name: raw.name,
    supertype: raw.supertype ?? 'Unknown',
    subtypes: raw.subtypes ?? [],
    types: raw.types ?? [],
    // HP arrives as a string ("120"); a few Trainer cards omit it entirely.
    hp: raw.hp ? (Number.isFinite(Number(raw.hp)) ? Number(raw.hp) : null) : null,
    evolvesFrom: raw.evolvesFrom ?? null,
    evolvesTo: raw.evolvesTo ?? [],
    rules: raw.rules ?? [],
    attacks: raw.attacks ?? [],
    weaknesses: raw.weaknesses ?? [],
    resistances: raw.resistances ?? [],
    retreatCost: raw.retreatCost ?? [],
    convertedRetreatCost: raw.convertedRetreatCost ?? null,

    setId: raw.set.id,
    setName: raw.set.name,
    setSeries: raw.set.series,
    setSymbolUrl: raw.set.images?.symbol ?? null,
    setLogoUrl: raw.set.images?.logo ?? null,
    setReleaseDate: normalizeApiDate(raw.set.releaseDate)?.slice(0, 10) ?? null,
    setTotal: raw.set.total ?? null,

    number: raw.number,
    artist: raw.artist ?? null,
    rarity: raw.rarity ?? null,
    flavorText: raw.flavorText ?? null,
    nationalPokedexNumbers: raw.nationalPokedexNumbers ?? [],
    legalities: raw.legalities ?? {},
    images: { small: raw.images.small, large: raw.images.large },
    source: { provider: PROVIDER, fetchedAt },
  };
}

export function mapPrices(raw: RawCard): PokemonPriceReport | null {
  const tp = raw.tcgplayer;
  if (!tp?.prices || Object.keys(tp.prices).length === 0) return null;
  const p = tp.prices;

  const normal = block(p, 'normal');
  const holo = block(p, 'holofoil');
  const reverse = block(p, 'reverseHolofoil');
  const firstNormal = block(p, '1stEditionNormal');
  const firstHolo = block(p, '1stEditionHolofoil');
  const unlimitedHolo = block(p, 'unlimitedHolofoil');

  return {
    tcgplayerUrl: tp.url ?? null,
    tcgplayerUpdatedAt: normalizeApiDate(tp.updatedAt),

    normalLow: num(normal.low),
    normalMid: num(normal.mid),
    normalHigh: num(normal.high),
    normalMarket: num(normal.market),

    holofoilLow: num(holo.low),
    holofoilMid: num(holo.mid),
    holofoilHigh: num(holo.high),
    holofoilMarket: num(holo.market),

    reverseHolofoilLow: num(reverse.low),
    reverseHolofoilMid: num(reverse.mid),
    reverseHolofoilHigh: num(reverse.high),
    reverseHolofoilMarket: num(reverse.market),

    firstEditionNormalLow: num(firstNormal.low),
    firstEditionNormalMid: num(firstNormal.mid),
    firstEditionNormalHigh: num(firstNormal.high),
    firstEditionNormalMarket: num(firstNormal.market),

    firstEditionHolofoilLow: num(firstHolo.low),
    firstEditionHolofoilMid: num(firstHolo.mid),
    firstEditionHolofoilHigh: num(firstHolo.high),
    firstEditionHolofoilMarket: num(firstHolo.market),

    unlimitedHolofoilLow: num(unlimitedHolo.low),
    unlimitedHolofoilMid: num(unlimitedHolo.mid),
    unlimitedHolofoilHigh: num(unlimitedHolo.high),
    unlimitedHolofoilMarket: num(unlimitedHolo.market),

    currency: 'USD',
  };
}

export interface PokemonTcgOptions {
  apiKey?: string;
  baseUrl?: string;
  /** The public API 502s intermittently; ingestion should retry. */
  maxRetries?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Catalog + pricing over the public API. Ingestion (`pokemon:sync:*`) uses
 * this; request handlers must not — reads go to our own database (spec §2).
 */
export class PokemonTcgProvider implements PokemonCatalogProvider, PokemonPricingProvider {
  readonly name = PROVIDER;
  readonly currency = 'USD';

  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: PokemonTcgOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.apiKey = opts.apiKey;
    this.maxRetries = opts.maxRetries ?? 4;
    this.retryDelayMs = opts.retryDelayMs ?? 1200;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async get<T>(path: string): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, { headers });
        if (res.ok) return (await res.json()) as T;
        if (res.status === 404) throw new NotFoundError(`${PROVIDER} 404 for ${path}`);
        // 5xx and 429 are transient; other 4xx will not improve.
        if (res.status < 500 && res.status !== 429) {
          throw new Error(`${PROVIDER} ${res.status} for ${path}`);
        }
        lastError = new Error(`${PROVIDER} ${res.status} for ${path}`);
      } catch (err) {
        if (err instanceof NotFoundError) throw err;
        lastError = err;
      }
      if (attempt < this.maxRetries) {
        await new Promise((r) => setTimeout(r, this.retryDelayMs * 2 ** attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async listSets(): Promise<PokemonSet[]> {
    const out: PokemonSet[] = [];
    let page = 1;
    for (;;) {
      const res = await this.get<{ data: RawSet[]; totalCount: number; pageSize: number }>(
        `/sets?page=${page}&pageSize=250&orderBy=releaseDate`,
      );
      out.push(...res.data.map(mapSet));
      if (out.length >= res.totalCount || res.data.length === 0) break;
      page++;
    }
    return out;
  }

  async getSet(setId: string): Promise<PokemonSet | null> {
    try {
      const res = await this.get<{ data: RawSet }>(`/sets/${encodeURIComponent(setId)}`);
      return mapSet(res.data);
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }
  }

  async listCards(query: ListCardsQuery): Promise<CardPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 250;
    const filters: string[] = [];
    if (query.setId) filters.push(`set.id:${query.setId}`);
    if (query.name) filters.push(`name:"${query.name.replace(/"/g, '')}"`);

    const q = filters.length ? `&q=${encodeURIComponent(filters.join(' '))}` : '';
    const res = await this.get<{ data: RawCard[]; totalCount: number }>(
      `/cards?page=${page}&pageSize=${pageSize}${q}`,
    );
    const fetchedAt = new Date().toISOString();
    return {
      cards: res.data.map((c) => mapCard(c, fetchedAt)),
      page,
      pageSize,
      totalCount: res.totalCount,
    };
  }

  async getCard(cardId: string): Promise<PokemonCard | null> {
    try {
      const res = await this.get<{ data: RawCard }>(`/cards/${encodeURIComponent(cardId)}`);
      return mapCard(res.data, new Date().toISOString());
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }
  }

  async getPrices(cardId: string): Promise<PokemonPriceReport | null> {
    try {
      const res = await this.get<{ data: RawCard }>(`/cards/${encodeURIComponent(cardId)}`);
      return mapPrices(res.data);
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }
  }

  async getPricesBatch(cardIds: string[]): Promise<Map<string, PokemonPriceReport>> {
    const out = new Map<string, PokemonPriceReport>();
    // The API has no bulk-by-id endpoint, but it does support set-scoped
    // queries, so callers should prefer syncing a whole set at a time.
    for (const id of cardIds) {
      const report = await this.getPrices(id);
      if (report) out.set(id, report);
    }
    return out;
  }
}
