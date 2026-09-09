import { ripMark, RIP_TOKEN_URL } from './brand.ts';
/** Public launch information only. Never connects a wallet or submits a trade. */
export function tokenConfig(env: Record<string, string | undefined> = process.env) {
  const candidate = (env.RIPDEX_TOKEN_ADDRESS ?? '').trim();
  const address = /^0x[\da-fA-F]{40}$/.test(candidate) && !/^0x0{40}$/i.test(candidate) ? candidate : '';
  // The token's own verified pons page; never accept arbitrary redirect URLs.
  const buyUrl = address ? `https://www.ponsfamily.com/launchpad/${address}` : '';
  return { address, buyUrl };
}

export function tokenHeader() {
  return `<a class="token-buy" href="/#rip-contract" data-token-buy>${ripMark()}Buy $RIP <span aria-hidden="true">↗</span></a>`;
}

export function tokenHeroContract(env: Record<string, string | undefined> = process.env) {
  const { address } = tokenConfig(env);
  return `<div class="hero-contract" id="rip-contract" tabindex="-1">
    <button class="hero-ca-button" type="button" data-copy-ca ${address ? '' : 'aria-disabled="true"'} aria-describedby="hero-contract-help"><span class="hero-ca-label">CA:</span><span class="hero-ca-address">${address || 'Coming soon'}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button>
    <span class="hero-contract-help" id="hero-contract-help">${address ? 'Copy the full official RIP contract address.' : 'The official RIP contract address will appear here after deployment. No contract address has been published yet.'}</span>
  </div>`;
}

export function tokenSection() {
  const { address, buyUrl } = tokenConfig();
  return `<section class="token-section" id="rip-token" tabindex="-1" aria-labelledby="token-title">
  <div class="token-intro">
    <div class="token-copy"><span class="section-index">THE NEXT CHAPTER / COMING SOON</span>
      <h2 id="token-title">Meet <span>$RIP.</span></h2>
      <p class="token-lede">The token behind the next chapter of RIPDEX.</p>
      <p class="token-description">Planned to launch through pons on Robinhood Chain. Launch details, tokenomics, and the official contract will live right here.</p>
      <a class="token-detail-link" href="#tokenomics">Explore the launch plan <span aria-hidden="true">↓</span></a>
    </div>
    <div class="rip-coin-scene" aria-hidden="true"><img class="rip-coin" src="${RIP_TOKEN_URL}" width="1254" height="1254" alt="" loading="lazy" decoding="async"><div class="coin-shadow"></div></div>
  </div>
  <div class="token-contract" id="rip-contract-details" tabindex="-1">
    <button type="button" class="contract-button" data-copy-ca ${address ? '' : 'aria-disabled="true"'} aria-describedby="contract-help"><span class="ca-label">CA:</span><span class="ca-address">${address || 'Coming soon'}</span><span class="ca-icon" aria-hidden="true">${address ? '⧉' : '↗'}</span></button>
    <p id="contract-help">${address ? 'Click to copy the full contract address. Always verify the address before trading.' : 'The official contract address will appear here after deployment. No $RIP contract has been published by RIPDEX yet.'}</p>
    ${buyUrl ? `<a class="token-detail-link" href="${buyUrl}" target="_blank" rel="noopener noreferrer">View $RIP on pons ↗</a>` : ''}
  </div>
  <div class="token-network"><div><span class="section-index">PLANNED LAUNCH</span><p>Powered by pons on Robinhood Chain</p></div><div class="network-logos"><a href="https://www.ponsfamily.com/" target="_blank" rel="noopener noreferrer" aria-label="pons official website"><img class="pons-logo" src="/art/brands/pons.png" alt=""><span>pons</span></a><a class="robinhood-logo" href="https://docs.robinhood.com/chain/" target="_blank" rel="noopener noreferrer"><img src="/art/brands/robinhood-chain.svg" alt="Robinhood Chain"></a></div></div>
  <div class="token-details" id="tokenomics">
    <div><span class="section-index">01 / THE LAUNCH</span><h3>One place for the real details.</h3><ol class="launch-steps"><li><span>01</span><div><h4>Publish the plan</h4><p>Supply, allocation, fees, and launch timing will be announced before launch.</p></div></li><li><span>02</span><div><h4>Launch through pons</h4><p>The planned launch venue is pons, a token launch protocol on Robinhood Chain. The final launch settings are still to be confirmed.</p></div></li><li><span>03</span><div><h4>Verify. Then explore.</h4><p>Find the official contract and token page here. Once published, Buy $RIP will copy the address and take you to the contract below the RIPDEX title.</p></div></li></ol></div>
    <div><span class="section-index">02 / TOKENOMICS</span><h3>The numbers come next.</h3><dl class="tokenomics-list">${['Total supply','Launch allocation','Team & vesting','Liquidity','Trading fees','Launch date'].map(label => `<div><dt>${label}</dt><dd>Coming soon</dd></div>`).join('')}</dl><p class="token-small">Final figures will be published once the launch configuration is confirmed.</p></div>
  </div>
  <div class="token-faq"><details><summary>Is $RIP live yet?<span aria-hidden="true">+</span></summary><p>The $RIP launch is coming soon. This page will publish the confirmed launch date, contract address, and tokenomics.</p></details><details><summary>Will $RIP be listed in the Robinhood app?<span aria-hidden="true">+</span></summary><p>The plan is a token launch on Robinhood Chain through pons. This does not announce a listing in the Robinhood brokerage app or an endorsement by Robinhood or pons.</p></details><details><summary>Is my demo $RIP balance an onchain token?<span aria-hidden="true">+</span></summary><p>No. The current demo balance is used to try pack openings and the collection experience. It is not an onchain balance, and no conversion or redemption has been announced.</p></details></div>
  <a class="token-brand-download" href="${RIP_TOKEN_URL}" download="rip-token-coin.png">Download the RIP token image <span aria-hidden="true">↗</span></a>
  <p class="token-source">Launch platform: <a href="https://docs.ponsfamily.com/v2" target="_blank" rel="noopener noreferrer">pons documentation ↗</a><span>Network: <a href="https://docs.robinhood.com/chain/" target="_blank" rel="noopener noreferrer">Robinhood Chain ↗</a></span></p>
</section>`;
}

export function tokenUI(env: Record<string, string | undefined> = process.env) {
  const { address } = tokenConfig(env);
  return `<div class="token-toast" id="token-toast" role="status" aria-live="polite" hidden></div><script>
(() => {
  const address = ${JSON.stringify(address)};
  const status = document.getElementById('token-toast');
  document.querySelector('[data-footer-binder]')?.addEventListener('click', () => document.getElementById('open-binder')?.click());
  let timer;
  const announce = message => { status.textContent = message; status.hidden = false; clearTimeout(timer); timer = setTimeout(() => status.hidden = true, 6000); };
  const copy = async () => {
    if (!address) return 'Contract address coming soon. Nothing copied.';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(address);
      return 'Contract address copied.';
    } catch { return 'Could not copy automatically. Select and copy the address below.'; }
  };
  document.querySelectorAll('[data-copy-ca]').forEach(button => button.addEventListener('click', async () => announce(await copy())));
  document.querySelectorAll('[data-token-buy]').forEach(link => link.addEventListener('click', async event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const message = await copy();
    const section = document.getElementById('rip-contract');
    if (section) { history.pushState(null, '', '#rip-contract'); section.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); section.focus({preventScroll:true}); announce(message); }
    else { try { sessionStorage.setItem('ripdex-token-notice', message); } catch {} location.assign('/#rip-contract'); }
  }));
  try { const notice = sessionStorage.getItem('ripdex-token-notice'); if (notice) { sessionStorage.removeItem('ripdex-token-notice'); announce(notice); } } catch {}
})();
</script>`;
}

export const TOKEN_CSS = `
.token-announcement{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-top:22px;padding:16px 0;border-bottom:1px solid var(--line-hi);font-size:12px;color:var(--text-3)}.token-announcement b{color:#b9b1ff;font-size:16px;margin-right:12px}.token-announcement>span:last-child{white-space:nowrap;color:#c9c5ff}.footer-links button{font:inherit;color:inherit;padding:0}.token-buy{display:inline-flex;align-items:center;justify-content:center;gap:16px;white-space:nowrap;min-height:38px;padding:0 17px;border-radius:8px;background:var(--accent);color:white;font-size:12px;font-weight:650;transition:background .2s,transform .2s}.token-buy:hover{background:var(--accent-hi);transform:translateY(-1px)}.token-buy:focus-visible,.contract-button:focus-visible{outline:2px solid white;outline-offset:4px}
.token-section{scroll-margin-top:130px;position:relative;margin:48px 0 0;padding:54px 48px 24px;background:linear-gradient(125deg,#141324,#0e0e13 62%);border:1px solid #292735;border-radius:20px;overflow:hidden}.token-section:focus{outline:none}.token-intro{display:grid;grid-template-columns:1.3fr 1fr;gap:30px;align-items:center}.token-copy h2{font-size:clamp(50px,6vw,88px);line-height:1;letter-spacing:-.07em;margin:20px 0}.token-copy h2 span{color:#aaa3ff}.token-lede{font-size:19px;color:var(--text-2);margin:0 0 12px;letter-spacing:-.025em}.token-description{font-size:13px;line-height:1.8;color:#a7a6b7;max-width:48ch}.token-detail-link{display:inline-flex;gap:20px;align-items:center;font-size:12px;margin-top:16px;color:#c9c5ff}.token-detail-link:hover{color:white}
.token-section .rip-coin-scene{position:relative;min-width:0;height:340px;display:grid;place-items:center}.token-section .rip-coin{display:block;width:min(100%,340px);height:auto;aspect-ratio:1;object-fit:contain;position:relative;z-index:1;filter:drop-shadow(0 18px 20px #0005);animation:ripCoin 8s ease-in-out infinite}.token-section .coin-shadow{width:55%;height:14px;background:#0008;filter:blur(12px);position:absolute;bottom:4px;border-radius:50%}@keyframes ripCoin{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-8px) rotate(0deg)}}
.token-contract{margin-top:40px;scroll-margin-top:130px}.token-contract:focus{outline:none}.contract-button{display:flex;align-items:center;gap:20px;text-align:left;width:100%;min-height:78px;padding:20px 24px;border-radius:10px;border:1px solid #6559a0;background:#252038;color:#d8d0ff;transition:background .2s,border-color .2s}.contract-button:hover{background:#302845;border-color:#aa99e4}.ca-label{font:600 20px ui-monospace,monospace}.ca-address{font:500 clamp(13px,1.7vw,22px) ui-monospace,monospace;overflow-wrap:anywhere;min-width:0}.ca-icon{margin-left:auto;font-size:24px}.token-contract p{font-size:11px;color:#a7a6b7;line-height:1.7;margin:10px 0 0}.token-network{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:28px 0 35px;border-bottom:1px solid var(--line-hi)}.token-network p{font-size:12px;color:var(--text-2);margin:7px 0 0}.network-logos{display:flex;gap:30px;align-items:center}.network-logos a{display:flex;align-items:center;gap:8px}.pons-logo{width:34px;height:34px;object-fit:contain}.network-logos a span{font-size:26px;font-weight:650;letter-spacing:-.06em}.robinhood-logo{background:#000;padding:16px 22px;border-radius:8px}.robinhood-logo img{width:162px;height:28px;object-fit:contain}
.token-details{display:grid;grid-template-columns:1fr 1fr;gap:70px;padding:36px 0;scroll-margin-top:130px}.token-details h3{font-size:23px;letter-spacing:-.04em;margin:12px 0 24px}.launch-steps{list-style:none;padding:0;margin:0}.launch-steps li{display:flex;gap:16px;padding-bottom:24px}.launch-steps li>span{font:11px ui-monospace,monospace;color:#a49bd4;line-height:21px}.launch-steps h4{margin:0 0 6px;font-size:13px}.launch-steps p,.token-small{margin:0;font-size:12px;line-height:1.8;color:#a7a6b7}.tokenomics-list{margin:0 0 16px}.tokenomics-list>div{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid var(--line-hi);font-size:12px}.tokenomics-list dt{color:var(--text-2)}.tokenomics-list dd{margin:0;font:11px ui-monospace,monospace;color:#b9aedb}.token-faq{border-top:1px solid var(--line-hi)}.token-faq details{border-bottom:1px solid var(--line-hi)}.token-faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:15px;font-size:13px;padding:18px 0}.token-faq summary::-webkit-details-marker{display:none}.token-faq details[open] summary span{transform:rotate(45deg)}.token-faq p{font-size:12px;line-height:1.8;color:#a7a6b7;max-width:78ch;margin:0 0 20px}.token-source{display:flex;gap:25px;font-size:10px;color:#a7a6b7;margin:22px 0 0}.token-source a{color:#c9c5ff}.token-toast{position:fixed;z-index:1000;left:50%;bottom:24px;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 32px);padding:14px 20px;border-radius:10px;border:1px solid #6559a0;background:#201c32;color:#eee8ff;font-size:12px;box-shadow:0 8px 32px #0008}.token-toast[hidden]{display:none}
.header-tools{gap:8px}.header-search{min-width:38px}.header-search .search-label,.header-search kbd{display:none}.header-binder span{font-size:11px}header.top{padding-left:max(24px,calc((100vw - 1440px)/2));padding-right:max(24px,calc((100vw - 1440px)/2))}.breadcrumbs{display:flex;flex-wrap:wrap;gap:9px;align-items:center;font-size:12px;color:var(--text-3);margin:0 0 25px}.breadcrumbs a:hover{color:var(--accent-hi)}.catalog-shortcuts{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 24px}.catalog-shortcuts a{font-size:12px;padding:8px 12px;border:1px solid var(--line-hi);border-radius:6px}.catalog-shortcuts a:hover{border-color:var(--accent)}
@media(max-width:1050px){header.top{gap:16px}.header-binder span{display:none}.token-network{align-items:flex-start;flex-direction:column}.token-details{gap:35px}}
@media(max-width:760px){header.top{padding:0 16px}.header-tools{gap:7px}.header-tools .header-binder{display:inline-flex;padding:0;width:32px;min-width:32px}.token-buy{min-height:36px;padding:0 12px;gap:8px;font-size:11px}.token-section{padding:30px 22px 22px;margin-top:28px;border-radius:14px;scroll-margin-top:154px}.token-intro{gap:10px;grid-template-columns:1fr}.token-copy h2{font-size:64px}.token-lede{font-size:17px}.token-section .rip-coin-scene{height:240px;margin-top:8px}.token-section .rip-coin{width:min(100%,240px);height:auto}.token-section .coin-shadow{width:145px;bottom:5px}.token-contract{margin-top:22px;scroll-margin-top:154px}.contract-button{padding:17px 16px;min-height:72px;gap:12px}.ca-address{font-size:16px}.ca-label{font-size:16px}.ca-icon{font-size:18px}.network-logos{gap:20px;width:100%;justify-content:space-between}.robinhood-logo{padding:12px}.robinhood-logo img{width:130px;height:24px}.network-logos a span{font-size:22px}.pons-logo{width:27px;height:27px}.token-details{grid-template-columns:1fr;gap:20px;scroll-margin-top:154px}.token-source{flex-direction:column;gap:10px}.token-network{padding-bottom:24px}.token-faq summary{font-size:12px}}
@media(max-width:360px){header.top{padding:0 12px}.header-tools{gap:5px}.token-buy{padding:0 10px}.token-section{padding:25px 16px}.network-logos{gap:12px}.robinhood-logo img{width:112px}.network-logos a span{font-size:20px}.token-copy h2{font-size:56px}}
@media(prefers-reduced-motion:reduce){.token-section .rip-coin{animation:none}.token-buy,.contract-button{transition:none}}
`;
