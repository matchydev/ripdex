# RIPDEX design handoff

Design work on `ripdex-upgrades`, based on Claude's restore point `3cb33a3`.

## Direction

Graphite surfaces, the existing violet brand, oversized RIPDEX typography, and physical card artwork. The homepage runs from a full-width brand and pack stage to pack selection, chase cards, recent pulls, an explanation of opening, and a final catalog action. Motion retains the independent pack placement/float/depth layers, adds staggered section entrances, and lifts artwork on hover.

## Changes

- `apps/web/src/home.ts`: rebuilt the homepage, preserved the layered pack scene and wrapper lookup, made each pack link to its own opening route, and shortened the grail rail. Live pulls still read the ledger; an empty ledger shows an honest empty state.
- `apps/web/src/design.ts`: shared navigation, footer, typography, focus treatment, responsive grids, quieter backgrounds, and improved secondary-text contrast. Reveal visibility now requires the runtime's `motion-ready` class, so server-rendered content remains visible without JavaScript.
- `apps/web/src/render.ts`: semantic navigation/main landmarks; searchable catalog with secondary filters in a native disclosure; labeled controls and loading status; cancellation of stale filter requests; recoverable request errors; contained tables on narrow screens; artwork-led case gallery.
- `apps/web/src/wallet-pages.ts`: feed spacing and restrained collection statistics, retaining the physical binder and all collection behavior.

Gameplay, the reel, audio, grading, economics, art generation, catalog data, and pack odds calculations were not changed. No new dependencies.

## Integration

Pull `ripdex-upgrades` before continuing. Keep gameplay changes in `rip-page.ts` / `rip-engine.ts` and their underlying systems. The four presentation files above contain this pass. `design.ts` is shared: its original violet/background tokens and depth primitives remain compatible.

Use `pnpm web` for a local preview (default port 4179). The MacBook review used `PORT=4180 pnpm web` because 4179 was occupied. That localhost address is local to the MacBook; it is not a deployment or a connection to the desktop.

New pack wrappers continue to work through the existing `packWrappers()` lookup. Packs without wrappers use existing card artwork.

## Validation

- Existing core suite: 186 passing tests.
- All eight page routes returned HTTP 200; their inline scripts parsed successfully.
- Browser review at desktop width (1440), mobile (390), and narrow mobile (320).
- Search for Charizard returned 8 cards; combining Base set returned its single Charizard; reset returned 603 cards; an unmatched query showed the empty state.
- Pack-specific links and odds anchors verified; card-detail variant values retained ($258.06 / $99.06 for Jungle Jolteon).
- Inspected the populated mobile binder, feed, pack gallery, and grail page. Checked page widths for horizontal overflow and fixed the card-detail grid/table overflow.
- Local QA uses 240 synthetic demo-wallet rips from the existing seed script. The ignored ledger is not committed or pushed.

Wallet auth and chain settlement remain separate unfinished systems described in `HANDOFF.md`. No production deployment was performed.
