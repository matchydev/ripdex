/**
 * Brand / partnership attribution tests (spec §23).
 *
 * The important assertions here are about what the output does NOT contain.
 * A regression that reintroduces placeholder partnership copy would look
 * perfectly reasonable in a diff, so it is caught on the rendered string.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadBrandConfig,
  renderAttribution,
  hasPartnership,
  escapeHtml,
  NEUTRAL_BRAND_CONFIG,
  type BrandConfig,
} from '../src/brand.ts';

function collector() {
  const messages: string[] = [];
  return { messages, warn: (m: string) => messages.push(m) };
}

/** Anything that would read as a claim about a relationship with a rights holder. */
const CLAIM_WORDS = [
  'partner',
  'partnership',
  'endorse',
  'endorsed',
  'endorsement',
  'licens', // licence / license / licensed
  'affiliat',
  'official',
  'sponsor',
  'authorized',
  'authorised',
  'in association with',
];

function assertNoClaims(html: string): void {
  const lower = html.toLowerCase();
  for (const word of CLAIM_WORDS) {
    assert.ok(!lower.includes(word), `unconfigured attribution must not contain "${word}": ${html}`);
  }
}

/* ------------------------------------------------------------------ *
 * Defaults assert nothing
 * ------------------------------------------------------------------ */

test('empty env yields attribution with no partnership or endorsement wording', () => {
  const config = loadBrandConfig({});
  const html = renderAttribution(config);

  assertNoClaims(html);
  assert.ok(html.includes('RIPDEX'), 'neutral default still identifies RIPDEX');
  assert.equal(hasPartnership(config), false);
});

test('the neutral default and a no-arg render agree, and neither claims anything', () => {
  assertNoClaims(renderAttribution());
  assertNoClaims(renderAttribution(NEUTRAL_BRAND_CONFIG));
  assert.equal(renderAttribution(), renderAttribution(NEUTRAL_BRAND_CONFIG));
  assert.equal(hasPartnership(), false);
});

test('whitespace-only copy is absence, not a blank claim', () => {
  const config = loadBrandConfig({
    POKEMON_PARTNERSHIP_COPY: '   ',
    POKEMON_LEGAL_COPY: '\n\t',
  });
  assert.equal(config.partnershipCopy, null);
  assert.equal(config.legalCopy, null);
  assert.equal(hasPartnership(config), false);
  assertNoClaims(renderAttribution(config));
});

/* ------------------------------------------------------------------ *
 * Malformed configuration degrades, never throws
 * ------------------------------------------------------------------ */

test('malformed PARTNER_LOGO_ASSETS JSON degrades gracefully instead of throwing', () => {
  const { messages, warn } = collector();

  let config: BrandConfig = NEUTRAL_BRAND_CONFIG;
  assert.doesNotThrow(() => {
    config = loadBrandConfig({ PARTNER_LOGO_ASSETS: '[{"assetKey": "a"' }, warn);
  });

  assert.deepEqual(config.partnerLogoAssets, []);
  assert.ok(messages.length > 0, 'a warning is emitted');
  assert.ok(messages[0].includes('PARTNER_LOGO_ASSETS'));
  assertNoClaims(renderAttribution(config));
});

test('non-array PARTNER_LOGO_ASSETS JSON is ignored with a warning', () => {
  const { messages, warn } = collector();
  const config = loadBrandConfig({ PARTNER_LOGO_ASSETS: '{"assetKey":"a"}' }, warn);
  assert.deepEqual(config.partnerLogoAssets, []);
  assert.ok(messages.some((m) => m.includes('must be a JSON array')));
});

test('invalid entries are skipped, valid siblings survive', () => {
  const { messages, warn } = collector();
  const config = loadBrandConfig(
    {
      PARTNER_LOGO_ASSETS: JSON.stringify([
        { assetKey: 'good-logo', alt: 'Approved Logo', href: 'https://example.com' },
        { alt: 'no key' },
        'not an object',
        null,
      ]),
    },
    warn,
  );

  assert.deepEqual(config.partnerLogoAssets, [
    { assetKey: 'good-logo', alt: 'Approved Logo', href: 'https://example.com' },
  ]);
  assert.equal(messages.length, 3);
});

test('a logo missing alt text gets empty alt, never invented alt text', () => {
  const config = loadBrandConfig({
    PARTNER_LOGO_ASSETS: JSON.stringify([{ assetKey: 'k' }]),
  });
  assert.deepEqual(config.partnerLogoAssets, [{ assetKey: 'k', alt: '', href: null }]);
});

/* ------------------------------------------------------------------ *
 * Escaping
 * ------------------------------------------------------------------ */

test('HTML in any configured value is escaped in the output', () => {
  const payload = `<script>alert('xss')</script>`;
  const config = loadBrandConfig({
    POKEMON_PARTNERSHIP_COPY: `partnership ${payload}`,
    POKEMON_LEGAL_COPY: `legal ${payload}`,
    POKEMON_TRADEMARK_COPY: `trademark ${payload}`,
    PARTNER_LOGO_ASSETS: JSON.stringify([
      { assetKey: `key"${payload}`, alt: `alt ${payload}`, href: 'https://example.com/"><b>' },
    ]),
  });

  const html = renderAttribution(config);

  assert.ok(!html.includes('<script'), 'no raw script tag survives');
  assert.ok(!html.includes('</script>'), 'no raw closing script tag survives');
  assert.ok(!html.includes(`alert('xss')`), 'the quoted payload is entity-encoded');
  assert.equal(html.match(/&lt;script&gt;/g)?.length, 5, 'every configured value is escaped');
  // Attribute injection: the stray quote in assetKey and href must not close
  // the attribute and start a new one.
  assert.ok(!/data-asset-key="[^"]*"[^>]*<b>/.test(html));
  assert.ok(html.includes('&quot;'));
});

test('escapeHtml handles nullish input as empty string', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
});

test('a javascript: href is dropped rather than linked', () => {
  const config = loadBrandConfig({
    PARTNER_LOGO_ASSETS: JSON.stringify([
      { assetKey: 'k', alt: 'A', href: 'javascript:alert(1)' },
      { assetKey: 'j', alt: 'B', href: '//evil.example.com' },
    ]),
  });
  const html = renderAttribution(config);
  assert.ok(!html.includes('javascript:'), 'no javascript: url reaches the page');
  assert.ok(!html.includes('<a '), 'unsafe hrefs render unlinked');
  assert.ok(html.includes('data-asset-key="k"'), 'the logo itself still renders');
});

/* ------------------------------------------------------------------ *
 * Configured copy renders
 * ------------------------------------------------------------------ */

test('configured copy renders', () => {
  const config = loadBrandConfig({
    POKEMON_PARTNERSHIP_COPY: 'RIPDEX operates under an approved partnership agreement.',
    POKEMON_LEGAL_COPY: 'All card data supplied under agreement. Prices are estimates.',
    POKEMON_TRADEMARK_COPY: 'All trademarks are the property of their respective owners.',
    PARTNER_LOGO_ASSETS: JSON.stringify([
      { assetKey: 'brand-lockup-light', alt: 'Approved lockup', href: '/legal/attribution' },
    ]),
  });

  const html = renderAttribution(config);

  assert.ok(html.includes('RIPDEX operates under an approved partnership agreement.'));
  assert.ok(html.includes('All card data supplied under agreement. Prices are estimates.'));
  assert.ok(html.includes('All trademarks are the property of their respective owners.'));
  assert.ok(html.includes('data-asset-key="brand-lockup-light"'));
  assert.ok(html.includes('Approved lockup'));
  assert.ok(html.includes('href="/legal/attribution"'));
  assert.ok(html.startsWith('<footer class="attribution note"'));
  assert.ok(html.endsWith('</footer>'));
  assert.equal(hasPartnership(config), true);
});

test('legal copy alone does not make hasPartnership true', () => {
  const config = loadBrandConfig({
    POKEMON_LEGAL_COPY: 'Card images used with permission.',
    PARTNER_LOGO_ASSETS: JSON.stringify([{ assetKey: 'k', alt: 'A' }]),
  });
  assert.equal(hasPartnership(config), false);
  assert.ok(renderAttribution(config).includes('Card images used with permission.'));
});

test('process.env is the default source', () => {
  const key = 'POKEMON_TRADEMARK_COPY';
  const prior = process.env[key];
  process.env[key] = 'Trademark notice from the environment.';
  try {
    assert.equal(loadBrandConfig().trademarkCopy, 'Trademark notice from the environment.');
  } finally {
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
  }
});
