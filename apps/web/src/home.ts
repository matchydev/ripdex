/**
 * Homepage (spec §19).
 *
 * Product-focused: the packs and the cards lead, the chain infrastructure is a
 * section near the bottom rather than the headline.
 */

import type {
  CardListing,
  CatalogIndex,
  PackConfig,
} from '../../../packages/pokemon-core/src/index.ts';
import { esc, money, layout, tile } from './render.ts';

const HOME_CSS = `
<style>
.hero{position:relative;padding:64px 0 56px;text-align:center;overflow:hidden}
.hero::before{content:"";position:absolute;inset:-40% -20% auto;height:520px;pointer-events:none;
  background:radial-gradient(ellipse at 50% 0%,rgba(255,107,26,.16),transparent 62%)}
.hero h1{position:relative;font-size:clamp(30px,6.4vw,62px);line-height:1.02;letter-spacing:-.03em;
  font-weight:800;margin:0}
.hero h1 em{font-style:normal;color:var(--accent)}
.hero .sub{position:relative;margin:18px auto 0;max-width:46ch;color:var(--muted);font-size:15px}
.hero .cta-row{position:relative;margin-top:30px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.btn-primary{padding:15px 36px;border-radius:12px;font-weight:800;letter-spacing:.14em;font-size:13px;
  background:linear-gradient(180deg,#FF8B3D,#E2510A);color:#180701;
  box-shadow:0 14px 34px -12px rgba(255,107,26,.7),inset 0 1px 0 rgba(255,255,255,.4);
  transition:transform .18s}
.btn-primary:hover{transform:translateY(-2px)}
.btn-ghost{padding:15px 26px;border-radius:12px;border:1px solid var(--line);
  font-size:12px;letter-spacing:.16em;color:var(--muted)}
.btn-ghost:hover{color:var(--ink);border-color:var(--line-2)}

/* three packs, featured in front (spec §19) */
.packs-3{position:relative;height:330px;margin:46px auto 0;max-width:640px}
.packs-3 .p{position:absolute;left:50%;top:0;width:196px;aspect-ratio:734/1024;border-radius:12px;
  overflow:hidden;box-shadow:0 30px 70px -26px #000,0 0 0 1px rgba(255,255,255,.08);
  transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.packs-3 .p .art{position:absolute;inset:0;background-size:178%;background-position:50% 24%;opacity:.62}
.packs-3 .p .veil{position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(8,4,3,.2),rgba(8,4,3,.9) 72%,#080403)}
.packs-3 .p .nm{position:absolute;left:0;right:0;bottom:14px;text-align:center;font-size:11px;
  font-weight:800;letter-spacing:.08em;text-shadow:0 2px 14px #000}
.packs-3 .l{transform:translateX(-136%) rotate(-11deg) scale(.86);filter:brightness(.62)}
.packs-3 .r{transform:translateX(36%) rotate(11deg) scale(.86);filter:brightness(.62)}
.packs-3 .c{transform:translateX(-50%) scale(1.04);z-index:3}
.packs-3:hover .l{transform:translateX(-152%) rotate(-14deg) scale(.88)}
.packs-3:hover .r{transform:translateX(52%) rotate(14deg) scale(.88)}
/* grails faintly behind the packs */
.ghosts{position:absolute;inset:0;display:flex;justify-content:center;gap:20px;
  pointer-events:none;opacity:.15;filter:blur(1.5px)}
.ghosts img{width:118px;border-radius:7px;align-self:center}

section.band{padding:52px 0;border-top:1px solid var(--line)}
.band-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:20px}
.band-head h2{font-size:11px;letter-spacing:.28em;color:var(--muted);margin:0;font-weight:600}
.band-head a{font-size:11px;letter-spacing:.16em;color:var(--faint)}
.band-head a:hover{color:var(--ink)}

.rail{display:flex;gap:16px;overflow-x:auto;padding-bottom:12px;scroll-snap-type:x mandatory}
.rail::-webkit-scrollbar{height:6px}
.rail::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:3px}
.rail .tile{flex:0 0 172px;scroll-snap-align:start}

.pack-row{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.pack-card{border:1px solid var(--line);border-radius:14px;padding:16px;background:var(--surface);
  display:flex;gap:14px;align-items:center;transition:border-color .2s,transform .2s}
.pack-card:hover{border-color:var(--line-2);transform:translateY(-3px)}
.pack-card .thumb{width:64px;aspect-ratio:734/1024;border-radius:7px;overflow:hidden;flex:0 0 auto;
  background:#12101A;background-size:cover;background-position:50% 22%}
.pack-card .nm{font-size:13.5px;font-weight:700;letter-spacing:.04em}
.pack-card .dt{font-size:10.5px;color:var(--faint);margin-top:4px}
.pack-card .pr{font-size:12px;color:var(--accent);font-family:ui-monospace,Menlo,monospace;margin-top:6px}

.steps{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.step{border:1px solid var(--line);border-radius:10px;padding:12px 16px;background:var(--surface)}
.step b{color:var(--ink);font-size:12px;letter-spacing:.16em;font-weight:700}
.arrow{color:var(--faint);font-size:14px}

.fair{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}
.fair .f{border:1px solid var(--line);border-radius:12px;padding:16px;background:var(--surface)}
.fair .f h4{margin:0 0 7px;font-size:11px;letter-spacing:.18em;color:var(--ink)}
.fair .f p{margin:0;font-size:12.5px;color:var(--muted);line-height:1.62}
.fair code{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--em)}
.empty-feed{border:1px dashed var(--line);border-radius:12px;padding:28px;text-align:center;
  color:var(--faint);font-size:12.5px}
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

export function homePage(
  index: CatalogIndex,
  packs: PackConfig[],
  grails: CardListing[],
  featuredId: string,
  feed: HomeFeedItem[],
): string {
  const featured = packs.find((p) => p.id === featuredId) ?? packs[0];
  const others = packs.filter((p) => p.id !== featured?.id);
  // Featured sits in the centre, in front (spec §19).
  const three = [others[0], featured, others[1]].filter(Boolean) as PackConfig[];
  const pos = ['l', 'c', 'r'];

  const body = `
<section class="hero">
  <h1>RIP POKÉMON.<br>CHASE GRAILS.<br><em>ONCHAIN.</em></h1>
  <p class="sub">Open Pokémon card packs using $RIP. Every pull is verifiable.</p>
  <div class="cta-row">
    <a class="btn-primary" href="/packs">RIP A PACK</a>
    <a class="btn-ghost" href="/cards">BROWSE THE POKÉDEX</a>
  </div>
  <div class="packs-3">
    <div class="ghosts">${grails
      .slice(0, 4)
      .map((g) => `<img src="${esc(g.imageSmall)}" alt="" loading="lazy">`)
      .join('')}</div>
    ${three
      .map(
        (p, i) => `<a class="p ${pos[i]}" href="/packs">
      <div class="art" style="background-image:url(${esc(heroImage(p, index))})"></div>
      <div class="veil"></div>
      <div class="nm">${esc(p.name)}</div>
    </a>`,
      )
      .join('')}
  </div>
</section>

<section class="band">
  <div class="band-head"><h2>LIVE PULLS</h2><a href="/live">WATCH LIVE →</a></div>
  ${
    feed.length === 0
      ? '<div class="empty-feed">No rips yet. The feed fills as packs are opened.</div>'
      : `<div class="rail">${feed
          .map(
            (e) => `<a class="tile" href="${esc(e.href)}">
        <div class="shot"><img src="${esc(e.imageSmall)}" alt="${esc(e.cardName)}" loading="lazy"></div>
        <div class="meta">
          <div class="nm">${esc(e.cardName)}</div>
          <div class="sub">${esc(e.wallet)} · ${esc(e.when)}</div>
          <div class="val ${e.prominence === 'major' ? 't-GRAIL' : ''}">${money(e.value)}</div>
        </div>
      </a>`,
          )
          .join('')}</div>`
  }
</section>

<section class="band">
  <div class="band-head"><h2>FEATURED PACKS</h2><a href="/packs">ALL ODDS →</a></div>
  <div class="pack-row">
    ${packs
      .map(
        (p) => `<a class="pack-card" href="/packs">
      <div class="thumb" style="background-image:url(${esc(heroImage(p, index))})"></div>
      <div>
        <div class="nm">${esc(p.name)}</div>
        <div class="dt">${p.pool.length} outcomes · ${p.cardsPerPack} card</div>
        <div class="pr">${p.priceRip.toLocaleString()} $RIP</div>
      </div>
    </a>`,
      )
      .join('')}
  </div>
</section>

<section class="band">
  <div class="band-head"><h2>THE GRAILS</h2><a href="/grails">SEE ALL →</a></div>
  ${
    grails.length
      ? `<div class="rail">${grails.slice(0, 20).map(tile).join('')}</div>`
      : '<div class="empty-feed">No cards above the grail threshold in the catalog yet.</div>'
  }
</section>

<section class="band">
  <div class="band-head"><h2>HOW IT WORKS</h2></div>
  <div class="steps">
    ${['BUY $RIP', 'CHOOSE PACK', 'RIP IT', 'REVEAL POKÉMON', 'BUILD COLLECTION']
      .map(
        (s, i) =>
          `${i ? '<span class="arrow">→</span>' : ''}<div class="step"><b>${esc(s)}</b></div>`,
      )
      .join('')}
  </div>
</section>

<section class="band">
  <div class="band-head"><h2>PROVABLY FAIR</h2></div>
  <div class="fair">
    <div class="f"><h4>SEED COMMITTED FIRST</h4>
      <p>We publish <code>sha256(serverSeed)</code> before your rip. You supply the client seed. Neither side can move afterwards.</p></div>
    <div class="f"><h4>PRICES FROZEN FIRST</h4>
      <p>The price snapshot is locked and hashed <em>before</em> randomness is generated. A card is never drawn and then priced.</p></div>
    <div class="f"><h4>ODDS ARE EXACT</h4>
      <p>Published odds are ratios of integer weights, not rounded estimates. The full table sits on every pack page.</p></div>
    <div class="f"><h4>ANYONE CAN RECHECK</h4>
      <p>Outcome is <code>HMAC-SHA256(serverSeed, clientSeed:nonce)</code>. On seed rotation the seed is revealed and every past rip can be recomputed.</p></div>
  </div>
</section>

<section class="band">
  <div class="band-head"><h2>POKÉDEX</h2><a href="/cards">BROWSE →</a></div>
  <p class="lede" style="margin:0">${index.cards.length.toLocaleString()} cards across
    ${index.facets.sets.length} sets, ${index.byVariantId.size.toLocaleString()} tracked variants.
    Every printing priced separately.</p>
</section>`;

  return layout('RIPDEX — Rip Pokémon. Chase grails. Onchain.', '/', body, HOME_CSS);
}
