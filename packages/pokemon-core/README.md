# @ripdex/pokemon-core

The parts of the Pokémon spec that are pure logic, built standalone so they drop
into the RIPDEX repo unchanged. Zero dependencies, TypeScript, runs on Node 22.6+
without a build step.

```bash
pnpm test                    # 47 tests, all passing
pnpm pokemon:sync:sets       # 174 sets
pnpm pokemon:sync:cards --set=sv3pt5
pnpm pokemon:sync:prices --set=sv3pt5
pnpm pokemon:verify-assets --set=sv3pt5
pnpm demo                    # reveal demo on http://localhost:4178
```

## What's here

| File | Spec | What it does |
|---|---|---|
| `src/types.ts` | §1 | Normalized `PokemonCard` / `PokemonSet` / `PokemonPriceReport` |
| `src/variant.ts` | §16, §4 | `CanonicalPokemonCardVariant`, foil treatment selection |
| `src/price.ts` | §16 | Variant-exact price resolution |
| `src/tiers.ts` | §7 | Tier bands + per-tier reveal choreography |
| `src/random.ts` | §17 | Commit-reveal provably-fair randomness |
| `src/odds.ts` | §3, §11 | Pack config, validation, exact odds table, weighted draw |
| `src/snapshot.ts` | §17 | Immutable snapshots + the opening sequence |
| `src/provider.ts` | §24 | Catalog / pricing / image-delivery seams |
| `src/store.ts` | §2 | The catalog read/write port |
| `src/stores/json-store.ts` | §2 | Working filesystem store |
| `src/ingest.ts` | §2 | The sync pipeline |
| `src/providers/pokemontcg.ts` | §2, §24 | pokemontcg.io adapter |
| `schema/postgres.sql` | §2, §16, §17 | Relational shape the JSON store stands in for |
| `demo/rip.html` | §4, §6, §7, §20, §21 | Working pack-rip reveal |

## The two decisions that matter

**1. Identity is `(set, number, finish, printing)` — never the card name.**

`variantId` is `base2|4|holofoil|1st-edition`. A pipe separator, because collector
numbers legitimately contain hyphens (`SWSH-12`) so a hyphenated id can't be parsed
back unambiguously.

This is not academic. Real numbers from the live API:

| Card | Variant | Market |
|---|---|---|
| Jungle Jolteon 4/64 | 1st Edition Holofoil | **$258.06** |
| Jungle Jolteon 4/64 | Unlimited Holofoil | **$99.06** |
| 151 Charmander 4/165 | Normal | $0.24 |
| 151 Charmander 4/165 | Reverse Holo | $0.41 |

Same set, same collector number. Getting the printing wrong on Jolteon doesn't just
misprice it — it moves it from Tier 3 to Tier 4.

`resolvePrice()` returns a discriminated result and **never falls back across
variants**. Ask for a shadowless price and you get
`{ok: false, reason: 'variant-not-priced'}`, not the unlimited figure wearing a
shadowless label. Falling back *within* a variant (market → mid → low) is allowed
and recorded in `quote.basis`, because those are three measurements of one product.

**2. Draw-then-price is structurally impossible, not merely discouraged.**

`openPack()` takes frozen snapshots and a seed. It has no provider handle, no
database, no clock beyond stamping the result — so there is no code path that could
fetch a price after drawing. It also refuses to run if *any* variant in the pool is
missing from the price snapshot, which removes the situation where you'd be tempted
to improvise a value for an unpriced pull.

```ts
const packSnapshot  = lockPackConfig(charizardChase);      // 3. lock config
const priceSnapshot = buildPriceSnapshot(quotes, {...});   // 1-2. lock prices
const result = openPack({ packSnapshot, priceSnapshot, inputs }); // 4-7.
```

Randomness is `HMAC-SHA256(serverSeed, "clientSeed:nonce:cursor")`, uniform derived
as `parseInt(hex.slice(0,13), 16) / 2**52` — the standard 52-bit method, so anyone
can re-verify a pull in any language without porting this code.

## The demo

`demo/rip.html` is the §6 sequence end to end: select → PACK LOCKED → ROLLING CARD
→ drag-to-tear → card back → tap → flip → tier-scaled choreography → grail takeover.

It mirrors the engine rather than faking outcomes: same variantId scheme, same
weighted selection, same HMAC float derivation, prices frozen before the draw.
`?force=<cardId>` pins an outcome for QA.

Verified working across the pool: Charmeleon reverse holo ($0.39, Tier 1),
Charizard ex SIR ($366.05, Tier 4, dimmed reveal), Base Set Charizard ($897.19,
GRAIL — full black takeover, sparks, gold edge glow).

Foil shaders are overlays composited *over* the source art with `mix-blend-mode`,
driven by `foilTreatmentFor(card, variant)`. Six treatments: normal, holo, reverse
holo (masked to leave the art window clear), full art, special illustration, gold.
They respond to pointer tilt, which is what sells them — a static screenshot
undersells the SIR and gold ones considerably.

Note the demo runs from a local server, not an Artifact: artifact CSP blocks
external images, and every card image comes from `images.pokemontcg.io`.

## Ingestion

Run against the live API: 174 sets, then 207 cards of 151, which fan out to **328
priced variants** — because most cards carry both a normal and a reverse holo
printing at genuinely different prices.

Idempotency is observable, not asserted. Every stage returns
`{inserted, updated, unchanged}`, and a repeat run must report zero inserted and
zero updated. Two things had to be fixed to make that actually true:

- **`source.fetchedAt` changes every fetch.** Compared naively, every card looked
  updated on every run. Cards are now compared with that field normalized out.
- **Confidence only ratchets up.** `sync:cards` can only derive `inferred`
  variants; `sync:prices` upgrades them to `reported`. Without a ratchet, running
  cards *after* prices silently downgraded every confirmed variant — and an
  `inferred` variant is one the schema refuses to let into a pack pool.

The sharpest bug the pipeline surfaced was in the provider, not the pipeline. Its
`catch { return null }` made a transient 502 indistinguishable from "this card has
no pricing", so two consecutive runs reported 17 and then 9 skipped and neither
looked wrong. `getPrices` now returns `null` **only** on a genuine 404 and throws
otherwise; `syncPrices` reports `failed` separately from `skipped`, and the CLI
exits non-zero. The same set then re-ran at `0 inserted, 0 updated, 329 unchanged,
0 unpriced` — the "skips" had been entirely swallowed API errors.

`pokemon:verify-assets` HEADs every card image, set logo and symbol. 209/209 clean
on 151. Worth running before any pack goes live: a pool entry whose art 404s
produces a blank card mid-reveal, which is the worst failure this product has.

## Not built

Everything else in the spec — `/cards`, `/grails`, `/collection/[wallet]`, card
detail routes, live feed, achievements, social image generation, the homepage, and
the Postgres store adapter (the schema is written; the adapter is not).

## Card back

`demo/rip.html` uses a RIPDEX geometric back, deliberately not a reproduction of any
existing card back. It's the slot an authorized asset drops into.

Partnership copy and logos are left as configuration per §23 — nothing legal is
hardcoded, and no partnership badge or claim is invented anywhere.
