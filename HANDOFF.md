# RIPDEX — Handoff for Codex

_Last updated 2026-09-14. Author: Claude (Opus 4.8). Codex is taking over to finish the site._

RIPDEX is a provably-fair Pokémon pack-ripping web app — "CS:GO case opening" for real Pokémon
cards, priced from reference values, paid in demo **$RIP**. This doc is the current state, the
rules you must not break, and what's left.

---

## 0. Orientation

- **Repo:** `matchydev/ripdex` · **working branch:** `ripdex-upgrades` (PRs target `master`).
- **App:** `apps/web` — a Node 22 HTTP server that server-renders HTML string pages. Entry: `apps/web/server.ts`.
- **Core domain:** `packages/pokemon-core` — catalog, pack engine, openings/ledger, tiers, grades, feed, achievements.
- **Run it:**
  ```bash
  node apps/web/server.ts        # serves http://localhost:4179
  ```
- **Tests (must stay green):**
  ```bash
  node --test apps/web/test/*.test.ts          # 25 web tests
  pnpm --filter @ripdex/pokemon-core test       # ~186 core tests
  ```
- Working tree is **clean** and fully pushed as of this handoff.

---

## 1. HARD RULES — do not violate

**Tech (Node 22 strip-only TypeScript):**
- No `enum`, no parameter properties (`constructor(private x)`), no decorators. Explicit `.ts`
  import extensions. **Zero runtime dependencies.** Pages are server-rendered template-literal
  strings with embedded `<style>` and client `<script>` blocks (the client JS uses string
  concatenation, not `${}`/backticks, to avoid clashing with the outer template literal).

**Design tokens** (`apps/web/src/design.ts`) — the whole visual system keys off these:
- ONE accent: `--accent` #7170ff / `--accent-hi` #828fff (indigo). **`--gold` #f5c451 is for GRAIL /
  jackpot moments ONLY.** `--em` #4ade9b = money/value/success (green). `--warn` #d8a44e = amber, for
  coming-soon/placeholder only.
- **DO NOT turn the site purple.** This is the owner's #1 rule. Indigo is the accent; don't let it
  flood backgrounds. There is no lavender/pink anywhere — the tier value ramp is
  **neutral → `--em` green → `--accent-hi` indigo → `--gold` grail** (see commit `99b5cf7`). Keep it that way.
- Type scale `--fs-1..8`, spacing `--sp-1..9`, radii `--r-*`, easing `--ease` / `--spring` (overshoot).

**Provably-fair economy — DO NOT touch as part of UI/art work:**
- Pack odds are **PINNED** in generated JSON (`apps/web/packs/generated/*.json`). If pools/weights
  change you must re-run `node apps/web/packs/generate.ts` and **bump `version`**. The engine validates
  odds at boot.
- Do NOT change pricing, odds, pool/pack config, ledger/economy, card-identity, grading math, or the
  pricing-provider logic to make something look better. UI work is presentation only.

**Motion & a11y:**
- Every animation must be gated behind `prefers-reduced-motion` (either a media block that neutralizes
  it, or a JS `reduceMotion` check).
- There's a **count-up engine** in `MOTION_JS` (design.ts): mark a server-rendered number with
  `data-count="<n>" data-count-prefix="$" data-count-dp="2"` and it rolls up on reveal (reduced-motion
  snaps to final). For dynamically-injected numbers (e.g. the rip reveal), tween manually — see
  `countTo()` in `rip-page.ts` and `countBalance()` in `profile-ui.ts`.

**OpenAI art pipeline (pack wrappers):**
- `OPENAI_API_KEY` is read ONLY via `process.env.OPENAI_API_KEY`, checked only as `Boolean(...)`.
  **Never** print, paste, commit, hardcode, or expose it anywhere (browser, API routes, docs).
- Wrappers live at `public/art/packs/<id>.png`, served at `/art/packs/<id>.png`; the featured pack
  uses `grail-pack.png` (via `FEATURED_PACK_ID`). Regenerate with `node tools/openai-art.ts` or the
  `tools/generate-vibrant-packs.sh` script. Use OpenAI for production art (not an internal generator).

**Git:** branch `ripdex-upgrades`; small, scoped, well-described commits; keep tests green; end commit
messages with `Co-Authored-By: <your attribution>`.

---

## 2. Current visual direction (keep it cohesive)

The site is a **premium dark reveal-stage** — moody, focused, warm-and-cool lit, product-forward
(think CS:GO case reveal). The owner judges by **looking at the rendered pixels**, not changelogs:
make bold, visible moves and verify them in a browser, not by reading code. Incremental token/motion
tweaks that don't change how it *looks* will not satisfy "make it look good."

The shared signature (all in place — extend it, don't fight it):
- **Global atmosphere:** `.mesh` (design.ts, opacity ~.15: indigo + a warm ember blob + cool tones) +
  `.atmos-vignette` framing every page. (`c299425`)
- **Content headers:** `.wrap:not(.home-wrap)::before` = a soft accent light pool behind each page
  title. (`6beded1`)
- **Hero** (`pokemon-hero.ts` + `home.ts`): the Charizard is a dark, blurred **silhouette** lit by its
  own fire (depth of field); pokéballs hidden; the packs are the crisp lit hero on a vignetted stage.
  (`f5e439e`)
- **Tier / grail language everywhere:** gold rim + flag for grails, `--em`/`--accent-hi` for good/rare,
  count-up on the money that is the point of each page.

---

## 3. What's shipped this session

Two arcs. First, **pack art + a 14-item UI/UX audit roadmap** (13 of 14 done), then a **premium
visual overhaul**. Key commits (newest first):

| Commit | What |
|---|---|
| `6beded1` | Content-page header light pools |
| `c299425` | Global dark-stage atmosphere (mesh + vignette) across every page |
| `f5e439e` | **Hero rebuilt** as a premium reveal stage (dragon → lit silhouette, packs = hero) |
| `7c176fa` | #14 Case-wall ambient life (staggered deal-in + grail breathing) |
| `ec8bad8` | #12 Trophy medals read as earned (glow + gleam + bob) |
| `9ddb98f` | #11 Sell celebration (balance count-up, green pop, emerald toast, card fade) |
| `9242297` | #9 Pack cards lead with "Top pull"; preview opens on a "The Chase" strip |
| `1fab197` | #7/#8/#3/#2 Rip reveal climax: value count-up, card slam-in, tier flash, mid-tier sparks, 2 chips |
| `5accdda` | #13 Card-detail PSA grade ladder as reveal-fill bars, reordered under masthead |
| `29f912a` | #2/#4/#5 Count-up payoffs, grid grail flags + rarity chips, chase ledes |
| `99b5cf7` | #6 Purge off-token purple; tier ramp on one accent + gold |
| `e885a1d` | #1/#4 Hero primary CTA "Rip the featured pack →"; cut stat-dump ledes |
| `2bd449e`, `6ecd26c`, `8201dfd` | Regenerated vibrant pack wrappers + featured-pack brightness lifts |

The full audit roadmap and per-item status also lived in the session scratchpad; the table above is the
durable record.

---

## 4. What's LEFT

### 4a. The one deferred roadmap item — #10: Best Pull as a card-art trophy
Turn the "BEST PULL" stat into a real trophy that shows the **actual card art** beside the value/name,
on two surfaces: the binder dashboard (`wallet-pages.ts` `.wstats`, ~line 547) and the profile drawer
(`profile-ui.ts`, the stat grid at top). Also cut the duplicate stat tiles (UNIQUE VARIANTS /
ACHIEVEMENTS are already in the nav pills), and add a one-time gleam; gold rim only when the best pull
is grail-tier, accent otherwise.

**Why it was deferred (the real work):** `BestPull.card` is a `StoredOpeningCard`
(`packages/pokemon-core/src/openings.ts`) which carries only `variantId`, `cardId`, `referenceValue`,
`currency`, `tier` — **no image or name**. The binder route passes raw `walletStats(address)` to
`collectionPage`, so the card image isn't available at render. To do #10 you must **enrich** the best
pull with catalog art for display: join `bestPull.card.variantId` (or `cardId`) via
`index.byVariantId` in `server.ts` (collection route ~line 345 and `/api/profile` ~line 501), and
thread an enriched shape (image, name, setId, number, tier) into `collectionPage`'s input type and
`profile-ui.ts`. This is display plumbing only — no economy change. Reuse the `slot()` plane-art/rim
mini-stack in `wallet-pages.ts` for the card visual. (Note the current code already reads
`bestPull.card.name`, which is `undefined` at runtime — enriching fixes that too.)

### 4b. Owner-greenlit "keep pushing" polish (optional, next)
The owner approved rolling the premium treatment everywhere. Still lighter than the hero:
- **Rip experience** (`rip-page.ts`) — it has its own starfield stage; elevate it to match the reveal-stage mood.
- **Binder** (`wallet-pages.ts`) — the 3D book is a strong hero; give it the atmospheric stage treatment.
- Bolder hero if wanted: wordmark presence, tasteful particles/dust for depth.

---

## 5. Known issues / gotchas (flagged, NOT yet fixed — verify before assuming they're bugs)

- **Demo-wallet isolation gotcha** (see memory `ripdex-wallet-test-isolation`): the demo wallet is
  one-per-client by UA+IP. `/collection/<seed>` reads the wallet keyed by that literal address, which
  can differ from the cookie/UA-resolved wallet where rips actually land — so a binder opened from the
  profile "Open full binder" link may render **empty**. Worth checking whether the profile link uses
  the correct resolved address. Test economy/ledger/achievements with an **isolated server + explicit
  `Cookie: ripdex_seed=<alnum>`**, not the shared demo wallet.
- **Achievements reflecting on binder/profile:** couldn't cleanly confirm that rip-time unlocks (e.g.
  "First Rip") show as unlocked on the binder/profile, because the wallet-isolation gotcha above
  confounds the repro. Verify with an isolated wallet before treating it as a bug.
- **Count-up red herring:** numbers with `data-count` animate from 0 on load, so a screenshot can catch
  e.g. the grails count or a value mid-roll (looked like "2 grails / $120" while rolling to "24 / $897").
  Not a data bug.

---

## 6. File map (where things live)

- `apps/web/server.ts` — routes, page assembly, wrapper lookup, `/api/rip`, `/api/sell`, `/api/profile`.
- `apps/web/src/design.ts` — tokens, global CSS, `.mesh`/`.atmos-vignette`, `MOTION_JS` (count-up + reveal + tilt).
- `apps/web/src/render.ts` — `layout()` shell, `tile()`, `cardsPage`, `grailsPage`/`grailTile`, `detailPage` (PSA ladder), `packsPage`, `money()`.
- `apps/web/src/home.ts` — home page + the 3D pack hero scene (`pack3d`).
- `apps/web/src/pokemon-hero.ts` — the hero atmosphere (Charizard silhouette, fire, embers).
- `apps/web/src/pack-explorer.ts` — `/packs` cards + the preview dialog (`preview()`, "The Chase" strip).
- `apps/web/src/rip-page.ts` — the rip/opening experience (reel, reveal, `fill()`, `countTo()`, sparks, trophy moment).
- `apps/web/src/wallet-pages.ts` — `/live` feed, `/collection/<wallet>` binder, `.wstats`, trophy shelf, `slot()`.
- `apps/web/src/profile-ui.ts` — top-right profile drawer (balance, P&L, vault, sell, `countBalance`).
- `apps/web/packs/generate.ts` + `apps/web/packs/generated/*.json` — pinned pack pools/odds.
- `packages/pokemon-core/src/` — `catalog`, `packs`/engine, `openings` (ledger + `BestPull`/`StoredOpeningCard`), `tiers`, `grades`, `feed`, `achievements`.
- `tools/openai-art.ts`, `tools/openai-edit.ts`, `tools/generate-vibrant-packs.sh` — art pipeline.
- `public/art/packs/*.png` — pack wrappers (`grail-pack.png` = featured).

---

## 7. Quick "definition of done" for UI work here
1. It looks visibly better in a **real browser** (not just in the diff). Screenshot it.
2. Cohesive with the dark reveal-stage signature; one accent; gold only for grails; no purple.
3. Reduced-motion safe.
4. No economy/odds/pricing/ledger logic changed.
5. Both test suites green.
