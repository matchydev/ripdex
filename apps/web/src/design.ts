/**
 * The RIPDEX design system — Linear / Vercel / Framer register.
 *
 * Tokens are the ones the owner specified, unchanged: never pure black, never
 * pure white, one accent, shadow-as-border rather than a literal 1px border,
 * and a single expressive easing curve.
 *
 * One deliberate exception to "pick ONE accent": violet is the brand and the
 * only interaction colour, but a reserved gold is kept for grail-tier VALUE and
 * nothing else. That gold is data encoding — it is how a $900 card is
 * distinguished from a $9 one at a glance — not decoration. Emerald is used the
 * same way, for "a pricing provider confirmed this". Neither ever appears on a
 * button, a link or a border.
 *
 * Motion is opt-in through data attributes so markup stays declarative:
 *
 *   data-reveal            3D rise into view
 *   data-reveal-group="55" stagger children by N ms
 *   data-tilt="0.8"        pointer-tracked 3D tilt; writes --mx/--my for sheens
 *   data-spotlight         cursor-following glow inside a panel
 *   data-count="1234"      count up on reveal
 *   data-magnetic="0.3"    drifts toward the cursor
 *   data-marquee           seamless infinite scroll (needs an inner .track)
 *   data-parallax="0.15"   translate on scroll
 *
 * Everything degrades to a static, fully legible page without JavaScript, and
 * collapses under prefers-reduced-motion. That matters more here than usual:
 * a [data-reveal] element starts invisible, so a page that hides the catalog
 * behind a script that never runs is worse than a page with no motion at all.
 */

export const DESIGN_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..700&display=swap');

/* ============================== tokens ============================== */
:root{
  --bg:#08090a;
  --panel:#0f1011;
  --elevated:#191a1b;
  --hover:#28282c;

  --text:#f7f8f8;
  --text-2:#d0d6e0;
  --text-3:#8a8f98;
  --text-4:#858b96;

  --accent:#7170ff;
  --accent-hi:#828fff;
  --accent-dim:rgba(113,112,255,.14);

  --line:rgba(255,255,255,0.06);
  --line-hi:rgba(255,255,255,0.10);
  --line-max:rgba(255,255,255,0.18);
  --glass:rgba(255,255,255,0.03);

  --ease:cubic-bezier(0.16, 1, 0.3, 1);
  --spring:cubic-bezier(0.34, 1.4, 0.64, 1);

  /* Semantic only. Never used for interaction — see the file header. */
  --gold:#f5c451;
  --em:#4ade9b;
  --warn:#d8a44e;

  --r-sm:8px; --r-md:12px; --r-lg:16px; --r-xl:22px;

  /* Modular scales so rhythm is deliberate, not magic numbers. */
  --fs-1:11px; --fs-2:12px; --fs-3:13px; --fs-4:15px; --fs-5:18px;
  --fs-6:23px; --fs-7:32px; --fs-8:44px;
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:24px;
  --sp-6:32px; --sp-7:48px; --sp-8:64px; --sp-9:80px;

  /* Reusable gold-for-grail prestige (the one licensed exception to one-accent).
     Ramp intensity by rank/value at the call site; these are the base inks. */
  --gold-rim:rgba(245,196,81,.55);
  --gold-glow:rgba(245,196,81,.16);

  /* Compatibility aliases for the previous palette.
     An undefined custom property does not fall back — the whole declaration is
     invalid and silently does nothing, so a page still referencing --ink or
     --surface renders half-styled with no error anywhere. These keep every
     surface coherent while the page files are migrated one at a time. Delete
     this block once a grep for the old names across apps/web/src comes
     back empty. */
  --ink:var(--text);
  --surface:var(--glass);
  --surface-2:rgba(255,255,255,.055);
  --muted:var(--text-3);
  --faint:var(--text-4);
  --line-2:var(--line-hi);

  --sh-1:0 0 0 1px var(--line), 0 2px 4px rgba(0,0,0,.3), 0 12px 32px rgba(0,0,0,.2);
  --sh-2:0 0 0 1px var(--line-hi), 0 4px 8px rgba(0,0,0,.4), 0 20px 48px rgba(0,0,0,.3);
  --sh-3:0 0 0 1px var(--line-hi), 0 8px 16px rgba(0,0,0,.5), 0 40px 90px rgba(0,0,0,.45);

  --maxw:1320px;
}

*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{
  margin:0;background:var(--bg);color:var(--text);
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  font-feature-settings:"cv01","ss03";
  font-weight:510;font-size:15px;line-height:1.55;
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}
img{max-width:100%}
::selection{background:rgba(113,112,255,.32)}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:var(--elevated);border-radius:6px;border:2px solid var(--bg)}
::-webkit-scrollbar-thumb:hover{background:var(--hover)}

/* ========================== gradient mesh ========================== */
/* Large, slow, heavily blurred blobs. Fixed behind everything so the page
   breathes without any element on it moving. */
/* One violet blob only, pooled in the top-left corner; the rest are near-neutral
   cool-grey so the field reads as LIT, not as a purple template. The owner's
   rule "do not turn the site purple" is protected here at the ground level. */
.mesh{position:fixed;inset:-30vmax;z-index:0;pointer-events:none;filter:blur(100px);opacity:.15}
.mesh i{position:absolute;display:block;border-radius:50%;mix-blend-mode:screen}
.mesh i:nth-child(1){width:60vmax;height:60vmax;left:-12%;top:-22%;
  background:radial-gradient(circle,rgba(113,112,255,.46),transparent 62%);
  animation:mesh1 38s var(--ease) infinite alternate}
.mesh i:nth-child(2){width:52vmax;height:52vmax;right:-14%;top:-10%;
  background:radial-gradient(circle,rgba(240,138,64,.34),transparent 64%);
  animation:mesh2 46s var(--ease) infinite alternate}
.mesh i:nth-child(3){width:52vmax;height:52vmax;left:18%;bottom:-28%;
  background:radial-gradient(circle,rgba(94,110,152,.3),transparent 66%);
  animation:mesh3 56s var(--ease) infinite alternate}
.mesh i:nth-child(4){width:40vmax;height:40vmax;right:4%;bottom:-18%;
  background:radial-gradient(circle,rgba(64,148,176,.2),transparent 66%);
  animation:mesh4 64s var(--ease) infinite alternate}
/* A viewport vignette below the content, framing every page's dark stage so it
   reads as a lit scene with depth, not flat black. */
.atmos-vignette{position:fixed;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(128% 96% at 50% 30%,transparent 46%,rgba(3,4,7,.72) 100%)}
@keyframes mesh1{to{transform:translate3d(16vmax,12vmax,0) scale(1.2)}}
@keyframes mesh2{to{transform:translate3d(-18vmax,14vmax,0) scale(1.12)}}
@keyframes mesh3{to{transform:translate3d(12vmax,-16vmax,0) scale(1.24)}}
@keyframes mesh4{to{transform:translate3d(-10vmax,-12vmax,0) scale(1.16)}}

/* Fine grain so the large flat gradients never band. */
.grain{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.13;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/></filter><rect width='140' height='140' filter='url(%23n)' opacity='.55'/></svg>");
  animation:grainShift 8s steps(6) infinite}
@keyframes grainShift{
  0%{transform:translate(0,0)}20%{transform:translate(-3%,2%)}40%{transform:translate(2%,-3%)}
  60%{transform:translate(-2%,-2%)}80%{transform:translate(3%,1%)}100%{transform:translate(0,0)}}

/* ============================== chrome ============================= */
header.top{position:sticky;top:0;z-index:40;display:flex;align-items:center;gap:6px;
  padding:0 22px;height:56px;
  background:rgba(8,9,10,.72);backdrop-filter:blur(22px) saturate(1.6);
  box-shadow:0 1px 0 var(--line)}
.brand{font-weight:640;letter-spacing:-.02em;font-size:15px;margin-right:22px;
  display:flex;align-items:center;gap:8px}
.brand .dot{width:16px;height:16px;border-radius:5px;flex:0 0 auto;
  background:linear-gradient(140deg,var(--accent-hi),var(--accent) 52%,#4b47c9);
  box-shadow:0 0 0 1px rgba(255,255,255,.1),0 0 18px rgba(113,112,255,.55);
  animation:brandPulse 4s var(--ease) infinite}
@keyframes brandPulse{
  0%,100%{box-shadow:0 0 0 1px rgba(255,255,255,.1),0 0 18px rgba(113,112,255,.5)}
  50%{box-shadow:0 0 0 1px rgba(255,255,255,.14),0 0 26px rgba(113,112,255,.8)}}
nav.links{display:flex;gap:1px}
nav.links a{position:relative;font-size:13px;font-weight:510;color:var(--text-3);
  padding:7px 11px;border-radius:var(--r-sm);
  transition:color .2s var(--ease),background .2s var(--ease)}
nav.links a:hover{color:var(--text);background:var(--glass)}
nav.links a.on{color:var(--text);background:var(--glass)}
nav.links a.on::after{content:"";position:absolute;left:11px;right:11px;bottom:-13px;height:1.5px;
  background:var(--accent);border-radius:2px;box-shadow:0 0 12px var(--accent);
  animation:navIn .5s var(--spring)}
@keyframes navIn{from{transform:scaleX(0);opacity:0}to{transform:scaleX(1);opacity:1}}

.wrap{position:relative;z-index:2;max-width:var(--maxw);margin:0 auto;padding:40px 22px 120px}
/* A soft pool of accent light behind each content page's title, so the header
   reads as a lit focal point like the hero, not text on flat black. */
.wrap:not(.home-wrap)::before{content:"";position:absolute;z-index:-1;left:8px;top:-14px;
  width:min(720px,80%);height:300px;pointer-events:none;
  background:radial-gradient(56% 60% at 22% 32%,rgba(113,112,255,.13),transparent 72%)}

/* ============================ typography =========================== */
h1.page{margin:8px 0 10px;font-weight:590;letter-spacing:-.038em;line-height:1.0;
  font-size:clamp(2.5rem,7vw,4.6rem);
  background:linear-gradient(178deg,var(--text) 26%,#9aa0ad 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.lede{color:var(--text-3);font-size:15px;font-weight:480;letter-spacing:-.01em;
  margin:0 0 34px;max-width:62ch;line-height:1.6}
.lede b{color:var(--text-2);font-weight:560}
h2.sec{display:flex;align-items:center;gap:14px;font-size:12px;font-weight:560;
  letter-spacing:-.01em;color:var(--text-3);margin:52px 0 18px}
h2.sec::after{content:"";flex:1;height:1px;background:var(--line)}
.eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:540;
  letter-spacing:-.005em;color:var(--accent-hi);
  padding:5px 11px;border-radius:100px;background:var(--accent-dim);
  box-shadow:0 0 0 1px rgba(113,112,255,.2)}
.mono{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  font-variant-numeric:tabular-nums;letter-spacing:-.02em}

/* ============================= surfaces ============================ */
/* Shadow-as-border: no literal border, so nothing shifts on hover. */
.card{background:var(--glass);border-radius:var(--r-md);box-shadow:var(--sh-1);
  transition:box-shadow .25s var(--ease),transform .25s var(--ease),background .25s var(--ease)}
.card:hover{box-shadow:var(--sh-2)}
.card.lift:hover{transform:translateY(-3px)}

/* Cursor-following glow inside a panel. */
[data-spotlight]{position:relative;overflow:hidden}
[data-spotlight]::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;
  transition:opacity .3s var(--ease);
  background:radial-gradient(280px circle at var(--sx,50%) var(--sy,50%),
    rgba(113,112,255,.13),transparent 62%)}
[data-spotlight]:hover::before{opacity:1}

/* Animated gradient hairline. Reserved for the featured object on a page. */
.beam{position:relative}
.beam::after{content:"";position:absolute;left:0;right:0;top:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--accent),transparent);
  background-size:50% 100%;background-repeat:no-repeat;
  animation:beamSweep 3.4s var(--ease) infinite}
@keyframes beamSweep{0%{background-position:-60% 0}100%{background-position:160% 0}}

/* ============================== buttons ============================ */
.btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;
  padding:0 18px;height:40px;border-radius:var(--r-sm);
  font-size:13.5px;font-weight:560;letter-spacing:-.011em;white-space:nowrap;
  transition:background .2s var(--ease),box-shadow .2s var(--ease),transform .18s var(--spring)}
.btn-primary{background:var(--accent);color:#fff;
  box-shadow:0 0 0 1px rgba(255,255,255,.09) inset,0 1px 2px rgba(0,0,0,.4),
    0 8px 26px -10px rgba(113,112,255,.85)}
.btn-primary:hover{background:var(--accent-hi);
  box-shadow:0 0 0 1px rgba(255,255,255,.14) inset,0 2px 4px rgba(0,0,0,.4),
    0 14px 38px -10px rgba(113,112,255,1)}
.btn-ghost{background:var(--glass);color:var(--text-2);box-shadow:0 0 0 1px var(--line)}
.btn-ghost:hover{color:var(--text);background:rgba(255,255,255,.055);
  box-shadow:0 0 0 1px var(--line-hi)}
.btn-lg{height:48px;padding:0 26px;font-size:14.5px;border-radius:10px}
.btn:active{transform:scale(.975)}

/* =============================== tiles ============================= */
.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(176px,1fr))}
.tile{position:relative;display:block;isolation:isolate}

/* Ambient glow derived from the card's OWN artwork.
   A blurred, scaled, saturated copy of the same image sits behind the card, so
   the light spilling onto the page is that card's colour — a Charizard pools
   orange, a Blastoise pools blue. Apple Music and Spotify light album art this
   way for the same reason.
   This is what actually reconciles bright warm scans with a dark violet page:
   instead of every card fighting one accent, each brings its own bridge colour,
   and the ground reads as lit rather than as a backdrop the card was dropped
   onto. The tile sets --art; the URL is escaped at render time.
   Kept cheap: the blur is on a static layer that composites once, is inset well
   inside the tile so its bounds stay small, and does not animate — only its
   opacity does. */
.tile::before{content:"";position:absolute;z-index:-1;
  left:4%;right:4%;top:8%;bottom:-2%;
  background-image:var(--art);background-size:cover;background-position:50% 42%;
  filter:blur(22px) saturate(1.7);opacity:.38;transform:translateZ(0);
  transition:opacity .4s var(--ease),filter .4s var(--ease)}
.tile:hover::before{opacity:.72;filter:blur(26px) saturate(1.95)}
/* No artwork bound (a tile rendered without --art) must not paint a grey slab. */
.tile:not([style*="--art"])::before{display:none}
/* Card presentation.
   Measured off cardboard.markets, which presents the same source scans far more
   cleanly than we were. Four things matter, and we had all four wrong:

   1. RATIO. 63/88 is the real physical card, and the container must match the
      art or the card floats in dead space. We used 734/1024 against 600x825
      art, so every card was letterboxed with slivers top and bottom.
   2. object-fit COVER, not contain. With the ratio right, cover fills the frame
      edge to edge; the ~1.5% it trims is outer scan margin, which tightens the
      card rather than cutting into it.
   3. PERCENTAGE radius, on the IMAGE. A fixed 10px is too round on a 60px feed
      thumbnail and too square on a 430px hero. A percentage tracks the card's
      real corner geometry at every size, and rounding the image itself means
      the square scan corner is gone rather than merely clipped by a parent.
   4. A COLOURED ambient shadow plus a lit top edge. Pure black makes a bright
      card look like it is sitting in a hole punched out of the page. Tinting
      the shadow with the page's own violet, and adding a 1px inner highlight
      along the top, makes the card read as lit by the same room. */
.shot{position:relative;aspect-ratio:63/88;border-radius:4.5% / 3.2%;overflow:hidden;
  background:var(--panel);
  box-shadow:0 12px 28px rgba(60,58,140,.34),0 2px 6px rgba(0,0,0,.5),
    0 0 0 1px var(--line),inset 0 1px 0 rgba(255,255,255,.16);
  transition:box-shadow .3s var(--ease),transform .35s var(--ease)}
.tile:hover .shot{transform:translateY(-6px);
  box-shadow:0 22px 52px rgba(80,76,190,.46),0 4px 12px rgba(0,0,0,.55),
    0 0 0 1px var(--line-hi),inset 0 1px 0 rgba(255,255,255,.22)}
.shot img{width:100%;height:100%;object-fit:cover;display:block;
  border-radius:inherit;background:var(--panel)}
/* Specular sheen tracking the same --mx/--my the tilt handler writes. */
.shot::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;
  background:radial-gradient(58% 44% at var(--mx,50%) var(--my,40%),rgba(255,255,255,.22),transparent 66%);
  mix-blend-mode:overlay;transition:opacity .3s var(--ease)}
.tile:hover .shot::after{opacity:1}

.rip-badge{position:absolute;top:8px;left:8px;z-index:2;font-size:10px;font-weight:560;
  letter-spacing:-.008em;padding:4px 8px;border-radius:6px;color:#fff;background:var(--accent);
  box-shadow:0 2px 10px rgba(113,112,255,.6)}
.vcount{position:absolute;top:8px;right:8px;z-index:2;font-size:10px;font-weight:520;
  background:rgba(8,9,10,.78);backdrop-filter:blur(8px);color:var(--text-3);
  padding:4px 8px;border-radius:6px;box-shadow:0 0 0 1px var(--line)}
.meta{padding:12px 2px 0}
.meta .nm{font-size:14px;font-weight:560;letter-spacing:-.014em;line-height:1.3;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta .sub{font-size:12px;font-weight:460;color:var(--text-4);margin-top:3px;letter-spacing:-.008em;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta .rar{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:5px;font-size:9.5px;
  font-weight:640;letter-spacing:.04em;text-transform:uppercase;color:var(--text-3);
  background:var(--glass);box-shadow:0 0 0 1px var(--line);vertical-align:1px}
.meta .val{font-size:14px;font-weight:600;margin-top:7px;letter-spacing:-.02em;
  font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
.val.t-GRAIL{color:var(--gold)}
.val.t-TIER_4{color:var(--accent-hi)}
.val.t-TIER_3{color:var(--em)}
.val.none{color:var(--text-4);font-weight:480}

/* =============================== motion ============================ */
/* 3D rise. The rotateX is what separates this from a plain fade. */
.motion-ready [data-reveal]{opacity:0;transform:perspective(1000px) translateY(26px) rotateX(6deg) scale(.985);
  transition:opacity .8s var(--ease),transform .8s var(--ease);
  transition-delay:var(--d,0ms)}
.motion-ready [data-reveal].in{opacity:1;transform:none}
/* Fallback: if the runtime never runs, content must still be visible. */
.no-motion [data-reveal]{opacity:1!important;transform:none!important}

.tilt-wrap{perspective:1200px}
[data-tilt]{transition:transform .45s var(--ease);transform-style:preserve-3d;will-change:transform}

.shimmer{position:relative;overflow:hidden;background:var(--panel)}
.shimmer::after{content:"";position:absolute;inset:0;
  background:linear-gradient(105deg,transparent 32%,rgba(255,255,255,.07) 48%,transparent 64%);
  background-size:220% 100%;animation:shim 1.7s linear infinite}
@keyframes shim{to{background-position:-220% 0}}

.pulse-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--em);
  box-shadow:0 0 0 0 rgba(74,222,155,.6);animation:pulseRing 2.2s var(--ease) infinite;
  margin-right:8px;vertical-align:middle}
@keyframes pulseRing{
  0%{box-shadow:0 0 0 0 rgba(74,222,155,.55)}
  70%{box-shadow:0 0 0 10px rgba(74,222,155,0)}
  100%{box-shadow:0 0 0 0 rgba(74,222,155,0)}}

.marquee{overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)}
.marquee .track{display:flex;gap:16px;width:max-content;
  animation:slideTrack var(--dur,52s) linear infinite}
.marquee:hover .track{animation-play-state:paused}
@keyframes slideTrack{to{transform:translateX(-50%)}}

.rail{display:flex;gap:20px;overflow-x:auto;padding:4px 2px 18px;scroll-snap-type:x mandatory}
.rail .tile{flex:0 0 184px;scroll-snap-align:start}

.empty-state{border-radius:var(--r-md);padding:48px 24px;text-align:center;
  color:var(--text-4);font-size:13.5px;background:var(--glass);
  box-shadow:0 0 0 1px var(--line)}

/* Scroll progress, top of viewport. */
.scrollbar-top{position:fixed;left:0;top:0;height:2px;z-index:60;transform-origin:0 50%;
  transform:scaleX(0);background:linear-gradient(90deg,var(--accent),var(--accent-hi));
  box-shadow:0 0 12px rgba(113,112,255,.8)}

/* ============================ real 3D ============================== */
/* Genuine depth, not a fake shadow. A .scene establishes the camera; children
   with .depth become their own 3D space, and [data-layer] planes inside them
   sit at different Z so they separate as the card turns. That parallax between
   planes is the whole difference between a rotated picture and an object. */
.scene{perspective:1400px;perspective-origin:50% 45%}
.scene-near{perspective:900px}
.depth{transform-style:preserve-3d;will-change:transform;
  transition:transform .5s var(--ease)}
[data-layer]{transform-style:preserve-3d;will-change:transform}

/* A card built as stacked planes: art at the back, gloss and badges forward. */
.card3d{position:relative;transform-style:preserve-3d}
.card3d .plane{position:absolute;inset:0;border-radius:inherit;backface-visibility:hidden}
.card3d .plane-art{transform:translateZ(0px)}
.card3d .plane-gloss{transform:translateZ(18px);pointer-events:none;
  background:linear-gradient(125deg,transparent 38%,rgba(255,255,255,.16) 50%,transparent 62%);
  opacity:0;transition:opacity .35s var(--ease)}
.card3d:hover .plane-gloss{opacity:1}
.card3d .plane-badge{transform:translateZ(34px)}
/* Rim light on the leading edge, so the object reads as lit from one side. */
.card3d .plane-rim{transform:translateZ(2px);pointer-events:none;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.10),
    inset 0 1px 0 rgba(255,255,255,.16)}

/* Contact shadow that lives on the ground plane rather than on the object. */
.grounded{position:relative}
.grounded::after{content:"";position:absolute;left:8%;right:8%;bottom:-7%;height:14%;
  border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,.62),transparent 70%);
  filter:blur(14px);transform:translateZ(-60px);transition:all .5s var(--ease);z-index:-1}
.grounded:hover::after{left:14%;right:14%;bottom:-11%;filter:blur(20px);opacity:.85}

/* Slow idle float. Vary --float-dur / --float-delay per element so a row of
   objects never beats in sync — synchronised floating reads as a loop, not life. */
@keyframes floatY{
  0%,100%{transform:translate3d(0,0,0)}
  50%{transform:translate3d(0,calc(var(--float-amp,10px) * -1),0)}}
.floaty{animation:floatY var(--float-dur,7s) var(--ease) infinite;
  animation-delay:var(--float-delay,0s)}

/* Scroll-driven 3D entrance: rotates up onto its feet as it enters view. */
.motion-ready [data-reveal-3d]{opacity:0;
  transform:perspective(1200px) translateY(46px) rotateX(24deg) scale(.94);
  transform-origin:50% 100%;
  transition:opacity .9s var(--ease),transform .9s var(--ease);
  transition-delay:var(--d,0ms)}
.motion-ready [data-reveal-3d].in{opacity:1;transform:none}
.no-motion [data-reveal-3d]{opacity:1!important;transform:none!important}

/* =============================== forms ============================= */
input[type=search],select,input[type=number]{
  background:var(--glass);color:var(--text);box-shadow:0 0 0 1px var(--line);border:0;
  border-radius:var(--r-sm);padding:0 12px;height:38px;font:inherit;font-size:13.5px;
  font-weight:510;outline:none;
  transition:box-shadow .2s var(--ease),background .2s var(--ease)}
input:hover,select:hover{box-shadow:0 0 0 1px var(--line-hi)}
input:focus,select:focus{background:rgba(255,255,255,.05);
  box-shadow:0 0 0 1px var(--accent),0 0 0 4px var(--accent-dim)}
select{cursor:pointer;min-width:136px;appearance:none;padding-right:30px;
  background-image:linear-gradient(45deg,transparent 50%,var(--text-4) 50%),
    linear-gradient(135deg,var(--text-4) 50%,transparent 50%);
  background-position:calc(100% - 16px) 17px,calc(100% - 11px) 17px;
  background-size:5px 5px,5px 5px;background-repeat:no-repeat}
input[type=search]{min-width:250px}
input[type=number]{width:104px}
.chk{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 12px;
  font-size:13px;font-weight:510;color:var(--text-3);cursor:pointer;
  border-radius:var(--r-sm);background:var(--glass);box-shadow:0 0 0 1px var(--line);
  transition:color .2s var(--ease),box-shadow .2s var(--ease)}
.chk:hover{color:var(--text);box-shadow:0 0 0 1px var(--line-hi)}
.chk input{accent-color:var(--accent)}

/* ========================== reduced motion ========================= */
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;
    transition-duration:.1s!important;scroll-behavior:auto!important}
  [data-reveal]{opacity:1!important;transform:none!important}
  .mesh,.grain{animation:none!important}
}
@media(max-width:640px){
  .wrap{padding:26px 16px 90px}
  header.top{padding:0 12px}
  nav.links a{padding:7px 8px;font-size:12px}
}
/* Shared collector workspace: legible chrome, quiet surfaces, artwork first. */
header.top{height:68px;padding:0 max(24px,calc((100vw - 1136px)/2));gap:24px}
.brand{font-size:23px;font-weight:650;letter-spacing:-.065em;margin-right:22px;gap:10px}
.brand .dot{width:21px;height:24px;border-radius:2px;clip-path:polygon(20% 0,100% 0,80% 42%,100% 42%,30% 100%,43% 55%,0 55%);animation:none;box-shadow:none}
nav.links{gap:5px;align-items:center}
nav.links a{font-size:11px;letter-spacing:.045em;padding:12px 13px}
nav.links a.on{background:none;color:var(--text)}
nav.links a.on::after{bottom:-10px;box-shadow:none}
.header-action{margin-left:auto;white-space:nowrap;font-size:11px;height:34px;padding:0 15px}
.wrap{padding-top:50px}
h1.page{font-size:clamp(40px,6vw,64px);padding-top:4px;letter-spacing:-.05em;color:var(--text);background:none}
.eyebrow{background:none;box-shadow:none;padding:0;font-size:10px;letter-spacing:.13em;border-radius:0;margin-bottom:10px}
.lede{font-size:14px;line-height:1.8}
.grid{gap:32px 24px;grid-template-columns:repeat(auto-fill,minmax(165px,1fr))}
.tile::before{opacity:.18}.tile:hover::before{opacity:.38}
.meta{padding-top:13px}.meta .nm{font-size:13px}.meta .sub{font-size:11px}
:focus-visible{outline:2px solid var(--accent-hi);outline-offset:5px}
input:focus-visible,select:focus-visible{outline-offset:2px}
.skip-link{position:fixed;top:10px;left:16px;z-index:100;padding:12px 20px;background:var(--panel);transform:translateY(-180%)}
.skip-link:focus{transform:translateY(0)}
.site-footer{position:relative;z-index:2;max-width:var(--maxw);margin:auto;padding:54px 24px 46px;
  display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:30px 40px;box-shadow:0 -1px 0 var(--line);
  font-size:12px;color:var(--text-4)}
.footer-wordmark{display:inline-flex;align-items:center;gap:8px;font-size:18px;letter-spacing:-.05em;color:var(--text-2);font-weight:650}
.footer-tag{margin:14px 0 0;max-width:36ch;font-size:12px;line-height:1.7;color:var(--text-3)}
.footer-col{display:flex;flex-direction:column;align-items:flex-start;gap:11px}
.footer-h{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--text-4);font-weight:600;margin-bottom:2px}
.footer-col a,.footer-col button{font-size:13px;color:var(--text-3);padding:0;transition:color .18s var(--ease)}
.footer-col a:hover,.footer-col button:hover{color:var(--text)}
.footer-meta{grid-column:1/-1;display:flex;justify-content:space-between;flex-wrap:wrap;gap:14px;
  padding-top:26px;box-shadow:0 -1px 0 var(--line);font-size:11px;color:var(--text-4)}
.table-scroll{overflow-x:auto;width:100%;margin:20px 0;overscroll-behavior-x:contain}
.table-scroll table{min-width:600px}
.marquee:focus-within .track{animation-play-state:paused}
@media(max-width:760px){
 header.top{height:104px;display:grid;grid-template-columns:1fr auto;grid-template-rows:56px 48px;gap:0;padding:0 20px}
 .brand{font-size:22px;margin:0}.header-action{grid-column:2;grid-row:1}
 nav.links{grid-column:1/-1;grid-row:2;justify-content:space-between;gap:0}
 nav.links a{font-size:10px;padding:12px 7px;white-space:nowrap}
 nav.links a.on::after{bottom:0;left:7px;right:7px}
 .wrap{padding-top:30px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:26px 16px}
 .site-footer{grid-template-columns:1fr 1fr;padding:36px 20px 28px;gap:24px 20px}.footer-brand{grid-column:1/-1}
 .btn,.chk,input[type=search],input[type=number],select{min-height:44px}
}
@media(prefers-reduced-motion:reduce){
 .motion-ready [data-reveal-3d]{opacity:1!important;transform:none!important}
}

`;

export const MOTION_JS = `
<script>
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noObserver = !('IntersectionObserver' in window);
  if (reduced || noObserver) document.documentElement.classList.add('no-motion');
  else document.documentElement.classList.add('motion-ready');

  /* ---- 3D scroll reveal, with stagger ----
     Exposed as a rescan because the Pokedex grid inserts tiles by fetch. A
     [data-reveal] tile starts at opacity 0, so anything added after load that
     nobody re-scanned would stay permanently invisible — the failure mode is a
     blank catalog, not a missing flourish. */
  const io = (reduced || noObserver) ? null : new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.03 });

  function scanReveal(root) {
    root.querySelectorAll('[data-reveal-group]').forEach((group) => {
      const step = Number(group.dataset.revealGroup) || 55;
      group.querySelectorAll('[data-reveal]:not([data-staggered]),[data-reveal-3d]:not([data-staggered])').forEach((el, i) => {
        el.dataset.staggered = '1';
        // Cap the delay: a 200-tile grid must not schedule an 11-second wait.
        el.style.setProperty('--d', Math.min(i * step, 480) + 'ms');
      });
    });
    const items = [...root.querySelectorAll('[data-reveal]:not([data-observed]),[data-reveal-3d]:not([data-observed])')];
    items.forEach((el) => {
      el.dataset.observed = '1';
      if (io) io.observe(el); else el.classList.add('in');
    });
    requestAnimationFrame(() => {
      items.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < innerHeight && r.bottom > 0) el.classList.add('in');
      });
    });
  }

  /* ---- pointer-tracked 3D tilt ---- */
  const MAX = 10;
  function scanTilt(root) {
    if (reduced) return;
    root.querySelectorAll('[data-tilt]:not([data-tilted])').forEach((el) => {
      el.dataset.tilted = '1';
      const strength = Number(el.dataset.tilt) || 1;
      let raf = 0;
      el.addEventListener('pointermove', (ev) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = el.getBoundingClientRect();
          const x = (ev.clientX - r.left) / r.width;
          const y = (ev.clientY - r.top) / r.height;
          el.style.transform =
            'perspective(1200px) rotateY(' + ((x - .5) * MAX * 2 * strength).toFixed(2) +
            'deg) rotateX(' + ((.5 - y) * MAX * 2 * strength).toFixed(2) + 'deg)';
          el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
          el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        });
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---- cursor-following spotlight inside panels ---- */
  function scanSpotlight(root) {
    if (reduced) return;
    root.querySelectorAll('[data-spotlight]:not([data-spotlit])').forEach((el) => {
      el.dataset.spotlit = '1';
      let raf = 0;
      el.addEventListener('pointermove', (ev) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = el.getBoundingClientRect();
          el.style.setProperty('--sx', (ev.clientX - r.left).toFixed(0) + 'px');
          el.style.setProperty('--sy', (ev.clientY - r.top).toFixed(0) + 'px');
        });
      });
    });
  }

  /* ---- layered 3D: planes inside a tilted card drift against each other ----
     A single rotation moves every plane identically, which the eye reads as a
     rotated picture. Giving each [data-layer] its own translateZ and a small
     counter-translation is what makes it read as an object with thickness. */
  function scanDepth(root) {
    if (reduced) return;
    root.querySelectorAll('[data-depth]:not([data-depthed])').forEach((el) => {
      el.dataset.depthed = '1';
      const strength = Number(el.dataset.depth) || 1;
      const layers = [...el.querySelectorAll('[data-layer]')].map((n) => ({
        node: n,
        z: Number(n.dataset.layer) || 0,
      }));
      let raf = 0;
      el.addEventListener('pointermove', (ev) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = el.getBoundingClientRect();
          const x = (ev.clientX - r.left) / r.width - .5;
          const y = (ev.clientY - r.top) / r.height - .5;
          el.style.transform =
            'rotateY(' + (x * 16 * strength).toFixed(2) + 'deg) rotateX(' +
            (-y * 16 * strength).toFixed(2) + 'deg)';
          el.style.setProperty('--mx', ((x + .5) * 100).toFixed(1) + '%');
          el.style.setProperty('--my', ((y + .5) * 100).toFixed(1) + '%');
          for (const l of layers) {
            l.node.style.transform =
              'translate3d(' + (-x * l.z * .55).toFixed(1) + 'px,' +
              (-y * l.z * .55).toFixed(1) + 'px,' + l.z + 'px)';
          }
        });
      });
      el.addEventListener('pointerleave', () => {
        el.style.transform = '';
        for (const l of layers) l.node.style.transform = 'translateZ(' + l.z + 'px)';
      });
    });
  }

  window.RIPDEX_MOTION = {
    scan(root) {
      const r = root || document;
      scanReveal(r); scanTilt(r); scanSpotlight(r); scanDepth(r);
    },
  };
  window.RIPDEX_MOTION.scan(document);

  /* ---- count-up numbers ---- */
  const fmt = (n, dp, prefix) =>
    prefix + n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target)) return;
    const dp = Number(el.dataset.countDp ?? 0);
    const prefix = el.dataset.countPrefix ?? '';
    if (reduced) { el.textContent = fmt(target, dp, prefix); return; }
    let started = false;
    const run = () => {
      if (started) return; started = true;
      const dur = 1250, t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        el.textContent = fmt(target * e, dp, prefix);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (noObserver) { run(); return; }
    const o = new IntersectionObserver((es) => { if (es[0].isIntersecting) { run(); o.disconnect(); } },
      { threshold: .3 });
    o.observe(el);
  });

  /* ---- magnetic elements ---- */
  if (!reduced && matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      const pull = Number(el.dataset.magnetic) || 0.25;
      el.addEventListener('pointermove', (ev) => {
        const r = el.getBoundingClientRect();
        el.style.translate =
          ((ev.clientX - (r.left + r.width / 2)) * pull).toFixed(1) + 'px ' +
          ((ev.clientY - (r.top + r.height / 2)) * pull).toFixed(1) + 'px';
      });
      el.addEventListener('pointerleave', () => { el.style.translate = ''; });
    });
  }

  /* ---- marquee: duplicate the track so the loop is seamless ---- */
  document.querySelectorAll('[data-marquee] .track').forEach((track) => {
    track.append(...[...track.children].map((c) => {
      const copy = c.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('inert', '');
      return copy;
    }));
  });

  /* ---- parallax + scroll progress ---- */
  if (!reduced) {
    const layers = [...document.querySelectorAll('[data-parallax]')];
    const bar = document.querySelector('.scrollbar-top');
    if (layers.length || bar) {
      let raf = 0;
      const onScroll = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const y = scrollY;
          for (const l of layers) {
            l.style.transform = 'translate3d(0,' + (y * Number(l.dataset.parallax || .15)).toFixed(1) + 'px,0)';
          }
          if (bar) {
            const max = document.documentElement.scrollHeight - innerHeight;
            bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0).toFixed(4) + ')';
          }
        });
      };
      addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }
})();
</script>`;
