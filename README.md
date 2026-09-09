# RIPDEX

Onchain Pokémon pack ripping.

```bash
pnpm test                              # 58 tests
pnpm pokemon:sync:sets                 # import set metadata
pnpm pokemon:sync:cards --set=sv3pt5   # import cards, derive variants
pnpm pokemon:sync:prices --set=sv3pt5  # one price row per variant per day
pnpm pokemon:verify-assets --set=sv3pt5
pnpm web                               # Pokedex, detail, grails, odds on :4179
pnpm demo                              # pack-rip reveal on :4178
```

Node 22.6+ (TypeScript runs without a build step). No dependencies.

## Layout

```
packages/pokemon-core/   catalog model, variant identity, pricing, odds,
                         snapshots, ingestion, and the reveal demo
apps/                    (empty)
```

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
