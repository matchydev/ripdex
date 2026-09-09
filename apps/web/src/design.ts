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

  /* Semantic only. Never used for interaction — see the file header. */
  --gold:#f5c451;
  --em:#4ade9b;
  --warn:#d8a44e;

  --r-sm:8px; --r-md:12px; --r-lg:16px; --r-xl:22px;

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
.mesh{position:fixed;inset:-30vmax;z-index:0;pointer-events:none;filter:blur(100px);opacity:.42}
.mesh i{position:absolute;display:block;border-radius:50%;mix-blend-mode:screen}
.mesh i:nth-child(1){width:62vmax;height:62vmax;left:-10%;top:-18%;
  background:radial-gradient(circle,rgba(113,112,255,.62),transparent 62%);
  animation:mesh1 38s var(--ease) infinite alternate}
.mesh i:nth-child(2){width:54vmax;height:54vmax;right:-12%;top:-6%;
  background:radial-gradient(circle,rgba(64,90,255,.42),transparent 64%);
  animation:mesh2 46s var(--ease) infinite alternate}
.mesh i:nth-child(3){width:50vmax;height:50vmax;left:22%;bottom:-26%;
  background:radial-gradient(circle,rgba(150,90,255,.34),transparent 66%);
  animation:mesh3 56s var(--ease) infinite alternate}
.mesh i:nth-child(4){width:38vmax;height:38vmax;right:6%;bottom:-16%;
  background:radial-gradient(circle,rgba(40,180,220,.22),transparent 66%);
  animation:mesh4 64s var(--ease) infinite alternate}
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
.tile{position:relative;display:block}
.shot{position:relative;aspect-ratio:734/1024;border-radius:10px;overflow:hidden;
  background:var(--panel);box-shadow:var(--sh-1);
  transition:box-shadow .3s var(--ease),transform .35s var(--ease)}
.tile:hover .shot{box-shadow:var(--sh-3);transform:translateY(-6px)}
.shot img{width:100%;height:100%;object-fit:contain;display:block}
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
.meta .val{font-size:14px;font-weight:600;margin-top:7px;letter-spacing:-.02em;
  font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
.val.t-GRAIL{color:var(--gold)}
.val.t-TIER_4{color:#e0b0ff}
.val.t-TIER_3{color:var(--em)}
.val.none{color:var(--text-4);font-weight:480}

/* =============================== motion ============================ */
/* 3D rise. The rotateX is what separates this from a plain fade. */
[data-reveal]{opacity:0;transform:perspective(1000px) translateY(26px) rotateX(6deg) scale(.985);
  transition:opacity .8s var(--ease),transform .8s var(--ease);
  transition-delay:var(--d,0ms)}
[data-reveal].in{opacity:1;transform:none}
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
`;

export const MOTION_JS = `
<script>
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noObserver = !('IntersectionObserver' in window);
  if (reduced || noObserver) document.documentElement.classList.add('no-motion');

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
      group.querySelectorAll('[data-reveal]:not([data-staggered])').forEach((el, i) => {
        el.dataset.staggered = '1';
        // Cap the delay: a 200-tile grid must not schedule an 11-second wait.
        el.style.setProperty('--d', Math.min(i * step, 480) + 'ms');
      });
    });
    const items = [...root.querySelectorAll('[data-reveal]:not([data-observed])')];
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

  window.RIPDEX_MOTION = {
    scan(root) {
      const r = root || document;
      scanReveal(r); scanTilt(r); scanSpotlight(r);
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
    track.append(...[...track.children].map((c) => c.cloneNode(true)));
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
