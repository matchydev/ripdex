/**
 * Homepage (spec §19).
 *
 * Product-focused: the packs and the cards lead, the chain infrastructure is a
 * section near the bottom rather than the headline.
 *
 * The hero is a real 3D scene rather than a picture of one. Three packs stand in
 * a shared perspective space: each is a stack of planes (a back slab behind the
 * art, the art, a rim, a veil, a gloss sweep, a name plate out front) that drift
 * against each other as the pack turns under the pointer. That inter-plane
 * parallax is the whole difference between an object with thickness and a
 * rotated rectangle.
 *
 * Two structural rules the layering depends on, both easy to break by accident:
 *
 *  1. Placement, float and pointer-rotation must live on THREE different
 *     elements. A CSS animation beats an inline style in the cascade, so a
 *     .floaty on the same node the depth runtime writes to would silently eat
 *     every rotation; and a placement transform on that node would be wiped the
 *     first time the pointer moved.
 *  2. Nothing in the chain from .scene down to the planes may carry `filter` or
 *     `opacity` < 1 — both force transform-style:flat and collapse the space.
 *     The flankers are dimmed on .plane-art, a leaf, for exactly that reason.
 */

import type {
  CardListing,
  CatalogIndex,
  PackConfig,
} from '../../../packages/pokemon-core/src/index.ts';
import { esc, money, layout, tile } from './render.ts';

const HOME_CSS = `
<style>
/* ============================== hero =============================== */
.hero{position:relative;padding:52px 0 8px;text-align:center}
.hero::before{content:"";position:absolute;left:50%;top:-180px;width:min(1180px,132%);height:680px;
  transform:translateX(-50%);pointer-events:none;z-index:-1;
  background:radial-gradient(ellipse at 50% 42%,rgba(113,112,255,.20),transparent 62%)}
/* flow-root, so the spans' negative top margins below cannot collapse out
   through the heading and drag the whole lockup upward. */
.hero h1{display:flow-root;margin:24px 0 0;font-weight:590;letter-spacing:-.045em;
  line-height:.95;font-size:clamp(2.6rem,8.2vw,6.1rem)}
/* background-clip:text paints inside the element box and clips to the glyphs, so
   ink that rises above the box is simply never painted. At line-height .95 the
   box top sits 0.83em over the baseline while the acute on the É of POKÉMON
   reaches 0.95em — measured, 12px of the accent went unpainted. The padding
   raises the paint area; the equal negative margin keeps the layout identical. */
.hero h1 span{display:block;padding-top:.2em;margin-top:-.2em;
  background:linear-gradient(176deg,var(--text) 22%,#959cab 106%);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.hero h1 span.em{
  background:linear-gradient(112deg,var(--accent-hi),var(--accent) 52%,#5b58e0);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.hero .sub{margin:22px auto 0;max-width:50ch;color:var(--text-3);font-size:16px;font-weight:480;
  letter-spacing:-.014em;line-height:1.55}
.hero .cta-row{margin-top:30px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}

/* ========================= the pack scene ========================== */
/* One camera, three objects standing in it. Sizes are variables so the whole
   arrangement scales down on narrow screens without re-authoring the geometry. */
.pack-scene{--pw:214px;--ph:298px;--spread:208px;
  position:relative;height:436px;margin:34px auto 0;max-width:960px}
.pack-scene::after{content:"";position:absolute;left:50%;bottom:34px;width:min(620px,86%);height:150px;
  transform:translateX(-50%);pointer-events:none;z-index:-1;
  background:radial-gradient(ellipse at 50% 50%,rgba(113,112,255,.22),transparent 70%);
  filter:blur(18px)}
.stage-drift{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform}
.stage{position:absolute;inset:0;transform-style:preserve-3d}

/* Placement only. Never animated by the runtime, so it can hold a transform. */
.slot{position:absolute;left:50%;top:50%;width:var(--pw);height:var(--ph);
  margin:calc(var(--ph) / -2) 0 0 calc(var(--pw) / -2);
  transform-style:preserve-3d;transition:transform .75s var(--ease)}
.slot-l{transform:translate3d(calc(var(--spread) * -1),14px,-116px) rotateY(22deg) rotateZ(-3deg)}
.slot-r{transform:translate3d(var(--spread),14px,-116px) rotateY(-22deg) rotateZ(3deg)}
.slot-c{transform:translate3d(0,-12px,118px)}
.pack-scene:hover .slot-l{transform:translate3d(calc(var(--spread) * -1.16),2px,-74px) rotateY(16deg) rotateZ(-5deg)}
.pack-scene:hover .slot-r{transform:translate3d(calc(var(--spread) * 1.16),2px,-74px) rotateY(-16deg) rotateZ(5deg)}
.pack-scene:hover .slot-c{transform:translate3d(0,-22px,150px)}

/* Idle float. Its own node: a keyframe outranks inline styles, so this must not
   share an element with the pointer-driven rotation. */
.bob{position:absolute;inset:0;transform-style:preserve-3d}

.pack3d{position:absolute;inset:0;display:block;border-radius:var(--r-lg);
  transform-style:preserve-3d;cursor:pointer}
.pack3d .plane{overflow:hidden}
/* The back slab is what gives the pack thickness. Sitting at Z -16 it projects
   NARROWER than the art in front of it, so flush with the front planes it hides
   completely and the object reads as a single sheet. Outsetting it by 4px puts a
   lit card edge permanently outside the artwork's silhouette — that edge is what
   swings and changes width as the pack turns. Specificity has to beat the
   design system's .card3d .plane inset:0, hence the .pack3d prefix. */
.pack3d .plane-slab{inset:-4px;border-radius:calc(var(--r-lg) + 4px);
  transform:translateZ(-16px);
  background:linear-gradient(104deg,#191a1f,#0a0b0c 44%,#050607);
  box-shadow:0 0 0 1px rgba(255,255,255,.08),0 30px 60px -30px rgba(0,0,0,.9)}
.plane-art{background-size:176%;background-position:50% 32%;background-repeat:no-repeat;
  background-color:var(--panel)}
.plane-veil{background:
  linear-gradient(180deg,rgba(8,9,10,.06) 0%,rgba(8,9,10,.55) 58%,rgba(8,9,10,.94) 100%),
  linear-gradient(128deg,rgba(113,112,255,.20),transparent 56%)}
.plane-plate{display:flex;align-items:flex-end;justify-content:center;padding-bottom:15px;
  pointer-events:none}
.plate{display:inline-flex;flex-direction:column;align-items:center;gap:4px;
  padding:7px 13px;border-radius:10px;
  background:rgba(10,11,12,.72);backdrop-filter:blur(10px);
  box-shadow:0 0 0 1px var(--line-hi),0 10px 26px -14px rgba(0,0,0,.85)}
.plate .nm{font-size:11.5px;font-weight:590;letter-spacing:-.012em;line-height:1;
  white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis}
.plate .pr{font-size:10px;font-weight:520;letter-spacing:-.008em;color:var(--accent-hi);
  font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;line-height:1}
.chip-feat{position:absolute;top:-11px;left:50%;transform:translateX(-50%);
  font-size:9.5px;font-weight:560;letter-spacing:.06em;padding:4px 9px;border-radius:100px;
  color:var(--text);background:var(--accent);white-space:nowrap;
  box-shadow:0 0 0 1px rgba(255,255,255,.14),0 6px 20px -6px rgba(113,112,255,.9)}
/* Flankers are dimmed on a leaf plane: a filter anywhere higher would flatten
   the whole 3D subtree. */
.slot-l .plane-art,.slot-r .plane-art{filter:brightness(.56) saturate(.82)}
.slot-l .plane-veil,.slot-r .plane-veil{background:
  linear-gradient(180deg,rgba(8,9,10,.34) 0%,rgba(8,9,10,.72) 58%,rgba(8,9,10,.96) 100%)}

/* Grails drifting far behind the packs. */
.ghosts{position:absolute;inset:0;transform-style:preserve-3d;pointer-events:none}
.ghost-slot{position:absolute;left:50%;top:50%;width:128px;margin:-90px 0 0 -64px;
  transform-style:preserve-3d}
.ghost{display:block;filter:blur(2px);opacity:.17}
.ghost img{display:block;width:100%;border-radius:8px}

@media(max-width:900px){
  .pack-scene{--pw:172px;--ph:240px;--spread:166px;height:372px}
  .ghost-slot{width:104px;margin:-73px 0 0 -52px}
}
@media(max-width:600px){
  .pack-scene{--pw:126px;--ph:176px;--spread:116px;height:296px;margin-top:20px}
  /* The packs stand closer together here, so the plates have to shrink or the
     centre one overlaps its neighbours' prices. */
  .plate{padding:5px 9px;gap:3px}
  .plate .nm{font-size:9.5px;max-width:84px}
  .plate .pr{font-size:8.5px}
  .chip-feat{font-size:8px;padding:3px 7px;top:-9px}
  .ghost-slot{width:80px;margin:-56px 0 0 -40px}
}

/* ============================ stat strip =========================== */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin:46px 0 4px;
  border-radius:var(--r-lg);overflow:hidden;background:var(--line);
  box-shadow:0 0 0 1px var(--line)}
.stat{position:relative;padding:22px 22px 20px;background:rgba(15,16,17,.74);
  backdrop-filter:blur(12px)}
.stat .n{display:block;font-size:clamp(1.6rem,3.5vw,2.45rem);font-weight:590;
  letter-spacing:-.045em;line-height:1;font-family:ui-monospace,Menlo,monospace;
  font-variant-numeric:tabular-nums}
.stat .n.gold{color:var(--gold)}
.stat .k{display:block;margin-top:9px;font-size:10.5px;font-weight:540;letter-spacing:.06em;
  color:var(--text-4)}
@media(max-width:760px){.stats{grid-template-columns:repeat(2,1fr)}}

/* ============================== bands ============================== */
section.band{padding:50px 0;box-shadow:inset 0 1px 0 var(--line)}
.band-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}
.band-head h2{display:flex;align-items:center;margin:0;font-size:12px;font-weight:560;
  letter-spacing:.05em;color:var(--text-3)}
.band-head a{font-size:12.5px;font-weight:520;letter-spacing:-.011em;color:var(--text-4);
  display:inline-flex;align-items:center;gap:6px;
  transition:color .2s var(--ease)}
.band-head a:hover{color:var(--accent-hi)}
.band-head a i{font-style:normal;transition:transform .3s var(--ease)}
.band-head a:hover i{transform:translateX(3px)}

/* ============================ live pulls =========================== */
.pull{display:flex;align-items:center;gap:11px;padding:9px 14px 9px 9px;flex:0 0 auto;
  border-radius:var(--r-md);background:var(--glass);box-shadow:0 0 0 1px var(--line);
  transition:box-shadow .25s var(--ease),background .25s var(--ease)}
.pull:hover{background:rgba(255,255,255,.055);box-shadow:0 0 0 1px var(--line-hi)}
.pull .shot-s{width:40px;height:56px;border-radius:7px;overflow:hidden;flex:0 0 auto;
  background:var(--panel);box-shadow:0 0 0 1px var(--line)}
.pull .shot-s img{width:100%;height:100%;object-fit:cover;display:block}
.pull .who{display:block;min-width:0}
.pull .nm{display:block;font-size:13px;font-weight:540;letter-spacing:-.014em;line-height:1.25;
  max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pull .sub{display:block;font-size:11px;font-weight:460;letter-spacing:-.008em;
  color:var(--text-4);margin-top:3px;
  max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pull .v{margin-left:6px;font-size:12.5px;font-weight:600;letter-spacing:-.02em;
  font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;color:var(--text-2)}
.pull .v.major{color:var(--gold)}
.pull.major{box-shadow:0 0 0 1px rgba(245,196,81,.26)}
.pull.major:hover{box-shadow:0 0 0 1px rgba(245,196,81,.45)}

/* ========================== featured packs ========================= */
.pack-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(248px,1fr))}
.pack-card{display:block;border-radius:var(--r-lg);overflow:hidden}
.pack-card::before{z-index:5}
.pack-card .pc-art{display:block;height:136px;background-size:cover;background-position:50% 22%;
  background-color:var(--panel);
  transition:transform .6s var(--ease)}
.pack-card:hover .pc-art{transform:scale(1.045)}
.pack-card .pc-veil{position:absolute;left:0;right:0;top:0;height:150px;pointer-events:none;
  background:linear-gradient(180deg,rgba(8,9,10,.1),rgba(8,9,10,.72) 62%,var(--bg))}
.pack-card .pc-body{position:relative;display:block;padding:14px 16px 16px}
.pack-card .pc-nm{display:block;font-size:14.5px;font-weight:560;letter-spacing:-.02em;line-height:1.2}
.pack-card .pc-dt{display:block;margin-top:5px;font-size:12px;font-weight:460;
  letter-spacing:-.008em;color:var(--text-4)}
.pack-card .pc-pr{display:inline-block;margin-top:11px;font-size:12px;font-weight:560;
  letter-spacing:-.014em;color:var(--accent-hi);padding:4px 9px;border-radius:7px;
  background:var(--accent-dim);font-family:ui-monospace,Menlo,monospace;
  font-variant-numeric:tabular-nums}

/* ============================== grails ============================= */
/* A flex item's automatic minimum size is its content's min-content width, so
   one long set name ("Special Illustration Rare") widens that tile past its
   flex-basis and stretches the whole row's cross size — leaving a band of dead
   space under every other tile. min-width:0 pins them all to the basis. */
.grail-rail .tile{min-width:0}
.grail-rail .shot{box-shadow:0 0 0 1px rgba(245,196,81,.24),
  0 18px 44px -22px rgba(245,196,81,.30),0 2px 4px rgba(0,0,0,.4)}
.grail-rail .tile:hover .shot{box-shadow:0 0 0 1px rgba(245,196,81,.52),
  0 30px 68px -22px rgba(245,196,81,.42),0 8px 16px rgba(0,0,0,.5)}
.grail-rail .val{color:var(--gold)}

/* ========================== how it works =========================== */
/* Five nodes with a connector that draws itself between them, in sequence. The
   draw hangs off the same --d the reveal-group stagger writes, so the wire can
   never outrun the node it comes from. */
.flow{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0;padding:0;list-style:none}
.step{display:flex;align-items:center;gap:10px}
.node{position:relative;display:flex;align-items:center;gap:11px;padding:13px 17px;
  border-radius:var(--r-md);background:var(--glass);box-shadow:0 0 0 1px var(--line);
  transition:box-shadow .25s var(--ease),background .25s var(--ease),transform .25s var(--ease)}
.node:hover{background:rgba(255,255,255,.055);box-shadow:0 0 0 1px var(--line-hi);
  transform:translateY(-2px)}
.node .ix{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;
  flex:0 0 auto;border-radius:7px;font-size:10.5px;font-weight:600;letter-spacing:-.01em;
  color:var(--accent-hi);background:var(--accent-dim);
  box-shadow:0 0 0 1px rgba(113,112,255,.22);font-variant-numeric:tabular-nums}
.node b{font-size:12.5px;font-weight:560;letter-spacing:.02em;color:var(--text)}
.wire{position:relative;width:42px;height:2px;flex:0 0 auto;border-radius:2px;
  background:var(--line);overflow:hidden}
.wire i{position:absolute;inset:0;transform:scaleX(0);transform-origin:0 50%;
  background:linear-gradient(90deg,var(--accent),var(--accent-hi));
  box-shadow:0 0 10px rgba(113,112,255,.7)}
.step.in .wire i{transform:scaleX(1);transition:transform .7s var(--ease);
  transition-delay:calc(var(--d,0ms) + 220ms)}
.wire::after{content:"";position:absolute;top:0;bottom:0;width:15px;opacity:0;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.9),transparent)}
.step.in .wire::after{animation:wirePulse 2.8s var(--ease) infinite;
  animation-delay:calc(var(--d,0ms) + 900ms)}
@keyframes wirePulse{
  0%{transform:translateX(-16px);opacity:0}
  26%{opacity:1}
  100%{transform:translateX(48px);opacity:0}}
@media(max-width:600px){.wire{width:26px}}

/* =========================== provably fair ========================= */
.fair{display:grid;grid-template-columns:repeat(auto-fit,minmax(258px,1fr));gap:16px}
.fair .f{padding:18px 18px 19px;border-radius:var(--r-lg)}
.fair .f h4{margin:0 0 8px;font-size:11px;font-weight:560;letter-spacing:.055em;color:var(--text)}
.fair .f p{margin:0;font-size:13px;font-weight:460;letter-spacing:-.01em;color:var(--text-3);
  line-height:1.62}
.fair .f p em{font-style:normal;color:var(--text-2);font-weight:540}
/* Neutral code chip. Emerald is reserved for "a pricing provider confirmed
   this" and gold for grail value; a hash string is neither. */
.fair code{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;letter-spacing:-.02em;
  color:var(--text-2);word-break:break-all;padding:1px 5px;border-radius:5px;
  background:var(--glass);box-shadow:0 0 0 1px var(--line)}

/* ============================ dex outro ============================ */
.dex-line{margin:0;font-size:clamp(1.05rem,2.3vw,1.5rem);font-weight:510;letter-spacing:-.028em;
  line-height:1.4;color:var(--text-3);max-width:34ch}
.dex-line b{color:var(--text);font-weight:590;
  font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
</style>`;

export interface HomeFeedItem {
  wallet: string;
  cardName: string;
  imageSmall: string;
  value: number | null;
  when: string;
  prominence: string;
  href: string;
}

/** Generated packs carry a hero image URL; hand-authored ones may not. */
function heroImage(pack: PackConfig, index: CatalogIndex): string {
  if (pack.artwork.heroImageUrl) return pack.artwork.heroImageUrl;
  // Fall back to the most valuable card the pack can actually produce, so a
  // wrapper never renders as an empty rectangle.
  let best: CardListing | null = null;
  for (const entry of pack.pool) {
    const hit = index.byVariantId.get(entry.variantId);
    if (hit && (hit.card.headlineValue ?? 0) > (best?.headlineValue ?? 0)) best = hit.card;
  }
  return best?.imageLarge ?? '';
}

/** Float parameters per slot. Nothing beats in sync — that is the point. */
const FLOAT: Record<string, string> = {
  l: '--float-dur:9.2s;--float-delay:-2.4s;--float-amp:13px',
  c: '--float-dur:7.4s;--float-delay:-0.6s;--float-amp:18px',
  r: '--float-dur:10.6s;--float-delay:-4.1s;--float-amp:11px',
};

/**
 * One pack as a physical object: a slab behind the art gives it thickness, and
 * every plane carries its own [data-layer] so it counter-drifts as the pack
 * turns. Placement lives on .slot, the float on .bob, the rotation on .pack3d —
 * three nodes, because those three transforms would otherwise overwrite one
 * another.
 */
function pack3d(pack: PackConfig, index: CatalogIndex, slot: string, featured: boolean): string {
  const art = heroImage(pack, index);
  return `<div class="slot slot-${slot}">
  <div class="bob floaty" style="${FLOAT[slot] ?? FLOAT.c}">
    <a class="pack3d card3d depth grounded" href="/packs" data-depth="${featured ? '1.1' : '0.85'}"
       aria-label="${esc(pack.name)}">
      <span class="plane plane-slab" data-layer="-16"></span>
      <span class="plane plane-art" data-layer="0" style="background-image:url('${esc(art)}')"></span>
      <span class="plane plane-rim" data-layer="2"></span>
      <span class="plane plane-veil" data-layer="12"></span>
      <span class="plane plane-gloss" data-layer="18"></span>
      <span class="plane plane-plate plane-badge" data-layer="34">
        <span class="plate">
          ${featured ? '<span class="chip-feat">FEATURED</span>' : ''}
          <span class="nm">${esc(pack.name)}</span>
          <span class="pr">${pack.priceRip.toLocaleString()} $RIP</span>
        </span>
      </span>
    </a>
  </div>
</div>`;
}

export function homePage(
  index: CatalogIndex,
  packs: PackConfig[],
  grails: CardListing[],
  featuredId: string,
  feed: HomeFeedItem[],
): string {
  const featured = packs.find((p) => p.id === featuredId) ?? packs[0];
  const others = packs.filter((p) => p.id !== featured?.id);
  // Featured sits in the centre, in front (spec §19). Built as explicit slots
  // rather than by index so a single-pack catalog still stands in the middle.
  const arranged: { pack: PackConfig; slot: string }[] = [];
  if (others[0]) arranged.push({ pack: others[0], slot: 'l' });
  if (featured) arranged.push({ pack: featured, slot: 'c' });
  if (others[1]) arranged.push({ pack: others[1], slot: 'r' });

  const topGrail = grails[0]?.headlineValue ?? null;
  const ghostX = [-330, -118, 118, 330];
  const ghostFloat = [
    '--float-dur:12.5s;--float-delay:-3.2s;--float-amp:16px',
    '--float-dur:14.8s;--float-delay:-7.6s;--float-amp:12px',
    '--float-dur:11.4s;--float-delay:-1.1s;--float-amp:19px',
    '--float-dur:16.2s;--float-delay:-9.4s;--float-amp:14px',
  ];

  const steps = ['BUY $RIP', 'CHOOSE PACK', 'RIP IT', 'REVEAL POKÉMON', 'BUILD COLLECTION'];

  const fair: [string, string][] = [
    [
      'SEED COMMITTED FIRST',
      'We publish <code>sha256(serverSeed)</code> before your rip. You supply the client seed. Neither side can move afterwards.',
    ],
    [
      'PRICES FROZEN FIRST',
      'The price snapshot is locked and hashed <em>before</em> randomness is generated. A card is never drawn and then priced.',
    ],
    [
      'ODDS ARE EXACT',
      'Published odds are ratios of integer weights, not rounded estimates. The full table sits on every pack page.',
    ],
    [
      'ANYONE CAN RECHECK',
      'Outcome is <code>HMAC-SHA256(serverSeed, clientSeed:nonce)</code>. On seed rotation the seed is revealed and every past rip can be recomputed.',
    ],
  ];

  const body = `
<section class="hero">
  <div class="eyebrow" data-reveal>PROVABLY FAIR PACK RIPS</div>
  <h1 data-reveal-group="90">
    <span data-reveal>RIP POKÉMON.</span>
    <span data-reveal>CHASE GRAILS.</span>
    <span class="em" data-reveal>ONCHAIN.</span>
  </h1>
  <p class="sub" data-reveal>Open Pokémon card packs using $RIP. Every pull is verifiable.</p>
  <div class="cta-row" data-reveal>
    <a class="btn btn-primary btn-lg" href="/packs" data-magnetic="0.3">RIP A PACK</a>
    <a class="btn btn-ghost btn-lg" href="/cards">BROWSE THE POKÉDEX</a>
  </div>

  <div class="pack-scene scene" data-reveal-3d>
    <div class="stage-drift" data-parallax="0.055">
      <div class="stage">
        <div class="ghosts" aria-hidden="true">${grails
          .slice(0, 4)
          .map(
            (g, i) => `<div class="ghost-slot"
            style="transform:translate3d(${ghostX[i]}px,-24px,-380px) rotateY(${
              ghostX[i] < 0 ? 14 : -14
            }deg)">
          <div class="ghost floaty" style="${ghostFloat[i]}">
            <img src="${esc(g.imageSmall)}" alt="" loading="lazy" decoding="async">
          </div>
        </div>`,
          )
          .join('')}</div>
        ${arranged.map((a) => pack3d(a.pack, index, a.slot, a.slot === 'c')).join('')}
      </div>
    </div>
  </div>
</section>

<div class="stats" data-reveal>
  <div class="stat">
    <span class="n mono" data-count="${index.cards.length}">0</span>
    <span class="k">CARDS IN THE DEX</span>
  </div>
  <div class="stat">
    <span class="n mono" data-count="${index.facets.sets.length}">0</span>
    <span class="k">SETS INGESTED</span>
  </div>
  <div class="stat">
    <span class="n mono" data-count="${index.byVariantId.size}">0</span>
    <span class="k">TRACKED VARIANTS</span>
  </div>
  <div class="stat">
    ${
      topGrail === null
        ? '<span class="n mono">—</span>'
        : `<span class="n mono gold" data-count="${topGrail}" data-count-dp="2" data-count-prefix="$">$0.00</span>`
    }
    <span class="k">TOP GRAIL VALUE</span>
  </div>
</div>

<section class="band">
  <div class="band-head" data-reveal>
    <h2><span class="pulse-dot"></span>LIVE PULLS</h2>
    <a href="/live">WATCH LIVE <i>→</i></a>
  </div>
  ${
    feed.length === 0
      ? '<div class="empty-state" data-reveal>No rips yet. The feed fills as packs are opened.</div>'
      : `<div class="marquee" data-marquee data-reveal style="--dur:${Math.max(
          30,
          feed.length * 3.4,
        ).toFixed(0)}s">
        <div class="track">${feed
          .map((e) => {
            const major = e.prominence === 'major';
            return `<a class="pull${major ? ' major' : ''}" href="${esc(e.href)}">
            <span class="shot-s"><img src="${esc(e.imageSmall)}" alt="${esc(
              e.cardName,
            )}" loading="lazy" decoding="async"></span>
            <span class="who">
              <span class="nm">${esc(e.cardName)}</span>
              <span class="sub">${esc(e.wallet)} · ${esc(e.when)}</span>
            </span>
            <span class="v${major ? ' major' : ''}">${money(e.value)}</span>
          </a>`;
          })
          .join('')}</div>
      </div>`
  }
</section>

<section class="band">
  <div class="band-head" data-reveal>
    <h2>FEATURED PACKS</h2>
    <a href="/packs">ALL ODDS <i>→</i></a>
  </div>
  <div class="pack-grid" data-reveal-group="70">
    ${packs
      .map(
        (p) => `<a class="pack-card card lift" href="/packs" data-reveal data-spotlight>
      <span class="pc-art" style="background-image:url('${esc(heroImage(p, index))}')"></span>
      <span class="pc-veil"></span>
      <span class="pc-body">
        <span class="pc-nm">${esc(p.name)}</span>
        <span class="pc-dt">${p.pool.length} outcomes · ${p.cardsPerPack} card</span>
        <span class="pc-pr">${p.priceRip.toLocaleString()} $RIP</span>
      </span>
    </a>`,
      )
      .join('')}
  </div>
</section>

<section class="band">
  <div class="band-head" data-reveal>
    <h2>THE GRAILS</h2>
    <a href="/grails">SEE ALL <i>→</i></a>
  </div>
  ${
    grails.length
      ? `<div class="rail grail-rail" data-reveal-group="45">${grails
          .slice(0, 20)
          .map(tile)
          .join('')}</div>`
      : '<div class="empty-state" data-reveal>No cards above the grail threshold in the catalog yet.</div>'
  }
</section>

<section class="band">
  <div class="band-head" data-reveal><h2>HOW IT WORKS</h2></div>
  <ol class="flow" data-reveal-group="120">
    ${steps
      .map(
        (s, i) => `<li class="step" data-reveal>
      <span class="node">
        <span class="ix">${String(i + 1).padStart(2, '0')}</span>
        <b>${esc(s)}</b>
      </span>
      ${i < steps.length - 1 ? '<span class="wire" aria-hidden="true"><i></i></span>' : ''}
    </li>`,
      )
      .join('')}
  </ol>
</section>

<section class="band">
  <div class="band-head" data-reveal><h2>PROVABLY FAIR</h2></div>
  <div class="fair" data-reveal-group="60">
    ${fair
      .map(
        ([h, p]) => `<div class="f card" data-reveal data-spotlight>
      <h4>${esc(h)}</h4>
      <p>${p}</p>
    </div>`,
      )
      .join('')}
  </div>
</section>

<section class="band">
  <div class="band-head" data-reveal>
    <h2>POKÉDEX</h2>
    <a href="/cards">BROWSE <i>→</i></a>
  </div>
  <p class="dex-line" data-reveal><b data-count="${index.cards.length}">0</b> cards across
    <b data-count="${index.facets.sets.length}">0</b> sets,
    <b data-count="${index.byVariantId.size}">0</b> tracked variants.
    Every printing priced separately.</p>
</section>`;

  return layout('RIPDEX — Rip Pokémon. Chase grails. Onchain.', '/', body, HOME_CSS);
}
