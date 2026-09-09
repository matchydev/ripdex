/**
 * Server-side HTML for the catalog surfaces (spec §8, §9, §10).
 *
 * Detail and grail pages are server-rendered because §8 wants cards to be
 * discoverable pages. The /cards grid renders client-side because its whole
 * point is interactive filtering.
 */

import type {
  CardListing,
  VariantListing,
  CatalogIndex,
  PackConfig,
} from '../../../packages/pokemon-core/src/index.ts';
import { oddsTable, formatProbability } from '../../../packages/pokemon-core/src/index.ts';
import { DESIGN_CSS, MOTION_JS } from './design.ts';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const money = (n: number | null, currency = 'USD'): string =>
  n === null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

/**
 * Page-level styles that build on the design system. Tokens, surfaces, motion
 * primitives and the tile treatment all live in design.ts; only what is
 * genuinely specific to these pages belongs here.
 */
/**
 * Page-level styles built on the design system. Tokens, surfaces, motion
 * primitives and the tile treatment live in design.ts; only what is genuinely
 * specific to these pages belongs here.
 */
export const CSS = DESIGN_CSS + `

/* ---- controls (Pokedex) ---- */
.controls{display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin-bottom:26px;
  padding:14px;border-radius:var(--r-md);background:var(--glass);
  box-shadow:0 0 0 1px var(--line);backdrop-filter:blur(14px)}
.count{font-size:12px;font-weight:510;color:var(--text-3);margin-left:auto;
  font-variant-numeric:tabular-nums}
button.reset{color:var(--text-3);border-radius:var(--r-sm);height:38px;padding:0 14px;
  font-size:13px;font-weight:510;box-shadow:0 0 0 1px var(--line);background:var(--glass);
  transition:color .2s var(--ease),box-shadow .2s var(--ease)}
button.reset:hover{color:var(--text);box-shadow:0 0 0 1px var(--line-hi)}
.sentinel{height:1px}

/* ---- card detail ---- */
.detail{display:grid;grid-template-columns:minmax(280px,430px) 1fr;gap:52px;align-items:start}
@media(max-width:860px){.detail{grid-template-columns:1fr;gap:30px}}
/* The hero card is a real slab: art at Z 0, gloss forward, so turning it
   parallaxes the highlight across the surface instead of sliding a gradient. */
.hero-card{position:relative;border-radius:var(--r-md);overflow:hidden;
  box-shadow:var(--sh-3);transform-style:preserve-3d}
.hero-card img{width:100%;display:block}
.hero-card::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;
  background:radial-gradient(58% 42% at var(--mx,50%) var(--my,40%),rgba(255,255,255,.26),transparent 66%);
  mix-blend-mode:overlay;transition:opacity .35s var(--ease)}
.hero-card:hover::after{opacity:1}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:1px;
  margin:24px 0 8px;border-radius:var(--r-md);overflow:hidden;
  background:var(--line);box-shadow:0 0 0 1px var(--line)}
.fact{padding:14px 15px;background:var(--panel);transition:background .25s var(--ease)}
.fact:hover{background:var(--elevated)}
.fact .k{font-size:10px;font-weight:560;letter-spacing:.055em;color:var(--text-4)}
.fact .v{margin-top:6px;font-size:14px;font-weight:560;letter-spacing:-.014em}

table.variants,table.odds,table.pulls{width:100%;border-collapse:collapse;font-size:13px}
table.variants th,table.odds th,table.pulls th{text-align:left;font-size:10px;font-weight:560;
  letter-spacing:.055em;color:var(--text-4);padding:0 12px 11px 0;white-space:nowrap}
table.variants td,table.odds td,table.pulls td{padding:12px 12px 12px 0;color:var(--text-2);
  box-shadow:inset 0 1px 0 var(--line)}
table.variants tbody tr,table.pulls tbody tr,table.odds tbody tr{transition:background .22s var(--ease)}
table.variants tbody tr:hover,table.pulls tbody tr:hover,table.odds tbody tr:hover{
  background:rgba(255,255,255,.035)}
table.variants td.num,table.odds td.n,table.pulls td.n{
  font-family:ui-monospace,Menlo,monospace;font-weight:560;letter-spacing:-.02em;
  font-variant-numeric:tabular-nums;color:var(--text)}
table.odds td.n,table.pulls td.n{text-align:right}
.pill{display:inline-block;font-size:10px;font-weight:540;letter-spacing:.03em;
  padding:4px 8px;border-radius:6px;color:var(--text-3);box-shadow:0 0 0 1px var(--line)}
.pill.rep{color:var(--em);box-shadow:0 0 0 1px rgba(74,222,155,.3);background:rgba(74,222,155,.07)}
.pill.inf{color:var(--warn);box-shadow:0 0 0 1px rgba(216,164,78,.3);background:rgba(216,164,78,.07)}
.note{font-size:13px;color:var(--text-3);line-height:1.68;max-width:64ch}
.note b{color:var(--text-2);font-weight:560}
.src{font-size:12px;color:var(--text-4);margin-top:12px}
.src a{color:var(--text-3);text-decoration:underline;text-underline-offset:2px}
.src a:hover{color:var(--accent-hi)}

/* ---- grails ---- */
.grails{display:grid;gap:24px;grid-template-columns:repeat(auto-fill,minmax(216px,1fr))}
/* Gold rims the grail tiles. It is the only place gold appears on a surface
   rather than on a number, and it earns it: these are the chase cards. */
.gcard .shot{box-shadow:0 0 0 1px rgba(245,196,81,.28),
  0 18px 46px -18px rgba(245,196,81,.22),var(--sh-1)}
.gcard:hover .shot{box-shadow:0 0 0 1px rgba(245,196,81,.5),
  0 28px 68px -20px rgba(245,196,81,.4),var(--sh-3)}
.gcard .rank{position:absolute;bottom:8px;left:8px;z-index:2;font-size:10px;font-weight:600;
  letter-spacing:.03em;background:rgba(8,9,10,.8);backdrop-filter:blur(8px);color:var(--gold);
  padding:4px 9px;border-radius:6px;box-shadow:0 0 0 1px rgba(245,196,81,.3)}
`;

export function layout(title: string, active: string, body: string, extraHead = ''): string {
  const nav = [
    ['/', 'HOME'],
    ['/cards', 'POKÉDEX'],
    ['/live', 'LIVE'],
    ['/grails', 'GRAILS'],
    ['/packs', 'PACKS'],
  ]
    .map(([href, label]) =>
      `<a href="${href}"${active === href ? ' class="on"' : ''}>${label}</a>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<title>${esc(title)}</title>
<style>${CSS}</style>${extraHead}
</head><body>
<div class="mesh" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
<div class="grain" aria-hidden="true"></div>
<div class="scrollbar-top" aria-hidden="true"></div>
<header class="top">
  <a class="brand" href="/"><span class="dot"></span>RIPDEX</a>
  <nav class="links">${nav}</nav>
</header>
<div class="wrap">${body}</div>
${MOTION_JS}
</body></html>`;
}

/**
 * One grid tile. Uses the small image — the large one is for detail/reveal (§22).
 *
 * The tilt lives on the tile rather than the image so the whole card, badges
 * included, moves as one object; the sheen reads the same --mx/--my the tilt
 * handler writes, so highlight and rotation stay in agreement.
 */
export function tile(c: CardListing): string {
  const href = `/pokemon/${encodeURIComponent(c.setId)}/${encodeURIComponent(c.number)}`;
  const tierClass = c.headlineValue === null ? 'none' : `t-${c.headlineTier}`;
  return `<a class="tile" href="${href}" data-reveal data-tilt="0.7">
  <div class="shot">
    <img src="${esc(c.imageSmall)}" alt="${esc(c.name)}" loading="lazy" decoding="async">
    ${c.availableInPacks ? '<span class="rip-badge">AVAILABLE TO RIP</span>' : ''}
    ${c.variants.length > 1 ? `<span class="vcount">${c.variants.length} VARIANTS</span>` : ''}
  </div>
  <div class="meta">
    <div class="nm">${esc(c.name)}</div>
    <div class="sub">${esc(c.setName)} · ${esc(c.number)} · ${esc(c.rarity ?? '—')}</div>
    <div class="val ${tierClass}">${money(c.headlineValue)}</div>
  </div>
</a>`;
}

function variantRow(v: VariantListing): string {
  return `<tr>
  <td>${esc(v.label)}</td>
  <td class="num">${money(v.referenceValue, v.currency)}</td>
  <td>${v.basis ? esc(v.basis) : '—'}</td>
  <td>${v.tier ? esc(v.tier.replace('_', ' ')) : '—'}</td>
  <td><span class="pill ${v.confidence === 'reported' ? 'rep' : 'inf'}">${v.confidence.toUpperCase()}</span></td>
  <td>${v.availableInPacks ? '<span class="pill rep">IN PACKS</span>' : ''}</td>
  <td>${v.observedOn ? esc(v.observedOn) : '—'}</td>
</tr>`;
}

export function detailPage(c: CardListing, extraBlock = '', extraHead = ''): string {
  const facts: [string, string][] = [
    ['SET', c.setName],
    ['NUMBER', c.number],
    ['RARITY', c.rarity ?? '—'],
    ['ARTIST', c.artist ?? '—'],
    ['RELEASED', c.releaseDate ?? '—'],
    ['TYPE', c.types.join(', ') || '—'],
  ];

  const unpriced = c.variants.filter((v) => v.referenceValue === null);
  const inferred = c.variants.filter((v) => v.confidence === 'inferred');

  const body = `
<div class="detail" data-reveal-group="70">
  <div class="tilt-wrap" data-reveal>
    <div class="hero-card" data-tilt="0.8">
      <img src="${esc(c.imageLarge)}" alt="${esc(c.name)}">
    </div>
  </div>
  <div data-reveal>
    <h1 class="page">${esc(c.name)}</h1>
    <p class="lede">${esc(c.setSeries)} · ${esc(c.setName)} · ${esc(c.number)}</p>
    <div class="facts">
      ${facts.map(([k, v]) => `<div class="fact"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('')}
    </div>

    <h2 class="sec">VARIANTS &amp; REFERENCE PRICE</h2>
    <table class="variants">
      <thead><tr><th>VARIANT</th><th>REFERENCE</th><th>BASIS</th><th>TIER</th><th>CONFIDENCE</th><th></th><th>OBSERVED</th></tr></thead>
      <tbody>${c.variants.map(variantRow).join('')}</tbody>
    </table>

    ${
      inferred.length || unpriced.length
        ? `<h2 class="sec">DATA NOTES</h2><p class="note">${[
            inferred.length
              ? `${inferred.length} variant${inferred.length > 1 ? 's are' : ' is'} <b>inferred</b> — derived from rarity, not confirmed by a pricing provider. Inferred variants are excluded from pack pools.`
              : '',
            unpriced.length
              ? `${unpriced.length} variant${unpriced.length > 1 ? 's have' : ' has'} no reference price. RIPDEX shows no value rather than substituting another printing's.`
              : '',
          ]
            .filter(Boolean)
            .join(' ')}</p>`
        : ''
    }

    ${
      c.variants.find((v) => v.sourceUrl)
        ? `<div class="src">Price source: <a href="${esc(
            c.variants.find((v) => v.sourceUrl)?.sourceUrl,
          )}" rel="noopener nofollow" target="_blank">market data</a></div>`
        : ''
    }
  </div>
</div>`;

  return layout(`${c.name} — ${c.setName} ${c.number} — RIPDEX`, '/cards', body + extraBlock, extraHead);
}

export function grailsPage(cards: CardListing[], minValue: number): string {
  const body = `
<div class="eyebrow" data-reveal>THE VAULT</div>
<h1 class="page" data-reveal>The Grails</h1>
<p class="lede" data-reveal>Every card in the catalog worth ${money(
    minValue,
  )} or more, by reference value. <b class="mono" data-count="${cards.length}">0</b> of them.</p>
<div class="grails" data-reveal-group="45">
  ${cards
    .map(
      (c, i) => `<a class="tile gcard halo" href="/pokemon/${encodeURIComponent(
        c.setId,
      )}/${encodeURIComponent(c.number)}" data-reveal data-tilt="0.8">
    <div class="shot">
      <img src="${esc(c.imageSmall)}" alt="${esc(c.name)}" loading="lazy" decoding="async">
      ${c.availableInPacks ? '<span class="rip-badge">AVAILABLE TO RIP</span>' : ''}
      <span class="rank">#${i + 1}</span>
    </div>
    <div class="meta">
      <div class="nm">${esc(c.name)}</div>
      <div class="sub">${esc(c.setName)} · ${esc(c.number)}</div>
      <div class="val t-GRAIL">${money(c.headlineValue)}</div>
    </div>
  </a>`,
    )
    .join('')}
</div>
${cards.length === 0 ? '<div class="empty">No cards above that value in the catalog yet. Ingest more sets.</div>' : ''}`;

  return layout('The Grails — RIPDEX', '/grails', body);
}

export function cardsPage(index: CatalogIndex): string {
  const f = index.facets;
  const opts = (items: (string | number)[], label: string) =>
    `<option value="">${label}</option>` +
    items.map((i) => `<option value="${esc(i)}">${esc(i)}</option>`).join('');

  const body = `
<div class="eyebrow" data-reveal>THE CATALOG</div>
<h1 class="page" data-reveal>Pokédex</h1>
<p class="lede" data-reveal><b class="mono" data-count="${index.cards.length}">0</b> cards across
  <b class="mono" data-count="${f.sets.length}">0</b> sets,
  <b class="mono" data-count="${index.byVariantId.size}">0</b> tracked variants.
  Every printing priced separately.</p>

<div class="controls" data-reveal>
  <input type="search" id="q" placeholder="Charizard, Pikachu, Mew…" autocomplete="off">
  <select id="setId"><option value="">ALL SETS</option>${f.sets
    .map((s) => `<option value="${esc(s.id)}">${esc(s.name)} (${s.count})</option>`)
    .join('')}</select>
  <select id="type">${opts(f.types, 'ALL TYPES')}</select>
  <select id="rarity">${opts(f.rarities, 'ALL RARITIES')}</select>
  <select id="artist">${opts(f.artists, 'ALL ARTISTS')}</select>
  <select id="year">${opts(f.years, 'ALL YEARS')}</select>
  <input type="number" id="minPrice" placeholder="MIN $" min="0" step="1">
  <input type="number" id="maxPrice" placeholder="MAX $" min="0" step="1">
  <label class="chk"><input type="checkbox" id="inPacks"> AVAILABLE TO RIP</label>
  <select id="sort">
    <option value="value-desc">VALUE ↓</option>
    <option value="value-asc">VALUE ↑</option>
    <option value="newest">NEWEST</option>
    <option value="oldest">OLDEST</option>
    <option value="rarity">RARITY</option>
    <option value="name">NAME</option>
    <option value="number">NUMBER</option>
  </select>
  <button class="reset" id="reset">RESET</button>
  <span class="count" id="count"></span>
</div>

<div class="grid" id="grid" data-reveal-group="35"></div>
<div class="sentinel" id="sentinel"></div>
<div class="empty" id="empty" hidden>Nothing matches those filters.</div>

<script>
const $ = (id) => document.getElementById(id);
const FIELDS = ['q','setId','type','rarity','artist','year','minPrice','maxPrice','sort'];
let page = 1, loading = false, done = false;

function params(p) {
  const u = new URLSearchParams();
  const map = { q:'search', setId:'setId', type:'type', rarity:'rarity',
                artist:'artist', year:'year', minPrice:'minPrice', maxPrice:'maxPrice', sort:'sort' };
  for (const f of FIELDS) { const v = $(f).value.trim(); if (v) u.set(map[f], v); }
  if ($('inPacks').checked) u.set('availableInPacks', '1');
  u.set('page', String(p));
  return u;
}

async function load(reset) {
  if (loading || (done && !reset)) return;
  loading = true;
  if (reset) { page = 1; done = false; $('grid').innerHTML = ''; }

  const res = await fetch('/api/cards?' + params(page));
  const data = await res.json();

  $('grid').insertAdjacentHTML('beforeend', data.html);
  // Newly inserted tiles start at opacity 0; hand them to the motion runtime.
  window.RIPDEX_MOTION?.scan($('grid'));
  $('count').textContent = data.totalCount.toLocaleString() + ' CARDS';
  $('empty').hidden = data.totalCount !== 0;
  done = !data.hasMore;
  page++;
  loading = false;

  // Keep filling while the sentinel is still on screen, otherwise a short first
  // page on a tall monitor would never trigger the observer again.
  if (!done && $('sentinel').getBoundingClientRect().top < innerHeight) load(false);
}

let t;
const debounced = () => { clearTimeout(t); t = setTimeout(() => load(true), 180); };
$('q').addEventListener('input', debounced);
$('minPrice').addEventListener('input', debounced);
$('maxPrice').addEventListener('input', debounced);
for (const f of ['setId','type','rarity','artist','year','sort'])
  $(f).addEventListener('change', () => load(true));
$('inPacks').addEventListener('change', () => load(true));
$('reset').addEventListener('click', () => {
  for (const f of FIELDS) $(f).value = '';
  $('sort').value = 'value-desc';
  $('inPacks').checked = false;
  load(true);
});

new IntersectionObserver((es) => { if (es[0].isIntersecting) load(false); },
  { rootMargin: '600px' }).observe($('sentinel'));

load(true);
</script>`;

  return layout('Pokédex — RIPDEX', '/cards', body);
}

/* ------------------------------------------------------------------ *
 * Pack odds (spec §11)
 * ------------------------------------------------------------------ */

const ODDS_CSS = `
<style>
.pack-head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:4px}
.pack-head .price{font-family:ui-monospace,Menlo,monospace;color:var(--accent);font-weight:700}
.odds-band{margin:26px 0 8px}
.odds-band h3{font-size:10px;letter-spacing:.055em;color:var(--text-4);margin:0 0 14px;font-weight:560}
.odds-row{display:grid;grid-template-columns:56px 1fr;gap:14px;align-items:center;
  padding:9px 0;border-top:1px solid var(--line)}
.odds-row img{width:56px;border-radius:5px;display:block;background:#0D0B12}
.odds-row .who{font-size:13px;font-weight:600}
.odds-row .where{font-size:11.5px;color:var(--text-4);margin-top:3px;letter-spacing:-.008em}
.bar-wrap{display:flex;align-items:center;gap:12px;margin-top:6px}
.bar{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.07);overflow:hidden}
/* Odds bars animate their width in on reveal rather than appearing filled, so
   the comparison between outcomes reads as it draws. */
.bar i{display:block;height:100%;width:0;border-radius:3px;
  background:linear-gradient(90deg,var(--accent),var(--accent-hi));
  transition:width 1.1s var(--ease);transition-delay:var(--d,0ms)}
[data-reveal].in .bar i,.no-motion .bar i{width:var(--w,0%)}
.bar.g i{background:linear-gradient(90deg,var(--gold),#c9962f)}
.pctv{font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:700;min-width:74px;text-align:right}
.pctv.g{color:var(--gold)}
.val-right{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:var(--text-3);
  min-width:78px;text-align:right;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
table.odds{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px}
table.odds th{text-align:left;font-size:10px;letter-spacing:.055em;color:var(--text-4);
  font-weight:600;padding:0 12px 9px 0}
table.odds td{padding:9px 12px 9px 0;border-top:1px solid var(--line)}
table.odds td.n{font-family:ui-monospace,Menlo,monospace;text-align:right}
.ev{margin-top:22px;padding:14px 16px;border:1px solid var(--line);border-radius:11px;
  background:var(--glass);font-size:13px;color:var(--text-3);line-height:1.68;max-width:74ch}
.ev b{color:var(--text-2);font-weight:560}
</style>`;

export function packsPage(packs: PackConfig[], index: CatalogIndex): string {
  const sections = packs.map((pack) => {
    const rows = oddsTable(pack.pool);
    const resolved = rows.map((r) => {
      const hit = index.byVariantId.get(r.variantId);
      return {
        ...r,
        card: hit?.card ?? null,
        variant: hit?.variant ?? null,
        value: hit?.variant.referenceValue ?? null,
      };
    });

    const grails = resolved.filter((r) => (r.value ?? 0) >= 500);
    const nonGrail = resolved.filter((r) => (r.value ?? 0) < 500);
    // Show every non-grail outcome for a small pool. Truncating at a fixed 6
    // left mid-tier cards (a 0.26% Special Illustration Rare, say) visible only
    // in the table, which reads as if they had been hidden.
    const common = nonGrail.length <= 12 ? nonGrail : nonGrail.slice(0, 8);
    const top = resolved[0]?.probability ?? 1;

    // Expected value of one rip, from the same frozen figures the odds use.
    const ev = resolved.reduce((s, r) => s + r.probability * (r.value ?? 0), 0);

    const band = (title: string, list: typeof resolved, gold: boolean) => `
<div class="odds-band">
  <h3>${title}</h3>
  ${list
    .map((r) => {
      const c = r.card;
      const href = c ? `/pokemon/${encodeURIComponent(c.setId)}/${encodeURIComponent(c.number)}` : '#';
      return `<div class="odds-row" data-reveal>
      ${c ? `<a href="${href}"><img src="${esc(c.imageSmall)}" alt="${esc(c.name)}" loading="lazy"></a>` : '<div></div>'}
      <div>
        <div class="who">${c ? esc(c.name) : esc(r.variantId)}${
          r.variant ? ` <span class="pill">${esc(r.variant.label)}</span>` : ''
        }</div>
        <div class="where">${c ? `${esc(c.setName)} · ${esc(c.number)} · ${esc(c.rarity ?? '')}` : 'not in catalog'}</div>
        <div class="bar-wrap">
          <div class="bar${gold ? ' g' : ''}"><i style="--w:${Math.max(0.6, (r.probability / top) * 100).toFixed(2)}%"></i></div>
          <span class="pctv${gold ? ' g' : ''}">${esc(r.probabilityLabel)}</span>
          <span class="val-right">${money(r.value)}</span>
        </div>
      </div>
    </div>`;
    })
    .join('')}
</div>`;

    return `
<div class="pack-head">
  <h1 class="page">${esc(pack.name)}</h1>
  <span class="price">${pack.priceRip.toLocaleString()} $RIP</span>
</div>
<p class="lede">${pack.cardsPerPack} card per pack · ${pack.pool.length} possible outcomes · config v${esc(pack.version)}</p>

${band(nonGrail.length <= 12 ? 'ALL OUTCOMES' : 'MOST COMMON', common, false)}
${grails.length ? band('GRAILS', grails, true) : ''}

<h2 class="sec">FULL ODDS TABLE</h2>
<table class="odds">
  <thead><tr><th>CARD</th><th>VARIANT</th><th class="n">WEIGHT</th><th class="n">ODDS</th><th class="n">1 IN</th><th class="n">REFERENCE</th></tr></thead>
  <tbody>
    ${resolved
      .map(
        (r) => `<tr>
      <td>${r.card ? esc(r.card.name) : esc(r.variantId)}</td>
      <td>${r.variant ? esc(r.variant.label) : '—'}</td>
      <td class="n">${r.weight.toLocaleString()}</td>
      <td class="n">${esc(r.probabilityLabel)}</td>
      <td class="n">${Math.round(1 / r.probability).toLocaleString()}</td>
      <td class="n">${money(r.value)}</td>
    </tr>`,
      )
      .join('')}
  </tbody>
</table>

<div class="ev">
  Expected reference value of one rip: <b>${money(ev)}</b>, against a pack price of
  <b>${pack.priceRip.toLocaleString()} $RIP</b>. Odds are exact ratios of integer
  weights and sum to <b>${formatProbability(resolved.reduce((s, r) => s + r.probability, 0))}</b>.
  Reference values are the frozen figures from the price snapshot, not live quotes.
</div>`;
  });

  return layout('Packs — RIPDEX', '/packs', sections.join('<hr style="border:0;border-top:1px solid var(--line);margin:52px 0">'), ODDS_CSS);
}
