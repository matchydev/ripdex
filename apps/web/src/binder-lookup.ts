/** Recent public binder lookups stay on this device; never connect a wallet. */
export const BINDER_LOOKUP_JS = `<script>
(() => {
 const field = document.getElementById('binder-address');
 const form = document.getElementById('binder-form');
 const recent = document.getElementById('binder-recent');
 const list = document.getElementById('binder-recent-list');
 const notice = document.getElementById('binder-history-status');
 if (!field || !form || !recent || !list) return;
 const key = 'ripdex-recent-binders';
 const valid = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{4,128}$/.test(value);
 let addresses = [];
 try {
  const saved = JSON.parse(localStorage.getItem(key) || '[]');
  if (Array.isArray(saved)) addresses = [...new Set(saved.filter(valid))].slice(0, 5);
 } catch {}
 function render() {
  list.replaceChildren();
  recent.hidden = addresses.length === 0;
  addresses.forEach(address => {
   const item = document.createElement('li');
   const link = document.createElement('a');
   const label = document.createElement('span');
   const arrow = document.createElement('span');
   link.href = '/collection/' + encodeURIComponent(address);
   label.textContent = address;
   arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
   link.append(label, arrow);
   link.addEventListener('click', () => remember(address));
   item.append(link); list.append(item);
  });
 }
 function remember(address) {
  addresses = [address, ...addresses.filter(value => value !== address)].slice(0, 5);
  try { localStorage.setItem(key, JSON.stringify(addresses)); } catch {}
 }
 field.addEventListener('input', () => field.setCustomValidity(''));
 form.addEventListener('submit', event => {
  event.preventDefault();
  const address = field.value.trim(); field.value = address;
  field.setCustomValidity(valid(address) ? '' : 'Use 4–128 letters, numbers, colons, underscores or hyphens.');
  if (!field.reportValidity()) return;
  remember(address); render();
  location.assign('/collection/' + encodeURIComponent(address));
 });
 document.getElementById('binder-clear-recent').addEventListener('click', () => {
  addresses = [];
  try { localStorage.removeItem(key); } catch {}
  render(); field.focus(); notice.textContent = 'Recent binders cleared from this device.';
 });
 render();
})();
</script>`;
