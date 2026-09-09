import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { packExplorer } from '../src/pack-explorer.ts';
import type { CatalogIndex } from '../../../packages/pokemon-core/src/index.ts';

function harness(href: string) {
  function element() {
    const handlers: Record<string, () => void> = {};
    const attributes: Record<string, string> = {};
    return { handlers, attributes, value: '', textContent: '', hidden: false, focused: false,
      classList: { toggle() {} }, dataset: {} as Record<string, string>,
      addEventListener: (event: string, fn: () => void) => { handlers[event] = fn; },
      setAttribute: (key: string, value: string) => { attributes[key] = value; },
      querySelector: () => element(), focus() { this.focused = true; },
    };
  }
  const nodes: Record<string, ReturnType<typeof element>> = {};
  const getNode = (id: string) => nodes[id] ??= element();
  const tabs = ['', 'base1', 'base2'].map(value => ({ ...element(), dataset: { packSet: value } }));
  const root = { querySelectorAll: (selector: string) => selector === '[data-pack-set]' ? tabs : [] };
  const sort = Object.assign(getNode('pack-sort'), { options: ['curated', 'price-asc', 'price-desc', 'name'].map(value => ({ value })) });
  getNode('pack-preview-data').textContent = '[]';
  const location = { href };
  const state = { unrelatedState: true };
  const replacements: string[] = [];
  const events: Record<string, () => void> = {};
  const index = { facets: { sets: [{ id: 'base1', name: 'Base Set' }, { id: 'base2', name: 'Jungle' }] } } as CatalogIndex;
  const script = [...packExplorer([], index).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)![1];
  runInNewContext(script, {
    URL, location,
    document: { getElementById: (id: string) => id === 'pack-explorer' ? root : getNode(id), querySelectorAll: () => [] },
    history: { state, replaceState: (nextState: unknown, _: string, url: string) => {
      assert.equal(nextState, state); location.href = url; replacements.push(url);
    } },
    addEventListener: (event: string, fn: () => void) => { events[event] = fn; },
  });
  return { nodes, tabs, sort, location, replacements, events };
}

test('pack filter URLs restore on both routes and validate unknown set and sort values', () => {
  for (const path of ['/', '/packs']) {
    const h = harness(`https://ripdex.example${path}?packSearch=Charizard&packSet=base2&packSort=price-desc#discover`);
    assert.equal(h.nodes['pack-search'].value, 'Charizard');
    assert.equal(h.sort.value, 'price-desc');
    assert.equal(h.tabs[2].attributes['aria-pressed'], 'true');
    assert.equal(h.replacements.length, 0);
  }
  const h = harness('https://ripdex.example/packs?packSet=unknown&packSort=unknown&ref=shared#odds-test');
  assert.equal(h.sort.value, 'curated');
  assert.equal(h.tabs[0].attributes['aria-pressed'], 'true');
  assert.equal(h.location.href, 'https://ripdex.example/packs?ref=shared#odds-test');
});

test('editing and clearing pack filters preserve other query parameters, history state and the hash', () => {
  const h = harness('https://ripdex.example/?ref=friend#rip-token');
  h.nodes['pack-search'].value = 'Mew & friends';
  h.nodes['pack-search'].handlers.input();
  h.tabs[1].handlers.click();
  h.sort.value = 'price-asc'; h.sort.handlers.change();
  const url = new URL(h.location.href);
  assert.equal(url.searchParams.get('packSearch'), 'Mew & friends');
  assert.equal(url.searchParams.get('packSet'), 'base1');
  assert.equal(url.searchParams.get('packSort'), 'price-asc');
  assert.equal(url.searchParams.get('ref'), 'friend');
  assert.equal(url.hash, '#rip-token');
  h.nodes['pack-reset'].handlers.click();
  assert.equal(h.location.href, 'https://ripdex.example/?ref=friend#rip-token');
  assert.equal(h.nodes['pack-search'].value, '');
  assert.equal(h.nodes['pack-search'].focused, true);
  assert.equal(h.sort.value, 'curated');
  assert.equal(h.tabs[0].attributes['aria-pressed'], 'true');
});

test('browser history and page restoration use the URL rather than stale form state', () => {
  const h = harness('https://ripdex.example/packs?packSearch=Mew&packSet=base1&packSort=name');
  h.location.href = 'https://ripdex.example/packs?packSearch=Jolteon&packSet=base2&packSort=price-asc';
  h.events.popstate();
  assert.equal(h.nodes['pack-search'].value, 'Jolteon');
  assert.equal(h.sort.value, 'price-asc');
  assert.equal(h.tabs[2].attributes['aria-pressed'], 'true');
  h.location.href = 'https://ripdex.example/packs';
  h.events.pageshow();
  assert.equal(h.nodes['pack-search'].value, '');
  assert.equal(h.sort.value, 'curated');
  assert.equal(h.tabs[0].attributes['aria-pressed'], 'true');
  assert.equal(h.replacements.length, 0);
});
