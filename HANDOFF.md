# RIPDEX — handoff

Everything a fresh session needs to keep building. Read this before touching code.

> **2026-09-14:** Codex is taking over to finish the site. Sections 1–6 below are the durable
> project brief (preserve them). **Section 7 is the latest state** — a big visual overhaul shipped,
> and it supersedes the older "open thread" / "State" notes where they conflict. Start at §7.

**Repo:** https://github.com/matchydev/ripdex (private, owner `matchydev`)
**Working branch:** `ripdex-upgrades` (PRs target `master`).
**Stack:** Node 22.6+, TypeScript run directly with no build step, **zero dependencies**.

```bash
git clone https://github.com/matchydev/ripdex.git && cd ripdex
pnpm setup     # checks Node, reports catalog, seeds the rip ledger
pnpm web       # http://localhost:4179   (or: node apps/web/server.ts)
pnpm test      # 186 core tests; web tests: node --test apps/web/test/*.test.ts (25)
```

The dev server is a foreground process. If a session ends, it dies with it — restart with
`pnpm web`. That is not a bug and not a disconnection.

---

## 1. What this is

A site where you spend a token (`$RIP`) to open a digital pack of **real Pokémon cards** and
keep what you pull. Card metadata, artwork and market prices are real, ingested from
pokemontcg.io. The owner has stated the product is being built with authorization to use
Pokémon IP; that is his claim to own, not something to re-litigate. What the code does do is
keep every provider swappable and every piece of partnership/legal copy in configuration
(`src/brand.ts`), so approved assets and wording drop in later without touching pages. **Do
not invent partnership badges, endorsements or legal text.**

The owner's register, in his words: *"Hyper-modern. Linear + Vercel + Framer. Gradient mesh,
tight type, heavy motion, 3D animation."* Adults who collected Pokémon as kids, crypto-native,
luxury-collectible feel. Not a toy site. He also judges by **looking at the rendered pixels** —
make bold, visible visual moves and verify them in a real browser; incremental token/motion
tweaks that don't change how it *looks* will not land.

---

## 2. The three invariants — break these and the product is wrong

### 2.1 A card's identity is `(set, number, finish, printing)`

Never its name, never its card id. Encoded as a pipe-delimited `variantId`:

```
base2|4|holofoil|1st-edition
```

Pipe, not hyphen, because collector numbers legitimately contain hyphens (`SWSH-12`).

This is not academic. Jungle Jolteon 4/64 is **$258.06** as a 1st Edition Holofoil and
**$99.06** as an Unlimited Holofoil — same set, same collector number, and the two land in
*different tiers*. Load `/pokemon/base2/4` to see it rendered.

`resolvePrice()` returns a discriminated result and **never falls back across variants**. Ask
for a shadowless price and you get `{ok:false, reason:'variant-not-priced'}`, not the
unlimited price wearing a shadowless label. Falling back *within* a variant
(market → mid → low) is fine and is recorded in `quote.basis`.

### 2.2 Prices are frozen before randomness is generated

`openPack()` (`src/snapshot.ts`) receives already-locked snapshots and a seed. It holds no
provider, no database handle, no clock beyond stamping the result — so there is physically no
code path that could price a card after drawing it. It also refuses to open if *any* pool
variant is unpriced, which removes the temptation to improvise a value.

Order is: lock prices → lock pack config → accept → generate randomness → draw → store.

Randomness is commit-reveal: `HMAC-SHA256(serverSeed, "clientSeed:nonce:cursor")`, uniform
derived as `parseInt(hex.slice(0,13),16) / 2**52`. Standard 52-bit method so anyone can
re-verify a pull in any language.

### 2.3 The ledger is immutable and achievements read it, never the market

A stored rip keeps the price that was frozen at rip time. A $900 Charizard drifting to $700
does not retroactively make last month's pull a $700 pull.

`achievements.ts` enforces this structurally: its catalog join is typed as `CardFacts`, a
`Pick` that **omits `headlineValue`**, so a predicate literally cannot reach today's price.
Same trick as `openPack`. Keep it.

> **UI corollary (new):** presentation work must NOT change pricing, odds, pool/pack config,
> ledger/economy, card-identity, grading math, or the pricing-provider logic. If a pool/weight
> changes, re-run `node apps/web/packs/generate.ts` and **bump `version`** in the JSON.

---

## 3. Layout

```
packages/pokemon-core/src/
  types.ts        normalized PokemonCard / PokemonSet / PokemonPriceReport
  variant.ts      CanonicalPokemonCardVariant, foil treatment selection
  price.ts        variant-exact price resolution (NO cross-variant fallback)
  tiers.ts        tier bands + per-tier reveal choreography
  random.ts       commit-reveal provably-fair randomness
  odds.ts         PackConfig, validation, exact odds table, weighted draw
  snapshot.ts     immutable snapshots + the opening sequence
  openings.ts     the rip ledger — collection/feed/achievements all read it
                  (BestPull / StoredOpeningCard live here — see §7 for #10)
  query.ts        catalog read model + browse queries
  collection.ts   binder pages, per-variant duplicates, set completion
  achievements.ts 11 achievements over the ledger
  feed.ts         live rip events, tier-driven prominence
  social.ts       1200x675 share SVG
  brand.ts        configurable partnership/legal copy (spec §23)
  ingest.ts       the sync pipeline
  store.ts        CatalogStore port
  stores/         json-store (working), postgres-store (written, never run live)
  providers/      pokemontcg.ts adapter

apps/web/
  server.ts       all routes; reads ONLY from the store, never a provider
  src/design.ts   THE design system — tokens, 3D primitives, motion runtime, global atmosphere
  src/render.ts   layout(), tile(), Pokedex, card detail, grails, packs, money()
  src/home.ts     homepage + the 3D pack scene
  src/pokemon-hero.ts  the hero atmosphere scene (Charizard silhouette, fire, embers)
  src/pack-explorer.ts /packs cards + the preview dialog ("The Chase" strip)
  src/wallet-pages.ts  live feed + collection binder + trophy shelf + slot()
  src/profile-ui.ts    top-right profile drawer (balance, P&L, vault, sell)
  src/card-stats.ts    the RIPDEX DATA block on card pages
  src/rip-page.ts      the rip experience (self-contained, no layout())
  src/rip-engine.ts    server side of a rip
  packs/          pack configs; generate.ts pins pools to JSON
  scripts/seed-rips.ts drives real openPack calls to seed the ledger
tools/            openai-art.ts, openai-edit.ts, generate-vibrant-packs.sh (pack wrapper art)
public/art/packs/ pack wrappers (grail-pack.png = featured)
```

### Routes

| Route | What |
|---|---|
| `/` | hero, 3D pack scene, stats, live ticker, grails, one-piece tease, how it works |
| `/cards` | Pokédex — search, 8 filters, 7 sorts, infinite scroll |
| `/pokemon/:set/:number` | card page: every variant priced + RIPDEX DATA + PSA ladder |
| `/grails` | everything over the grail threshold (crown band + wall) |
| `/packs` | visual odds, exact table, expected value per rip, preview dialog |
| `/rip/:packId` | the rip: tear, reel, tier-scaled reveal, grail takeover, trophy moment |
| `/live` | every rip, newest first, prominence by tier |
| `/collection/:wallet` | 3×3 binder, set completion, duplicates, achievements |
| `POST /api/rip` · `POST /api/sell` · `/api/profile` | the economy layer's endpoints |

---

## 4. The design system (`apps/web/src/design.ts`)

Tokens are the owner's, verbatim. Do not drift from them.

```
--bg #08090a      never pure black        --text #f7f8f8   never pure white
--accent #7170ff  ONE accent (indigo)     --accent-hi #828fff   --ease cubic-bezier(0.16,1,0.3,1)
--gold #f5c451    GRAIL / jackpot only     --em #4ade9b  value/success (green)   --warn #d8a44e  coming-soon amber
--spring cubic-bezier(0.34,1.4,0.64,1)     + type scale --fs-1..8, spacing --sp-1..9, radii --r-*
```

Body weight 510, display 590, letter-spacing -0.033em to -0.045em, line-height 1.0.
**Shadow-as-border** (`box-shadow: 0 0 0 1px var(--line)`), never a literal 1px border, so
nothing shifts a pixel on hover.

**One accent means one. DO NOT turn the site purple** (owner's #1 rule). Indigo is every button,
link, focus ring and active state; don't let it flood backgrounds. Two exceptions exist and are
semantic, never decorative, never on a control: `--gold` = grail-tier VALUE only; `--em` = value/
money-success only. The tier VALUE ramp is **neutral → `--em` green → `--accent-hi` indigo →
`--gold` grail** — there is no lavender/pink anywhere (a purge landed in `99b5cf7`; keep it).

### Motion (opt-in via data attributes; the runtime is in design.ts)

```
data-reveal | data-reveal-3d | data-reveal-group="55" | data-tilt="0.8"
data-depth="1" + child [data-layer="24"] | data-spotlight
data-count="1234" data-count-dp="2" data-count-prefix="$"    ← count-up engine (reduced-motion snaps)
data-magnetic="0.3" | data-marquee (+ inner .track) | data-parallax="0.15"
```

Gate every animation behind `prefers-reduced-motion`. For dynamically-injected numbers the
`data-count` scanner won't catch, tween manually — see `countTo()` (rip-page.ts) / `countBalance()`
(profile-ui.ts).

**⚠ The bug that will bite you:** `[data-reveal]` and `[data-reveal-3d]` start at `opacity: 0`.
Anything injected after page load that nobody scans stays **invisible forever**. Call
`window.RIPDEX_MOTION.scan(root)` on inserted markup. The failure mode is a blank catalog.

### Real 3D, not a tilt on a flat div

`.card3d` stacks planes at different Z (art 0, rim 2, gloss 18, badges 34), and `[data-layer]`
children of `[data-depth]` counter-drift as the parent turns. **That inter-plane parallax is
the entire difference** between an object with thickness and a rotated picture.

Two traps, both already hit once:
- A `perspective` **dies at the first descendant with `transform-style: flat`**. This silently
  flattened the whole collection binder. Verify depth by *measuring* projected sizes, not by reading CSS.
- `filter` or `opacity < 1` anywhere in the chain forces `flat` and collapses the space. Dim
  things on a leaf plane. (This is why the reveal card's slam-in animates `#holder`, and flanker
  packs dim on `.plane-art`, not on a parent.)

### Card presentation — measured off cardboard.markets

```css
aspect-ratio: 63/88;          /* real card; must match the art or it letterboxes */
object-fit: cover;            /* contain was the letterboxing */
border-radius: 4.5% / 3.2%;   /* % on the IMAGE — tracks geometry at every size */
box-shadow: <colour-tinted ambient>, inset 0 1px 0 rgba(255,255,255,.16);
```

Each tile carries `--art` and paints a blurred, saturated copy of its **own artwork** behind it,
so a Charizard pools amber and a Blastoise pools blue — each card brings its own bridge colour.
`cssUrl()` in `render.ts` escapes that URL; `esc()` alone is **not** sufficient for a value
entering `url()` inside a style attribute.

---

## 5. Traps that have already cost time

- **Node runs TypeScript in strip-only mode.** No constructor parameter properties, no enums, no
  decorators. All relative imports need explicit `.ts` extensions.
- **Backticks inside CSS/JS comments** break the template literal the code lives in. In client JS
  inside a page's `<script>`, avoid `${` and backticks — use string concatenation.
- **An undefined CSS custom property does not fall back** — the whole declaration is invalid and
  silently does nothing. A token rename left three pages half-styled with no error.
- **The public pokemontcg.io API 502s constantly.** The provider distinguishes a genuine 404 from
  a transport error; `syncPrices` reports `failed` separately from `skipped`. Don't re-conflate them.
- **The catalog IS committed** (1.7 MB) because regenerating it is slow and lossy. The ledger is not.
- **Screenshots of this app mislead.** Reveals animate in, so the browser pane frequently captures a
  page mid-transition and it looks blank/broken — AND a scrolled, backgrounded pane often won't paint
  reveal content at all. Verify via DOM/computed styles (`read_page`, `getComputedStyle`), and force
  reveals with `document.querySelectorAll('[data-reveal],[data-reveal-3d]').forEach(el=>el.classList.add('in'))`.
- **`data-count` numbers animate from 0 on load**, so a screenshot can catch a value/count mid-roll
  (e.g. "2 grails / $120" while rolling to "24 / $897"). Not a data bug.
- **Demo wallet is one-per-client by UA+IP.** `/collection/<seed>` reads the wallet keyed by that
  literal address, which can differ from the cookie/UA-resolved wallet where rips land — so a binder
  opened from the profile "Open full binder" link may render **empty**. To test economy/ledger/
  achievements, use an isolated server + an explicit `Cookie: ripdex_seed=<alnum>`.

---

## 6. Baseline state (as of the earlier handoff — still true)

- Catalog: 603 cards, 1,057 variants, 4 sets (base1, base2, sv3, sv3pt5).
- Ledger: seeded rips are **real** — `seed-rips.ts` drives the actual `openPack` sequence and reveals
  the server seed so every one is recomputable.
- **Not built:** wallet auth / the chain (`$RIP` is a number in config); `RipEngine`'s nonce counter
  is in-memory (a restart replays nonces — needs a persisted per-clientSeed counter + seed rotation
  for production); the Postgres adapter has never run against a live DB; no OG image route; no CDN.

---

## 7. Session update — 2026-09-14 (start here)

**Two arcs shipped this session:** (a) pack art + a 14-item UI/UX audit roadmap (13 of 14 done),
then (b) a **premium dark reveal-stage visual overhaul**. All on `ripdex-upgrades`, pushed, tests
green (186 core + 25 web).

### 7a. The current visual signature (extend it; don't fight it)
The site is now a **premium dark reveal-stage** — moody, focused, warm-and-cool lit, product-forward
(CS:GO case reveal). Shared pieces, all live:
- **Global atmosphere:** `.mesh` (design.ts, ~.15 opacity: indigo + a warm ember blob + cool tones)
  + `.atmos-vignette` framing every page. (`c299425`)
- **Content headers:** `.wrap:not(.home-wrap)::before` = soft accent light pool behind each page title. (`6beded1`)
- **Hero** (`pokemon-hero.ts` + `home.ts`): the Charizard is a dark, blurred **silhouette** lit by its
  own fire (depth of field); pokéballs hidden; packs are the crisp lit hero on a vignetted stage. (`f5e439e`)
- **Grail/tier language everywhere:** gold rim + flag for grails, count-up on the money that is the
  point of each page, proportionate light on good/rare pulls.

### 7b. The old "open thread" is largely addressed
The earlier handoff's biggest open note was *"the website is not exciting enough"* and specifically
the missing **case-opening reel**. That now exists: `/rip/:packId` has a weighted, decelerating
roulette reel → tear interaction → tier-scaled reveal with a card slam-in + tint flash, grail vault
takeover, mid-tier spark bursts, money count-up, coin burst on profit, and a trophy fanfare. Keep the
principle the previous author drew: **no manufactured near-misses or fake urgency** — the excitement
comes from real values and real odds.

### 7c. Roadmap: 13 of 14 done. The one left — #10: Best Pull as a card-art trophy
Turn the "BEST PULL" stat into a real trophy showing the **actual card art** beside value/name, on
the binder dashboard (`wallet-pages.ts` `.wstats`, ~line 547) and the profile drawer (`profile-ui.ts`
stat grid). Cut the duplicate stat tiles (UNIQUE VARIANTS / ACHIEVEMENTS already appear in the nav
pills). Add a one-time gleam; gold rim only when the best pull is grail-tier, accent otherwise.

**The real work (why it was deferred):** `BestPull.card` is a `StoredOpeningCard`
(`packages/pokemon-core/src/openings.ts`) carrying only `variantId`, `cardId`, `referenceValue`,
`currency`, `tier` — **no image or name** (the current code reads `bestPull.card.name`, which is
`undefined` at runtime). To render a card-art trophy you must **enrich** the best pull with catalog
art for display: join `bestPull.card.variantId`/`cardId` via `index.byVariantId` in `server.ts`
(collection route ~line 345 and `/api/profile` ~line 501), thread an enriched shape (image, name,
setId, number, tier) into `collectionPage`'s input type and `profile-ui.ts`, and reuse the `slot()`
plane-art/rim mini-stack in `wallet-pages.ts` for the visual. Display plumbing only — no economy change.

### 7d. Owner-greenlit "keep pushing" (optional, next)
Roll the premium treatment further: elevate the **rip page** and the **binder** to the reveal-stage
mood (they're lighter than the hero today), and go bolder on the hero if wanted (wordmark presence,
tasteful particles).

### 7e. Session commit list (newest first)
`3cb0efc` handoff · `6beded1` header light pools · `c299425` global atmosphere · `f5e439e` hero reveal
stage · `7c176fa` #14 case-wall ambient life · `ec8bad8` #12 trophy medals · `9ddb98f` #11 sell
celebration · `9242297` #9 pack jackpot + "The Chase" · `1fab197` #7/#8/#3/#2 rip reveal climax ·
`5accdda` #13 PSA bars · `29f912a` #2/#4/#5 count-ups + grail flags · `99b5cf7` #6 purple purge ·
`e885a1d` #1/#4 hero CTA + ledes · `2bd449e`/`6ecd26c`/`8201dfd` vibrant pack wrappers.

### 7f. Definition of done for UI work here
1. Visibly better in a **real browser** (screenshot it) — not just in the diff.
2. Cohesive with the dark reveal-stage signature; one accent; gold only for grails; no purple.
3. Reduced-motion safe.
4. No economy/odds/pricing/ledger logic changed.
5. Both test suites green.

---

## 8. Session update — 2026-09-28 (latest; start here)

All on `ripdex-upgrades`, pushed, tests green (186 core + 25 web).

### 8a. Pack-library cards are now CS:GO cases
`apps/web/src/pack-explorer.ts` — each case shows the pack wrapper as a prominent central "case"
with the pack's top-5 pull-able cards **fanned around it** (var-driven `--x/--a` rest + `--xh/--ah`
hover spread, `--fs` shrinks on mobile). Commits `0d4a70c` (fan), `2c90136` (earlier backdrop attempt).
Gotcha fixed: `.ep-art img{z-index:1}` out-specifies `.ep-front`, so the wrapper pinned its z inline.

### 8b. The wrapper "baked box" — masked, not regenerated
The wrapper PNGs (`public/art/packs/*.png`) bake a dark rectangular background behind the pack
(generated "transparent" but the model painted a box). Rather than regenerate, we **radial-mask the
wrapper edges** so only the pack shows:
- `/packs` cards: `.ep-art .ep-wrapper` mask (`cd98d12`).
- Hero 3D packs: stripped `.plane-slab` fill+ring, dropped the pack plane's `--panel` bg, masked
  `.plane-art.has-wrapper`, neutralised the `.plane-rim` inset ring (`f2faea7`).
- **NOT yet done on the rip page** (`rip-page.ts`, the big wrapper on the pre-rip screen) — same fix applies.

### 8c. Content expansion — 7 sets / 859 cards / 9 packs (`6465069`)
Ingested three classic sets and pinned a themed case for each:
- **Team Rocket** (base5) — Dark Charizard/Blastoise ($489)/Dragonite/Raichu.
- **Fossil** (base3) — Dragonite ($472), Gengar ($458), Lapras, the birds.
- **Neo Genesis** (neo1) — **Lugia $1,079.79** (catalog's new top grail), Typhlosion, Meganium.

How it was done (repeat this to add more sets):
```bash
cd packages/pokemon-core
node scripts/sync-cards.ts  --set=<setId>   # set metadata already in sets.json for dozens of sets
node scripts/sync-prices.ts --set=<setId>   # flaky: ~⅓ of cards 5xx; re-run, or accept (grails usually price)
# then add a recipe to apps/web/packs/generate.ts and:
cd ../.. && node apps/web/packs/generate.ts # pins pools; bump `version` if an EXISTING pool changes
```
Added a `sets: string[]` allowlist to `PackRecipe` + pinned KANTO STARTERS to its four original sets,
so a name-matched pool can't silently absorb newly-ingested cards (odds unchanged → no version bump).
The catalog is committed (expected). The provably-fair contract: **never change a shipped pack's pinned
odds without bumping its `version`.**

### 8d. What's LEFT (prioritised)
1. **Wrappers for the 3 new packs** — Team Rocket / Fossil / Neo Genesis currently fall back to their
   hero card (Dark Charizard / Dragonite / Lugia) instead of a foil wrapper. Generate three vibrant
   wrappers via the OpenAI pipeline to match the other six. **Uses the owner's OpenAI credits — confirm
   first.** How: `bash tools/generate-vibrant-packs.sh`-style calls (`node tools/openai-art.ts
   --prompt "…" --out public/art/packs/<packId>.png --size pack --transparent --quality high`), themed
   crimson-black / amber-bronze / silver-celestial. Files must be named `<pack.id>.png`
   (`team-rocket-rip.png`, `fossil-rip.png`, `neo-genesis-rip.png`) — server.ts `packWrappers()` keys on
   pack id. **Regenerating won't fix the baked box — mask it like §8b, or prompt harder for true transparency.**
2. **Rip page baked-box** (§8b) — apply the wrapper mask to `rip-page.ts`'s pre-rip pack.
3. **#10 Best Pull card-art trophy** (§7c) — still deferred; needs the bestPull enrichment described there.
4. Optional: apply the CS:GO fan / consistency to the **home "pack library"** section, and keep pushing
   the premium polish (rip page, binder).

Everything in §1–§6 (invariants, design rules, traps) still holds — read them.
