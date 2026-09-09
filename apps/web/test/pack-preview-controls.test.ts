import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { packExplorer } from '../src/pack-explorer.ts';
import { CHARIZARD_CHASE } from '../packs/charizard-chase.ts';
import type { CardListing, CatalogIndex, PackConfig, VariantListing } from '../../../packages/pokemon-core/src/index.ts';

function harness() {
  const entries = [
    { id: 'base2|4|holofoil|unlimited', name: 'Jolteon', label: 'Holofoil', number: '4', value: 0, weight: 50 },
    { id: 'base2|4|holofoil|1st-edition', name: 'Jolteon', label: '1st Edition Holofoil', number: '4', value: 105, weight: 5 },
    { id: 'base2|6|holofoil|unlimited', name: 'Charizard', label: 'Holofoil', number: '6', value: 35, weight: 25 },
    { id: 'base2|151|reverse-holofoil|unlimited', name: 'Mew', label: 'Reverse Holofoil', number: '151', value: null, weight: 20 },
  ];
  const index = {
    facets: { sets: [{ id: 'base2', name: 'Jungle' }] },
    byVariantId: new Map(entries.map(e => [e.id, {
      card: { cardId: `base2-${e.number}`, name: e.name, setId: 'base2', setName: 'Jungle', number: e.number, imageSmall: 'https://example.com/card.png' } as CardListing,
      variant: { variantId: e.id, label: e.label, referenceValue: e.value, tier: e.value === null ? 'UNPRICED' : 'TIER_1', currency: 'USD' } as VariantListing,
    }])),
  } as CatalogIndex;
  const packs: PackConfig[] = [
    { ...CHARIZARD_CHASE, id: 'mixed-pack', name: 'Mixed pack', pool: entries.map(e => ({ variantId: e.id, weight: e.weight })) },
    { ...CHARIZARD_CHASE, id: 'mew-pack', name: 'Mew pack', pool: [{ variantId: entries[3].id, weight: 1 }] },
  ];
  const html = packExplorer(packs, index);
  const models = JSON.parse(html.match(/id="pack-preview-data">([\s\S]*?)<\/script>/)![1]);
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)![1];
  type Handler = (event?: { preventDefault: () => void }) => void;
  function element() {
    return {
      handlers: {} as Record<string, Handler>, value: '', textContent: '', innerHTML: '', hidden: false, focused: false, open: false,
      dataset: {} as Record<string, string>, options: [] as { value: string }[],
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(event: string, fn: Handler) { this.handlers[event] = fn; },
      setAttribute() {}, focus() { this.focused = true; },
      showModal() { this.open = true; }, close() { this.open = false; this.handlers.close?.(); },
      querySelector: (_selector: string) => element(), querySelectorAll: (_selector: string) => [],
    };
  }
  const nodes: Record<string, ReturnType<typeof element>> = {};
  const get = (id: string) => nodes[id] ??= element();
  get('pack-explorer');
  get('pack-preview-data').textContent = JSON.stringify(models);
  get('pack-sort').value = 'curated';
  get('pack-sort').options = ['curated', 'price-asc', 'price-desc', 'name'].map(value => ({ value }));
  const triggers = packs.map(p => Object.assign(element(), { dataset: { preview: p.id } }));
  let dialogHTML = '';
  Object.defineProperty(get('pack-dialog-body'), 'innerHTML', {
    get: () => dialogHTML,
    set: (markup: string) => {
      dialogHTML = markup;
      // Replacing dialog content creates fresh controls, as innerHTML does in a browser.
      for (const match of markup.matchAll(/id="([^"]+)"/g)) nodes[match[1]] = element();
      get('outcome-sort').value = 'probability';
    },
  });
  const location = { href: 'https://ripdex.example/packs?ref=shared' };
  runInNewContext(script, {
    URL, location,
    document: {
      getElementById: get, querySelectorAll: (selector: string) => selector === '[data-preview]' ? triggers : [],
      documentElement: { classList: { add() {}, remove() {} } },
    },
    history: { state: null, replaceState: (_state: unknown, _title: string, url: string) => { location.href = url; } },
    addEventListener() {},
  });
  return {
    get, models, location,
    open: (index = 0) => triggers[index].handlers.click({ preventDefault() {} }),
    search: (query: string) => { get('outcome-search').value = query; get('outcome-search').handlers.input(); },
    sort: (order: string) => { get('outcome-sort').value = order; get('outcome-sort').handlers.change(); },
    rows: () => [...get('preview-outcomes').innerHTML.matchAll(/<strong>(.*?)<\/strong><small>(.*?)<\/small>/g)].map(m => `${m[1]} / ${m[2]}`),
  };
}

test('preview search matches card, printing, set, number and variant ID without changing published odds', () => {
  const h = harness(); h.open();
  h.search('  JOLTEON   1st  ');
  assert.equal(h.get('outcome-count').textContent, '1 of 4 outcomes');
  assert.match(h.rows()[0], /Jolteon \/ 1st Edition Holofoil/);
  assert.ok(h.get('preview-outcomes').innerHTML.includes(h.models[0].outcomes.find((o: { value: number }) => o.value === 105).probabilityLabel));
  assert.ok(h.get('preview-outcomes').innerHTML.includes('$105.00'));
  assert.equal(h.get('outcome-empty').hidden, true);
  for (const query of ['Jungle #151', 'reverse-holofoil', 'base2|151|reverse-holofoil|unlimited']) {
    h.search(query);
    assert.equal(h.rows().length, 1);
    assert.match(h.rows()[0], /^Mew /);
  }
  assert.equal(h.location.href, 'https://ripdex.example/packs?ref=shared');
});

test('value sorting keeps unknown values last, treats zero as priced, and leaves probability order intact', () => {
  const h = harness(); h.open();
  const originalOrder = h.rows();
  h.sort('value-desc');
  assert.match(h.rows()[0], /Jolteon \/ 1st Edition/);
  assert.match(h.rows()[1], /^Charizard /);
  assert.match(h.rows()[2], /Jolteon \/ Holofoil/);
  assert.match(h.rows()[3], /^Mew /);
  assert.ok(h.get('preview-outcomes').innerHTML.includes('$0.00'));
  assert.ok(h.get('preview-outcomes').innerHTML.includes('Unpriced'));
  h.sort('name');
  assert.deepEqual(h.rows().map(row => row.split(' / ')[0]), ['Charizard', 'Jolteon', 'Jolteon', 'Mew']);
  h.sort('probability');
  assert.deepEqual(h.rows(), originalOrder);
});

test('empty results can reset filters and focus, and opening another pack starts with fresh controls', () => {
  const h = harness(); h.open();
  h.sort('value-desc'); h.search('not-a-pokemon');
  assert.equal(h.get('outcome-empty').hidden, false);
  assert.equal(h.get('outcome-count').textContent, '0 of 4 outcomes');
  assert.equal(h.get('preview-outcomes').innerHTML, '');
  assert.equal(h.get('outcome-reset').hidden, false);
  h.get('outcome-empty-reset').handlers.click();
  assert.equal(h.get('outcome-search').value, '');
  assert.equal(h.get('outcome-search').focused, true);
  assert.equal(h.get('outcome-sort').value, 'probability');
  assert.equal(h.get('outcome-count').textContent, '4 of 4 outcomes');
  assert.equal(h.get('outcome-reset').hidden, true);
  h.search('Jolteon'); h.sort('name'); h.get('pack-dialog').close(); h.open(1);
  assert.equal(h.get('outcome-search').value, '');
  assert.equal(h.get('outcome-sort').value, 'probability');
  assert.equal(h.get('outcome-count').textContent, '1 of 1 outcome');
  assert.match(h.rows()[0], /^Mew /);
  assert.ok(h.get('pack-dialog-body').innerHTML.includes('/rip/mew-pack'));
  assert.ok(h.get('pack-dialog-body').innerHTML.includes('/packs#odds-mew-pack'));
});
