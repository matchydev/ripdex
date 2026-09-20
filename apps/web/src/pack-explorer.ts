/** Pack discovery and comparison. All preview prices and odds are variant-exact. */
import type { CatalogIndex, PackConfig } from '../../../packages/pokemon-core/src/index.ts';
import { oddsTable, formatProbability } from '../../../packages/pokemon-core/src/index.ts';
import { esc, money, cssUrl } from './render.ts';

export function packPreview(pack: PackConfig, index: CatalogIndex, wrapper?: string) {
  const outcomes = oddsTable(pack.pool).map((row) => {
    const hit = index.byVariantId.get(row.variantId);
    return {
      id: row.variantId, name: hit?.card.name ?? row.variantId,
      label: hit?.variant.label ?? 'Unknown variant', set: hit?.card.setName ?? '', number: hit?.card.number ?? '',
      setId: hit?.card.setId ?? '', image: hit?.card.imageSmall ?? '',
      href: hit ? `/pokemon/${encodeURIComponent(hit.card.setId)}/${encodeURIComponent(hit.card.number)}` : '',
      value: hit?.variant.referenceValue ?? null, currency: hit?.variant.currency ?? 'USD',
      probability: row.probability, probabilityLabel: row.probabilityLabel,
      tier: hit?.variant.tier ?? 'UNPRICED', weight: row.weight,
    };
  }).sort((a, b) => b.probability - a.probability);
  const priced = outcomes.filter((o) => o.value !== null);
  const values = priced.map((o) => o.value!);
  const sets = [...new Set(outcomes.map((o) => o.setId).filter(Boolean))];
  const art = wrapper || pack.artwork.heroImageUrl || [...priced].sort((a, b) => b.value! - a.value!)[0]?.image || outcomes[0]?.image || '';
  const totalWeight = outcomes.reduce((sum, o) => sum + o.weight, 0);
  const buckets = ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'GRAIL', 'UNPRICED'].map((tier) => ({
    tier, probability: outcomes.filter((o) => o.tier === tier).reduce((sum, o) => sum + o.probability, 0),
  })).filter((b) => b.probability > 0);
  return {
    id: pack.id, name: pack.name, price: pack.priceRip.toString(), count: pack.cardsPerPack,
    art, wrapper: Boolean(wrapper), outcomes, sets, buckets, totalWeight,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    expected: priced.length === outcomes.length ? outcomes.reduce((sum, o) => sum + o.value! * o.probability, 0) : null,
  };
}

export function packExplorer(packs: PackConfig[], index: CatalogIndex, wrappers: Record<string, string> = {}): string {
  const models = packs.map((p) => packPreview(p, index, wrappers[p.id]));
  // Each case gets a DISTINCT signature Pokémon behind it (owner: "different
  // pokemon") — track which card art is already spent so no two cases share one.
  const usedMon = new Set();
  const scriptData = JSON.stringify(models).replace(/</g, '\\u003c');
  return `<div class="explorer" id="pack-explorer">
  <div class="explorer-tabs" role="group" aria-label="Filter packs by set">
    <button type="button" class="set-tab active" data-pack-set="" aria-pressed="true">All packs <span>${packs.length}</span></button>
    ${index.facets.sets.map((s) => `<button type="button" class="set-tab" data-pack-set="${esc(s.id)}" aria-pressed="false">${esc(s.name)}</button>`).join('')}
  </div>
  <div class="explorer-toolbar">
    <label class="explorer-search"><span aria-hidden="true">⌕</span><input type="search" id="pack-search" aria-label="Search packs" placeholder="Find a pack or Pokémon…"></label>
    <select id="pack-sort" aria-label="Sort packs"><option value="curated">Curated order</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name">Name: A to Z</option></select>
    <span class="explorer-count" id="pack-count" role="status" aria-live="polite">${packs.length} packs</span>
  </div>
  <div class="explorer-grid" id="pack-results">
  ${models.map((p, i) => {
    // Flank the pack with its two highest-VALUE cards (the chase), not the two
    // most common — a case should show off the jackpot, like a CS:GO case.
    const side = [...new Map(p.outcomes.filter((o) => o.image !== p.art && o.value != null).map((o) => [o.image, o])).values()]
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, 2);
    const setNames = p.sets.map((id) => index.facets.sets.find((s) => s.id === id)?.name).filter(Boolean).join(' / ');
    const grail = (p.max ?? 0) >= 100;
    // The featured grail wrapper is a bright-gold-on-dark composition, so it
    // reads near-black at card size while the flat-saturated wrappers stay bright.
    // Mark it so its foil gets a small brightness lift (see .is-featured below).
    const featured = /grail-pack\./.test(p.art);
    // The backdrop mon: the highest-value card whose art no earlier case has
    // claimed, so the six cases show six different Pokémon (Charizard is the top
    // of several packs — this spreads it to Blastoise, Venusaur, Scyther, etc.).
    const monCard =
      [...p.outcomes]
        .filter((o) => o.image && o.value != null && o.image !== p.art)
        .sort((a, b) => (b.value || 0) - (a.value || 0))
        .find((o) => !usedMon.has(o.image)) || side[0];
    if (monCard) usedMon.add(monCard.image);
    return `<article class="explorer-pack${grail ? ' has-grail' : ''}${featured ? ' is-featured' : ''}" data-pack-id="${esc(p.id)}" data-search="${esc([p.name, ...p.outcomes.map((o) => o.name)].join(' ').toLowerCase())}" data-sets="${esc(p.sets.join(' '))}" data-order="${i}" data-price="${p.price}" style="--order:${i}${cssUrl(p.art) ? `;--art:url(${cssUrl(p.art)})` : ''}${monCard && cssUrl(monCard.image) ? `;--mon:url(${cssUrl(monCard.image)})` : ''}">
      <div class="ep-top"><span>${String(i + 1).padStart(2, '0')} / ${esc(setNames)}</span><button type="button" class="compare-toggle" data-compare="${esc(p.id)}" aria-label="Compare ${esc(p.name)}" aria-pressed="false" title="Add to comparison">⇄</button></div>
      <button type="button" class="ep-art" data-preview="${esc(p.id)}" aria-label="Preview ${esc(p.name)} contents">
        <span class="ep-mon" aria-hidden="true"></span>
        <span class="ep-orbit" aria-hidden="true"></span>
        ${side.map((o, n) => `<img class="ep-side ep-side-${n}" src="${esc(o.image)}" alt="" loading="lazy">`).join('')}
        <img class="ep-front${p.wrapper ? ' ep-wrapper' : ''}" src="${esc(p.art)}" alt="${esc(p.name)}" loading="lazy">
        <span class="ep-inspect">Inspect contents <span aria-hidden="true">↗</span></span>
      </button>
      <div class="ep-info"><h3>${esc(p.name)}</h3>
        <div class="ep-toppull"><span class="ep-tp-k">Top pull</span><b class="ep-tp-v${grail ? ' ep-jackpot' : ''}">${money(p.max)}</b></div>
        <div class="ep-distribution" aria-label="Outcome distribution by value tier">${p.buckets.map((b) => `<i class="bucket-${b.tier}" style="flex:${b.probability}" title="${esc(b.tier.replace('_', ' '))}: ${formatProbability(b.probability)}"></i>`).join('')}</div>
        <p class="ep-sub">${p.outcomes.length} outcomes <span>·</span> from ${money(p.min)}</p>
        <div class="ep-bottom"><span class="ep-price">${BigInt(p.price).toLocaleString()} <small>$RIP</small></span><a class="ep-view" href="/packs#odds-${encodeURIComponent(p.id)}" data-preview="${esc(p.id)}">View pack <span aria-hidden="true">→</span></a></div>
      </div>
    </article>`;
  }).join('')}
  </div>
  <div class="explorer-empty" id="pack-empty" hidden><span aria-hidden="true">⌕</span><h3>No packs found</h3><p>Try another Pokémon or set.</p><button type="button" class="btn btn-ghost" id="pack-reset">Clear filters</button></div>
  <div class="compare-tray" id="compare-tray" hidden><div><b>Compare packs</b><span id="compare-selection" role="status" aria-live="polite"></span></div><button type="button" id="compare-clear" class="btn btn-ghost">Clear</button><button type="button" id="compare-show" class="btn btn-primary" disabled>Compare 2 packs →</button></div>
  </div>
  <dialog class="pack-dialog" id="pack-dialog" aria-labelledby="pack-dialog-title"><button type="button" class="dialog-close" aria-label="Close pack preview">×</button><div id="pack-dialog-body"></div></dialog>
  <dialog class="pack-dialog compare-dialog" id="compare-dialog" aria-labelledby="compare-dialog-title"><button type="button" class="dialog-close" aria-label="Close comparison">×</button><div id="compare-dialog-body"></div></dialog>
  <script type="application/json" id="pack-preview-data">${scriptData}</script>
  ${EXPLORER_JS}`;
}

export const EXPLORER_CSS = `<style>
.explorer{scroll-margin-top:150px}
.explorer-tabs{display:flex;gap:7px;overflow-x:auto;padding:1px 1px 12px;scrollbar-width:thin}
.set-tab{white-space:nowrap;color:var(--text-3);font-size:12px;padding:10px 16px;border-radius:8px;background:var(--glass);box-shadow:0 0 0 1px var(--line);transition:background .2s,color .2s}
.set-tab span{margin-left:8px;color:var(--text-4);font:10px ui-monospace,monospace}
.set-tab.active{color:var(--text);background:var(--accent-dim);box-shadow:0 0 0 1px rgba(113,112,255,.4)}
.explorer-toolbar{display:flex;gap:12px;align-items:center;padding:8px 0 22px}
.explorer-search{display:flex;align-items:center;flex:1;max-width:400px;gap:9px;padding-left:12px;box-shadow:0 0 0 1px var(--line);border-radius:8px;color:var(--text-3);background:var(--panel)}
.explorer-search>span{font-size:24px;line-height:1}.explorer-search input{width:100%;min-width:0;box-shadow:none;background:transparent;height:42px;font-size:12px}
.explorer-toolbar select{font-size:11px;height:42px}.explorer-count{font-size:10px;color:var(--text-4);margin-left:auto;white-space:nowrap}
.explorer-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.explorer-pack{position:relative;min-width:0;background:linear-gradient(150deg,var(--elevated),var(--panel) 70%);border-radius:14px;box-shadow:0 0 0 1px var(--line);overflow:hidden;transition:box-shadow .3s,transform .4s var(--ease);animation:explorerIn .45s var(--ease) both;animation-delay:calc(var(--order,0)*38ms)}
.explorer-pack:hover{box-shadow:0 0 0 1px rgba(113,112,255,.35),0 16px 32px -24px rgba(113,112,255,.5);transform:translateY(-3px)}
.explorer-pack[hidden]{display:none}.explorer-pack.is-compared{box-shadow:0 0 0 1px var(--accent)}
/* Each case is lit by its own themed wrapper art — a blurred bloom behind the
   pack so a crimson 151 glows crimson and a gold Base Set glows gold, instead of
   every case being an identical flat panel. */
.explorer-pack[style*="--art"]::before{content:"";position:absolute;z-index:0;left:0;right:0;top:0;height:64%;
  background-image:var(--art);background-size:cover;background-position:50% 28%;
  filter:blur(34px) saturate(1.55);opacity:.26;transition:opacity .4s var(--ease);pointer-events:none}
.explorer-pack:hover[style*="--art"]::before{opacity:.42}
.explorer-pack.has-grail{box-shadow:0 0 0 1px rgba(245,196,81,.26)}
.explorer-pack.has-grail:hover{box-shadow:0 0 0 1px rgba(245,196,81,.45),0 16px 34px -22px rgba(245,196,81,.4)}
.ep-jackpot{color:var(--gold)}
.ep-art,.ep-info{position:relative;z-index:1}
.ep-top{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px 0;position:relative;z-index:2}
.ep-top>span{font-size:8px;letter-spacing:.06em;color:var(--text-4);text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.compare-toggle{display:flex;align-items:center;justify-content:center;width:28px;height:28px;flex-shrink:0;font-size:18px;border-radius:6px;background:rgba(255,255,255,.04);color:var(--text-3)}
.compare-toggle[aria-pressed=true]{background:var(--accent);color:var(--text)}
.ep-art{position:relative;display:block;width:100%;height:210px;perspective:900px;overflow:hidden;isolation:isolate}
/* The pack's signature Pokémon looming large and dark behind the wrapper — an
   atmospheric per-pack backdrop (--mon = the top chase card), like the hero's
   dragon. Blurred, dimmed and edge-masked so it reads as mood, not a rectangle. */
.ep-mon{position:absolute;z-index:0;left:50%;top:40%;transform:translate(-50%,-50%);
  width:150%;height:150%;background:var(--mon) center 24%/168% no-repeat;
  filter:brightness(.62) saturate(1) contrast(1.04) blur(2px);opacity:.5;
  -webkit-mask-image:radial-gradient(74% 66% at 50% 40%,#000 40%,transparent 82%);
          mask-image:radial-gradient(74% 66% at 50% 40%,#000 40%,transparent 82%);
  transition:opacity .45s var(--ease),filter .45s var(--ease);pointer-events:none}
.explorer-pack:not([style*="--mon"]) .ep-mon{display:none}
.ep-art:hover .ep-mon{opacity:.62;filter:brightness(.72) saturate(1.08) contrast(1.04) blur(2px)}
@media(prefers-reduced-motion:reduce){.ep-mon{transition:none}}
/* An energy burst behind the pack — bright rays + a radial core that swells on
   hover, gold on a grail-bearing case. This is the CS:GO "featured item" glow. */
.ep-art::before{content:"";position:absolute;left:50%;top:40%;width:150px;height:150px;z-index:0;pointer-events:none;
  transform:translate(-50%,-50%);border-radius:50%;transition:width .45s var(--ease),height .45s var(--ease),opacity .45s var(--ease);
  background:radial-gradient(circle,rgba(150,160,255,.16),transparent 60%)}
.ep-art::after{content:"";position:absolute;left:50%;top:40%;width:230px;height:230px;z-index:0;pointer-events:none;opacity:.5;
  transform:translate(-50%,-50%);transition:opacity .45s var(--ease),transform .6s var(--ease);
  background:repeating-conic-gradient(from 0deg at 50% 50%,rgba(255,255,255,.05) 0deg 6deg,transparent 6deg 18deg);
  -webkit-mask:radial-gradient(circle,#000 12%,transparent 64%);mask:radial-gradient(circle,#000 12%,transparent 64%)}
.explorer-pack.has-grail .ep-art::before{background:radial-gradient(circle,rgba(245,196,81,.24),transparent 60%)}
.explorer-pack.has-grail .ep-art::after{background:repeating-conic-gradient(from 0deg at 50% 50%,rgba(245,196,81,.12) 0deg 6deg,transparent 6deg 18deg)}
.ep-art:hover::before{width:200px;height:200px}
.ep-art:hover::after{opacity:.85;transform:translate(-50%,-50%) rotate(24deg)}
.ep-orbit{position:absolute;left:12%;right:12%;bottom:12px;height:72px;border-radius:50%;z-index:0;box-shadow:0 0 0 1px rgba(113,112,255,.15),0 0 60px rgba(113,112,255,.09);transform:rotateX(65deg)}
.explorer-pack.has-grail .ep-orbit{box-shadow:0 0 0 1px rgba(245,196,81,.2),0 0 60px rgba(245,196,81,.12)}
/* Ambient life on the case wall: cards deal in staggered, and the rare gold cases
   breathe at rest (via the orbit ring, which has no hover transform to fight). */
@keyframes orbitBreathe{0%,100%{box-shadow:0 0 0 1px rgba(245,196,81,.18),0 0 44px rgba(245,196,81,.1)}50%{box-shadow:0 0 0 1px rgba(245,196,81,.34),0 0 74px rgba(245,196,81,.22)}}
.explorer-pack.has-grail .ep-orbit{animation:orbitBreathe 4.6s var(--ease) infinite}
@media(prefers-reduced-motion:reduce){.explorer-pack{animation:none}.explorer-pack.has-grail .ep-orbit{animation:none}}
.ep-art img{position:absolute;left:50%;top:20px;z-index:1;border-radius:5px;object-fit:cover;box-shadow:0 15px 24px rgba(0,0,0,.5);transition:transform .65s var(--ease)}
.ep-front{width:112px;height:156px;margin-left:-56px;z-index:2;transform:translateY(-5px) rotate(-6deg)}
.ep-art .ep-wrapper{height:160px}.ep-side{width:92px;height:129px;margin-left:-46px;opacity:.78}
/* Lift the featured grail wrapper so its bright foil survives at card size. */
.explorer-pack.is-featured .ep-wrapper{filter:brightness(1.14) saturate(1.12) contrast(1.04)}
.ep-side-0{transform:translate(-60px,27px) rotate(-19deg)}.ep-side-1{transform:translate(60px,25px) rotate(18deg)}
.ep-art:hover .ep-front,.ep-art:focus-visible .ep-front{transform:translateY(-12px) rotate(0)}
.ep-art:hover .ep-side-0{transform:translate(-73px,28px) rotate(-23deg)}.ep-art:hover .ep-side-1{transform:translate(73px,28px) rotate(23deg)}
.ep-inspect{position:absolute;left:50%;bottom:8px;transform:translate(-50%,8px);opacity:0;z-index:3;background:rgba(15,16,23,.94);border-radius:6px;padding:7px 10px;font-size:10px;white-space:nowrap;box-shadow:0 0 0 1px var(--line-hi);transition:transform .25s,opacity .25s}
.ep-art:hover .ep-inspect,.ep-art:focus-visible .ep-inspect{opacity:1;transform:translate(-50%,0)}
.ep-info{padding:3px 17px 18px}.ep-info h3{font-size:14px;letter-spacing:-.02em;margin:0;font-weight:610}.ep-info p{font-size:10px;color:var(--text-4);margin:7px 0 14px}.ep-info p span{padding:0 5px}
.ep-distribution{height:3px;display:flex;gap:2px;border-radius:2px;overflow:hidden;background:var(--line)}
.ep-distribution i{min-width:1px;background:#5b616e}.bucket-TIER_1{background:#5b616e!important}.bucket-TIER_2{background:#868d9c!important}.bucket-TIER_3{background:var(--em)!important}.bucket-TIER_4{background:var(--accent-hi)!important}.bucket-GRAIL{background:var(--gold)!important}
.ep-range{display:flex;justify-content:space-between;gap:8px;margin:9px 0 18px;font-size:9px;color:var(--text-4)}.ep-range b{font-weight:500;color:var(--text-3)}
/* The case shouts its jackpot: Top pull is the hero stat, the counts a caption. */
.ep-toppull{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:9px 0 12px}
.ep-tp-k{font-size:9px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--text-4)}
.ep-tp-v{font:800 21px/1 ui-monospace,Menlo,monospace;letter-spacing:-.02em;color:var(--text-2)}
.ep-tp-v.ep-jackpot{color:var(--gold)}
.ep-sub{font-size:9px;color:var(--text-4);margin:11px 0 14px}.ep-sub span{padding:0 5px}
.ep-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px}.ep-price{font:600 14px ui-monospace,monospace;letter-spacing:-.04em}.ep-price small{font-size:9px;color:var(--text-4);font-weight:450}
.ep-view{display:flex;gap:12px;align-items:center;padding:9px 12px;border-radius:7px;background:var(--accent-dim);font-size:10px;color:var(--text-2);box-shadow:0 0 0 1px rgba(113,112,255,.18)}.ep-view:hover{background:var(--accent);color:var(--text)}
.explorer-empty{text-align:center;padding:50px 20px;background:var(--glass);border-radius:14px}.explorer-empty>span{font-size:40px;color:var(--text-4)}.explorer-empty h3{font-weight:550}.explorer-empty p{font-size:13px;color:var(--text-3)}
.compare-tray{position:sticky;z-index:35;bottom:20px;display:flex;align-items:center;gap:12px;margin:24px 0 0;padding:14px 18px;background:rgba(25,25,36,.96);backdrop-filter:blur(20px);box-shadow:0 0 0 1px rgba(113,112,255,.4),0 10px 40px #08090a;border-radius:12px}
.compare-tray[hidden]{display:none}.compare-tray>div{flex:1;min-width:0}.compare-tray b{display:block;font-size:12px}.compare-tray span{display:block;font-size:10px;color:var(--text-3);margin-top:4px;overflow-wrap:anywhere}.compare-tray .btn{font-size:11px;padding:0 14px}.btn:disabled{opacity:.45;cursor:not-allowed}
.pack-dialog{width:min(880px,calc(100vw - 40px));max-height:calc(100dvh - 50px);padding:0;border:0;border-radius:18px;color:var(--text);background:#101116;box-shadow:0 0 0 1px var(--line-hi),0 40px 140px rgba(0,0,0,.7);overflow-y:auto;overscroll-behavior:contain}
.pack-dialog::backdrop{background:rgba(3,4,8,.82);backdrop-filter:blur(9px)}
.pack-dialog[open]{animation:explorerIn .25s var(--ease)}
.dialog-close{position:sticky;top:14px;float:right;margin:14px 14px -48px 0;z-index:5;width:34px;height:34px;border-radius:9px;background:#24252d;color:var(--text-2);font-size:25px}
#pack-dialog{overflow:hidden}#pack-dialog>.dialog-close{position:absolute;right:14px;top:14px;margin:0;float:none}
#pack-dialog-body{display:flex;flex-direction:column;max-height:calc(100dvh - 50px)}
.preview-scroll{min-height:0;overflow-y:auto;overscroll-behavior:contain;scroll-padding-block:16px}
.preview-hero{display:grid;grid-template-columns:190px minmax(0,1fr);gap:32px;align-items:center;padding:34px 32px;background:radial-gradient(ellipse at 12% 45%,rgba(113,112,255,.2),transparent 58%);box-shadow:0 1px 0 var(--line)}
.preview-hero>img{width:150px;height:210px;object-fit:cover;justify-self:center;transform:rotate(-5deg);border-radius:8px;box-shadow:0 22px 44px rgba(0,0,0,.55),0 0 70px -22px rgba(113,112,255,.5)}
.preview-kicker{font-size:9px;color:var(--accent-hi);letter-spacing:.14em;font-weight:600}.preview-hero h2{font-size:clamp(28px,4vw,38px);line-height:1.05;letter-spacing:-.04em;margin:10px 0 0}
.preview-jackpot{display:flex;gap:30px;margin:16px 0 20px}
.pj-label{display:block;font-size:9px;letter-spacing:.1em;color:var(--text-4);text-transform:uppercase;margin-bottom:5px}
.pj-val{display:block;font:800 clamp(24px,3vw,30px) ui-monospace,Menlo,monospace;letter-spacing:-.03em;color:var(--gold);font-variant-numeric:tabular-nums}
/* "The chase" — the top few pulls shown large before the searchable list, so the
   preview opens on the knife, not a commons-first spreadsheet. */
.preview-chase{padding:22px 32px;box-shadow:0 1px 0 var(--line)}
.pc-k{display:block;font-size:9px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-hi);margin-bottom:14px}
.pc-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.pc-card{display:flex;flex-direction:column;align-items:center;text-align:center;gap:7px;padding:14px 10px;background:var(--glass);border-radius:10px;box-shadow:0 0 0 1px var(--line);transition:transform .3s var(--ease),box-shadow .3s var(--ease)}
.pc-card:hover{transform:translateY(-3px);box-shadow:0 0 0 1px var(--line-hi),0 16px 30px -20px rgba(0,0,0,.7)}
.pc-card.is-grail{box-shadow:0 0 0 1px rgba(245,196,81,.4);background:radial-gradient(150% 200% at 50% 0%,var(--gold-glow),transparent 55%),var(--glass)}
.pc-card img{width:76px;height:106px;object-fit:cover;border-radius:5px;box-shadow:0 10px 20px rgba(0,0,0,.5)}
.pc-nm{width:100%;font-size:11px;font-weight:560;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pc-od{font-size:9px;color:var(--text-4);font-variant-numeric:tabular-nums}
.pc-v{font:800 15px ui-monospace,Menlo,monospace;letter-spacing:-.02em;color:var(--text-2)}
.pc-v.pc-grail{color:var(--gold)}
@media(max-width:560px){.preview-chase{padding:18px 20px}.pc-cards{gap:9px}.pc-card img{width:58px;height:81px}}
.pj-odds{display:block;font:800 clamp(24px,3vw,30px) ui-monospace,Menlo,monospace;letter-spacing:-.03em;color:var(--accent-hi);font-variant-numeric:tabular-nums}
.preview-open{width:fit-content}
.outcome{position:relative}
.outcome-grail{box-shadow:0 0 0 1px rgba(245,196,81,.42)!important;background:radial-gradient(150% 220% at 0% 0%,var(--gold-glow),transparent 55%),var(--glass)!important}
.outcome-tag{position:absolute;top:6px;left:6px;z-index:2;font-size:7px;font-weight:800;letter-spacing:.04em;color:#08090a;background:var(--gold);padding:2px 5px;border-radius:4px}
.ov.t-GRAIL{color:var(--gold)!important}.ov.t-TIER_4{color:var(--accent-hi)!important}.ov.t-TIER_3{color:var(--em)!important}
.preview-body{padding:28px 32px}.preview-body h3{font-size:16px;font-weight:580;letter-spacing:-.02em;margin:0 0 8px}
.preview-sub{color:var(--text-3);font-size:11px;margin:0 0 18px}.preview-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding-bottom:22px;margin-bottom:22px;box-shadow:0 1px 0 var(--line)}.preview-facts span{display:block;font-size:9px;color:var(--text-4);margin-bottom:6px}.preview-facts b{font:500 14px ui-monospace,monospace}
.outcome-controls{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:12px}.outcome-controls label{font-size:10px;color:var(--text-3)}.outcome-controls input,.outcome-controls select{display:block;width:100%;min-width:0;height:42px;margin-top:7px;font-size:11px}
.outcome-result-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:42px;font-size:10px;color:var(--text-3)}.outcome-reset{font-size:11px;color:var(--accent-hi);padding:10px 0}.outcome-reset:hover{text-decoration:underline}
.outcome-empty{text-align:center;padding:32px 16px;background:var(--glass);border-radius:8px}.outcome-empty h4{font-size:15px;margin:0 0 8px}.outcome-empty p{font-size:11px;line-height:1.6;color:var(--text-3);margin:0 0 14px}.outcome-empty .btn{font-size:11px}
.outcome-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.outcome{display:grid;grid-template-columns:39px minmax(0,1fr) auto;gap:11px;align-items:center;padding:10px;background:var(--glass);border-radius:8px;box-shadow:0 0 0 1px var(--line)}
.outcome img{width:39px;height:54px;object-fit:cover;border-radius:3px}.outcome strong{display:block;font-size:11px;font-weight:550}.outcome small{display:block;font-size:9px;color:var(--text-4);margin-top:3px;line-height:1.45}.outcome>b{text-align:right;font:11px ui-monospace,monospace;color:var(--text-2)}.outcome>b small{font:9px ui-monospace,monospace}
.preview-actions{display:flex;flex-shrink:0;justify-content:space-between;align-items:center;gap:12px;padding:16px 32px;background:#15161e;box-shadow:0 -1px 0 var(--line)}.preview-actions a{font-size:12px}.preview-actions .text-link{color:var(--text-3);padding:12px 0;white-space:nowrap}
.comparison{padding:36px 30px}.comparison h2{font-size:28px;letter-spacing:-.04em;margin:0 0 12px}.comparison>p{font-size:12px;color:var(--text-3);max-width:60ch}
.compare-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;margin-top:25px}.compare-item{min-width:0;background:var(--glass);border-radius:12px;padding:20px}.compare-item>img{display:block;height:125px;width:90px;object-fit:cover;margin:0 auto 22px;transform:rotate(-5deg);border-radius:4px}.compare-item h3{font-size:15px;margin:10px 0 20px}.compare-item dl{margin:0}.compare-item dl div{padding:10px 0;box-shadow:0 1px 0 var(--line)}.compare-item dt{font-size:10px;color:var(--text-4)}.compare-item dd{font-size:12px;margin:5px 0 0;line-height:1.6}.compare-item .btn{margin-top:22px;width:100%;font-size:11px}
@keyframes explorerIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:1000px){.explorer-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){
 .explorer-grid{gap:12px}.ep-top{padding:8px 9px 0}.ep-top>span{font-size:7px}.ep-art{height:167px}.ep-front{width:84px;height:118px;margin-left:-42px}.ep-art .ep-wrapper{height:118px}.ep-side{width:66px;height:92px;margin-left:-33px}.ep-side-0{transform:translate(-35px,24px) rotate(-18deg)}.ep-side-1{transform:translate(35px,24px) rotate(18deg)}
 .ep-art:hover .ep-side-0{transform:translate(-40px,24px) rotate(-20deg)}.ep-art:hover .ep-side-1{transform:translate(40px,24px) rotate(20deg)}
 .ep-info{padding:0 11px 13px}.ep-info h3{font-size:11px;min-height:28px}.ep-info p{font-size:8px;margin:5px 0 10px}.ep-range{display:block;font-size:8px;line-height:1.65;margin-bottom:12px}.ep-range b{display:block}.ep-bottom{align-items:stretch;flex-direction:column;gap:11px}.ep-price{font-size:12px}.ep-view{justify-content:space-between;min-height:36px}.compare-toggle{min-width:32px;min-height:32px}
 .explorer-toolbar{flex-wrap:wrap;gap:10px}.explorer-search{flex:1 1 100%;max-width:none}.explorer-toolbar select{max-width:220px;flex:1}.set-tab{font-size:10px;padding:12px}
 .compare-tray{bottom:10px;flex-wrap:wrap;padding:12px;gap:8px}.compare-tray>div{flex-basis:100%}.compare-tray .btn{flex:1}
 .pack-dialog{width:calc(100vw - 20px);max-height:calc(100dvh - 20px);border-radius:13px}#pack-dialog-body{max-height:calc(100dvh - 20px)}.preview-hero{grid-template-columns:88px minmax(0,1fr);gap:18px;padding:54px 20px 22px}.preview-hero>img{width:80px;height:112px}.preview-hero h2{font-size:21px;margin-right:14px}.preview-hero p{font-size:10px}.preview-price{font-size:15px}.preview-body{padding:22px 18px}.preview-facts{gap:10px}.preview-facts b{font-size:11px}.preview-facts span{font-size:8px}.outcome-controls{grid-template-columns:1fr}.outcome-controls select{max-width:220px}.outcome-list{grid-template-columns:1fr}.preview-actions{padding:14px 18px}.preview-actions a{font-size:11px}.preview-actions .btn{flex:1;min-height:44px;padding:0 12px}.comparison{padding:30px 16px}.comparison h2{font-size:24px}.compare-grid{gap:10px}.compare-item{padding:12px}.compare-item h3{font-size:11px;min-height:28px}.compare-item dt{font-size:9px}.compare-item dd{font-size:10px}.compare-item .btn{padding:0 8px;font-size:9px}
}
</style>`;

const EXPLORER_JS = `<script>
(() => {
 const data = JSON.parse(document.getElementById('pack-preview-data').textContent);
 const byId = new Map(data.map(p => [p.id,p]));
 const root = document.getElementById('pack-explorer');
 const cards = [...root.querySelectorAll('.explorer-pack')];
 const input = document.getElementById('pack-search');
 const sort = document.getElementById('pack-sort');
 const setTabs = [...root.querySelectorAll('[data-pack-set]')];
 let set = '', selected = [];
 const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money = n => n == null ? 'Unpriced' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
 const rip = n => BigInt(n).toLocaleString() + ' $RIP';
 const pct = n => (n * 100).toLocaleString('en-US',{maximumFractionDigits:4}) + '%';
 function syncUrl() {
  const url = new URL(location.href);
  const values = {packSearch:input.value.trim(), packSet:set, packSort:sort.value==='curated'?'':sort.value};
  Object.entries(values).forEach(([key,value]) => { if(value)url.searchParams.set(key,value);else url.searchParams.delete(key); });
  if(url.href!==location.href)history.replaceState(history.state,'',url.href);
 }
 function selectSet(value) {
  set = setTabs.some(t=>t.dataset.packSet===value) ? value : '';
  setTabs.forEach(t=>{const active=t.dataset.packSet===set;t.classList.toggle('active',active);t.setAttribute('aria-pressed',String(active));});
 }
 function restoreFilters() {
  const params = new URL(location.href).searchParams;
  input.value = params.get('packSearch') || '';
  selectSet(params.get('packSet') || '');
  const order = params.get('packSort');
  sort.value = [...sort.options].some(o=>o.value===order) ? order : 'curated';
  filter();
 }
 function filter() {
  const q = input.value.trim().toLowerCase();
  const visible = cards.filter(c => { const show = (!q || c.dataset.search.includes(q)) && (!set || c.dataset.sets.split(' ').includes(set)); c.hidden = !show; return show; });
  const order = [...cards].sort((a,b) => {
   if (sort.value === 'name') return byId.get(a.dataset.packId).name.localeCompare(byId.get(b.dataset.packId).name);
   if (sort.value.startsWith('price')) { const x=BigInt(a.dataset.price), y=BigInt(b.dataset.price); return (x<y?-1:x>y?1:0)*(sort.value==='price-desc'?-1:1); }
   return Number(a.dataset.order)-Number(b.dataset.order);
  });
  order.forEach(c => root.querySelector('#pack-results').append(c));
  document.getElementById('pack-count').textContent = visible.length + (visible.length === 1 ? ' pack' : ' packs');
  document.getElementById('pack-empty').hidden = visible.length > 0;
  syncUrl();
 }
 setTabs.forEach(b => b.addEventListener('click',() => {
  selectSet(b.dataset.packSet);filter();
 }));
 input.addEventListener('input',filter);sort.addEventListener('change',filter);
 document.getElementById('pack-reset').addEventListener('click',()=>{input.value='';sort.value='curated';selectSet('');filter();input.focus();});
 addEventListener('popstate',restoreFilters);
 addEventListener('pageshow',restoreFilters);
 restoreFilters();
 const dialog = document.getElementById('pack-dialog');
 const comparison = document.getElementById('compare-dialog');
 function open(d) { if (!d.open) d.showModal(); document.documentElement.classList.add('dialog-open'); }
 [dialog,comparison].forEach(d=>{
  d.querySelector('.dialog-close').addEventListener('click',()=>d.close());
  d.addEventListener('close',()=>{if(!dialog.open&&!comparison.open)document.documentElement.classList.remove('dialog-open');});
  d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
 });
 function preview(id) {
  const p=byId.get(id);if(!p)return;
  const gc=p.outcomes.filter(o=>(o.value||0)>=100).reduce((s,o)=>s+o.probability,0);
  const gcLabel=gc<=0?'':(gc>=0.01?(gc*100).toFixed(1)+'%':'1 in '+Math.round(1/gc).toLocaleString());
  // The chase: the top few by value, shown large up front so the reveal opens on
  // what you actually want to hit, not the commons-first searchable list.
  const topChase=[...p.outcomes].filter(o=>o.value!=null).sort((a,b)=>b.value-a.value).slice(0,3);
  document.getElementById('pack-dialog-body').innerHTML =
   '<div class="preview-scroll"><div class="preview-hero"><img src="'+esc(p.art)+'" alt=""><div><span class="preview-kicker">RIP THIS PACK · '+p.outcomes.length+' POSSIBLE PULLS</span><h2 id="pack-dialog-title">'+esc(p.name)+'</h2>'+
    '<div class="preview-jackpot"><div><span class="pj-label">TOP PULL</span><span class="pj-val">'+money(p.max)+'</span></div>'+(gcLabel?'<div><span class="pj-label">GRAIL CHANCE</span><span class="pj-odds">'+gcLabel+'</span></div>':'')+'</div>'+
    '<a class="btn btn-primary btn-lg preview-open" href="/rip/'+encodeURIComponent(p.id)+'">Open for '+esc(rip(p.price))+' <span aria-hidden="true">→</span></a></div></div>'+
   (topChase.length?'<div class="preview-chase"><span class="pc-k">The chase</span><div class="pc-cards">'+topChase.map(function(o){var g=(o.value||0)>=100;return '<a class="pc-card'+(g?' is-grail':'')+'" href="'+esc(o.href||'#')+'"><img src="'+esc(o.image)+'" alt="" loading="lazy"><span class="pc-nm">'+esc(o.name)+'</span><span class="pc-od">'+esc(o.probabilityLabel)+'</span><span class="pc-v'+(g?' pc-grail':'')+'">'+money(o.value)+'</span></a>';}).join('')+'</div></div>':'')+
   '<div class="preview-body"><h3>Browse all '+p.outcomes.length+' outcomes</h3><p class="preview-sub">Every printing has its own odds. Search or sort the full list below.</p>'+
   '<div class="outcome-controls"><label for="outcome-search">Search outcomes<input type="search" id="outcome-search" placeholder="Card, variant or number…" aria-controls="preview-outcomes" autocomplete="off"></label><label for="outcome-sort">Sort outcomes<select id="outcome-sort" aria-controls="preview-outcomes"><option value="probability">Probability: most likely</option><option value="value-desc">Value: high to low</option><option value="name">Name: A to Z</option></select></label></div>'+
   '<div class="outcome-result-bar"><span id="outcome-count" role="status" aria-live="polite" aria-atomic="true"></span><button type="button" class="outcome-reset" id="outcome-reset" hidden>Reset</button></div><div class="outcome-list" id="preview-outcomes"></div><div class="outcome-empty" id="outcome-empty" hidden><h4>No matching outcomes</h4><p>Try a different card name, printing or card number.</p><button type="button" class="btn btn-ghost" id="outcome-empty-reset">Show all outcomes</button></div>'+
   '<p class="preview-sub" style="margin-top:20px;margin-bottom:0">USD figures are card reference values, not guaranteed resale proceeds or a conversion rate for $RIP. Probabilities come from the published pack weights.</p></div></div><div class="preview-actions"><a class="text-link" href="/packs#odds-'+encodeURIComponent(p.id)+'">Full odds table ↗</a><a class="btn btn-primary" href="/rip/'+encodeURIComponent(p.id)+'">Go to pack →</a></div>';
  const search=document.getElementById('outcome-search'), order=document.getElementById('outcome-sort');
  const reset=document.getElementById('outcome-reset');
  function renderOutcomes() {
   const terms=search.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);
   const outcomes=p.outcomes.filter(o=>{const text=[o.name,o.label,o.set,o.number,'#'+o.number,o.id].join(' ').toLowerCase();return terms.every(term=>text.includes(term));});
   outcomes.sort((a,b)=>{
    const names=()=>a.name.localeCompare(b.name)||a.label.localeCompare(b.label)||a.id.localeCompare(b.id);
    if(order.value==='name')return names();
    if(order.value==='value-desc'){
     if(a.value==null)return b.value==null?names():1;
     if(b.value==null)return -1;
     return b.value-a.value||names();
    }
    return b.probability-a.probability||names();
   });
   document.getElementById('preview-outcomes').innerHTML=outcomes.map(o=>{var g=(o.value||0)>=100;return '<a class="outcome'+(g?' outcome-grail':'')+'" href="'+esc(o.href||'#')+'"><img src="'+esc(o.image)+'" alt="" loading="lazy">'+(g?'<span class="outcome-tag">GRAIL</span>':'')+'<span><strong>'+esc(o.name)+'</strong><small>'+esc(o.label)+' · '+esc(o.set)+' #'+esc(o.number)+'</small></span><b>'+esc(o.probabilityLabel)+'<small class="ov'+(o.tier?' t-'+o.tier:'')+'">'+money(o.value)+'</small></b></a>';}).join('');
   document.getElementById('outcome-count').textContent=outcomes.length+' of '+p.outcomes.length+(p.outcomes.length===1?' outcome':' outcomes');
   document.getElementById('outcome-empty').hidden=outcomes.length>0;
   reset.hidden=!terms.length&&order.value==='probability';
  }
  function resetOutcomes(){search.value='';order.value='probability';renderOutcomes();search.focus();}
  search.addEventListener('input',renderOutcomes);order.addEventListener('change',renderOutcomes);
  reset.addEventListener('click',resetOutcomes);document.getElementById('outcome-empty-reset').addEventListener('click',resetOutcomes);
  renderOutcomes();
  open(dialog);
 }
 document.querySelectorAll('[data-preview]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();preview(b.dataset.preview);}));
 const tray=document.getElementById('compare-tray'), show=document.getElementById('compare-show');
 function syncSelection() {
  root.querySelectorAll('[data-compare]').forEach(b=>{const on=selected.includes(b.dataset.compare);b.setAttribute('aria-pressed',String(on));b.closest('.explorer-pack').classList.toggle('is-compared',on);});
  tray.hidden=!selected.length;show.disabled=selected.length!==2;
  document.getElementById('compare-selection').textContent=selected.map(id=>byId.get(id).name).join(' + ')+(selected.length===1?' · Choose one more pack':'');
 }
 root.querySelectorAll('[data-compare]').forEach(b=>b.addEventListener('click',()=>{
  const id=b.dataset.compare;
  if(selected.includes(id))selected=selected.filter(x=>x!==id);
  else if(selected.length<2)selected.push(id);
  else {document.getElementById('compare-selection').textContent='Two packs selected. Remove one to choose another.';return;}
  syncSelection();
 }));
 document.getElementById('compare-clear').addEventListener('click',()=>{selected=[];syncSelection();});
 show.addEventListener('click',()=>{
  if(selected.length!==2)return;
  const fact=(k,v)=>'<div><dt>'+k+'</dt><dd>'+v+'</dd></div>';
  document.getElementById('compare-dialog-body').innerHTML='<div class="comparison"><span class="preview-kicker">SIDE BY SIDE</span><h2 id="compare-dialog-title">Know your packs.</h2><p>Compare contents and published probabilities. USD reference values and $RIP prices are different units.</p><div class="compare-grid">'+selected.map(id=>{
   const p=byId.get(id), common=p.outcomes[0];
   return '<section class="compare-item"><img src="'+esc(p.art)+'" alt=""><h3>'+esc(p.name)+'</h3><dl>'+fact('Pack price',esc(rip(p.price)))+fact('Cards per pack',p.count)+fact('Possible outcomes',p.outcomes.length)+fact('Card reference range',money(p.min)+'–'+money(p.max))+fact('Mean reference per draw',money(p.expected))+fact('Most likely outcome',esc(common?.name??'—')+'<br>'+esc(common?.label??'')+'<br>'+esc(common?.probabilityLabel??'—'))+['TIER_1','TIER_2','TIER_3','TIER_4','GRAIL','UNPRICED'].map(tier=>fact(esc(tier.replace('_',' ')),pct(p.buckets.find(b=>b.tier===tier)?.probability??0))).join('')+'</dl><button type="button" class="btn btn-ghost" data-compare-preview="'+esc(p.id)+'">Inspect contents ↗</button></section>';
  }).join('')+'</div></div>';
  comparison.querySelectorAll('[data-compare-preview]').forEach(b=>b.addEventListener('click',()=>{comparison.close();preview(b.dataset.comparePreview);}));open(comparison);
 });
})();
</script>`;
