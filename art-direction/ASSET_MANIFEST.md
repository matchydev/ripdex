# RIPDEX — Asset Manifest

The ledger of every OpenAI-generated RIPDEX asset. One row per asset; bump the
version and note when you regenerate or edit. `implemented` means the asset is
wired into the live interface, not just generated.

Pipeline: briefs in `art-prompts/`, generated via `pnpm art:generate` /
`pnpm art:edit` (see `tools/`), served from `public/art/` at `/art/*`. Art
direction: `art-direction/ART_DIRECTION.md`. The API key is read from
`process.env.OPENAI_API_KEY` only and is never printed or committed.

Default model: `gpt-image-2.5-sunburst` (drafts: `gpt-image-2.5-flare`).

| Asset | Purpose | Page(s) | Prompt | Model | Size | Quality | Transparent | Filepath | Version | Implemented | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Grail pack | Flagship sealed-pack wrapper (showcase) | home / packs / rip | `art-prompts/grail-pack.md` | gpt-image-2.5-sunburst | 1024×1536 | high | yes | `public/art/packs/grail-pack.png` | v1 | ⛔ blocked | Pipeline verified end-to-end (key valid, request reached the API). Generation returned **429 — no credits on the OpenAI account**. Add billing, then re-run; the wrapper auto-maps to the featured pack in the 3D scene. |

## Planned (generate in this order once billing is funded)

1. **Grail pack** — the showcase. Prove the whole workflow, iterate to premium, before anything else.
2. Other pack wrappers — `charizard-chase`, `base-set-rip`, `151-rip`, `jungle-rip`, `obsidian-flames-rip`, `kanto-starters-rip` (file each as `<packId>.png`; the case gallery and pack scene pick them up automatically). Use `pnpm art:edit` from the approved grail pack to keep the family coherent, re-theming per case accent.
3. Grail reveal environment — atmospheric scene with intentional centre negative space for the real card (`public/art/environments/`).
4. Achievement set — one canonical enamel-pin / stamped-medal, then edit-derive the rest (`public/art/achievements/`, transparent).
5. Homepage supporting artwork.
6. Social backgrounds — background only; `social.ts` overlays exact card/name/value/tier/branding as real text.
7. Subtle textures / decorative assets.

## Iteration log

- **grail-pack v1** — attempted 2026-09-09. Blocked at generation: OpenAI account has no API credits (429). Brief written to full art-direction spec; awaiting billing to generate and begin the inspect → implement → critique → edit loop.
