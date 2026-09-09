import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { tokenConfig, tokenUI } from '../src/token.ts';

const address = '0x1234567890abcdef1234567890abcdef12345678';
test('unpublished or malformed addresses never produce a copy value or trading link', () => {
  for (const value of ['', 'Coming soon', '0x' + '0'.repeat(40), '0x123', '<script>alert(1)</script>', address + '/evil']) {
    assert.deepEqual(tokenConfig({ RIPDEX_TOKEN_ADDRESS: value }), { address: '', buyUrl: '' });
  }
});
test('a valid address preserves every character and uses the official pons token route', () => {
  assert.deepEqual(tokenConfig({ RIPDEX_TOKEN_ADDRESS: '  ' + address + '  ' }), { address, buyUrl: 'https://www.ponsfamily.com/launchpad/' + address });
});
function harness(value: string, clipboard: (text: string) => Promise<void>, onHome = true) {
  const handlers: Record<string, (event?: unknown) => Promise<void>> = {};
  const status = { textContent: '', hidden: true };
  const visited: string[] = [];
  const stored: Record<string,string> = {};
  const section = { scrollIntoView() {}, focus() {} };
  const script = tokenUI({ RIPDEX_TOKEN_ADDRESS: value }).match(/<script>([\s\S]*?)<\/script>/)![1];
  runInNewContext(script, {
    document: { getElementById: (id: string) => id === 'token-toast' ? status : onHome ? section : null, querySelector: () => null,
      querySelectorAll: (selector: string) => [{ addEventListener: (_: string, fn: () => Promise<void>) => handlers[selector] = fn }] },
    navigator: { clipboard: { writeText: clipboard } },
    history: { pushState: (_a: unknown, _b: string, url: string) => visited.push(url) },
    location: { assign: (url: string) => visited.push(url) },
    sessionStorage: { getItem: (key: string) => stored[key], setItem: (key: string, value: string) => stored[key] = value, removeItem: (key: string) => delete stored[key] },
    matchMedia: () => ({ matches: true }), setTimeout: () => 1, clearTimeout() {},
  });
  return { handlers, status, visited, stored };
}
test('coming-soon Buy navigates without writing a placeholder into the clipboard', async () => {
  let calls = 0;
  const h = harness('', async () => { calls++; });
  await h.handlers['[data-token-buy]']({ preventDefault() {} });
  assert.equal(calls, 0);
  assert.deepEqual(h.visited, ['#rip-contract']);
  assert.match(h.status.textContent, /coming soon/);
});
test('published Buy copies the full contract before navigating from a different page', async () => {
  let copied = '';
  const h = harness(address, async value => { copied = value; }, false);
  await h.handlers['[data-token-buy]']({ preventDefault() {} });
  assert.equal(copied, address);
  assert.deepEqual(h.visited, ['/#rip-contract']);
  assert.match(h.stored['ripdex-token-notice'], /copied/);
});
test('clipboard denial reports a manual-copy fallback and still navigates', async () => {
  const h = harness(address, async () => { throw new Error('Permission denied'); });
  await h.handlers['[data-token-buy]']({ preventDefault() {} });
  assert.deepEqual(h.visited, ['#rip-contract']);
  assert.match(h.status.textContent, /Could not copy automatically/);
  assert.equal(h.status.hidden, false);
});
test('CA button copies the same address; modified link clicks preserve browser navigation', async () => {
  let calls = 0;
  const h = harness(address, async value => { assert.equal(value, address); calls++; });
  await h.handlers['[data-copy-ca]']();
  assert.match(h.status.textContent, /copied/);
  await h.handlers['[data-token-buy]']({ metaKey: true, preventDefault() { assert.fail('modified click intercepted'); } });
  assert.equal(calls, 1);
  assert.deepEqual(h.visited, []);
});
