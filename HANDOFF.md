# RIPDEX — handoff

Everything a fresh session needs to keep building. Read this before touching code.

**Repo:** https://github.com/matchydev/ripdex (private, owner `matchydev`)
**Stack:** Node 22.6+, TypeScript run directly with no build step, **zero dependencies**.

```bash
git clone https://github.com/matchydev/ripdex.git && cd ripdex
pnpm setup     # checks Node, reports catalog, seeds the rip ledger
pnpm web       # http://localhost:4179
pnpm test      # 186 tests
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
luxury-collectible feel. Not a toy site.

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
  src/design.ts   THE design system — tokens, 3D primitives, motion runtime
  src/render.ts   layout(), tile(), Pokedex, card detail, grails, packs
  src/home.ts     homepage + the 3D pack scene
  src/wallet-pages.ts  live feed + collection binder
  src/card-stats.ts    the RIPDEX DATA block on card pages
  src/rip-page.ts      the rip experience (self-contained, no layout())
  src/rip-engine.ts    server side of a rip
  packs/          pack configs; generate.ts pins pools to JSON
  scripts/seed-rips.ts drives real openPack calls to seed the ledger
```

### Routes

| Route | What |
|---|---|
| `/` | hero, 3D pack scene, stats, live ticker, grails, how it works, provably fair |
| `/cards` | Pokédex — search, 8 filters, 7 sorts, infinite scroll |
| `/pokemon/:set/:number` | card page: every variant priced + RIPDEX DATA |
| `/grails` | everything over the grail threshold |
| `/packs` | visual odds, exact table, expected value per rip |
| `/rip/:packId` | the rip: tear, flip, tier-scaled reveal, grail takeover |
| `/live` | every rip, newest first, prominence by tier |
| `/collection/:wallet` | 3×3 binder, set completion, duplicates, achievements |
| `POST /api/rip` | runs the real §17 sequence, records to ledger |

---

## 4. The design system (`apps/web/src/design.ts`)

Tokens are the owner's, verbatim. Do not drift from them.

```
--bg #08090a      never pure black        --text #f7f8f8   never pure white
--accent #7170ff  ONE accent (violet)     --ease cubic-bezier(0.16,1,0.3,1)
```

Body weight 510, display 590, letter-spacing -0.033em to -0.045em, line-height 1.0.
**Shadow-as-border** (`box-shadow: 0 0 0 1px var(--line)`), never a literal 1px border, so
nothing shifts a pixel on hover.

**One accent means one.** Violet is every button, link, focus ring and active state. Two
exceptions exist and are semantic, never decorative, never on a control:
`--gold` = grail-tier VALUE only. `--em` = "a pricing provider confirmed this" only.

### Motion (opt-in via data attributes; the runtime is in design.ts)

```
data-reveal | data-reveal-3d | data-reveal-group="55" | data-tilt="0.8"
data-depth="1" + child [data-layer="24"] | data-spotlight
data-count="1234" data-count-dp="2" data-count-prefix="$"
data-magnetic="0.3" | data-marquee (+ inner .track) | data-parallax="0.15"
```

**⚠ The bug that will bite you:** `[data-reveal]` and `[data-reveal-3d]` start at
`opacity: 0`. Anything injected after page load that nobody scans stays **invisible forever**.
Call `window.RIPDEX_MOTION.scan(root)` on inserted markup. The Pokédex grid does this. The
failure mode is a blank catalog, not a missing flourish.

### Real 3D, not a tilt on a flat div

`.card3d` stacks planes at different Z (art 0, rim 2, gloss 18, badges 34), and `[data-layer]`
children of `[data-depth]` counter-drift as the parent turns. **That inter-plane parallax is
the entire difference** between an object with thickness and a rotated picture.

Two traps, both already hit once:
- A `perspective` **dies at the first descendant with `transform-style: flat`**. This silently
  flattened the whole collection binder — it looked like 3D markup and rendered as a 1.2%
  horizontal squash. Verify depth by *measuring* projected sizes, not by reading the CSS.
- `filter` or `opacity < 1` anywhere in the chain forces `flat` and collapses the space. Dim
  things on a leaf plane.

### Card presentation — measured off cardboard.markets

The owner said their cards looked cleaner with the same artwork. They do, and it is **not the
image source** (both serve 600×825 scans). It is four CSS facts:

```css
aspect-ratio: 63/88;          /* real card; must match the art or it letterboxes */
object-fit: cover;            /* contain was the letterboxing */
border-radius: 4.5% / 3.2%;   /* % on the IMAGE — tracks geometry at every size */
box-shadow: <colour-tinted ambient>, inset 0 1px 0 rgba(255,255,255,.16);
```

Plus: each tile carries `--art` and paints a blurred, saturated copy of its **own artwork**
behind it, so a Charizard pools amber and a Blastoise pools blue. That is what reconciles
bright warm scans with a dark violet page — each card brings its own bridge colour instead of
all of them fighting one accent. `cssUrl()` in `render.ts` escapes that URL; `esc()` alone is
**not** sufficient for a value entering `url()` inside a style attribute.

---

## 5. Traps that have already cost time

- **Node runs TypeScript in strip-only mode.** No constructor parameter properties
  (`constructor(private x: string)` is a SyntaxError), no enums, no decorators. All relative
  imports need explicit `.ts` extensions.
- **Backticks inside CSS comments** break the template literal the CSS lives in. Cost two
  broken builds.
- **An undefined CSS custom property does not fall back** — the whole declaration is invalid
  and silently does nothing. A token rename left three pages half-styled with no error
  anywhere. `design.ts` still carries compatibility aliases (`--ink`, `--surface`, `--faint`,
  `--muted`, `--line-2`); they can be deleted once a grep for those names comes back empty.
- **The public pokemontcg.io API 502s constantly** — 13–33 card failures per set sync. The
  provider distinguishes a genuine 404 from a transport error, and `syncPrices` reports
  `failed` separately from `skipped`. Do not re-conflate them; a swallowed 502 becomes a
  silently missing price.
- **The catalog IS committed** (1.7 MB) precisely because regenerating it is slow and lossy.
  The ledger is not (5.8 MB, rebuilds deterministically via `pnpm setup`).
- **Screenshots of this app mislead.** Reveals animate in, so the browser pane frequently
  captures a page mid-transition and it looks blank or broken. Verify via DOM/computed styles,
  not screenshots.
- **`git ls-remote --exit-code` reports failure for an empty repo**, which made a real,
  freshly-created GitHub repo look nonexistent. Cost a long detour.

---

## 6. State

Everything below is done, verified, and pushed.

- 186 tests passing; all 8 routes 200
- Catalog: 603 cards, 1,057 variants, 4 sets (base1, base2, sv3, sv3pt5)
- Ledger: ~6,200 seeded rips across 40 wallets, 3 packs
- Seeded rips are **real** — `seed-rips.ts` drives the actual `openPack` sequence and reveals
  the server seed so every one is recomputable. 6,000 rips produced exactly **one grail**,
  which is the published 0.0269% playing out, not a placed hero pull.

### Not built

- Wallet auth and the chain itself; `$RIP` is a number in a config
- `RipEngine`'s nonce counter is **in memory** — a restart replays nonces. The ledger treats
  the repeat as a retry rather than double-counting, but production needs a persisted
  per-clientSeed counter and a seed rotation schedule. Commented where it lives.
- The Postgres adapter is written and unit-tested against a fake client but has **never run
  against a live database**
- No OG image route yet, though `social.ts` renders the card
- No CDN/image derivatives (spec §21)

### The open thread

The owner's last unaddressed note: *"the website is not exciting enough."* A four-angle
research workflow was launched and stopped before finishing. The angles worth resuming:

1. **The case-opening reel** — CSGORoll/Hypedrop-style horizontal spinner that decelerates
   onto the winning card. We have nothing like it and it is the signature mechanic of the
   genre.
2. **Pokémon TCG Pocket's pack opening** — widely considered best-in-class; worth copying the
   beat structure.
3. **Gacha escalation** — the tell that signals rarity *before* the reveal.

One line the owner has not drawn but I would: **manufactured near-misses and fake urgency stay
out.** The excitement should come from the cards being genuinely valuable and the odds being
real — and they are; that grail is a true 1-in-3,700. Building fake tension into a product
whose whole pitch is verifiable fairness would undercut the thing that makes it good.
