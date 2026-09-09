import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { BINDER_LOOKUP_JS } from '../src/binder-lookup.ts';

function harness(initial: string | null = null, blocked = false) {
  class Element {
    children: Element[] = [];
    events: Record<string, (event?: any) => void> = {};
    textContent = '';
    value = '';
    href = '';
    hidden = false;
    focused = false;
    error = '';
    append(...nodes: Element[]) { this.children.push(...nodes); }
    replaceChildren() { this.children = []; }
    setAttribute() {}
    addEventListener(type: string, fn: (event?: any) => void) { this.events[type] = fn; }
    setCustomValidity(message: string) { this.error = message; }
    reportValidity() { return !this.error; }
    focus() { this.focused = true; }
  }
  const ids = Object.fromEntries(['binder-address', 'binder-form', 'binder-recent', 'binder-recent-list', 'binder-history-status', 'binder-clear-recent'].map(id => [id, new Element()]));
  let saved = initial;
  const visited: string[] = [];
  const script = BINDER_LOOKUP_JS.match(/<script>([\s\S]*?)<\/script>/)![1];
  runInNewContext(script, {
    document: { getElementById: (id: string) => ids[id], createElement: () => new Element() },
    localStorage: {
      getItem() { if (blocked) throw new Error('Storage unavailable'); return saved; },
      setItem(_key: string, value: string) { if (blocked) throw new Error('Storage unavailable'); saved = value; },
      removeItem() { if (blocked) throw new Error('Storage unavailable'); saved = null; },
    },
    location: { assign: (href: string) => visited.push(href) },
  });
  return {
    ids, visited, stored: () => saved,
    links: () => ids['binder-recent-list'].children.map(li => li.children[0]),
    submit(value: string) { ids['binder-address'].value = value; ids['binder-form'].events.submit({ preventDefault() {} }); },
  };
}

test('binder lookup trims pasted whitespace, preserves the address, and remembers five unique lookups', () => {
  const h = harness(JSON.stringify(['alpha', 'beta', 'gamma', 'delta', 'epsilon']));
  h.submit('  0xAbCd1234  ');
  assert.deepEqual(h.visited, ['/collection/0xAbCd1234']);
  assert.equal(h.ids['binder-address'].value, '0xAbCd1234');
  assert.deepEqual(JSON.parse(h.stored()!), ['0xAbCd1234', 'alpha', 'beta', 'gamma', 'delta']);
  h.submit('beta');
  assert.deepEqual(JSON.parse(h.stored()!), ['beta', '0xAbCd1234', 'alpha', 'gamma', 'delta']);
});

test('invalid addresses cannot create history entries or navigate; an input correction can recover', () => {
  const h = harness();
  for (const invalid of ['abc', '../packs', '<script>', 'a'.repeat(129), '   ']) {
    h.submit(invalid);
    assert.ok(h.ids['binder-address'].error);
  }
  assert.deepEqual(h.visited, []);
  assert.equal(h.stored(), null);
  h.ids['binder-address'].events.input();
  assert.equal(h.ids['binder-address'].error, '');
  h.submit('chain:0xabc');
  assert.deepEqual(h.visited, ['/collection/chain%3A0xabc']);
});

test('saved lookups are validated before rendering and malformed storage is harmless', () => {
  const h = harness(JSON.stringify(['good:wallet', 'good:wallet', '<img src=x>', '//evil', 12, null, 'next_wallet']));
  assert.deepEqual(h.links().map(a => a.href), ['/collection/good%3Awallet', '/collection/next_wallet']);
  assert.equal(h.links()[0].children[0].textContent, 'good:wallet');
  for (const value of ['broken json', '{}', 'null']) {
    assert.equal(harness(value).ids['binder-recent'].hidden, true);
  }
});

test('clearing recent binders removes storage and returns focus; blocked storage does not block lookup', () => {
  const h = harness(JSON.stringify(['alpha']));
  h.ids['binder-clear-recent'].events.click();
  assert.equal(h.stored(), null);
  assert.equal(h.ids['binder-recent'].hidden, true);
  assert.equal(h.ids['binder-address'].focused, true);
  assert.match(h.ids['binder-history-status'].textContent, /cleared/);
  const blocked = harness(null, true);
  blocked.submit('demo_wallet');
  assert.deepEqual(blocked.visited, ['/collection/demo_wallet']);
  assert.equal(blocked.links().length, 1);
  blocked.ids['binder-clear-recent'].events.click();
  assert.equal(blocked.ids['binder-recent'].hidden, true);
});
