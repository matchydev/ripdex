/**
 * Fixtures are real values pulled from pokemontcg.io on 2026-09-08, because
 * the failure this suite exists to prevent is a real-world pricing collision,
 * not a hypothetical one.
 *
 * The headline case: Jungle Jolteon (base2-4) trades at $258.06 as a 1st
 * Edition Holofoil and $99.06 as an Unlimited Holofoil. Same set, same
 * collector number, same Pokemon, different printing, different tier.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { PokemonCard, PokemonPriceReport } from '../src/types.ts';
import {
  Finish,
  Printing,
  makeVariant,
  parseVariantId,
  variantForCard,
  variantLabel,
  foilTreatmentFor,
  discoverVariants,
  FoilTreatment,
} from '../src/variant.ts';
import { resolvePrice } from '../src/price.ts';
import { classifyTier, PullTier } from '../src/tiers.ts';
import {
  oddsTable,
  selectByWeight,
  validatePackConfig,
  formatProbability,
  PackConfigError,
  type PackConfig,
} from '../src/odds.ts';
import {
  buildPriceSnapshot,
  lockPackConfig,
  openPack,
  contentHash,
  SnapshotIntegrityError,
} from '../src/snapshot.ts';
import {
  createSeedCommitment,
  verifySeedCommitment,
  deriveFloats,
  sha256,
} from '../src/random.ts';
import { normalizeApiDate, mapPrices } from '../src/providers/pokemontcg.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const NOW = new Date('2026-09-08T12:00:00.000Z');

function card(over: Partial<PokemonCard>): PokemonCard {
  return {
    id: 'x', name: 'X', supertype: 'Pokémon', subtypes: [], types: [], hp: null,
    evolvesFrom: null, evolvesTo: [], rules: [], attacks: [], weaknesses: [],
    resistances: [], retreatCost: [], convertedRetreatCost: null,
    setId: 'set', setName: 'Set', setSeries: 'Series', setSymbolUrl: null,
    setLogoUrl: null, setReleaseDate: null, setTotal: null,
    number: '1', artist: null, rarity: null, flavorText: null,
    nationalPokedexNumbers: [], legalities: {},
    images: { small: 's', large: 'l' },
    source: { provider: 'test', fetchedAt: NOW.toISOString() },
    ...over,
  };
}

function report(over: Partial<PokemonPriceReport>): PokemonPriceReport {
  const nulls = {
    normalLow: null, normalMid: null, normalHigh: null, normalMarket: null,
    holofoilLow: null, holofoilMid: null, holofoilHigh: null, holofoilMarket: null,
    reverseHolofoilLow: null, reverseHolofoilMid: null, reverseHolofoilHigh: null, reverseHolofoilMarket: null,
    firstEditionNormalLow: null, firstEditionNormalMid: null, firstEditionNormalHigh: null, firstEditionNormalMarket: null,
    firstEditionHolofoilLow: null, firstEditionHolofoilMid: null, firstEditionHolofoilHigh: null, firstEditionHolofoilMarket: null,
    unlimitedHolofoilLow: null, unlimitedHolofoilMid: null, unlimitedHolofoilHigh: null, unlimitedHolofoilMarket: null,
  };
  return {
    tcgplayerUrl: 'https://prices.pokemontcg.io/tcgplayer/base2-4',
    tcgplayerUpdatedAt: '2026-09-08T00:00:00.000Z',
    currency: 'USD',
    ...nulls,
    ...over,
  };
}

/** Jungle Jolteon — the dual-printing case. */
const JOLTEON = card({ id: 'base2-4', name: 'Jolteon', setId: 'base2', number: '4', rarity: 'Rare Holo' });
const JOLTEON_PRICES = report({
  firstEditionHolofoilLow: 154.95, firstEditionHolofoilMid: 254.52,
  firstEditionHolofoilHigh: 1909.8, firstEditionHolofoilMarket: 258.06,
  unlimitedHolofoilLow: 56.83, unlimitedHolofoilMid: 72.23,
  unlimitedHolofoilHigh: 999, unlimitedHolofoilMarket: 99.06,
});

/** 151 Charmander — the dual-finish case. */
const CHARMANDER = card({ id: 'sv3pt5-4', name: 'Charmander', setId: 'sv3pt5', number: '4', rarity: 'Common' });
const CHARMANDER_PRICES = report({
  normalLow: 0.01, normalMid: 0.25, normalHigh: 25, normalMarket: 0.24,
  reverseHolofoilLow: 0.1, reverseHolofoilMid: 0.42, reverseHolofoilHigh: 19.97, reverseHolofoilMarket: 0.41,
});

/** Base Set Charizard — the grail. */
const CHARIZARD = card({ id: 'base1-4', name: 'Charizard', setId: 'base1', number: '4', rarity: 'Rare Holo' });
const CHARIZARD_PRICES = report({
  holofoilLow: 449.99, holofoilMid: 999, holofoilHigh: 4761.9, holofoilMarket: 897.19,
});

/* ------------------------------------------------------------------ *
 * §16 — variant identity
 * ------------------------------------------------------------------ */

test('variantId round-trips through parse', () => {
  const v = makeVariant('sv3pt5', 'SV107', Finish.ReverseHolofoil, Printing.Unlimited);
  const parsed = parseVariantId(v.variantId);
  assert.deepEqual(parsed, v);
});

test('collector numbers containing hyphens survive parsing', () => {
  const v = makeVariant('swsh45', 'SWSH-12', Finish.Holofoil);
  assert.equal(parseVariantId(v.variantId).number, 'SWSH-12');
  assert.equal(parseVariantId(v.variantId).setId, 'swsh45');
});

test('malformed variantId throws rather than defaulting to the cheap variant', () => {
  assert.throws(() => parseVariantId('base1-4'), /Malformed/);
  assert.throws(() => parseVariantId('base1|4|glitter|unlimited'), /Unknown finish/);
  assert.throws(() => parseVariantId('base1|4|holofoil|promo'), /Unknown printing/);
});

test('finish and printing both participate in identity', () => {
  const a = variantForCard(JOLTEON, Finish.Holofoil, Printing.FirstEdition);
  const b = variantForCard(JOLTEON, Finish.Holofoil, Printing.Unlimited);
  const c = variantForCard(JOLTEON, Finish.NonFoil, Printing.FirstEdition);
  assert.notEqual(a.variantId, b.variantId);
  assert.notEqual(a.variantId, c.variantId);
});

test('variantLabel reads the way a collector would say it', () => {
  assert.equal(variantLabel(makeVariant('base2', '4', Finish.Holofoil, Printing.FirstEdition)), '1st Edition Holofoil');
  assert.equal(variantLabel(makeVariant('sv1', '1', Finish.ReverseHolofoil)), 'Reverse Holo');
  assert.equal(variantLabel(makeVariant('sv1', '1', Finish.NonFoil)), 'Normal');
});

/* ------------------------------------------------------------------ *
 * §16 — the pricing collision this whole design exists to prevent
 * ------------------------------------------------------------------ */

test('1st Edition and Unlimited holofoil of the same card price independently', () => {
  const first = resolvePrice(variantForCard(JOLTEON, Finish.Holofoil, Printing.FirstEdition), JOLTEON_PRICES);
  const unlimited = resolvePrice(variantForCard(JOLTEON, Finish.Holofoil, Printing.Unlimited), JOLTEON_PRICES);

  assert.ok(first.ok && unlimited.ok);
  assert.equal(first.quote.referenceValue, 258.06);
  assert.equal(unlimited.quote.referenceValue, 99.06);
});

test('getting the printing wrong would change the displayed tier', () => {
  assert.equal(classifyTier(258.06), PullTier.Tier4);
  assert.equal(classifyTier(99.06), PullTier.Tier3);
});

test('normal and reverse holo of the same card price independently', () => {
  const normal = resolvePrice(variantForCard(CHARMANDER, Finish.NonFoil), CHARMANDER_PRICES);
  const reverse = resolvePrice(variantForCard(CHARMANDER, Finish.ReverseHolofoil), CHARMANDER_PRICES);
  assert.ok(normal.ok && reverse.ok);
  assert.equal(normal.quote.referenceValue, 0.24);
  assert.equal(reverse.quote.referenceValue, 0.41);
});

test('a variant with no data is refused, never backfilled from another variant', () => {
  // Charizard base1-4 has holofoil pricing only. Asking for the non-foil must
  // not quietly hand back the $897 holo figure.
  const nonFoil = resolvePrice(variantForCard(CHARIZARD, Finish.NonFoil), CHARIZARD_PRICES);
  assert.equal(nonFoil.ok, false);
  assert.equal(nonFoil.ok === false && nonFoil.reason, 'no-usable-figure');
});

test('shadowless is refused outright rather than served the unlimited price', () => {
  const shadowless = resolvePrice(
    variantForCard(CHARIZARD, Finish.Holofoil, Printing.Shadowless),
    CHARIZARD_PRICES,
  );
  assert.equal(shadowless.ok, false);
  assert.equal(shadowless.ok === false && shadowless.reason, 'variant-not-priced');
});

test('1st edition reverse holo is refused: that print run never existed', () => {
  const res = resolvePrice(
    variantForCard(CHARMANDER, Finish.ReverseHolofoil, Printing.FirstEdition),
    CHARMANDER_PRICES,
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, 'variant-not-priced');
});

test('holofoil and unlimitedHolofoil are treated as synonyms, not as a fallback', () => {
  const viaUnlimitedKey = resolvePrice(variantForCard(JOLTEON, Finish.Holofoil), JOLTEON_PRICES);
  const viaHolofoilKey = resolvePrice(variantForCard(CHARIZARD, Finish.Holofoil), CHARIZARD_PRICES);
  assert.ok(viaUnlimitedKey.ok && viaHolofoilKey.ok);
  assert.equal(viaUnlimitedKey.quote.referenceValue, 99.06);
  assert.equal(viaHolofoilKey.quote.referenceValue, 897.19);
});

test('basis falls back within a variant and records which field was used', () => {
  const midOnly = report({ normalMid: 12.5 });
  const res = resolvePrice(makeVariant('s', '1', Finish.NonFoil), midOnly);
  assert.ok(res.ok);
  assert.equal(res.quote.basis, 'mid');
  assert.equal(res.quote.referenceValue, 12.5);
});

test('stale prices are refused', () => {
  const old = report({ normalMarket: 1, tcgplayerUpdatedAt: '2026-08-01T00:00:00.000Z' });
  const res = resolvePrice(makeVariant('s', '1', Finish.NonFoil), old, {
    maxAgeMs: 24 * 60 * 60 * 1000,
    now: NOW,
  });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, 'stale');
});

test('a report with no timestamp cannot prove freshness', () => {
  const undated = report({ normalMarket: 1, tcgplayerUpdatedAt: null });
  const res = resolvePrice(makeVariant('s', '1', Finish.NonFoil), undated, { maxAgeMs: 1000, now: NOW });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, 'stale');
});

/* ------------------------------------------------------------------ *
 * §4 — foil treatment
 * ------------------------------------------------------------------ */

test('rarity drives the shader, and reverse holo overrides it', () => {
  const holoV = variantForCard(CHARIZARD, Finish.Holofoil);
  assert.equal(foilTreatmentFor({ rarity: 'Rare Holo' }, holoV), FoilTreatment.Holo);
  assert.equal(foilTreatmentFor({ rarity: 'Ultra Rare' }, holoV), FoilTreatment.FullArt);
  assert.equal(foilTreatmentFor({ rarity: 'Special Illustration Rare' }, holoV), FoilTreatment.SpecialIllustration);
  assert.equal(foilTreatmentFor({ rarity: 'Rare Secret' }, holoV), FoilTreatment.Gold);
  assert.equal(foilTreatmentFor({ rarity: 'Hyper Rare' }, holoV), FoilTreatment.Gold);

  const rev = variantForCard(CHARMANDER, Finish.ReverseHolofoil);
  assert.equal(foilTreatmentFor({ rarity: 'Ultra Rare' }, rev), FoilTreatment.ReverseHolo);
});

test('a plain common is not holographic', () => {
  assert.equal(
    foilTreatmentFor({ rarity: 'Common' }, variantForCard(CHARMANDER, Finish.NonFoil)),
    FoilTreatment.Normal,
  );
});

test('discoverVariants reports only what the provider priced', () => {
  const found = discoverVariants(JOLTEON, JOLTEON_PRICES).map((d) => d.variant.variantId);
  assert.equal(found.length, 2);
  assert.ok(found.includes('base2|4|holofoil|1st-edition'));
  assert.ok(found.includes('base2|4|holofoil|unlimited'));
});

test('discoverVariants marks a guess as inferred when nothing is priced', () => {
  const found = discoverVariants(CHARIZARD, null);
  assert.equal(found.length, 1);
  assert.equal(found[0].confidence, 'inferred');
});

/* ------------------------------------------------------------------ *
 * §11 — odds
 * ------------------------------------------------------------------ */

const POOL = [
  { variantId: 'sv3pt5|4|non-foil|unlimited', weight: 6900 },
  { variantId: 'sv3pt5|4|reverse-holofoil|unlimited', weight: 2000 },
  { variantId: 'sv3pt5|183|holofoil|unlimited', weight: 1000 },
  { variantId: 'base2|4|holofoil|unlimited', weight: 90 },
  { variantId: 'base2|4|holofoil|1st-edition', weight: 9 },
  { variantId: 'base1|4|holofoil|unlimited', weight: 1 },
];

test('odds table is exact and sums to 1', () => {
  const rows = oddsTable(POOL);
  const sum = rows.reduce((s, r) => s + r.probability, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12);
  assert.equal(rows[0].variantId, 'sv3pt5|4|non-foil|unlimited');
  assert.equal(rows[0].probabilityLabel, '69.00%');
});

test('rare odds do not round away to zero', () => {
  assert.equal(formatProbability(0.00001), '0.00100%');
  assert.equal(formatProbability(0.0000001), '1.00e-5%');
  assert.notEqual(formatProbability(1 / 100000), '0.00%');
});

test('selectByWeight lands in the right bucket at the boundaries', () => {
  assert.equal(selectByWeight(POOL, 0).variantId, 'sv3pt5|4|non-foil|unlimited');
  assert.equal(selectByWeight(POOL, 0.9999999).variantId, 'base1|4|holofoil|unlimited');
  assert.throws(() => selectByWeight(POOL, 1), RangeError);
});

test('a pool with a malformed variantId is rejected before it can go live', () => {
  const bad = { ...basePack(), pool: [{ variantId: 'base1-4', weight: 1 }] };
  assert.throws(() => validatePackConfig(bad), PackConfigError);
});

test('duplicate pool entries are rejected', () => {
  const bad = {
    ...basePack(),
    pool: [
      { variantId: 'base1|4|holofoil|unlimited', weight: 1 },
      { variantId: 'base1|4|holofoil|unlimited', weight: 2 },
    ],
  };
  assert.throws(() => validatePackConfig(bad), /duplicate/);
});

/* ------------------------------------------------------------------ *
 * §17 — snapshots and the opening sequence
 * ------------------------------------------------------------------ */

function basePack(): PackConfig {
  return {
    id: 'charizard-chase',
    name: 'CHARIZARD CHASE',
    version: '1',
    cardsPerPack: 1,
    priceRip: 100000n,
    distributionModel: { kind: 'flat' },
    pool: POOL,
    allowDuplicatesWithinPack: true,
    artwork: {
      wrapperAssetKey: 'wrapper/charizard-chase',
      heroAssetKey: 'hero/charizard',
      accentColor: '#FF6B1A',
      backgroundColor: '#0B0608',
      foilTone: 'crimson',
      texture: 'gloss',
    },
  };
}

function fullSnapshot() {
  const quotes: Record<string, any> = {};
  const put = (variantId: string, value: number) => {
    quotes[variantId] = {
      variantId, low: value, mid: value, high: value, market: value,
      referenceValue: value, basis: 'market', currency: 'USD',
      source: 'tcgplayer', sourceUrl: null, sourceUpdatedAt: '2026-09-08T00:00:00.000Z',
    };
  };
  put('sv3pt5|4|non-foil|unlimited', 0.24);
  put('sv3pt5|4|reverse-holofoil|unlimited', 0.41);
  put('sv3pt5|183|holofoil|unlimited', 39.57);
  put('base2|4|holofoil|unlimited', 99.06);
  put('base2|4|holofoil|1st-edition', 258.06);
  put('base1|4|holofoil|unlimited', 897.19);
  return buildPriceSnapshot(quotes, { provider: 'tcgplayer', currency: 'USD', ttlMs: 3_600_000, now: NOW });
}

test('an opening is fully determined by its committed inputs', () => {
  const packSnapshot = lockPackConfig(basePack(), NOW);
  const priceSnapshot = fullSnapshot();
  const inputs = { serverSeed: 'a'.repeat(64), clientSeed: 'holden', nonce: 7 };

  const a = openPack({ packSnapshot, priceSnapshot, inputs, now: NOW });
  const b = openPack({ packSnapshot, priceSnapshot, inputs, now: NOW });
  assert.deepEqual(a.cards.map((c) => c.variantId), b.cards.map((c) => c.variantId));
  assert.equal(a.openingId, b.openingId);
});

test('changing the nonce changes the outcome stream', () => {
  const packSnapshot = lockPackConfig(basePack(), NOW);
  const priceSnapshot = fullSnapshot();
  const draws = new Set<string>();
  for (let nonce = 0; nonce < 200; nonce++) {
    const r = openPack({
      packSnapshot, priceSnapshot,
      inputs: { serverSeed: 'a'.repeat(64), clientSeed: 'holden', nonce },
      now: NOW,
    });
    draws.add(r.cards[0].variantId);
  }
  assert.ok(draws.size > 1, 'expected more than one distinct outcome across 200 nonces');
});

test('every pulled card carries a price frozen in the snapshot', () => {
  const packSnapshot = lockPackConfig(basePack(), NOW);
  const priceSnapshot = fullSnapshot();
  for (let nonce = 0; nonce < 50; nonce++) {
    const r = openPack({
      packSnapshot, priceSnapshot,
      inputs: { serverSeed: 'b'.repeat(64), clientSeed: 'c', nonce },
      now: NOW,
    });
    const pulled = r.cards[0];
    assert.equal(pulled.quote.variantId, pulled.variantId);
    assert.equal(pulled.quote, priceSnapshot.quotes[pulled.variantId]);
  }
});

test('an opening is refused when any outcome in the pool is unpriced', () => {
  const packSnapshot = lockPackConfig(basePack(), NOW);
  const partial = fullSnapshot();
  const stripped = { ...partial.quotes } as Record<string, any>;
  delete stripped['base1|4|holofoil|unlimited'];
  const bad = buildPriceSnapshot(stripped, {
    provider: 'tcgplayer', currency: 'USD', ttlMs: 3_600_000, now: NOW,
  });

  assert.throws(
    () => openPack({ packSnapshot, priceSnapshot: bad, inputs: { serverSeed: 's', clientSeed: 'c', nonce: 1 }, now: NOW }),
    SnapshotIntegrityError,
  );
});

test('an expired price snapshot is refused', () => {
  const packSnapshot = lockPackConfig(basePack(), NOW);
  const priceSnapshot = fullSnapshot();
  const later = new Date(NOW.getTime() + 7_200_000);
  assert.throws(
    () => openPack({ packSnapshot, priceSnapshot, inputs: { serverSeed: 's', clientSeed: 'c', nonce: 1 }, now: later }),
    /expired/,
  );
});

test('a tampered price snapshot fails its hash check', () => {
  const packSnapshot = lockPackConfig(basePack(), NOW);
  const priceSnapshot = fullSnapshot();
  const tampered = {
    ...priceSnapshot,
    quotes: {
      ...priceSnapshot.quotes,
      'sv3pt5|4|non-foil|unlimited': {
        ...priceSnapshot.quotes['sv3pt5|4|non-foil|unlimited'],
        referenceValue: 9999,
      },
    },
  };
  assert.throws(
    () => openPack({ packSnapshot, priceSnapshot: tampered, inputs: { serverSeed: 's', clientSeed: 'c', nonce: 1 }, now: NOW }),
    /failed hash check/,
  );
});

test('a snapshot mixing currencies is rejected at build time', () => {
  assert.throws(
    () =>
      buildPriceSnapshot(
        {
          'a|1|non-foil|unlimited': {
            variantId: 'a|1|non-foil|unlimited', low: 1, mid: 1, high: 1, market: 1,
            referenceValue: 1, basis: 'market', currency: 'EUR',
            source: 't', sourceUrl: null, sourceUpdatedAt: null,
          } as any,
        },
        { provider: 'tcgplayer', currency: 'USD', ttlMs: 1000, now: NOW },
      ),
    /Mixed currency/,
  );
});

test('content hashing is order-independent', () => {
  assert.equal(contentHash({ a: 1, b: 2 }), contentHash({ b: 2, a: 1 }));
  assert.notEqual(contentHash({ a: 1 }), contentHash({ a: 2 }));
});

test('the result carries everything needed to re-verify it', () => {
  const packSnapshot = lockPackConfig(basePack(), NOW);
  const priceSnapshot = fullSnapshot();
  const inputs = { serverSeed: 'seed', clientSeed: 'client', nonce: 3 };
  const r = openPack({ packSnapshot, priceSnapshot, inputs, now: NOW });

  assert.equal(r.verification.serverSeedHash, sha256('seed'));
  assert.equal(r.verification.priceSnapshotHash, priceSnapshot.contentHash);
  assert.equal(r.verification.packConfigSnapshotHash, packSnapshot.contentHash);
  assert.equal(r.verification.serverSeed, null, 'server seed stays secret until rotation');
});

/* ------------------------------------------------------------------ *
 * Provable fairness
 * ------------------------------------------------------------------ */

test('seed commitment verifies', () => {
  const { serverSeed, serverSeedHash } = createSeedCommitment();
  assert.ok(verifySeedCommitment(serverSeed, serverSeedHash));
  assert.ok(!verifySeedCommitment(serverSeed + '0', serverSeedHash));
});

test('derived floats are uniform in [0,1) and reproducible', () => {
  const inputs = { serverSeed: 'deadbeef', clientSeed: 'player', nonce: 1 };
  const a = deriveFloats(inputs, 500);
  const b = deriveFloats(inputs, 500);
  assert.deepEqual(a, b);
  assert.ok(a.every((f) => f >= 0 && f < 1));
  const mean = a.reduce((s, f) => s + f, 0) / a.length;
  assert.ok(Math.abs(mean - 0.5) < 0.05, `mean ${mean} not near 0.5`);
});

/* ------------------------------------------------------------------ *
 * Provider mapping
 * ------------------------------------------------------------------ */

test('the API slash date format is normalized to ISO', () => {
  assert.equal(normalizeApiDate('2026/09/08'), '2026-09-08T00:00:00.000Z');
  assert.equal(normalizeApiDate('1999-01-09'), '1999-01-09T00:00:00.000Z');
  assert.equal(normalizeApiDate(undefined), null);
  assert.equal(normalizeApiDate('not a date'), null);
});

test('mapPrices splits 1st edition from unlimited', () => {
  const mapped = mapPrices({
    id: 'base2-4', name: 'Jolteon', number: '4',
    set: { id: 'base2', name: 'Jungle', series: 'Base' },
    images: { small: 's', large: 'l' },
    tcgplayer: {
      url: 'u', updatedAt: '2026/09/08',
      prices: {
        '1stEditionHolofoil': { low: 154.95, mid: 254.52, high: 1909.8, market: 258.06, directLow: null },
        unlimitedHolofoil: { low: 56.83, mid: 72.23, high: 999, market: 99.06, directLow: 169.99 },
      },
    },
  } as any);

  assert.ok(mapped);
  assert.equal(mapped.firstEditionHolofoilMarket, 258.06);
  assert.equal(mapped.unlimitedHolofoilMarket, 99.06);
  assert.equal(mapped.holofoilMarket, null, 'the bare holofoil key must stay empty here');
  assert.equal(mapped.tcgplayerUpdatedAt, '2026-09-08T00:00:00.000Z');
});

test('a card with no pricing yields no report rather than a zeroed one', () => {
  assert.equal(mapPrices({ tcgplayer: {} } as any), null);
  assert.equal(mapPrices({} as any), null);
});
