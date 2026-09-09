# RIPDEX

Onchain Pokémon pack ripping.

```bash
pnpm test                              # 184 tests
pnpm pokemon:sync:sets                 # import set metadata
pnpm pokemon:sync:cards --set=sv3pt5   # import cards, derive variants
pnpm pokemon:sync:prices --set=sv3pt5  # one price row per variant per day
pnpm pokemon:verify-assets --set=sv3pt5
pnpm web                               # the whole app on :4179
pnpm demo                              # pack-rip reveal on :4178
```

Node 22.6+ (TypeScript runs without a build step). No dependencies.

## Layout

```
packages/pokemon-core/   catalog model, variant identity, pricing, odds,
                         snapshots, ingestion, read model, ledger,
                         collection, feed, achievements, social, brand
apps/web/                home, Pokédex, card detail, grails, pack odds,
                         rip experience, live feed, collection binder
```

Catalog currently spans 4 sets, 603 cards, 1057 variants. `pnpm pokemon:sync:*`
pulls more; nothing is committed, so the first run on a clean checkout needs
`pokemon:sync:sets` before anything else.

`packages/pokemon-core/README.md` has the detail. The two load-bearing ideas:

**A card's identity is `(set, number, finish, printing)`.** Never its name. Jungle
Jolteon 4/64 is $258.06 as a 1st Edition Holofoil and $99.06 as an Unlimited
Holofoil — same set, same collector number, two tiers apart. Prices resolve from
that variant's own fields with no cross-variant fallback, ever.

**Prices are frozen before randomness is generated.** `openPack()` receives locked
snapshots and a seed, and holds no provider or database handle, so there is no code
path that could price a card after drawing it.

## Assets and branding

Card imagery currently comes from `images.pokemontcg.io` via a swappable provider.
Metadata, pricing and image delivery each sit behind their own interface so the
authorized partnership feed replaces them by configuration.

No partnership badge, claim or legal copy is hardcoded anywhere. Per spec §23 that
text belongs in configuration, to be supplied by legal/brand.

## Routes

| Route | Spec | What it is |
|---|---|---|
| `/` | §19 | Hero, three packs, live pulls, grails, provably fair |
| `/cards` | §9 | Pokédex — search, 8 filters, 7 sorts, infinite scroll |
| `/pokemon/:set/:number` | §8 | Card page: every variant priced, plus pull data |
| `/grails` | §10 | Everything over the grail threshold |
| `/packs` | §11 | Visual odds, exact table, expected value per rip |
| `/rip/:packId` | §6, §7 | The rip: tear, flip, tier-scaled reveal |
| `/live` | §12 | Every rip, newest first, tier-driven prominence |
| `/collection/:wallet` | §13–15 | 3×3 binder, set completion, duplicates, achievements |

`POST /api/rip` runs the real §17 sequence and records to the ledger before the
reveal animation begins.

## Seeding

```bash
node apps/web/scripts/seed-rips.ts --rips=6000 --wallets=40
```

Drives the genuine opening sequence rather than fabricating rows, and reveals
the server seed so every seeded rip can be recomputed. 6000 rips produced one
grail — the published 0.0269% playing out, not a placed hero pull.

## Not built

Wallet auth and the chain itself, the `$RIP` token, image CDN derivatives
(§21), and the OG image route that would serve `renderShareCard`. The Postgres
adapter is written and tested against a fake client but has never run against a
live database.
