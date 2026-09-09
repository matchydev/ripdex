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

## Fourth pass — RIP token identity

Created a custom beveled violet R with a diagonal pack-tear notch using the built-in image generator. The original transparent PNG is committed at `public/art/brands/rip-r-v1.png`; prompt and provenance are in the adjacent README. `brand.ts` centralizes markup, favicon links, and responsive brand styling.

Replaced the old lightning/dot mark in both header implementations. Applied the new R to the footer, homepage announcement and desktop kicker, token coin, desktop Buy button, demo balance, and rip card back. A download link in the token section serves the original artwork. All catalog, packs, grails, live, binder, detail, home and rip routes share the identity. Small mobile controls retain enough space by hiding only the decorative Buy-button icon. Also constrained the rip screen's select grid/specs to the available width.

Validation: all nine existing web tests pass; eight routes return 200, include the brand/favicon, and have parseable scripts. The PNG returns 200 with image/png. Browser review confirms image loading, readable headers and token artwork at desktop and narrow mobile widths. No token or gameplay logic changed.

## Fifth pass — integration with Claude's themed wrappers

Pulled Claude's `cf09e8e` and merge `886ed7e`. All six wrappers resolve on the homepage, library, previews, comparison and opening screens while preserving RIP branding and the launch controls.

- Pack filters now persist in `packSearch`, `packSet` and `packSort` query parameters. Search/set/sort restore on load, history navigation and page restoration; invalid values normalize; reset preserves unrelated parameters, hash and history state. Three browser-script tests cover these behaviors.
- Artwork responses include weak ETags and support conditional requests. Validated matching weak/strong/list/wildcard conditions return bodyless 304; mismatches return the image. A directory is not treated as an image.
- Wrapper lookup prefers WebP when a sibling exists, retains PNG fallback, and checks actual files. No artwork was regenerated or recompressed in this pass.
- The rip screen preloads its actual displayed wrapper, and both odds links target the current pack. The select screen reserves room for the persistent header and sizes its wrapper to the available height. Fixed the mobile header's bottom inset so its transparent box no longer stretches across the screen and intercepts pack controls.

198 tests pass (186 core + 12 web). Also verified all six opening routes use their wrappers and correct odds/preload URLs, conditional image responses, search/set/sort restoration and clearing in the browser, and desktop/mobile wrapper placement.

### Next handoff to Claude

The next useful work in the art/system lane:

1. Produce smaller WebP delivery versions of the existing wrappers, keeping the original PNG masters. Six current PNGs total about 17 MB. `public/art/packs/<packId>.webp` and `grail-pack.webp` are now preferred automatically; retain each existing composition and alpha. Target a useful display size around 768 px tall, and verify the result visually. A separate thumbnail pipeline can follow if warranted.
2. Continue the authored achievement-medal brief. The grail-vault environment arrived in `a3268a7` during this integration and is now included. Use the shared RIP mark from `public/art/brands/rip-r-v1.png` where branding is needed; keep pons and Robinhood Chain marks outside collectible/token artwork.
3. Before any real-money integration, address the existing documented authentication and persisted nonce/seed-rotation work. The launch remains Coming soon and demo balances remain separate.

Pull `ripdex-upgrades` before editing, preserve `brand.ts` / `token.ts` and the discovery behavior, then push the art/system changes to the same branch. This handoff is repository-based; no direct desktop Claude session was controlled.

Late integration: rebased cleanly onto Claude’s `a3268a7` grail-vault environment. Combined tests and route/script checks pass. The mobile RIP button was also verified with a DOM hit test: the header ends at 77px and no longer covers the button.

## Sixth pass — Pokémon hero scene

The user asked for animated Pokémon behind the homepage packs, specifically Charizard breathing fire and Poké Balls. The hero now uses a prominent transparent Charizard with gently animated breathing, layered SVG fire, drifting embers, warm firelight, and two floating Poké Balls. The headline explicitly says Pokémon. Desktop and mobile layouts keep the character recognizable above the existing foil packs and maintain clear text/action areas.

- `pokemon-hero.ts` owns the decorative scene and its motion control. The character and fire share one animated coordinate frame so the flame stays attached. The artwork is separate from the existing interactive 3D pack layers.
- Pause/Play persists for the browser session. Reduced motion disables the new animation and labels the control Motion off; offscreen and hidden-tab scenes suspend automatically. The scene is decorative to assistive technology, and its layers do not intercept clicks.
- Fixed an existing 3D hit-testing issue: the zero-depth stage intercepted clicks on both negative-depth side packs. The stage now passes pointer events through while each pack link remains interactive. All three links were verified by DOM hit tests at narrow and wider widths, and the side pack successfully navigated to `/rip/151-rip`.
- The custom image-generation attempt failed. The shipped, unmodified 512px Charizard HOME PNG comes from PokeAPI’s sprites repository, with provenance in `public/art/characters/README.md`. It is 130,368 bytes. Do not describe this as newly generated artwork.

Validation: 198 existing tests pass. Reviewed the hero at 320, 390, 768, 1024 and 1440 pixels with no horizontal overflow. Verified Pause/Play and its persistence after reload, featured-pack preview, actual side-pack navigation, loaded artwork, and no browser console errors. The motion runtime was additionally checked for reduced-motion changes, hidden-tab suspension, and unavailable session storage. Six page routes returned 200 and all executable inline scripts parsed; the character asset returned image/png.

Claude: pull `ripdex-upgrades` before further art edits. Preserve this new hero scene and the shared RIP branding. The earlier WebP wrapper/achievement work remains the next independent art lane. This pass changes presentation only; no ledger, odds, balance, or launch configuration changes.

Late integration: rebased onto Claude’s `dbf70ab` / `c367881` sale celebration. The combined 198 tests pass and both homepage/opening scripts parse. Adjusted that new celebration for reduced motion: skip the coin burst and show the profit text without travel or scaling, instead of compressing the full animation into 0.2 seconds. The sale calculation and feedback content are unchanged.

## Seventh pass — cleaner RIP token identity

The user requested a stronger replacement token image and disliked the text on the coin. Generated `public/art/brands/rip-r-v2.png`: an upright, broad sculpted R with silver-lavender faces and violet edges. The original 1254px transparent PNG is preserved, and the prompt is recorded in the brands README. `brand.ts` now uses v2 for every shared mark, favicon, download and the opening screen. V1 remains only as the previous design asset.

Removed both coin text overlays, the dashed inner circle and the busy purple coin face. The new presentation uses a simple graphite surface, restrained violet metal rim, slight tilt, and gentle motion with reduced-motion support. Coming soon and the launch information remain in the surrounding page content.

Validation: 12 web tests pass. All eight main page routes return 200, reference v2, and contain parseable scripts. The PNG serves correctly; desktop 1440px and mobile 320px reviews show the loaded new mark and no horizontal overflow. Coin text content is empty. No launch settings or gameplay logic changed. Claude’s `b3c03c1` achievement artwork is included in this integration.

## Follow-up — navigation order and hero contract

The user requested Packs before Pokédex; the shared desktop/mobile navigation and footer now follow that order. They also requested CA directly below the large RIPDEX title. `tokenHeroContract()` renders that hero control using the same validated configuration and copy handler as the detailed token section. The hero now owns the single canonical `#rip-contract` target, so the persistent Buy button reaches it from every page. The lower contract details use `#rip-contract-details`. Both currently show Coming soon, and no placeholder is copied. Mobile artwork is repositioned to leave room below the title.

Validation: 12 web tests pass. Browser checks confirm direct placement under the title, no horizontal overflow at 320/1440px, one canonical anchor, and header Buy navigation both within the homepage and from `/packs`, with the expected Coming soon notice. Full configured addresses can wrap; the complete value remains available for copying.

## Eighth pass — collection and pack-inspection workflows

The user asked to keep improving the site. This pass completes Claude's medal handoff and makes browsing existing information easier:

- `wallet-pages.ts` displays the standard and Grail medals with explicit locked/unlocked text and accessible progress bars. Gold maps only to core achievement ID `GRAIL_HUNTER`. Collection sections have jump links, each set links to its catalog, unavailable binder pages use disabled controls, and empty collections retain their physical binder while explaining what appears there. Sort/pagination links return to the binder section. Upper-page spacing is tighter.
- `pack-explorer.ts` adds search within each pack's outcomes and Probability / Value / Name sorting. Search includes card names, printings, sets, card numbers and variant IDs; counts and reset/empty states update in place. Null values sort last, zero remains a priced value, and displayed probabilities remain the original pack probabilities. Each newly opened preview starts fresh. Full odds and Go to pack remain in a persistent dialog footer on mobile and desktop.
- `binder-lookup.ts` remembers the last five unique explicitly opened binders in local storage, offers direct links and Clear, validates stored addresses before rendering, and tolerates blocked/malformed storage. Pasted addresses are trimmed before validation. The shared lookup now focuses its address field immediately. This remains public, read-only lookup and does not connect a wallet.
- `art-direction/ASSET_MANIFEST.md` now records the completed medal integration and the current RIP R v2. Smaller delivery assets remain the next independent task for Claude's art lane.

Validation: 211 tests pass (186 core + 25 web), including 13 new tests for collection boundaries/medals/progress, preview filtering/sorting/reset, and recent-binder validation/privacy controls. Nine routes return 200 and all executable inline scripts parse. Both medal assets serve correctly. Browser checks covered populated and empty binders, real artwork/progress, section navigation, disabled pagination, pasted lookup addresses, remembered/cleared binders, filtered/sorted/reset pack previews, persistent action visibility, and 320px/1440px layouts with no horizontal overflow or console errors. No ledger or monetary calculation changed; browser QA did not open or sell any packs.

Claude: pull the shared branch before your next changes. Preserve the user-requested Packs-before-Pokédex order, CA immediately below the RIPDEX title, R v2 branding, and Pokémon hero. The medal family is implemented now; use the asset manifest for remaining art tasks.

## Follow-up — full main token artwork

The user pointed out that the main token still needed updating. Replaced its CSS coin frame with a complete generated silver/violet metal coin using the R v2 identity, with no small lettering. `RIP_TOKEN_URL` in `brand.ts` is the full coin; `RIP_MARK_URL` remains the matching standalone site mark. The $RIP section and Download the RIP token image link now use the same full coin asset. Original transparent 1254px PNG and generation prompt are recorded in the brands README.

Validation: all 25 web tests pass. Browser checks at 320px and 1440px confirm the full coin loads, the download points to it, no horizontal overflow, and no console errors. Existing reduced-motion rule still disables the coin animation. No launch configuration or financial behavior changed.
