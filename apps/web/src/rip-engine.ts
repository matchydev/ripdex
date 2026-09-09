/**
 * The server side of a rip (spec §17).
 *
 * Holds the frozen price snapshot, the locked pack configs and the committed
 * server seed, and performs the opening. The ordering guaranteed by
 * `openPack` is preserved here: the snapshot is built once at boot, the config
 * is locked before any request arrives, and the handler holds no provider
 * handle, so there is no path by which a card could be priced after it is drawn.
 *
 * Not production-ready in one respect, called out honestly: the nonce counter
 * lives in memory, so a restart replays nonces and a repeat rip resolves to the
 * same openingId — which the ledger correctly treats as a retry and refuses to
 * double-count. A real deployment needs a persisted per-clientSeed counter and
 * a seed rotation schedule.
 */

import {
  buildPriceSnapshot,
  lockPackConfig,
  openPack,
  fromOpenResult,
  createSeedCommitment,
  oddsTable,
  choreographyFor,
  formatProbability,
  variantLabel,
  parseVariantId,
  type CatalogIndex,
  type OpeningLedger,
  type PackConfig,
  type PackConfigSnapshot,
  type PriceQuote,
  type PriceSnapshot,
} from '../../../packages/pokemon-core/src/index.ts';

export interface RipOutcome {
  openingId: string;
  variantId: string;
  cardId: string;
  name: string;
  setName: string;
  setId: string;
  number: string;
  rarity: string | null;
  artist: string | null;
  imageLarge: string;
  variantLabel: string;
  foil: string;
  tier: string;
  referenceValue: number;
  currency: string;
  probability: number;
  oddsLabel: string;
  href: string;
  choreography: ReturnType<typeof choreographyFor>;
  verification: {
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    priceSnapshotId: string;
    packConfigSnapshotId: string;
  };
}

export class RipEngine {
  private readonly index: CatalogIndex;
  private readonly ledger: OpeningLedger;
  private readonly packs: Map<string, PackConfig>;
  private readonly locked: Map<string, PackConfigSnapshot>;
  private readonly odds: Map<string, Map<string, { probability: number; label: string }>>;
  private readonly snapshot: PriceSnapshot;
  private readonly serverSeed: string;
  readonly serverSeedHash: string;
  private nonce = 0;

  private constructor(
    index: CatalogIndex,
    ledger: OpeningLedger,
    packs: PackConfig[],
    snapshot: PriceSnapshot,
    seed: { serverSeed: string; serverSeedHash: string },
  ) {
    this.index = index;
    this.ledger = ledger;
    this.snapshot = snapshot;
    this.serverSeed = seed.serverSeed;
    this.serverSeedHash = seed.serverSeedHash;
    this.packs = new Map(packs.map((p) => [p.id, p]));
    this.locked = new Map(packs.map((p) => [p.id, lockPackConfig(p)]));
    this.odds = new Map(
      packs.map((p) => [
        p.id,
        new Map(
          oddsTable(p.pool).map((r) => [
            r.variantId,
            { probability: r.probability, label: r.probabilityLabel },
          ]),
        ),
      ]),
    );
  }

  /**
   * Build the engine. Throws if any pool outcome is unpriced — better to refuse
   * to boot than to serve a pack that `openPack` would reject mid-request.
   */
  static create(index: CatalogIndex, ledger: OpeningLedger, packs: PackConfig[]): RipEngine {
    const quotes: Record<string, PriceQuote> = {};
    const missing: string[] = [];

    for (const pack of packs) {
      for (const entry of pack.pool) {
        if (quotes[entry.variantId]) continue;
        const hit = index.byVariantId.get(entry.variantId);
        const value = hit?.variant.referenceValue ?? null;
        if (value === null) {
          missing.push(entry.variantId);
          continue;
        }
        quotes[entry.variantId] = {
          variantId: entry.variantId,
          low: null,
          mid: null,
          high: null,
          market: value,
          referenceValue: value,
          basis: 'market',
          currency: hit?.variant.currency ?? 'USD',
          source: 'catalog-snapshot',
          sourceUrl: hit?.variant.sourceUrl ?? null,
          sourceUpdatedAt: hit?.variant.observedOn ?? null,
        };
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Cannot start the rip engine: ${missing.length} pool variant(s) are unpriced. ` +
          `Run pokemon:sync:prices.\n  ${missing.slice(0, 6).join('\n  ')}`,
      );
    }

    const snapshot = buildPriceSnapshot(quotes, {
      provider: 'catalog-snapshot',
      currency: 'USD',
      ttlMs: 24 * 60 * 60 * 1000,
    });

    return new RipEngine(index, ledger, packs, snapshot, createSeedCommitment());
  }

  listPackIds(): string[] {
    return [...this.packs.keys()];
  }

  getPack(packId: string): PackConfig | null {
    return this.packs.get(packId) ?? null;
  }

  async rip(packId: string, clientSeed: string): Promise<RipOutcome> {
    const packSnapshot = this.locked.get(packId);
    if (!packSnapshot) throw new Error(`Unknown pack: ${packId}`);

    const result = openPack({
      packSnapshot,
      priceSnapshot: this.snapshot,
      inputs: { serverSeed: this.serverSeed, clientSeed, nonce: this.nonce++ },
    });

    await this.ledger.record(fromOpenResult(result, clientSeed));

    const pulled = result.cards[0];
    const hit = this.index.byVariantId.get(pulled.variantId);
    if (!hit) {
      // openPack already guaranteed the variant is priced, so this can only
      // mean the catalog index and the pack config have drifted apart.
      throw new Error(`Pulled ${pulled.variantId} but it is absent from the catalog index`);
    }

    const oddsRow = this.odds.get(packId)?.get(pulled.variantId);
    const parsed = parseVariantId(pulled.variantId);

    return {
      openingId: result.openingId,
      variantId: pulled.variantId,
      cardId: hit.card.cardId,
      name: hit.card.name,
      setName: hit.card.setName,
      setId: hit.card.setId,
      number: hit.card.number,
      rarity: hit.card.rarity,
      artist: hit.card.artist,
      imageLarge: hit.card.imageLarge,
      variantLabel: variantLabel(parsed),
      foil: hit.variant.foil,
      tier: pulled.tier,
      referenceValue: pulled.quote.referenceValue,
      currency: pulled.quote.currency,
      probability: pulled.probability,
      oddsLabel: oddsRow?.label ?? formatProbability(pulled.probability),
      href: `/pokemon/${encodeURIComponent(hit.card.setId)}/${encodeURIComponent(hit.card.number)}`,
      choreography: choreographyFor(pulled.tier),
      verification: {
        serverSeedHash: result.verification.serverSeedHash,
        clientSeed: result.verification.clientSeed,
        nonce: result.verification.nonce,
        priceSnapshotId: result.verification.priceSnapshotId,
        packConfigSnapshotId: result.verification.packConfigSnapshotId,
      },
    };
  }
}
