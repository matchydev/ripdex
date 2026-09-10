// Decorative scene only: all artwork stays outside the hero's interactive 3D layers.
const ball = (name: string) => `<span class="hero-pokeball ${name}"><span class="hero-pokeball-shell"><i></i></span></span>`;

export const POKEMON_HERO_HTML = `
<div class="pokemon-atmosphere" id="pokemon-scene" aria-hidden="true">
  <div class="hero-firelight"></div>
  <div class="hero-charizard-flight">
  <img class="hero-charizard" src="/art/characters/charizard-home.png" alt="" width="512" height="512" decoding="async" fetchpriority="high">
  <svg class="hero-flames" viewBox="0 0 600 260" fill="none" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="rip-flame-outer" x1="590" y1="130" x2="0" y2="90" gradientUnits="userSpaceOnUse"><stop stop-color="#fff5c3"/><stop offset=".3" stop-color="#ffb044"/><stop offset=".65" stop-color="#f36a20"/><stop offset="1" stop-color="#f04415" stop-opacity="0"/></linearGradient>
      <linearGradient id="rip-flame-inner" x1="590" y1="125" x2="40" y2="110" gradientUnits="userSpaceOnUse"><stop stop-color="#fffbed"/><stop offset=".4" stop-color="#ffdc7d"/><stop offset="1" stop-color="#ff9e30" stop-opacity="0"/></linearGradient>
    </defs>
    <g class="hero-flame-layer hero-flame-outer" fill="url(#rip-flame-outer)">
      <path d="M593 127C552 123 536 107 504 108C460 112 446 53 385 68C401 84 399 97 374 88C318 67 288 20 226 46C255 62 267 93 239 85C191 70 132 32 86 52C122 64 139 92 112 91C70 86 35 99 7 126C52 109 80 123 61 143C126 138 151 162 126 182C188 180 201 148 239 165C277 181 269 209 305 214C293 180 332 185 351 189C404 199 416 156 455 151C504 142 544 132 593 127Z"/>
    </g>
    <g class="hero-flame-layer hero-flame-mid" fill="url(#rip-flame-outer)">
      <path d="M592 127C541 130 513 100 468 116C443 120 432 86 398 99C356 114 344 67 304 84C325 99 298 119 271 109C230 95 207 106 181 94C202 123 184 132 136 128C158 149 210 134 230 155C270 188 284 150 316 157C354 165 365 140 403 145C459 154 502 132 592 127Z"/>
    </g>
    <g class="hero-flame-layer hero-flame-core" fill="url(#rip-flame-inner)">
      <path d="M593 127C549 125 530 116 495 124C455 133 441 112 418 119C381 130 360 102 326 119C291 131 260 115 222 130C264 141 292 131 321 145C352 156 382 131 410 137C453 147 496 131 593 127Z"/>
    </g>
  </svg>
  <div class="hero-embers">${Array.from({ length: 8 }, (_, i) => `<i style="--ember:${i};--drift:${130 + i * 31}px;--lift:${35 + (i % 4) * 27}px"></i>`).join('')}</div>
  </div>
  ${ball('hero-pokeball-one')}${ball('hero-pokeball-two')}
</div>`;

export const POKEMON_HERO_TOGGLE = `<button class="hero-motion-toggle" type="button" aria-controls="pokemon-scene" aria-pressed="false" aria-label="Pause Pokémon scene" hidden><span class="hero-motion-icon" aria-hidden="true">Ⅱ</span><span class="hero-motion-label">Pause scene</span></button>`;

export const POKEMON_HERO_CSS = `<style>
.hero .hero-inner{min-height:470px;padding-top:32px}
.hero h1{position:relative;z-index:1;font-size:clamp(76px,7vw,104px);margin-top:24px}
.hero-contract{position:relative;z-index:2;width:min(100%,520px);margin-top:22px;scroll-margin-top:130px}
.hero-contract:focus{outline:none}.hero-ca-button{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:11px 14px;border-radius:8px;box-shadow:0 0 0 1px var(--line-hi);background:var(--glass);color:var(--text-2);text-align:left;cursor:pointer;transition:box-shadow .2s var(--ease),background .2s var(--ease)}
.hero-ca-button:hover{background:rgba(255,255,255,.05);box-shadow:0 0 0 1px var(--accent)}.hero-ca-button:focus-visible{outline:2px solid var(--accent-hi);outline-offset:3px}.hero-ca-label{font:650 12px ui-monospace,monospace;color:var(--text)}.hero-ca-address{min-width:0;overflow-wrap:anywhere;font:500 12px/1.5 ui-monospace,monospace}.hero-ca-button svg{margin-left:auto;flex-shrink:0;opacity:.75}
.hero-contract-help{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.hero .hero-copy{position:relative;z-index:1;padding-top:30px;width:49%}
.hero .hero-copy p{max-width:38ch}
.hero .hero-copy h2{font-size:clamp(31px,3.2vw,44px);letter-spacing:-.03em;line-height:1.1;font-weight:600}
.hero .hero-actions .btn{height:44px;font-size:12px}
.hero .hero-main{min-height:246px}
.hero .pack-scene{top:203px;right:1%;width:49%;height:212px;--pw:128px;--ph:180px;--spread:112px}
.hero .hero-foot{position:relative;z-index:1}
.pokemon-atmosphere{--flame-x:56%;--flame-y:16.8%;--flame-width:69%;position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;isolation:isolate}
.pokemon-atmosphere:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#11121b 0%,#11121be8 29%,#11121b00 58%),linear-gradient(0deg,#0b0c13 0%,#0b0c13d9 9%,#0b0c1300 32%);pointer-events:none}
.pokemon-atmosphere *{pointer-events:none;animation-play-state:paused!important}
.pokemon-atmosphere.is-running *{animation-play-state:running!important}
.hero-charizard-flight{position:absolute;right:0;top:-68px;width:53%;aspect-ratio:1;transform-origin:60% 80%;animation:charizard-breathe 6s ease-in-out infinite}
/* The Charizard is a mood, not a mascot: sunk to a dark silhouette lurking behind
   the packs, lit only by its own fire, so it reads as premium atmosphere rather
   than bright clip-art competing with the product. */
.hero-charizard{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;filter:brightness(.3) saturate(.4) contrast(1.14) blur(2px) drop-shadow(0 18px 44px #f5751722)}
.hero-firelight{position:absolute;right:0;top:8%;width:75%;height:80%;background:radial-gradient(ellipse at 63% 48%,#f67b1c18,transparent 65%);opacity:.65;animation:firelight-breathe 5.4s ease-in-out infinite}
.hero-flames{position:absolute;right:var(--flame-x);top:var(--flame-y);width:var(--flame-width);height:auto;overflow:visible;opacity:.74;transform-origin:98% 49%;filter:drop-shadow(0 0 13px #ef842425);animation:flame-breath 6s ease-in-out infinite}
.hero-flame-layer{transform-origin:98% 49%;animation:flame-flow 2.8s ease-in-out infinite alternate}
.hero-flame-outer{opacity:.7}.hero-flame-mid{opacity:.8;animation-delay:-1.2s;animation-duration:2.3s}.hero-flame-core{opacity:.95;animation-delay:-.7s;animation-duration:1.9s}
.hero-embers{position:absolute;right:var(--flame-x);top:var(--flame-y);width:var(--flame-width);height:35%}
.hero-embers i{position:absolute;right:8%;top:calc(33% + var(--ember)*2%);width:3px;height:3px;border-radius:50%;background:#ffd69c;box-shadow:0 0 9px #ff8a3a;opacity:0;animation:ember-drift calc(3.7s + var(--ember)*.27s) linear infinite;animation-delay:calc(var(--ember)*-.83s)}
.hero-pokeball{display:none;position:absolute;width:49px;height:49px;animation:pokeball-float 7s ease-in-out infinite;filter:drop-shadow(0 10px 12px #0007)}
.hero-pokeball-one{right:3%;top:28%;transform:rotate(22deg);opacity:.96}
.hero-pokeball-two{right:47%;bottom:20%;width:34px;height:34px;transform:rotate(-24deg);opacity:.8;animation-delay:-3s;animation-duration:8s;z-index:1}
.hero-pokeball-shell{position:absolute;inset:0;overflow:hidden;border:2px solid #11141d;border-radius:50%;background:linear-gradient(180deg,#ec5e5e 0,#ca303d 44%,#181b25 44%,#181b25 55%,#e1e5f1 55%,#9aa2bb 100%);box-shadow:inset -7px -4px 12px #050a234d,inset 5px 4px 7px #fff4}
.hero-pokeball-shell:before{content:"";position:absolute;width:34%;height:34%;left:12%;top:7%;border-radius:50%;background:radial-gradient(ellipse,#fff7,transparent 75%)}
.hero-pokeball-shell i{position:absolute;left:50%;top:50%;width:31%;height:31%;border:3px solid #1b1e29;background:#dbe2f2;border-radius:50%;transform:translate(-50%,-50%);box-shadow:inset 0 0 0 2px #a6afc6,0 1px 3px #0005}
.hero-motion-toggle{position:absolute;top:24px;right:24px;z-index:3;display:inline-flex;align-items:center;gap:7px;padding:7px 10px;min-height:32px;border:1px solid #ffffff1c;border-radius:6px;background:#10121aba;color:#b2b8c5;font:500 11px/1.25 var(--font-sans,system-ui,sans-serif);cursor:pointer;white-space:nowrap;transition:color .2s,border-color .2s}
.hero-motion-toggle[hidden]{display:none}.hero-motion-toggle:hover{color:#fff;border-color:#ffffff4d}.hero-motion-toggle:focus-visible{outline:2px solid #8b83ff;outline-offset:3px}.hero-motion-toggle:disabled{cursor:default;opacity:.65}.hero-motion-icon{width:11px;text-align:center;font-size:12px}
@keyframes charizard-breathe{0%,100%{transform:translateY(0) rotate(-.7deg) scale(1)}50%{transform:translateY(-7px) rotate(.3deg) scale(1.012)}}
@keyframes firelight-breathe{0%,100%{opacity:.4;transform:scale(.96)}50%{opacity:.8;transform:scale(1.03)}}
@keyframes flame-breath{0%,100%{opacity:.42;transform:scale(.9,.9) rotate(-1deg)}48%{opacity:.8;transform:scale(1,.98) rotate(.7deg)}}
@keyframes flame-flow{from{transform:scale(.96,.91) skewY(-1.8deg)}to{transform:scale(1.035,1.055) skewY(1.8deg)}}
@keyframes ember-drift{0%{opacity:0;transform:translate(0,0) scale(.5)}18%{opacity:.7}70%{opacity:.4}100%{opacity:0;transform:translate(calc(-1*var(--drift)),calc(-1*var(--lift))) scale(.25)}}
@keyframes pokeball-float{0%,100%{translate:0 0;rotate:-5deg}50%{translate:0 -10px;rotate:5deg}}
@media(min-width:1500px){.hero-charizard-flight{width:55%;top:-85px}.hero .pack-scene{--pw:140px;--ph:196px;--spread:124px;top:194px}}
@media(max-width:1150px){.hero .hero-inner{min-height:440px}.hero .hero-copy{width:51%}.hero .hero-copy p br{display:none}.hero .pack-scene{--pw:105px;--ph:148px;--spread:84px;top:209px}.hero-charizard-flight{width:58%;right:-4%;top:-8px}.hero-pokeball-one{top:35%;width:37px;height:37px}.hero .hero-actions{flex-wrap:wrap;gap:0 12px}}
@media(max-width:850px){.hero-charizard-flight{width:56%;right:-1%;top:-22px}.hero .pack-scene{--pw:120px;--ph:168px;--spread:101px;top:190px}.hero-embers i:nth-child(n+5){display:none}}
@media(max-width:600px){
 .hero-contract{width:100%;margin-top:12px;scroll-margin-top:154px}.hero-ca-button{min-height:42px;padding:9px 12px}.hero-ca-address{font-size:11px}
 .hero .hero-inner{padding:18px 20px 20px;min-height:0}.hero h1{font-size:23.5vw;margin-top:18px;line-height:.95}.hero .hero-top{display:none}.hero .hero-main{min-height:0}.hero .hero-copy{width:100%;padding:12px 0 22px}.hero .hero-copy h2{font-size:27px}.hero .hero-copy p{max-width:38ch;font-size:12px}.hero .hero-actions{gap:12px}.hero .hero-inspect{font-size:10px}
 .hero .pack-scene{position:relative;top:auto;right:auto;width:100%;height:252px;margin-top:0;--pw:91px;--ph:128px;--spread:89px}.hero .pack-scene .stage-drift{top:103px}.hero .hero-foot{font-size:7px}
 .hero-charizard-flight{width:330px;top:119px;right:calc(50% - 183px)}.pokemon-atmosphere:after{background:linear-gradient(0deg,#10111a 0%,#10111a 32%,#10111a00 49%)}
 .hero-pokeball-one{right:7%;top:33%;width:34px;height:34px}.hero-pokeball-two{right:82%;bottom:auto;top:43%;width:29px;height:29px}.hero-motion-toggle{font-size:10px;padding:6px 8px;top:12px;right:16px}.hero-firelight{top:10%;height:65%;width:100%}
}
@media(max-width:360px){.hero h1{margin-top:22px}.hero .hero-inner{padding-left:16px;padding-right:16px}.hero .pack-scene{height:216px;--pw:80px;--ph:112px;--spread:73px}.hero .pack-scene .stage-drift{top:95px}.hero-charizard-flight{width:290px;top:107px;right:calc(50% - 162px)}.hero .hero-copy h2{font-size:25px}.hero .hero-copy p{font-size:11px}.hero .hero-actions{gap:8px}.hero .hero-actions .btn{font-size:11px}.hero .hero-inspect{font-size:9px}.hero-pokeball-two{top:40%;right:84%}}
@media(prefers-reduced-motion:reduce){.pokemon-atmosphere *,.pokemon-atmosphere.is-running *{animation:none!important}.hero-flames{opacity:.48}.hero-embers{display:none}.hero-motion-toggle{transition:none}}
</style>`;

export const POKEMON_HERO_JS = `<script>
(() => {
  const scene = document.querySelector('.pokemon-atmosphere');
  const toggle = document.querySelector('.hero-motion-toggle');
  if (!scene || !toggle) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const storageKey = 'ripdex-pokemon-scene-paused';
  let paused = false;
  let inView = true;
  try { paused = sessionStorage.getItem(storageKey) === 'true'; } catch {}
  function update() {
    const resting = paused || motion.matches;
    scene.classList.toggle('is-running', !resting && inView && !document.hidden);
    toggle.setAttribute('aria-pressed', String(resting));
    toggle.setAttribute('aria-label', motion.matches ? 'Pokémon scene paused: reduced motion enabled' : (resting ? 'Play Pokémon scene' : 'Pause Pokémon scene'));
    toggle.querySelector('.hero-motion-label').textContent = motion.matches ? 'Motion off' : (resting ? 'Play scene' : 'Pause scene');
    toggle.querySelector('.hero-motion-icon').textContent = motion.matches ? 'Ⅱ' : (resting ? '▶' : 'Ⅱ');
    toggle.disabled = motion.matches;
    toggle.title = motion.matches ? 'Your device’s reduced motion setting is enabled' : '';
  }
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    paused = !paused;
    try { sessionStorage.setItem(storageKey, String(paused)); } catch {}
    update();
  });
  motion.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update(); }, { threshold: 0 });
    observer.observe(scene.closest('.hero') || scene);
  }
  update();
})();
</script>`;
