/**
 * Live rip feed (spec §12) and the collection binder (spec §13, §14, §15).
 */

import type {
  FeedEvent,
  FeedResult,
  CollectionEntry,
  BinderPage,
  SetCompletion,
  DuplicateSummary,
  AchievementStatus,
  WalletStats,
} from '../../../packages/pokemon-core/src/index.ts';
import { relativeTime } from '../../../packages/pokemon-core/src/index.ts';
import { esc, money, layout } from './render.ts';

const WALLET_CSS = `
<style>
/* ---- live feed ---- */
.feed{display:grid;gap:12px}
.ev{display:grid;grid-template-columns:62px 1fr auto;gap:16px;align-items:center;
  border:1px solid var(--line);border-radius:13px;padding:12px 16px;background:var(--surface);
  transition:border-color .2s,transform .2s}
.ev:hover{border-color:var(--line-2);transform:translateX(3px)}
.ev img{width:62px;border-radius:6px;display:block;background:#0D0B12}
.ev .who{font-size:10.5px;color:var(--faint);letter-spacing:.1em;
  font-family:ui-monospace,Menlo,monospace}
.ev .nm{font-size:15px;font-weight:700;margin-top:2px}
.ev .sub{font-size:10.5px;color:var(--faint);margin-top:3px;letter-spacing:.06em}
.ev .val{font-family:ui-monospace,Menlo,monospace;font-size:16px;font-weight:800;text-align:right}
.ev .when{font-size:10px;color:var(--faint);text-align:right;margin-top:4px;letter-spacing:.1em}
.ev.major{border-color:rgba(242,193,78,.36);
  box-shadow:0 0 0 1px rgba(242,193,78,.14),0 14px 40px -22px rgba(242,193,78,.5)}
.ev.major img{width:78px}
.ev.major{grid-template-columns:78px 1fr auto}
.ev.major .val{color:var(--gold);font-size:19px}
.ev.notable{border-color:rgba(0,222,165,.24)}
.ev.notable .val{color:var(--em)}
.drift{font-size:11px;color:#C99A4A;margin-top:14px}

/* ---- binder (spec §13) ---- */
.binder{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:620px;margin:0 auto;
  padding:20px;border:1px solid var(--line);border-radius:18px;
  background:linear-gradient(160deg,#12121A,#0B0B11);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 26px 60px -30px #000}
.slot{position:relative;aspect-ratio:734/1024;border-radius:9px;overflow:hidden;
  background:rgba(255,255,255,.022);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
.slot.empty::after{content:"";position:absolute;inset:0;
  background:repeating-linear-gradient(135deg,rgba(255,255,255,.018) 0 6px,transparent 6px 12px)}
.slot img{width:100%;height:100%;object-fit:contain;display:block}
/* Translucent sleeve over each card; the sheen shifts on hover. */
.slot .sleeve{position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(150deg,rgba(255,255,255,.14),transparent 42%,rgba(255,255,255,.05) 72%,transparent);
  transition:background .35s;mix-blend-mode:screen}
.slot:hover .sleeve{background:linear-gradient(115deg,rgba(255,255,255,.22),transparent 46%,rgba(255,255,255,.08) 78%,transparent)}
.slot .qty{position:absolute;bottom:5px;right:5px;font-size:9px;font-weight:800;letter-spacing:.06em;
  background:rgba(0,0,0,.8);border:1px solid var(--line);border-radius:5px;padding:3px 6px}
.binder-nav{display:flex;gap:10px;align-items:center;justify-content:center;margin-top:18px}
.binder-nav a,.binder-nav span{font-size:11px;letter-spacing:.16em;padding:9px 15px;border-radius:9px;
  border:1px solid var(--line);color:var(--muted)}
.binder-nav a:hover{color:var(--ink);border-color:var(--line-2)}
.binder-nav .cur{color:var(--ink)}
.binder-nav .off{opacity:.3;pointer-events:none}
@media(max-width:560px){.binder{grid-template-columns:repeat(3,1fr);gap:8px;padding:12px}}

/* ---- stats ---- */
.wstats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin:4px 0 26px}
.wstats .b{border:1px solid var(--line);border-radius:11px;padding:13px 14px;background:var(--surface)}
.wstats .k{font-size:9.5px;letter-spacing:.2em;color:var(--faint)}
.wstats .v{margin-top:5px;font-size:19px;font-weight:800;font-family:ui-monospace,Menlo,monospace}
.wstats .v.sm{font-size:13px;font-family:inherit;font-weight:600}

.sets{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
.setrow{border:1px solid var(--line);border-radius:11px;padding:12px 14px;background:var(--surface)}
.setrow .top{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.setrow .nm{font-size:13px;font-weight:600}
.setrow .ct{font-size:11px;color:var(--muted);font-family:ui-monospace,Menlo,monospace}
.setbar{height:5px;border-radius:3px;background:rgba(255,255,255,.07);margin-top:9px;overflow:hidden}
.setbar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#00DEA5,#0FA)}
.setrow .pc{font-size:10px;color:var(--faint);margin-top:6px;letter-spacing:.1em}

.achv{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:12px}
.a{border:1px solid var(--line);border-radius:11px;padding:13px 14px;background:var(--surface);opacity:.55}
.a.on{opacity:1;border-color:rgba(242,193,78,.32)}
.a .nm{font-size:12px;font-weight:700;letter-spacing:.08em}
.a.on .nm{color:var(--gold)}
.a .ds{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.5}
.a .pr{font-size:10px;color:var(--faint);margin-top:8px;font-family:ui-monospace,Menlo,monospace}
.abar{height:4px;border-radius:2px;background:rgba(255,255,255,.07);margin-top:5px;overflow:hidden}
.abar i{display:block;height:100%;border-radius:2px;background:var(--gold)}

.dupes{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.empty-state{border:1px dashed var(--line);border-radius:12px;padding:32px;text-align:center;
  color:var(--faint);font-size:12.5px}
</style>`;

/* ------------------------------------------------------------------ *
 * Live feed (spec §12)
 * ------------------------------------------------------------------ */

function feedRow(e: FeedEvent, now: Date): string {
  const href = `/pokemon/${encodeURIComponent(e.card.setId)}/${encodeURIComponent(e.card.number)}`;
  return `<a class="ev ${esc(e.prominence)}" href="${href}">
  <img src="${esc(e.card.imageSmall)}" alt="${esc(e.card.name)}" loading="lazy" decoding="async">
  <div>
    <div class="who">${esc(e.wallet)} just ripped</div>
    <div class="nm">${esc(e.card.name)}</div>
    <div class="sub">${esc(e.variant.label.toUpperCase())} · ${esc(
      (e.card.rarity ?? '').toUpperCase(),
    )} · from ${esc(e.packName)}</div>
  </div>
  <div>
    <div class="val">${money(e.referenceValue, e.currency)}</div>
    <div class="when">${esc(relativeTime(e.openedAt, now))}</div>
  </div>
</a>`;
}

export function livePage(feed: FeedResult, now: Date): string {
  const body = `
<h1 class="page">Live Rips</h1>
<p class="lede">Every pack opened on RIPDEX, newest first. Values are what the card was worth
  at the moment it was pulled.</p>

${
  feed.events.length === 0
    ? '<div class="empty-state">No rips yet.</div>'
    : `<div class="feed">${feed.events.map((e) => feedRow(e, now)).join('')}</div>`
}
${
  feed.skipped > 0
    ? `<p class="drift">${feed.skipped} rip${feed.skipped > 1 ? 's are' : ' is'} hidden:
       the pulled card is no longer in the catalog. Re-run pokemon:sync:cards.</p>`
    : ''
}

<script>
// The tile carries an instant, not a rendered string, so a page left open does
// not freeze at "3 minutes ago". Repaint the relative times in place.
setInterval(() => location.reload(), 30000);
</script>`;

  return layout('Live Rips — RIPDEX', '/live', body, WALLET_CSS);
}

/* ------------------------------------------------------------------ *
 * Collection binder (spec §13, §14, §15)
 * ------------------------------------------------------------------ */

function slot(entry: CollectionEntry | null): string {
  if (!entry) return '<div class="slot empty"></div>';
  const href = `/pokemon/${encodeURIComponent(entry.card.setId)}/${encodeURIComponent(
    entry.card.number,
  )}`;
  return `<a class="slot" href="${href}" title="${esc(entry.card.name)} — ${esc(
    entry.variant.label,
  )}">
  <img src="${esc(entry.card.imageSmall)}" alt="${esc(entry.card.name)}" loading="lazy" decoding="async">
  <div class="sleeve"></div>
  ${entry.count > 1 ? `<div class="qty">×${entry.count}</div>` : ''}
</a>`;
}

export interface CollectionPageInput {
  wallet: string;
  stats: WalletStats;
  page: BinderPage | null;
  pageCount: number;
  pageNumber: number;
  sort: string;
  completion: SetCompletion[];
  duplicates: DuplicateSummary;
  achievements: AchievementStatus[];
  uniqueVariants: number;
}

export function collectionPage(input: CollectionPageInput): string {
  const {
    wallet, stats, page, pageCount, pageNumber, sort, completion, duplicates, achievements,
  } = input;

  const q = (n: number) => `/collection/${encodeURIComponent(wallet)}?page=${n}&sort=${encodeURIComponent(sort)}`;
  const sortLink = (s: string, label: string) =>
    `<a href="/collection/${encodeURIComponent(wallet)}?sort=${s}"${
      sort === s ? ' class="cur"' : ''
    }>${label}</a>`;

  const unlocked = achievements.filter((a) => a.unlocked).length;

  const body = `
<h1 class="page">Binder</h1>
<p class="lede" style="font-family:ui-monospace,Menlo,monospace;font-size:12.5px">${esc(wallet)}</p>

<div class="wstats">
  <div class="b"><div class="k">RIPS</div><div class="v">${stats.rips.toLocaleString()}</div></div>
  <div class="b"><div class="k">UNIQUE VARIANTS</div><div class="v">${input.uniqueVariants.toLocaleString()}</div></div>
  <div class="b"><div class="k">TOTAL PULLED VALUE</div><div class="v">${money(stats.totalReferenceValue)}</div></div>
  <div class="b"><div class="k">BEST PULL</div><div class="v sm">${
    stats.bestPull ? money(stats.bestPull.card.referenceValue) : '—'
  }</div></div>
  <div class="b"><div class="k">ACHIEVEMENTS</div><div class="v sm">${unlocked} / ${achievements.length}</div></div>
</div>

<div class="binder-nav" style="margin:0 0 16px">
  ${sortLink('set', 'BY SET')}${sortLink('value', 'BY VALUE')}${sortLink('pull-date', 'BY PULL DATE')}${sortLink('rarity', 'BY RARITY')}
</div>

${
  page
    ? `<div class="binder">${page.slots.map(slot).join('')}</div>
<div class="binder-nav">
  <a class="${pageNumber <= 1 ? 'off' : ''}" href="${q(pageNumber - 1)}">← TURN BACK</a>
  <span class="cur">PAGE ${pageNumber} OF ${pageCount}</span>
  <a class="${pageNumber >= pageCount ? 'off' : ''}" href="${q(pageNumber + 1)}">TURN PAGE →</a>
</div>`
    : '<div class="empty-state">This wallet has not ripped anything yet.</div>'
}

<h2 class="sec" style="margin-top:44px">SET COMPLETION</h2>
${
  completion.length
    ? `<div class="sets">${completion
        .map(
          (c) => `<div class="setrow">
    <div class="top"><span class="nm">${esc(c.setName)}</span>
      <span class="ct">${c.collected} / ${c.total}</span></div>
    <div class="setbar"><i style="width:${c.percent.toFixed(1)}%"></i></div>
    <div class="pc">${c.percent.toFixed(1)}%</div>
  </div>`,
        )
        .join('')}</div>`
    : '<div class="empty-state">Nothing collected yet.</div>'
}

<h2 class="sec" style="margin-top:40px">ACHIEVEMENTS</h2>
<div class="achv">
  ${achievements
    .map(
      (a) => `<div class="a ${a.unlocked ? 'on' : ''}">
    <div class="nm">${esc(a.def.name)}</div>
    <div class="ds">${esc(a.def.description)}</div>
    <div class="abar"><i style="width:${Math.min(
      100,
      (a.progress.current / a.progress.target) * 100,
    ).toFixed(1)}%"></i></div>
    <div class="pr">${a.progress.current} / ${a.progress.target}${
      a.unlocked && a.unlockedAt ? ' · UNLOCKED' : ''
    }</div>
  </div>`,
    )
    .join('')}
</div>

<h2 class="sec" style="margin-top:40px">DUPLICATES</h2>
${
  duplicates.entries.length === 0
    ? '<div class="empty-state">No duplicates yet.</div>'
    : `<p class="lede">${duplicates.totalDuplicates} spare
       ${duplicates.totalDuplicates === 1 ? 'copy' : 'copies'}, worth
       ${money(duplicates.totalValue)} combined at the values they were pulled at.</p>
<div class="dupes">${duplicates.entries
        .slice(0, 24)
        .map(
          (e) => `<a class="tile" href="/pokemon/${encodeURIComponent(
            e.card.setId,
          )}/${encodeURIComponent(e.card.number)}">
    <div class="shot"><img src="${esc(e.card.imageSmall)}" alt="${esc(e.card.name)}" loading="lazy">
      <span class="vcount">×${e.count}</span></div>
    <div class="meta"><div class="nm">${esc(e.card.name)}</div>
      <div class="sub">${esc(e.variant.label)}</div>
      <div class="val">${money(e.bestReferenceValue)}</div></div>
  </a>`,
        )
        .join('')}</div>`
}`;

  return layout(`Binder — ${wallet} — RIPDEX`, '/live', body, WALLET_CSS);
}
