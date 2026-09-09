/**
 * Pack-opening ledger tests (spec §17).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PriceQuote } from '../src/price.ts';
import type { PackConfig } from '../src/odds.ts';
import { buildPriceSnapshot, lockPackConfig, openPack } from '../src/snapshot.ts';
import { classifyTier, PullTier } from '../src/tiers.ts';
import {
  JsonOpeningLedger,
  LedgerConflictError,
  aggregateWalletStats,
  cardIdForVariant,
  fromOpenResult,
  type StoredOpening,
  type StoredOpeningCard,
} from '../src/openings.ts';

const CHARIZARD = 'base1|4|holofoil|1st-edition';
const BLASTOISE = 'base1|2|holofoil|unlimited';
const PIDGEY = 'base1|57|non-foil|unlimited';

const WALLET = '0xRipper';
const OTHER = '0xTourist';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function card(variantId: string, value: number, slot: number): StoredOpeningCard {
  return {
    variantId,
    cardId: cardIdForVariant(variantId),
    probability: 0.01,
    referenceValue: value,
    currency: 'USD',
    tier: classifyTier(value),
    slot,
  };
}

function rip(
  openingId: string,
  wallet: string,
  openedAt: string,
  pulls: [string, number][],
): StoredOpening {
  return {
    openingId,
    openedAt,
    wallet,
    packId: 'vintage-base',
    packVersion: 'v1',
    cards: pulls.map(([variantId, value], slot) => card(variantId, value, slot)),
    verification: {
      serverSeedHash: `ssh-${openingId}`,
      clientSeed: 'client-seed',
      nonce: 1,
      priceSnapshotId: 'ps_test',
      packConfigSnapshotId: 'pc_test',
      priceSnapshotHash: 'price-hash',
      packConfigSnapshotHash: 'config-hash',
      serverSeed: null,
    },
  };
}

async function ledger(t: { after(fn: () => unknown): void }): Promise<{
  dir: string;
  ledger: JsonOpeningLedger;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'ripdex-led-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { dir, ledger: new JsonOpeningLedger(dir) };
}

function quote(variantId: string, value: number): PriceQuote {
  return {
    variantId,
    low: value * 0.9,
    mid: value,
    high: value * 1.2,
    market: value,
    referenceValue: value,
    basis: 'market',
    currency: 'USD',
    source: 'test',
    sourceUrl: null,
    sourceUpdatedAt: '2026-09-08T00:00:00.000Z',
  };
}

const PACK: PackConfig = {
  id: 'vintage-base',
  name: 'Vintage Base',
  version: 'v1',
  cardsPerPack: 3,
  priceRip: 1000n,
  distributionModel: { kind: 'flat' },
  pool: [
    { variantId: CHARIZARD, weight: 1 },
    { variantId: BLASTOISE, weight: 9 },
    { variantId: PIDGEY, weight: 990 },
  ],
  artwork: {
    wrapperAssetKey: 'wrapper/base',
    heroAssetKey: null,
    accentColor: '#F97316',
    backgroundColor: '#0D1117',
    foilTone: 'warm',
    texture: 'aged',
  },
  allowDuplicatesWithinPack: true,
};

const PRICES: Record<string, PriceQuote> = {
  [CHARIZARD]: quote(CHARIZARD, 8400.5),
  [BLASTOISE]: quote(BLASTOISE, 312.25),
  [PIDGEY]: quote(PIDGEY, 1.75),
};

function openOne() {
  const now = new Date('2026-09-08T12:00:00.000Z');
  const packSnapshot = lockPackConfig(PACK, now);
  const priceSnapshot = buildPriceSnapshot(PRICES, {
    provider: 'test',
    currency: 'USD',
    ttlMs: 60_000,
    now,
  });
  return openPack({
    packSnapshot,
    priceSnapshot,
    inputs: { serverSeed: 'a'.repeat(64), clientSeed: 'client-seed', nonce: 7 },
    now,
  });
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

test('recording the same openingId twice is a no-op, not a second rip', async (t) => {
  const { ledger: led } = await ledger(t);
  const one = rip('rip_a', WALLET, '2026-09-08T10:00:00.000Z', [[CHARIZARD, 8400.5]]);

  const first = await led.record(one);
  const retry = await led.record(one);

  assert.equal(first.stored, true);
  assert.equal(retry.stored, false, 'a retry must not store a second rip');
  assert.deepEqual(retry.opening, first.opening);

  // The counters an achievement would read must not have moved.
  assert.equal(await led.countByVariant(CHARIZARD), 1);
  assert.equal((await led.walletStats(WALLET)).rips, 1);
  assert.equal((await led.walletStats(WALLET)).totalReferenceValue, 8400.5);
  assert.equal((await led.recent(10)).length, 1);
});

test('a retry whose clock or revealed seed differs is still the same rip', async (t) => {
  const { ledger: led } = await ledger(t);
  const one = rip('rip_a', WALLET, '2026-09-08T10:00:00.000Z', [[BLASTOISE, 312.25]]);
  await led.record(one);

  const revealed: StoredOpening = {
    ...one,
    openedAt: '2026-09-08T10:00:00.900Z',
    verification: { ...one.verification, serverSeed: 'b'.repeat(64) },
  };
  const again = await led.record(revealed);

  assert.equal(again.stored, false);
  assert.equal(again.opening.openedAt, '2026-09-08T10:00:00.000Z', 'first write wins');
  assert.equal(await led.countByVariant(BLASTOISE), 1);
});

test('the same openingId with different cards is rejected', async (t) => {
  const { ledger: led } = await ledger(t);
  await led.record(rip('rip_a', WALLET, '2026-09-08T10:00:00.000Z', [[PIDGEY, 1.75]]));

  await assert.rejects(
    () => led.record(rip('rip_a', WALLET, '2026-09-08T10:00:00.000Z', [[CHARIZARD, 8400.5]])),
    LedgerConflictError,
  );
});

test('listByWallet is newest first and scoped to one wallet', async (t) => {
  const { ledger: led } = await ledger(t);
  await led.record(rip('rip_1', WALLET, '2026-09-01T00:00:00.000Z', [[PIDGEY, 1.75]]));
  await led.record(rip('rip_3', WALLET, '2026-09-03T00:00:00.000Z', [[CHARIZARD, 8400.5]]));
  await led.record(rip('rip_2', WALLET, '2026-09-02T00:00:00.000Z', [[BLASTOISE, 312.25]]));
  await led.record(rip('rip_x', OTHER, '2026-09-04T00:00:00.000Z', [[PIDGEY, 1.75]]));

  const mine = await led.listByWallet(WALLET);
  assert.deepEqual(mine.map((o) => o.openingId), ['rip_3', 'rip_2', 'rip_1']);

  const page = await led.listByWallet(WALLET, { limit: 2 });
  assert.deepEqual(page.map((o) => o.openingId), ['rip_3', 'rip_2']);

  const older = await led.listByWallet(WALLET, { before: '2026-09-03T00:00:00.000Z', limit: 2 });
  assert.deepEqual(older.map((o) => o.openingId), ['rip_2', 'rip_1'], 'before is exclusive');

  // The global feed sees every wallet.
  assert.deepEqual((await led.recent(2)).map((o) => o.openingId), ['rip_x', 'rip_3']);
});

test('countByVariant counts copies, listByVariant counts rips', async (t) => {
  const { ledger: led } = await ledger(t);
  // One rip that pulled Pidgey twice, one that pulled it once.
  await led.record(
    rip('rip_1', WALLET, '2026-09-01T00:00:00.000Z', [
      [PIDGEY, 1.75],
      [PIDGEY, 1.75],
      [BLASTOISE, 312.25],
    ]),
  );
  await led.record(rip('rip_2', OTHER, '2026-09-02T00:00:00.000Z', [[PIDGEY, 1.75]]));

  assert.equal(await led.countByVariant(PIDGEY), 3, 'a duplicate in one pack is two pulls');
  assert.equal(await led.countByVariant(BLASTOISE), 1);
  assert.equal(await led.countByVariant(CHARIZARD), 0, 'never pulled is zero, not undefined');

  const rips = await led.listByVariant(PIDGEY, 10);
  assert.deepEqual(rips.map((o) => o.openingId), ['rip_2', 'rip_1'], 'one entry per rip, newest first');
  assert.equal((await led.listByVariant(PIDGEY, 1)).length, 1);
});

test('walletStats aggregates value, best pull and bounds', async (t) => {
  const { ledger: led } = await ledger(t);
  await led.record(
    rip('rip_1', WALLET, '2026-09-01T00:00:00.000Z', [
      [PIDGEY, 1.75],
      [BLASTOISE, 312.25],
    ]),
  );
  await led.record(rip('rip_2', WALLET, '2026-09-05T00:00:00.000Z', [[CHARIZARD, 8400.5]]));
  await led.record(rip('rip_x', OTHER, '2026-09-09T00:00:00.000Z', [[CHARIZARD, 8400.5]]));

  const stats = await led.walletStats(WALLET);
  assert.equal(stats.rips, 2);
  assert.equal(stats.totalReferenceValue, 8714.5);
  assert.equal(stats.bestPull?.card.variantId, CHARIZARD);
  assert.equal(stats.bestPull?.card.tier, PullTier.Grail);
  assert.equal(stats.bestPull?.openingId, 'rip_2');
  assert.equal(stats.firstRipAt, '2026-09-01T00:00:00.000Z');
  assert.equal(stats.lastRipAt, '2026-09-05T00:00:00.000Z');
});

test('a wallet with no rips reports zeros and null timestamps', async (t) => {
  const { ledger: led } = await ledger(t);
  await led.record(rip('rip_1', WALLET, '2026-09-01T00:00:00.000Z', [[PIDGEY, 1.75]]));

  const stats = await led.walletStats('0xNobody');
  assert.deepEqual(stats, {
    rips: 0,
    totalReferenceValue: 0,
    bestPull: null,
    firstRipAt: null,
    lastRipAt: null,
  });
  // Null, not the epoch: the UI must be able to say "no rips yet".
  assert.equal(aggregateWalletStats([]).lastRipAt, null);
});

test('a tie on best pull keeps the earlier rip', async (t) => {
  const { ledger: led } = await ledger(t);
  await led.record(rip('rip_late', WALLET, '2026-09-05T00:00:00.000Z', [[CHARIZARD, 8400.5]]));
  await led.record(rip('rip_early', WALLET, '2026-09-01T00:00:00.000Z', [[CHARIZARD, 8400.5]]));

  assert.equal((await led.walletStats(WALLET)).bestPull?.openingId, 'rip_early');
});

test('fromOpenResult round-trips a pack open through the ledger', async (t) => {
  const { dir, ledger: led } = await ledger(t);
  const result = openOne();
  const stored = fromOpenResult(result, WALLET);

  assert.equal(stored.openingId, result.openingId);
  assert.equal(stored.openedAt, result.openedAt);
  assert.equal(stored.wallet, WALLET);
  assert.equal(stored.packId, 'vintage-base');
  assert.equal(stored.packVersion, 'v1');
  assert.equal(stored.cards.length, PACK.cardsPerPack);

  // Slot is draw order, contiguous from zero — it is the (opening_id, slot) key.
  assert.deepEqual(stored.cards.map((c) => c.slot), [0, 1, 2]);

  for (const [i, c] of stored.cards.entries()) {
    const drawn = result.cards[i];
    assert.equal(c.variantId, drawn.variantId);
    assert.equal(c.probability, drawn.probability);
    assert.equal(c.currency, 'USD');
    assert.equal(c.tier, drawn.tier);
    // The frozen snapshot price, not a recomputed one.
    assert.equal(c.referenceValue, PRICES[c.variantId].referenceValue);
    assert.equal(c.cardId, cardIdForVariant(c.variantId));
    assert.ok(!c.cardId.includes('|'), 'cardId is a catalog id, not a variant id');
  }

  assert.deepEqual(stored.verification, {
    serverSeedHash: result.verification.serverSeedHash,
    clientSeed: 'client-seed',
    nonce: 7,
    priceSnapshotId: result.verification.priceSnapshotId,
    packConfigSnapshotId: result.verification.packConfigSnapshotId,
    priceSnapshotHash: result.verification.priceSnapshotHash,
    packConfigSnapshotHash: result.verification.packConfigSnapshotHash,
    serverSeed: null,
  });

  const write = await led.record(stored);
  assert.equal(write.stored, true);
  await led.close();

  // Reopen: a fresh ledger over the same file must rebuild every index, and
  // re-recording after a restart must still be idempotent.
  const reopened = new JsonOpeningLedger(dir);
  const [back] = await reopened.listByWallet(WALLET);
  assert.deepEqual(back, stored);
  assert.equal(
    await reopened.countByVariant(stored.cards[0].variantId),
    stored.cards.filter((c) => c.variantId === stored.cards[0].variantId).length,
  );
  assert.equal((await reopened.record(stored)).stored, false, 'idempotent across restarts');
  assert.equal((await reopened.walletStats(WALLET)).rips, 1);
});

test('a stored rip is frozen against later mutation', async (t) => {
  const { ledger: led } = await ledger(t);
  const one = rip('rip_a', WALLET, '2026-09-01T00:00:00.000Z', [[BLASTOISE, 312.25]]);
  const { opening } = await led.record(one);

  // The recorded price is what the user was shown; nothing may edit it after.
  assert.throws(() => {
    (opening.cards[0] as { referenceValue: number }).referenceValue = 1;
  });
  assert.equal((await led.walletStats(WALLET)).totalReferenceValue, 312.25);
});
