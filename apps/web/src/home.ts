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
import { esc, money, layout, grailTile, cssUrl } from './render.ts';
import { tokenSection, tokenHeroContract } from './token.ts';
import { ripMark } from './brand.ts';
import { packExplorer, EXPLORER_CSS } from './pack-explorer.ts';
import { POKEMON_HERO_HTML, POKEMON_HERO_CSS, POKEMON_HERO_JS, POKEMON_HERO_TOGGLE } from './pokemon-hero.ts';

const HOME_CSS = `
<style>
/* ========================= the pack scene ========================== */
/* One camera, three objects standing in it. Sizes are variables so the whole
   arrangement scales down on narrow screens without re-authoring the geometry. */
.pack-scene{--pw:214px;--ph:298px;--spread:208px;
  position:relative;height:436px;margin:34px auto 0;max-width:960px}
.pack-scene::after{content:"";position:absolute;left:50%;bottom:34px;width:min(620px,86%);height:150px;
  transform:translateX(-50%);pointer-events:none;z-index:-1;
  background:radial-gradient(ellipse at 50% 50%,rgba(113,112,255,.22),transparent 70%);
  filter:blur(18px)}
.stage-drift{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform;pointer-events:none}
.stage{position:absolute;inset:0;transform-style:preserve-3d;pointer-events:none}

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
  transform-style:preserve-3d;cursor:pointer;pointer-events:auto}
.pack3d .plane{overflow:hidden}
/* The back slab is what gives the pack thickness. Sitting at Z -16 it projects
   NARROWER than the art in front of it, so flush with the front planes it hides
   completely and the object reads as a single sheet. Outsetting it by 4px puts a
   lit card edge permanently outside the artwork's silhouette — that edge is what
   swings and changes width as the pack turns. Specificity has to beat the
   design system's .card3d .plane inset:0, hence the .pack3d prefix. */
.pack3d .plane-slab{inset:-4px;border-radius:calc(var(--r-lg) + 4px);
  transform:translateZ(-16px);
  background:linear-gradient(104deg,#17181d,#0b0c0e 46%,#060708);
  box-shadow:0 0 0 1px rgba(255,255,255,.1),0 30px 60px -30px rgba(0,0,0,.9)}
/* A bright, blurred halo of the pack's OWN art, so every pack floats in its own
   themed glow (crimson 151, gold Base Set) instead of reading as a black box. */
.pack3d .plane-glow{inset:-28% -20% -16%;transform:translateZ(-46px);border-radius:50%;
  background-size:cover;background-position:50% 42%;background-repeat:no-repeat;
  filter:blur(40px) saturate(2.1) brightness(1.18);opacity:.5;pointer-events:none}
.plane-art{background-size:176%;background-position:50% 32%;background-repeat:no-repeat;
  background-color:var(--panel)}
/* A generated pack wrapper is already the right shape: fill the plane, don't
   crop a card into it. */
.plane-art.has-wrapper{background-size:cover;background-position:50% 45%}
/* A much lighter veil — just enough to seat the name plate, not so much it dulls
   the pack into a dark slab. */
.plane-veil{background:linear-gradient(180deg,transparent 42%,rgba(8,9,10,.48) 82%,rgba(8,9,10,.8) 100%)}
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
.slot-l .plane-art,.slot-r .plane-art{filter:brightness(.74) saturate(.92)}
.slot-l .plane-glow,.slot-r .plane-glow{opacity:.34}
.slot-l .plane-veil,.slot-r .plane-veil{background:
  linear-gradient(180deg,transparent 44%,rgba(8,9,10,.5) 80%,rgba(8,9,10,.85) 100%)}

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


/* One continuous stage; only the text and section interiors have gutters. */
.home-wrap{max-width:none;padding:0 0 70px}
.home-inner{max-width:1200px;margin:auto;padding:0 32px}
.hero{position:relative;isolation:isolate;overflow:hidden;min-height:640px;
  background:
    radial-gradient(64% 82% at 63% 46%,rgba(113,112,255,.2),transparent 60%),
    radial-gradient(70% 64% at 60% 104%,rgba(240,122,52,.12),transparent 60%),
    radial-gradient(130% 120% at 50% 4%,transparent 42%,rgba(4,5,8,.72) 96%)}
/* A soft pool of light the packs sit in, so they read as the lit hero of the
   stage rather than floating on flat dark. */
.hero-main::before{content:"";position:absolute;z-index:0;right:2%;top:150px;width:56%;height:340px;pointer-events:none;
  background:radial-gradient(50% 50% at 50% 42%,rgba(120,120,255,.16),transparent 70%);filter:blur(8px)}
.hero-inner{position:relative;max-width:1200px;margin:auto;padding:38px 32px 32px}
.hero-top{display:flex;justify-content:space-between;gap:20px;color:var(--text-3);font-size:10px;letter-spacing:.14em}
.hero h1{position:relative;margin:14px 0 0;font-size:clamp(90px,15.5vw,196px);font-weight:650;
  line-height:.98;letter-spacing:-.075em;color:var(--text)}
.hero h1 span{color:var(--accent)}
.hero-main{display:grid;grid-template-columns: .85fr 1.15fr;align-items:center;min-height:344px}
.hero-copy{position:relative;z-index:3;padding:25px 0 18px}
.hero h2{font-weight:590;font-size:clamp(28px,3.1vw,42px);line-height:1.12;letter-spacing:-.045em;margin:0 0 16px}
.hero-copy p{max-width:32ch;margin:0 0 26px;color:var(--text-3);font-size:14px;line-height:1.75}
.hero-actions{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.text-link{font-size:12px;color:var(--text-2);padding:12px 0;display:inline-flex;gap:12px;align-items:center}
.text-link:hover{color:var(--accent-hi)}
.hero-foot{display:flex;justify-content:space-between;gap:20px;padding-top:20px;box-shadow:0 -1px 0 var(--line);
  font-size:10px;letter-spacing:.08em;color:var(--text-3)}
.hero-foot b{color:var(--text-2);font-weight:550}
.hero .pack-scene{width:100%;--pw:170px;--ph:238px;--spread:154px;height:334px;margin:-30px 0 0}
.hero .pack-scene::after{bottom:0}
.hero .slot-l .plane-art,.hero .slot-r .plane-art{filter:brightness(.9) saturate(.95)}
.hero .plane-veil{background:linear-gradient(180deg,transparent 46%,rgba(8,9,10,.42) 84%,rgba(8,9,10,.72))}
/* The featured grail is the centrepiece — let it outshine the flankers instead
   of reading as the darkest pack. A touch more light on its own foil, a fuller
   themed glow behind it, and a lighter veil so its lower gold rays survive. */
.hero .slot-c .plane-art{filter:brightness(1.08) saturate(1.1) contrast(1.03)}
.hero .slot-c .plane-glow{opacity:.72;filter:blur(38px) saturate(2.3) brightness(1.34)}
.hero .slot-c .plane-veil{background:linear-gradient(180deg,transparent 56%,rgba(8,9,10,.26) 86%,rgba(8,9,10,.56))}
.hero .ghosts{display:none}
.hero .pack3d{border-radius:10px}
.hero .plate{background:rgba(10,11,12,.9)}
.hero .chip-feat{font-size:8px;letter-spacing:.1em}
.section{padding:62px 0;box-shadow:0 -1px 0 var(--line)}
.section-head{display:flex;justify-content:space-between;align-items:end;gap:24px;margin-bottom:28px}
.section-index{display:block;color:var(--text-4);font-size:10px;letter-spacing:.13em;margin-bottom:12px}
.section h2{font-size:clamp(26px,3.5vw,38px);line-height:1.1;letter-spacing:-.04em;font-weight:590;margin:0}
.section-head p{color:var(--text-3);font-size:13px;margin:10px 0 0}
.pack-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px 24px}
.pack-card{display:block;min-width:0}
.pack-visual{position:relative;display:flex;align-items:center;justify-content:center;height:235px;overflow:hidden;
  background:radial-gradient(ellipse at 50% 85%,rgba(113,112,255,.15),transparent 66%),var(--panel);border-radius:12px;
  box-shadow:0 0 0 1px var(--line);transition:background .3s var(--ease)}
.pack-visual::after{content:'';position:absolute;left:18%;right:18%;bottom:13px;height:20px;
  background:rgba(0,0,0,.6);filter:blur(13px)}
.pack-visual img{position:relative;z-index:1;width:125px;height:174px;object-fit:cover;border-radius:5px;
  transform:rotate(-8deg);box-shadow:5px 5px 0 #202129,8px 9px 0 #0b0c10,0 15px 25px rgba(0,0,0,.4);
  transition:transform .6s var(--ease)}
.pack-card:nth-child(even) .pack-visual img{transform:rotate(8deg)}
.pack-card:hover .pack-visual img{transform:translateY(-9px) rotate(0deg) scale(1.04)}
.pack-no{position:absolute;top:16px;left:16px;color:var(--text-4);font:10px ui-monospace,monospace}
.pack-arrow{position:absolute;right:14px;top:12px;font-size:19px;color:var(--text-4);transition:color .3s,transform .3s}
.pack-card:hover .pack-arrow{color:var(--accent-hi);transform:translate(2px,-2px)}
.pack-info{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:18px}
.pack-info h3{font-size:14px;font-weight:590;letter-spacing:-.02em;margin:0}
.pack-price{font-size:12px;color:var(--text-2);white-space:nowrap}
.pack-price small{font-size:9px;color:var(--text-4)}
.pack-detail{font-size:11px;color:var(--text-3);margin:7px 0 0}
.grail-rail{gap:28px;padding:8px 3px 24px}
.grail-rail .tile{flex-basis:190px;min-width:0}
/* Let the grail treatment through: the gold rim from .gcard .shot and the card's
   own art-glow both bloom on these hero cards (the rail's signature moment). */
.grail-rail .tile::before{opacity:.5}
.grail-rail .tile:hover::before{opacity:.82}
.home-live{display:grid;grid-template-columns:240px 1fr;gap:40px;align-items:center}
.home-live h2{font-size:28px}
.home-live p{font-size:12px;color:var(--text-3)}
.pull-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px}
.pull{display:flex;align-items:center;gap:12px;padding:14px 0;box-shadow:0 1px 0 var(--line);min-width:0}
.pull img{width:34px;height:48px;object-fit:cover;border-radius:3px}
.pull .who{min-width:0;flex:1}.pull .nm{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pull .sub{display:block;color:var(--text-4);font-size:10px;margin-top:3px}
.pull .v{font-size:11px;color:var(--text-2);white-space:nowrap}.pull .v.major{color:var(--gold)}
.home-live .empty-state{text-align:left;padding:24px 0;background:none;box-shadow:none}
.steps{display:grid;grid-template-columns:repeat(3,1fr);list-style:none;padding:0;margin:32px 0 0;gap:36px}
.steps li{box-shadow:0 -1px 0 var(--line-hi);padding:24px 0 0}
.steps .ix{font:11px ui-monospace,monospace;color:var(--accent-hi)}
.steps h3{font-size:18px;letter-spacing:-.025em;font-weight:560;margin:20px 0 10px}
.steps p{font-size:13px;color:var(--text-3);margin:0;max-width:32ch;line-height:1.7}
.fair-details{margin-top:30px;box-shadow:0 1px 0 var(--line)}
.fair-details summary{padding:20px 0;cursor:pointer;font-size:13px;color:var(--text-2)}
.fair{display:grid;grid-template-columns:repeat(2,1fr);gap:24px 40px;padding:10px 0 30px}
.fair h3{font-size:11px;font-weight:560;letter-spacing:.06em}
.fair p{font-size:12px;color:var(--text-3);line-height:1.8}.fair code{overflow-wrap:anywhere;color:var(--text-2)}
/* The page peaks here: the final CTA is a full accent-washed panel, not another
   hairline row, so the home page builds toward conversion instead of flatlining. */
.section.dex-outro{display:flex;align-items:center;justify-content:space-between;gap:32px;padding:46px 44px;margin:24px 0 4px;
  border-radius:var(--r-xl);box-shadow:0 0 0 1px var(--line-hi),0 30px 72px -36px rgba(0,0,0,.7);
  background:radial-gradient(130% 170% at 0% 0%,var(--accent-dim),transparent 56%),linear-gradient(160deg,var(--elevated),var(--panel) 72%)}
.dex-outro .section-index{color:var(--accent-hi)}
.dex-outro h2{font-size:clamp(28px,3.4vw,42px);letter-spacing:-.03em;line-height:1.05;margin:10px 0 8px}
.dex-outro p{font-size:13px;color:var(--text-3);max-width:42ch;margin-bottom:0}
/* One Piece — a "next universe" coming-soon tease, warm amber to set it apart. */
.coming-soon .cs-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
.cs-index{color:var(--warn)}
.cs-badge{flex:0 0 auto;font-size:10px;font-weight:800;letter-spacing:.14em;color:var(--warn);padding:6px 12px;border-radius:100px;background:rgba(216,164,78,.12);box-shadow:0 0 0 1px rgba(216,164,78,.32)}
.op-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;margin-top:22px}
.op-case,.op-card{border-radius:var(--r-md);overflow:hidden;background:linear-gradient(160deg,var(--elevated),var(--panel));box-shadow:0 0 0 1px var(--line);opacity:.92;transition:opacity .25s,box-shadow .25s,transform .25s var(--ease)}
.op-case{grid-column:span 2;display:flex;flex-direction:column}
.op-case-art{position:relative;aspect-ratio:16/10;display:grid;place-items:center;background:radial-gradient(120% 130% at 50% 30%,rgba(216,164,78,.16),transparent 60%),repeating-linear-gradient(135deg,rgba(255,255,255,.02) 0 10px,transparent 10px 20px)}
.op-flag{font-size:46px;filter:grayscale(.15) brightness(.92);opacity:.72}
.op-lock{position:absolute;bottom:10px;right:12px;font-size:15px;opacity:.7}
.op-case-info{padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px}
.op-case-info h3{font-size:14px;margin:0;letter-spacing:-.02em}
.op-soon{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--warn)}
.op-card-art{position:relative;aspect-ratio:63/88;display:grid;place-items:center;background:radial-gradient(120% 120% at 50% 28%,rgba(216,164,78,.12),transparent 62%),var(--panel)}
.op-q{font-size:48px;font-weight:800;color:var(--text-4);opacity:.32}
.op-rank{position:absolute;top:8px;left:8px;font-size:8px;font-weight:800;letter-spacing:.05em;color:#08090a;background:var(--warn);padding:3px 7px;border-radius:5px;opacity:.85}
.op-card-meta{padding:9px 11px}
.op-name{display:block;font-size:12px;font-weight:600;letter-spacing:-.01em;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.op-sub{display:block;font-size:10px;color:var(--text-4);margin-top:2px}
.op-card:hover,.op-case:hover{opacity:1;transform:translateY(-3px);box-shadow:0 0 0 1px rgba(216,164,78,.34)}
@media(max-width:680px){.op-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.op-case{grid-column:1/-1}}
@media(min-width:1400px){.hero h1{font-size:196px}}
@media(max-width:900px){
 .hero{min-height:0}.hero-inner{padding:28px 24px}.home-inner{padding:0 24px}
 .hero .pack-scene{--pw:138px;--ph:194px;--spread:115px}
 .hero-main{grid-template-columns:1fr 1fr}.hero-copy p{max-width:28ch}
 .hero-actions{gap:8px}.hero-actions .btn{padding:0 18px}
 .pack-visual{height:200px}.pack-info{display:block}.pack-price{display:block;margin-top:7px}
 .home-live{grid-template-columns:1fr;gap:16px}
}
@media(max-width:600px){
 .hero-inner{padding:22px 20px 24px}.home-inner{padding:0 20px}
 .hero-top{font-size:8px;letter-spacing:.08em}.hero-top span:last-child{display:none}
 .hero h1{font-size:24vw;margin:18px 0 0}.hero-main{display:flex;flex-direction:column-reverse;min-height:0}
 .hero .pack-scene{--pw:113px;--ph:158px;--spread:99px;height:224px;margin:4px 0 0}
 .hero .slot-c{transform:translate3d(0,-8px,80px)}
 .hero-copy{width:100%;padding:5px 0 22px}.hero h2{font-size:30px;margin-bottom:10px}
 .hero-copy p{max-width:40ch;font-size:13px;margin-bottom:20px}.hero-actions{gap:18px}
 .hero-foot{font-size:8px;padding-top:16px}.hero-foot span:last-child{display:none}
 .section{padding:38px 0}.section-head{align-items:start;gap:12px;margin-bottom:22px}
 .section-head .text-link{white-space:nowrap;font-size:10px}.section-head p{max-width:28ch;font-size:12px}
 .section-index{font-size:9px}.section h2{font-size:28px}
 .pack-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:26px 14px}
 .pack-visual{height:170px}.pack-visual img{width:87px;height:122px}.pack-no{font-size:8px;top:12px;left:10px}
 .pack-info h3{font-size:12px}.pack-price{font-size:11px}.pack-detail{font-size:10px}
 .grail-rail .tile{flex-basis:155px}.grail-rail{gap:20px}
 .pull-list,.fair{grid-template-columns:1fr}.steps{grid-template-columns:1fr;gap:22px}
 .steps li{display:grid;grid-template-columns:30px 1fr;gap:0 12px;padding-top:20px}
 .steps .ix{grid-row:span 2;padding-top:5px}.steps h3{margin:0 0 8px}.steps p{max-width:none}
 .section.dex-outro{display:block;padding:32px 24px}.dex-outro .btn{margin-top:24px}
}
@media(max-width:360px){
 .hero .pack-scene{--pw:98px;--ph:137px;--spread:85px;height:185px}
 .hero h2{font-size:26px}.hero-copy p{font-size:12px;line-height:1.6;margin-bottom:16px}
 .hero-actions{gap:12px}.hero-actions .btn{font-size:12px;padding:0 16px;height:44px}
 .hero-actions .text-link{font-size:10px;gap:7px}.hero-copy{padding-bottom:18px}
}

/* Compact showcase and a useful activity column share the first viewport. */
.lobby-stage{display:block;max-width:1440px;margin:0 auto;box-shadow:0 1px 0 var(--line)}
.hero{min-height:0;background:radial-gradient(ellipse at 70% 50%,rgba(113,112,255,.18),transparent 55%),linear-gradient(120deg,#11121b,#090a10)}
.hero::after{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;background-image:linear-gradient(rgba(113,112,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(113,112,255,.035) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(90deg,transparent,black)}
.hero-inner{padding:30px 32px 22px;min-height:390px}.hero-top{font-size:9px;letter-spacing:.14em}.hero h1{font-size:100px;margin:16px 0 0;line-height:.9}.hero-main{display:block;min-height:200px}
.hero-copy{width:47%;padding:24px 0 22px}.hero h2{font-size:25px;line-height:1.15;margin-bottom:12px}.hero-copy p{font-size:11px;line-height:1.8;margin-bottom:20px;max-width:none}.hero-actions{gap:14px}.hero-actions .btn{font-size:11px;height:40px;padding:0 18px}.hero-inspect{font-size:10px;color:var(--text-3);padding:12px 0}
.hero-inspect:hover{color:var(--accent-hi)}
.hero .pack-scene{position:absolute;right:0;top:78px;width:53%;height:276px;--pw:148px;--ph:208px;--spread:124px;margin:0}
.hero-foot{font-size:8px;padding-top:16px}.hero .slot-c{transform:translate3d(0,-8px,95px)}
.lobby-activity{background:rgba(15,16,22,.72);padding:22px 17px 14px;box-shadow:-1px 0 0 var(--line);min-width:0}
.activity-head{display:flex;justify-content:space-between;align-items:center}.activity-head h2{font-size:12px;margin:0;font-weight:560}.activity-head>a{font-size:17px;color:var(--text-3)}.activity-caption{display:block;font-size:8px;letter-spacing:.08em;color:var(--text-4);margin:7px 0 12px}
.activity-list{height:310px;overflow-y:auto;scrollbar-width:thin}.activity-row{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:9px;align-items:center;padding:10px 0;box-shadow:0 1px 0 var(--line)}.activity-row img{width:32px;height:45px;border-radius:3px;object-fit:cover}.activity-row b{display:block;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.activity-row small{display:block;font-size:8px;color:var(--text-4);margin-top:3px}.activity-row em{display:block;font-size:8px;font-style:normal;color:var(--text-4);margin-top:2px}.activity-row strong{font:9px ui-monospace,monospace;color:var(--text-2)}.activity-footer{display:flex;justify-content:space-between;gap:10px;font-size:10px;color:var(--text-3);padding-top:16px}.activity-empty{font-size:11px;color:var(--text-3)}
.home-inner{max-width:1440px;padding:0 32px}.set-section{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:24px 0 30px}
.set-door{position:relative;isolation:isolate;display:flex;align-items:center;justify-content:space-between;min-height:106px;padding:18px;overflow:hidden;box-shadow:0 0 0 1px var(--line);border-radius:10px;background:linear-gradient(150deg,var(--elevated),var(--panel));transition:box-shadow .25s,transform .25s var(--ease)}
.set-door:hover{box-shadow:0 0 0 1px rgba(113,112,255,.35),0 14px 30px -18px rgba(0,0,0,.6);transform:translateY(-3px)}.set-door-copy{position:relative;z-index:2}.set-door span{font-size:8px;letter-spacing:.06em;color:var(--text-4)}.set-door h2{font-size:17px;letter-spacing:-.03em;font-weight:590;margin:6px 0}.set-door small{font-size:9px;color:var(--text-3)}
/* Each set-door is lit by its own top card — a bloom of that set's headline
   card colour, so a Base door glows differently from a Jungle door. */
.set-door[style*="--art"]::before{content:"";position:absolute;z-index:-1;inset:0;background-image:var(--art);
  background-size:cover;background-position:72% 28%;filter:blur(30px) saturate(1.6);opacity:.17;transition:opacity .3s var(--ease)}
.set-door:hover[style*="--art"]::before{opacity:.32}
.set-door-art{position:absolute;right:-9px;top:12px;bottom:0;width:116px;z-index:0;opacity:.82;transition:transform .5s var(--ease)}.set-door-art::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,var(--panel),transparent)}.set-door-art img{position:absolute;width:72px;right:0;top:8px;border-radius:4px;box-shadow:0 6px 14px rgba(0,0,0,.4);transform:rotate(13deg)}.set-door-art img:first-child{right:48px;top:22px;transform:rotate(-12deg)}.set-door:hover .set-door-art{transform:translateY(-6px)}
.discovery-section{padding-top:28px;scroll-margin-top:150px}.discovery-hint{font-size:11px;color:var(--text-4)}.discovery-section .section-head{margin-bottom:24px}.discovery-section h2{font-size:29px}.section{padding:42px 0}.section-index{font-size:9px;margin-bottom:10px}
.rail-actions{display:flex;align-items:center;gap:8px}.rail-actions button{height:34px;width:34px;border-radius:7px;box-shadow:0 0 0 1px var(--line-hi);font-size:16px}.rail-actions button:hover{background:var(--accent-dim)}.rail-actions .text-link{margin-left:8px}
html.dialog-open{overflow:hidden}
@media(min-width:1500px){.hero-inner{padding-left:42px}.hero h1{font-size:112px}.hero .pack-scene{--pw:165px;--ph:230px;--spread:143px;top:70px}}
@media(max-width:1150px){.lobby-stage{grid-template-columns:minmax(0,1fr) 220px}.hero-inner{padding:26px 24px 20px}.hero h1{font-size:88px}.hero .pack-scene{--pw:115px;--ph:162px;--spread:88px;top:76px}.hero-copy{width:50%}.hero-copy p br{display:none}.hero-actions{gap:3px}.home-inner{padding:0 24px}.set-door{padding:14px}.set-door h2{font-size:14px}.set-door-art{opacity:.4}}
@media(max-width:850px){.lobby-stage{display:block}.lobby-activity{display:none}.hero-inner{min-height:360px}.hero .pack-scene{--pw:142px;--ph:199px;--spread:115px;top:60px}.hero-copy{width:48%}.set-section{grid-template-columns:repeat(2,minmax(0,1fr))}.set-door-art{opacity:.7}.set-door h2{font-size:17px}}
@media(max-width:600px){
 .hero-inner{padding:24px 20px 20px;min-height:0}.hero h1{font-size:24vw;line-height:.95;margin-top:18px}.hero-top{font-size:8px}.hero-main{display:flex;flex-direction:column-reverse;min-height:0}.hero .pack-scene{position:relative;top:auto;right:auto;width:100%;height:200px;--pw:107px;--ph:150px;--spread:98px;margin:12px 0 0}.hero-copy{width:100%;padding:8px 0 22px}.hero h2{font-size:27px}.hero-copy p{font-size:12px;max-width:38ch}.hero-actions{gap:15px}.hero-actions .btn{height:44px;font-size:12px}.hero-inspect{font-size:10px}.hero-foot{font-size:8px}.hero-foot span:last-child{display:block}.home-inner{padding:0 16px}.set-section{gap:10px;padding:18px 0 26px}.set-door{padding:12px;min-height:96px}.set-door h2{font-size:14px}.set-door span{font-size:7px}.set-door-art{opacity:.4;width:75px}.set-door-art img{width:52px}.discovery-hint{display:none}.section-head{align-items:center}.discovery-section h2{font-size:25px}.rail-actions .text-link{display:none}.section h2{font-size:25px}
}
@media(max-width:360px){.hero .pack-scene{height:175px;--pw:96px;--ph:135px;--spread:82px}.hero h2{font-size:25px}.hero-copy p{font-size:11px}.hero-actions{gap:8px}.hero-actions .btn{font-size:11px;padding:0 13px}.hero-inspect{font-size:9px}}
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
function pack3d(
  pack: PackConfig,
  index: CatalogIndex,
  slot: string,
  featured: boolean,
  wrapper?: string,
): string {
  // A generated wrapper is already pack-shaped, so it fills the plane edge to
  // edge (.has-wrapper). A card hero is cropped into the pack silhouette instead.
  const art = wrapper ?? heroImage(pack, index);
  return `<div class="slot slot-${slot}">
  <div class="bob floaty" style="${FLOAT[slot] ?? FLOAT.c}">
    <a class="pack3d card3d depth grounded" href="/rip/${encodeURIComponent(pack.id)}" data-depth="${featured ? '1.1' : '0.85'}"
       aria-label="Open ${esc(pack.name)}">
      <span class="plane plane-glow" style="background-image:url('${esc(art)}')"></span>
      <span class="plane plane-slab" data-layer="-16"></span>
      <span class="plane plane-art${wrapper ? ' has-wrapper' : ''}" data-layer="0" style="background-image:url('${esc(art)}')"></span>
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
  wrappers: Record<string, string> = {},
): string {
  const featured = packs.find((p) => p.id === featuredId) ?? packs[0];
  const others = packs.filter((p) => p.id !== featured?.id);
  // Featured sits in the centre, in front (spec §19). Built as explicit slots
  // rather than by index so a single-pack catalog still stands in the middle.
  const arranged: { pack: PackConfig; slot: string }[] = [];
  if (others[0]) arranged.push({ pack: others[0], slot: 'l' });
  if (featured) arranged.push({ pack: featured, slot: 'c' });
  if (others[1]) arranged.push({ pack: others[1], slot: 'r' });

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
<div class="lobby-stage">
<section class="hero" aria-labelledby="home-title">
  ${POKEMON_HERO_HTML}
  <div class="hero-inner">
    ${POKEMON_HERO_TOGGLE}
    <div class="hero-top" data-reveal>${ripMark()}<span>THE POKÉMON COLLECTOR’S CLUB</span></div>
    <h1 id="home-title" data-reveal>RIP<span>DEX</span></h1>
    <div class="hero-main">
      <div class="hero-copy" data-reveal-group="70">
        <h2 data-reveal>A world of Pokémon.<br>One card at a time.</h2>
        <p data-reveal>From your first favorite to the iconic Charizard. <br>Explore the packs. Find your next addition.</p>
        <div class="hero-actions" data-reveal>
          ${featured
            ? `<button type="button" class="btn btn-primary" data-preview="${esc(featured.id)}">Rip the featured pack <span aria-hidden="true">→</span></button>
          <a class="text-link" href="#discover">Browse all packs <span aria-hidden="true">↓</span></a>`
            : `<a class="btn btn-primary" href="#discover">Discover packs <span aria-hidden="true">↓</span></a>`}
        </div>
      </div>
      <div class="pack-scene scene" aria-label="Featured packs"><div class="stage-drift" data-parallax="0.018"><div class="stage">
        ${arranged.map((a) => pack3d(a.pack, index, a.slot, a.slot === 'c', wrappers[a.pack.id])).join('')}
      </div></div></div>
    </div>
    <div class="hero-foot"><span><b>${packs.length}</b> PACKS SEALED</span><span>EVERY PULL GRADED · PRICED · YOURS TO KEEP</span></div>
    ${tokenHeroContract()}
  </div>
</section>
</div>
<div class="home-inner">
<section class="section discovery-section" id="discover" aria-labelledby="packs-title">
  <div class="section-head" data-reveal><div><span class="section-index">THE PACK LIBRARY</span><h2 id="packs-title">Find your kind of pack.</h2></div><span class="discovery-hint">Preview contents. Compare possibilities.</span></div>
  ${packExplorer(packs, index, wrappers)}
</section>
<a class="token-announcement" href="#rip-token"><span>${ripMark()}<b>$RIP</b> The next chapter is coming.</span><span>Launch plan <span aria-hidden="true">↗</span></span></a>
<section class="set-section" aria-label="Browse Pokémon sets">
 ${index.facets.sets.map((set) => {
   const cards = index.cards.filter((c) => c.setId === set.id);
   const art = [...cards].sort((a, b) => (b.headlineValue ?? 0) - (a.headlineValue ?? 0)).slice(0, 2);
   const year = cards[0]?.year;
   const glow = cssUrl(art[0]?.imageSmall);
   return `<a class="set-door" href="/cards?setId=${encodeURIComponent(set.id)}"${glow ? ` style="--art:url(${glow})"` : ''}><div class="set-door-copy"><span>${year ? year+' / ' : ''}${set.count} CARDS</span><h2>${esc(set.name)}</h2><small>Explore set ↗</small></div><div class="set-door-art" aria-hidden="true">${art.map((c) => `<img src="${esc(c.imageSmall)}" alt="" loading="lazy">`).join('')}</div></a>`;
 }).join('')}
</section>
${tokenSection()}
<section class="section" aria-labelledby="grails-title">
  <div class="section-head" data-reveal>
    <div><span class="section-index">THE WISHLIST</span><h2 id="grails-title">Worth the chase.</h2><p>The cards you never stopped thinking about.</p></div>
    <div class="rail-actions"><button type="button" data-rail-step="-1" aria-label="Previous featured cards">←</button><button type="button" data-rail-step="1" aria-label="Next featured cards">→</button><a class="text-link" href="/grails">All grails ↗</a></div>
  </div>
  ${grails.length ? `<div class="rail grail-rail" id="grail-rail" tabindex="0" aria-label="Featured cards, scroll horizontally" data-reveal-group="45">${grails.slice(0, 8).map((c, i) => grailTile(c, i)).join('')}</div>` : '<div class="empty-state">The grail collection is waiting for its first card.</div>'}
</section>
<section class="section coming-soon" id="one-piece" aria-labelledby="op-title">
  <div class="section-head cs-head" data-reveal>
    <div><span class="section-index cs-index">NEXT UNIVERSE · COMING SOON</span><h2 id="op-title">One Piece.</h2><p>The grails of the Grand Line are sailing in. Rip for the game’s most-chased alt-arts and manga rares.</p></div>
    <span class="cs-badge">SOON</span>
  </div>
  <div class="op-grid" data-reveal-group="55">
    <div class="op-case" data-reveal aria-label="Grand Line Case — coming soon">
      <div class="op-case-art"><span class="op-flag" aria-hidden="true">☠️</span><span class="op-lock" aria-hidden="true">🔒</span></div>
      <div class="op-case-info"><h3>Grand Line Case</h3><span class="op-soon">Coming soon</span></div>
    </div>
    ${[
      { name: 'Monkey D. Luffy', sub: 'Leader · Alt Art' },
      { name: 'Shanks', sub: 'Comic Parallel' },
      { name: 'Roronoa Zoro', sub: 'Manga Rare' },
      { name: 'Boa Hancock', sub: 'Alt Art' },
      { name: 'Portgas D. Ace', sub: 'Alt Art' },
    ]
      .map(
        (g) => `<div class="op-card" data-reveal>
      <div class="op-card-art"><span class="op-q" aria-hidden="true">?</span><span class="op-rank">GRAIL</span></div>
      <div class="op-card-meta"><span class="op-name">${esc(g.name)}</span><span class="op-sub">${esc(g.sub)}</span></div>
    </div>`,
      )
      .join('')}
  </div>
</section>
<section class="section" aria-labelledby="how-title">
  <div class="section-head" data-reveal><div><span class="section-index">HOW IT WORKS</span><h2 id="how-title">A little anticipation.<br>A new addition.</h2></div></div>
  <ol class="steps" data-reveal-group="80">
    <li data-reveal><span class="ix">01</span><h3>Find your pack</h3><p>Explore the sets, possible pulls, and exact odds before you choose.</p></li>
    <li data-reveal><span class="ix">02</span><h3>Make the reveal</h3><p>Open your pack and discover the card waiting inside.</p></li>
    <li data-reveal><span class="ix">03</span><h3>Build your binder</h3><p>Keep track of your pulls, complete sets, and find your next favorite.</p></li>
  </ol>
  <details class="fair-details"><summary>Behind every pull: published odds &amp; verifiable outcomes</summary>
    <div class="fair">${fair.map(([h, p]) => `<div><h3>${esc(h)}</h3><p>${p}</p></div>`).join('')}</div>
  </details>
</section>
<section class="section dex-outro" aria-labelledby="dex-title">
  <div data-reveal><span class="section-index">THE COLLECTION STARTS HERE</span><h2 id="dex-title">Meet your next favorite.</h2><p>Your next favorite is one pull away.</p></div>
  <a class="btn btn-primary btn-lg" href="/cards">Explore the Pokédex <span aria-hidden="true">↗</span></a>
</section>
</div><script>
  document.querySelectorAll('[data-rail-step]').forEach(button => button.addEventListener('click', () => {
    const rail = document.getElementById('grail-rail');
    rail?.scrollBy({left: Number(button.dataset.railStep) * rail.clientWidth * .8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  }));
</script>${POKEMON_HERO_JS}`;

  return layout('RIPDEX — The thrill of the pull.', '/', body, HOME_CSS + EXPLORER_CSS + POKEMON_HERO_CSS);
}
