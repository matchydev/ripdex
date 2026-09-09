/**
 * Live rip feed (spec §12) and the collection binder (spec §13, §14, §15).
 *
 * Both surfaces are built on the design system in design.ts: tokens, the
 * shadow-as-border surface treatment, and the 3D primitives (.scene, .card3d,
 * .depth, [data-depth]/[data-layer]) come from there. Only what is genuinely
 * specific to a rip row or a binder sleeve lives in this file.
 *
 * The binder is the page's 3D object. It is a real book: a spine on the left,
 * a page that swings in from that spine on load, and card sleeves whose cards
 * turn individually under the cursor. Every sleeve is a stack of planes at
 * different Z — art, the card's own thickness behind it, a rim light, the
 * sleeve film, and a gloss that slides across in front — because a single
 * rotation applied to a flat picture reads as a rotated picture, and the
 * parallax between those planes is the whole difference.
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
/* ============================== live feed ============================== */
.live-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px}
.live-chip{display:inline-flex;align-items:center;font-size:11px;font-weight:560;
  letter-spacing:.055em;color:var(--text-2);padding:5px 11px 5px 10px;border-radius:100px;
  background:var(--glass);box-shadow:0 0 0 1px var(--line-hi)}
.live-chip .pulse-dot{margin-right:7px}
.live-count{font-size:12px;font-weight:510;letter-spacing:-.008em;color:var(--text-4)}
.live-count b{color:var(--text-2);font-weight:560}

.feed-refresh{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:24px}.feed-refresh p{font-size:12px;color:var(--text-3);margin:0}.feed-refresh button{white-space:nowrap}@media(max-width:500px){.feed-refresh{align-items:flex-start;flex-direction:column}}
.feed{display:grid;gap:10px}
.rip{position:relative;display:grid;grid-template-columns:62px 1fr auto;gap:18px;align-items:center;
  padding:13px 17px;border-radius:var(--r-md)}
.rip:hover{transform:translateX(4px)}

/* Each row's thumbnail is a real object: art, the card's thickness behind it,
   a rim light and a gloss, each on its own plane so they separate as it turns. */
.rip .thumb{position:relative;width:62px;aspect-ratio:734/1024;flex:0 0 auto}
.rip .thumb .card3d{position:absolute;inset:0;border-radius:8px;
  transition:transform .45s var(--ease)}
.rip .thumb .plane-art{width:100%;height:100%;object-fit:cover;display:block;
  background:var(--panel);box-shadow:0 6px 18px rgba(0,0,0,.5)}
.rip .thumb .plane-edge{transform:translateZ(-9px);background:#0a0b0d;
  box-shadow:0 0 0 1px rgba(255,255,255,.05)}
/* Sits at the design system's own gloss depth (Z 18), so the [data-layer]
   counter-drift and the resting transform agree. */
.rip .thumb .plane-gloss{background:linear-gradient(118deg,transparent 34%,
  rgba(255,255,255,.24) 50%,transparent 66%);background-size:280% 100%;
  background-position:var(--mx,50%) center}
/* The feed is 80 rows deep, and the design system promotes every .depth and
   every [data-layer] with will-change:transform. That is 240 permanently
   composited layers for thumbnails that only ever turn under the cursor, so
   promote a row's planes while it is being turned and let them go afterwards.
   The planes themselves are leaves — nothing 3D sits inside one — so flattening
   them costs no depth while removing 160 needless 3D rendering contexts. The
   binder keeps the full treatment: it is the one hero object on its page. */
.rip .thumb .depth,.rip .thumb .plane{will-change:auto}
.rip .thumb .plane{transform-style:flat}
.rip:hover .thumb .depth{will-change:transform}

.rip .who{font-size:11px;font-weight:500;color:var(--text-4);letter-spacing:-.004em}
.rip .who .mono{color:var(--text-3)}
.rip .nm{font-size:15.5px;font-weight:590;letter-spacing:-.024em;line-height:1.15;margin-top:3px}
.rip .sub{font-size:11.5px;font-weight:480;color:var(--text-4);margin-top:4px;
  letter-spacing:-.006em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rip .right{text-align:right}
.rip .val{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;
  font-size:16px;font-weight:600;letter-spacing:-.026em}
.rip .when{font-size:10.5px;font-weight:490;color:var(--text-4);margin-top:5px;letter-spacing:-.004em}

.tag{display:inline-flex;align-items:center;margin-left:9px;font-size:9.5px;font-weight:560;
  letter-spacing:.055em;padding:3px 7px;border-radius:5px;vertical-align:2px}
.tag.gold{color:var(--gold);background:rgba(245,196,81,.10);
  box-shadow:0 0 0 1px rgba(245,196,81,.26)}
.tag.em{color:var(--em);background:rgba(74,222,155,.09);
  box-shadow:0 0 0 1px rgba(74,222,155,.22)}

/* Prominence is data, so it is encoded three ways at once — value colour,
   shadow weight and motion — rather than a border tint you have to look for. */
.rip.major{grid-template-columns:78px 1fr auto;padding:16px 18px;
  background:linear-gradient(140deg,rgba(245,196,81,.055),rgba(255,255,255,.022) 46%,var(--glass));
  box-shadow:0 0 0 1px rgba(245,196,81,.24),0 8px 16px rgba(0,0,0,.5),
    0 40px 90px -34px rgba(245,196,81,.42)}
.rip.major:hover{box-shadow:0 0 0 1px rgba(245,196,81,.42),0 10px 20px rgba(0,0,0,.55),
  0 52px 110px -34px rgba(245,196,81,.6)}
.rip.major .thumb{width:78px}
.rip.major .thumb .plane-rim{box-shadow:inset 0 0 0 1px rgba(245,196,81,.34),
  inset 0 1px 0 rgba(255,255,255,.18)}
.rip.major .val{color:var(--gold);font-size:19px;letter-spacing:-.032em}
.rip.major .nm{font-size:17px;letter-spacing:-.03em}
/* Slow shimmer: the row catches the light every few seconds. */
.rip.major::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  background:linear-gradient(104deg,transparent 34%,rgba(245,196,81,.13) 48%,transparent 62%);
  background-size:260% 100%;animation:goldSweep 7s var(--ease) infinite}
@keyframes goldSweep{0%{background-position:200% 0}58%,100%{background-position:-100% 0}}

.rip.notable{box-shadow:0 0 0 1px rgba(74,222,155,.20),0 2px 4px rgba(0,0,0,.3),
  0 16px 40px -22px rgba(74,222,155,.3)}
.rip.notable:hover{box-shadow:0 0 0 1px rgba(74,222,155,.34),0 4px 8px rgba(0,0,0,.4),
  0 24px 56px -22px rgba(74,222,155,.42)}
.rip.notable .val{color:var(--em)}
.rip.notable .thumb .plane-rim{box-shadow:inset 0 0 0 1px rgba(74,222,155,.26),
  inset 0 1px 0 rgba(255,255,255,.16)}

.drift{margin-top:16px;padding:12px 15px;border-radius:var(--r-md);background:var(--glass);
  box-shadow:0 0 0 1px var(--line);font-size:12px;font-weight:490;color:var(--text-3);
  line-height:1.6;max-width:70ch}
.drift b{color:var(--warn);font-weight:560}

@media(max-width:640px){
  .rip,.rip.major{grid-template-columns:52px 1fr;gap:13px;row-gap:10px}
  .rip .thumb,.rip.major .thumb{width:52px}
  .rip .right{grid-column:2;text-align:left;display:flex;align-items:baseline;gap:10px}
  .rip .when{margin-top:0}
}

/* ================================ binder =============================== */
.wallet-chip{display:inline-flex;align-items:center;gap:8px;margin:2px 0 30px;
  padding:7px 13px;border-radius:100px;background:var(--glass);
  box-shadow:0 0 0 1px var(--line);font-size:12px;font-weight:510;color:var(--text-3)}
.wallet-chip .mono{color:var(--text-2)}

.binder-wrap{margin:8px 0 4px}
.binder-scene{perspective-origin:26% 42%}
/* preserve-3d is load-bearing here, not decoration. A perspective only reaches
   its own children, and it stops dead at the first descendant left flat: a flat
   wrapper renders its whole subtree into one 2D plane. Without this the book,
   the spine, the page turn and all nine sleeve plane stacks below composed
   orthographically — rotateY(-9deg) collapsed to a 1.2% horizontal squash and
   every translateZ did nothing at all, which is exactly the rotated-picture
   look the plane stacks exist to avoid. */
.binder-stage{position:relative;max-width:660px;margin:0 auto;transform-style:preserve-3d}
.binder-book{position:relative;padding:22px 22px 22px 34px;border-radius:var(--r-xl);
  background:linear-gradient(152deg,rgba(255,255,255,.055),rgba(255,255,255,.012) 44%,
    rgba(255,255,255,.035));
  box-shadow:0 0 0 1px var(--line-hi),inset 0 1px 0 rgba(255,255,255,.07),
    0 44px 100px -40px rgba(0,0,0,.9);
  transform:rotateY(-9deg) rotateX(3.5deg);
  transition:transform .8s var(--ease)}
.binder-stage:hover .binder-book{transform:rotateY(-3.5deg) rotateX(1.5deg)}
/* The spine sits forward of the boards, so the book has a visible edge. */
.binder-spine{position:absolute;left:0;top:0;bottom:0;width:16px;
  border-radius:var(--r-xl) 0 0 var(--r-xl);transform:translateZ(7px);
  background:linear-gradient(90deg,rgba(113,112,255,.30),rgba(255,255,255,.06) 62%,transparent);
  box-shadow:inset 1px 0 0 rgba(255,255,255,.14)}
.binder-spine i{position:absolute;left:5px;width:6px;height:6px;border-radius:50%;
  background:rgba(255,255,255,.14);box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}
.binder-spine i:nth-child(1){top:22%}
.binder-spine i:nth-child(2){top:50%}
.binder-spine i:nth-child(3){top:78%}

/* The page turn: it swings in from the spine, not from nowhere. */
.binder-page{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;
  transform-style:preserve-3d;transform-origin:0% 50%;
  animation:pageTurn 1.15s var(--ease) both}
@keyframes pageTurn{
  0%{transform:rotateY(-88deg) translateZ(30px);opacity:0}
  55%{opacity:1}
  100%{transform:rotateY(0deg) translateZ(0);opacity:1}}

.slot{position:relative;aspect-ratio:734/1024;border-radius:10px;transform-style:preserve-3d;
  animation:slotIn .62s var(--ease) both;animation-delay:calc(520ms + var(--i,0) * 46ms)}
@keyframes slotIn{from{opacity:0;transform:translateZ(-46px)}to{opacity:1;transform:none}}
.slot .card3d{position:absolute;inset:0;border-radius:10px;
  transition:transform .45s var(--ease)}
.slot .plane-art{width:100%;height:100%;object-fit:cover;display:block;background:var(--panel)}
.slot .plane-edge{transform:translateZ(-10px);background:#0a0b0d;
  box-shadow:0 0 0 1px rgba(255,255,255,.06)}
/* The sleeve itself: a translucent film sitting off the art. Its resting Z
   matches its [data-layer], so the plane does not jump on first hover. */
.slot .plane-film{transform:translateZ(15px);
  background:linear-gradient(150deg,rgba(255,255,255,.13),transparent 40%,
  rgba(255,255,255,.05) 72%,transparent);mix-blend-mode:screen;pointer-events:none}
/* Gloss at the front of the stack, sliding across with the cursor. */
.slot .plane-gloss{transform:translateZ(26px);
  background:linear-gradient(112deg,transparent 32%,rgba(255,255,255,.26) 50%,
  transparent 68%);background-size:300% 100%;background-position:var(--mx,50%) center}
.slot .plane-badge{display:flex;align-items:flex-end;justify-content:flex-end;padding:6px;
  pointer-events:none}
.slot .qty{font-size:9.5px;font-weight:600;letter-spacing:-.005em;padding:3px 6px;
  border-radius:5px;color:var(--text-2);background:rgba(8,9,10,.82);
  backdrop-filter:blur(8px);box-shadow:0 0 0 1px var(--line-hi)}
.slot .plane-rim{box-shadow:inset 0 0 0 1px rgba(255,255,255,.12),
  inset 0 1px 0 rgba(255,255,255,.18)}
/* Empty sleeves stay present — the binder is a full grid with gaps — but
   recede, so a filled slot reads as the figure and an empty one as ground. */
.slot.empty{background:rgba(255,255,255,.014);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.045);overflow:hidden}
.slot.empty::after{content:"";position:absolute;inset:0;
  background:repeating-linear-gradient(135deg,rgba(255,255,255,.022) 0 6px,transparent 6px 13px)}

.bnav{display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap}
.bnav a,.bnav span{font-size:12px;font-weight:520;letter-spacing:-.008em;padding:8px 14px;
  border-radius:var(--r-sm);color:var(--text-3);background:var(--glass);
  box-shadow:0 0 0 1px var(--line);
  transition:color .2s var(--ease),background .2s var(--ease),box-shadow .2s var(--ease)}
.bnav a:hover{color:var(--text);background:rgba(255,255,255,.055);
  box-shadow:0 0 0 1px var(--line-hi)}
.bnav .cur{color:var(--text);background:var(--accent-dim);
  box-shadow:0 0 0 1px rgba(113,112,255,.32)}
.bnav .off{opacity:.3;pointer-events:none}
.bnav.sorts{justify-content:flex-start;margin:0 0 20px}
.bnav.pager{margin-top:26px}
@media(max-width:560px){.binder-book{padding:14px 14px 14px 26px}.binder-page{gap:9px}}

/* ================================ stats ================================ */
.wstats{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px;
  margin:0 0 28px}
.wstats .b{position:relative;overflow:hidden;border-radius:var(--r-md);padding:14px 15px;
  background:var(--glass);box-shadow:0 0 0 1px var(--line);
  transition:box-shadow .25s var(--ease),transform .25s var(--ease)}
.wstats .b:hover{box-shadow:var(--sh-2);transform:translateY(-2px)}
.wstats .k{font-size:10px;font-weight:540;letter-spacing:.06em;color:var(--text-4)}
.wstats .v{margin-top:7px;font-size:24px;font-weight:600;letter-spacing:-.034em;line-height:1.05;
  font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.wstats .v.sm{font-size:19px;letter-spacing:-.03em}
.wstats .v .den{color:var(--text-4);font-size:15px;font-weight:520}

.sets{display:grid;grid-template-columns:repeat(auto-fit,minmax(268px,1fr));gap:12px}
.setrow{border-radius:var(--r-md);padding:14px 15px;background:var(--glass);
  box-shadow:0 0 0 1px var(--line);
  transition:box-shadow .25s var(--ease)}
.setrow:hover{box-shadow:0 0 0 1px var(--line-hi)}
.setrow .top{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.setrow .nm{font-size:13.5px;font-weight:560;letter-spacing:-.016em}
.setrow .ct{font-size:11.5px;font-weight:520;color:var(--text-3);
  font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
.setbar{height:5px;border-radius:3px;background:rgba(255,255,255,.06);margin-top:11px;
  overflow:hidden}
/* Width is the real figure so the bar is correct without JavaScript; the
   scaleX keyframe is what animates it in once the row is on screen. */
.setbar i{display:block;height:100%;width:var(--pct,0%);border-radius:3px;transform-origin:0 50%;
  background:linear-gradient(90deg,var(--accent),var(--accent-hi));
  box-shadow:0 0 14px rgba(113,112,255,.5)}
.setrow.in .setbar i{animation:barGrow 1.05s var(--ease) both}
@keyframes barGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.setrow .pc{font-size:11px;font-weight:510;color:var(--text-4);margin-top:7px;
  letter-spacing:-.006em;font-variant-numeric:tabular-nums}

.achv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 32px}
.achv .a{display:grid;grid-template-columns:76px minmax(0,1fr);gap:18px;align-items:center;
  padding:22px 0;border-bottom:1px solid var(--line)}
.a .medal{width:76px;height:84px;object-fit:contain;display:block;filter:grayscale(1) brightness(.62);
  transition:transform .3s var(--ease),filter .3s var(--ease);border-radius:50%}
.a.on .medal{filter:none}.a:hover .medal{transform:translateY(-3px)}
.a .nm{font-size:14px;font-weight:590;letter-spacing:-.018em;color:var(--text);margin:0}
.a .ds{font-size:12px;color:var(--text-3);margin:5px 0 0;line-height:1.55}
.a .achievement-status{display:inline-flex;align-items:center;gap:5px;font-size:10px;letter-spacing:.03em;
  color:var(--text-3);margin-bottom:7px}
.a.on .achievement-status{color:var(--accent-hi)}
.a.grail.on .achievement-status{color:var(--gold)}
.a .pr{display:flex;justify-content:space-between;gap:12px;font-size:11px;color:var(--text-3);
  margin-top:8px;font-variant-numeric:tabular-nums}
.abar{height:4px;border-radius:2px;background:rgba(255,255,255,.07);margin-top:10px;overflow:hidden}
.abar i{display:block;height:100%;width:var(--pct,0%);border-radius:2px;transform-origin:0 50%;
  background:var(--accent)}
.a.in .abar i{animation:barGrow .7s var(--ease) both}
.a.grail.on .abar i{background:var(--gold)}
.collection-nav{display:flex;gap:26px;border-bottom:1px solid var(--line);margin:0 0 28px;
  overflow-x:auto;scrollbar-width:thin}
.collection-nav a{display:flex;align-items:center;gap:8px;min-height:48px;font-size:12px;white-space:nowrap;
  color:var(--text-3);border-bottom:2px solid transparent;transition:color .2s,border-color .2s}
.collection-nav a:hover,.collection-nav a:focus-visible{color:var(--text);border-bottom-color:var(--accent)}
.collection-nav small{font-size:10px;font-variant-numeric:tabular-nums;color:var(--text-4)}
.collection-section{scroll-margin-top:156px}
.collection-heading{display:flex;justify-content:space-between;gap:16px;align-items:baseline;margin:44px 0 20px}
.collection-heading .sec{margin:0}.collection-heading p{font-size:12px;color:var(--text-3);margin:0;text-align:right}
.collection-empty{padding:24px 0 30px;max-width:520px}
.collection-empty h3{font-size:21px;letter-spacing:-.025em;margin:0 0 9px}
.collection-empty p{font-size:13px;color:var(--text-3);line-height:1.7;margin:0 0 16px}
.collection-empty a,.setrow .pc a{color:var(--accent-hi);font-weight:550}
.collection-empty a{display:inline-flex;align-items:center;min-height:44px}
.setrow .pc{display:flex;justify-content:space-between;gap:12px}
.bnav button{font:inherit;font-size:12px;padding:8px 14px;border-radius:var(--r-sm);border:0;
  color:var(--text-4);background:var(--glass);box-shadow:0 0 0 1px var(--line);min-height:44px}
.bnav button:disabled{cursor:default;opacity:.5}.bnav a{min-height:44px;display:inline-flex;align-items:center}
.binder-caption{text-align:center;color:var(--text-3);font-size:12px;margin:18px 0 0}
.wallet-chip{margin-bottom:18px}.collection-nav{margin-bottom:16px}
.collection-nav+.wstats{margin:16px 0 22px}.collection-nav+.wstats .b{padding-top:18px;padding-bottom:18px}
.collection-nav+.wstats .v{margin-top:9px}
@media(max-width:680px){.achv{grid-template-columns:1fr}.collection-nav{gap:22px}.collection-heading{align-items:flex-start;flex-direction:column;gap:7px}.collection-heading p{text-align:left}}
@media(prefers-reduced-motion:reduce){.a .medal,.collection-nav a{transition:none}.a:hover .medal{transform:none}.a.in .abar i{animation:none}}

.dupes{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
/* Match the catalog's quieter framing while retaining the binder geometry. */
.feed{gap:0}.rip{border-radius:0;background:none;box-shadow:0 1px 0 var(--line);padding:20px 8px}
.rip:hover{background:var(--glass);transform:none;box-shadow:0 1px 0 var(--line-hi)}
.rip.notable{box-shadow:0 1px 0 var(--line);background:none}
.rip.major{border-radius:10px;margin:10px 0;background:rgba(245,196,81,.025);box-shadow:0 0 0 1px rgba(245,196,81,.2)}
.wstats{gap:0;box-shadow:0 -1px 0 var(--line),0 1px 0 var(--line);margin:26px 0 30px}
.wstats .b{border-radius:0;padding:24px 16px;background:none;box-shadow:none}
.wstats .b:hover{box-shadow:none;transform:none}.wstats .k{font-size:9px}.wstats .v{margin-top:12px}
.wallet-chip{overflow-wrap:anywhere;max-width:100%}
@media(max-width:640px){
 .wstats{grid-template-columns:repeat(2,minmax(0,1fr))}.wstats .b{padding:20px 10px}.wstats .v{font-size:21px}
 .rip{padding:16px 4px}.rip .nm{font-size:14px}.rip .who{font-size:10px}.rip .val{font-size:14px}
 .rip.major{padding:16px 10px}.tag{font-size:8px;margin-left:0;margin-top:4px}
 .sets{grid-template-columns:1fr}.bnav a,.bnav span{min-height:44px;display:inline-flex;align-items:center}
}

</style>`;

/* ------------------------------------------------------------------ *
 * Live feed (spec §12)
 * ------------------------------------------------------------------ */

const PROMINENCE_TAG: Record<string, string> = {
  major: '<span class="tag gold">MAJOR PULL</span>',
  notable: '<span class="tag em">NOTABLE</span>',
};

function feedRow(e: FeedEvent, now: Date): string {
  const href = `/pokemon/${encodeURIComponent(e.card.setId)}/${encodeURIComponent(e.card.number)}`;
  return `<a class="card rip ${esc(e.prominence)}" href="${href}" data-reveal data-spotlight>
  <div class="thumb scene scene-near">
    <div class="card3d depth" data-depth="1.15">
      <span class="plane plane-edge" aria-hidden="true"></span>
      <img class="plane plane-art" src="${esc(e.card.imageSmall)}" alt="${esc(
        e.card.name,
      )}" loading="lazy" decoding="async">
      <span class="plane plane-rim" data-layer="2" aria-hidden="true"></span>
      <span class="plane plane-gloss" data-layer="18" aria-hidden="true"></span>
    </div>
  </div>
  <div>
    <div class="who"><span class="mono">${esc(e.wallet)}</span> just ripped</div>
    <div class="nm">${esc(e.card.name)}${PROMINENCE_TAG[e.prominence] ?? ''}</div>
    <div class="sub">${esc(e.variant.label.toUpperCase())} · ${esc(
      (e.card.rarity ?? '').toUpperCase(),
    )} · from ${esc(e.packName)}</div>
  </div>
  <div class="right">
    <div class="val">${money(e.referenceValue, e.currency)}</div>
    <div class="when">${esc(relativeTime(e.openedAt, now))}</div>
  </div>
</a>`;
}

export function livePage(feed: FeedResult, now: Date): string {
  const shown = feed.events.length;

  const body = `
<div class="live-head" data-reveal>
  <span class="live-chip"><span class="pulse-dot"></span>LIVE</span>
  <span class="live-count"><b class="mono" data-count="${shown}">${shown}</b> rip${
    shown === 1 ? '' : 's'
  } shown</span>
</div>
<h1 class="page" data-reveal>Live Rips</h1>
<p class="lede" data-reveal>Every pack opened on RIPDEX, newest first. Values are
  <b>what the card was worth at the moment it was pulled</b>, not what it is worth today.</p>

<div class="feed-refresh" data-reveal><p id="feed-update" role="status">Snapshot of the latest pulls. Refresh when you’re ready.</p><button type="button" class="reset" id="refresh-feed">Refresh feed ↻</button></div>

${
  feed.events.length === 0
    ? '<div class="empty-state">No rips yet.</div>'
    : `<div class="feed" data-reveal-group="55">${feed.events
        .map((e) => feedRow(e, now))
        .join('')}</div>`
}
${
  feed.skipped > 0
    ? `<p class="drift"><b>${feed.skipped} rip${feed.skipped > 1 ? 's are' : ' is'} hidden</b> —
       the pulled card is no longer in the catalog. Re-run pokemon:sync:cards.</p>`
    : ''
}

<script>
document.getElementById('refresh-feed').addEventListener('click', () => location.reload());
setTimeout(() => { document.getElementById('feed-update').textContent = 'New pulls may be available. Refresh to see the latest.'; }, 30000);
</script>`;

  return layout('Live Rips — RIPDEX', '/live', body, WALLET_CSS);
}

/* ------------------------------------------------------------------ *
 * Collection binder (spec §13, §14, §15)
 * ------------------------------------------------------------------ */

/**
 * One binder sleeve.
 *
 * A filled sleeve is a stack of planes, not an image: the card's own thickness
 * sits behind the art, a rim light on top of it, then the sleeve film and a
 * gloss further forward. [data-depth] rotates the stack under the cursor and
 * counter-drifts each [data-layer], which is what makes it read as a card in a
 * sleeve rather than a picture that spins.
 *
 * `index` comes from `Array.prototype.map`, and only staggers the entrance.
 */
function slot(entry: CollectionEntry | null, index: number): string {
  if (!entry) return `<div class="slot empty" style="--i:${index}" aria-hidden="true"></div>`;
  const href = `/pokemon/${encodeURIComponent(entry.card.setId)}/${encodeURIComponent(
    entry.card.number,
  )}`;
  return `<a class="slot" style="--i:${index}" href="${href}" title="${esc(
    entry.card.name,
  )} — ${esc(entry.variant.label)}">
  <div class="card3d depth" data-depth="0.95">
    <span class="plane plane-edge" aria-hidden="true"></span>
    <img class="plane plane-art" src="${esc(entry.card.imageSmall)}" alt="${esc(
      entry.card.name,
    )}" loading="lazy" decoding="async">
    <span class="plane plane-rim" data-layer="2" aria-hidden="true"></span>
    <span class="plane plane-film" data-layer="15" aria-hidden="true"></span>
    <span class="plane plane-gloss" data-layer="26" aria-hidden="true"></span>
    ${
      entry.count > 1
        ? `<span class="plane plane-badge" data-layer="34"><i class="qty">×${entry.count}</i></span>`
        : ''
    }
  </div>
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

/** Keep unknown targets indeterminate; zero is never a completed collection. */
function progressDisplay(current: number, target: number) {
  const known = Number.isFinite(target) && target > 0;
  const value = Number.isFinite(current) ? Math.max(0, current) : 0;
  const bounded = known ? Math.min(target, value) : 0;
  return {
    percent: known ? (Math.floor(Math.min(100, (bounded / target) * 100) * 10) / 10).toFixed(1) : '0.0',
    attributes: known
      ? `aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${bounded}"`
      : 'aria-valuetext="Progress unavailable"',
    label: known ? `${bounded.toLocaleString()} / ${target.toLocaleString()}` : 'Progress unavailable',
  };
}

function achievementRow(a: AchievementStatus): string {
  // GRAIL_HUNTER is the only shipped definition that requires PullTier.Grail.
  // Names and other rarity/value achievements do not establish a Grail pull.
  const grail = a.def.id === 'GRAIL_HUNTER';
  const progress = progressDisplay(a.progress.current, a.progress.target);
  return `<div class="a${a.unlocked ? ' on' : ''}${grail ? ' grail' : ''}" data-achievement="${esc(a.def.id)}" data-reveal style="--pct:${progress.percent}%">
    <img class="medal" src="/art/achievements/${grail ? 'grail-puller' : 'medal-base'}.png" alt="" width="76" height="84" loading="lazy" decoding="async">
    <div>
      <div class="achievement-status"><span aria-hidden="true">${a.unlocked ? '✓' : '○'}</span> ${a.unlocked ? 'Unlocked' : 'Locked'}</div>
      <h3 class="nm">${esc(a.def.name)}</h3>
      <p class="ds">${esc(a.def.description)}</p>
      <div class="abar" role="progressbar" aria-label="${esc(a.def.name)} progress" ${progress.attributes}><i></i></div>
      <div class="pr">${progress.label}</div>
    </div>
  </div>`;
}

export function collectionPage(input: CollectionPageInput): string {
  const {
    wallet, stats, page, pageCount, pageNumber, sort, completion, duplicates, achievements,
  } = input;

  const q = (n: number) => `/collection/${encodeURIComponent(wallet)}?page=${n}&sort=${encodeURIComponent(sort)}#binder`;
  const sortLink = (s: string, label: string) =>
    `<a href="/collection/${encodeURIComponent(wallet)}?sort=${s}#binder"${
      sort === s ? ' class="cur" aria-current="true"' : ''
    }>${label}</a>`;

  const unlocked = achievements.filter((a) => a.unlocked).length;
  const empty = !page || input.uniqueVariants === 0;
  const binderPages = Number.isFinite(pageCount) ? Math.max(1, Math.floor(pageCount)) : 1;
  const currentPage = Number.isFinite(pageNumber) ? Math.min(binderPages, Math.max(1, Math.floor(pageNumber))) : 1;

  const body = `
<div class="eyebrow" data-reveal>THE BINDER</div>
<h1 class="page" data-reveal>Binder</h1>
<div class="wallet-chip" data-reveal>WALLET <span class="mono">${esc(wallet)}</span></div>

<nav class="collection-nav" aria-label="Collection sections">
  <a href="#binder">Binder <small>${input.uniqueVariants.toLocaleString()}</small></a>
  <a href="#set-completion">Set completion <small>${completion.length}</small></a>
  <a href="#achievements">Achievements <small>${unlocked} / ${achievements.length}</small></a>
  <a href="#duplicates">Duplicates <small>${duplicates.totalDuplicates.toLocaleString()}</small></a>
</nav>

<div class="wstats" data-reveal-group="60">
  <div class="b" data-reveal><div class="k">RIPS</div>
    <div class="v" data-count="${stats.rips}">${stats.rips.toLocaleString()}</div></div>
  <div class="b" data-reveal><div class="k">UNIQUE VARIANTS</div>
    <div class="v" data-count="${input.uniqueVariants}">${input.uniqueVariants.toLocaleString()}</div></div>
  <div class="b" data-reveal><div class="k">TOTAL PULLED VALUE</div>
    <div class="v" data-count="${stats.totalReferenceValue}" data-count-dp="2" data-count-prefix="$">${money(
      stats.totalReferenceValue,
    )}</div></div>
  <div class="b" data-reveal><div class="k">BEST PULL</div><div class="v sm">${
    stats.bestPull ? money(stats.bestPull.card.referenceValue) : '—'
  }</div></div>
  <div class="b" data-reveal><div class="k">ACHIEVEMENTS</div>
    <div class="v sm"><span data-count="${unlocked}">${unlocked}</span><span class="den"> / ${
      achievements.length
    }</span></div></div>
</div>

<section id="binder" class="collection-section" aria-label="Binder pages">
${empty ? `<div class="collection-empty" data-reveal><h3>Your binder is ready.</h3><p>Cards collected by this wallet will appear here, with each finish and printing in its own sleeve. Explore the Pokédex to see the available cards.</p><a href="/cards">Explore the Pokédex <span aria-hidden="true">&nbsp;↗</span></a></div>` : ''}
<nav class="bnav sorts" aria-label="Sort binder" data-reveal>
  ${sortLink('set', 'BY SET')}${sortLink('value', 'BY VALUE')}${sortLink('pull-date', 'BY PULL DATE')}${sortLink('rarity', 'BY RARITY')}
</nav>

${
  page
    ? `<div class="binder-wrap" data-reveal>
  <div class="scene binder-scene">
    <div class="binder-stage grounded">
      <div class="binder-book depth">
        <div class="binder-spine" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="binder-page">${page.slots.map(slot).join('')}</div>
      </div>
    </div>
  </div>
</div>
<p class="binder-caption">${page.filled} of ${page.slots.length} sleeves filled on this page</p>
<nav class="bnav pager" aria-label="Binder pagination">
  ${currentPage <= 1 ? '<button type="button" disabled aria-label="Previous binder page">← TURN BACK</button>' : `<a href="${q(currentPage - 1)}" rel="prev" aria-label="Previous binder page">← TURN BACK</a>`}
  <span class="cur" aria-current="page">PAGE ${currentPage} OF ${binderPages}</span>
  ${currentPage >= binderPages ? '<button type="button" disabled aria-label="Next binder page">TURN PAGE →</button>' : `<a href="${q(currentPage + 1)}" rel="next" aria-label="Next binder page">TURN PAGE →</a>`}
</nav>`
    : ''
}
</section>

<section id="set-completion" class="collection-section" aria-labelledby="set-completion-title">
<div class="collection-heading"><h2 class="sec" id="set-completion-title">SET COMPLETION</h2><p>Distinct cards owned, across every finish and printing.</p></div>
${
  completion.length
    ? `<div class="sets" data-reveal-group="50">${completion
        .map((c) => {
          const progress = progressDisplay(c.collected, c.total);
          return `<div class="setrow" data-reveal style="--pct:${progress.percent}%">
    <div class="top"><span class="nm">${esc(c.setName)}</span>
      <span class="ct">${progress.label}</span></div>
    <div class="setbar" role="progressbar" aria-label="${esc(c.setName)} collection progress" ${progress.attributes}><i></i></div>
    <div class="pc"><span>${c.total > 0 ? `${progress.percent}% complete` : 'No catalog target'}</span><a href="/cards?setId=${encodeURIComponent(c.setId)}">View set ↗</a></div>
  </div>`;
        })
        .join('')}</div>`
    : '<p class="lede">Set progress appears here when this wallet has collected cards.</p>'
}
</section>

<section id="achievements" class="collection-section" aria-labelledby="achievements-title">
<div class="collection-heading"><h2 class="sec" id="achievements-title">ACHIEVEMENTS</h2><p>${unlocked} of ${achievements.length} unlocked</p></div>
<div class="achv" data-reveal-group="45">
  ${achievements.length ? achievements.map(achievementRow).join('') : '<p class="lede">No achievements are available yet.</p>'}
</div>
</section>

<section id="duplicates" class="collection-section" aria-labelledby="duplicates-title">
<div class="collection-heading"><h2 class="sec" id="duplicates-title">DUPLICATES</h2><p>Extra copies of the same finish and printing.</p></div>
${
  duplicates.entries.length === 0
    ? '<p class="lede">No extra copies in this wallet. Different finishes and printings remain separate binder entries.</p>'
    : `<p class="lede" data-reveal>${duplicates.totalDuplicates} spare
       ${duplicates.totalDuplicates === 1 ? 'copy' : 'copies'}, worth
       <b>${money(duplicates.totalValue)}</b> combined at the values they were pulled at.</p>
<div class="dupes" data-reveal-group="40">${duplicates.entries
        .slice(0, 24)
        .map(
          (e) => `<a class="tile" href="/pokemon/${encodeURIComponent(
            e.card.setId,
          )}/${encodeURIComponent(e.card.number)}" data-reveal data-tilt="0.7">
    <div class="shot"><img src="${esc(e.card.imageSmall)}" alt="${esc(e.card.name)}" loading="lazy">
      <span class="vcount">×${e.count}</span></div>
    <div class="meta"><div class="nm">${esc(e.card.name)}</div>
      <div class="sub">${esc(e.variant.label)}</div>
      <div class="val">${money(e.bestReferenceValue)}</div></div>
  </a>`,
        )
        .join('')}</div>`
}
</section>`;

  return layout(`Binder — ${wallet} — RIPDEX`, '', body, WALLET_CSS);
}
