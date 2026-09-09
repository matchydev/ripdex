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

## Second pass — interactive discovery workspace

The user requested a richer experience informed by established case-opening sites.

### Reference review

- [CSGORoll case catalog](https://www.csgoroll.gg/cases/): inspected its live UI and official catalog page. Useful patterns were adjacent search/filter controls, distinct case presentation, and the ability to inspect contents before opening.
- [HypeDrop](https://www.hypedrop.com/): inspected the live homepage. Useful patterns were category navigation, visual catalog groupings, and a separate activity column.

Applied those browsing and information patterns to RIPDEX's existing design language. No deposits, timed promotions, wagering streaks, automatic repeat openings, or gameplay changes were added.

### Added

- `pack-explorer.ts`: shared homepage/pack-page library with set filters, Pokémon search across pack contents, exact bigint price sorting, native content-preview dialogs, and a two-pack comparison tray/dialog. Every outcome includes the card number, variant, reference value, and published probability; most likely outcomes appear first. Comparison includes range and mean reference value per draw, with USD distinguished from the $RIP pack price.
- `workspace-ui.ts`: shared live card search (`/` or Cmd/Ctrl-K), direct catalog-result links, and read-only binder lookup. Search is debounced and cancels stale requests.
- Homepage: compact layered pack showcase, recent activity sidebar, illustrated set links, and manual controls for the card rail.
- Catalog query parameters initialize the filters and persist in the URL, so search and set shortcuts are real deep links.
- Ticker pause/resume stops movement and refresh while paused; duplicated ticker items do not add duplicate keyboard stops.
- `server.ts`: only the `/packs` render call changed, passing the existing wrapper lookup into the shared explorer. Rip routes and API behavior are unchanged.
- Removed the superseded case-gallery renderer. `pnpm test` now runs both the core suite and `test:web`.

### Checks

189 tests passed (186 core + 3 preview tests). New tests cover exact variant values/weights, missing-price behavior, bigint preservation, and escaping JSON embedded in script markup.

Browser checks covered set and Pokémon pack filters, price sorting, empty/reset states, previews, comparison, global card search, query-param handoff, binder lookup, keyboard open/Escape, ticker pause/resume, and widths of 320, 390, and 1440 pixels. All eight page routes returned 200 and their executable scripts parsed. No browser console errors observed in the local review.

The preview still uses the ignored local demo ledger. No production deployment or account/chain connection was performed. The shared branch remains `ripdex-upgrades`.

Integration note: this pass was rebased cleanly onto Claude's `31020b2` (PSA grading + $RIP sell economy). The combined build passed all 189 tests and the eight-route/script checks again. Those gameplay changes remain Claude's work; this pass does not change their logic.

## Third pass — $RIP launch hub and site-wide navigation

The user requested $RIP on the homepage, pons/Robinhood Chain branding, a large CA control, a persistent header Buy button with clipboard copying, and a broader UX review. They explicitly confirmed that all unannounced launch details should say **Coming soon**.

- `token.ts` adds the homepage launch section, CSS coin illustration, planned launch steps, tokenomics placeholders, official venue/network logos, FAQ, and shared Buy/CA interactions. A compact announcement near the top of the homepage makes the section discoverable before the pack library.
- Buy $RIP appears on every page, including the standalone opening screen. It navigates directly to `/#rip-contract`, below the sticky header. Before deployment it copies nothing and reports Coming soon. Once the real public address is configured with `RIPDEX_TOKEN_ADDRESS`, it copies that exact address and exposes the corresponding pons token page. Malformed and zero addresses are rejected. Clipboard denial shows a manual-copy fallback; modified clicks retain native browser behavior.
- `RIPDEX_TOKEN_ADDRESS` is deliberately unset. No token supply, allocation, tax, vesting, liquidity, launch timing, or contract was invented. Publishing an address does not automatically change the launch text to Live: update the launch status, FAQ, and confirmed tokenomics together when deployment is actually verified.
- Official sources: [pons v2](https://docs.ponsfamily.com/v2), [Robinhood Chain](https://docs.robinhood.com/chain/), and [brand guidelines](https://docs.robinhood.com/chain/brand-guidelines/). Both network and launch venue remain described as planned. No Robinhood brokerage listing or endorsement is claimed. Current demo balances are clearly separate from onchain $RIP.
- Original logo assets and provenance live in `public/art/brands/`. Robinhood Chain's supplied white wordmark is displayed unmodified on black; it is not part of the RIP token artwork.
- Shared header search and binder controls use explicit SVG icons and accessible names. The binder remains accessible on mobile and from the footer. Binder pages no longer incorrectly mark Live as the active navigation item.
- Card details now have set/catalog breadcrumbs. Grails has a correctly parameterized link to the wider catalog sorted by value. The opening screen's odds link targets its actual pack table.
- Live Rips now refreshes on request, with an update hint after 30 seconds, rather than reloading the entire page and interrupting reading or dialogs.
- `rip-page.ts` changes are presentation only: persistent header/Buy, a demo-balance label, pack-specific odds link, and a narrow-screen width fix. Gameplay, balances, grades, sale calculations, randomization, and ledger mutations are unchanged.

Validation: 186 existing core tests and 9 web tests passed (195 total). Six new tests cover address validation, official token URL construction, no copying of placeholders, copy-before-navigation, denied clipboard access, and modified clicks. All eight page routes returned 200; inline scripts parsed; both logo assets served with correct MIME types. Browser checks covered mobile header/CA navigation from the rip screen, pack previews, binder lookup, live refresh, grail sorting, card breadcrumbs, token FAQ, and responsive layouts at 320, 390, and 1440 pixels. No production deployment or real token launch was performed.
