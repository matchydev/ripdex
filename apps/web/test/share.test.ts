/**
 * Share graphics for a completed rip (spec §18).
 *
 * The thing worth defending here is not the layout — `social.test.ts` measures
 * that — but the join. A share card is generated once, cached forever by
 * whichever scraper saw it first, and then outlives every price in the catalog.
 * So these tests pin the two properties that make it safe to cache: the hero is
 * chosen deterministically, and every number on it comes from the frozen ledger
 * row rather than from today's prices.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { PullTier } from '../../../packages/pokemon-core/src/tiers.ts';
import type {
  StoredOpening,
  StoredOpeningCard,
} from '../../../packages/pokemon-core/src/openings.ts';
import type {
  CardListing,
  CatalogIndex,
  VariantListing,
} from '../../../packages/pokemon-core/src/query.ts';
import type { PackConfig } from '../../../packages/pokemon-core/src/odds.ts';
import { heroCard, ripLabel, shareInputFor, ripShareCard } from '../src/share.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const CHARIZARD = 'base1|4|holofoil|1st-edition';
const BLASTOISE = 'base1|2|holofoil|unlimited';
const PIDGEY = 'base1|57|non-foil|unlimited';

function pull(
  variantId: string,
  referenceValue: number,
  slot: number,
  over: Partial<StoredOpeningCard> = {},
): StoredOpeningCard {
  return {
    variantId,
    cardId: `${variantId.split('|')[0]}-${variantId.split('|')[1]}`,
    probability: 0.05,
    referenceValue,
    currency: 'USD',
    tier: PullTier.Tier1,
    slot,
    ...over,
  };
}

function rip(cards: StoredOpeningCard[], over: Partial<StoredOpening> = {}): StoredOpening {
  return {
    openingId: 'rip_1a2b3c4d5e6f7a8b9c0d',
    openedAt: '2026-09-09T00:00:00.000Z',
    wallet: '0xRipper',
    packId: 'charizard-chase',
    packVersion: '1',
    cards,
    verification: {
      serverSeedHash: 'hash', clientSeed: 'client', nonce: 1,
      priceSnapshotId: 'ps', packConfigSnapshotId: 'pc',
      priceSnapshotHash: 'psh', packConfigSnapshotHash: 'pch',
      serverSeed: null,
    },
    ...over,
  };
}

/** Only `byVariantId` is read, so the rest of the index stays empty on purpose. */
function index(entries: Record<string, { name: string; setName: string }> = {}): CatalogIndex {
  const byVariantId = new Map<string, { card: CardListing; variant: VariantListing }>();
  for (const [variantId, meta] of Object.entries(entries)) {
    const [setId, number] = variantId.split('|');
    byVariantId.set(variantId, {
      card: {
        cardId: `${setId}-${number}`, name: meta.name, setId, setName: meta.setName,
        setSeries: 'Base', setLogoUrl: null, setSymbolUrl: null, number,
        rarity: 'Rare Holo', artist: 'Mitsuhiro Arita', types: ['Fire'],
        releaseDate: '1999-01-09', year: 1999, nationalPokedexNumbers: [6],
        imageSmall: `https://images.pokemontcg.io/${setId}/${number}.png`,
        imageLarge: `https://images.pokemontcg.io/${setId}/${number}_hires.png`,
        variants: [], headlineValue: 1, headlineTier: PullTier.Tier1, availableInPacks: true,
      } as CardListing,
      variant: {} as VariantListing,
    });
  }
  return {
    cards: [], sets: [], byCardId: new Map(), byVariantId,
    facets: { sets: [], series: [], types: [], rarities: [], artists: [], years: [] },
  };
}

const PACKS = [{ id: 'charizard-chase', name: 'Charizard Chase' } as PackConfig];

/* ------------------------------------------------------------------ *
 * Hero selection
 * ------------------------------------------------------------------ */

test('the hero is the most valuable pull in the rip, not the first or the last', async () => {
  const hero = heroCard(
    rip([pull(PIDGEY, 1.75, 0), pull(CHARIZARD, 8400.5, 1), pull(BLASTOISE, 312.25, 2)]),
  );
  assert.equal(hero?.variantId, CHARIZARD);
});

test('a tie keeps the earlier slot, so one rip always renders the same card', async () => {
  // Same value in two slots. Whichever wins must keep winning: the graphic is
  // cached against its URL and never re-fetched.
  const cards = [pull(BLASTOISE, 312.25, 0), pull(CHARIZARD, 312.25, 1)];
  assert.equal(heroCard(rip(cards))?.variantId, BLASTOISE);
  assert.equal(heroCard(rip([...cards].reverse()))?.variantId, BLASTOISE, 'input order is irrelevant');
});

test('a rip with no cards yields no hero rather than a blank card', async () => {
  assert.equal(heroCard(rip([])), null);
  assert.equal(shareInputFor(rip([]), index()), null);
  assert.equal(ripShareCard(rip([]), index()), null);
});

/* ------------------------------------------------------------------ *
 * The join
 * ------------------------------------------------------------------ */

test('value, odds, currency and tier come from the ledger, never from the catalog', async () => {
  // The catalog says this card is a Tier 1 worth $1 today. The rip says it was
  // pulled as a grail at $8400.50, and the rip is what happened.
  const input = shareInputFor(
    rip([pull(CHARIZARD, 8400.5, 0, { tier: PullTier.Grail, probability: 0.00005, currency: 'USD' })]),
    index({ [CHARIZARD]: { name: 'Charizard', setName: 'Base' } }),
    { packs: PACKS },
  );

  assert.equal(input?.referenceValue, 8400.5);
  assert.equal(input?.probability, 0.00005);
  assert.equal(input?.tier, PullTier.Grail);
  assert.equal(input?.currency, 'USD');
});

test('the variant identity is parsed from the variantId, not read off the card', async () => {
  const input = shareInputFor(
    rip([pull(CHARIZARD, 8400.5, 0)]),
    index({ [CHARIZARD]: { name: 'Charizard', setName: 'Base' } }),
  );
  assert.equal(input?.variant.finish, 'holofoil');
  assert.equal(input?.variant.printing, '1st-edition', '1st Edition is a different card from Unlimited');
  assert.equal(input?.variant.number, '4');
});

test('a catalog miss still renders a truthful card, just without the art', async () => {
  // A variant can leave the catalog when a set is resynced; the ledger row that
  // references it stands forever.
  const input = shareInputFor(rip([pull(CHARIZARD, 8400.5, 0)]), index(), { packs: PACKS });

  assert.equal(input?.referenceValue, 8400.5, 'the value survives the missing catalog row');
  assert.equal(input?.card.images.large, '', 'no art rather than a broken URL');
  assert.match(input!.card.name, /4/, 'named by collector number instead of an invented name');

  const svg = ripShareCard(rip([pull(CHARIZARD, 8400.5, 0)]), index());
  assert.match(svg ?? '', /8,?400\.50/, 'the graphic still states the value');
});

test('the pack is named when it is known and falls back to its id when it is not', async () => {
  const cards = [pull(CHARIZARD, 8400.5, 0)];
  assert.equal(shareInputFor(rip(cards), index(), { packs: PACKS })?.packName, 'Charizard Chase');
  // A retired pack still has rips in the ledger pointing at it.
  assert.equal(shareInputFor(rip(cards), index(), { packs: [] })?.packName, 'charizard-chase');
  assert.equal(shareInputFor(rip(cards), index())?.packName, 'charizard-chase');
});

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

test('the rip label matches the one the rip page prints', async () => {
  // Same derivation as rip-page.ts: strip the prefix, ten hex, uppercased.
  assert.equal(ripLabel('rip_1a2b3c4d5e6f7a8b9c0d'), '1A2B3C4D5E');
  assert.equal(ripLabel('deadbeef'), 'DEADBEEF', 'an id without the prefix is left alone');
});

test('the same rip renders byte-identical output twice', async () => {
  const opening = rip([pull(CHARIZARD, 8400.5, 0), pull(PIDGEY, 1.75, 1)]);
  const cat = index({ [CHARIZARD]: { name: 'Charizard', setName: 'Base' } });
  assert.equal(ripShareCard(opening, cat, { packs: PACKS }), ripShareCard(opening, cat, { packs: PACKS }));
});
