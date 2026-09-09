/**
 * Share graphics for a completed rip (spec §18).
 *
 * `renderShareCard` draws one card. A rip is a pack of them, so something has
 * to choose which one represents it, and that choice is made here rather than
 * in the renderer: the graphic is a pure function of its input, and "which pull
 * was this rip about" is a product question with a defensible answer.
 *
 * Two rules keep the image stable, which matters because social platforms cache
 * an OG image against its URL and will not come back for a second look:
 *
 *   1. The hero is the highest frozen `referenceValue` in the rip, ties broken
 *      by draw order. Values are frozen at rip time and the ledger is
 *      append-only, so this never changes for a given openingId.
 *   2. Everything on the card comes from the ledger row, not from today's
 *      catalog. A card that has since doubled in price still shares at the
 *      price it was pulled at, because that is what the rip actually was.
 *
 * The catalog is joined for presentation only — name, art, artist — and its
 * absence degrades to a card that still states the right value and odds.
 */

import {
  parseVariantId,
  renderShareCard,
  shareText,
  type CatalogIndex,
  type PackConfig,
  type ShareCardInput,
  type StoredOpening,
  type StoredOpeningCard,
} from '../../../packages/pokemon-core/src/index.ts';

/**
 * The pull a rip is remembered for: most valuable card, ties broken by the slot
 * it was drawn in. Returns null only for a rip with no cards, which `openPack`
 * cannot produce but a hand-written ledger row could.
 */
export function heroCard(opening: StoredOpening): StoredOpeningCard | null {
  let best: StoredOpeningCard | null = null;
  for (const card of opening.cards) {
    if (best === null) {
      best = card;
      continue;
    }
    if (card.referenceValue > best.referenceValue) {
      best = card;
    } else if (card.referenceValue === best.referenceValue && card.slot < best.slot) {
      // Ties break on the declared slot rather than on array position. The two
      // agree for a ledger row written by `openPack`, but relying on position
      // would make the hero depend on how the row was serialized and read back,
      // and the OG image is cached forever against a URL — it has to be a
      // function of the rip's contents alone.
      best = card;
    }
  }
  return best;
}

/**
 * Match the rip identity the rip page already prints, so the graphic and the
 * page it came from name the same rip. openingId is a `rip_`-prefixed sha256;
 * ten hex characters is enough to be unambiguous and short enough to read.
 */
export function ripLabel(openingId: string): string {
  return openingId.replace(/^rip_/, '').slice(0, 10).toUpperCase();
}

export interface ShareInputOptions {
  /** Looked up by `opening.packId`. Falls back to the id when the pack is gone. */
  readonly packs?: readonly PackConfig[];
}

/**
 * Build the renderer's input from a stored rip. Null when the rip has no cards.
 *
 * Deliberately tolerant of a catalog miss: a variant can leave the catalog (a
 * set is resynced, an id changes) while the ledger row that references it
 * stands forever. The value, odds, tier and variant identity all come from the
 * ledger, so the card that renders is still truthful — it just loses the art
 * and shows the collector number instead of a name.
 */
export function shareInputFor(
  opening: StoredOpening,
  index: CatalogIndex,
  opts: ShareInputOptions = {},
): ShareCardInput | null {
  const hero = heroCard(opening);
  if (!hero) return null;

  const variant = parseVariantId(hero.variantId);
  const hit = index.byVariantId.get(hero.variantId);
  const pack = opts.packs?.find((p) => p.id === opening.packId);

  return {
    card: {
      // No catalog row: name the card by its collector number rather than
      // inventing one or rendering an empty headline.
      name: hit?.card.name ?? `${variant.setId.toUpperCase()} ${variant.number}`,
      number: variant.number,
      setName: hit?.card.setName ?? variant.setId,
      rarity: hit?.card.rarity ?? null,
      artist: hit?.card.artist ?? null,
      images: {
        small: hit?.card.imageSmall ?? '',
        large: hit?.card.imageLarge ?? '',
      },
    },
    variant,
    // From the ledger, never from the catalog: this is the price the card was
    // drawn at, which is the only price the rip was ever about.
    referenceValue: hero.referenceValue,
    currency: hero.currency,
    probability: hero.probability,
    tier: hero.tier,
    ripNumber: ripLabel(opening.openingId),
    packName: pack?.name ?? opening.packId,
  };
}

/** The share graphic for a rip, or null when there is nothing to draw. */
export function ripShareCard(
  opening: StoredOpening,
  index: CatalogIndex,
  opts: ShareInputOptions = {},
): string | null {
  const input = shareInputFor(opening, index, opts);
  return input === null ? null : renderShareCard(input);
}

/** The caption that goes with the graphic. */
export function ripShareText(
  opening: StoredOpening,
  index: CatalogIndex,
  opts: ShareInputOptions = {},
): string | null {
  const input = shareInputFor(opening, index, opts);
  return input === null ? null : shareText(input);
}
