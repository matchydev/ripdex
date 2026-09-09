# RIPDEX — Asset Manifest

The ledger of every OpenAI-generated RIPDEX asset. One row per asset; bump the
version and note when you regenerate or edit. `implemented` means the asset is
wired into the live interface, not just generated.

Pipeline: briefs in `art-prompts/`, generated via `pnpm art:generate` /
`pnpm art:edit` (see `tools/`), served from `public/art/` at `/art/*`. Art
direction: `art-direction/ART_DIRECTION.md`. The API key is read from
`process.env.OPENAI_API_KEY` only and is never printed or committed.

Default model: `gpt-image-2.5-sunburst` (drafts: `gpt-image-2.5-flare`).

| Asset | Purpose | Prompt | Size | Transparent | Filepath | Implemented | Notes |
|---|---|---|---|---|---|---|---|
| Grail pack | Featured/showcase wrapper | `grail-pack.md` | 1024×1536 | (baked dark bg) | `public/art/packs/grail-pack.png` | ✅ home scene + rip screen | Showcase; maps to the featured pack. |
| Base Set wrapper | Pack wrapper (antique gold) | edit of grail-pack | 1024×1536 | (baked bg) | `public/art/packs/base-set-rip.png` | ✅ rip screen + home | Edit-derived for a coherent family. |
| 151 wrapper | Pack wrapper (crimson) | edit of grail-pack | 1024×1536 | (baked bg) | `public/art/packs/151-rip.png` | ✅ rip screen | |
| Jungle wrapper | Pack wrapper (emerald) | edit of grail-pack | 1024×1536 | (baked bg) | `public/art/packs/jungle-rip.png` | ✅ rip screen | |
| Obsidian wrapper | Pack wrapper (ember orange) | edit of grail-pack | 1024×1536 | (baked bg) | `public/art/packs/obsidian-flames-rip.png` | ✅ rip screen | |
| Kanto wrapper | Pack wrapper (amber) | edit of grail-pack | 1024×1536 | (baked bg) | `public/art/packs/kanto-starters-rip.png` | ✅ rip screen | |
| Grail vault | Grail reveal environment | `grail-environment.md` | 1920×1088 | no (backdrop) | `public/art/environments/grail-vault.png` | ✅ grail takeover | Centre negative space for the card. |
| Achievement medal (base) | Canonical medal | `achievement-medal.md` | 1024×1024 | (baked dark bg) | `public/art/achievements/medal-base.png` | ✅ collection achievements | Violet when unlocked; grey when locked, with explicit status text. |
| Grail Puller medal | Gold prestige medal | edit of medal-base | 1254×1254 | ✅ yes | `public/art/achievements/grail-puller.png` | ✅ collection GRAIL_HUNTER | Stable achievement ID selects the gold medal, not its display name. |
| RIP R v2 | Current token/site mark | `public/art/brands/README.md` | 1254×1254 | ✅ yes | `public/art/brands/rip-r-v2.png` | ✅ shared headers, favicon, coin, footer, rip screen | Generated with Codex's built-in image tool; silver-lavender face and violet sides, no extra lettering. |

## Hand-off / remaining

- **Achievement integration complete.** `apps/web/src/wallet-pages.ts` displays
  both medals with explicit locked/unlocked states and accessible progress.
  Only `GRAIL_HUNTER` requires a Grail-tier pull, so only that definition gets
  the gold variant. More distinct standard medals can be derived later without
  changing achievement qualification logic.
- **Delivery size remains the next art task.** Original pack PNGs total about
  17 MB. Smaller WebP siblings are supported by the existing wrapper lookup;
  retain PNG masters, the current compositions, and the shared RIP R v2 identity.
- **Optional polish:** the pack wrappers and the base medal carry a baked dark
  studio background rather than true alpha; on the dark UI it blends, but a
  background-removal edit (`pnpm art:edit ... --transparent`) would let them
  float perfectly. The gold medal already came out transparent.

## Iteration log

- **2026-09-09** — Generated and shipped: grail pack (showcase), all five other
  pack wrappers (edit-derived, re-themed per case accent), the grail reveal
  environment (vault), and the achievement medal family (canonical + gold).
  Wrappers wired into the rip screen + home pack scene; vault wired into the
  grail takeover. Medals awaiting collection-UI wiring (Codex's lane).
- Credits ran out mid-session twice (429); auto-reload recovered each time.
- **2026-09-09, collection integration** — Both achievement assets are now
  wired into the binder. The current RIP R v2 is also recorded above. The
  Charizard hero uses separate sourced artwork; its provenance lives in
  `public/art/characters/README.md` and is not part of the generated-asset list.
