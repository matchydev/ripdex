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
import { packExplorer, EXPLORER_CSS } from './pack-explorer.ts';
import { WORKSPACE_UI, WORKSPACE_CSS } from './workspace-ui.ts';
import { tokenHeader, tokenUI, TOKEN_CSS } from './token.ts';
import { profileHeader, profileUI, PROFILE_CSS } from './profile-ui.ts';
import { ripMark, BRAND_HEAD, BRAND_CSS } from './brand.ts';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A URL safe to interpolate into a CSS `url()` inside a style attribute.
 *
 * Two escapes are needed and neither is optional. esc() alone is not enough:
 * it leaves parentheses and backslashes untouched, so a URL containing `)`
 * would close the url() early and let whatever follows be parsed as CSS.
 * Everything outside a conservative allow-list is dropped rather than encoded,
 * because a card image URL has no legitimate reason to contain anything else,
 * and failing closed is the right default for a value that becomes code.
 */
export function cssUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  if (!/^https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'*+,;=%]+$/.test(raw)) return '';
  return esc(raw.replace(/["'()\\]/g, ''));
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
.detail>div{min-width:0}
.detail{display:grid;grid-template-columns:minmax(280px,430px) 1fr;gap:52px;align-items:start}
@media(max-width:860px){.detail{grid-template-columns:minmax(0,1fr);gap:30px}}
/* The hero card is lit by its own artwork — a big soft bloom of the card's own
   colour pooling behind it, the same trick the grid tiles use, scaled up. */
.detail .tilt-wrap{position:relative}
.detail .tilt-wrap[style*="--art"]::before{content:"";position:absolute;z-index:-1;
  inset:0% -6% -10%;background-image:var(--art);background-size:cover;background-position:50% 40%;
  filter:blur(48px) saturate(1.7);opacity:.42;transition:opacity .5s var(--ease)}
.detail .tilt-wrap:hover[style*="--art"]::before{opacity:.6}
.detail .grail-hero .hero-card{box-shadow:0 26px 64px rgba(245,196,81,.24),0 6px 16px rgba(0,0,0,.55),
  0 0 0 1px var(--gold-rim),inset 0 1px 0 rgba(255,255,255,.2)}
/* Value masthead — the card's worth, the whole point, shown at hero scale
   instead of buried in a table cell. Gold when it is a grail. */
.detail-value{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:20px;
  margin:2px 0 8px;padding:20px 22px;border-radius:var(--r-md);background:var(--glass);box-shadow:0 0 0 1px var(--line)}
.detail-value.is-grail{background:radial-gradient(120% 140% at 0% 0%,var(--gold-glow),transparent 60%),var(--glass);
  box-shadow:0 0 0 1px var(--gold-rim),0 20px 48px -24px var(--gold-glow)}
.dv-k{font-size:10px;font-weight:600;letter-spacing:.09em;color:var(--text-4)}
.detail-value.is-grail .dv-k{color:var(--gold)}
.dv-val{font:700 clamp(34px,4.2vw,52px)/1 ui-monospace,Menlo,monospace;letter-spacing:-.03em;
  margin:9px 0 7px;font-variant-numeric:tabular-nums;color:var(--text)}
.dv-val.t-GRAIL{color:var(--gold)}.dv-val.t-TIER_4{color:#e0b0ff}.dv-val.t-TIER_3{color:var(--em)}
.dv-val.none{color:var(--text-4);font-weight:480;font-size:26px}
.dv-sub{font-size:12px;color:var(--text-3)}
.dv-actions{display:flex;align-items:center;gap:10px}
.dv-chip{font-size:12px;color:var(--text-4);padding:9px 13px;border-radius:8px;background:var(--glass);box-shadow:0 0 0 1px var(--line)}
/* The hero card is a real slab: art at Z 0, gloss forward, so turning it
   parallaxes the highlight across the surface instead of sliding a gradient. */
/* Same card-presentation rules as the grid tiles: true 63/88 ratio, cover,
   percentage corner radius, and a violet-tinted ambient shadow with a lit top
   edge so the card reads as lit by the page rather than cut out of it. */
.hero-card{position:relative;aspect-ratio:63/88;border-radius:4.5% / 3.2%;overflow:hidden;
  background:var(--panel);transform-style:preserve-3d;
  box-shadow:0 26px 64px rgba(60,58,140,.42),0 6px 16px rgba(0,0,0,.55),
    0 0 0 1px var(--line-hi),inset 0 1px 0 rgba(255,255,255,.18)}
.hero-card img{width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit}
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
/* The crown band: the #1 grail lifted into a featured jewel above the wall, so
   the vault opens on drama even when only a card or two clears the grail floor. */
.grail-crown{display:grid;grid-template-columns:minmax(190px,290px) 1fr;gap:44px;align-items:center;
  margin:6px 0 20px;padding:34px;border-radius:var(--r-xl);
  background:radial-gradient(120% 130% at 0% 0%,var(--gold-glow),transparent 56%),var(--glass);
  box-shadow:0 0 0 1px var(--gold-rim),0 30px 72px -34px rgba(245,196,81,.34)}
.gc-card{position:relative;display:block;aspect-ratio:63/88;border-radius:4.5% / 3.2%;overflow:hidden;
  box-shadow:0 26px 60px rgba(245,196,81,.26),0 0 0 1px var(--gold-rim),inset 0 1px 0 rgba(255,255,255,.2);
  transition:transform .4s var(--ease),box-shadow .4s var(--ease)}
.gc-card::before{content:"";position:absolute;z-index:-1;inset:-8%;background-image:var(--art);
  background-size:cover;background-position:50% 40%;filter:blur(46px) saturate(1.7);opacity:.5}
.gc-card:not([style*="--art"])::before{display:none}
.gc-card:hover{transform:translateY(-4px);box-shadow:0 34px 74px rgba(245,196,81,.36),0 0 0 1px rgba(245,196,81,.7),inset 0 1px 0 rgba(255,255,255,.24)}
.gc-card img{width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit}
.gc-rank{position:absolute;top:11px;left:11px;font-size:10px;font-weight:800;letter-spacing:.05em;
  color:#08090a;background:var(--gold);padding:5px 10px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.gc-eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;color:var(--gold)}
.gc-name{font-size:clamp(30px,4vw,46px);letter-spacing:-.035em;line-height:1.04;margin:12px 0 6px;color:var(--text)}
.gc-sub{color:var(--text-3);font-size:13px;margin:0 0 18px}
.gc-value{font:700 clamp(38px,5vw,58px)/1 ui-monospace,Menlo,monospace;color:var(--gold);
  letter-spacing:-.03em;font-variant-numeric:tabular-nums;margin-bottom:22px}
.gc-cta{display:flex;gap:12px;flex-wrap:wrap}
@media(max-width:680px){.grail-crown{grid-template-columns:1fr;gap:22px;padding:22px;text-align:center}
  .gc-card{max-width:210px;margin:0 auto}.gc-cta{justify-content:center}}
/* Gold rims the grail tiles. It is the only place gold appears on a surface
   rather than on a number, and it earns it: these are the chase cards. */
.gcard .shot{box-shadow:0 0 0 1px rgba(245,196,81,.28),
  0 18px 46px -18px rgba(245,196,81,.22),var(--sh-1)}
.gcard:hover .shot{box-shadow:0 0 0 1px rgba(245,196,81,.5),
  0 28px 68px -20px rgba(245,196,81,.4),var(--sh-3)}
.gcard .rank{position:absolute;bottom:8px;left:8px;z-index:2;font-size:10px;font-weight:600;
  letter-spacing:.03em;background:rgba(8,9,10,.8);backdrop-filter:blur(8px);color:var(--gold);
  padding:4px 9px;border-radius:6px;box-shadow:0 0 0 1px rgba(245,196,81,.3)}
/* The prestige bloom — a soft gold halo pooling behind a grail, intensifying on
   hover. Now implemented (was a dead no-op). Sits behind the art-glow (.tile::before
   at z-index -1), so a grail is lit by both its own art AND its gold status. The
   top three get a hotter halo via .g1/.g2/.g3 so #1 never looks like #40. */
.gcard.halo::after{content:"";position:absolute;z-index:-2;inset:-5% -5% -11%;
  background:radial-gradient(ellipse at 50% 62%,var(--gold-glow),transparent 68%);
  opacity:.5;filter:blur(10px);transition:opacity .45s var(--ease);pointer-events:none}
.gcard.halo:hover::after{opacity:1}
.gcard.g1.halo::after{opacity:.9;background:radial-gradient(ellipse at 50% 60%,rgba(245,196,81,.3),transparent 66%)}
.gcard.g2.halo::after{opacity:.72;background:radial-gradient(ellipse at 50% 61%,rgba(245,196,81,.22),transparent 67%)}
.gcard.g3.halo::after{opacity:.62}
.gcard.g1 .shot{box-shadow:0 0 0 1px rgba(245,196,81,.42),0 22px 56px -18px rgba(245,196,81,.34),var(--sh-1)}
/* Styled empty state for the grails wall (was a bare unstyled div). */
.empty{grid-column:1/-1;border-radius:var(--r-md);padding:44px 24px;text-align:center;
  color:var(--text-3);font-size:14px;background:var(--glass);box-shadow:0 0 0 1px var(--line)}

/* ---- live rip ticker (site-wide, under the header) ----
   A thin always-on strip of REAL recent pulls from the ledger. It is the social
   pulse of the site: sits below the nav on every page, streams what other
   wallets are opening and what those cards are worth, and the client refetches
   it so a fresh rip joins the stream. Gold value = grail/major, emerald =
   notable — the same encoding the reveal and the catalog use. */
.ticker{position:sticky;top:68px;z-index:39;display:flex;align-items:stretch;height:36px;
  background:rgba(8,9,10,.66);backdrop-filter:blur(22px) saturate(1.6);
  box-shadow:0 1px 0 var(--line);overflow:hidden}
.ticker[hidden]{display:none}
.ticker-tag{display:inline-flex;align-items:center;gap:7px;padding:0 15px 0 18px;flex:0 0 auto;
  z-index:2;font-size:10px;font-weight:640;letter-spacing:.1em;color:var(--text-2);white-space:nowrap;
  background:linear-gradient(90deg,rgba(113,112,255,.16),rgba(113,112,255,.02) 78%,transparent);
  box-shadow:1px 0 0 var(--line)}
.ticker-tag .pulse-dot{margin-right:0}
.ticker-view{position:relative;flex:1;overflow:hidden;
  -webkit-mask:linear-gradient(90deg,transparent,#000 3%,#000 95%,transparent);
          mask:linear-gradient(90deg,transparent,#000 3%,#000 95%,transparent)}
.ticker-track{display:flex;align-items:center;gap:26px;height:100%;width:max-content;
  will-change:transform;animation:tickerScroll var(--tk-dur,90s) linear infinite}
.ticker:hover .ticker-track{animation-play-state:paused}
@keyframes tickerScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.tk{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:0 0 auto;
  font-size:12px;font-weight:500;color:var(--text-3);transition:color .2s var(--ease)}
.tk:hover{color:var(--text)}
.tk img{width:19px;height:27px;border-radius:3px;object-fit:cover;flex:0 0 auto;
  background:var(--panel);box-shadow:0 0 0 1px var(--line)}
.tk .tw{color:var(--text-4);font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:-.02em}
.tk .tn{color:var(--text-2);font-weight:540;letter-spacing:-.012em}
.tk .tv{font-family:ui-monospace,Menlo,monospace;font-weight:600;font-variant-numeric:tabular-nums;
  color:var(--text-3);letter-spacing:-.02em}
.tk.major .tv{color:var(--gold)}
.tk.notable .tv{color:var(--em)}
.tk .sep{width:3px;height:3px;border-radius:50%;background:var(--text-4);opacity:.6;flex:0 0 auto}
@media(prefers-reduced-motion:reduce){.ticker-track{animation:none}}
@media(max-width:760px){.ticker{top:104px}.ticker-tag{padding:0 10px;font-size:9px}}
.ticker:focus-within .ticker-track{animation-play-state:paused}
.controls{position:sticky;top:104px;z-index:30;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;padding:16px 18px;background:rgba(15,16,17,.72);backdrop-filter:blur(20px) saturate(1.4);box-shadow:0 0 0 1px var(--line),0 14px 32px -20px rgba(0,0,0,.75);border-radius:var(--r-md);margin-bottom:30px}
.controls input:not([type=checkbox]),.controls select{min-width:0;width:100%}
/* Skeleton tiles fill the grid during a fetch, so filtering never flashes a void. */
.skel-tile{display:block}
.sk-shot{aspect-ratio:63/88;border-radius:4.5% / 3.2%;background:var(--panel);box-shadow:0 0 0 1px var(--line);position:relative;overflow:hidden}
.sk-shot::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 32%,rgba(255,255,255,.055) 48%,transparent 64%);background-size:220% 100%;animation:shim 1.5s linear infinite}
.sk-meta{height:12px;width:68%;margin-top:13px;border-radius:4px;background:var(--panel);box-shadow:0 0 0 1px var(--line)}
.sk-meta2{height:10px;width:42%;margin-top:8px;border-radius:4px;background:var(--panel);box-shadow:0 0 0 1px var(--line)}
@media(prefers-reduced-motion:reduce){.sk-shot::after{animation:none}}
.controls #q{grid-column:span 3;height:46px;font-size:14px;background-color:var(--panel)}
.controls #setId{grid-column:span 2;height:46px}.controls #sort{height:46px}
.filter-more{grid-column:1/-1;grid-row:3}
.filter-more summary{display:flex;justify-content:space-between;cursor:pointer;list-style:none;color:var(--text-3);font-size:12px;padding:14px 0;box-shadow:0 1px 0 var(--line)}
.filter-more summary::-webkit-details-marker{display:none}.filter-more[open] summary span{transform:rotate(45deg)}
.advanced-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:18px 0 0}
.advanced-fields .chk{grid-column:span 2;font-size:11px}.advanced-fields input[type=checkbox]{width:auto;min-height:auto}
.controls .count{grid-column:span 5;align-self:center;font-size:10px;letter-spacing:.07em}
.controls .reset{justify-self:start;height:38px;font-size:11px;background:none}
.grails{gap:32px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
@media(max-width:760px){
 .controls{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
 .controls #q{grid-column:1/-1}.controls #setId,.controls #sort{grid-column:auto}
 .filter-more{grid-row:4}.advanced-fields{grid-template-columns:repeat(2,minmax(0,1fr))}
 .controls .count{grid-column:auto}.controls .reset{height:44px}
 .grails{grid-template-columns:repeat(2,minmax(0,1fr));gap:26px 16px}
}

`;

export function layout(title: string, active: string, body: string, extraHead = ''): string {
  const nav = [
    ['/', 'HOME'],
    ['/packs', 'PACKS'],
    ['/cards', 'POKÉDEX'],
    ['/grails', 'GRAILS'],
    ['/live', 'LIVE'],
  ]
    .map(([href, label]) =>
      `<a href="${href}"${active === href ? ' class="on" aria-current="page"' : ''}>${label}</a>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
${BRAND_HEAD}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<title>${esc(title)}</title>
<style>${CSS + WORKSPACE_CSS + TOKEN_CSS + PROFILE_CSS + BRAND_CSS}</style>${extraHead}
</head><body>
<a class="skip-link" href="#main-content">Skip to content</a>
<div class="mesh" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
<div class="grain" aria-hidden="true"></div>
<div class="scrollbar-top" aria-hidden="true"></div>
<header class="top">
  <a class="brand" href="/">${ripMark()}RIPDEX</a>
  <nav class="links" aria-label="Main navigation">${nav}</nav>
  <div class="header-tools"><button type="button" class="header-search" id="open-search" aria-label="Search the Pokédex"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="search-label">Find a card</span><kbd aria-hidden="true">/</kbd></button><button type="button" class="header-binder" id="open-binder" aria-label="Find a binder"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="3" width="15" height="18" rx="2"/><path d="M9 3v18M3 7h4M3 12h4M3 17h4M12 8h5M12 12h5"/></svg> <span>Find a binder</span></button>${tokenHeader()}${profileHeader()}</div>
</header>
<div class="ticker" id="ripTicker" hidden aria-label="Live rips">
  <span class="ticker-tag"><span class="pulse-dot"></span>LIVE RIPS</span>
  <div class="ticker-view"><div class="ticker-track" id="ripTickerTrack"></div></div>
  <button type="button" class="ticker-pause" id="ticker-pause" aria-pressed="false">Pause</button>
</div>
<main id="main-content" class="wrap${active === '/' ? ' home-wrap' : ''}">${body}</main>
<footer class="site-footer">
  <div class="footer-brand"><a class="footer-wordmark" href="/">${ripMark()}RIPDEX</a><p class="footer-tag">The thrill of the pull — real Pokémon cards, provably-fair odds, one $RIP at a time.</p></div>
  <nav class="footer-col" aria-label="Explore"><span class="footer-h">Explore</span><a href="/packs">Packs</a><a href="/cards">Pokédex</a><a href="/grails">Grails</a><a href="/live">Live pulls</a></nav>
  <nav class="footer-col" aria-label="Learn"><span class="footer-h">Learn</span><a href="/packs#odds">Pack odds</a><a href="/#rip-token">$RIP token</a><button type="button" data-footer-binder>Find a binder</button></nav>
  <div class="footer-meta"><span>For the love of the collection.</span><span>Demo $RIP — not an onchain balance.</span></div>
</footer>
${MOTION_JS}
${TICKER_JS}
${WORKSPACE_UI}
${tokenUI()}
${profileUI()}
</body></html>`;
}

/**
 * The live-rip ticker's client. Fetches real recent pulls from /api/ticker,
 * lays them into a seamless marquee (two copies, translateX -50%), and refetches
 * so a rip made in another tab joins the stream. Presentation only — the pulls,
 * values and wallets are the ledger's.
 */
const TICKER_JS = `
<script>
(() => {
  const bar = document.getElementById('ripTicker');
  const track = document.getElementById('ripTickerTrack');
  if (!bar || !track) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = false;
  const pauseButton = document.getElementById('ticker-pause');
  pauseButton.addEventListener('click', () => { paused = !paused; bar.classList.toggle('is-paused', paused); pauseButton.setAttribute('aria-pressed', String(paused)); pauseButton.textContent = paused ? 'Resume' : 'Pause'; });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const money = (n) => n == null ? '—'
    : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cls = (t) => t === 'GRAIL' || t === 'TIER_4' ? 'major' : t === 'TIER_3' ? 'notable' : '';
  const item = (x) =>
    '<a class="tk ' + cls(x.tier) + '" href="' + esc(x.href) + '">' +
      '<img src="' + esc(x.img) + '" alt="" loading="lazy" decoding="async">' +
      '<span class="tw">' + esc(x.w) + '</span>' +
      '<span class="tn">' + esc(x.n) + '</span>' +
      '<span class="tv">' + money(x.v) + '</span>' +
    '</a><span class="sep" aria-hidden="true"></span>';
  async function load() {
    if (paused || document.hidden) return;
    try {
      const res = await fetch('/api/ticker');
      const data = await res.json();
      const items = data.items || [];
      if (!items.length) { bar.hidden = true; return; }
      const html = items.map(item).join('');
      // Two copies so the -50% scroll loops without a seam. Reduced motion shows
      // one static copy.
      track.innerHTML = reduced ? html : html + html;
      if (!reduced) Array.from(track.children).slice(track.children.length / 2).forEach(el => { el.setAttribute('aria-hidden', 'true'); el.setAttribute('inert', ''); });
      track.style.setProperty('--tk-dur', Math.max(45, items.length * 3.1).toFixed(0) + 's');
      bar.hidden = false;
    } catch (e) { /* keep whatever is showing */ }
  }
  load();
  setInterval(load, 25000);
})();
</script>`;

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
  const art = cssUrl(c.imageSmall);
  // A grail in the grid earns the same gold treatment it gets on the grails wall.
  const grail = c.headlineTier === 'GRAIL' ? ' gcard halo' : '';
  return `<a class="tile${grail}" href="${href}" data-reveal data-tilt="0.7"${
    art ? ` style="--art:url(${art})"` : ''
  }>
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
  const art = cssUrl(c.imageSmall);
  const tierClass = c.headlineValue === null ? 'none' : `t-${c.headlineTier}`;
  const isGrail = c.headlineTier === 'GRAIL';

  const body = `
<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/cards">Pokédex</a><span aria-hidden="true">/</span><a href="/cards?setId=${encodeURIComponent(c.setId)}">${esc(c.setName)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(c.name)} #${esc(c.number)}</span></nav>
<div class="detail" data-reveal-group="70">
  <div class="tilt-wrap${isGrail ? ' grail-hero' : ''}" data-reveal${art ? ` style="--art:url(${art})"` : ''}>
    <div class="hero-card" data-tilt="0.8">
      <img src="${esc(c.imageLarge)}" alt="${esc(c.name)}">
    </div>
  </div>
  <div data-reveal>
    <h1 class="page">${esc(c.name)}</h1>
    <p class="lede">${esc(c.setSeries)} · ${esc(c.setName)} · ${esc(c.number)}</p>
    <div class="detail-value${isGrail ? ' is-grail' : ''}">
      <div>
        <div class="dv-k">${isGrail ? 'GRAIL · REFERENCE VALUE' : 'REFERENCE VALUE'}</div>
        <div class="dv-val ${tierClass}">${money(c.headlineValue)}</div>
        <div class="dv-sub">${
          c.headlineValue === null
            ? 'No confirmed reference price'
            : `Highest-priced printing${c.variants.length > 1 ? ` of ${c.variants.length} variants` : ''}`
        }</div>
      </div>
      <div class="dv-actions">${
        c.availableInPacks
          ? '<a class="btn btn-primary btn-lg" href="/packs">Rip a pack <span aria-hidden="true">→</span></a>'
          : '<span class="dv-chip">Not currently in any pack</span>'
      }</div>
    </div>
    <div class="facts">
      ${facts.map(([k, v]) => `<div class="fact"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('')}
    </div>

    <h2 class="sec">VARIANTS &amp; REFERENCE PRICE</h2>
    <div class="table-scroll" role="region" aria-label="Variants table" tabindex="0"><table class="variants">
      <thead><tr><th>VARIANT</th><th>REFERENCE</th><th>BASIS</th><th>TIER</th><th>CONFIDENCE</th><th></th><th>OBSERVED</th></tr></thead>
      <tbody>${c.variants.map(variantRow).join('')}</tbody>
    </table></div>

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

/**
 * One grail card — the gold-rimmed, ranked, gold-value treatment. Shared by the
 * grails wall and the home "Worth the chase" rail so the site's single licensed
 * on-surface gold is consistent everywhere a grail appears. `i` drives the rank
 * chip and the podium intensity (g1/g2/g3).
 */
export function grailTile(c: CardListing, i: number): string {
  return `<a class="tile gcard halo${i < 3 ? ' g' + (i + 1) : ''}" href="/pokemon/${encodeURIComponent(
    c.setId,
  )}/${encodeURIComponent(c.number)}" data-reveal data-tilt="0.8"${
    cssUrl(c.imageSmall) ? ` style="--art:url(${cssUrl(c.imageSmall)})"` : ''
  }>
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
  </a>`;
}

export function grailsPage(cards: CardListing[], minValue: number): string {
  const [top, ...rest] = cards;
  const href = (c: CardListing) =>
    `/pokemon/${encodeURIComponent(c.setId)}/${encodeURIComponent(c.number)}`;
  const crown = top
    ? `<section class="grail-crown" data-reveal>
    <a class="gc-card" href="${href(top)}" aria-label="${esc(top.name)}"${
        cssUrl(top.imageSmall) ? ` style="--art:url(${cssUrl(top.imageSmall)})"` : ''
      }>
      <img src="${esc(top.imageLarge)}" alt="${esc(top.name)}" loading="lazy" decoding="async">
      <span class="gc-rank">#1 GRAIL</span>
    </a>
    <div class="gc-body">
      <span class="gc-eyebrow">THE CROWN JEWEL</span>
      <h2 class="gc-name">${esc(top.name)}</h2>
      <p class="gc-sub">${esc(top.setName)} · ${esc(top.number)}${top.rarity ? ` · ${esc(top.rarity)}` : ''}</p>
      <div class="gc-value">${money(top.headlineValue)}</div>
      <div class="gc-cta">${
        top.availableInPacks
          ? '<a class="btn btn-primary btn-lg" href="/packs">Rip a pack <span aria-hidden="true">→</span></a>'
          : ''
      }<a class="btn btn-ghost btn-lg" href="${href(top)}">View card <span aria-hidden="true">↗</span></a></div>
    </div>
  </section>`
    : '';
  const body = `
<div class="eyebrow" data-reveal>THE VAULT</div>
<h1 class="page" data-reveal>The Grails</h1>
<p class="lede" data-reveal>Every card in the catalog worth ${money(
    minValue,
  )} or more, by reference value. <b class="mono" data-count="${cards.length}">0</b> of them.</p>
<div class="catalog-shortcuts"><a href="/cards?sort=value-desc">Explore all cards by value ↗</a><a href="/packs">Find packs containing grails ↗</a></div>
${crown}
${
    rest.length
      ? `<h2 class="sec">MORE OF THE WALL</h2><div class="grails" data-reveal-group="45">${rest
          .map((c, i) => grailTile(c, i + 1))
          .join('')}</div>`
      : ''
  }
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
<p class="lede" data-reveal><b class="mono" data-count="${index.cards.length}">${index.cards.length.toLocaleString()}</b> cards across
  <b class="mono" data-count="${f.sets.length}">${f.sets.length}</b> sets,
  <b class="mono" data-count="${index.byVariantId.size}">${index.byVariantId.size.toLocaleString()}</b> tracked variants.
  Every printing priced separately.</p>

<div class="controls" role="search" aria-label="Filter cards" data-reveal>
  <input type="search" aria-label="Search cards" id="q" placeholder="Charizard, Pikachu, Mew…" autocomplete="off">
  <select id="setId" aria-label="Set"><option value="">ALL SETS</option>${f.sets
    .map((s) => `<option value="${esc(s.id)}">${esc(s.name)} (${s.count})</option>`)
    .join('')}</select>
  <select id="sort" aria-label="Sort cards">
    <option value="value-desc">VALUE ↓</option>
    <option value="value-asc">VALUE ↑</option>
    <option value="newest">NEWEST</option>
    <option value="oldest">OLDEST</option>
    <option value="rarity">RARITY</option>
    <option value="name">NAME</option>
    <option value="number">NUMBER</option>
  </select>
  <details class="filter-more"><summary>More filters <span aria-hidden="true">+</span></summary><div class="advanced-fields">
  <select id="type" aria-label="Pokémon type">${opts(f.types, 'ALL TYPES')}</select>
  <select id="rarity" aria-label="Rarity">${opts(f.rarities, 'ALL RARITIES')}</select>
  <select id="artist" aria-label="Artist">${opts(f.artists, 'ALL ARTISTS')}</select>
  <select id="year" aria-label="Release year">${opts(f.years, 'ALL YEARS')}</select>
  <input type="number" aria-label="Minimum price" id="minPrice" placeholder="MIN $" min="0" step="1">
  <input type="number" aria-label="Maximum price" id="maxPrice" placeholder="MAX $" min="0" step="1">
  <label class="chk"><input type="checkbox" id="inPacks"> AVAILABLE TO RIP</label>
  </div></details>
  <button class="reset" id="reset">RESET</button>
  <span class="count" id="count" role="status" aria-live="polite">Loading cards…</span>
</div>

<div class="grid" id="grid" aria-label="Card results" aria-busy="true" data-reveal-group="35"></div>
<div class="sentinel" id="sentinel"></div>
<div class="empty-state" id="empty" hidden>Nothing matches those filters.</div>

<script>
const $ = (id) => document.getElementById(id);
const FIELDS = ['q','setId','type','rarity','artist','year','minPrice','maxPrice','sort'];
let page = 1, loading = false, done = false, requestId = 0;
let controller;
const initialQuery = new URLSearchParams(location.search);
for (const field of FIELDS) {
  const key = field === 'q' ? 'search' : field;
  if (initialQuery.has(key)) $(field).value = initialQuery.get(key);
}
$('inPacks').checked = initialQuery.get('availableInPacks') === '1';
if (['type','rarity','artist','year','minPrice','maxPrice','availableInPacks'].some(key => initialQuery.has(key)))
  document.querySelector('.filter-more').open = true;

function params(p) {
  const u = new URLSearchParams();
  const map = { q:'search', setId:'setId', type:'type', rarity:'rarity',
                artist:'artist', year:'year', minPrice:'minPrice', maxPrice:'maxPrice', sort:'sort' };
  for (const f of FIELDS) { const v = $(f).value.trim(); if (v) u.set(map[f], v); }
  if ($('inPacks').checked) u.set('availableInPacks', '1');
  u.set('page', String(p));
  return u;
}

const SKEL = Array.from({ length: 12 }, () =>
  '<div class="skel-tile" aria-hidden="true"><div class="sk-shot"></div><div class="sk-meta"></div><div class="sk-meta2"></div></div>').join('');

async function load(reset) {
  if (!reset && (loading || done)) return;
  if (reset) {
    controller?.abort();
    page = 1; done = false;
    const url = params(1); url.delete('page');
    history.replaceState(null,'',location.pathname + (url.size ? '?' + url.toString() : ''));
    // Show skeleton placeholders during the fetch instead of a blank void.
    $('grid').innerHTML = SKEL;
    $('empty').hidden = true;
  }
  controller = new AbortController();
  const current = ++requestId;
  const firstPage = page === 1;
  loading = true;
  $('grid').setAttribute('aria-busy', 'true');
  $('count').textContent = 'Loading cards…';
  try {
    const res = await fetch('/api/cards?' + params(page), { signal: controller.signal });
    if (!res.ok) throw new Error('Unable to load cards');
    const data = await res.json();
    if (current !== requestId) return;
    // Clear the skeletons before the first real page lands.
    if (firstPage) $('grid').innerHTML = '';
    $('grid').insertAdjacentHTML('beforeend', data.html);
    window.RIPDEX_MOTION?.scan($('grid'));
    $('count').textContent = data.totalCount.toLocaleString() + (data.totalCount === 1 ? ' CARD' : ' CARDS');
    $('empty').hidden = data.totalCount !== 0;
    done = !data.hasMore;
    page++;
  } catch (error) {
    if (current !== requestId || error.name === 'AbortError') return;
    if (firstPage) $('grid').innerHTML = '';
    $('count').textContent = 'Could not load cards. Change a filter or reset to retry.';
    done = true;
  } finally {
    if (current === requestId) {
      loading = false;
      $('grid').setAttribute('aria-busy', 'false');
    }
  }
  if (current === requestId && !done && $('sentinel').getBoundingClientRect().top < innerHeight) load(false);
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

if ('IntersectionObserver' in window) {
  new IntersectionObserver((es) => { if (es[0].isIntersecting) load(false); },
    { rootMargin: '600px' }).observe($('sentinel'));
} else {
  addEventListener('scroll', () => {
    if ($('sentinel').getBoundingClientRect().top < innerHeight + 600) load(false);
  }, { passive: true });
}

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

.pack-head .page{font-size:30px;font-weight:590;letter-spacing:-.04em;margin:10px 0}.pack-head{padding-top:22px}
@media(max-width:600px){.bar-wrap{flex-wrap:wrap}.bar{min-width:70px}.odds-row>div{min-width:0}.val-right{min-width:60px}.pack-head .page{font-size:28px}}

</style>`;

export function packsPage(packs: PackConfig[], index: CatalogIndex, wrappers: Record<string, string> = {}): string {
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
<div class="pack-head" id="odds-${encodeURIComponent(pack.id)}" style="scroll-margin-top:116px">
  <h2 class="page">${esc(pack.name)}</h2>
  <a class="price" href="/rip/${encodeURIComponent(pack.id)}">${pack.priceRip.toLocaleString()} $RIP · OPEN →</a>
</div>
<p class="lede">${pack.cardsPerPack} card per pack · ${pack.pool.length} possible outcomes · config v${esc(pack.version)}</p>

${band(nonGrail.length <= 12 ? 'ALL OUTCOMES' : 'MOST COMMON', common, false)}
${grails.length ? band('GRAILS', grails, true) : ''}

<h2 class="sec">FULL ODDS TABLE</h2>
<div class="table-scroll" role="region" aria-label="Odds table" tabindex="0"><table class="odds">
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
</table></div>

<div class="ev">
  Expected reference value of one rip: <b>${money(ev)}</b>, against a pack price of
  <b>${pack.priceRip.toLocaleString()} $RIP</b>. Odds are exact ratios of integer
  weights and sum to <b>${formatProbability(resolved.reduce((s, r) => s + r.probability, 0))}</b>.
  Reference values are the frozen figures from the price snapshot, not live quotes.
</div>`;
  });

  const gallery = `
<div class="eyebrow" data-reveal>THE PACK LIBRARY</div>
<h1 class="page" data-reveal>Explore the possibilities.</h1>
<p class="lede" data-reveal>Find a set you love. Inspect the contents. Compare packs side by side.</p>
${packExplorer(packs, index, wrappers)}
<h2 class="sec" id="odds" style="scroll-margin-top:160px;margin-top:56px">THE NUMBERS · EXACT ODDS</h2>
`;

  return layout(
    'Cases — RIPDEX',
    '/packs',
    gallery + sections.join('<hr style="border:0;border-top:1px solid var(--line);margin:52px 0">'),
    ODDS_CSS + EXPLORER_CSS,
  );
}
