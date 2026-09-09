/** One asset for the RIP token and the site's brand identity. */
export const RIP_MARK_URL = '/art/brands/rip-r-v2.png';
export function ripMark(className = ''): string {
  return `<img class="rip-mark ${className}" src="${RIP_MARK_URL}" width="40" height="40" alt="" aria-hidden="true" decoding="async">`;
}
export const BRAND_HEAD = `<link rel="icon" type="image/png" href="${RIP_MARK_URL}"><link rel="apple-touch-icon" href="${RIP_MARK_URL}"><meta name="theme-color" content="#08090a">`;
export const BRAND_CSS = `
.rip-mark{display:inline-block;object-fit:contain;flex-shrink:0;vertical-align:middle;width:40px;height:40px}
a.brand{gap:7px}.brand .rip-mark{width:38px;height:38px;margin-left:-5px;margin-right:-2px}.footer-wordmark{display:inline-flex;align-items:center;gap:6px}.footer-wordmark .rip-mark{width:36px;height:36px}.token-announcement>span:first-child{display:flex;align-items:center}.token-announcement .rip-mark{width:28px;height:28px;margin-right:8px}.hero-top .rip-mark{width:28px;height:28px;margin-right:8px}.hero .hero-top{display:flex;align-items:center;justify-content:flex-start}.rip-coin .rip-mark{width:76%;height:76%;position:relative;z-index:1}.back .sigil .rip-mark{width:84%;height:84%}.token-buy .rip-mark{background:#191529;border-radius:4px;width:21px;height:21px;margin:-3px -7px -3px -5px}.token-buy{gap:12px}.bal .rip-mark{width:24px;height:24px;margin:-4px 0 -4px -4px}.token-brand-download{display:inline-flex;align-items:center;gap:6px;font-size:10px;color:var(--text-3);margin-top:16px}.token-brand-download:hover{color:var(--text)}
@media(max-width:760px){.hero .hero-top{display:none}.brand .rip-mark{width:32px;height:32px}.token-buy .rip-mark{display:none}.token-announcement .rip-mark{width:24px;height:24px;margin-right:5px}.token-announcement b{margin-right:8px}.token-announcement{font-size:11px;gap:10px}}
@media(max-width:480px){#chrome .brand .rip-mark{width:25px;height:25px}#chrome .brand{gap:4px}.bal .rip-mark{width:18px;height:18px}}
`;
