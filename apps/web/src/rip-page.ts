/**
 * The rip experience, wired to the real engine (spec §6, §7, §20, §21).
 *
 * The standalone demo drew from a pool hardcoded in the page. This one asks the
 * server, which runs the actual §17 sequence — frozen snapshot, committed seed,
 * openPack — and records the result to the ledger. The outcome is therefore
 * already determined and already recorded before a single pixel of the reveal
 * animation runs, which is the only ordering that makes the reveal honest: the
 * animation is a presentation of a settled fact, not part of deciding it.
 *
 * ---------------------------------------------------------------------------
 * Styling notes
 *
 * This page does not go through layout(): it owns the whole viewport, kills
 * scrolling and runs its own choreography, so it carries a local copy of the
 * design.ts tokens and of the handful of 3D primitives it uses (.scene, .depth,
 * .plane, .grounded, .floaty). The values are copied verbatim — if design.ts
 * moves, this file moves with it rather than drifting into a second palette.
 *
 * It does import MOTION_JS, because the pointer-driven depth handler, the tilt
 * handler and the reveal observer are behaviour, not styling, and there is no
 * reason to ship a second implementation of them. The rip choreography below is
 * a separate module script; MOTION_JS is a classic script that runs at parse
 * time, so window.RIPDEX_MOTION exists well before the module executes.
 *
 * Two class names are load-bearing and deliberately NOT the design.ts ones:
 *   .step   the five full-screen states (select / roll / tear / card / error).
 *           design.ts spends .scene on the 3D camera, and this page needs the
 *           camera far more than it needs the name.
 *   .grain  stays the *card's* film grain, inside the front face. The page-wide
 *           grain is .filmgrain, because a position:fixed .grain would drag the
 *           card's own grain plane out of the card.
 */

import type { CardListing, PackConfig } from '../../../packages/pokemon-core/src/index.ts';
import { esc } from './render.ts';
import { MOTION_JS } from './design.ts';

const RIP_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..700&display=swap');

/* ============================== tokens ==============================
   Copied from design.ts. One accent (violet). Gold is reserved for
   grail-tier VALUE and for the grail takeover, never for a control. */
:root{
  --bg:#08090a;
  --panel:#0f1011;
  --elevated:#191a1b;

  --text:#f7f8f8;
  --text-2:#d0d6e0;
  --text-3:#8a8f98;
  --text-4:#62666d;

  --accent:#7170ff;
  --accent-hi:#828fff;
  --accent-dim:rgba(113,112,255,.14);

  --line:rgba(255,255,255,0.06);
  --line-hi:rgba(255,255,255,0.10);
  --line-max:rgba(255,255,255,0.18);
  --glass:rgba(255,255,255,0.03);

  --ease:cubic-bezier(0.16, 1, 0.3, 1);
  --spring:cubic-bezier(0.34, 1.4, 0.64, 1);

  /* Semantic only. */
  --gold:#f5c451;
  --em:#4ade9b;
  --danger:#ff8f8f;

  --r-sm:8px; --r-md:12px; --r-lg:16px; --r-xl:22px;

  --sh-1:0 0 0 1px var(--line), 0 2px 4px rgba(0,0,0,.3), 0 12px 32px rgba(0,0,0,.2);
  --sh-2:0 0 0 1px var(--line-hi), 0 4px 8px rgba(0,0,0,.4), 0 20px 48px rgba(0,0,0,.3);
  --sh-3:0 0 0 1px var(--line-hi), 0 8px 16px rgba(0,0,0,.5), 0 40px 90px rgba(0,0,0,.45);

  --card-w:min(66vw,332px);
  --card-ar:734/1024;
}
/* Short viewports: the whole sequence has to fit without scrolling, because
   the body cannot scroll during a drag-to-tear. */
@media(max-height:780px){:root{--card-w:min(56vw,268px)}}
@media(max-height:640px){:root{--card-w:min(48vw,224px)}}

*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);overflow:hidden;overscroll-behavior:none;
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  font-feature-settings:"cv01","ss03";
  font-weight:510;font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}
::selection{background:rgba(113,112,255,.32)}
.mono{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  font-variant-numeric:tabular-nums;letter-spacing:-.02em}

/* ========================== gradient mesh ==========================
   Fixed, heavily blurred, slow. The page breathes without anything on it
   moving — which matters here, where every moving thing is choreography. */
.mesh{position:fixed;inset:-30vmax;z-index:0;pointer-events:none;filter:blur(100px);opacity:.4}
.mesh i{position:absolute;display:block;border-radius:50%;mix-blend-mode:screen}
.mesh i:nth-child(1){width:62vmax;height:62vmax;left:-12%;top:-20%;
  background:radial-gradient(circle,rgba(113,112,255,.62),transparent 62%);
  animation:mesh1 38s var(--ease) infinite alternate}
.mesh i:nth-child(2){width:54vmax;height:54vmax;right:-14%;top:-8%;
  background:radial-gradient(circle,rgba(64,90,255,.42),transparent 64%);
  animation:mesh2 46s var(--ease) infinite alternate}
.mesh i:nth-child(3){width:52vmax;height:52vmax;left:20%;bottom:-28%;
  background:radial-gradient(circle,rgba(150,90,255,.34),transparent 66%);
  animation:mesh3 56s var(--ease) infinite alternate}
.mesh i:nth-child(4){width:38vmax;height:38vmax;right:4%;bottom:-18%;
  background:radial-gradient(circle,rgba(40,180,220,.20),transparent 66%);
  animation:mesh4 64s var(--ease) infinite alternate}
@keyframes mesh1{to{transform:translate3d(16vmax,12vmax,0) scale(1.2)}}
@keyframes mesh2{to{transform:translate3d(-18vmax,14vmax,0) scale(1.12)}}
@keyframes mesh3{to{transform:translate3d(12vmax,-16vmax,0) scale(1.24)}}
@keyframes mesh4{to{transform:translate3d(-10vmax,-12vmax,0) scale(1.16)}}

.filmgrain{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.12;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/></filter><rect width='140' height='140' filter='url(%23n)' opacity='.55'/></svg>");
  animation:grainShift 8s steps(6) infinite}
@keyframes grainShift{
  0%{transform:translate(0,0)}20%{transform:translate(-3%,2%)}40%{transform:translate(2%,-3%)}
  60%{transform:translate(-2%,-2%)}80%{transform:translate(3%,1%)}100%{transform:translate(0,0)}}

/* ============================== chrome ============================= */
#chrome{position:fixed;inset:14px 18px auto;z-index:6;display:flex;justify-content:space-between;
  align-items:center;font-size:11.5px;font-weight:520;letter-spacing:.01em;color:var(--text-3);
  transition:opacity .6s var(--ease)}
#chrome.hide{opacity:0;pointer-events:none}
.brand{display:flex;align-items:center;gap:9px;color:var(--text);font-weight:640;
  font-size:14px;letter-spacing:-.02em}
.brand .dot{width:16px;height:16px;border-radius:5px;flex:0 0 auto;
  background:linear-gradient(140deg,var(--accent-hi),var(--accent) 52%,#4b47c9);
  box-shadow:0 0 0 1px rgba(255,255,255,.1),0 0 18px rgba(113,112,255,.55);
  animation:brandPulse 4s var(--ease) infinite}
@keyframes brandPulse{
  0%,100%{box-shadow:0 0 0 1px rgba(255,255,255,.1),0 0 18px rgba(113,112,255,.5)}
  50%{box-shadow:0 0 0 1px rgba(255,255,255,.14),0 0 26px rgba(113,112,255,.8)}}
.odds-link{padding:6px 11px;border-radius:100px;color:var(--text-3);
  box-shadow:0 0 0 1px var(--line);background:var(--glass);
  transition:color .2s var(--ease),box-shadow .2s var(--ease)}
.odds-link:hover{color:var(--text);box-shadow:0 0 0 1px var(--line-hi)}

/* ============================== stages ============================= */
#stage{position:relative;z-index:2;height:100vh;height:100dvh;display:grid;place-items:center;padding:20px}
.step{position:absolute;inset:0;display:grid;place-items:center;padding:20px;
  opacity:0;visibility:hidden;transform:translateY(12px);
  transition:opacity .45s var(--ease),transform .6s var(--ease),visibility .45s}
.step.on{opacity:1;visibility:visible;transform:none}
/* The content wrapper rides above the ember layer. The :not() matters: a bare
   .step>div also matches .embers, and a *type* selector outranks its class, so
   the ember field would be forced back to position:relative and collapse to a
   zero-size grid item with nothing in it. */
.step>div:not(.embers){position:relative;z-index:1}

/* ============================ typography =========================== */
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:540;
  letter-spacing:.03em;color:var(--accent-hi);padding:5px 12px;border-radius:100px;
  background:var(--accent-dim);box-shadow:0 0 0 1px rgba(113,112,255,.2)}
.pulse-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent-hi);
  box-shadow:0 0 0 0 rgba(113,112,255,.6);animation:pulseRing 2.2s var(--ease) infinite}
@keyframes pulseRing{
  0%{box-shadow:0 0 0 0 rgba(113,112,255,.55)}
  70%{box-shadow:0 0 0 9px rgba(113,112,255,0)}
  100%{box-shadow:0 0 0 0 rgba(113,112,255,0)}}
h1.ttl{margin:14px 0 0;font-weight:590;letter-spacing:-.042em;line-height:1.0;
  font-size:clamp(1.75rem,5.2vw,2.75rem);
  background:linear-gradient(176deg,var(--text) 30%,#98a0af 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.label{font-size:10px;font-weight:540;letter-spacing:.06em;color:var(--text-4)}
.center{text-align:center}

/* ============================== real 3D ============================
   .scene is the camera; .depth is a 3D context whose [data-layer] planes sit
   at different Z and counter-drift as the parent turns. That parallax between
   planes is the difference between an object and a rotated picture. */
.scene{perspective:1400px;perspective-origin:50% 45%}
.scene-near{perspective:900px}
.depth{transform-style:preserve-3d;will-change:transform;transition:transform .5s var(--ease)}
[data-layer]{transform-style:preserve-3d;will-change:transform}

/* Contact shadow on the ground plane rather than on the object, so it spreads
   as the object lifts instead of travelling with it. */
.grounded{position:relative}
.grounded::after{content:"";position:absolute;left:9%;right:9%;bottom:-6%;height:13%;
  border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.66),transparent 70%);
  filter:blur(16px);transition:all .5s var(--ease);z-index:-1}
.grounded:hover::after{left:15%;right:15%;bottom:-10%;filter:blur(22px);opacity:.85}

@keyframes floatY{
  0%,100%{transform:translate3d(0,0,0)}
  50%{transform:translate3d(0,calc(var(--float-amp,10px) * -1),0)}}
.floaty{animation:floatY var(--float-dur,7s) var(--ease) infinite;
  animation-delay:var(--float-delay,0s)}

[data-reveal]{opacity:0;transform:perspective(1000px) translateY(24px) rotateX(6deg) scale(.985);
  transition:opacity .8s var(--ease),transform .8s var(--ease);transition-delay:var(--d,0ms)}
[data-reveal].in{opacity:1;transform:none}
[data-reveal-3d]{opacity:0;
  transform:perspective(1200px) translateY(44px) rotateX(26deg) scale(.94);
  transform-origin:50% 100%;
  transition:opacity .9s var(--ease),transform .9s var(--ease);transition-delay:var(--d,0ms)}
[data-reveal-3d].in{opacity:1;transform:none}
/* If the runtime never runs, the page must still be a complete page. */
.no-motion [data-reveal],.no-motion [data-reveal-3d]{opacity:1!important;transform:none!important}

/* ============================ ember field ==========================
   A dozen absolutely-positioned motes on staggered keyframes. No canvas, no
   permanent rAF loop — the compositor owns all of it. */
.embers{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.embers i{position:absolute;bottom:-4%;width:3px;height:3px;border-radius:50%;
  background:var(--accent-hi);box-shadow:0 0 10px 2px rgba(113,112,255,.5);opacity:0;
  animation:ember var(--ed,15s) linear var(--edl,0s) infinite}
@keyframes ember{
  0%{opacity:0;transform:translate3d(0,0,0) scale(.5)}
  9%{opacity:.85}
  62%{opacity:.42}
  100%{opacity:0;transform:translate3d(var(--edx,20px),-92vh,0) scale(1.3)}}
.embers i:nth-child(3n){background:#d3d7ff;box-shadow:0 0 9px 2px rgba(200,204,255,.38)}
.embers i:nth-child(4n){width:2px;height:2px}
.embers i:nth-child(7n){width:4px;height:4px;opacity:0;filter:blur(.4px)}
.embers i:nth-child(1){left:5%;--ed:16s;--edl:0s;--edx:32px}
.embers i:nth-child(2){left:14%;--ed:21s;--edl:-4s;--edx:-24px}
.embers i:nth-child(3){left:22%;--ed:13s;--edl:-9s;--edx:18px}
.embers i:nth-child(4){left:29%;--ed:24s;--edl:-2s;--edx:-40px}
.embers i:nth-child(5){left:37%;--ed:18s;--edl:-13s;--edx:26px}
.embers i:nth-child(6){left:44%;--ed:15s;--edl:-6s;--edx:-16px}
.embers i:nth-child(7){left:52%;--ed:26s;--edl:-17s;--edx:34px}
.embers i:nth-child(8){left:59%;--ed:12s;--edl:-3s;--edx:-28px}
.embers i:nth-child(9){left:66%;--ed:19s;--edl:-11s;--edx:22px}
.embers i:nth-child(10){left:73%;--ed:23s;--edl:-7s;--edx:-34px}
.embers i:nth-child(11){left:81%;--ed:14s;--edl:-15s;--edx:30px}
.embers i:nth-child(12){left:88%;--ed:20s;--edl:-1s;--edx:-20px}
.embers i:nth-child(13){left:94%;--ed:17s;--edl:-19s;--edx:14px}
.embers i:nth-child(14){left:10%;--ed:28s;--edl:-22s;--edx:-12px}

/* =============================== pack ==============================
   Built from stacked planes: a slab behind the body for thickness, the art,
   a holo sheen, a rim, the perforated seal and the label riding highest. */
.pack-hold{position:relative;width:var(--card-w);aspect-ratio:var(--card-ar);margin:30px auto 0}
.pack{position:absolute;inset:0;cursor:pointer}
.pack .plane{position:absolute;inset:0;border-radius:15px;backface-visibility:hidden}
/* The slab is the wrapper's THICKNESS: it has to sit 5px proud of the body on
   every side or the whole point of putting it at Z-18 is lost — perspective
   shrinks a plane that far back to 98.7% of the body, so a coincident slab is
   swallowed whole by .pk-base and the pack reads as one flat sheet again.
   Qualified with .pack because a bare .pk-slab loses to .pack .plane above and
   its inset silently does nothing. */
.pack .pk-slab{inset:-5px;border-radius:17px;
  background:linear-gradient(160deg,#22213d,#13131f 46%,#0a0a11);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.07),0 34px 76px -30px rgba(0,0,0,.95)}
.pk-base{overflow:hidden;
  background:linear-gradient(158deg,#17162c 0%,#101024 38%,#0a0a12 100%)}
.pack-hero{position:absolute;inset:0;background-size:178%;background-position:50% 24%;opacity:.58;
  filter:saturate(1.05) contrast(1.06)}
.pack-hero::after{content:"";position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(8,9,18,.44),rgba(7,8,14,.88) 70%,#07080e)}
.pk-sheen{overflow:hidden;pointer-events:none;mix-blend-mode:screen}
.pk-sheen::after{content:"";position:absolute;inset:-20%;
  background:linear-gradient(74deg,transparent 32%,rgba(113,112,255,.34) 46%,rgba(255,255,255,.62) 50%,rgba(150,140,255,.32) 55%,transparent 70%);
  transform:translateX(-120%);animation:sweep 4.8s var(--ease) infinite}
@keyframes sweep{0%,56%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
.pk-rim{pointer-events:none;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.10),inset 0 1px 0 rgba(255,255,255,.18),
    inset 0 -24px 40px -24px rgba(113,112,255,.5)}
.pack-top{position:absolute;top:0;left:0;right:0;height:27px;border-radius:15px 15px 0 0;
  background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.01));
  box-shadow:inset 0 -1px 0 rgba(255,255,255,.12)}
.pack-top::after{content:"";position:absolute;left:5%;right:5%;bottom:0;height:1px;
  background:repeating-linear-gradient(90deg,rgba(255,255,255,.34) 0 4px,transparent 4px 9px)}
.pack-label{position:absolute;left:0;right:0;bottom:0;padding:16px 14px 18px;text-align:center}
.pack-label .nm{font-size:clamp(14px,3.9vw,18px);font-weight:590;letter-spacing:-.028em;
  line-height:1.05;text-shadow:0 2px 20px rgba(0,0,0,.9)}
.pack-label .sub{margin-top:5px;font-size:9.5px;font-weight:540;letter-spacing:.06em;
  color:var(--accent-hi)}
/* Resting Z. Only the pointer-driven pack gets depth; the tear pack stays flat
   so the tear strip, which is not in its 3D context, never detaches from it. */
[data-depth] .pk-slab{transform:translateZ(-18px)}
[data-depth] .pk-base{transform:translateZ(0)}
[data-depth] .pk-sheen{transform:translateZ(14px)}
[data-depth] .pk-rim{transform:translateZ(16px)}
[data-depth] .pack-top{transform:translateZ(24px)}
[data-depth] .pack-label{transform:translateZ(32px)}

/* ============================== specs ============================== */
.specs{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin:26px auto 0;
  border-radius:var(--r-md);overflow:hidden;background:var(--line);
  box-shadow:0 0 0 1px var(--line);width:min(94vw,392px)}
.spec{padding:11px 12px 12px;background:rgba(15,16,17,.72);backdrop-filter:blur(14px);text-align:center}
.spec .k{font-size:9.5px;font-weight:540;letter-spacing:.06em;color:var(--text-4)}
.spec .v{margin-top:5px;font-size:14px;font-weight:600;letter-spacing:-.022em;color:var(--text)}
.spec .v.g{color:var(--gold)}
.spec .u{font-size:10px;font-weight:520;color:var(--text-4);letter-spacing:0}

/* ============================== buttons ============================ */
.cta{display:flex;align-items:center;justify-content:center;gap:9px;width:max-content;
  margin:24px auto 0;height:50px;padding:0 30px;border-radius:10px;
  font-size:14px;font-weight:560;letter-spacing:-.011em;
  background:var(--accent);color:#fff;
  box-shadow:0 0 0 1px rgba(255,255,255,.09) inset,0 1px 2px rgba(0,0,0,.4),
    0 12px 34px -12px rgba(113,112,255,.9);
  transition:background .2s var(--ease),box-shadow .2s var(--ease),transform .18s var(--spring)}
.cta:hover{background:var(--accent-hi);
  box-shadow:0 0 0 1px rgba(255,255,255,.14) inset,0 2px 4px rgba(0,0,0,.4),
    0 18px 46px -12px rgba(113,112,255,1)}
.cta:active{transform:scale(.975)}
.cta[disabled]{opacity:.5;cursor:default;transform:none}
.cta .kbd{font-size:11px;font-weight:520;opacity:.72;letter-spacing:.02em}
.ghost{display:block;width:max-content;margin:14px auto 0;font-size:12px;font-weight:510;
  letter-spacing:-.008em;color:var(--text-4);transition:color .2s var(--ease)}
.ghost:hover{color:var(--text-2)}

/* =========================== rolling card ==========================
   Not a spinner: candidate silhouettes are dealt toward the camera and
   discarded behind a frosted plate, so the wait reads as a decision being
   made rather than a progress bar being filled. */
.roller{position:relative;width:var(--card-w);aspect-ratio:var(--card-ar);margin:0 auto 30px;
  perspective:900px;perspective-origin:50% 45%}
.deck{position:absolute;inset:0;transform-style:preserve-3d}
.deck i{position:absolute;inset:0;border-radius:14px;opacity:0;
  background:linear-gradient(165deg,rgba(255,255,255,.11),rgba(255,255,255,.03));
  box-shadow:0 0 0 1px var(--line-hi);
  animation:deal 2.6s var(--ease) infinite;animation-delay:calc(var(--i,0) * -.371s)}
.deck i::before{content:"";position:absolute;left:9%;right:9%;top:7.5%;height:52%;border-radius:7px;
  background:rgba(255,255,255,.09);box-shadow:inset 0 0 0 1px var(--line-hi)}
.deck i::after{content:"";position:absolute;left:9%;width:46%;bottom:15%;height:6.5%;border-radius:4px;
  background:rgba(255,255,255,.12)}
@keyframes deal{
  0%{opacity:0;transform:translate3d(0,28px,-280px) rotateY(-17deg) scale(.94)}
  20%{opacity:.85}
  60%{opacity:.5}
  100%{opacity:0;transform:translate3d(0,-20px,96px) rotateY(13deg) scale(1.04)}}
.plate{position:absolute;inset:0;border-radius:14px;overflow:hidden;
  background:linear-gradient(180deg,rgba(11,12,18,.40),rgba(8,9,12,.70));
  backdrop-filter:blur(2px);
  box-shadow:0 0 0 1px var(--line-hi),inset 0 -70px 60px -60px rgba(113,112,255,.5),
    0 30px 70px -30px rgba(0,0,0,.9)}
.plate::after{content:"";position:absolute;inset:0;
  background:linear-gradient(105deg,transparent 30%,rgba(113,112,255,.26) 45%,rgba(255,255,255,.22) 51%,rgba(113,112,255,.2) 57%,transparent 70%);
  background-size:230% 100%;animation:shim 1.6s linear infinite}
@keyframes shim{to{background-position:-230% 0}}
.plate .scan{position:absolute;left:0;right:0;top:0;height:2px;
  background:linear-gradient(90deg,transparent,var(--accent-hi),transparent);
  box-shadow:0 0 18px rgba(113,112,255,.8);animation:scan 2.2s var(--ease) infinite}
@keyframes scan{0%{top:-2%;opacity:0}14%{opacity:1}86%{opacity:1}100%{top:100%;opacity:0}}
.status{text-align:center}
.status .big{font-size:12.5px;font-weight:560;letter-spacing:.05em;color:var(--text-2)}
.status .big b{color:var(--text);font-weight:590}
.bar{width:min(78vw,300px);height:2px;background:rgba(255,255,255,.08);margin:20px auto 0;
  border-radius:2px;overflow:hidden}
.bar i{display:block;height:100%;width:35%;border-radius:2px;
  background:linear-gradient(90deg,transparent,var(--accent),transparent);
  /* linear, not an ease: an indeterminate bar that accelerates and decelerates
     reads as progress toward something. This one is a heartbeat, not a measure. */
  animation:slide 1.05s linear infinite}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(330%)}}
.seedline{margin-top:14px;font-size:10px;font-weight:520;letter-spacing:.05em;color:var(--text-4)}

/* =============================== tear ============================== */
#tearWrap{position:relative;width:var(--card-w);aspect-ratio:var(--card-ar);
  touch-action:none;user-select:none}
#tearWrap .pack{cursor:grab}
#tearWrap .pack:active{cursor:grabbing}
.strip{position:absolute;left:-5px;right:-5px;top:-5px;height:30px;z-index:3;
  border-radius:17px 17px 0 0;
  background:linear-gradient(180deg,#33325c,#1a1930 62%,#12121f);
  box-shadow:0 3px 14px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.16);
  clip-path:polygon(0 0,100% 0,100% 62%,96% 100%,92% 58%,88% 100%,84% 58%,80% 100%,76% 58%,72% 100%,68% 58%,64% 100%,60% 58%,56% 100%,52% 58%,48% 100%,44% 58%,40% 100%,36% 58%,32% 100%,28% 58%,24% 100%,20% 58%,16% 100%,12% 58%,8% 100%,4% 58%,0 100%)}
.hint{position:absolute;left:50%;top:44px;transform:translateX(-50%);
  font-size:10.5px;font-weight:540;letter-spacing:.06em;color:rgba(247,248,248,.8);
  white-space:nowrap;pointer-events:none;z-index:4;text-shadow:0 2px 14px rgba(0,0,0,.9);
  animation:pulse 1.9s var(--ease) infinite}
@keyframes pulse{0%,100%{opacity:.42}50%{opacity:1}}

/* ============================ reveal card ========================== */
.holder{position:relative;perspective:1400px;perspective-origin:50% 45%;
  width:var(--card-w);aspect-ratio:var(--card-ar)}
.holder::after{content:"";position:absolute;left:7%;right:7%;bottom:-7%;height:12%;
  border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.72),transparent 70%);
  filter:blur(18px);z-index:-1}
.pedestal{position:absolute;left:-18%;right:-18%;bottom:-16%;height:46%;z-index:-1;
  border-radius:50%;opacity:0;pointer-events:none;filter:blur(26px);
  background:radial-gradient(ellipse,rgba(113,112,255,.34),transparent 70%);
  transition:opacity .9s var(--ease)}
.card.flipped ~ .pedestal{opacity:.9}
.card.grail ~ .pedestal{background:radial-gradient(ellipse,rgba(245,196,81,.4),transparent 70%)}
.card{position:absolute;inset:0;transform-style:preserve-3d;
  transform:rotateY(180deg) var(--tilt,);
  transition:transform 1s cubic-bezier(.2,.75,.2,1)}
.card.flipped{transform:rotateY(0deg) var(--tilt,)}
.face{position:absolute;inset:0;backface-visibility:hidden;border-radius:4.6%/3.3%;overflow:hidden;
  box-shadow:0 26px 60px -20px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.09)}
/* Thickness. One bevel plane per side, each hidden when its side faces away,
   so the card has an edge you can see catch the light as it turns. */
.thick{position:absolute;inset:-1.5px;border-radius:4.8%/3.4%;pointer-events:none;
  backface-visibility:hidden;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.11),0 0 22px rgba(113,112,255,.13)}
.thick.a{transform:translateZ(6px)}
.thick.b{transform:rotateY(180deg) translateZ(6px)}
.back{transform:rotateY(180deg);display:grid;place-items:center;
  background:repeating-linear-gradient(45deg,rgba(255,255,255,.026) 0 8px,transparent 8px 16px),
    radial-gradient(120% 80% at 50% 30%,#23223f,#12121f 60%,#0a0a11)}
.back .sigil{width:42%;aspect-ratio:1;border-radius:50%;
  display:grid;place-items:center;
  background:radial-gradient(circle at 38% 32%,rgba(255,255,255,.12),transparent 60%);
  box-shadow:0 0 0 1px rgba(255,255,255,.14),inset 0 0 44px rgba(113,112,255,.24)}
.back .sigil b{font:590 13px/1 'Inter',ui-sans-serif;letter-spacing:.06em;color:var(--text-2)}
.back .edge{position:absolute;inset:5.5%;border-radius:3.4%;
  box-shadow:0 0 0 1px rgba(255,255,255,.09)}
.front{background:#050609}
.front img{width:100%;height:100%;display:block;object-fit:contain}

/* --- per-rarity foil shaders. Physics, not palette: these stay. --- */
.foil{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .8s var(--ease)}
.card.flipped .foil{opacity:1}
[data-foil="normal"] .f1{mix-blend-mode:soft-light;
  background:linear-gradient(var(--ang,105deg),transparent 42%,rgba(255,255,255,.10) 50%,transparent 58%)}
[data-foil="holo"] .f1{mix-blend-mode:color-dodge;filter:blur(3px);
  background:linear-gradient(var(--ang,105deg),transparent 30%,rgba(255,0,128,.34) 41%,rgba(255,214,0,.34) 47%,rgba(0,255,190,.34) 53%,rgba(80,120,255,.34) 59%,transparent 70%)}
[data-foil="holo"] .f2{mix-blend-mode:overlay;opacity:.5;
  background:repeating-linear-gradient(var(--ang2,15deg),rgba(255,255,255,.10) 0 2px,transparent 2px 5px)}
[data-foil="reverse-holo"] .f1{mix-blend-mode:color-dodge;
  background:linear-gradient(var(--ang,105deg),rgba(190,255,255,.30),rgba(255,190,255,.30),rgba(255,255,190,.30));
  -webkit-mask:linear-gradient(#000,#000),radial-gradient(ellipse 40% 26% at 50% 33%,#000 60%,transparent 78%);
  -webkit-mask-composite:xor;mask-composite:exclude;
  mask:linear-gradient(#000,#000),radial-gradient(ellipse 40% 26% at 50% 33%,#000 60%,transparent 78%)}
[data-foil="reverse-holo"] .f2{mix-blend-mode:overlay;
  background:repeating-linear-gradient(-22deg,rgba(255,255,255,.13) 0 1px,transparent 1px 6px)}
[data-foil="full-art"] .f1{mix-blend-mode:color-dodge;filter:blur(9px);
  background:linear-gradient(var(--ang,105deg),transparent 12%,rgba(120,220,255,.30) 34%,rgba(255,255,255,.42) 50%,rgba(255,150,220,.30) 66%,transparent 88%)}
[data-foil="full-art"] .f2{mix-blend-mode:screen;
  background:radial-gradient(90% 60% at var(--px,50%) var(--py,40%),rgba(255,255,255,.24),transparent 62%)}
[data-foil="special-illustration"] .f1{mix-blend-mode:color-dodge;filter:blur(6px);
  background:linear-gradient(var(--ang,105deg),transparent 18%,rgba(255,90,190,.34) 38%,rgba(120,255,240,.34) 56%,transparent 78%),
    linear-gradient(calc(var(--ang,105deg) * -1.7),transparent 24%,rgba(255,230,120,.28) 50%,transparent 76%)}
[data-foil="special-illustration"] .f2{mix-blend-mode:overlay;opacity:.75;
  background:repeating-conic-gradient(from var(--ang,105deg) at var(--px,50%) var(--py,45%),rgba(255,255,255,.16) 0deg 4deg,transparent 4deg 12deg)}
[data-foil="special-illustration"] .f3{mix-blend-mode:screen;
  background:radial-gradient(circle at var(--px,50%) var(--py,40%),rgba(255,255,255,.42),transparent 34%)}
[data-foil="gold"] .f1{mix-blend-mode:overlay;opacity:.85;
  background:linear-gradient(var(--ang,105deg),#6B4A10 8%,#F7DE8A 30%,#FFF8DC 47%,#E0B646 62%,#7A5412 84%)}
[data-foil="gold"] .f2{mix-blend-mode:soft-light;
  background:repeating-linear-gradient(var(--ang2,12deg),rgba(255,255,255,.20) 0 1px,transparent 1px 4px)}
.coat{position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;opacity:.55;
  background:radial-gradient(110% 80% at var(--px,50%) var(--py,30%),rgba(255,255,255,.16),transparent 55%)}
.grain{position:absolute;inset:0;pointer-events:none;opacity:.16;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/></filter><rect width='120' height='120' filter='url(%23n)' opacity='.5'/></svg>")}

/* ============================ reveal meta ========================== */
.reveal-meta{margin-top:28px;text-align:center;opacity:0;transform:translateY(10px);
  transition:opacity .7s var(--ease),transform .7s var(--ease)}
.reveal-meta.on{opacity:1;transform:none}
.reveal-meta .nm{font-size:clamp(21px,5.4vw,30px);font-weight:590;letter-spacing:-.038em;
  line-height:1.0}
.reveal-meta .st{margin-top:7px;font-size:10.5px;font-weight:520;letter-spacing:.055em;
  color:var(--text-3)}
.reveal-meta .val{margin-top:15px;font-size:clamp(24px,6vw,34px);font-weight:620;
  letter-spacing:-.03em;color:var(--text);
  font-family:ui-monospace,'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums}
.reveal-meta .val.t-GRAIL{color:var(--gold);text-shadow:0 0 34px rgba(245,196,81,.4)}
.reveal-meta .val.t-TIER_4{color:#e0b0ff}
.reveal-meta .val.t-TIER_3{color:var(--em)}
.reveal-meta .vk{margin-top:4px;font-size:9.5px;font-weight:540;letter-spacing:.06em;
  color:var(--text-4)}
.chips{display:flex;gap:7px;justify-content:center;margin-top:16px;flex-wrap:wrap}
.chip{font-size:10px;font-weight:520;letter-spacing:.03em;padding:6px 10px;border-radius:7px;
  color:var(--text-3);background:var(--glass);box-shadow:0 0 0 1px var(--line)}
.chip.t{color:var(--accent-hi);background:var(--accent-dim);
  box-shadow:0 0 0 1px rgba(113,112,255,.24)}

/* ========================== grail takeover =========================
   Deeper ground, a slow radial bloom behind the card, and a denser spark
   field. All of it lives inside #grailFx, which the reveal code empties on
   reset, so nothing survives into the next rip. */
#grailFx{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:0;
  transition:opacity 1s var(--ease);
  background:radial-gradient(125% 85% at 50% 42%,#13122a 0%,#0a0a14 46%,#050609 100%)}
#grailFx.on{opacity:1}
/* Deep ground. z-index:-1 keeps it above the base gradient but beneath the
   bloom and the spark field, which are appended as real children — as an
   ordinary ::after it would paint last and bury every spark. */
#grailFx::after{content:"";position:absolute;left:0;right:0;bottom:0;height:46%;z-index:-1;
  background:linear-gradient(180deg,transparent,rgba(4,5,9,.92))}
#grailFx .bloom{position:absolute;left:50%;top:46%;width:min(160vw,1180px);aspect-ratio:1;
  border-radius:50%;filter:blur(56px);
  background:radial-gradient(circle,rgba(245,196,81,.16) 0%,rgba(150,120,255,.15) 30%,
    rgba(113,112,255,.09) 48%,transparent 70%);
  animation:bloomPulse 6.5s var(--ease) infinite}
@keyframes bloomPulse{
  0%,100%{opacity:.5;transform:translate(-50%,-50%) scale(.84)}
  50%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}}
/* A soft ring rather than a box-shadow one: a 1px shadow on a 560px circle
   draws a hard rim that reads as a drawn circle, not as light. */
#grailFx .halo{position:absolute;left:50%;top:46%;width:min(84vw,560px);aspect-ratio:1;
  border-radius:50%;filter:blur(12px);
  background:radial-gradient(circle,transparent 58%,rgba(245,196,81,.13) 72%,transparent 84%);
  animation:haloPulse 5.2s var(--ease) infinite}
@keyframes haloPulse{
  0%,100%{opacity:.35;transform:translate(-50%,-50%) scale(.92)}
  50%{opacity:.9;transform:translate(-50%,-50%) scale(1.06)}}
.spark{position:absolute;width:2px;height:2px;border-radius:50%;background:#fff3d2;
  box-shadow:0 0 8px 2px rgba(245,196,81,.7);opacity:0}
.spark.hot{background:var(--gold);box-shadow:0 0 13px 3px rgba(245,196,81,.9)}
@keyframes rise{
  0%{opacity:0;transform:translate3d(0,24px,0) scale(.4)}
  18%{opacity:1}70%{opacity:.85}
  100%{opacity:0;transform:translate3d(var(--dx,0px),-172px,0) scale(1.15)}}
.grail-tag{display:flex;width:max-content;margin:0 auto 18px;align-items:center;gap:8px;
  font-size:10.5px;font-weight:560;letter-spacing:.07em;color:var(--gold);
  padding:6px 13px;border-radius:100px;background:rgba(245,196,81,.09);
  box-shadow:0 0 0 1px rgba(245,196,81,.28),0 0 30px -8px rgba(245,196,81,.5);
  opacity:0;transition:opacity .8s var(--ease)}
.grail-tag.on{opacity:1}
.card.grail .face.front{box-shadow:0 0 0 1px rgba(245,196,81,.5),0 0 80px rgba(245,196,81,.4),
  0 30px 70px -20px rgba(0,0,0,.95)}
.card.grail .thick{box-shadow:inset 0 0 0 1px rgba(245,196,81,.4),0 0 26px rgba(245,196,81,.22)}

/* ============================ after / error ======================== */
.rowbtns{display:flex;gap:10px;justify-content:center;margin-top:26px;flex-wrap:wrap;
  opacity:0;transition:opacity .6s var(--ease)}
.rowbtns.on{opacity:1}
.btn2{display:inline-flex;align-items:center;height:42px;padding:0 20px;border-radius:9px;
  font-size:12.5px;font-weight:540;letter-spacing:-.008em;color:var(--text-2);
  background:var(--glass);box-shadow:0 0 0 1px var(--line);
  transition:color .2s var(--ease),background .2s var(--ease),box-shadow .2s var(--ease),
    transform .18s var(--spring)}
.btn2:hover{color:var(--text);background:rgba(255,255,255,.055);box-shadow:0 0 0 1px var(--line-hi)}
.btn2:active{transform:scale(.975)}
.btn2.pri{color:#fff;background:var(--accent);font-weight:560;
  box-shadow:0 0 0 1px rgba(255,255,255,.09) inset,0 10px 28px -12px rgba(113,112,255,.9)}
.btn2.pri:hover{background:var(--accent-hi);
  box-shadow:0 0 0 1px rgba(255,255,255,.14) inset,0 14px 36px -12px rgba(113,112,255,1)}
.err{max-width:44ch;margin:14px auto 0;text-align:center;color:var(--danger);
  font-size:13px;font-weight:510;letter-spacing:-.008em;line-height:1.6}

@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;
    transition-duration:.12s!important}
  [data-reveal],[data-reveal-3d]{opacity:1!important;transform:none!important}
  .mesh,.filmgrain,.embers{animation:none!important}
}
`;

function heroFor(pack: PackConfig, best: CardListing | null): string {
  return pack.artwork.heroImageUrl ?? best?.imageLarge ?? '';
}

/** The pack, as a stack of planes rather than a picture of a pack. */
function packObject(hero: string, packName: string, depth: boolean): string {
  return `<div class="pack${depth ? ' depth' : ''}"${depth ? ' id="packArt" data-depth="1"' : ''}>
      <div class="plane pk-slab"${depth ? ' data-layer="-18"' : ''}></div>
      <div class="plane pk-base"${depth ? ' data-layer="0"' : ''}>
        <div class="pack-hero" style="background-image:url(${esc(hero)})"></div>
      </div>
      <div class="plane pk-sheen"${depth ? ' data-layer="14"' : ''}></div>
      <div class="plane pk-rim"${depth ? ' data-layer="16"' : ''}></div>
      <div class="pack-top"${depth ? ' data-layer="24"' : ''}></div>
      <div class="pack-label"${depth ? ' data-layer="32"' : ''}>
        <div class="nm">${packName}</div>
        <div class="sub">SEALED</div>
      </div>
    </div>`;
}

export function ripPage(pack: PackConfig, best: CardListing | null, topValue: number): string {
  const hero = heroFor(pack, best);
  const packName = esc(pack.name);
  const embers = '<i></i>'.repeat(14);
  const deck = [0, 1, 2, 3, 4, 5, 6].map((i) => `<i style="--i:${i}"></i>`).join('');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<title>${packName} — RIPDEX</title>
<style>${RIP_CSS}</style>
</head><body>
<div class="mesh" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
<div id="grailFx"></div>
<div class="filmgrain" aria-hidden="true"></div>
<div id="chrome">
  <a class="brand" href="/"><span class="dot"></span>RIPDEX</a>
  <a class="odds-link" href="/packs">ODDS →</a>
</div>
<div id="stage">
  <section class="step on" id="s-select">
    <div class="embers" aria-hidden="true">${embers}</div>
    <div class="center" data-reveal-group="70">
      <div data-reveal><span class="eyebrow"><span class="pulse-dot"></span>RIPDEX PACK</span></div>
      <h1 class="ttl" data-reveal>${packName}</h1>
      <div class="scene" data-reveal-3d>
        <div class="pack-hold floaty grounded" style="--float-dur:8.4s;--float-amp:13px">
          ${packObject(hero, packName, true)}
        </div>
      </div>
      <div class="specs" data-reveal>
        <div class="spec"><div class="k">CONTAINS</div><div class="v">${pack.cardsPerPack} CARD</div></div>
        <div class="spec"><div class="k">PRICE</div><div class="v mono">${pack.priceRip.toLocaleString()} <span class="u">$RIP</span></div></div>
        <div class="spec"><div class="k">TOP PULL</div><div class="v mono g">$${Math.round(topValue).toLocaleString()}</div></div>
      </div>
      <div data-reveal>
        <button class="cta" id="ripBtn" data-magnetic="0.14">RIP PACK <span class="kbd">↵</span></button>
        <a class="ghost" href="/packs">VIEW FULL ODDS</a>
      </div>
    </div>
  </section>

  <section class="step" id="s-roll"><div class="status">
    <div class="roller scene-near">
      <div class="deck" aria-hidden="true">${deck}</div>
      <div class="plate"><i class="scan"></i></div>
    </div>
    <div class="big" id="rollText"><b>PACK LOCKED</b></div>
    <div class="bar"><i></i></div>
    <div class="seedline mono">SEED COMMITTED · OUTCOME SETTLED SERVER-SIDE</div>
  </div></section>

  <section class="step" id="s-tear"><div>
    <div id="tearWrap">
      <div class="strip" id="strip"></div>
      ${packObject(hero, packName, false)}
      <div class="hint" id="tearHint">DRAG ACROSS TO TEAR</div>
    </div>
  </div></section>

  <section class="step" id="s-card"><div>
    <div class="grail-tag" id="grailTag">GRAIL PULL</div>
    <div class="holder" id="holder"><div class="card" id="card">
      <div class="face back"><div class="edge"></div><div class="sigil"><b>RIP</b></div></div>
      <div class="thick a" aria-hidden="true"></div>
      <div class="thick b" aria-hidden="true"></div>
      <div class="face front">
        <img id="cardImg" alt="">
        <div class="foil"><div class="f1"></div><div class="f2"></div><div class="f3"></div></div>
        <div class="coat"></div><div class="grain"></div>
      </div>
    </div><div class="pedestal" aria-hidden="true"></div></div>
    <div class="hint" id="flipHint" style="position:static;transform:none;margin-top:20px;text-align:center">TAP TO REVEAL</div>
    <div class="reveal-meta" id="meta">
      <div class="nm" id="mName"></div><div class="st" id="mSet"></div>
      <div class="val" id="mVal"></div><div class="vk">REFERENCE VALUE</div>
      <div class="chips" id="mChips"></div>
    </div>
    <div class="rowbtns" id="after">
      <a class="btn2" id="cardLink" href="#">VIEW CARD</a>
      <a class="btn2" id="shareLink" href="#" target="_blank" rel="noopener">SHARE CARD</a>
      <button class="btn2 pri" id="againBtn">RIP ANOTHER</button>
    </div>
  </div></section>

  <section class="step" id="s-err"><div class="status">
    <div class="big"><b>RIP FAILED</b></div>
    <p class="err" id="errText"></p>
    <button class="cta" id="retryBtn">TRY AGAIN</button>
  </div></section>
</div>
${MOTION_JS}
<script type="module">
const PACK_ID = ${JSON.stringify(pack.id)};
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const show = (id) => document.querySelectorAll('.step').forEach(s => s.classList.toggle('on', s.id === id));
const fmt = (n) => '$' + Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

let result = null;

async function rip(){
  show('s-roll');
  document.getElementById('rollText').innerHTML = '<b>PACK LOCKED</b>';
  await wait(750);
  document.getElementById('rollText').innerHTML = 'ROLLING CARD…';

  let data;
  try {
    const res = await fetch('/api/rip', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ packId: PACK_ID })
    });
    data = await res.json();
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  } catch (err) {
    document.getElementById('errText').textContent = String(err.message || err);
    show('s-err');
    return;
  }
  result = data;

  // §21: the outcome is settled server-side; preload the full-resolution art
  // BEFORE the reveal so the animation never stalls on a download.
  await new Promise(done => {
    const im = new Image();
    im.onload = im.onerror = done;
    im.src = result.imageLarge;
  });
  const img = document.getElementById('cardImg');
  img.src = result.imageLarge;
  img.alt = result.name + ' — ' + result.setName + ' ' + result.number;

  await wait(420);
  startTear();
}

let tearing = false, torn = false, startX = 0;
const wrap = document.getElementById('tearWrap');
function startTear(){
  torn = false;
  const s = document.getElementById('strip');
  s.style.transition=''; s.style.transform=''; s.style.opacity='1';
  document.getElementById('tearHint').style.display='';
  document.getElementById('tearHint').style.opacity='';
  show('s-tear');
}
wrap.addEventListener('pointerdown', e => { if(torn) return; tearing = true; startX = e.clientX; });
window.addEventListener('pointermove', e => {
  if(!tearing || torn) return;
  const w = wrap.getBoundingClientRect().width;
  const p = Math.max(0, Math.min(1, (e.clientX - startX) / (w * 0.62)));
  const s = document.getElementById('strip');
  s.style.transform = 'translate(' + (p*w*0.5) + 'px,' + (-p*30) + 'px) rotate(' + (p*13) + 'deg)';
  s.style.opacity = String(1 - p*0.35);
  document.getElementById('tearHint').style.opacity = String(Math.max(0, 1 - p*2.4));
  if (p >= 1) finishTear();
});
window.addEventListener('pointerup', () => {
  if(torn) return; tearing = false;
  const s = document.getElementById('strip');
  s.style.transform=''; s.style.opacity='1';
  document.getElementById('tearHint').style.opacity='';
});

async function finishTear(){
  torn = true; tearing = false;
  const s = document.getElementById('strip');
  s.style.transition = 'transform .55s cubic-bezier(.3,.9,.3,1),opacity .55s';
  s.style.transform = 'translate(70%,-90px) rotate(34deg)';
  s.style.opacity = '0';
  document.getElementById('tearHint').style.display = 'none';
  await wait(430);
  present();
}

const card = document.getElementById('card');
async function present(){
  const ch = result.choreography;
  card.classList.remove('flipped','grail');
  card.style.transitionDuration = ch.flipMs + 'ms';
  card.setAttribute('data-foil', result.foil);
  document.getElementById('meta').classList.remove('on');
  document.getElementById('after').classList.remove('on');
  document.getElementById('grailTag').classList.remove('on');
  document.getElementById('flipHint').style.display='';
  show('s-card');

  if (ch.fullTakeover){
    document.getElementById('chrome').classList.add('hide');
    document.getElementById('grailFx').classList.add('on');
    sparks();
    card.classList.add('grail');
  } else if (ch.dimBackground){
    const fx = document.getElementById('grailFx');
    fx.style.background = 'radial-gradient(62% 62% at 50% 48%,rgba(6,7,12,.58),rgba(5,6,9,.9))';
    fx.classList.add('on');
  }

  await wait(ch.suspenseMs);
  const flip = async () => {
    card.removeEventListener('click', flip);
    document.getElementById('flipHint').style.display='none';
    if (ch.fullTakeover) document.getElementById('grailTag').classList.add('on');
    card.classList.add('flipped');
    await wait(ch.flipMs + ch.metadataDelayMs);
    fill();
  };
  card.addEventListener('click', flip);
}

function fill(){
  document.getElementById('mName').textContent = result.name;
  document.getElementById('mSet').textContent =
    (result.setName + ' · ' + result.number + ' · ' + (result.rarity || '')).toUpperCase();
  const val = document.getElementById('mVal');
  // Value is colour-coded by tier the same way the catalog codes it: gold is
  // reserved for a grail, never spent on an ordinary pull.
  val.className = 'val t-' + String(result.tier || '').replace(/[^A-Za-z0-9_]/g,'');
  val.textContent = fmt(result.referenceValue);
  document.getElementById('mChips').innerHTML =
    '<span class="chip t">' + result.tier.replace('_',' ') + '</span>' +
    '<span class="chip">' + result.oddsLabel + ' ODDS</span>' +
    '<span class="chip">' + result.variantLabel.toUpperCase() + '</span>' +
    // openingId already carries a "rip_" prefix, so prepending "RIP " again
    // renders "RIP RIP_55DAC0".
    '<span class="chip">RIP ' + result.openingId.replace(/^rip_/,'').slice(0,10).toUpperCase() + '</span>';
  document.getElementById('cardLink').href = result.href;
  // The graphic is drawn from the ledger row, so it is addressable the moment
  // the rip is recorded — which happens before this reveal ever runs.
  document.getElementById('shareLink').href =
    '/og/rip/' + encodeURIComponent(result.openingId) + '.svg';
  document.getElementById('meta').classList.add('on');
  setTimeout(() => document.getElementById('after').classList.add('on'), 260);
}

const holder = document.getElementById('holder');
holder.addEventListener('pointermove', e => {
  const r = holder.getBoundingClientRect();
  const x = (e.clientX - r.left)/r.width, y = (e.clientY - r.top)/r.height;
  card.style.setProperty('--tilt','rotateY(' + ((x-.5)*17) + 'deg) rotateX(' + ((.5-y)*17) + 'deg)');
  const f = card.querySelector('.foil'), c = card.querySelector('.coat');
  [f,c].forEach(el => { el.style.setProperty('--px',(x*100).toFixed(1)+'%');
                        el.style.setProperty('--py',(y*100).toFixed(1)+'%'); });
  f.style.setProperty('--ang',(60 + x*120).toFixed(0)+'deg');
  f.style.setProperty('--ang2',(x*60-30).toFixed(0)+'deg');
});
holder.addEventListener('pointerleave', () => card.style.setProperty('--tilt',''));

// The takeover: a slow bloom and a halo ring behind the card, then the spark
// field over the top. Everything is a child of #grailFx so reset() clears it
// in one assignment — no orphaned animations left running behind the page.
function sparks(){
  const fx = document.getElementById('grailFx');
  fx.innerHTML = '<div class="bloom"></div><div class="halo"></div>';
  for(let i=0;i<74;i++){
    const s=document.createElement('i'); s.className='spark' + (i%6===0 ? ' hot' : '');
    const sz = 1.4 + (i%5)*0.7;
    s.style.width = sz+'px'; s.style.height = sz+'px';
    s.style.left=(i*37%100)+'%'; s.style.top=(52+(i*29%48))+'%';
    s.style.setProperty('--dx', (((i%7)-3)*11) + 'px');
    s.style.animation='rise ' + (2.4+(i%7)*0.4) + 's linear ' + ((i%11)*0.22) + 's infinite';
    fx.appendChild(s);
  }
}

function reset(){
  document.getElementById('chrome').classList.remove('hide');
  const fx = document.getElementById('grailFx');
  fx.classList.remove('on'); fx.style.background=''; fx.innerHTML='';
  card.classList.remove('flipped','grail');
  show('s-select');
}

document.getElementById('ripBtn').onclick = rip;
document.getElementById('packArt').onclick = rip;
// The CTA prints a ↵ affordance, so Enter has to actually rip. Scoped to the
// select step — an unguarded global would fire a second rip mid-reveal — and
// yielded to focused controls so Enter on RIP ANOTHER still means that button.
addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t instanceof Element && t.closest('a,button,input,textarea,select,[contenteditable]')) return;
  if (!document.getElementById('s-select').classList.contains('on')) return;
  e.preventDefault();
  rip();
});
document.getElementById('retryBtn').onclick = () => { reset(); setTimeout(rip, 300); };
document.getElementById('againBtn').onclick = () => { reset(); setTimeout(rip, 420); };
new Image().src = ${JSON.stringify(hero)};
</script>
</body></html>`;
}
