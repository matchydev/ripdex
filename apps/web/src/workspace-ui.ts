/** Shared card search and public binder lookup. No account or wallet connection. */
import { BINDER_LOOKUP_JS } from './binder-lookup.ts';

export const WORKSPACE_UI = `
<dialog id="search-dialog" class="utility-dialog" aria-labelledby="search-title">
 <div class="utility-head"><h2 id="search-title">Find your next favorite.</h2><button type="button" data-close-utility aria-label="Close card search">×</button></div>
 <form id="quick-search-form" action="/cards" method="get"><label class="quick-search"><span aria-hidden="true">⌕</span><input name="search" id="quick-search-input" type="search" placeholder="Search cards, Pokémon, or artists…" aria-label="Quick card search" autocomplete="off" autofocus><kbd>↵</kbd></label></form>
 <p class="utility-status" id="quick-search-status" role="status" aria-live="polite">Search the entire Pokédex.</p>
 <div class="quick-results" id="quick-results"></div>
 <div class="utility-foot"><span>Esc to close</span><a id="quick-search-all" href="/cards">Browse all cards →</a></div>
</dialog>
<dialog id="binder-dialog" class="utility-dialog binder-dialog" aria-labelledby="binder-title">
 <div class="utility-head"><h2 id="binder-title">Open a binder.</h2><button type="button" data-close-utility aria-label="Close binder lookup">×</button></div>
 <p class="binder-intro">Explore a collection by its wallet address. View collected cards, set completion, and pull history.</p>
 <form id="binder-form"><label for="binder-address">Wallet address</label><input id="binder-address" name="wallet" type="text" placeholder="Enter a wallet address" required minlength="4" maxlength="128" autocomplete="off" autocapitalize="none" spellcheck="false"><button class="btn btn-primary" type="submit">View collection →</button></form>
 <section class="binder-recent" id="binder-recent" aria-labelledby="binder-recent-title" hidden><div class="binder-recent-head"><h3 id="binder-recent-title">Recently opened</h3><button id="binder-clear-recent" type="button" aria-label="Clear recent binders">Clear</button></div><ul id="binder-recent-list"></ul><p>Saved only on this device.</p></section>
 <p class="binder-history-status" id="binder-history-status" role="status" aria-live="polite"></p>
 <p class="binder-note">Read-only lookup. No wallet connection required.</p>
</dialog>
<script>
(() => {
 const search=document.getElementById('search-dialog'), binder=document.getElementById('binder-dialog');
 const input=document.getElementById('quick-search-input'), results=document.getElementById('quick-results'), status=document.getElementById('quick-search-status');
 let request, timer, version=0;
 function open(d){if(document.querySelector('dialog[open]'))return;d.showModal();document.documentElement.classList.add('dialog-open');(d===binder?document.getElementById('binder-address'):input).focus();}
 document.getElementById('open-search').addEventListener('click',()=>open(search));
 document.getElementById('open-binder').addEventListener('click',()=>open(binder));
 [search,binder].forEach(d=>{
  d.querySelector('[data-close-utility]').addEventListener('click',()=>d.close());
  d.addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))document.documentElement.classList.remove('dialog-open');});
  d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
 });
 document.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLElement && (e.target.matches('input,textarea,select')||e.target.isContentEditable))return;
  if(e.key==='/' || ((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k')){e.preventDefault();open(search);}
 });
 input.addEventListener('input',()=>{
  clearTimeout(timer);request?.abort();const current=++version;const q=input.value.trim();results.innerHTML='';
  document.getElementById('quick-search-all').href='/cards'+(q?'?search='+encodeURIComponent(q):'');
  if(!q){status.textContent='Search the entire Pokédex.';return;}
  status.textContent='Searching…';
  timer=setTimeout(async()=>{
   request=new AbortController();
   try {
    const response=await fetch('/api/cards?search='+encodeURIComponent(q)+'&pageSize=6',{signal:request.signal});
    if(!response.ok)throw new Error('search');const data=await response.json();if(current!==version)return;
    results.innerHTML=data.html;
    results.querySelectorAll('[data-reveal],[data-tilt]').forEach(el=>{el.removeAttribute('data-reveal');el.removeAttribute('data-tilt');});
    status.textContent=data.totalCount===0?'No cards found. Try another name.':data.totalCount+' matching '+(data.totalCount===1?'card':'cards')+(data.totalCount>6?' · Showing 6':'');
   }catch(e){if(e.name!=='AbortError'&&current===version)status.textContent='Search is unavailable. Use Browse all cards to try the catalog.';}
  },150);
 });
})();
</script>${BINDER_LOOKUP_JS}`;

export const WORKSPACE_CSS = `
.header-tools{display:flex;align-items:center;gap:10px;margin-left:auto}
.header-search,.header-binder{display:flex;align-items:center;gap:12px;padding:0 13px;height:36px;font-size:11px;border-radius:8px;color:var(--text-3);background:var(--glass);box-shadow:0 0 0 1px var(--line)}
.header-search{min-width:156px;justify-content:space-between}.header-search kbd{font:10px ui-monospace,monospace;padding:2px 5px;border-radius:4px;box-shadow:0 0 0 1px var(--line-hi)}.header-binder{color:var(--text-2);background:var(--accent-dim)}.header-tools button:hover{box-shadow:0 0 0 1px var(--line-max);color:var(--text)}
html.dialog-open{overflow:hidden}
.utility-dialog{color:var(--text);border:0;border-radius:16px;width:min(590px,calc(100vw - 32px));padding:24px;background:#111218;box-shadow:0 0 0 1px var(--line-hi),0 30px 120px rgba(0,0,0,.8);max-height:calc(100dvh - 40px);overflow:auto}
.utility-dialog::backdrop{background:rgba(3,4,8,.8);backdrop-filter:blur(8px)}
.utility-head{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:20px}.utility-head h2{font-size:21px;letter-spacing:-.04em;font-weight:580;margin:0}.utility-head button{font-size:24px;width:32px;height:32px;background:var(--glass);border-radius:7px}
.quick-search{display:flex;align-items:center;gap:10px;background:var(--glass);padding:0 12px;border-radius:10px;box-shadow:0 0 0 1px var(--line-hi)}.quick-search>span{font-size:26px;color:var(--text-4)}.quick-search input{flex:1;min-width:0;width:100%;height:48px;background:transparent;box-shadow:none;padding:0;font-size:13px}.quick-search kbd{font-size:13px;color:var(--text-4)}
.utility-status{font-size:11px;color:var(--text-4);margin:18px 0 10px}.quick-results{display:grid;gap:5px}.quick-results .tile{display:grid;grid-template-columns:35px minmax(0,1fr);gap:14px;padding:9px;border-radius:8px;transition:background .2s}.quick-results .tile:hover{background:var(--glass)}.quick-results .tile::before{display:none}.quick-results .shot{width:35px;box-shadow:none}.quick-results .tile:hover .shot{transform:none}.quick-results .rip-badge,.quick-results .vcount{display:none}.quick-results .meta{position:relative;padding:0 70px 0 0;align-self:center;min-width:0}.quick-results .meta .val{position:absolute;right:0;top:7px;font-size:11px;margin:0}.quick-results .meta .nm{font-size:12px}.quick-results .meta .sub{font-size:10px}
.utility-foot{display:flex;justify-content:space-between;gap:15px;padding-top:20px;margin-top:12px;box-shadow:0 -1px 0 var(--line);font-size:10px;color:var(--text-4)}.utility-foot a{color:var(--accent-hi)}
.binder-intro{font-size:13px;color:var(--text-3);line-height:1.8}.binder-dialog label{display:block;font-size:11px;color:var(--text-3);margin:24px 0 8px}.binder-dialog input{width:100%;height:46px;background:var(--glass);border:0;box-shadow:0 0 0 1px var(--line-hi);border-radius:8px;font:13px ui-monospace,monospace;color:var(--text);padding:0 13px}.binder-dialog .btn{width:100%;margin-top:18px}.binder-note{font-size:10px;color:var(--text-4);margin:18px 0 0}
.binder-recent{margin-top:26px;border-top:1px solid var(--line);padding-top:18px}.binder-recent[hidden]{display:none}.binder-recent-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.binder-recent h3{font-size:12px;font-weight:550;margin:0}.binder-recent-head button{font-size:11px;color:var(--text-3);min-height:32px;padding:4px 9px;border-radius:6px}.binder-recent-head button:hover{background:var(--glass);color:var(--text)}.binder-recent ul{list-style:none;padding:0;margin:9px 0}.binder-recent a{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:42px;padding:9px 11px;border-radius:7px;font:11px/1.6 ui-monospace,monospace;color:var(--text-2)}.binder-recent a:hover{background:var(--accent-dim)}.binder-recent a span:first-child{min-width:0;overflow-wrap:anywhere}.binder-recent a span:last-child{color:var(--accent-hi)}.binder-recent p,.binder-history-status{font-size:10px;line-height:1.6;color:var(--text-4);margin:9px 0 0}.binder-history-status:empty{display:none}
.ticker-pause{flex-shrink:0;font-size:10px;padding:0 13px;color:var(--text-3);box-shadow:-1px 0 0 var(--line)}.ticker.is-paused .ticker-track{animation-play-state:paused}
@media(max-width:1100px){.header-search{min-width:36px;padding:0 11px}.header-search .search-label,.header-search kbd{display:none}}
@media(max-width:760px){.header-tools{grid-column:2;grid-row:1}.header-tools button{min-height:36px}.header-binder{font-size:10px}.utility-dialog{padding:20px 16px}.utility-head h2{font-size:20px}.ticker-pause{padding:0 9px;font-size:9px}}
`;
