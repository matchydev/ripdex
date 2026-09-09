/**
 * Configurable brand / partnership attribution (spec §23).
 *
 * Two requirements pull in opposite directions and both are load-bearing:
 *
 *  1. Legal and brand must be able to drop approved language in globally
 *     without editing page code, so every string here comes from environment
 *     configuration rather than a literal in a template.
 *
 *  2. RIPDEX must never invent a partnership. So the DEFAULT ASSERTS NOTHING.
 *
 * ------------------------------------------------------------------ *
 * WHY THE DEFAULT IS EMPTY RATHER THAN PLACEHOLDER TEXT
 * ------------------------------------------------------------------ *
 * An unconfigured deployment must never imply a relationship that has not
 * been approved. Placeholder copy like "Official Pokemon Partner" or
 * "Licensed by ..." is not a harmless stub: the instant it renders on a
 * staging box someone screenshots, it is a public claim of endorsement that
 * nobody at either company agreed to. There is no safe placeholder for a
 * legal assertion, so the neutral default identifies RIPDEX and stops.
 *
 * The same reasoning covers the *negative* form. A hardcoded disclaimer
 * ("not affiliated with ...") looks like the cautious choice, but it names
 * third parties and characterises our relationship to them — that is legal's
 * copy to write, supplied via POKEMON_LEGAL_COPY, not ours to guess.
 *
 * ------------------------------------------------------------------ *
 * WHY EVERYTHING IS ESCAPED
 * ------------------------------------------------------------------ *
 * These values arrive from deployment configuration and are injected into a
 * page. Configuration is not automatically trustworthy input — it is edited
 * by hand, pasted from documents, and passed through CI systems — and a
 * single unescaped angle bracket in approved legal copy is a scripting hole
 * in the footer of every page. Escape at the render boundary, always.
 */

/* ------------------------------------------------------------------ *
 * Config shape
 * ------------------------------------------------------------------ */

/**
 * A logo supplied by the partnership asset bundle.
 *
 * `assetKey` is a key, not a URL: we do not know where an approved asset is
 * hosted and guessing a path would either 404 or, worse, hotlink something we
 * were not given rights to. The key is emitted as a data attribute for the
 * deployment's own asset pipeline to resolve.
 */
export interface PartnerLogoAsset {
  readonly assetKey: string;
  /** Alt text, supplied with the asset. Empty means "decorative". */
  readonly alt: string;
  /** Optional link target. */
  readonly href: string | null;
}

export interface BrandConfig {
  /** Approved partnership statement. Absent means: claim nothing. */
  readonly partnershipCopy?: string | null;
  /** Approved legal notice / disclaimer. */
  readonly legalCopy?: string | null;
  /** Approved trademark attribution. */
  readonly trademarkCopy?: string | null;
  readonly partnerLogoAssets?: readonly PartnerLogoAsset[] | null;
}

/** The only thing we are entitled to say about ourselves with no config. */
const PRODUCT_NAME = 'RIPDEX';

/**
 * The zero-claim configuration. Every deployment starts here and only moves
 * once legal/brand set the environment variables.
 */
export const NEUTRAL_BRAND_CONFIG: BrandConfig = Object.freeze({
  partnershipCopy: null,
  legalCopy: null,
  trademarkCopy: null,
  partnerLogoAssets: Object.freeze([]) as readonly PartnerLogoAsset[],
});

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

export interface BrandEnv {
  readonly [key: string]: string | undefined;
}

export const BRAND_ENV_KEYS = Object.freeze({
  partnershipCopy: 'POKEMON_PARTNERSHIP_COPY',
  legalCopy: 'POKEMON_LEGAL_COPY',
  trademarkCopy: 'POKEMON_TRADEMARK_COPY',
  partnerLogoAssets: 'PARTNER_LOGO_ASSETS',
});

/** Whitespace-only configuration is absence, not a blank claim. */
function readCopy(env: BrandEnv, key: string): string | null {
  const raw = env[key];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function coerceLogo(entry: unknown, index: number, warn: (m: string) => void): PartnerLogoAsset | null {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    warn(`${BRAND_ENV_KEYS.partnerLogoAssets}[${index}] is not an object; ignoring`);
    return null;
  }
  const o = entry as Record<string, unknown>;
  const assetKey = typeof o.assetKey === 'string' ? o.assetKey.trim() : '';
  if (assetKey === '') {
    warn(`${BRAND_ENV_KEYS.partnerLogoAssets}[${index}] has no assetKey; ignoring`);
    return null;
  }
  // Alt text defaults to empty (decorative), never to something invented like
  // "Official partner logo" — a screen reader would then read out a claim we
  // were never given.
  const alt = typeof o.alt === 'string' ? o.alt.trim() : '';
  const href = typeof o.href === 'string' && o.href.trim() !== '' ? o.href.trim() : null;
  return { assetKey, alt, href };
}

function readLogos(env: BrandEnv, warn: (m: string) => void): readonly PartnerLogoAsset[] {
  const raw = env[BRAND_ENV_KEYS.partnerLogoAssets];
  if (typeof raw !== 'string' || raw.trim() === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // A typo in an env var must not take the site down. Degrade to "no logos"
    // — which is the safe direction, since the failure mode of dropping a logo
    // is cosmetic while the failure mode of a 500 is total.
    warn(
      `${BRAND_ENV_KEYS.partnerLogoAssets} is not valid JSON; ignoring it: ` +
        (err instanceof Error ? err.message : String(err)),
    );
    return [];
  }

  if (!Array.isArray(parsed)) {
    warn(`${BRAND_ENV_KEYS.partnerLogoAssets} must be a JSON array; ignoring it`);
    return [];
  }

  const out: PartnerLogoAsset[] = [];
  parsed.forEach((entry, i) => {
    const logo = coerceLogo(entry, i, warn);
    if (logo) out.push(logo);
  });
  return out;
}

/**
 * Read brand configuration from the environment. Never throws: every invalid
 * input degrades to "not configured", which is the zero-claim state.
 */
export function loadBrandConfig(
  env: BrandEnv = process.env,
  warn: (message: string) => void = (m) => console.warn(`[brand] ${m}`),
): BrandConfig {
  return {
    partnershipCopy: readCopy(env, BRAND_ENV_KEYS.partnershipCopy),
    legalCopy: readCopy(env, BRAND_ENV_KEYS.legalCopy),
    trademarkCopy: readCopy(env, BRAND_ENV_KEYS.trademarkCopy),
    partnerLogoAssets: readLogos(env, warn),
  };
}

/**
 * True only when an approved partnership statement is actually configured.
 * Callers gate partnership UI on this rather than on the presence of logos or
 * legal copy, so that a half-configured deployment cannot assemble the
 * appearance of a partnership out of parts that don't claim one.
 */
export function hasPartnership(config: BrandConfig = NEUTRAL_BRAND_CONFIG): boolean {
  const copy = config.partnershipCopy;
  return typeof copy === 'string' && copy.trim() !== '';
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/**
 * Own escape helper — this module is imported by surfaces that have no view
 * layer, so it cannot depend on the web app's `esc`. Apostrophe is escaped
 * too because these strings also land in single-quoted attributes.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escaping alone does not make an href safe: `javascript:...` survives entity
 * encoding intact and still executes on click. Allow only http(s), mailto and
 * site-relative paths; anything else renders as unlinked text.
 * Scheme-relative `//host` is rejected because it silently inherits our scheme
 * and points off-site.
 */
function safeHref(href: string | null): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (trimmed.startsWith('//')) return null;
  if (trimmed.startsWith('/')) return trimmed;
  return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : null;
}

function paragraph(cls: string, copy: string | null | undefined): string {
  if (typeof copy !== 'string' || copy.trim() === '') return '';
  // Markup inside configured copy is deliberately NOT honoured. Allowing even
  // one tag makes us the owner of a sanitizer, and legal copy has no need of
  // formatting that a separate config field cannot express.
  return `<p class="${cls}">${escapeHtml(copy.trim())}</p>`;
}

function logoItem(logo: PartnerLogoAsset): string {
  const key = escapeHtml(logo.assetKey);
  const label = escapeHtml(logo.alt);
  const inner = `<span class="attribution-logo-asset" data-asset-key="${key}">${label}</span>`;
  const href = safeHref(logo.href);
  return href === null
    ? `<li class="attribution-logo">${inner}</li>`
    : `<li class="attribution-logo"><a href="${escapeHtml(href)}" rel="noopener noreferrer">${inner}</a></li>`;
}

/**
 * Footer attribution block. With no configuration this is the product name
 * and nothing else — no partnership, endorsement, licence or affiliation is
 * stated or implied.
 */
export function renderAttribution(config: BrandConfig = NEUTRAL_BRAND_CONFIG): string {
  const logos = config.partnerLogoAssets ?? [];
  const logoList =
    logos.length === 0
      ? ''
      : `<ul class="attribution-logos">${logos.map(logoItem).join('')}</ul>`;

  const parts = [
    `<p class="attribution-brand">${escapeHtml(PRODUCT_NAME)}</p>`,
    paragraph('attribution-partnership', config.partnershipCopy),
    logoList,
    paragraph('attribution-legal', config.legalCopy),
    paragraph('attribution-trademark', config.trademarkCopy),
  ].filter((s) => s !== '');

  return `<footer class="attribution note" role="contentinfo">${parts.join('')}</footer>`;
}
