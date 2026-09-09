/**
 * The RIPDEX DATA block on a card page (spec §8): how often this card has been
 * pulled, when it last happened, which packs can produce it and at what odds.
 *
 * Everything here is per VARIANT. "Charizard has been pulled 14 times" is a
 * meaningless sentence in this product — the 1st Edition holo and the unlimited
 * holo are different cards with different odds, and collapsing them would let a
 * common printing borrow a rare one's scarcity.
 */

import type {
  CardListing,
  PackConfig,
  StoredOpening,
} from '../../../packages/pokemon-core/src/index.ts';
import { oddsTable, formatProbability } from '../../../packages/pokemon-core/src/index.ts';
import { esc, money } from './render.ts';

export interface VariantPullStats {
  variantId: string;
  label: string;
  timesPulled: number;
  lastPulledAt: string | null;
  /** Packs that can produce this variant, with the odds from each. */
  inPacks: { packId: string; packName: string; probability: number; label: string }[];
}

export interface CardPullData {
  variants: VariantPullStats[];
  totalPulls: number;
  recent: { openingId: string; wallet: string; openedAt: string; variantId: string; value: number }[];
}

/** Odds of each variant from each pack that contains it. */
export function packOddsFor(variantId: string, packs: PackConfig[]): VariantPullStats['inPacks'] {
  const out: VariantPullStats['inPacks'] = [];
  for (const pack of packs) {
    const row = oddsTable(pack.pool).find((r) => r.variantId === variantId);
    if (!row) continue;
    out.push({
      packId: pack.id,
      packName: pack.name,
      probability: row.probability,
      label: row.probabilityLabel,
    });
  }
  // Best odds first — a reader wants to know the cheapest route to the card.
  return out.sort((a, b) => b.probability - a.probability);
}

/** Abbreviate a wallet for display without implying it is a real address. */
export function shortWallet(w: string): string {
  return w.length <= 14 ? w : `${w.slice(0, 8)}…${w.slice(-4)}`;
}

export function relativeWhen(iso: string, now: number): string {
  const delta = now - Date.parse(iso);
  if (!Number.isFinite(delta)) return '—';
  // Clock skew between a server and a stored record is real; a future
  // timestamp should read as "just now", never as "-3 seconds ago".
  if (delta < 0) return 'just now';
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const CARD_STATS_CSS = `
<style>
/* ===================== RIPDEX DATA =====================
   The four stat boxes are built as genuine 3D slabs rather than rectangles
   with a shadow: an absolutely-positioned .card face at Z 0, an edge plane
   pushed behind it, and the label and value floating in front on their own
   [data-layer] planes. Turning a tile parallaxes the type against the surface,
   which is the difference between an object with thickness and a picture of
   one. Only these four get the treatment — the tables below are dense data and
   preserve-3d on every row would buy nothing. */

.rx{display:grid;grid-template-columns:repeat(auto-fit,minmax(172px,1fr));gap:16px;
  margin:2px 0 8px}
.rx-slot{position:relative;min-height:112px}
.rx-float{position:relative;height:100%}
.rx-b{position:relative;height:100%;display:flex;flex-direction:column;
  justify-content:space-between;gap:10px;padding:15px 16px 16px;
  border-radius:var(--r-lg)}

/* The slab edge. Pushed back in Z and scaled just past the face so a sliver of
   violet reads as the card's thickness at rest, and swings wide on turn. */
.rx-under{pointer-events:none;transform:translateZ(-16px) scale(1.014);
  background:linear-gradient(180deg,rgba(113,112,255,.26),rgba(113,112,255,.05));
  box-shadow:0 0 0 1px rgba(113,112,255,.16);
  transition:background .3s var(--ease),box-shadow .3s var(--ease)}
.rx-b:hover .rx-under{background:linear-gradient(180deg,rgba(113,112,255,.42),rgba(113,112,255,.10));
  box-shadow:0 0 0 1px rgba(113,112,255,.3),0 0 30px rgba(113,112,255,.28)}
/* The face is near-opaque on purpose. Left translucent, the violet edge plane
   behind it tints the entire tile and the "thickness" reads as a purple wash
   instead of as an edge. */
.rx-face{background-color:rgba(13,14,17,.88);
  background-image:linear-gradient(152deg,rgba(255,255,255,.07),rgba(255,255,255,.014))}
.rx-b:hover .rx-face{box-shadow:0 0 0 1px rgba(113,112,255,.32),
  0 2px 4px rgba(0,0,0,.45),0 24px 54px -24px rgba(113,112,255,.7)}
.rx-b [data-layer]{transition:transform .5s var(--ease)}

.rx-k{position:relative;pointer-events:none;font-size:10px;font-weight:560;
  letter-spacing:.055em;color:var(--text-4);transition:color .25s var(--ease)}
.rx-b:hover .rx-k{color:var(--text-3)}
.rx-v{position:relative;pointer-events:none;font-size:14.5px;font-weight:560;
  letter-spacing:-.016em;line-height:1.34;color:var(--text-2);overflow-wrap:anywhere}
.rx-v.big{font-size:clamp(27px,4.4vw,34px);font-weight:590;letter-spacing:-.042em;
  line-height:1;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  font-variant-numeric:tabular-nums;
  background:linear-gradient(176deg,var(--text) 32%,#a7a6ff 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.rx-v.num{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  font-variant-numeric:tabular-nums;letter-spacing:-.024em;color:var(--text)}
.rx-v.off{color:var(--text-4);font-weight:520}

/* ---------------------------- data tables ---------------------------- */
.rxpanel{position:relative;border-radius:var(--r-lg);padding:2px 16px 8px;
  background:var(--glass);box-shadow:0 0 0 1px var(--line);overflow-x:auto;
  transition:box-shadow .3s var(--ease)}
.rxpanel:hover{box-shadow:0 0 0 1px var(--line-hi)}
.rxt{width:100%;border-collapse:collapse;font-size:13px}
.rxt th{text-align:left;padding:15px 14px 11px 0;font-size:10px;font-weight:560;
  letter-spacing:.055em;color:var(--text-4);white-space:nowrap}
.rxt td{padding:11px 14px 11px 0;color:var(--text-2);vertical-align:middle;
  box-shadow:inset 0 1px 0 var(--line);transition:color .22s var(--ease)}
.rxt th:first-child,.rxt td:first-child{padding-left:9px}
.rxt th:last-child,.rxt td:last-child{padding-right:2px}
.rxt tbody tr{transition:background .22s var(--ease)}
.rxt tbody tr:hover{background:rgba(255,255,255,.035)}
.rxt tbody tr:hover td{color:var(--text)}
.rxt tbody tr:hover td:first-child{box-shadow:inset 0 1px 0 var(--line),
  inset 2px 0 0 var(--accent)}
.rxt td.n,.rxt th.n{text-align:right;font-variant-numeric:tabular-nums}
.rxt td.dim{color:var(--text-3);letter-spacing:-.008em}
.rxt td.when{color:var(--text-4);font-weight:510}
.rxt td.val{color:var(--text);font-weight:560}
.rxt td.val.grail{color:var(--gold)}

.rx-link{position:relative;color:var(--text);font-weight:560;letter-spacing:-.012em;
  transition:color .2s var(--ease)}
.rx-link::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:1px;
  background:var(--accent);transform:scaleX(0);transform-origin:0 50%;
  transition:transform .3s var(--ease)}
.rx-link:hover{color:var(--accent-hi)}
.rx-link:hover::after{transform:scaleX(1)}

/* Odds as length, not only as a percentage string. Bars are scaled against the
   best odds on this card: at absolute scale every row on a rare card would be
   an invisible sliver and the comparison would be unreadable. */
.ob{display:flex;width:100%;align-items:center;gap:12px;justify-content:flex-end}
.ob-t{position:relative;flex:1 1 96px;min-width:64px;max-width:200px;height:6px;
  border-radius:99px;background:rgba(255,255,255,.055);overflow:hidden;
  box-shadow:inset 0 0 0 1px var(--line)}
.ob-t i{position:absolute;top:0;left:0;bottom:0;width:0;border-radius:99px;
  background:linear-gradient(90deg,#5451e6,var(--accent) 58%,var(--accent-hi));
  box-shadow:0 0 14px rgba(113,112,255,.55);
  transition:width 1.05s var(--ease);transition-delay:calc(var(--d,0ms) + 160ms)}
.rxt tbody tr.in .ob-t i{width:var(--w,0%)}
.no-motion .ob-t i{width:var(--w,0%);transition:none}
.ob-t i::after{content:"";position:absolute;inset:0;opacity:0;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);
  background-size:44% 100%;background-repeat:no-repeat;background-position:-60% 0}
.rxt tbody tr:hover .ob-t i::after{opacity:1;animation:obSweep 1.5s var(--ease) infinite}
@keyframes obSweep{0%{background-position:-60% 0}100%{background-position:170% 0}}
.ob-p{min-width:62px;text-align:right;font-weight:560;color:var(--text)}

.wal{display:inline-block;padding:3px 9px;border-radius:7px;font-size:12px;
  color:var(--text-2);background:rgba(255,255,255,.04);box-shadow:0 0 0 1px var(--line);
  transition:color .22s var(--ease),background .22s var(--ease),box-shadow .22s var(--ease)}
.rxt tbody tr:hover .wal{color:var(--text);background:var(--accent-dim);
  box-shadow:0 0 0 1px rgba(113,112,255,.3)}

.rx-empty{border-radius:var(--r-lg);padding:36px 22px;text-align:center;
  color:var(--text-4);font-size:13px;letter-spacing:-.008em;
  background:var(--glass);box-shadow:0 0 0 1px var(--line)}

@media(max-width:640px){
  .rx{gap:12px}
  .rxt{font-size:12px}
  .rxt td,.rxt th{padding-right:10px}
  .ob-t{min-width:48px}
}
</style>`;

export function ripdexDataSection(card: CardListing, data: CardPullData, now: number): string {
  const everPulled = data.variants.filter((v) => v.timesPulled > 0);
  const lastAt = everPulled
    .map((v) => v.lastPulledAt)
    .filter((x): x is string => x !== null)
    .sort()
    .at(-1);

  const rippable = data.variants.filter((v) => v.inPacks.length > 0);
  const bestOdds = rippable
    .flatMap((v) => v.inPacks)
    .sort((a, b) => b.probability - a.probability)[0];

  // Bars are scaled against the best odds on this card rather than against
  // 100%: a 0.3% chase card would otherwise render as four identical slivers.
  const topOdds = bestOdds ? bestOdds.probability : 1;

  // Out-of-phase float parameters. A row of slabs breathing in sync reads as a
  // loop; staggered periods and negative delays read as life.
  const drift: [string, string, string][] = [
    ['8.4s', '-1.1s', '6px'],
    ['9.7s', '-3.6s', '5px'],
    ['7.9s', '-0.4s', '7px'],
    ['10.4s', '-2.3s', '5px'],
  ];

  const slab = (i: number, key: string, valueHtml: string): string => {
    const d = drift[i % drift.length];
    return `<div class="rx-slot depth" data-reveal-3d>
    <div class="rx-float depth floaty grounded" style="--float-dur:${d[0]};--float-delay:${d[1]};--float-amp:${d[2]}">
      <div class="rx-b card3d depth" data-depth="0.55">
        <span class="plane rx-under" aria-hidden="true"></span>
        <span class="plane plane-art card rx-face" data-spotlight aria-hidden="true"></span>
        <span class="plane plane-rim" aria-hidden="true"></span>
        <span class="plane plane-gloss" aria-hidden="true"></span>
        <div class="rx-k" data-layer="20">${key}</div>
        ${valueHtml}
      </div>
    </div>
  </div>`;
  };

  return `
<h2 class="sec">RIPDEX DATA</h2>
<div class="rx scene" data-reveal-group="80">
  ${slab(
    0,
    'TIMES PULLED',
    `<div class="rx-v big" data-layer="36" data-count="${data.totalPulls}">${data.totalPulls.toLocaleString()}</div>`,
  )}
  ${slab(
    1,
    'LAST PULLED',
    `<div class="rx-v num${lastAt ? '' : ' off'}" data-layer="36">${
      lastAt ? esc(relativeWhen(lastAt, now)) : 'Never'
    }</div>`,
  )}
  ${slab(
    2,
    'IN PACKS',
    `<div class="rx-v${rippable.length ? '' : ' off'}" data-layer="36">${
      // Deduped: two variants of one card commonly sit in the same pack, and
      // listing it twice reads as a rendering bug.
      rippable.length
        ? esc([...new Set(rippable.flatMap((v) => v.inPacks.map((p) => p.packName)))].join(', '))
        : 'Not rippable'
    }</div>`,
  )}
  ${slab(
    3,
    'BEST ODDS',
    `<div class="rx-v num${bestOdds ? '' : ' off'}" data-layer="36">${
      bestOdds ? esc(bestOdds.label) : '—'
    }</div>`,
  )}
</div>

${
  rippable.length
    ? `<h2 class="sec">ODDS BY PACK</h2>
<div class="rxpanel" data-reveal>
<table class="rxt">
  <thead><tr><th>PACK</th><th>VARIANT</th><th class="n">ODDS</th><th class="n">1 IN</th><th class="n">PULLED</th></tr></thead>
  <tbody data-reveal-group="60">${rippable
    .flatMap((v) =>
      v.inPacks.map(
        (p) => `<tr data-reveal>
      <td><a class="rx-link" href="/packs">${esc(p.packName)}</a></td>
      <td class="dim">${esc(v.label)}</td>
      <td class="n"><span class="ob"><span class="ob-t"><i style="--w:${Math.max(
        4,
        (p.probability / topOdds) * 100,
      ).toFixed(2)}%"></i></span><span class="ob-p mono">${esc(p.label)}</span></span></td>
      <td class="n mono">${Math.round(1 / p.probability).toLocaleString()}</td>
      <td class="n mono">${v.timesPulled.toLocaleString()}</td>
    </tr>`,
      ),
    )
    .join('')}</tbody>
</table>
</div>`
    : ''
}

<h2 class="sec">RECENT PULLS</h2>
${
  data.recent.length === 0
    ? `<div class="rx-empty" data-reveal>Nobody has pulled this ${
        rippable.length ? 'yet' : 'card — it is not in any pack'
      }.</div>`
    : `<div class="rxpanel" data-reveal>
<table class="rxt">
  <thead><tr><th>WALLET</th><th>VARIANT</th><th class="n">VALUE AT RIP</th><th class="n">WHEN</th></tr></thead>
  <tbody data-reveal-group="45">${data.recent
    .map(
      (r) => `<tr data-reveal>
      <td><span class="wal mono">${esc(shortWallet(r.wallet))}</span></td>
      <td class="dim">${esc(data.variants.find((v) => v.variantId === r.variantId)?.label ?? r.variantId)}</td>
      <td class="n val${r.value >= 500 ? ' grail' : ''} mono">${money(r.value)}</td>
      <td class="n when mono">${esc(relativeWhen(r.openedAt, now))}</td>
    </tr>`,
    )
    .join('')}</tbody>
</table>
</div>`
}`;
}

/**
 * Gather pull data for one card. `formatProbability` is re-exported through the
 * odds module so callers do not need a second import.
 */
export function buildCardPullData(
  card: CardListing,
  packs: PackConfig[],
  counts: Map<string, number>,
  openings: StoredOpening[],
): CardPullData {
  const variantIds = new Set(card.variants.map((v) => v.variantId));

  const variants: VariantPullStats[] = card.variants.map((v) => {
    const relevant = openings.filter((o) => o.cards.some((c) => c.variantId === v.variantId));
    return {
      variantId: v.variantId,
      label: v.label,
      timesPulled: counts.get(v.variantId) ?? 0,
      lastPulledAt: relevant.map((o) => o.openedAt).sort().at(-1) ?? null,
      inPacks: packOddsFor(v.variantId, packs),
    };
  });

  const recent = openings
    .flatMap((o) =>
      o.cards
        .filter((c) => variantIds.has(c.variantId))
        .map((c) => ({
          openingId: o.openingId,
          wallet: o.wallet,
          openedAt: o.openedAt,
          variantId: c.variantId,
          value: c.referenceValue,
        })),
    )
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .slice(0, 8);

  return {
    variants,
    totalPulls: variants.reduce((s, v) => s + v.timesPulled, 0),
    recent,
  };
}

export { formatProbability };
