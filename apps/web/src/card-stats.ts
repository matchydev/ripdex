/**
 * The RIPDEX DATA block on a card page (spec §8): how often this card has been
 * pulled, when it last happened, which packs can produce it and at what odds.
 *
 * Everything here is per VARIANT. "Charizard has been pulled 14 times" is a
 * meaningless sentence in this product — the 1st Edition holo and the unlimited
 * holo are different cards with different odds, and collapsing them would let a
 * common printing borrow a rare one's scarcity.
 */

import type {
  CardListing,
  PackConfig,
  StoredOpening,
} from '../../../packages/pokemon-core/src/index.ts';
import { oddsTable, formatProbability } from '../../../packages/pokemon-core/src/index.ts';
import { esc, money } from './render.ts';

export interface VariantPullStats {
  variantId: string;
  label: string;
  timesPulled: number;
  lastPulledAt: string | null;
  /** Packs that can produce this variant, with the odds from each. */
  inPacks: { packId: string; packName: string; probability: number; label: string }[];
}

export interface CardPullData {
  variants: VariantPullStats[];
  totalPulls: number;
  recent: { openingId: string; wallet: string; openedAt: string; variantId: string; value: number }[];
}

/** Odds of each variant from each pack that contains it. */
export function packOddsFor(variantId: string, packs: PackConfig[]): VariantPullStats['inPacks'] {
  const out: VariantPullStats['inPacks'] = [];
  for (const pack of packs) {
    const row = oddsTable(pack.pool).find((r) => r.variantId === variantId);
    if (!row) continue;
    out.push({
      packId: pack.id,
      packName: pack.name,
      probability: row.probability,
      label: row.probabilityLabel,
    });
  }
  // Best odds first — a reader wants to know the cheapest route to the card.
  return out.sort((a, b) => b.probability - a.probability);
}

/** Abbreviate a wallet for display without implying it is a real address. */
export function shortWallet(w: string): string {
  return w.length <= 14 ? w : `${w.slice(0, 8)}…${w.slice(-4)}`;
}

export function relativeWhen(iso: string, now: number): string {
  const delta = now - Date.parse(iso);
  if (!Number.isFinite(delta)) return '—';
  // Clock skew between a server and a stored record is real; a future
  // timestamp should read as "just now", never as "-3 seconds ago".
  if (delta < 0) return 'just now';
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const CARD_STATS_CSS = `
<style>
.rx{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin:6px 0 4px}
.rx .b{border:1px solid var(--line);border-radius:11px;padding:13px 14px;background:var(--surface)}
.rx .b .k{font-size:9.5px;letter-spacing:.2em;color:var(--faint)}
.rx .b .v{margin-top:5px;font-size:19px;font-weight:800;font-family:ui-monospace,Menlo,monospace}
.rx .b .v.sm{font-size:13px;font-weight:600;font-family:inherit}
table.pulls{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px}
table.pulls th{text-align:left;font-size:9.5px;letter-spacing:.16em;color:var(--faint);
  font-weight:600;padding:0 12px 9px 0}
table.pulls td{padding:9px 12px 9px 0;border-top:1px solid var(--line)}
table.pulls td.n{font-family:ui-monospace,Menlo,monospace}
.noe{color:var(--faint);font-size:12.5px;padding:10px 0}
</style>`;

export function ripdexDataSection(card: CardListing, data: CardPullData, now: number): string {
  const everPulled = data.variants.filter((v) => v.timesPulled > 0);
  const lastAt = everPulled
    .map((v) => v.lastPulledAt)
    .filter((x): x is string => x !== null)
    .sort()
    .at(-1);

  const rippable = data.variants.filter((v) => v.inPacks.length > 0);
  const bestOdds = rippable
    .flatMap((v) => v.inPacks)
    .sort((a, b) => b.probability - a.probability)[0];

  return `
<h2 class="sec">RIPDEX DATA</h2>
<div class="rx">
  <div class="b"><div class="k">TIMES PULLED</div><div class="v">${data.totalPulls.toLocaleString()}</div></div>
  <div class="b"><div class="k">LAST PULLED</div><div class="v sm">${
    lastAt ? esc(relativeWhen(lastAt, now)) : 'Never'
  }</div></div>
  <div class="b"><div class="k">IN PACKS</div><div class="v sm">${
    // Deduped: two variants of one card commonly sit in the same pack, and
    // listing it twice reads as a rendering bug.
    rippable.length
      ? esc([...new Set(rippable.flatMap((v) => v.inPacks.map((p) => p.packName)))].join(', '))
      : 'Not rippable'
  }</div></div>
  <div class="b"><div class="k">BEST ODDS</div><div class="v sm">${
    bestOdds ? esc(bestOdds.label) : '—'
  }</div></div>
</div>

${
  rippable.length
    ? `<h2 class="sec">ODDS BY PACK</h2>
<table class="pulls">
  <thead><tr><th>PACK</th><th>VARIANT</th><th class="n">ODDS</th><th class="n">1 IN</th><th class="n">PULLED</th></tr></thead>
  <tbody>${rippable
    .flatMap((v) =>
      v.inPacks.map(
        (p) => `<tr>
      <td><a href="/packs">${esc(p.packName)}</a></td>
      <td>${esc(v.label)}</td>
      <td class="n">${esc(p.label)}</td>
      <td class="n">${Math.round(1 / p.probability).toLocaleString()}</td>
      <td class="n">${v.timesPulled.toLocaleString()}</td>
    </tr>`,
      ),
    )
    .join('')}</tbody>
</table>`
    : ''
}

<h2 class="sec">RECENT PULLS</h2>
${
  data.recent.length === 0
    ? `<div class="noe">Nobody has pulled this ${rippable.length ? 'yet' : 'card — it is not in any pack'}.</div>`
    : `<table class="pulls">
  <thead><tr><th>WALLET</th><th>VARIANT</th><th class="n">VALUE AT RIP</th><th class="n">WHEN</th></tr></thead>
  <tbody>${data.recent
    .map(
      (r) => `<tr>
      <td class="n">${esc(shortWallet(r.wallet))}</td>
      <td>${esc(data.variants.find((v) => v.variantId === r.variantId)?.label ?? r.variantId)}</td>
      <td class="n">${money(r.value)}</td>
      <td class="n">${esc(relativeWhen(r.openedAt, now))}</td>
    </tr>`,
    )
    .join('')}</tbody>
</table>`
}`;
}

/**
 * Gather pull data for one card. `formatProbability` is re-exported through the
 * odds module so callers do not need a second import.
 */
export function buildCardPullData(
  card: CardListing,
  packs: PackConfig[],
  counts: Map<string, number>,
  openings: StoredOpening[],
): CardPullData {
  const variantIds = new Set(card.variants.map((v) => v.variantId));

  const variants: VariantPullStats[] = card.variants.map((v) => {
    const relevant = openings.filter((o) => o.cards.some((c) => c.variantId === v.variantId));
    return {
      variantId: v.variantId,
      label: v.label,
      timesPulled: counts.get(v.variantId) ?? 0,
      lastPulledAt: relevant.map((o) => o.openedAt).sort().at(-1) ?? null,
      inPacks: packOddsFor(v.variantId, packs),
    };
  });

  const recent = openings
    .flatMap((o) =>
      o.cards
        .filter((c) => variantIds.has(c.variantId))
        .map((c) => ({
          openingId: o.openingId,
          wallet: o.wallet,
          openedAt: o.openedAt,
          variantId: c.variantId,
          value: c.referenceValue,
        })),
    )
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .slice(0, 8);

  return {
    variants,
    totalPulls: variants.reduce((s, v) => s + v.timesPulled, 0),
    recent,
  };
}

export { formatProbability };
