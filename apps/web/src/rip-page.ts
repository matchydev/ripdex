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
import { tokenHeader, tokenUI, TOKEN_CSS } from './token.ts';
import { ripMark, BRAND_HEAD, BRAND_CSS } from './brand.ts';

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
.chrome-right{display:flex;align-items:center;gap:8px}
.mute-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:26px;padding:0;
  color:var(--text-3)}
.mute-btn:hover{color:var(--text)}
.mute-btn .sl{opacity:0;transition:opacity .18s var(--ease)}
.mute-btn.off{color:var(--text-4)}
.mute-btn.off .wv{opacity:0}
.mute-btn.off .sl{opacity:1}

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
/* A generated foil wrapper is the pack face: fill it, drop the card-crop veil. */
.pack-hero.wrapped{background-size:cover;background-position:50% 42%;opacity:1;filter:none}
.pack-hero.wrapped::after{display:none}
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

/* ============================== reel ==============================
   The case-opening reel — the genre's signature mechanic. A horizontal
   strip of REAL pool cards streams past a fixed centre marker and
   decelerates onto the card you actually pulled.

   Three things keep it honest, in line with the rest of the product:
   - The outcome is settled server-side by /api/rip BEFORE this runs. The
     reel PLACES the winner at the landing index; it never chooses it.
   - Filler tiles are drawn with the pool's real weights (see runReel), so
     a grail whips past as rarely as it drops — no salted highlights.
   - The tiles flanking the winner are ordinary weighted draws. There are
     no manufactured near-misses and no fake countdown.
   The only cue tied to the result is the marker taking the pull's tier
   colour during the final settle, and the outcome is already fixed by then. */
.reel-wrap{position:relative;width:100%;max-width:1120px;margin:8px auto 0;--tier-glow:var(--accent-hi)}
.reel-view{position:relative;z-index:1;overflow:hidden;width:100%;
  -webkit-mask:linear-gradient(90deg,transparent,#000 13%,#000 87%,transparent);
          mask:linear-gradient(90deg,transparent,#000 13%,#000 87%,transparent)}
.reel-track{display:flex;gap:11px;padding:26px 0;width:max-content;will-change:transform;
  transform:translateX(0)}
.reel-card{position:relative;flex:0 0 var(--reel-w,clamp(94px,15vw,122px));aspect-ratio:63/88;
  border-radius:6px;overflow:hidden;background:#0a0b10;
  box-shadow:0 0 0 1px var(--line-hi),0 12px 26px -14px rgba(0,0,0,.85)}
/* Each tile pools a blurred copy of its own art behind it — the same
   bridge-colour trick the catalog grid uses, so warm scans sit on the dark
   page instead of fighting the violet. */
.reel-card::before{content:"";position:absolute;inset:-32%;z-index:0;
  background-image:var(--art);background-size:cover;background-position:center;
  filter:blur(24px) saturate(1.5);opacity:.5}
.reel-card img{position:relative;z-index:1;width:100%;height:100%;object-fit:cover;display:block}
/* A crisp framed border on every tile so the cards read as distinct objects as
   they flash past, not one continuous strip. Painted above the art. */
.reel-card::after{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;border-radius:inherit;
  box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.18),inset 0 0 0 3px rgba(0,0,0,.30)}
.reel-card.t-TIER_3{box-shadow:0 0 0 1px rgba(74,222,155,.34),0 0 16px -6px rgba(74,222,155,.4)}
.reel-card.t-TIER_4{box-shadow:0 0 0 1px rgba(224,176,255,.4),0 0 18px -5px rgba(224,176,255,.45)}
.reel-card.t-GRAIL{box-shadow:0 0 0 1px rgba(245,196,81,.55),0 0 22px -4px rgba(245,196,81,.55)}
.reel-card.win.locked{animation:reelPop .5s var(--spring)}
@keyframes reelPop{0%{transform:scale(1)}45%{transform:scale(1.075)}100%{transform:scale(1)}}

/* The centre marker: a glowing beam with a chevron above and below, in the
   design's one accent until the settle recolours it to the pull's tier. */
.reel-marker{position:absolute;top:-2px;bottom:-2px;left:50%;width:2px;z-index:4;
  transform:translateX(-50%);pointer-events:none;
  background:linear-gradient(180deg,transparent,var(--tier-glow) 22%,var(--tier-glow) 78%,transparent);
  box-shadow:0 0 20px 3px color-mix(in srgb,var(--tier-glow) 55%,transparent);
  transition:background .5s var(--ease),box-shadow .5s var(--ease)}
.reel-marker::before,.reel-marker::after{content:"";position:absolute;left:50%;width:0;height:0;
  transform:translateX(-50%);filter:drop-shadow(0 0 5px var(--tier-glow))}
.reel-marker::before{top:-9px;border-width:9px 6px 0;border-style:solid;
  border-color:var(--tier-glow) transparent transparent}
.reel-marker::after{bottom:-9px;border-width:0 6px 9px;border-style:solid;
  border-color:transparent transparent var(--tier-glow)}
/* A soft pool of light behind the strip, tier-tinted in the settle. */
.reel-glow{position:absolute;left:50%;top:50%;width:min(58vw,360px);height:168%;z-index:0;
  transform:translate(-50%,-50%);pointer-events:none;border-radius:50%;filter:blur(42px);opacity:.45;
  background:radial-gradient(ellipse,color-mix(in srgb,var(--tier-glow) 42%,transparent),transparent 68%);
  transition:opacity .6s var(--ease),background .6s var(--ease)}
.reel-wrap.settle .reel-glow{opacity:.95}

.status{text-align:center}
.status .big{font-size:12.5px;font-weight:560;letter-spacing:.05em;color:var(--text-2)}
.status .big b{color:var(--text);font-weight:590}
.seedline{margin-top:16px;font-size:10px;font-weight:520;letter-spacing:.05em;color:var(--text-4)}

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
/* Framed border on the revealed card, above the foil layers. */
.front::after{content:"";position:absolute;inset:0;z-index:6;pointer-events:none;border-radius:inherit;
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.14),inset 0 0 0 4px rgba(0,0,0,.22)}

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
/* Let the name and value land first; the grade breakdown and chips fade in a
   beat later so the payoff breathes instead of arriving as a stat block. */
.reveal-meta .basev,.reveal-meta .chips{opacity:0;transition:opacity .45s var(--ease) .55s}
.reveal-meta.on .basev,.reveal-meta.on .chips{opacity:1}
.reveal-meta .nm{font-size:clamp(21px,5.4vw,30px);font-weight:590;letter-spacing:-.038em;
  line-height:1.0}
.reveal-meta .st{margin-top:7px;font-size:10.5px;font-weight:520;letter-spacing:.055em;
  color:var(--text-3)}
.reveal-meta .val{margin-top:15px;font-size:clamp(24px,6vw,34px);font-weight:620;
  letter-spacing:-.03em;color:var(--text);
  font-family:ui-monospace,'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums}
.reveal-meta .val.t-GRAIL{color:var(--gold);text-shadow:0 0 34px rgba(245,196,81,.4)}
.reveal-meta .val.t-TIER_4{color:var(--accent-hi)}
.reveal-meta .val.t-TIER_3{color:var(--em)}
.reveal-meta .vk{margin-top:4px;font-size:9.5px;font-weight:540;letter-spacing:.06em;
  color:var(--text-4)}
.chips{display:flex;gap:7px;justify-content:center;margin-top:16px;flex-wrap:wrap}
.chip{font-size:10px;font-weight:520;letter-spacing:.03em;padding:6px 10px;border-radius:7px;
  color:var(--text-3);background:var(--glass);box-shadow:0 0 0 1px var(--line)}
.chip.t{color:var(--accent-hi);background:var(--accent-dim);
  box-shadow:0 0 0 1px rgba(113,112,255,.24)}

/* ===================== psa slab + $RIP economy =====================
   The pull is graded (PSA 6–10, drawn from the same seed) and can be sold back
   for $RIP. --gc is the grade colour (gold for a 10). */
.bal{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:100px;
  font-size:11.5px;font-weight:590;color:var(--text-2);background:var(--glass);
  box-shadow:0 0 0 1px var(--line);font-variant-numeric:tabular-nums;letter-spacing:-.01em;
  transition:color .3s var(--ease),box-shadow .3s var(--ease),transform .18s var(--spring)}
.bal .u{color:var(--text-4);font-size:9px;font-weight:520;letter-spacing:.02em}
.bal.up{color:var(--em);box-shadow:0 0 0 1px rgba(74,222,155,.5);transform:scale(1.06)}
.bal.down{color:var(--danger);box-shadow:0 0 0 1px rgba(255,143,143,.45)}

.slab{position:relative;--gc:var(--text-2);display:flex;flex-direction:column;align-items:center}
.slab-head{display:inline-flex;align-items:center;gap:9px;margin:0 auto 14px;padding:7px 13px;
  border-radius:9px;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.015));
  box-shadow:0 0 0 1px var(--line-hi),inset 0 1px 0 rgba(255,255,255,.14);
  opacity:0;transform:translateY(-8px) scale(.94);transform-origin:50% 0;
  transition:opacity .5s var(--ease),transform .55s var(--spring)}
.slab-head.on{opacity:1;transform:none}
.slab-brand{font-weight:800;font-size:12px;letter-spacing:.09em;color:var(--text);
  padding-right:11px;box-shadow:1px 0 0 var(--line-hi)}
.slab-grade{font-family:ui-monospace,Menlo,monospace;font-weight:700;font-size:18px;letter-spacing:-.02em;
  color:var(--gc);line-height:1}
.slab-label{font-size:10px;font-weight:640;letter-spacing:.06em;color:var(--gc)}

.reveal-meta .val.g10{color:var(--gold);text-shadow:0 0 30px rgba(245,196,81,.4)}
.reveal-meta .val.g9{color:var(--accent-hi)}
.reveal-meta .basev{margin-top:6px;font-size:11px;font-weight:520;letter-spacing:.01em;color:var(--text-4)}

.sell-btn{display:inline-flex;align-items:center;gap:7px;height:42px;padding:0 20px;border-radius:9px;
  font-size:12.5px;font-weight:600;letter-spacing:-.006em;color:#04130c;
  background:linear-gradient(180deg,#79f2be,var(--em));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.32),0 10px 28px -12px rgba(74,222,155,.85);
  transition:filter .2s var(--ease),transform .18s var(--spring),background .3s var(--ease),color .3s var(--ease)}
.sell-btn:hover{filter:brightness(1.07)}
.sell-btn:active{transform:scale(.975)}
.sell-btn .ru{font-size:10px;font-weight:600;opacity:.72}
.sell-btn.sold{background:var(--glass);color:var(--em);box-shadow:0 0 0 1px rgba(74,222,155,.45);
  cursor:default;filter:none}

/* Insufficient-funds toast on the select screen. */
.toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,20px);z-index:8;
  padding:11px 18px;border-radius:100px;font-size:12.5px;font-weight:560;color:var(--danger);
  background:rgba(15,16,17,.86);backdrop-filter:blur(14px);
  box-shadow:0 0 0 1px rgba(255,143,143,.34),0 18px 40px -18px rgba(0,0,0,.8);
  opacity:0;pointer-events:none;transition:opacity .3s var(--ease),transform .4s var(--spring)}
.toast.on{opacity:1;transform:translate(-50%,0)}

/* Big-win celebration — a coin burst + a floating profit number when a pull
   sells for more than the pack cost. Gold, not violet: this is money. */
.sell-btn.win{background:linear-gradient(180deg,#ffe08a,var(--gold));color:#3a2600;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.42),0 12px 34px -10px rgba(245,196,81,.9)}
.sell-btn .prof{font-size:10px;font-weight:800;letter-spacing:-.01em;opacity:.9}
.coins{position:fixed;inset:0;z-index:9;pointer-events:none;overflow:hidden}
.coin{position:absolute;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;
  font:800 11px/1 'Inter',ui-sans-serif;color:#7a5200;
  background:radial-gradient(circle at 35% 30%,#ffe9a8,#f5c451 46%,#a9760c 92%);
  box-shadow:0 0 0 1px rgba(120,80,0,.5),0 2px 7px rgba(0,0,0,.55);will-change:transform,opacity}
@keyframes coinFly{
  0%{opacity:0;transform:translate(0,0) scale(.4) rotate(0)}
  12%{opacity:1}
  100%{opacity:0;transform:translate(var(--cx),var(--cy)) scale(1) rotate(var(--cr))}}
.profit-pop{position:fixed;left:50%;top:42%;z-index:10;transform:translate(-50%,0);pointer-events:none;
  font:800 clamp(30px,7.5vw,58px)/1 ui-monospace,Menlo,monospace;letter-spacing:-.03em;color:var(--gold);
  text-shadow:0 0 44px rgba(245,196,81,.6),0 2px 10px rgba(0,0,0,.6);opacity:0}
.profit-pop.on{animation:profitPop 1.7s var(--ease) forwards}
@keyframes profitPop{
  0%{opacity:0;transform:translate(-50%,26px) scale(.7)}
  16%{opacity:1;transform:translate(-50%,-8px) scale(1.09)}
  28%{transform:translate(-50%,0) scale(1)}
  76%{opacity:1}
  100%{opacity:0;transform:translate(-50%,-46px) scale(1)}}
@keyframes profitStill{0%,90%{opacity:1}100%{opacity:0}}
/* The trophy moment: a gold banner drops from the top when a rip unlocks a new
   achievement. A body-level overlay (like the coins), cleared on reset. */
.trophy-pop{position:fixed;left:50%;top:82px;z-index:12;transform:translate(-50%,-24px);opacity:0;pointer-events:none;
  display:flex;align-items:center;gap:14px;padding:13px 20px 13px 13px;border-radius:14px;max-width:min(420px,92vw);
  background:linear-gradient(135deg,rgba(32,29,20,.97),rgba(17,16,13,.97));border:1px solid rgba(245,196,81,.5);
  box-shadow:0 0 0 1px rgba(0,0,0,.4),0 18px 50px rgba(0,0,0,.6),0 0 40px rgba(245,196,81,.16)}
.trophy-pop.on{animation:trophyIn 3.4s var(--ease) forwards}
.trophy-medal{flex:0 0 auto;width:52px;height:52px;display:grid;place-items:center}
.trophy-medal img{width:52px;height:52px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}
.trophy-medal.grail img{filter:drop-shadow(0 0 10px rgba(245,196,81,.55))}
.trophy-txt{display:flex;flex-direction:column;gap:2px;min-width:0}
.trophy-eyebrow{font:800 9px/1 'Inter',ui-sans-serif;letter-spacing:.16em;color:var(--gold)}
.trophy-name{font:750 17px/1.15 'Inter',ui-sans-serif;letter-spacing:-.02em;color:#fff}
.trophy-desc{font:500 11px/1.35 'Inter',ui-sans-serif;color:#c8c3b4}
@keyframes trophyIn{
  0%{opacity:0;transform:translate(-50%,-24px) scale(.94)}
  7%{opacity:1;transform:translate(-50%,6px) scale(1.03)}
  12%{transform:translate(-50%,0) scale(1)}
  86%{opacity:1;transform:translate(-50%,0) scale(1)}
  100%{opacity:0;transform:translate(-50%,-16px) scale(1)}}
@keyframes trophyStill{0%,88%{opacity:1}100%{opacity:0}}
@media(prefers-reduced-motion:reduce){
  .coin{display:none}
  .profit-pop.on{animation:profitStill 2.4s linear forwards!important;transform:translate(-50%,0)}
  .trophy-pop.on{animation:trophyStill 2.8s linear forwards!important;transform:translate(-50%,0)}
}

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
/* Tinted mid-tier sparks — a proportionate burst for a good-but-not-grail pull.
   Accent for a RARE (TIER_4) pull, emerald for a GOOD (TIER_3) one. Never gold:
   the gold spark stays reserved for the grail takeover. */
.spark.t4{background:#cdd2ff;box-shadow:0 0 9px 2px rgba(130,143,255,.75)}
.spark.t3{background:#c6f6df;box-shadow:0 0 9px 2px rgba(74,222,155,.7)}
/* The card lands: overshoots down + in, then springs to rest — a visual 'thunk'
   to match the audio hit after the long reel. */
@keyframes cardLand{0%{transform:translateY(-26px) scale(1.14)}100%{transform:none}}
@media(prefers-reduced-motion:no-preference){#s-card.on .holder{animation:cardLand .44s var(--spring) both}}
/* One-frame tier impact flash on a rare/grail landing. */
@keyframes tierFlash{0%{opacity:0}16%{opacity:.42}100%{opacity:0}}
.tier-flash{position:fixed;inset:0;z-index:60;pointer-events:none;opacity:0;
  mix-blend-mode:screen;animation:tierFlash .4s ease-out forwards}
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
function packObject(hero: string, packName: string, depth: boolean, wrapped: boolean): string {
  return `<div class="pack${depth ? ' depth' : ''}"${depth ? ' id="packArt" data-depth="1"' : ''}>
      <div class="plane pk-slab"${depth ? ' data-layer="-18"' : ''}></div>
      <div class="plane pk-base"${depth ? ' data-layer="0"' : ''}>
        <div class="pack-hero${wrapped ? ' wrapped' : ''}" style="background-image:url(${esc(hero)})"></div>
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

/**
 * One pool outcome, resolved to what the reel needs to draw it: a thumbnail,
 * its tier and its real pool weight. Assembled server-side in the /rip handler
 * so the client never resolves a card, only presents one.
 */
export interface ReelCard {
  v: string;
  img: string;
  tier: string;
  value: number | null;
  name: string;
  weight: number;
}

export function ripPage(
  pack: PackConfig,
  best: CardListing | null,
  topValue: number,
  reel: ReelCard[],
  wrapper?: string,
): string {
  const hero = heroFor(pack, best);
  // The sealed pack you tear is the generated foil wrapper when one exists,
  // else the pack's hero card cropped into the pack silhouette.
  const packArt = wrapper || hero;
  const wrapped = Boolean(wrapper);
  const packName = esc(pack.name);
  const embers = '<i></i>'.repeat(14);

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
${BRAND_HEAD}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<title>${packName} — RIPDEX</title>
<style>${RIP_CSS + TOKEN_CSS + BRAND_CSS}
#s-select{grid-template-columns:minmax(0,1fr);padding-top:76px}#s-select .pack-hold{width:min(var(--card-w),max(120px,calc((100dvh - 420px) * .7168)))}#s-select .center{min-width:0;max-width:100%}#s-select .specs{max-width:100%}#chrome.hide{opacity:1;pointer-events:auto}#chrome{z-index:20}.chrome-right{flex-wrap:wrap;justify-content:flex-end}.chrome-right .token-buy{min-height:34px}.bal:before{content:"DEMO";font-size:8px;color:var(--text-3);margin-right:5px}@media(max-width:480px){#chrome{inset:12px 12px auto;align-items:flex-start;gap:10px}#chrome .brand{font-size:15px}.chrome-right{gap:6px;max-width:205px}.chrome-right .bal{font-size:11px}.chrome-right .odds-link{font-size:9px}.chrome-right .token-buy{font-size:10px;min-height:30px;padding:0 10px}}
</style>
</head><body>
<div class="mesh" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
<div id="grailFx"></div>
<div class="filmgrain" aria-hidden="true"></div>
<div id="chrome">
  <a class="brand" href="/">${ripMark()}RIPDEX</a>
  <div class="chrome-right">
    <span class="bal" id="balChip" title="Your demo $RIP balance — not an onchain token">${ripMark()}<span id="balNum">—</span><span class="u">$RIP</span></span>
    <button class="odds-link mute-btn" id="muteBtn" type="button" aria-label="Toggle sound">
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"></path>
        <path class="wv" d="M15.5 8.8a4 4 0 0 1 0 6.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
        <path class="wv" d="M18 6.5a7 7 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
        <line class="sl" x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></line>
      </svg>
    </button>
    <a class="odds-link" href="/packs#odds-${esc(pack.id)}">ODDS →</a>
    ${tokenHeader()}
  </div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div id="stage">
  <section class="step on" id="s-select">
    <div class="embers" aria-hidden="true">${embers}</div>
    <div class="center" data-reveal-group="70">
      <div data-reveal><span class="eyebrow"><span class="pulse-dot"></span>RIPDEX PACK</span></div>
      <h1 class="ttl" data-reveal>${packName}</h1>
      <div class="scene" data-reveal-3d>
        <div class="pack-hold floaty grounded" style="--float-dur:8.4s;--float-amp:13px">
          ${packObject(packArt, packName, true, wrapped)}
        </div>
      </div>
      <div class="specs" data-reveal>
        <div class="spec"><div class="k">CONTAINS</div><div class="v">${pack.cardsPerPack} CARD</div></div>
        <div class="spec"><div class="k">PRICE</div><div class="v mono">${pack.priceRip.toLocaleString()} <span class="u">$RIP</span></div></div>
        <div class="spec"><div class="k">TOP PULL</div><div class="v mono g">$${Math.round(topValue).toLocaleString()}</div></div>
      </div>
      <div data-reveal>
        <button class="cta" id="ripBtn" data-magnetic="0.14">RIP PACK <span class="kbd">↵</span></button>
        <a class="ghost" href="/packs#odds-${esc(pack.id)}">VIEW FULL ODDS</a>
      </div>
    </div>
  </section>

  <section class="step" id="s-reel"><div style="width:100%">
    <div class="center" style="margin-bottom:20px">
      <span class="eyebrow"><span class="pulse-dot"></span><span id="reelEyebrow">SETTLING</span></span>
    </div>
    <div class="reel-wrap" id="reelWrap">
      <div class="reel-glow" aria-hidden="true"></div>
      <div class="reel-view"><div class="reel-track" id="reelTrack" aria-hidden="true"></div></div>
      <div class="reel-marker" aria-hidden="true"></div>
    </div>
    <div class="center"><div class="seedline mono">SEED COMMITTED · OUTCOME SETTLED SERVER-SIDE · PROVABLY FAIR</div></div>
  </div></section>

  <section class="step" id="s-tear"><div>
    <div id="tearWrap">
      <div class="strip" id="strip"></div>
      ${packObject(packArt, packName, false, wrapped)}
      <div class="hint" id="tearHint">DRAG ACROSS TO TEAR</div>
    </div>
  </div></section>

  <section class="step" id="s-card"><div>
    <div class="grail-tag" id="grailTag">GRAIL PULL</div>
    <div class="slab" id="slab">
      <div class="slab-head" id="slabHead">
        <span class="slab-brand">PSA</span>
        <span class="slab-grade" id="slabGrade">—</span>
        <span class="slab-label" id="slabLabel"></span>
      </div>
      <div class="holder" id="holder"><div class="card" id="card">
        <div class="face back"><div class="edge"></div><div class="sigil">${ripMark()}</div></div>
        <div class="thick a" aria-hidden="true"></div>
        <div class="thick b" aria-hidden="true"></div>
        <div class="face front">
          <img id="cardImg" alt="">
          <div class="foil"><div class="f1"></div><div class="f2"></div><div class="f3"></div></div>
          <div class="coat"></div><div class="grain"></div>
        </div>
      </div><div class="pedestal" aria-hidden="true"></div></div>
    </div>
    <div class="reveal-meta" id="meta">
      <div class="nm" id="mName"></div><div class="st" id="mSet"></div>
      <div class="val" id="mVal"></div><div class="vk" id="mVk">GRADED VALUE</div>
      <div class="basev" id="mBase"></div>
      <div class="chips" id="mChips"></div>
    </div>
    <div class="rowbtns" id="after">
      <button class="sell-btn" id="sellBtn">SELL · <span class="mono" id="sellNum"></span> <span class="ru">$RIP</span></button>
      <a class="btn2" id="cardLink" href="#">VIEW CARD</a>
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
const PACK_PRICE = ${Number(pack.priceRip)};
// The pool, weighted exactly as it drops. Filler for the reel only — the pull
// itself is settled server-side by /api/rip and merely PLACED on the strip.
const REEL = ${JSON.stringify(reel)};
const REEL_TOTAL = REEL.reduce((s,c) => s + c.weight, 0) || 1;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const show = (id) => document.querySelectorAll('.step').forEach(s => s.classList.toggle('on', s.id === id));
const fmt = (n) => '$' + Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
// Roll a dollar value up to its target — the payoff counting up reads as a win.
function countTo(el, target, ms){
  if (reduceMotion || !(target > 0)){ el.textContent = fmt(target); return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    el.textContent = fmt(target * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const preload = (src) => new Promise(done => { const im = new Image(); im.onload = im.onerror = () => done(); im.src = src; });

/* ------------------------------- sound -------------------------------
   Synthesized with the Web Audio API — zero dependencies, no asset loads. A
   dry tick every time a tile crosses the marker (so the ticking decelerates
   with the reel, like a roulette wheel), a brighter two-note when a strong card
   flashes past, a whoosh on the tear, and a tier-scaled hit on the landing.
   Audio only starts on the RIP gesture (autoplay policy); mute persists. */
let audioCtx = null, masterGain = null, muted = false;
try { muted = localStorage.getItem('ripdex_muted') === '1'; } catch (e) {}
function ensureAudio(){
  if (!audioCtx){
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(audioCtx.destination);
    } catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}
function blip(freq, dur, type, gain, sweep){
  const a = ensureAudio(); if (!a || muted) return;
  const t = a.currentTime;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(masterGain);
  o.start(t); o.stop(t + dur + 0.02);
}
const sTick = (frac) => blip(300 + frac * 150, 0.028, 'square', 0.05, 0);
function sFlash(tier){
  const base = tier === 'GRAIL' ? 900 : tier === 'TIER_4' ? 740 : 600;
  blip(base, 0.07, 'triangle', 0.08, 0);
  setTimeout(() => blip(base * 1.5, 0.09, 'triangle', 0.07, 0), 50);
}
const sTear = () => blip(1200, 0.18, 'sawtooth', 0.05, -900);
function sLand(tier){
  blip(150, 0.24, 'sine', 0.14, -60);
  if (tier === 'TIER_3' || tier === 'TIER_4' || tier === 'GRAIL'){
    const notes = tier === 'GRAIL' ? [523, 659, 784, 1047, 1319]
      : tier === 'TIER_4' ? [494, 659, 784, 988] : [440, 554, 659];
    notes.forEach((f, i) => setTimeout(() => blip(f, 0.55, 'triangle', 0.06, 0), 130 + i * 95));
  }
}
const sStamp = () => blip(220, 0.09, 'square', 0.1, -80); // the PSA grade stamping on
function sCoins(){ // a jingle of coins + a chord, for a profitable sell
  if (muted) return;
  for (let i = 0; i < 7; i++) setTimeout(() => blip(880 + i * 70 + Math.random() * 90, 0.05, 'square', 0.045, 0), i * 42);
  setTimeout(() => { blip(784, 0.4, 'triangle', 0.06, 0); blip(1175, 0.5, 'triangle', 0.045, 0); }, 120);
}

// A burst of gold coins fountaining up from the sell area, and a big floating
// profit number. Fires only when a pull sells for MORE than the pack cost.
function coinBurst(count){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let c = document.getElementById('coins');
  if (!c){ c = document.createElement('div'); c.className = 'coins'; c.id = 'coins'; document.body.appendChild(c); }
  c.innerHTML = '';
  for (let i = 0; i < count; i++){
    const coin = document.createElement('div'); coin.className = 'coin'; coin.textContent = '$';
    coin.style.left = (46 + Math.random() * 8) + '%';
    coin.style.top = (66 + Math.random() * 10) + '%';
    coin.style.setProperty('--cx', ((Math.random() * 2 - 1) * (140 + Math.random() * 260)).toFixed(0) + 'px');
    coin.style.setProperty('--cy', (-(120 + Math.random() * 300)).toFixed(0) + 'px');
    coin.style.setProperty('--cr', (Math.random() * 900 - 450).toFixed(0) + 'deg');
    coin.style.animation = 'coinFly ' + (1.1 + Math.random() * 0.8) + 's cubic-bezier(.2,.7,.3,1) forwards';
    coin.style.animationDelay = (Math.random() * 0.16) + 's';
    c.appendChild(coin);
  }
  setTimeout(() => { if (c) c.innerHTML = ''; }, 2400);
}
function profitPop(text){
  let p = document.getElementById('profitPop');
  if (!p){ p = document.createElement('div'); p.className = 'profit-pop'; p.id = 'profitPop'; document.body.appendChild(p); }
  p.textContent = text; p.classList.remove('on'); void p.offsetWidth; p.classList.add('on');
}

// The trophy moment: when a rip unlocks new achievements (server tells us which
// in the /api/rip response), a gold banner drops in with the medal and a short
// ascending fanfare. Multiple unlocks queue and play one after another. The
// achievement name/description are static catalog strings, escaped anyway.
const escHtml = (s) => String(s == null ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
let trophyQueue = [], trophyBusy = false;
function sTrophy(){
  if (muted) return;
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.5, 'triangle', 0.07, 0), i * 110));
  setTimeout(() => { blip(1319, 0.6, 'triangle', 0.06, 0); blip(1047, 0.6, 'sine', 0.04, 0); }, 470);
}
function trophyMoment(list){
  if (!Array.isArray(list) || !list.length) return;
  trophyQueue.push(...list);
  if (!trophyBusy) nextTrophy();
}
function nextTrophy(){
  const a = trophyQueue.shift();
  if (!a){ trophyBusy = false; return; }
  trophyBusy = true;
  let el = document.getElementById('trophyPop');
  if (!el){
    el = document.createElement('div'); el.className = 'trophy-pop'; el.id = 'trophyPop';
    // Announce the unlock to screen readers — the fanfare is wordless and the
    // banner is the only text channel. Mirrors the page's #toast live region.
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
  }
  const grail = a.id === 'GRAIL_HUNTER';
  const src = '/art/achievements/' + (grail ? 'grail-puller' : 'medal-base') + '.png';
  el.innerHTML =
    '<div class="trophy-medal' + (grail ? ' grail' : '') + '"><img src="' + src + '" alt=""></div>' +
    '<div class="trophy-txt"><span class="trophy-eyebrow"><span aria-hidden="true">🏆 </span>TROPHY UNLOCKED</span>' +
    '<span class="trophy-name">' + escHtml(a.name) + '</span>' +
    '<span class="trophy-desc">' + escHtml(a.description) + '</span></div>';
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  sTrophy();
  // Tracked in reelTimers so reset() cancels the whole trophy chain on a re-rip.
  reelTimers.push(setTimeout(() => { el.classList.remove('on'); reelTimers.push(setTimeout(nextTrophy, 300)); }, reduceMotion ? 2600 : 3400));
}
function setMuted(m){
  muted = m;
  try { localStorage.setItem('ripdex_muted', m ? '1' : '0'); } catch (e) {}
  const b = document.getElementById('muteBtn'); if (b) b.classList.toggle('off', m);
  if (!m) ensureAudio();
}

// While the reel spins, sample its live transform each frame and fire a tick
// when the tile under the marker changes — ticks thin out as it decelerates.
let reelRaf = 0;
function reelSound(track, view, dur){
  if (!ensureAudio() || muted) return;
  const tiles = track.children;
  if (!tiles.length) return;
  const tileFull = tiles[0].offsetWidth + 11; // gap
  const first = tiles[0].offsetLeft + tiles[0].offsetWidth / 2;
  const center = view.clientWidth / 2;
  let lastIdx = -1, lastTickAt = 0;
  const t0 = performance.now();
  cancelAnimationFrame(reelRaf);
  const frame = () => {
    const now = performance.now();
    const tr = getComputedStyle(track).transform;
    const tx = tr && tr !== 'none' ? new DOMMatrix(tr).m41 : 0;
    const idx = Math.round((center - tx - first) / tileFull);
    if (idx !== lastIdx && idx >= 0 && idx < tiles.length){
      lastIdx = idx;
      if (now - lastTickAt > 24){ lastTickAt = now; sTick(Math.min(1, (now - t0) / dur)); }
      const cls = tiles[idx].className;
      if (cls.indexOf('t-GRAIL') >= 0) sFlash('GRAIL');
      else if (cls.indexOf('t-TIER_4') >= 0) sFlash('TIER_4');
      else if (cls.indexOf('t-TIER_3') >= 0) sFlash('TIER_3');
    }
    if (now - t0 < dur + 80) reelRaf = requestAnimationFrame(frame);
  };
  reelRaf = requestAnimationFrame(frame);
}

// ---- $RIP balance ----
let clientBalance = null;
const rip$ = (n) => Number(n).toLocaleString('en-US');
function setBalance(n, dir){
  clientBalance = n;
  const el = document.getElementById('balNum'); if (el) el.textContent = rip$(n);
  const chip = document.getElementById('balChip');
  if (chip && dir){ chip.classList.remove('up','down'); void chip.offsetWidth; chip.classList.add(dir);
    setTimeout(() => chip.classList.remove(dir), 900); }
}
async function refreshBalance(){
  try { const r = await fetch('/api/wallet'); const d = await r.json();
        if (typeof d.balance === 'number') setBalance(d.balance); } catch (e) {}
}
let toastT = 0;
function toast(msg){
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

let result = null;
let ripPromise = null;
const reelTimers = [];

// Kick the settled draw the moment the pack is chosen, then hand off to the
// tear. The round trip hides behind the tear gesture, so the reel never waits
// on the network with the user watching.
function startRip(){
  ensureAudio(); // the click is the gesture that unlocks Web Audio
  // Gate on the known balance before committing to the tear, so you never tear
  // a pack you can't afford. The server re-checks and refunds if anything slips.
  if (clientBalance !== null && clientBalance < PACK_PRICE){
    toast('Not enough $RIP — this pack costs ' + rip$(PACK_PRICE) + ' $RIP');
    setBalance(clientBalance, 'down');
    return;
  }
  result = null;
  document.getElementById('reelWrap').classList.remove('settle');
  ripPromise = fetch('/api/rip', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ packId: PACK_ID })
  }).then(async res => {
    const data = await res.json();
    if (!res.ok){
      const e = new Error(data.error || ('HTTP ' + res.status));
      e.code = data.code; e.status = res.status; e.balance = data.balance;
      throw e;
    }
    return data;
  });
  ripPromise.catch(() => {}); // afterTear surfaces the failure; don't warn twice
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
  sTear();
  await wait(430);
  afterTear();
}

// The pack is open: settle the network, preload the hero art (§21 — the reveal
// never stalls on a download), then spin the reel onto the pull.
async function afterTear(){
  let data;
  try {
    data = await ripPromise;
  } catch (err) {
    if (err && (err.code === 'insufficient' || err.status === 402)){
      if (typeof err.balance === 'number') setBalance(err.balance, 'down');
      toast(String((err && err.message) || 'Not enough $RIP'));
      reset(); // back to the pack — nothing was charged
      return;
    }
    document.getElementById('errText').textContent = String((err && err.message) || err);
    show('s-err');
    return;
  }
  result = data;
  if (typeof result.balance === 'number') setBalance(result.balance, 'down');
  const img = document.getElementById('cardImg');
  img.src = result.imageLarge;
  img.alt = result.name + ' — ' + result.setName + ' ' + result.number;
  await preload(result.imageLarge);
  runReel();
}

/* ------------------------------- the reel -------------------------------
   Filler tiles are drawn with the pool's real weights, so a grail is as rare
   on the strip as it is in the pack. The winner is spliced in at a fixed index
   and the whole track decelerates so that tile lands under the centre marker.
   The tiles either side of the winner are ordinary weighted draws — no salted
   near-misses, and nothing here decides the outcome. */
const tierClass = (t) => String(t || '').replace(/[^A-Za-z0-9_]/g,'');
const tierColor = (t) =>
  t === 'GRAIL'  ? 'var(--gold)' :
  t === 'TIER_4' ? 'var(--accent-hi)' :
  t === 'TIER_3' ? 'var(--em)' : 'var(--text-2)';
const tierWord = (t) =>
  t === 'GRAIL'  ? 'GRAIL' :
  t === 'TIER_4' ? 'RARE PULL' :
  t === 'TIER_3' ? 'GOOD PULL' : 'LANDED';

function weightedPick(){
  let t = Math.random() * REEL_TOTAL;
  for (const c of REEL){ t -= c.weight; if (t < 0) return c; }
  return REEL[REEL.length - 1];
}
function winnerCard(){
  return REEL.find(c => c.v === result.variantId) ||
    { v: result.variantId, img: result.imageLarge, tier: result.tier, name: result.name, weight: 1 };
}
function buildTile(c, isWinner){
  const d = document.createElement('div');
  d.className = 'reel-card t-' + tierClass(c.tier) + (isWinner ? ' win' : '');
  d.style.setProperty('--art', 'url("' + String(c.img).replace(/["\\\\]/g,'') + '")');
  const im = document.createElement('img');
  im.src = c.img; im.alt = ''; im.loading = 'eager'; im.decoding = 'async';
  d.appendChild(im);
  return d;
}

async function runReel(){
  const rw = document.getElementById('reelWrap');
  const track = document.getElementById('reelTrack');
  reelTimers.forEach(clearTimeout); reelTimers.length = 0;
  rw.classList.remove('settle');
  rw.style.setProperty('--tier-glow', 'var(--accent-hi)');
  document.getElementById('reelEyebrow').textContent = 'OPENING';
  track.style.transition = 'none';
  track.style.transform = 'translateX(0)';
  track.innerHTML = '';

  const N = 84, K = 76;
  const win = winnerCard();
  const frag = document.createDocumentFragment();
  for (let i = 0; i < N; i++) frag.appendChild(buildTile(i === K ? win : weightedPick(), i === K));
  track.appendChild(frag);
  show('s-reel');

  // Commit the strip at translateX(0) with a forced reflow, then measure and
  // animate from that committed state. A reflow, not requestAnimationFrame,
  // because rAF is paused while the tab is hidden — which would strand the reel
  // half-open if the ripper glanced away — whereas a CSS transition keeps running.
  const winTile = track.children[K];
  const view = rw.querySelector('.reel-view');
  void track.offsetWidth;
  const center = view.clientWidth / 2;
  // A small off-centre stop reads more like a physical landing than a snap to
  // dead centre — kept well inside the tile so the winner is never ambiguous.
  const jitter = (Math.random() * 2 - 1) * winTile.offsetWidth * 0.26;
  const finalX = center - (winTile.offsetLeft + winTile.offsetWidth / 2) + jitter;

  // A long, front-loaded decel: whips fast, then crawls the last stretch for
  // real suspense. Longer runway (N/K above) keeps the opening quick to start
  // even at this length.
  const dur = reduceMotion ? 500 : 7000;
  track.style.transition = 'transform ' + dur + 'ms cubic-bezier(.10,.82,.10,1)';
  track.style.transform = 'translateX(' + finalX + 'px)';
  reelSound(track, view, dur);

  // The settle: in the final stretch, when the strip has slowed, the marker and
  // floor take the pull's tier colour. Honest — the outcome is already fixed.
  reelTimers.push(setTimeout(() => {
    rw.style.setProperty('--tier-glow', tierColor(result.tier));
    rw.classList.add('settle');
    document.getElementById('reelEyebrow').textContent = tierWord(result.tier);
  }, Math.max(0, dur - 1700)));

  await wait(dur + 90);
  winTile.classList.add('locked');
  sLand(result.tier);
  await wait(reduceMotion ? 80 : 620);
  present();
}

const card = document.getElementById('card');
async function present(){
  const ch = result.choreography;
  // The reel already turned the card face-up, so it presents face-up rather
  // than flipping — a second reveal of what you can already see. The foil,
  // tilt, tier dimming and grail takeover are unchanged.
  card.style.transition = 'none';
  card.classList.remove('grail');
  card.classList.add('flipped');
  card.setAttribute('data-foil', result.foil);
  void card.offsetWidth;            // commit the face-up state without animating
  // A short transition for the pointer tilt: responsive, but it eases back to
  // flat on pointer-leave instead of snapping. (The old flip duration is gone
  // with the flip.)
  card.style.transition = 'transform .3s var(--ease)';
  card.style.setProperty('--tilt','');
  document.getElementById('meta').classList.remove('on');
  document.getElementById('after').classList.remove('on');
  document.getElementById('grailTag').classList.remove('on');
  // The PSA slab: set the grade colour now, stamp the grade in after the card
  // settles (the seed decided this grade too — see grades.ts).
  const slab = document.getElementById('slab');
  slab.style.setProperty('--gc', result.gradeColor);
  document.getElementById('slabGrade').textContent = String(result.grade);
  document.getElementById('slabLabel').textContent = result.gradeLabel;
  document.getElementById('slabHead').classList.remove('on');
  show('s-card');
  // The card slams in (CSS #s-card.on .holder); a rare/grail landing also flashes.
  if (!reduceMotion && (result.tier === 'TIER_4' || result.tier === 'GRAIL')) flashTier(result.tier);
  reelTimers.push(setTimeout(() => {
    document.getElementById('slabHead').classList.add('on');
    if (!muted && !reduceMotion) sStamp();
  }, ch.fullTakeover ? 900 : 420));

  if (ch.fullTakeover){
    document.getElementById('chrome').classList.add('hide');
    const fx = document.getElementById('grailFx');
    // The bespoke grail vault sits behind the bloom and sparks; its centre
    // negative space frames the real card, dimmed slightly so the card stays
    // dominant. reset() clears fx.style.background, so nothing leaks to the next rip.
    fx.style.background =
      "linear-gradient(180deg,rgba(5,6,9,.34),rgba(5,6,9,.6)), #050609 url('/art/environments/grail-vault.png') center/cover no-repeat";
    fx.classList.add('on');
    sparks();
    card.classList.add('grail');
    setTimeout(() => document.getElementById('grailTag').classList.add('on'), 480);
  } else if (ch.dimBackground){
    const fx = document.getElementById('grailFx');
    fx.style.background = 'radial-gradient(62% 62% at 50% 48%,rgba(6,7,12,.58),rgba(5,6,9,.9))';
    fx.classList.add('on');
    // A rare/good pull earns its own proportionate spark burst, not the plain dim.
    if (!reduceMotion && (result.tier === 'TIER_3' || result.tier === 'TIER_4')) miniSparks(result.tier);
  }

  // Hold on the card before the numbers land — suspense scaled by tier, the
  // same choreography a grail uses to linger over the reveal.
  await wait(ch.suspenseMs + ch.metadataDelayMs);
  fill();
}

function fill(){
  document.getElementById('mName').textContent = result.name;
  document.getElementById('mSet').textContent =
    (result.setName + ' · ' + result.number + ' · ' + (result.rarity || '')).toUpperCase();
  const val = document.getElementById('mVal');
  // The graded value leads: gold for a PSA 10, accent for a 9, else the tier
  // colour the catalog uses. The base price sits under it.
  const gcls = result.grade >= 10 ? 'g10' : result.grade >= 9 ? 'g9' : 't-' + tierClass(result.tier);
  val.className = 'val ' + gcls;
  countTo(val, result.gradedValue, 900);
  document.getElementById('mBase').textContent =
    'PSA ' + result.grade + ' ' + result.gradeLabel + ' · base ' + fmt(result.referenceValue) +
    ' · ×' + result.gradeMultiplier;
  // Two chips, not four: an excitement word (carried by the value colour too) and
  // what kind of card it is. Tier-stat and odds are collector-sheet detail, not thrill.
  document.getElementById('mChips').innerHTML =
    '<span class="chip t" style="color:' + tierColor(result.tier) + '">' + tierWord(result.tier) + '</span>' +
    '<span class="chip">' + result.variantLabel.toUpperCase() + '</span>';
  const sb = document.getElementById('sellBtn');
  sb.classList.remove('sold', 'win'); sb.disabled = false;
  // A pull that sells for more than the pack cost is a winner — flag the profit
  // on the button and light it gold; the burst comes on the actual sell.
  const profit = result.sellValue - PACK_PRICE;
  sb.innerHTML = 'SELL · <span class="mono">' + rip$(result.sellValue) + '</span> <span class="ru">$RIP</span>' +
    (profit > 0 ? ' <span class="prof">▲ +' + rip$(profit) + '</span>' : '');
  if (profit > 0) sb.classList.add('win');
  document.getElementById('cardLink').href = result.href;
  document.getElementById('meta').classList.add('on');
  setTimeout(() => document.getElementById('after').classList.add('on'), 260);
  // Any trophies this rip newly earned drop in just after the numbers settle.
  // Capture the list now (a fast RIP ANOTHER nulls result before this fires) and
  // register the timer in reelTimers so reset() cancels it — otherwise a quick
  // re-rip could throw on a null result or paint this trophy over the next.
  if (result.unlockedAchievements && result.unlockedAchievements.length){
    const earned = result.unlockedAchievements;
    reelTimers.push(setTimeout(() => trophyMoment(earned), reduceMotion ? 300 : 780));
  }
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

// A scaled-down, tier-tinted burst for a good-but-not-grail landing (~30 motes,
// short life). Lives in #grailFx so reset() clears it. Never gold — gold is grail.
function miniSparks(tier){
  const fx = document.getElementById('grailFx');
  const cls = tier === 'TIER_4' ? 'spark t4' : 'spark t3';
  for(let i=0;i<30;i++){
    const s=document.createElement('i'); s.className=cls;
    const sz=1.2+(i%4)*0.6; s.style.width=sz+'px'; s.style.height=sz+'px';
    s.style.left=(i*41%100)+'%'; s.style.top=(56+(i*23%40))+'%';
    s.style.setProperty('--dx',(((i%7)-3)*9)+'px');
    s.style.animation='rise '+(1.5+(i%5)*0.3)+'s ease-out '+((i%9)*0.12)+'s forwards';
    fx.appendChild(s);
  }
}
// A single tint flash across the viewport on a rare/grail landing — the visual
// hit that matches the audio. Self-removes; nothing to clean up in reset().
function flashTier(tier){
  const f=document.createElement('div'); f.className='tier-flash';
  f.style.background = tier === 'GRAIL' ? 'rgba(245,196,81,.5)' : 'rgba(130,143,255,.5)';
  document.body.appendChild(f);
  setTimeout(()=>f.remove(), 460);
}

function reset(){
  reelTimers.forEach(clearTimeout); reelTimers.length = 0;
  document.getElementById('chrome').classList.remove('hide');
  const fx = document.getElementById('grailFx');
  fx.classList.remove('on'); fx.style.background=''; fx.innerHTML='';
  card.classList.remove('flipped','grail'); card.style.setProperty('--tilt','');
  const rw = document.getElementById('reelWrap');
  rw.classList.remove('settle'); rw.style.setProperty('--tier-glow','var(--accent-hi)');
  document.getElementById('reelTrack').innerHTML = '';
  document.getElementById('reelEyebrow').textContent = 'SETTLING';
  document.getElementById('slabHead').classList.remove('on');
  document.getElementById('toast').classList.remove('on');
  const co = document.getElementById('coins'); if (co) co.innerHTML = '';
  const pp = document.getElementById('profitPop'); if (pp) pp.classList.remove('on');
  trophyQueue.length = 0; trophyBusy = false;
  const tp = document.getElementById('trophyPop'); if (tp) tp.classList.remove('on');
  show('s-select');
}

document.getElementById('ripBtn').onclick = startRip;
document.getElementById('packArt').onclick = startRip;
// The CTA prints a ↵ affordance, so Enter has to actually rip. Scoped to the
// select step — an unguarded global would fire a second rip mid-reveal — and
// yielded to focused controls so Enter on RIP ANOTHER still means that button.
addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t instanceof Element && t.closest('a,button,input,textarea,select,[contenteditable]')) return;
  if (!document.getElementById('s-select').classList.contains('on')) return;
  e.preventDefault();
  startRip();
});
document.getElementById('retryBtn').onclick = () => { reset(); setTimeout(startRip, 300); };
document.getElementById('againBtn').onclick = () => { reset(); setTimeout(startRip, 420); };
// Sell the pull back for its frozen $RIP value (85% of graded value; the server
// is authoritative and refuses a second sale).
const sellBtn = document.getElementById('sellBtn');
sellBtn.onclick = async () => {
  if (!result || sellBtn.disabled || sellBtn.classList.contains('sold')) return;
  sellBtn.disabled = true;
  try {
    const r = await fetch('/api/sell', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ openingId: result.openingId })
    });
    const d = await r.json();
    if (r.ok){
      setBalance(d.balance, 'up');
      sellBtn.classList.remove('win'); sellBtn.classList.add('sold');
      sellBtn.innerHTML = 'SOLD · +<span class="mono">' + rip$(d.credited) + '</span> <span class="ru">$RIP</span>';
      const profit = d.credited - PACK_PRICE;
      if (profit > 0){
        coinBurst(Math.min(64, 16 + Math.round(profit / Math.max(1, PACK_PRICE)) * 5));
        profitPop('+' + rip$(profit) + ' $RIP');
        sCoins();
      } else if (!muted){ blip(680, 0.14, 'triangle', 0.08, 240); }
    } else {
      if (typeof d.balance === 'number') setBalance(d.balance);
      toast(d.error || 'Sell failed'); sellBtn.disabled = false;
    }
  } catch (e){ toast('Sell failed'); sellBtn.disabled = false; }
};
// Sound toggle — reflects the persisted mute state and flips it on click.
const mb = document.getElementById('muteBtn');
if (mb){ mb.classList.toggle('off', muted); mb.onclick = () => setMuted(!muted); }
refreshBalance();
new Image().src = ${JSON.stringify(packArt)};
</script>
${tokenUI()}
</body></html>`;
}
