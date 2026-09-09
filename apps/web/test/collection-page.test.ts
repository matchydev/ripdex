import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionPage, type CollectionPageInput } from '../src/wallet-pages.ts';
import { DEFAULT_ACHIEVEMENTS, paginateBinder, type AchievementStatus } from '../../../packages/pokemon-core/src/index.ts';

function fixture(overrides: Partial<CollectionPageInput> = {}): CollectionPageInput {
  return {
    wallet: '0xcollector',
    stats: { rips: 0, totalReferenceValue: 0, bestPull: null, firstRipAt: null, lastRipAt: null },
    page: paginateBinder([])[0], pageCount: 1, pageNumber: 1, sort: 'set',
    completion: [], duplicates: { entries: [], totalDuplicates: 0, totalValue: 0 },
    achievements: [], uniqueVariants: 0,
    ...overrides,
  };
}

function status(id: string, unlocked = false): AchievementStatus {
  const def = DEFAULT_ACHIEVEMENTS.find((achievement) => achievement.id === id);
  assert.ok(def, `Unknown real achievement: ${id}`);
  return { def, unlocked, unlockedAt: null, progress: { current: unlocked ? def.target : 0, target: def.target } };
}

function section(html: string, id: string): string {
  const content = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?<\\/section>`))?.[0];
  assert.ok(content, `Missing collection section ${id}`);
  return content;
}

test('the gold medal follows the Grail achievement ID, never a name or another rarity target', () => {
  const achievements = DEFAULT_ACHIEVEMENTS.map((def) => ({
    ...status(def.id, true),
    def: { ...def, name: def.id === 'GRAIL_HUNTER' ? 'Renamed collector medal' : def.id === 'FIRST_RIP' ? 'Grail in the display name' : def.name },
  }));
  const html = section(collectionPage(fixture({ achievements })), 'achievements');
  const rows = html.split(/<div class="a(?= |")/).slice(1);
  assert.equal(rows.length, DEFAULT_ACHIEVEMENTS.length);
  for (const row of rows) {
    const isGrail = row.includes('data-achievement="GRAIL_HUNTER"');
    assert.equal(row.includes('/art/achievements/grail-puller.png'), isGrail);
    assert.equal(row.includes('/art/achievements/medal-base.png'), !isGrail);
  }
});

test('unlocked state stays explicit without a timestamp and locked progress is readable to assistive technology', () => {
  const locked = { ...status('KANTO_COLLECTOR'), progress: { current: 13, target: 50 } };
  const html = section(collectionPage(fixture({ achievements: [status('FIRST_RIP', true), locked] })), 'achievements');
  assert.match(html, /> Unlocked<\/div>/);
  assert.match(html, /> Locked<\/div>/);
  assert.match(html, /aria-label="Kanto Collector progress" aria-valuemin="0" aria-valuemax="50" aria-valuenow="13"/);
  assert.match(html, /<div class="pr">13 \/ 50<\/div>/);
  assert.match(html, /1 of 2 unlocked/);
});

test('empty real binder retains nine sleeves and offers catalog exploration without page-zero links', () => {
  const html = collectionPage(fixture());
  const binder = section(html, 'binder');
  assert.match(binder, /Your binder is ready/);
  assert.match(binder, /href="\/cards"/);
  assert.equal((binder.match(/class="slot empty"/g) ?? []).length, 9);
  assert.match(binder, /PAGE 1 OF 1/);
  assert.equal((binder.match(/<button[^>]*disabled/g) ?? []).length, 2);
  assert.doesNotMatch(binder, /<a[^>]*[?&]page=/);
  for (const id of ['binder', 'set-completion', 'achievements', 'duplicates']) {
    assert.ok(html.includes(`href="#${id}"`));
    section(html, id);
  }
  assert.doesNotMatch(section(collectionPage(fixture({ page: null, pageCount: 0 })), 'binder'), /PAGE 1 OF 0/);
});

test('binder boundaries use disabled buttons and valid adjacent links preserve sorting and the binder anchor', () => {
  for (const pageNumber of [1, 2, 3]) {
    const binder = section(collectionPage(fixture({ pageNumber, pageCount: 3, sort: 'pull-date', uniqueVariants: 20 })), 'binder');
    assert.equal(binder.includes('rel="prev"'), pageNumber > 1);
    assert.equal(binder.includes('rel="next"'), pageNumber < 3);
    assert.equal((binder.match(/<button[^>]*disabled/g) ?? []).length, pageNumber === 2 ? 0 : 1);
    if (pageNumber > 1) assert.ok(binder.includes(`?page=${pageNumber - 1}&sort=pull-date#binder`));
    if (pageNumber < 3) assert.ok(binder.includes(`?page=${pageNumber + 1}&sort=pull-date#binder`));
  }
});

test('unknown progress targets remain indeterminate and overflow cannot exceed the semantic maximum', () => {
  const unavailable = { ...status('FULL_SET'), progress: { current: 0, target: 0 } };
  const overflow = { ...status('HOLO_HOARDER'), progress: { current: 40, target: 25 } };
  const html = section(collectionPage(fixture({ achievements: [unavailable, overflow] })), 'achievements');
  assert.match(html, /aria-label="Set Completionist progress" aria-valuetext="Progress unavailable"/);
  assert.doesNotMatch(html, /aria-valuemax="0"|NaN|Infinity/);
  assert.match(html, /aria-valuemax="25" aria-valuenow="25"/);
  assert.match(html, /--pct:100\.0%/);
});

test('set progress identifies actual card counts and links directly to that set in the catalog', () => {
  const html = section(collectionPage(fixture({ completion: [
    { setId: 'base1', setName: 'Base Set', collected: 4, total: 102, percent: 3.9 },
    { setId: 'unknown', setName: 'Unavailable set', collected: 0, total: 0, percent: 0 },
  ] })), 'set-completion');
  assert.match(html, /aria-label="Base Set collection progress" aria-valuemin="0" aria-valuemax="102" aria-valuenow="4"/);
  assert.match(html, /href="\/cards\?setId=base1"/);
  assert.match(html, /aria-label="Unavailable set collection progress" aria-valuetext="Progress unavailable"/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
