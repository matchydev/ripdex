/**
 * The rip experience, wired to the real engine (spec §6, §7, §20, §21).
 *
 * The standalone demo drew from a pool hardcoded in the page. This one asks the
 * server, which runs the actual §17 sequence — frozen snapshot, committed seed,
 * openPack — and records the result to the ledger. The outcome is therefore
 * already determined and already recorded before a single pixel of the reveal
 * animation runs, which is the only ordering that makes the reveal honest: the
 * animation is a presentation of a settled fact, not part of deciding it.
 */

import type { CardListing, PackConfig } from '../../../packages/pokemon-core/src/index.ts';
import { esc } from './render.ts';

const RIP_CSS = `
:root{--card-w:min(66vw,332px);--card-ar:734/1024;--gold:#F2C14E;--accent:#FF6B1A}
body{margin:0;background:#07070A;color:#F5F3F0;overflow:hidden;overscroll-behavior:none;
  font:400 15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,sans-serif}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background:radial-gradient(120% 70% at 50% -10%,rgba(255,107,26,.13),transparent 60%)}
a{color:inherit;text-decoration:none}
#chrome{position:fixed;inset:14px 16px auto;z-index:5;display:flex;justify-content:space-between;
  align-items:center;font-size:11px;letter-spacing:.16em;color:#8A8894;transition:opacity .6s}
#chrome.hide{opacity:0;pointer-events:none}
.brand{color:#F5F3F0;font-weight:700;letter-spacing:.3em}.brand span{color:var(--accent)}
#stage{position:relative;z-index:2;height:100vh;display:grid;place-items:center;padding:20px}
.scene{position:absolute;inset:0;display:grid;place-items:center;opacity:0;visibility:hidden;
  transition:opacity .45s ease,visibility .45s;padding:20px}
.scene.on{opacity:1;visibility:visible}
.kicker{font-size:10.5px;letter-spacing:.34em;color:#8A8894;text-align:center}
.pack{width:var(--card-w);aspect-ratio:var(--card-ar);position:relative;margin:26px auto 0;
  border-radius:12px;overflow:hidden;cursor:pointer;
  background:linear-gradient(160deg,#1A0B06,#2A0F08 38%,#120608);
  box-shadow:0 30px 70px -24px rgba(0,0,0,.95),0 0 0 1px rgba(255,255,255,.07),inset 0 1px 0 rgba(255,255,255,.14);
  transform:rotateX(8deg) rotateY(-9deg);transition:transform .7s cubic-bezier(.2,.8,.2,1)}
.pack:hover{transform:rotateX(3deg) rotateY(-3deg) translateY(-6px)}
.pack::after{content:"";position:absolute;inset:0;mix-blend-mode:screen;
  background:linear-gradient(74deg,transparent 30%,rgba(255,190,120,.42) 47%,rgba(255,255,255,.7) 50%,rgba(255,150,60,.4) 53%,transparent 70%);
  transform:translateX(-120%);animation:sweep 4.6s cubic-bezier(.4,0,.2,1) infinite}
@keyframes sweep{0%,55%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
.pack-hero{position:absolute;inset:0;background-size:178%;background-position:50% 24%;opacity:.62;
  filter:saturate(1.2) contrast(1.08)}
.pack-hero::after{content:"";position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(10,4,2,.25),rgba(10,4,2,.86) 72%,#0B0503)}
.pack-label{position:absolute;left:0;right:0;bottom:0;padding:16px 14px 18px;text-align:center}
.pack-label .nm{font-size:clamp(15px,4.2vw,19px);font-weight:800;letter-spacing:.06em;text-shadow:0 2px 18px #000}
.pack-top{position:absolute;top:0;left:0;right:0;height:26px;
  background:linear-gradient(180deg,rgba(255,255,255,.16),transparent);
  border-bottom:1px dashed rgba(255,255,255,.22)}
.meta{display:flex;gap:26px;justify-content:center;margin-top:22px;text-align:center}
.meta .k{font-size:9.5px;letter-spacing:.2em;color:#8A8894}
.meta .v{margin-top:5px;font-size:15px;font-weight:700}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}
.cta{display:block;margin:26px auto 0;padding:15px 40px;border-radius:12px;font-weight:800;
  letter-spacing:.16em;font-size:13px;background:linear-gradient(180deg,#FF7E33,#E2510A);color:#180701;
  box-shadow:0 14px 34px -12px rgba(255,107,26,.75),inset 0 1px 0 rgba(255,255,255,.4);transition:transform .18s}
.cta:hover{transform:translateY(-2px)}
.cta[disabled]{opacity:.5;cursor:default;transform:none}
.ghost{display:block;margin:14px auto 0;font-size:11px;letter-spacing:.2em;color:#8A8894}
.ghost:hover{color:#F5F3F0}
.status{text-align:center}
.status .big{font-size:12px;letter-spacing:.36em;color:#8A8894}
.status .big b{color:#F5F3F0;font-weight:700}
.bar{width:min(78vw,300px);height:2px;background:rgba(255,255,255,.1);margin:22px auto 0;border-radius:2px;overflow:hidden}
.bar i{display:block;height:100%;width:35%;border-radius:2px;
  background:linear-gradient(90deg,transparent,var(--accent),transparent);animation:slide 1.05s ease-in-out infinite}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(330%)}}
.shimmer{width:var(--card-w);aspect-ratio:var(--card-ar);margin:0 auto 26px;border-radius:14px;
  background:linear-gradient(110deg,#141018 30%,#2A2233 48%,#141018 66%);background-size:220% 100%;
  animation:shim 1.5s linear infinite;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
@keyframes shim{to{background-position:-220% 0}}
#tearWrap{position:relative;width:var(--card-w);aspect-ratio:var(--card-ar);touch-action:none;user-select:none}
#tearWrap .pack{margin:0;width:100%;cursor:grab;transform:none}
#tearWrap .pack:hover{transform:none}
.strip{position:absolute;left:0;right:0;top:0;height:26px;z-index:3;
  background:linear-gradient(180deg,#3A1C0C,#1C0D06);box-shadow:0 2px 10px rgba(0,0,0,.6);
  clip-path:polygon(0 0,100% 0,100% 62%,96% 100%,92% 58%,88% 100%,84% 58%,80% 100%,76% 58%,72% 100%,68% 58%,64% 100%,60% 58%,56% 100%,52% 58%,48% 100%,44% 58%,40% 100%,36% 58%,32% 100%,28% 58%,24% 100%,20% 58%,16% 100%,12% 58%,8% 100%,4% 58%,0 100%)}
.hint{position:absolute;left:50%;top:40px;transform:translateX(-50%);font-size:10px;letter-spacing:.24em;
  color:rgba(255,255,255,.72);white-space:nowrap;pointer-events:none;z-index:4;text-shadow:0 2px 12px #000;
  animation:pulse 1.9s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.42}50%{opacity:1}}
.holder{perspective:1400px;width:var(--card-w);aspect-ratio:var(--card-ar);position:relative}
.card{position:absolute;inset:0;transform-style:preserve-3d;transform:rotateY(180deg) var(--tilt,);
  transition:transform 1s cubic-bezier(.2,.75,.2,1)}
.card.flipped{transform:rotateY(0deg) var(--tilt,)}
.face{position:absolute;inset:0;backface-visibility:hidden;border-radius:4.6%/3.3%;overflow:hidden;
  box-shadow:0 26px 60px -20px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.08)}
.back{transform:rotateY(180deg);display:grid;place-items:center;
  background:repeating-linear-gradient(45deg,rgba(255,255,255,.028) 0 8px,transparent 8px 16px),
    radial-gradient(120% 80% at 50% 30%,#2A1330,#120A1C 60%,#0A0612)}
.back .sigil{width:42%;aspect-ratio:1;border-radius:50%;border:1px solid rgba(255,255,255,.16);
  display:grid;place-items:center;background:radial-gradient(circle at 38% 32%,rgba(255,255,255,.12),transparent 60%);
  box-shadow:inset 0 0 40px rgba(255,107,26,.14)}
.back .sigil b{font:800 13px/1 ui-sans-serif;letter-spacing:.28em;color:#D8CCE6}
.back .edge{position:absolute;inset:5.5%;border-radius:3.4%;border:1px solid rgba(255,255,255,.09)}
.front{background:#000}
.front img{width:100%;height:100%;display:block;object-fit:contain}
.foil{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .8s}
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
.reveal-meta{margin-top:26px;text-align:center;opacity:0;transform:translateY(10px);
  transition:opacity .7s,transform .7s}
.reveal-meta.on{opacity:1;transform:none}
.reveal-meta .nm{font-size:clamp(20px,5.4vw,28px);font-weight:800;letter-spacing:-.01em}
.reveal-meta .st{margin-top:5px;font-size:10.5px;letter-spacing:.22em;color:#8A8894}
.reveal-meta .val{margin-top:14px;font-size:clamp(24px,6vw,32px);font-weight:800;color:var(--gold);
  font-family:ui-monospace,Menlo,monospace}
.reveal-meta .vk{font-size:9.5px;letter-spacing:.24em;color:#8A8894;margin-top:3px}
.chips{display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap}
.chip{font-size:9.5px;letter-spacing:.16em;padding:6px 11px;border-radius:7px;
  border:1px solid rgba(255,255,255,.10);color:#8A8894}
.chip.t{color:#FFD9A8;border-color:rgba(255,180,90,.4)}
#grailFx{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:0;transition:opacity 1s;background:#000}
#grailFx.on{opacity:1}
.spark{position:absolute;width:2px;height:2px;border-radius:50%;background:#FFE9B0;
  box-shadow:0 0 7px 2px rgba(255,215,120,.85);opacity:0}
@keyframes rise{0%{opacity:0;transform:translateY(24px) scale(.4)}18%{opacity:1}70%{opacity:.85}
  100%{opacity:0;transform:translateY(-150px) scale(1.15)}}
.grail-tag{font-size:10.5px;letter-spacing:.44em;color:var(--gold);text-align:center;margin-bottom:16px;
  opacity:0;transition:opacity .8s}
.grail-tag.on{opacity:1}
.card.grail .face.front{box-shadow:0 0 0 1px rgba(255,215,120,.5),0 0 70px rgba(255,190,90,.42),0 30px 70px -20px #000}
.rowbtns{display:flex;gap:10px;justify-content:center;margin-top:24px;flex-wrap:wrap;opacity:0;transition:opacity .6s}
.rowbtns.on{opacity:1}
.btn2{padding:12px 22px;border-radius:10px;border:1px solid rgba(255,255,255,.10);font-size:11px;
  letter-spacing:.18em;transition:border-color .2s,background .2s}
.btn2:hover{border-color:rgba(255,255,255,.3);background:rgba(255,255,255,.05)}
.btn2.pri{background:linear-gradient(180deg,#FF7E33,#E2510A);color:#180701;border-color:transparent;font-weight:700}
.err{max-width:44ch;text-align:center;color:#FF9A9A;font-size:13px;line-height:1.6}
@media(prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.12s!important}}
`;

function heroFor(pack: PackConfig, best: CardListing | null): string {
  return pack.artwork.heroImageUrl ?? best?.imageLarge ?? '';
}

export function ripPage(pack: PackConfig, best: CardListing | null, topValue: number): string {
  const hero = heroFor(pack, best);
  const packName = esc(pack.name);

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${packName} — RIPDEX</title>
<style>${RIP_CSS}</style>
</head><body>
<div id="chrome">
  <a class="brand" href="/">RIP<span>DEX</span></a>
  <a href="/packs" style="font-size:11px;letter-spacing:.16em;color:#8A8894">ODDS →</a>
</div>
<div id="grailFx"></div>
<div id="stage">
  <section class="scene on" id="s-select"><div>
    <div class="kicker">RIPDEX PACK</div>
    <div class="pack" id="packArt">
      <div class="pack-hero" style="background-image:url(${esc(hero)})"></div>
      <div class="pack-top"></div>
      <div class="pack-label"><div class="nm">${packName}</div></div>
    </div>
    <div class="meta">
      <div><div class="k">CONTAINS</div><div class="v">${pack.cardsPerPack} CARD</div></div>
      <div><div class="k">PRICE</div><div class="v">${pack.priceRip.toLocaleString()}</div></div>
      <div><div class="k">TOP PULL</div><div class="v" style="color:var(--gold)">$${Math.round(topValue).toLocaleString()}</div></div>
    </div>
    <button class="cta" id="ripBtn">RIP PACK</button>
    <a class="ghost" href="/packs">VIEW FULL ODDS</a>
  </div></section>

  <section class="scene" id="s-roll"><div class="status">
    <div class="shimmer"></div>
    <div class="big" id="rollText"><b>PACK LOCKED</b></div>
    <div class="bar"><i></i></div>
  </div></section>

  <section class="scene" id="s-tear"><div>
    <div id="tearWrap">
      <div class="strip" id="strip"></div>
      <div class="pack">
        <div class="pack-hero" style="background-image:url(${esc(hero)})"></div>
        <div class="pack-top"></div>
        <div class="pack-label"><div class="nm">${packName}</div></div>
      </div>
      <div class="hint" id="tearHint">DRAG ACROSS TO TEAR</div>
    </div>
  </div></section>

  <section class="scene" id="s-card"><div>
    <div class="grail-tag" id="grailTag">GRAIL PULL</div>
    <div class="holder" id="holder"><div class="card" id="card">
      <div class="face back"><div class="edge"></div><div class="sigil"><b>RIP</b></div></div>
      <div class="face front">
        <img id="cardImg" alt="">
        <div class="foil"><div class="f1"></div><div class="f2"></div><div class="f3"></div></div>
        <div class="coat"></div><div class="grain"></div>
      </div>
    </div></div>
    <div class="hint" id="flipHint" style="position:static;transform:none;margin-top:18px;text-align:center">TAP TO REVEAL</div>
    <div class="reveal-meta" id="meta">
      <div class="nm" id="mName"></div><div class="st" id="mSet"></div>
      <div class="val" id="mVal"></div><div class="vk">REFERENCE VALUE</div>
      <div class="chips" id="mChips"></div>
    </div>
    <div class="rowbtns" id="after">
      <a class="btn2" id="cardLink" href="#">VIEW CARD</a>
      <button class="btn2 pri" id="againBtn">RIP ANOTHER</button>
    </div>
  </div></section>

  <section class="scene" id="s-err"><div class="status">
    <div class="big"><b>RIP FAILED</b></div>
    <p class="err" id="errText"></p>
    <button class="cta" id="retryBtn">TRY AGAIN</button>
  </div></section>
</div>

<script type="module">
const PACK_ID = ${JSON.stringify(pack.id)};
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const show = (id) => document.querySelectorAll('.scene').forEach(s => s.classList.toggle('on', s.id === id));
const fmt = (n) => '$' + Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

let result = null;

async function rip(){
  show('s-roll');
  $('#rollText') // no-op guard for older bundlers
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
    fx.style.background = 'radial-gradient(60% 60% at 50% 50%,rgba(0,0,0,.55),rgba(0,0,0,.86))';
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
  document.getElementById('mVal').textContent = fmt(result.referenceValue);
  document.getElementById('mChips').innerHTML =
    '<span class="chip t">' + result.tier.replace('_',' ') + '</span>' +
    '<span class="chip">' + result.oddsLabel + ' ODDS</span>' +
    '<span class="chip">' + result.variantLabel.toUpperCase() + '</span>' +
    // openingId already carries a "rip_" prefix, so prepending "RIP " again
    // renders "RIP RIP_55DAC0".
    '<span class="chip">RIP ' + result.openingId.replace(/^rip_/,'').slice(0,10).toUpperCase() + '</span>';
  document.getElementById('cardLink').href = result.href;
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

function sparks(){
  const fx = document.getElementById('grailFx'); fx.innerHTML='';
  for(let i=0;i<46;i++){
    const s=document.createElement('i'); s.className='spark';
    s.style.left=(i*37%100)+'%'; s.style.top=(55+(i*29%45))+'%';
    s.style.animation='rise ' + (2.4+(i%7)*0.4) + 's linear ' + ((i%11)*0.22) + 's infinite';
    fx.appendChild(s);
  }
}

function reset(){
  document.getElementById('chrome').classList.remove('hide');
  const fx = document.getElementById('grailFx');
  fx.classList.remove('on'); fx.style.background='#000'; fx.innerHTML='';
  card.classList.remove('flipped','grail');
  show('s-select');
}

document.getElementById('ripBtn').onclick = rip;
document.getElementById('packArt').onclick = rip;
document.getElementById('retryBtn').onclick = () => { reset(); setTimeout(rip, 300); };
document.getElementById('againBtn').onclick = () => { reset(); setTimeout(rip, 420); };
new Image().src = ${JSON.stringify(hero)};
</script>
</body></html>`;
}
