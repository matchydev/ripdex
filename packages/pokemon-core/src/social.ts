/**
 * The 1200x675 social share graphic (spec §18).
 *
 * Output is an SVG string built by concatenation. No image library, no font
 * loading, no headless browser — the card is generated on the request path, so
 * the only budget that matters is string building.
 *
 * Three things make this file more than templating:
 *
 * 1. ESCAPING IS A CORRECTNESS PROBLEM, NOT POLISH. Real card names contain
 *    the characters that break XML: "Farfetch'd", "Team Magma & Team Aqua",
 *    "Ho-Oh & Lugia-GX". A single raw ampersand does not degrade the image, it
 *    makes the whole document fail to parse — a blank share card at exactly the
 *    moment a user is trying to post a grail. Every interpolated value goes
 *    through `escapeXml`, without exception.
 *
 * 2. THERE ARE NO FONT METRICS. The renderer has no way to ask a font how wide
 *    a string is, so a long name would silently run off the canvas. `measureText`
 *    approximates advance widths from a per-character table and deliberately
 *    over-estimates: shrinking a name slightly more than necessary is invisible,
 *    overflowing the frame is not.
 *
 * 3. AN UNPRICED VARIANT SAYS SO. `referenceValue` is nullable and null renders
 *    "NO PRICE". It must never become $0.00 — the project invariant is that an
 *    unknown price is null all the way to the pixel, because a $0.00 grail is a
 *    worse lie than an absent number.
 */

import type { PokemonCard } from './types.ts';
import { variantLabel, type CanonicalPokemonCardVariant } from './variant.ts';
import { PullTier } from './tiers.ts';
import { formatProbability } from './odds.ts';
import { contentHash } from './snapshot.ts';

/* ------------------------------------------------------------------ *
 * Canvas
 * ------------------------------------------------------------------ */

/** Fixed by the OG/Twitter card spec. Not a default — a contract. */
export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 675;

const INK = '#F5F3F0';
const MUTED = '#8A8894';
const FAINT = '#55535E';
const BG = '#07070A';
const SURFACE = '#0E0E13';
const LINE = '#FFFFFF';

/**
 * One family string for the whole document. Rasterizers substitute whatever
 * they have; the metrics table below is calibrated against Helvetica/Arial
 * widths, which every substitute is close enough to.
 */
const FONT = "Inter,'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";

// Geometry. Named because the layout is referenced from three places (art,
// text column, footer) and a stray literal is how columns drift apart.
const PAD = 64;
const RIGHT = SHARE_WIDTH - PAD; // 1136
const RULE_Y = 84;
const ART = { x: PAD, y: 112, w: 358, h: 500 };
const COL = { x: 470, w: RIGHT - 470 };
const FOOT_Y = 645;

/**
 * Right-column baselines. The block starts below the art's top edge on purpose:
 * the card runs 112..612 and the text 146..538, so the two halves read as
 * balanced rather than the text hanging off the top of the frame.
 */
const ROW = {
  badge: 146,
  headline: 256,
  name: 340,
  sub: 376,
  rule: 416,
  label: 452,
  figure: 510,
  note: 538,
};

/* ------------------------------------------------------------------ *
 * Escaping
 * ------------------------------------------------------------------ */

// C0 controls are illegal in XML 1.0 even as character references, so they are
// dropped rather than encoded. Tab/newline are dropped too: SVG <text> does not
// honour them anyway, and they only widen the line invisibly.
const CONTROL = /[\u0000-\u001F\u007F]/g;

/**
 * Escape for both element content and attribute values. `>` is escaped even
 * though bare `>` is legal in content, because "]]>" is not, and one helper
 * used everywhere beats two helpers used almost everywhere.
 */
export function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(CONTROL, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Collapse whitespace before measuring or drawing. */
function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SAFE_SCHEME = /^(https?:|data:image\/)/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Card art arrives as a provider URL and is emitted into an attribute of a
 * document that callers will inline into a page. `javascript:` and other active
 * schemes are refused rather than escaped, because escaping makes them parse
 * correctly — which is the problem. A rejected URL yields the placeholder frame
 * instead, which is a visibly broken share card rather than a quietly hostile one.
 */
function safeImageUrl(url: unknown): string | null {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  if (HAS_SCHEME.test(raw) && !SAFE_SCHEME.test(raw)) return null;
  return raw;
}

/* ------------------------------------------------------------------ *
 * Text metrics
 * ------------------------------------------------------------------ */

/**
 * Advance width in em units. Bucketed, not per-glyph: the goal is to keep text
 * inside a box, and a table accurate to ~5% does that with 20 lines instead of
 * a 200-entry font dump. Every bucket is rounded UP for the reason in the file
 * header.
 */
function charWidth(ch: string): number {
  if (ch === ' ') return 0.3;
  if ("ilj|!.,:;'`".includes(ch)) return 0.3;
  if ('ftIr()[]{}/\\-"'.includes(ch)) return 0.38;
  if ('mwMW'.includes(ch)) return 0.92;
  if (ch >= '0' && ch <= '9') return 0.6;
  if (ch >= 'A' && ch <= 'Z') return 0.7;
  if (ch >= 'a' && ch <= 'z') return 0.56;
  if ('$#%&@'.includes(ch)) return 0.75;
  // CJK and other full-width ranges are a whole em. "Pokémon" style accents
  // fall through to the generic bucket below.
  if ((ch.codePointAt(0) ?? 0) >= 0x2e80) return 1.0;
  return 0.62;
}

/**
 * Every glyph in a monospace face is one advance wide, so the proportional
 * table above is wrong for the mono runs — and wrong in the dangerous
 * direction: it scores "$12,500.00" narrow because it counts the comma and the
 * period as thin, when in mono they are as wide as the digits. 0.62 covers the
 * common stacks (SF Mono and ui-monospace are 0.60, Consolas 0.55).
 */
const MONO_EM = 0.62;

export interface MeasureOptions {
  bold?: boolean;
  /** Set for text drawn in the monospace family. */
  mono?: boolean;
  /** Extra px per character, matching the SVG `letter-spacing` attribute. */
  letterSpacing?: number;
}

/**
 * Estimated rendered width in px.
 *
 * Measure the RAW string, never the escaped one: "Farfetch'd" is ten glyphs but
 * "Farfetch&#39;d" is fourteen characters, and measuring the escaped form would
 * shrink the name for reasons the reader cannot see.
 */
export function measureText(text: string, fontSize: number, opts: MeasureOptions = {}): number {
  let em = 0;
  let glyphs = 0;
  for (const ch of text) {
    em += opts.mono ? MONO_EM : charWidth(ch);
    glyphs++;
  }
  // Bold widens a proportional face slightly; a mono face keeps its advance by
  // definition, so the multiplier must not apply there.
  const weight = opts.bold && !opts.mono ? 1.05 : 1;
  return em * fontSize * weight + (opts.letterSpacing ?? 0) * glyphs;
}

export interface FitOptions extends MeasureOptions {
  /** Preferred size. Used whenever the string already fits. */
  max: number;
  /** Floor. Below this, the string is truncated instead of shrunk further. */
  min: number;
}

export interface FitResult {
  /** Possibly ellipsized. Raw — escape at emit time. */
  text: string;
  fontSize: number;
  truncated: boolean;
}

/**
 * Shrink to fit, then truncate. Two stages because "Charizard" and
 * "Team Magma's Camerupt" should both be as large as they can be, while a
 * pathological 200-character name must still not touch the frame edge.
 */
export function fitText(raw: unknown, maxWidth: number, opts: FitOptions): FitResult {
  const text = normalizeText(raw);
  if (!text) return { text: '', fontSize: opts.max, truncated: false };

  const width = (s: string, size: number) => measureText(s, size, opts);
  if (width(text, opts.max) <= maxWidth) {
    return { text, fontSize: opts.max, truncated: false };
  }

  // Width is linear in size apart from letter-spacing, so one proportional step
  // lands close; iterate a few times to absorb the spacing term.
  let size = opts.max;
  for (let i = 0; i < 4 && size > opts.min; i++) {
    const w = width(text, size);
    if (w <= maxWidth) break;
    size = Math.max(opts.min, Math.floor((size * maxWidth) / w));
  }
  if (width(text, size) <= maxWidth) return { text, fontSize: size, truncated: false };

  // Walk down from an upper bound rather than from the full string: no more
  // glyphs can fit than maxWidth / (narrowest glyph), and this runs on the
  // request path, where a pathological 5,000-character name should not cost
  // 5,000 measurements of a 5,000-character string.
  const ellipsis = '…';
  const narrowest = Math.max(1, (opts.mono ? MONO_EM : 0.3) * size + Math.min(0, opts.letterSpacing ?? 0));
  let cut = Math.min(text.length, Math.ceil(maxWidth / narrowest));
  while (cut > 0 && width(text.slice(0, cut).trimEnd() + ellipsis, size) > maxWidth) cut--;
  return { text: text.slice(0, cut).trimEnd() + ellipsis, fontSize: size, truncated: true };
}

/* ------------------------------------------------------------------ *
 * Tier treatment
 * ------------------------------------------------------------------ */

/**
 * Tier drives the whole visual register. The point of a grail treatment is that
 * it is rare: if a $3 common also arrives in gold with an aura, the gold stops
 * meaning anything and the format burns out. Only GRAIL gets gold, only the top
 * two tiers get a glow, and the bottom two are deliberately plain.
 */
export interface ShareTreatment {
  readonly headline: string;
  readonly badge: string;
  /** Figure colour, rules, badge tint. */
  readonly accent: string;
  readonly headlineColor: string;
  readonly badgeTextColor: string;
  readonly badgeFillOpacity: number;
  /** 0 disables the aura element entirely. */
  readonly glow: number;
  readonly ringOpacity: number;
  readonly ringWidth: number;
}

const GOLD = '#F2C14E';

const TREATMENTS: Record<PullTier, ShareTreatment> = {
  [PullTier.Grail]: {
    headline: 'I PULLED A GRAIL.',
    badge: 'GRAIL PULL',
    accent: GOLD,
    headlineColor: GOLD,
    badgeTextColor: '#1A1405',
    badgeFillOpacity: 1,
    glow: 0.5,
    ringOpacity: 0.85,
    ringWidth: 2,
  },
  [PullTier.Tier4]: {
    headline: 'I PULLED A CHASE.',
    badge: 'TIER 4',
    accent: '#FF8B3D',
    headlineColor: INK,
    badgeTextColor: '#FFB98A',
    badgeFillOpacity: 0.16,
    glow: 0.2,
    ringOpacity: 0.5,
    ringWidth: 1.5,
  },
  [PullTier.Tier3]: {
    headline: 'I PULLED A HIT.',
    badge: 'TIER 3',
    accent: '#00DEA5',
    headlineColor: INK,
    badgeTextColor: '#7FEFD2',
    badgeFillOpacity: 0.12,
    glow: 0,
    ringOpacity: 0.32,
    ringWidth: 1,
  },
  [PullTier.Tier2]: {
    headline: 'I RIPPED A PACK.',
    badge: 'TIER 2',
    accent: MUTED,
    headlineColor: INK,
    badgeTextColor: MUTED,
    badgeFillOpacity: 0.08,
    glow: 0,
    ringOpacity: 0.16,
    ringWidth: 1,
  },
  [PullTier.Tier1]: {
    headline: 'I RIPPED A PACK.',
    badge: 'TIER 1',
    accent: FAINT,
    headlineColor: INK,
    badgeTextColor: MUTED,
    badgeFillOpacity: 0.06,
    glow: 0,
    ringOpacity: 0.12,
    ringWidth: 1,
  },
};

export function treatmentFor(tier: PullTier): ShareTreatment {
  return TREATMENTS[tier] ?? TREATMENTS[PullTier.Tier1];
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * Cents are kept for the same reason `price.ts` keeps them: a $4.99 card is not
 * a $5 card. An unrecognized currency code falls back to USD formatting rather
 * than throwing — Intl rejects junk codes, and a share card must not 500.
 */
function money(value: number, currency: string): string {
  const code = CURRENCY_CODE.test(currency) ? currency : 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** "1 in 20,000" — the form people actually repeat out loud. */
function oneIn(probability: number): string | null {
  if (!(probability > 0) || probability > 1) return null;
  return `1 in ${Math.round(1 / probability).toLocaleString('en-US')}`;
}

/** Zero-padded to four digits so early rips read as collectibles, not counters. */
function formatRipNumber(value: number | string): string {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return `#${String(Math.floor(value)).padStart(4, '0')}`;
  }
  const raw = normalizeText(value);
  if (!raw) return '#----';
  return raw.startsWith('#') ? raw : `#${raw}`;
}

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

/**
 * Structurally narrow so callers can pass a full `PokemonCard` from the catalog
 * or a denormalized row from the opening ledger without an adapter.
 */
export type ShareCardCard = Pick<
  PokemonCard,
  'name' | 'number' | 'setName' | 'rarity' | 'artist' | 'images'
>;

export interface ShareCardInput {
  readonly card: ShareCardCard;
  /** Identity. The variant label on the graphic comes from here, never from rarity. */
  readonly variant: CanonicalPokemonCardVariant;
  /** Frozen snapshot value. null renders "NO PRICE" — never 0. */
  readonly referenceValue: number | null;
  readonly currency?: string;
  /** Published odds for this outcome, 0..1. null renders as unavailable. */
  readonly probability: number | null;
  readonly tier: PullTier;
  readonly ripNumber: number | string;
  readonly packName: string;
  /** Override the art URL; defaults to `card.images.large`. */
  readonly imageUrl?: string | null;
}

/* ------------------------------------------------------------------ *
 * SVG primitives
 * ------------------------------------------------------------------ */

/** Trim float noise so the output diffs cleanly between renders. */
function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

interface TextOptions {
  x: number;
  y: number;
  size: number;
  fill: string;
  weight?: number;
  anchor?: 'start' | 'end' | 'middle';
  spacing?: number;
  family?: string;
  opacity?: number;
}

/** `content` MUST already be escaped. Every call site goes through escapeXml. */
function svgText(o: TextOptions, content: string): string {
  const parts = [
    `<text x="${num(o.x)}" y="${num(o.y)}"`,
    `font-family="${o.family ?? FONT}"`,
    `font-size="${num(o.size)}"`,
    `font-weight="${o.weight ?? 400}"`,
    `fill="${o.fill}"`,
  ];
  if (o.anchor && o.anchor !== 'start') parts.push(`text-anchor="${o.anchor}"`);
  if (o.spacing) parts.push(`letter-spacing="${num(o.spacing)}"`);
  if (o.opacity !== undefined && o.opacity < 1) parts.push(`fill-opacity="${num(o.opacity)}"`);
  return `${parts.join(' ')}>${content}</text>`;
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

/**
 * Build the share graphic.
 *
 * Notes on the output that are easy to regress:
 *
 * - Presentation attributes only, no `<style>` block and no `rgba()`. Half the
 *   SVG->PNG rasterizers in circulation ignore embedded CSS and several parse
 *   only `#rrggbb`, and a share card that renders in Chrome but not in the
 *   Twitter/Discord unfurler is a share card that does not exist.
 * - Gradient and clip ids carry a content-derived suffix. Two of these inlined
 *   into one page with the same ids would have the second card's art clipped by
 *   the first card's path — ids are document-global, not element-scoped.
 * - `href` and `xlink:href` are both emitted on the image: the modern attribute
 *   for browsers, the legacy one for older librsvg-based rasterizers.
 */
export function renderShareCard(input: ShareCardInput): string {
  const { card, variant, tier, probability } = input;
  const t = treatmentFor(tier);
  const currency = input.currency ?? 'USD';

  // Deterministic: the same rip renders byte-identical, so a cached PNG stays
  // valid and a diff in CI means a real layout change.
  const uid = contentHash({ v: variant.variantId, r: String(input.ripNumber) }).slice(0, 10);
  const id = (name: string) => `${name}-${uid}`;

  const priced = typeof input.referenceValue === 'number' && Number.isFinite(input.referenceValue);
  const valueText = priced ? money(input.referenceValue as number, currency) : 'NO PRICE';
  const oddsText = probability === null || !Number.isFinite(probability) ? '—' : formatProbability(probability);
  const oddsSub = probability === null ? null : oneIn(probability);

  const label = variantLabel(variant);
  const subtitle = [normalizeText(card.setName), `#${normalizeText(card.number)}`, label]
    .filter(Boolean)
    .join('  ·  ');

  const headline = fitText(t.headline, COL.w, { max: 52, min: 28, bold: true, letterSpacing: -0.5 });
  const name = fitText(card.name, COL.w, { max: 62, min: 26, bold: true, letterSpacing: -1 });
  const sub = fitText(subtitle, COL.w, { max: 17, min: 12, letterSpacing: 0.6 });
  const badge = fitText(t.badge, 220, { max: 13, min: 10, bold: true, letterSpacing: 2.2 });
  const pack = fitText(input.packName, COL.w - 260, { max: 12, min: 9, letterSpacing: 2 });
  const artist = card.artist
    ? fitText(`ILLUS. ${normalizeText(card.artist).toUpperCase()}`, ART.w, { max: 11, min: 9, letterSpacing: 1.6 })
    : null;
  const value = fitText(valueText, 372, { max: 54, min: 24, bold: true, mono: true });
  const odds = fitText(oddsText, 236, { max: 40, min: 20, bold: true, mono: true });

  const wordmarkSize = 26;
  const wordmarkWidth = measureText('RIPDEX', wordmarkSize, { bold: true, letterSpacing: 6.5 });

  const badgeW = measureText(badge.text, badge.fontSize, { bold: true, letterSpacing: 2.2 }) + 28;
  const badgeY = ROW.badge;
  const badgeH = 34;

  const art = safeImageUrl(input.imageUrl ?? card.images?.large ?? null);

  const defs: string[] = [
    `<clipPath id="${id('art')}"><rect x="${num(ART.x)}" y="${num(ART.y)}" width="${num(ART.w)}" height="${num(ART.h)}" rx="16"/></clipPath>`,
  ];
  if (t.glow > 0) {
    defs.push(
      `<radialGradient id="${id('glow')}" cx="50%" cy="50%" r="50%">` +
        `<stop offset="0" stop-color="${t.accent}" stop-opacity="${num(t.glow)}"/>` +
        `<stop offset="0.55" stop-color="${t.accent}" stop-opacity="${num(t.glow * 0.28)}"/>` +
        `<stop offset="1" stop-color="${t.accent}" stop-opacity="0"/>` +
        `</radialGradient>`,
    );
  }

  const body: string[] = [];

  // ---- ground ----
  body.push(`<rect x="0" y="0" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="${BG}"/>`);
  if (t.glow > 0) {
    body.push(
      `<ellipse cx="${num(ART.x + ART.w / 2)}" cy="${num(ART.y + ART.h / 2)}" rx="330" ry="360" fill="url(#${id('glow')})"/>`,
    );
  }

  // ---- header ----
  body.push(svgText({ x: PAD, y: 60, size: wordmarkSize, weight: 800, fill: INK, spacing: 6.5 }, 'RIPDEX'));
  body.push(
    `<rect x="${num(PAD)}" y="70" width="${num(wordmarkWidth)}" height="2" rx="1" fill="#FF6B1A" fill-opacity="0.9"/>`,
  );
  body.push(
    svgText(
      { x: RIGHT, y: 60, size: 16, weight: 600, fill: MUTED, anchor: 'end', spacing: 2.4, family: MONO },
      escapeXml(`RIP ${formatRipNumber(input.ripNumber)}`),
    ),
  );
  body.push(
    `<rect x="${num(PAD)}" y="${num(RULE_Y)}" width="${num(RIGHT - PAD)}" height="1" fill="${LINE}" fill-opacity="0.09"/>`,
  );

  // ---- card art ----
  body.push(
    `<g clip-path="url(#${id('art')})">` +
      `<rect x="${num(ART.x)}" y="${num(ART.y)}" width="${num(ART.w)}" height="${num(ART.h)}" fill="${SURFACE}"/>` +
      (art
        ? `<image href="${escapeXml(art)}" xlink:href="${escapeXml(art)}" x="${num(ART.x)}" y="${num(ART.y)}" width="${num(ART.w)}" height="${num(ART.h)}" preserveAspectRatio="xMidYMid meet"/>`
        : svgText(
            { x: ART.x + ART.w / 2, y: ART.y + ART.h / 2, size: 15, fill: FAINT, anchor: 'middle', spacing: 3 },
            'ART UNAVAILABLE',
          )) +
      `</g>`,
  );
  body.push(
    `<rect x="${num(ART.x)}" y="${num(ART.y)}" width="${num(ART.w)}" height="${num(ART.h)}" rx="16" fill="none" ` +
      `stroke="${t.accent}" stroke-opacity="${num(t.ringOpacity)}" stroke-width="${num(t.ringWidth)}"/>`,
  );
  if (tier === PullTier.Grail) {
    // The second ring is the entire "this is rare" signal at a glance in a feed.
    body.push(
      `<rect x="${num(ART.x - 10)}" y="${num(ART.y - 10)}" width="${num(ART.w + 20)}" height="${num(ART.h + 20)}" rx="24" ` +
        `fill="none" stroke="${GOLD}" stroke-opacity="0.28" stroke-width="1"/>`,
    );
  }

  // ---- headline column ----
  body.push(
    `<rect x="${num(COL.x)}" y="${num(badgeY)}" width="${num(badgeW)}" height="${num(badgeH)}" rx="8" ` +
      `fill="${t.accent}" fill-opacity="${num(t.badgeFillOpacity)}"/>`,
  );
  body.push(
    svgText(
      { x: COL.x + 14, y: badgeY + 23, size: badge.fontSize, weight: 800, fill: t.badgeTextColor, spacing: 2.2 },
      escapeXml(badge.text),
    ),
  );
  if (pack.text) {
    body.push(
      svgText(
        { x: COL.x + badgeW + 16, y: badgeY + 23, size: pack.fontSize, weight: 600, fill: FAINT, spacing: 2 },
        escapeXml(pack.text.toUpperCase()),
      ),
    );
  }

  body.push(
    svgText(
      { x: COL.x, y: ROW.headline, size: headline.fontSize, weight: 800, fill: t.headlineColor, spacing: -0.5 },
      escapeXml(headline.text),
    ),
  );
  body.push(
    svgText({ x: COL.x, y: ROW.name, size: name.fontSize, weight: 700, fill: INK, spacing: -1 }, escapeXml(name.text)),
  );
  body.push(
    svgText({ x: COL.x, y: ROW.sub, size: sub.fontSize, weight: 500, fill: MUTED, spacing: 0.6 }, escapeXml(sub.text)),
  );

  body.push(
    `<rect x="${num(COL.x)}" y="${num(ROW.rule)}" width="${num(COL.w)}" height="1" fill="${LINE}" fill-opacity="0.09"/>`,
  );

  // ---- figures ----
  const oddsX = COL.x + 410;
  body.push(
    svgText({ x: COL.x, y: ROW.label, size: 11, weight: 700, fill: FAINT, spacing: 2.6 }, 'REFERENCE VALUE'),
  );
  body.push(
    svgText(
      { x: COL.x, y: ROW.figure, size: value.fontSize, weight: 700, fill: priced ? t.accent : FAINT, family: MONO },
      escapeXml(value.text),
    ),
  );
  body.push(svgText({ x: oddsX, y: ROW.label, size: 11, weight: 700, fill: FAINT, spacing: 2.6 }, 'PULL ODDS'));
  body.push(
    svgText({ x: oddsX, y: ROW.figure, size: odds.fontSize, weight: 700, fill: INK, family: MONO }, escapeXml(odds.text)),
  );
  if (oddsSub) {
    body.push(svgText({ x: oddsX, y: ROW.note, size: 14, weight: 500, fill: MUTED }, escapeXml(oddsSub)));
  }
  if (!priced) {
    body.push(svgText({ x: COL.x, y: ROW.note, size: 14, weight: 500, fill: MUTED }, 'no market data for this variant'));
  }

  // ---- footer ----
  if (artist) {
    body.push(
      svgText({ x: PAD, y: FOOT_Y, size: artist.fontSize, weight: 500, fill: FAINT, spacing: 1.6 }, escapeXml(artist.text)),
    );
  }
  body.push(
    svgText(
      { x: RIGHT, y: FOOT_Y, size: 11, weight: 600, fill: FAINT, anchor: 'end', spacing: 2.4 },
      'POWERED BY $RIP / ROBINHOOD CHAIN',
    ),
  );

  const title = escapeXml(
    `${t.headline} ${normalizeText(card.name)} — ${valueText}, ${oddsText} pull odds. RIPDEX rip ${formatRipNumber(input.ripNumber)}.`,
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" viewBox="0 0 ${SHARE_WIDTH} ${SHARE_HEIGHT}" role="img">` +
    `<title>${title}</title>` +
    `<defs>${defs.join('')}</defs>` +
    body.join('') +
    `</svg>`
  );
}

/* ------------------------------------------------------------------ *
 * Caption
 * ------------------------------------------------------------------ */

/**
 * Plain-text caption for the clipboard / share sheet.
 *
 * Deliberately NOT escaped: this string is pasted into a text field, and
 * "Farfetch&#39;d" in a tweet is the bug, not the fix. Escaping belongs at the
 * boundary that needs it, which is the SVG above.
 */
export function shareText(input: ShareCardInput): string {
  const t = treatmentFor(input.tier);
  const currency = input.currency ?? 'USD';
  const priced = typeof input.referenceValue === 'number' && Number.isFinite(input.referenceValue);
  const value = priced ? money(input.referenceValue as number, currency) : 'no price';

  const odds =
    input.probability === null || !Number.isFinite(input.probability)
      ? 'odds unavailable'
      : (() => {
          const one = oneIn(input.probability as number);
          const pct = formatProbability(input.probability as number);
          return one ? `${pct} pull odds (${one})` : `${pct} pull odds`;
        })();

  const identity = [
    normalizeText(input.card.name),
    `${normalizeText(input.card.setName)} #${normalizeText(input.card.number)}`,
    variantLabel(input.variant),
  ].join(' · ');

  return [
    t.headline,
    identity,
    `${value} reference value · ${odds}`,
    `${normalizeText(input.packName)} · rip ${formatRipNumber(input.ripNumber)}`,
    'RIPDEX — powered by $RIP on Robinhood Chain',
  ].join('\n');
}
