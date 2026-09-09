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

export const CSS = `
:root{
  --bg:#07070A; --surface:#0E0E13; --surface-2:#15151C;
  --ink:#F5F3F0; --muted:#8A8894; --faint:#55535E;
  --line:rgba(255,255,255,.09); --line-2:rgba(255,255,255,.16);
  --accent:#FF6B1A; --gold:#F2C14E; --em:#00DEA5;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:400 15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,sans-serif;
  -webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}

header.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:26px;
  padding:13px 22px;background:rgba(7,7,10,.86);backdrop-filter:blur(16px);
  border-bottom:1px solid var(--line)}
.brand{font-weight:700;letter-spacing:.3em;font-size:13px}
.brand span{color:var(--accent)}
nav.links{display:flex;gap:20px;font-size:11px;letter-spacing:.18em;color:var(--muted)}
nav.links a:hover,nav.links a.on{color:var(--ink)}
.wrap{max-width:1360px;margin:0 auto;padding:26px 22px 80px}

h1.page{font-size:clamp(24px,4vw,34px);letter-spacing:-.02em;margin:8px 0 4px;font-weight:800}
.lede{color:var(--muted);font-size:13.5px;margin:0 0 22px}

/* ---- controls ---- */
.controls{display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin-bottom:20px}
input[type=search],select,input[type=number]{
  background:var(--surface);border:1px solid var(--line);color:var(--ink);
  border-radius:9px;padding:9px 11px;font:inherit;font-size:13px;outline:none}
input[type=search]{min-width:230px}
input[type=number]{width:96px}
select{min-width:128px;cursor:pointer}
input:focus,select:focus{border-color:var(--line-2)}
.chk{display:flex;align-items:center;gap:7px;font-size:11.5px;letter-spacing:.1em;
  color:var(--muted);cursor:pointer;padding:9px 11px;border:1px solid var(--line);
  border-radius:9px;background:var(--surface)}
.chk input{accent-color:var(--accent)}
.count{font-size:11.5px;color:var(--muted);letter-spacing:.1em;margin-left:auto}
button.reset{background:none;border:1px solid var(--line);color:var(--muted);
  border-radius:9px;padding:9px 13px;font:inherit;font-size:12px;cursor:pointer}
button.reset:hover{color:var(--ink);border-color:var(--line-2)}

/* ---- grid ---- */
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(168px,1fr))}
.tile{position:relative;display:block}
.shot{position:relative;aspect-ratio:734/1024;border-radius:9px;overflow:hidden;
  background:linear-gradient(150deg,#161320,#0D0B12);
  box-shadow:0 8px 22px -12px #000,0 0 0 1px var(--line);
  transition:transform .22s cubic-bezier(.2,.8,.2,1),box-shadow .22s}
.tile:hover .shot{transform:translateY(-5px);
  box-shadow:0 18px 34px -14px #000,0 0 0 1px var(--line-2)}
.shot img{width:100%;height:100%;object-fit:contain;display:block}
.rip{position:absolute;top:7px;left:7px;font-size:8px;letter-spacing:.14em;
  background:linear-gradient(180deg,#FF8B3D,#E2510A);color:#180701;font-weight:800;
  padding:4px 7px;border-radius:5px;box-shadow:0 3px 12px rgba(255,107,26,.5)}
.vcount{position:absolute;top:7px;right:7px;font-size:8px;letter-spacing:.1em;
  background:rgba(0,0,0,.72);color:#CFCBD8;padding:4px 7px;border-radius:5px;
  border:1px solid var(--line)}
.meta{padding:9px 2px 0}
.meta .nm{font-size:13px;font-weight:600;line-height:1.25;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta .sub{font-size:10.5px;color:var(--faint);margin-top:3px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta .val{font-size:13px;font-weight:700;margin-top:5px;font-family:ui-monospace,Menlo,monospace}
.val.t-GRAIL{color:var(--gold)} .val.t-TIER_4{color:#FFB067}
.val.t-TIER_3{color:var(--em)} .val.none{color:var(--faint);font-weight:500}

.empty{padding:64px 0;text-align:center;color:var(--muted)}
.more{display:block;margin:30px auto 0;padding:12px 26px;border:1px solid var(--line);
  border-radius:10px;background:var(--surface);color:var(--ink);font:inherit;
  font-size:12px;letter-spacing:.16em;cursor:pointer}
.more:hover{border-color:var(--line-2)}
.sentinel{height:1px}

/* ---- detail ---- */
.detail{display:grid;grid-template-columns:minmax(280px,420px) 1fr;gap:44px;align-items:start}
@media(max-width:820px){.detail{grid-template-columns:1fr;gap:26px}}
.hero{position:relative;border-radius:12px;overflow:hidden;
  box-shadow:0 30px 70px -26px #000,0 0 0 1px var(--line)}
.hero img{width:100%;display:block}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));
  gap:14px;margin:22px 0 26px}
.fact .k{font-size:9.5px;letter-spacing:.2em;color:var(--faint)}
.fact .v{margin-top:4px;font-size:14px;font-weight:600}
h2.sec{font-size:10.5px;letter-spacing:.24em;color:var(--muted);
  margin:30px 0 12px;font-weight:600}
table.variants{width:100%;border-collapse:collapse;font-size:13px}
table.variants th{text-align:left;font-size:9.5px;letter-spacing:.16em;color:var(--faint);
  font-weight:600;padding:0 12px 9px 0}
table.variants td{padding:11px 12px 11px 0;border-top:1px solid var(--line)}
table.variants td.num{font-family:ui-monospace,Menlo,monospace;font-weight:600}
.pill{font-size:9px;letter-spacing:.12em;padding:3px 7px;border-radius:5px;
  border:1px solid var(--line);color:var(--muted)}
.pill.rep{color:var(--em);border-color:rgba(0,222,165,.32)}
.pill.inf{color:#C99A4A;border-color:rgba(201,154,74,.32)}
.note{font-size:12px;color:var(--muted);line-height:1.6;max-width:62ch}
.src{font-size:11.5px;color:var(--faint);margin-top:8px}
.src a{color:var(--muted);text-decoration:underline}

/* ---- grails ---- */
.grails{display:grid;gap:22px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}
.gcard .shot{box-shadow:0 0 0 1px rgba(242,193,78,.28),0 14px 40px -16px rgba(242,193,78,.22),0 18px 40px -20px #000}
.gcard .rank{position:absolute;bottom:7px;left:7px;font-size:9px;letter-spacing:.14em;
  background:rgba(0,0,0,.78);color:var(--gold);padding:4px 8px;border-radius:5px;
  border:1px solid rgba(242,193,78,.3);font-weight:700}
`;

export function layout(title: string, active: string, body: string, extraHead = ''): string {
  const nav = [
    ['/', 'HOME'],
    ['/cards', 'POKÉDEX'],
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
<title>${esc(title)}</title>
<style>${CSS}</style>${extraHead}
</head><body>
<header class="top">
  <a class="brand" href="/cards">RIP<span>DEX</span></a>
  <nav class="links">${nav}</nav>
</header>
<div class="wrap">${body}</div>
</body></html>`;
}

/** One grid tile. Uses the small image — the large one is for detail/reveal (§22). */
export function tile(c: CardListing): string {
  const href = `/pokemon/${encodeURIComponent(c.setId)}/${encodeURIComponent(c.number)}`;
  const tierClass = c.headlineValue === null ? 'none' : `t-${c.headlineTier}`;
  return `<a class="tile" href="${href}">
  <div class="shot">
    <img src="${esc(c.imageSmall)}" alt="${esc(c.name)}" loading="lazy" decoding="async">
    ${c.availableInPacks ? '<span class="rip">AVAILABLE TO RIP</span>' : ''}
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
<div class="detail">
  <div class="hero"><img src="${esc(c.imageLarge)}" alt="${esc(c.name)}"></div>
  <div>
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
<h1 class="page">The Grails</h1>
<p class="lede">Every card in the catalog worth ${money(minValue)} or more, by reference value. ${cards.length} of them.</p>
<div class="grails">
  ${cards
    .map(
      (c, i) => `<a class="tile gcard" href="/pokemon/${encodeURIComponent(c.setId)}/${encodeURIComponent(c.number)}">
    <div class="shot">
      <img src="${esc(c.imageSmall)}" alt="${esc(c.name)}" loading="lazy" decoding="async">
      ${c.availableInPacks ? '<span class="rip">AVAILABLE TO RIP</span>' : ''}
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
<h1 class="page">Pokédex</h1>
<p class="lede">${index.cards.length.toLocaleString()} cards across ${f.sets.length} sets. Prices are per variant.</p>

<div class="controls">
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

<div class="grid" id="grid"></div>
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
.odds-band h3{font-size:10.5px;letter-spacing:.24em;color:var(--muted);margin:0 0 12px;font-weight:600}
.odds-row{display:grid;grid-template-columns:56px 1fr;gap:14px;align-items:center;
  padding:9px 0;border-top:1px solid var(--line)}
.odds-row img{width:56px;border-radius:5px;display:block;background:#0D0B12}
.odds-row .who{font-size:13px;font-weight:600}
.odds-row .where{font-size:10.5px;color:var(--faint);margin-top:2px}
.bar-wrap{display:flex;align-items:center;gap:12px;margin-top:6px}
.bar{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.07);overflow:hidden}
.bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#FF7E33,#E2510A)}
.bar.g i{background:linear-gradient(90deg,#F2C14E,#B8860B)}
.pctv{font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:700;min-width:74px;text-align:right}
.pctv.g{color:var(--gold)}
.val-right{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--muted);min-width:78px;text-align:right}
table.odds{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px}
table.odds th{text-align:left;font-size:9.5px;letter-spacing:.16em;color:var(--faint);
  font-weight:600;padding:0 12px 9px 0}
table.odds td{padding:9px 12px 9px 0;border-top:1px solid var(--line)}
table.odds td.n{font-family:ui-monospace,Menlo,monospace;text-align:right}
.ev{margin-top:22px;padding:14px 16px;border:1px solid var(--line);border-radius:11px;
  background:var(--surface);font-size:12.5px;color:var(--muted);line-height:1.65;max-width:74ch}
.ev b{color:var(--ink)}
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
      return `<div class="odds-row">
      ${c ? `<a href="${href}"><img src="${esc(c.imageSmall)}" alt="${esc(c.name)}" loading="lazy"></a>` : '<div></div>'}
      <div>
        <div class="who">${c ? esc(c.name) : esc(r.variantId)}${
          r.variant ? ` <span class="pill">${esc(r.variant.label)}</span>` : ''
        }</div>
        <div class="where">${c ? `${esc(c.setName)} · ${esc(c.number)} · ${esc(c.rarity ?? '')}` : 'not in catalog'}</div>
        <div class="bar-wrap">
          <div class="bar${gold ? ' g' : ''}"><i style="width:${Math.max(0.6, (r.probability / top) * 100).toFixed(2)}%"></i></div>
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
