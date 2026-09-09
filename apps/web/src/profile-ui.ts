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
  const toast = (msg) => { if (!toastEl) return; toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.hidden = true, 4200); };

  const setChip = (n) => { const el = document.getElementById('pfChipNum'); if (el && typeof n === 'number') el.textContent = rip(n); };

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

  async function load() {
    try {
      const res = await fetch('/api/profile');
      if (!res.ok) return;
      data = await res.json();
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
    load();
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
        toast('Sold ' + name + ' for ' + rip(out.credited) + ' $RIP.');
        if (typeof out.balance === 'number') setChip(out.balance);
        await load();
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

  // Populate the header chip on load without opening anything.
  load();
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
}
`;
