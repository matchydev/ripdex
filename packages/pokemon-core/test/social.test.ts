/**
 * Share graphic tests (spec §18).
 *
 * The suite is built around one idea: a share card fails silently. Nothing
 * throws when a name overflows the frame or an ampersand kills the parse — the
 * only symptom is a broken image in someone's timeline, discovered by a user
 * rather than by CI. So the assertions here are structural (parse the SVG, walk
 * every text element, measure it) instead of snapshot comparisons, which would
 * lock in the layout without ever checking it is correct.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { PokemonCard } from '../src/types.ts';
import { Finish, Printing, makeVariant } from '../src/variant.ts';
import { PullTier } from '../src/tiers.ts';
import { formatProbability } from '../src/odds.ts';
import {
  renderShareCard,
  shareText,
  escapeXml,
  measureText,
  fitText,
  SHARE_WIDTH,
  SHARE_HEIGHT,
  type ShareCardInput,
} from '../src/social.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function card(over: Partial<PokemonCard> = {}): PokemonCard {
  return {
    id: 'base1-4', name: 'Charizard', supertype: 'Pokémon', subtypes: ['Stage 2'],
    types: ['Fire'], hp: 120, evolvesFrom: 'Charmeleon', evolvesTo: [], rules: [], attacks: [],
    weaknesses: [], resistances: [], retreatCost: [], convertedRetreatCost: 3,
    setId: 'base1', setName: 'Base Set', setSeries: 'Base', setSymbolUrl: null, setLogoUrl: null,
    setReleaseDate: '1999-01-09', setTotal: 102,
    number: '4', artist: 'Mitsuhiro Arita', rarity: 'Rare Holo', flavorText: null,
    nationalPokedexNumbers: [6], legalities: {},
    images: {
      small: 'https://images.pokemontcg.io/base1/4.png',
      large: 'https://images.pokemontcg.io/base1/4_hires.png',
    },
    source: { provider: 'pokemontcg.io', fetchedAt: '2026-09-08T00:00:00.000Z' },
    ...over,
  };
}

const GRAIL_VARIANT = makeVariant('base1', '4', Finish.Holofoil, Printing.FirstEdition);
const COMMON_VARIANT = makeVariant('sv3pt5', '4', Finish.NonFoil, Printing.Unlimited);

function grail(over: Partial<ShareCardInput> = {}): ShareCardInput {
  return {
    card: card(),
    variant: GRAIL_VARIANT,
    referenceValue: 12500,
    probability: 0.00005,
    tier: PullTier.Grail,
    ripNumber: 42,
    packName: 'Charizard Chase',
    ...over,
  };
}

function common(over: Partial<ShareCardInput> = {}): ShareCardInput {
  return {
    card: card({ id: 'sv3pt5-4', name: 'Charmander', setId: 'sv3pt5', setName: '151', number: '4', rarity: 'Common' }),
    variant: COMMON_VARIANT,
    referenceValue: 0.24,
    probability: 0.18,
    tier: PullTier.Tier1,
    ripNumber: 43,
    packName: '151 Standard',
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * A minimal XML checker
 * ------------------------------------------------------------------ *
 *
 * Deliberately strict and hand-rolled rather than lenient-HTML-parsed: the
 * failure mode this file exists to catch is a document a strict XML parser
 * rejects. Attribute values are matched with [^"<>]* so an unescaped bracket
 * inside an attribute is a parse failure here, exactly as it would be in a
 * rasterizer.
 */

const TAG =
  /^<(\/?)([A-Za-z][A-Za-z0-9:._-]*)((?:\s+[A-Za-z_:][A-Za-z0-9:._-]*\s*=\s*"[^"<>]*")*)\s*(\/?)>/;
const VOID_OK = new Set(['rect', 'image', 'stop', 'ellipse', 'path', 'circle', 'line', 'use']);
const RAW_AMP = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+);)/;

interface Parsed {
  roots: string[];
  elements: number;
}

function parseXml(svg: string): Parsed {
  const stack: string[] = [];
  const roots: string[] = [];
  let elements = 0;
  let i = 0;

  const checkText = (text: string) => {
    assert.ok(!RAW_AMP.test(text), `unescaped ampersand in text: ${JSON.stringify(text.slice(0, 80))}`);
    assert.ok(!text.includes('>'), `raw ">" in text: ${JSON.stringify(text.slice(0, 80))}`);
  };

  while (i < svg.length) {
    const lt = svg.indexOf('<', i);
    if (lt === -1) {
      checkText(svg.slice(i));
      break;
    }
    checkText(svg.slice(i, lt));

    const m = TAG.exec(svg.slice(lt));
    assert.ok(m, `malformed markup at ${lt}: ${JSON.stringify(svg.slice(lt, lt + 90))}`);
    const [, closing, name, attrs, selfClose] = m;
    assert.ok(!RAW_AMP.test(attrs), `unescaped ampersand in attributes of <${name}>`);

    if (closing) {
      assert.equal(stack.pop(), name, `mismatched closing tag </${name}>`);
      if (stack.length === 0) roots.push(name);
    } else {
      elements++;
      if (selfClose) {
        if (stack.length === 0) roots.push(name);
      } else {
        assert.ok(!VOID_OK.has(name), `<${name}> must be self-closed, it has no content model here`);
        stack.push(name);
      }
    }
    i = lt + m[0].length;
  }

  assert.deepEqual(stack, [], `unclosed tags: ${stack.join(', ')}`);
  return { roots, elements };
}

/** Undo escapeXml so measurement sees the glyphs the renderer will draw. */
function unescape(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

interface TextNode {
  content: string;
  x: number;
  y: number;
  size: number;
  weight: number;
  spacing: number;
  anchor: string;
  width: number;
}

function textNodes(svg: string): TextNode[] {
  const out: TextNode[] = [];
  const re = /<text\s([^>]*)>([^<]*)<\/text>/g;
  for (const m of svg.matchAll(re)) {
    const attrs = m[1];
    const attr = (n: string) => new RegExp(`${n}="([^"]*)"`).exec(attrs)?.[1];
    const content = unescape(m[2]);
    const size = Number(attr('font-size'));
    const weight = Number(attr('font-weight') ?? '400');
    const spacing = Number(attr('letter-spacing') ?? '0');
    out.push({
      content,
      x: Number(attr('x')),
      y: Number(attr('y')),
      size,
      weight,
      spacing,
      anchor: attr('text-anchor') ?? 'start',
      width: measureText(content, size, { bold: weight >= 600, letterSpacing: spacing }),
    });
  }
  return out;
}

/** Left and right edge of a text run, honouring text-anchor. */
function bounds(t: TextNode): [number, number] {
  if (t.anchor === 'end') return [t.x - t.width, t.x];
  if (t.anchor === 'middle') return [t.x - t.width / 2, t.x + t.width / 2];
  return [t.x, t.x + t.width];
}

/* ------------------------------------------------------------------ *
 * Canvas + well-formedness
 * ------------------------------------------------------------------ */

test('the canvas is exactly 1200x675', () => {
  const svg = renderShareCard(grail());
  assert.match(svg, /<svg\s[^>]*\bwidth="1200"/);
  assert.match(svg, /<svg\s[^>]*\bheight="675"/);
  assert.match(svg, /<svg\s[^>]*\bviewBox="0 0 1200 675"/);
  assert.equal(SHARE_WIDTH, 1200);
  assert.equal(SHARE_HEIGHT, 675);
});

test('output is well-formed XML with a single <svg> root', () => {
  for (const input of [grail(), common()]) {
    const svg = renderShareCard(input);
    assert.ok(svg.startsWith('<svg '), 'must start at the root element, no prolog');
    assert.ok(svg.endsWith('</svg>'));
    const parsed = parseXml(svg);
    assert.deepEqual(parsed.roots, ['svg'], 'exactly one root element');
    assert.ok(parsed.elements > 15, 'sanity: the card actually drew something');
  }
});

test('every element id is namespaced so two cards can be inlined on one page', () => {
  // Shared ids are the classic inline-SVG bug: the second card's <image> gets
  // clipped by the first card's clipPath and renders empty.
  const a = renderShareCard(grail({ ripNumber: 1 }));
  const b = renderShareCard(grail({ ripNumber: 2 }));
  const ids = (svg: string) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const idsA = ids(a);
  assert.ok(idsA.length > 0);
  assert.equal(new Set(idsA).size, idsA.length, 'ids unique within one document');
  for (const id of idsA) assert.ok(!ids(b).includes(id), `id ${id} collides across cards`);
  // Every referenced id must exist, or the fill silently falls back to black.
  for (const ref of [...a.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1])) {
    assert.ok(idsA.includes(ref), `dangling reference to #${ref}`);
  }
});

test('the same rip renders byte-identical output', () => {
  assert.equal(renderShareCard(grail()), renderShareCard(grail()));
});

/* ------------------------------------------------------------------ *
 * Escaping
 * ------------------------------------------------------------------ */

test('a name full of XML metacharacters is escaped, not emitted raw', () => {
  const hostile = `Farfetch'd & <Team> "Magma" & Team Aqua > all`;
  const svg = renderShareCard(
    grail({
      card: card({ name: hostile, artist: 'Kagemaru Himeno & "Friends"' }),
      packName: 'Team Magma & Team Aqua',
    }),
  );

  // The whole point: a strict parse must still succeed.
  assert.deepEqual(parseXml(svg).roots, ['svg']);
  assert.ok(!RAW_AMP.test(svg), 'no unescaped ampersand anywhere in the document');
  assert.ok(!svg.includes('<Team>'), 'the name must not have become an element');
  assert.ok(svg.includes('&amp;'));
  assert.ok(svg.includes('&lt;Team&gt;'));
  assert.ok(svg.includes('&#39;'), "Farfetch'd apostrophe");
  assert.ok(svg.includes('&quot;'));

  // ...and the escaped text still round-trips back to the real name.
  const names = textNodes(svg).map((t) => t.content);
  assert.ok(names.some((n) => n.startsWith(`Farfetch'd & <Team>`)), names.join(' | '));
});

test('escapeXml handles the ampersand first and strips control characters', () => {
  assert.equal(escapeXml('a & b'), 'a &amp; b');
  assert.equal(escapeXml('<x>'), '&lt;x&gt;');
  assert.equal(escapeXml(`'"`), '&#39;&quot;');
  // Escaping & last would produce &amp;lt; — check the order really is right.
  assert.equal(escapeXml('&lt;'), '&amp;lt;');
  assert.equal(escapeXml(`a${String.fromCharCode(0, 31)}b`), 'ab', 'control characters are illegal in XML, even as references');
  assert.equal(escapeXml(null), '');
});

test('an active-scheme art URL is refused rather than escaped into the document', () => {
  const svg = renderShareCard(grail({ imageUrl: "javascript:alert('x')" }));
  assert.ok(!svg.includes('javascript:'), 'must not reach the href at all');
  assert.ok(!svg.includes('<image'), 'no image element without a usable URL');
  assert.ok(svg.includes('ART UNAVAILABLE'), 'placeholder instead');
  assert.deepEqual(parseXml(svg).roots, ['svg']);
});

test('the art URL is emitted for both modern and legacy rasterizers', () => {
  const svg = renderShareCard(grail());
  assert.match(svg, /<image\s[^>]*\bhref="https:\/\/images\.pokemontcg\.io\/base1\/4_hires\.png"/);
  assert.match(svg, /<image\s[^>]*\bxlink:href="/);
  assert.match(svg, /<svg\s[^>]*xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/);
});

/* ------------------------------------------------------------------ *
 * Fitting
 * ------------------------------------------------------------------ */

test('fitText shrinks before it truncates, and truncates before it overflows', () => {
  const short = fitText('Charizard', 600, { max: 62, min: 26, bold: true });
  assert.equal(short.text, 'Charizard');
  assert.equal(short.fontSize, 62);
  assert.equal(short.truncated, false);

  const medium = fitText("Team Magma's Camerupt EX", 600, { max: 62, min: 26, bold: true });
  assert.equal(medium.text, "Team Magma's Camerupt EX", 'shrink, do not cut');
  assert.ok(medium.fontSize < 62 && medium.fontSize >= 26);
  assert.ok(measureText(medium.text, medium.fontSize, { bold: true }) <= 600);

  const huge = fitText('Charizard '.repeat(40), 600, { max: 62, min: 26, bold: true });
  assert.equal(huge.truncated, true);
  assert.equal(huge.fontSize, 26, 'bottoms out at the floor before cutting');
  assert.ok(huge.text.endsWith('…'));
  assert.ok(measureText(huge.text, huge.fontSize, { bold: true }) <= 600);
});

test('a very long card name is truncated instead of running off the canvas', () => {
  const long =
    'Team Magma & Team Aqua Supercalifragilistic Charizard VMAX Special Illustration Rare Alternate Full Art Promo Edition Deluxe';
  const svg = renderShareCard(grail({ card: card({ name: long }) }));

  const drawn = textNodes(svg).find((t) => t.content.startsWith('Team Magma & Team Aqua'));
  assert.ok(drawn, 'the name is on the card');
  assert.ok(drawn.content.length < long.length, 'it was cut down');
  assert.ok(drawn.content.endsWith('…'), 'and marked as cut');
  const [, right] = bounds(drawn);
  assert.ok(right <= SHARE_WIDTH - 40, `name ends at ${right}, past the right margin`);
});

test('no text on any card overflows the canvas', () => {
  const cases: ShareCardInput[] = [
    grail(),
    common(),
    grail({ card: card({ name: 'Charizard '.repeat(30), artist: 'Mitsuhiro Arita '.repeat(10) }) }),
    grail({ referenceValue: 1234567.89, probability: 1e-7, ripNumber: 987654321 }),
    common({ referenceValue: null, probability: null, packName: 'A'.repeat(120) }),
    grail({ card: card({ name: 'ミュウツー ex スペシャルアートレア' }) }),
  ];
  for (const input of cases) {
    const svg = renderShareCard(input);
    parseXml(svg);
    for (const t of textNodes(svg)) {
      const [left, right] = bounds(t);
      assert.ok(left >= 0, `"${t.content}" starts at ${left}`);
      assert.ok(right <= SHARE_WIDTH, `"${t.content}" ends at ${right} (canvas is ${SHARE_WIDTH})`);
      assert.ok(t.y > 0 && t.y < SHARE_HEIGHT, `"${t.content}" baseline at ${t.y}`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * Tier treatment
 * ------------------------------------------------------------------ */

test('a grail and a common get visibly different treatments', () => {
  const g = renderShareCard(grail());
  const c = renderShareCard(common());

  assert.ok(g.includes('I PULLED A GRAIL.'));
  assert.ok(g.includes('GRAIL PULL'));
  assert.ok(g.includes('#F2C14E'), 'gold');
  assert.ok(g.includes('<radialGradient'), 'grail gets an aura');

  assert.ok(!c.includes('I PULLED A GRAIL.'), 'a $0.24 common does not claim a grail');
  assert.ok(!c.includes('GRAIL'));
  assert.ok(!c.includes('#F2C14E'), 'gold is reserved for grails');
  assert.ok(!c.includes('<radialGradient'), 'no aura on a common');
  assert.ok(c.includes('TIER 1'));

  // Tier 4 is warm but still not gold — the ladder has to be legible.
  const t4 = renderShareCard(grail({ tier: PullTier.Tier4, referenceValue: 220 }));
  assert.ok(t4.includes('I PULLED A CHASE.'));
  assert.ok(!t4.includes('#F2C14E'));
  assert.ok(t4.includes('<radialGradient'));

  const t3 = renderShareCard(grail({ tier: PullTier.Tier3, referenceValue: 40 }));
  assert.ok(t3.includes('I PULLED A HIT.'));
  assert.ok(!t3.includes('<radialGradient'), 'the glow stops at tier 4');
});

/* ------------------------------------------------------------------ *
 * Value, odds, identity
 * ------------------------------------------------------------------ */

test('the card carries value, odds and variant identity', () => {
  const svg = renderShareCard(grail());
  assert.ok(svg.includes('$12,500.00'));
  assert.ok(svg.includes('REFERENCE VALUE'));
  assert.ok(svg.includes(formatProbability(0.00005)));
  assert.ok(svg.includes('1 in 20,000'));
  assert.ok(svg.includes('PULL ODDS'));
  assert.ok(svg.includes('1st Edition Holofoil'), 'the printing is the identity, not the name');
  assert.ok(svg.includes('RIPDEX'));
  assert.ok(svg.includes('RIP #0042'));
  assert.ok(svg.includes('POWERED BY $RIP / ROBINHOOD CHAIN'));
  assert.ok(svg.includes('ILLUS. MITSUHIRO ARITA'));
  assert.ok(svg.includes('CHARIZARD CHASE'), 'pack name');
});

test('an unpriced variant reads "no price" and never $0.00', () => {
  const svg = renderShareCard(common({ referenceValue: null }));
  assert.ok(svg.includes('NO PRICE'));
  assert.ok(!svg.includes('$0.00'));
  assert.ok(!/\$0\b/.test(svg));

  const text = shareText(common({ referenceValue: null }));
  assert.ok(text.includes('no price'));
  assert.ok(!text.includes('$0'));
});

/* ------------------------------------------------------------------ *
 * Caption
 * ------------------------------------------------------------------ */

test('shareText includes the value and the odds', () => {
  const text = shareText(grail());
  assert.ok(text.startsWith('I PULLED A GRAIL.'));
  assert.ok(text.includes('$12,500.00'), text);
  assert.ok(text.includes(formatProbability(0.00005)), text);
  assert.ok(text.includes('1 in 20,000'), text);
  assert.ok(text.includes('Charizard'));
  assert.ok(text.includes('Base Set #4'));
  assert.ok(text.includes('1st Edition Holofoil'));
  assert.ok(text.includes('rip #0042'));
  assert.ok(text.includes('$RIP'));
});

test('shareText is plain text, not escaped markup', () => {
  // Pasting "Farfetch&#39;d &amp; friends" into a post is the bug, not the fix.
  const text = shareText(grail({ card: card({ name: "Farfetch'd & Friends" }) }));
  assert.ok(text.includes("Farfetch'd & Friends"));
  assert.ok(!text.includes('&amp;'));
  assert.ok(!text.includes('&#39;'));
});
