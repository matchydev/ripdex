/**
 * The top-right profile: a header chip that opens a slide-over drawer showing
 * the ripper's demo $RIP balance, session P&L, and their vault of pulled cards
 * (each sellable, each with its PSA grade and graded value).
 *
 * Self-contained on purpose — one header hook (`profileHeader()`) and one body
 * hook (`profileUI()`) into render.ts's `layout()`, plus `PROFILE_CSS`. All data
 * comes from `/api/profile`; selling posts to `/api/sell`. This is the economy
 * layer's face, never the provably-fair ledger: balances are demo $RIP only.
 */

import { ripMark } from './brand.ts';

/** The compact avatar glyph, reused in the header chip and the drawer header. */
const AVATAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"/><path d="m8.5 9.6 3.5 2 3.5-2M12 13.6V18"/></svg>`;

/** The header button — an avatar + live balance chip that opens the drawer. */
export function profileHeader(): string {
  return `<button type="button" class="profile-chip" id="open-profile" aria-haspopup="dialog" aria-expanded="false" aria-controls="pfDrawer" aria-label="Open your profile and vault">
    <span class="pf-avatar" aria-hidden="true">${AVATAR}</span>
    <span class="pf-chip-bal">${ripMark()}<span id="pfChipNum">—</span><span class="u">$RIP</span></span>
  </button>`;
}

/** The slide-over drawer + toast + client. Rendered once, before </body>. */
export function profileUI(): string {
  return `<div class="pf-scrim" id="pfScrim" hidden></div>
<aside class="pf-drawer" id="pfDrawer" role="dialog" aria-modal="true" aria-labelledby="pfTitle" aria-hidden="true" hidden>
  <header class="pf-head">
    <div class="pf-id">
      <span class="pf-avatar pf-avatar-lg" aria-hidden="true">${AVATAR}</span>
      <div class="pf-id-text"><span class="pf-tag">DEMO WALLET</span><span class="pf-addr" id="pfAddr" title="Your demo wallet — also your public provably-fair client seed">—</span></div>
    </div>
    <button type="button" class="pf-close" id="pfClose" aria-label="Close profile"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
  </header>
  <div class="pf-balance">
    <span class="pf-bal-label" id="pfTitle">Your balance</span>
    <span class="pf-bal-num">${ripMark()}<span id="pfBal">—</span><span class="u">$RIP</span></span>
    <span class="pf-pnl" id="pfPnl" hidden></span>
  </div>
  <div class="pf-stats" id="pfStats" aria-live="polite"></div>
  <div class="pf-achv" id="pfAchv" role="group" aria-label="Achievements"></div>
  <div class="pf-tabs" role="tablist" aria-label="Your pulls">
    <button type="button" class="pf-tab on" id="pfTabOwned" data-tab="owned" role="tab" aria-selected="true">Vault<i class="pf-count" id="pfOwnedCount"></i></button>
    <button type="button" class="pf-tab" id="pfTabSold" data-tab="sold" role="tab" aria-selected="false">Sold<i class="pf-count" id="pfSoldCount"></i></button>
  </div>
  <div class="pf-grid" id="pfGrid" role="tabpanel"></div>
  <footer class="pf-foot">
    <a class="pf-binder" id="pfBinder" href="#">Open full binder <span aria-hidden="true">↗</span></a>
    <p>Demo $RIP is for trying packs and the vault. It is not an onchain token or a redeemable balance.</p>
  </footer>
</aside>
<div class="pf-toast" id="pfToast" role="status" aria-live="polite" hidden></div>
<script>
(() => {
  const chip = document.getElementById('open-profile');
  const drawer = document.getElementById('pfDrawer');
  const scrim = document.getElementById('pfScrim');
  const closeBtn = document.getElementById('pfClose');
  if (!chip || !drawer || !scrim) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const rip = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
  const usd = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gradeColor = (g) => g >= 10 ? 'var(--gold)' : g >= 9 ? 'var(--accent-hi)' : 'var(--text-2)';
  const gradeClass = (g) => g >= 10 ? 'g10' : g >= 9 ? 'g9' : 'g';

  let data = null;
  let tab = 'owned';
  let lastFocus = null;

  const toastEl = document.getElementById('pfToast');
  let toastTimer;
  const toast = (msg, win) => { if (!toastEl) return; toastEl.textContent = msg; toastEl.classList.toggle('win', !!win); toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.hidden = true, 4200); };

  const setChip = (n) => { const el = document.getElementById('pfChipNum'); if (el && typeof n === 'number') el.textContent = rip(n); };

  // Cashing out is the vault's whole thrill — roll the balance up to its new
  // total and pop the numbers green rather than snapping the figure silently.
  function countBalance(from, to){
    const chip = document.getElementById('pfChipNum'), bal = document.getElementById('pfBal');
    if (reduced || !(to > from)){ if (chip) chip.textContent = rip(to); if (bal) bal.textContent = rip(to); return; }
    const t0 = performance.now(), ms = 620;
    const stepFn = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      const v = Math.round(from + (to - from) * e);
      if (chip) chip.textContent = rip(v);
      if (bal) bal.textContent = rip(v);
      if (p < 1) requestAnimationFrame(stepFn);
    };
    requestAnimationFrame(stepFn);
  }
  function pulseWin(){
    ['pfChipNum','pfBal'].forEach((id) => { const el = document.getElementById(id); if (!el) return; el.classList.remove('bal-pop'); void el.offsetWidth; el.classList.add('bal-pop'); });
    const pchip = document.getElementById('open-profile');
    if (pchip){ pchip.classList.remove('win-flash'); void pchip.offsetWidth; pchip.classList.add('win-flash'); }
  }

  function render() {
    if (!data) return;
    setChip(data.balance);
    document.getElementById('pfBal').textContent = rip(data.balance);
    const addr = document.getElementById('pfAddr');
    if (addr) addr.textContent = data.wallet ? (data.wallet.length > 13 ? data.wallet.slice(0, 6) + '…' + data.wallet.slice(-4) : data.wallet) : '—';

    // Net P&L against the starting balance — the number the ripper cares about.
    const pnl = document.getElementById('pfPnl');
    const net = Number(data.net) || 0;
    pnl.hidden = data.packsOpened === 0;
    pnl.className = 'pf-pnl ' + (net > 0 ? 'up' : net < 0 ? 'down' : 'flat');
    pnl.textContent = (net > 0 ? '▲ +' : net < 0 ? '▼ −' : '± ') + rip(Math.abs(net)) + ' $RIP session P&L';

    const best = data.best;
    document.getElementById('pfStats').innerHTML =
      stat('Packs opened', rip(data.packsOpened), '') +
      stat('Grails pulled', rip(data.grails), data.grails > 0 ? 'gold' : '') +
      stat('Total spent', rip(data.spent) + ' $RIP', '') +
      stat('Best pull', best ? usd(best.gradedValue) : '—', best && best.grade >= 10 ? 'gold' : '');

    // Trophy shelf — earned first (most recent first), then closest-to-earning,
    // then the rest, so the shelf reorders itself as you unlock things.
    const shelf = document.getElementById('pfAchv');
    const achv = (data.achievements || []).slice().sort(achvOrder);
    if (!achv.length) {
      shelf.innerHTML = '';
    } else {
      const won = achv.filter((a) => a.unlocked);
      const lead = won[0] || achv[0];
      const capDef = won.length
        ? '★ ' + lead.name + ' — ' + lead.description
        : 'Open packs to start earning trophies.';
      shelf.innerHTML =
        '<div class="pf-achv-head"><span>Trophies</span><i>' + won.length + ' / ' + achv.length + '</i></div>' +
        '<div class="pf-medals">' + achv.map(medal).join('') + '</div>' +
        '<p class="pf-achv-cap" id="pfAchvCap" data-def="' + esc(capDef) + '">' + esc(capDef) + '</p>';
    }

    const owned = data.owned || [];
    const sold = data.sold || [];
    document.getElementById('pfOwnedCount').textContent = owned.length ? ' ' + owned.length : '';
    document.getElementById('pfSoldCount').textContent = sold.length ? ' ' + sold.length : '';
    document.getElementById('pfTabOwned').setAttribute('aria-selected', String(tab === 'owned'));
    document.getElementById('pfTabSold').setAttribute('aria-selected', String(tab === 'sold'));
    document.getElementById('pfTabOwned').classList.toggle('on', tab === 'owned');
    document.getElementById('pfTabSold').classList.toggle('on', tab === 'sold');

    const binder = document.getElementById('pfBinder');
    if (binder) binder.href = data.wallet ? '/collection/' + encodeURIComponent(data.wallet) : '#';

    const grid = document.getElementById('pfGrid');
    const list = tab === 'owned' ? owned : sold;
    if (!list.length) {
      grid.innerHTML = tab === 'owned'
        ? '<div class="pf-empty"><p>Your vault is empty.</p><a href="/packs">Rip your first pack →</a></div>'
        : '<div class="pf-empty"><p>You haven\\'t sold any pulls yet.</p><span>Sold cards return 85% of their graded value.</span></div>';
      return;
    }
    grid.innerHTML = list.map(tab === 'owned' ? ownedCard : soldCard).join('');
  }

  function stat(label, value, cls) {
    return '<div class="pf-stat ' + cls + '"><span class="pf-stat-v">' + esc(value) + '</span><span class="pf-stat-l">' + esc(label) + '</span></div>';
  }

  // A distinct engraved emblem per achievement, keyed by its stable id — the two
  // medal PNGs (silver / grail-gold) are the frame, the emblem is the identity,
  // so ten silver coins never read as ten of the same trophy. Monoline SVGs sized
  // to sit inside the coin's rim.
  const svg = (inner) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  const EMBLEMS = {
    FIRST_RIP: svg('<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/>'),
    CENTURION: svg('<path d="M12 3l7 2.5v5.5c0 4-3 7-7 8.5-4-1.5-7-4.5-7-8.5V5.5z"/><path d="M9.3 12l1.8 1.8 3.6-3.6"/>'),
    FIRE_STARTER: svg('<path d="M12 3c1 2.6 4 4 4 8a4 4 0 0 1-8 0c0-1.3.6-2.4 1.5-3 .1 1 .6 1.5 1.2 1.7C10.4 8.6 11 6 12 3z"/>'),
    CHARIZARD_HUNTER: svg('<path d="M4 8l3.2 8h9.6L20 8l-4.6 3.3L12 5 8.6 11.3z"/>'),
    KANTO_COLLECTOR: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h6M14.5 12h6"/><circle cx="12" cy="12" r="2.5"/>'),
    GRAIL_HUNTER: svg('<path d="M7.5 4h9M8 4c0 5 1.2 7.6 4 7.6S16 9 16 4M12 11.6V18M8.5 20h7"/>'),
    ONE_IN_A_THOUSAND: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>'),
    FULL_SET: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>'),
    HOLO_HOARDER: svg('<path d="M6 9.5 9 5h6l3 4.5-6 9.5z"/><path d="M6 9.5h12"/>'),
    FIRST_EDITION: svg('<circle cx="12" cy="9" r="5"/><path d="M9.2 13.2 7.5 20l4.5-2.6L16.5 20l-1.7-6.8"/>'),
    VAULT_BUILDER: svg('<path d="M12 4v16M15 7.2c-.8-1-2-1.5-3.2-1.5-1.8 0-3.3 1-3.3 2.6 0 3.6 6.8 1.8 6.8 5.6 0 1.9-1.7 2.9-3.6 2.9-1.4 0-2.7-.5-3.5-1.6"/>'),
    _default: svg('<circle cx="12" cy="12" r="7"/><path d="M9.5 12l1.8 1.8 3.4-3.6"/>'),
  };

  // Earned first (recent first), then closest-to-earning by progress ratio.
  function achvOrder(a, b) {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (a.unlocked) {
      const ua = a.unlockedAt || '', ub = b.unlockedAt || '';
      return ua < ub ? 1 : ua > ub ? -1 : 0;
    }
    const ra = a.target > 0 ? a.current / a.target : 0;
    const rb = b.target > 0 ? b.current / b.target : 0;
    return rb - ra;
  }

  function medal(a) {
    const grail = a.id === 'GRAIL_HUNTER';
    // The plate only shows on LOCKED medals, so cap below 100: a value-summing
    // badge (VAULT_BUILDER) at $996.50 / $1000 must not round up to a misleading
    // "100%" while the coin is still dim and captioned "996.5 / 1000".
    const pct = a.target > 0 ? Math.min(99, Math.floor((a.current / a.target) * 100)) : 0;
    const src = '/art/achievements/' + (grail ? 'grail-puller' : 'medal-base') + '.png';
    const emblem = EMBLEMS[a.id] || EMBLEMS._default;
    const state = a.unlocked ? 'Unlocked' : a.current + ' / ' + a.target;
    return '<button type="button" class="pf-medal' + (a.unlocked ? ' on' : '') + (grail ? ' grail' : '') +
      '" data-name="' + esc(a.name) + '" data-desc="' + esc(a.description) + '" data-state="' + esc(state) +
      '" title="' + esc(a.name) + ' — ' + esc(state) + '" aria-label="' + esc(a.name + ': ' + (a.unlocked ? 'unlocked' : 'in progress, ' + state)) + '">' +
      '<span class="pf-medal-coin"><img src="' + src + '" alt="" loading="lazy" decoding="async">' +
      '<span class="pf-medal-emb">' + emblem + '</span></span>' +
      (a.unlocked ? '' : '<span class="pf-medal-pct">' + pct + '%</span>') +
    '</button>';
  }
  function ownedCard(p) {
    return '<div class="pf-card ' + gradeClass(p.grade) + '">' +
      '<div class="pf-card-img"><img src="' + esc(p.img) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">' +
        '<span class="pf-grade" style="--g:' + gradeColor(p.grade) + '">PSA ' + esc(p.grade) + '</span></div>' +
      '<div class="pf-card-meta"><span class="pf-card-name">' + esc(p.name) + '</span>' +
        '<span class="pf-card-val">' + usd(p.gradedValue) + '</span></div>' +
      '<button type="button" class="pf-sell" data-id="' + esc(p.openingId) + '" data-name="' + esc(p.name) + '">Sell · ' + rip(p.sellValue) + ' $RIP</button>' +
    '</div>';
  }
  function soldCard(p) {
    return '<div class="pf-card sold ' + gradeClass(p.grade) + '">' +
      '<div class="pf-card-img"><img src="' + esc(p.img) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">' +
        '<span class="pf-grade" style="--g:' + gradeColor(p.grade) + '">PSA ' + esc(p.grade) + '</span>' +
        '<span class="pf-sold-tag">SOLD</span></div>' +
      '<div class="pf-card-meta"><span class="pf-card-name">' + esc(p.name) + '</span>' +
        '<span class="pf-card-val">+' + rip(p.sellValue) + ' $RIP</span></div>' +
    '</div>';
  }

  // withAchv=true asks the server to compute the (ledger-derived) trophy shelf —
  // only the open drawer needs it. The header-chip fetch and the post-sell
  // refresh pass false to keep the hot path off the ledger; a sell cannot change
  // an achievement, so the last-known shelf is carried forward on those refreshes.
  async function load(withAchv) {
    try {
      const res = await fetch(withAchv ? '/api/profile?achv=1' : '/api/profile');
      if (!res.ok) return;
      const next = await res.json();
      if (next.achievements === undefined && data && data.achievements) next.achievements = data.achievements;
      data = next;
      render();
    } catch (e) { /* leave the chip on its last value */ }
  }

  function open() {
    lastFocus = document.activeElement;
    drawer.hidden = false; scrim.hidden = false;
    // Force a reflow so the transition runs even when the pane was just shown.
    void drawer.offsetWidth;
    drawer.classList.add('is-open'); scrim.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    chip.setAttribute('aria-expanded', 'true');
    document.body.classList.add('pf-lock');
    closeBtn && closeBtn.focus();
    load(true);
  }
  function close() {
    drawer.classList.remove('is-open'); scrim.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    chip.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('pf-lock');
    const done = () => { drawer.hidden = true; scrim.hidden = true; };
    if (reduced) done(); else setTimeout(done, 260);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  chip.addEventListener('click', open);
  closeBtn && closeBtn.addEventListener('click', close);
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('is-open')) close(); });

  drawer.querySelectorAll('.pf-tab').forEach((t) => t.addEventListener('click', () => { tab = t.dataset.tab; render(); }));

  // Trophy description plate — hovering or focusing a medal names it and says how
  // to earn it; leaving restores the default line. Delegated on the stable
  // #pfAchv container so it survives every re-render of the medal shelf.
  const shelfBox = document.getElementById('pfAchv');
  const describe = (e) => {
    const m = e.target.closest('.pf-medal');
    const cap = document.getElementById('pfAchvCap');
    if (!m || !cap) return;
    cap.textContent = m.dataset.name + ' — ' + m.dataset.desc + ' · ' + m.dataset.state;
  };
  const restore = () => { const cap = document.getElementById('pfAchvCap'); if (cap && cap.dataset.def) cap.textContent = cap.dataset.def; };
  shelfBox.addEventListener('pointerover', describe);
  shelfBox.addEventListener('focusin', describe);
  shelfBox.addEventListener('pointerleave', restore);
  shelfBox.addEventListener('focusout', restore);

  // Sell — delegated so it survives every re-render of the grid.
  drawer.addEventListener('click', async (e) => {
    const btn = e.target.closest('.pf-sell');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.id, name = btn.dataset.name || 'Card';
    btn.disabled = true; btn.textContent = 'Selling…';
    try {
      const res = await fetch('/api/sell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ openingId: id }) });
      const out = await res.json();
      if (res.ok && out.ok) {
        toast('Sold ' + name + ' for ' + rip(out.credited) + ' $RIP.', true);
        const cardEl = btn.closest('.pf-card');
        if (!reduced && typeof out.balance === 'number' && typeof out.credited === 'number') {
          countBalance(out.balance - out.credited, out.balance);
          pulseWin();
          if (cardEl) cardEl.classList.add('selling');
          await new Promise((r) => setTimeout(r, 640));
        } else if (typeof out.balance === 'number') {
          setChip(out.balance);
        }
        await load(false);
      } else {
        toast(out.error || 'Could not sell that pull.');
        btn.disabled = false; btn.textContent = 'Sell';
        if (out && typeof out.balance === 'number') setChip(out.balance);
      }
    } catch (err) {
      toast('Network error — try again.');
      btn.disabled = false; btn.textContent = 'Sell';
    }
  });

  // Populate the header chip on load without opening anything — balance only, so
  // this every-page fetch never touches the ledger.
  load(false);
})();
</script>`;
}

export const PROFILE_CSS = `
.profile-chip{display:inline-flex;align-items:center;gap:9px;min-height:38px;padding:0 12px 0 6px;border-radius:8px;border:1px solid var(--line-hi);background:var(--glass);color:var(--text-2);font-size:12px;font-weight:600;cursor:pointer;transition:border-color .2s,background .2s,transform .2s}
.profile-chip:hover{border-color:var(--accent);background:var(--accent-dim);transform:translateY(-1px)}
.profile-chip:focus-visible{outline:2px solid var(--text);outline-offset:3px}
.pf-avatar{display:grid;place-items:center;width:28px;height:28px;border-radius:7px;color:#fff;background:linear-gradient(140deg,var(--accent-hi),var(--accent) 55%,#4b47c9);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
.pf-avatar svg{width:16px;height:16px}
.pf-chip-bal{display:inline-flex;align-items:center;gap:5px;font-variant-numeric:tabular-nums}
.pf-chip-bal img,.pf-chip-bal svg{width:14px;height:14px}
.pf-chip-bal .u{font-size:9px;letter-spacing:.08em;color:var(--text-3);font-weight:700}
body.pf-lock{overflow:hidden}
.pf-scrim{position:fixed;inset:0;z-index:1100;background:rgba(4,5,8,.62);backdrop-filter:blur(3px);opacity:0;transition:opacity .26s var(--ease)}
.pf-scrim.is-open{opacity:1}
.pf-scrim[hidden]{display:none}
.pf-drawer{position:fixed;top:0;right:0;z-index:1101;display:flex;flex-direction:column;width:min(420px,94vw);height:100dvh;background:var(--panel);border-left:1px solid var(--line-hi);box-shadow:-24px 0 80px rgba(0,0,0,.5);transform:translateX(100%);transition:transform .3s var(--ease);overflow:hidden}
.pf-drawer.is-open{transform:translateX(0)}
.pf-drawer[hidden]{display:none}
.pf-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid var(--line)}
.pf-id{display:flex;align-items:center;gap:12px;min-width:0}
.pf-avatar-lg{width:44px;height:44px;border-radius:11px}
.pf-avatar-lg svg{width:24px;height:24px}
.pf-id-text{display:flex;flex-direction:column;gap:3px;min-width:0}
.pf-tag{font-size:9px;font-weight:800;letter-spacing:.16em;color:var(--accent-hi)}
.pf-addr{font:500 13px ui-monospace,monospace;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-close{display:grid;place-items:center;width:34px;height:34px;border-radius:8px;border:1px solid var(--line-hi);background:none;color:var(--text-3);cursor:pointer;transition:color .2s,border-color .2s}
.pf-close:hover{color:var(--text);border-color:var(--line-max)}
.pf-close:focus-visible{outline:2px solid var(--text);outline-offset:2px}
.pf-balance{display:flex;flex-direction:column;gap:6px;padding:22px 20px 18px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,var(--accent-dim),transparent)}
.pf-bal-label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);font-weight:700}
.pf-bal-num{display:flex;align-items:center;gap:9px;font-size:36px;font-weight:750;letter-spacing:-.03em;color:var(--text);font-variant-numeric:tabular-nums}
/* Selling pays off visibly: the balance numbers pop green, the chip border
   flashes emerald, and the sold card fades out before the grid refreshes. */
@keyframes balPop{0%{transform:scale(1)}30%{transform:scale(1.07);color:var(--em)}100%{transform:scale(1)}}
.bal-pop{display:inline-block;animation:balPop .6s var(--ease)}
@keyframes chipWin{0%,100%{border-color:var(--line-hi)}35%{border-color:var(--em);box-shadow:0 0 0 1px var(--em)}}
.profile-chip.win-flash{animation:chipWin .7s var(--ease)}
.pf-toast.win{color:var(--em);box-shadow:0 0 0 1px rgba(74,222,155,.4),0 14px 40px rgba(0,0,0,.5)}
.pf-card.selling{opacity:0;transform:scale(.93);transition:opacity .3s var(--ease),transform .3s var(--ease)}
@media(prefers-reduced-motion:reduce){.bal-pop,.profile-chip.win-flash{animation:none}.pf-card.selling{transition:none}}
.pf-bal-num img,.pf-bal-num svg{width:28px;height:28px}
.pf-bal-num .u{font-size:13px;font-weight:700;letter-spacing:.06em;color:var(--text-3)}
.pf-pnl{font-size:12px;font-weight:650;font-variant-numeric:tabular-nums}
.pf-pnl.up{color:var(--em)}
.pf-pnl.down{color:#ff7a7a}
.pf-pnl.flat{color:var(--text-3)}
.pf-pnl[hidden]{display:none}
.pf-stats{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border-bottom:1px solid var(--line)}
.pf-stat{display:flex;flex-direction:column;gap:3px;padding:14px 20px;background:var(--panel)}
.pf-stat-v{font-size:18px;font-weight:700;letter-spacing:-.02em;color:var(--text);font-variant-numeric:tabular-nums}
.pf-stat.gold .pf-stat-v{color:var(--gold)}
.pf-stat-l{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3);font-weight:600}
.pf-achv{border-bottom:1px solid var(--line)}
.pf-achv:empty{display:none}
.pf-achv-head{display:flex;justify-content:space-between;align-items:center;padding:14px 20px 2px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3)}
.pf-achv-head i{font-style:normal;color:var(--text-2);font-variant-numeric:tabular-nums}
.pf-medals{display:flex;flex-wrap:wrap;gap:15px 8px;padding:10px 20px 6px}
.pf-medal{position:relative;flex:0 0 auto;width:44px;padding:0;border:none;background:none;cursor:pointer}
.pf-medal-coin{position:relative;display:block;width:44px;height:44px;transition:transform .18s var(--ease)}
.pf-medal-coin img{position:absolute;inset:0;width:44px;height:44px;object-fit:contain;filter:grayscale(1) brightness(.55);opacity:.7;transition:filter .25s var(--ease),opacity .25s var(--ease)}
.pf-medal-emb{position:absolute;inset:0;display:grid;place-items:center;color:var(--text-4);transition:color .25s var(--ease)}
.pf-medal-emb svg{width:19px;height:19px;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.7))}
.pf-medal.on .pf-medal-coin img{filter:none;opacity:1}
.pf-medal.on .pf-medal-emb{color:#fff}
.pf-medal.grail.on .pf-medal-coin{filter:drop-shadow(0 0 7px rgba(245,196,81,.45))}
.pf-medal:hover .pf-medal-coin,.pf-medal:focus-visible .pf-medal-coin{transform:translateY(-2px)}
.pf-medal:focus-visible{outline:2px solid var(--text);outline-offset:2px;border-radius:9px}
.pf-medal-pct{position:absolute;left:0;right:0;bottom:-12px;text-align:center;font-size:8px;font-weight:800;color:var(--text-3);font-variant-numeric:tabular-nums}
.pf-achv-cap{margin:0;padding:6px 20px 14px;font-size:11px;line-height:1.5;color:var(--text-3);min-height:2.1em}
.pf-tabs{display:flex;gap:4px;padding:12px 16px 0}
.pf-tab{position:relative;padding:8px 12px 12px;border:none;background:none;color:var(--text-3);font-size:12px;font-weight:650;cursor:pointer}
.pf-tab .pf-count{font-style:normal;color:var(--text-3);font-weight:600}
.pf-tab.on{color:var(--text)}
.pf-tab.on::after{content:"";position:absolute;left:12px;right:12px;bottom:0;height:2px;border-radius:2px;background:var(--accent)}
.pf-tab:focus-visible{outline:2px solid var(--text);outline-offset:1px;border-radius:6px}
.pf-grid{flex:1;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px;align-content:start}
.pf-card{display:flex;flex-direction:column;gap:8px;padding:9px;border-radius:12px;border:1px solid var(--line-hi);background:var(--elevated)}
.pf-card.g9{border-color:rgba(130,143,255,.4)}
.pf-card.g10{border-color:rgba(245,196,81,.5);box-shadow:0 0 18px rgba(245,196,81,.12)}
.pf-card-img{position:relative;aspect-ratio:63/88;border-radius:8px;overflow:hidden;background:#0b0c0d}
.pf-card-img img{width:100%;height:100%;object-fit:cover}
.pf-grade{position:absolute;top:6px;left:6px;padding:2px 6px;border-radius:5px;font-size:9px;font-weight:800;letter-spacing:.04em;color:#08090a;background:var(--g);box-shadow:0 1px 4px rgba(0,0,0,.4)}
.pf-sold-tag{position:absolute;inset:0;display:grid;place-items:center;font-size:13px;font-weight:800;letter-spacing:.12em;color:#fff;background:rgba(6,7,10,.55);backdrop-filter:grayscale(1)}
.pf-card.sold .pf-card-img img{filter:grayscale(.7) brightness(.7)}
.pf-card-meta{display:flex;flex-direction:column;gap:1px;min-width:0}
.pf-card-name{font-size:11px;font-weight:600;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pf-card-val{font-size:13px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums}
.pf-card.sold .pf-card-val{color:var(--em)}
.pf-sell{margin-top:2px;padding:8px;border-radius:7px;border:1px solid var(--line-hi);background:var(--glass);color:var(--text-2);font-size:11px;font-weight:650;cursor:pointer;font-variant-numeric:tabular-nums;transition:border-color .18s,background .18s,color .18s}
.pf-sell:hover:not(:disabled){border-color:var(--em);color:var(--em);background:rgba(74,222,155,.08)}
.pf-sell:disabled{opacity:.55;cursor:default}
.pf-sell:focus-visible{outline:2px solid var(--text);outline-offset:2px}
.pf-empty{grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:44px 20px;text-align:center;color:var(--text-3)}
.pf-empty p{margin:0;font-size:14px;color:var(--text-2);font-weight:600}
.pf-empty a{color:var(--accent-hi);font-size:13px;font-weight:600}
.pf-empty span{font-size:12px}
.pf-foot{padding:14px 20px 18px;border-top:1px solid var(--line)}
.pf-binder{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:650;color:var(--accent-hi)}
.pf-binder:hover{color:var(--text)}
.pf-foot p{margin:8px 0 0;font-size:10.5px;line-height:1.6;color:var(--text-4)}
.pf-toast{position:fixed;z-index:1200;left:50%;bottom:24px;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 32px);padding:13px 20px;border-radius:10px;border:1px solid var(--line-max);background:var(--elevated);color:var(--text);font-size:12px;font-weight:550;box-shadow:0 8px 32px rgba(0,0,0,.5)}
.pf-toast[hidden]{display:none}
@media(max-width:760px){
 .profile-chip{padding:0 10px 0 5px;gap:6px}
 .profile-chip .pf-chip-bal{font-size:11px}
 .pf-drawer{width:100vw}
 .pf-bal-num{font-size:32px}
}
@media(prefers-reduced-motion:reduce){
 .pf-drawer,.pf-scrim{transition:none}
 .profile-chip{transition:none}
 .pf-medal-coin,.pf-medal-coin img,.pf-medal-emb{transition:none}
}
`;
