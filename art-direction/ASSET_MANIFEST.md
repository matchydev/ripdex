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
| Achievement medal (base) | Canonical medal | `achievement-medal.md` | 1024×1024 | (baked dark bg) | `public/art/achievements/medal-base.png` | ⏳ awaiting collection UI wiring | Gunmetal + violet enamel + gold facet. |
| Grail Puller medal | Gold prestige medal | edit of medal-base | 1024×1024 | ✅ yes | `public/art/achievements/grail-puller.png` | ⏳ awaiting collection UI wiring | Full gold; for grail-tier achievements. |

## Hand-off / remaining

- **Achievement medals → collection/profile UI.** The medal family is generated
  (`medal-base` for standard achievements, `grail-puller` for grail-tier). The
  achievements render in `apps/web/src/wallet-pages.ts` (Codex's active lane), so
  wiring the medal images onto the unlocked/locked badge states is best done
  there. Suggested mapping: grail-related achievements → `grail-puller.png`, the
  rest → `medal-base.png`, greyscaled/dimmed while locked. More distinct medals
  can be edit-derived from `medal-base` per achievement if desired.
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
