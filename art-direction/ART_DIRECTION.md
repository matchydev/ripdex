# RIPDEX — Art Direction

The single source of truth for RIPDEX's generated visual universe. Every brief in
`art-prompts/` inherits this. If a generation drifts from what is written here, the
generation is wrong — not this document.

## Division of labour

- **Claude** owns product design, creative direction, deciding which assets exist,
  writing the briefs, implementing artwork into the interface, browser testing,
  visual criticism, and choosing when to regenerate or edit.
- **OpenAI GPT Image** renders the pixels. It is a rendering service, not a
  designer. It never decides composition — the brief does.

Generation runs through `tools/openai-art.ts` (`pnpm art:generate`) and
`tools/openai-edit.ts` (`pnpm art:edit`). The API key is read from
`process.env.OPENAI_API_KEY` only and is never printed, logged, committed, or
exposed to the browser.

## What RIPDEX is

Premium · adult · collectible · technical · crypto-native · minimal · high-motion ·
luxury.

The reference mixture: a high-end collectible marketplace **+** Linear/Vercel
precision **+** Framer-level motion **+** a premium TCG pack opening **+** provably-
fair crypto infrastructure. Adults who collected as kids, now crypto-native, chasing
real value.

## What RIPDEX is NOT

Childish · cartoon "Web3" · casino/slot-machine · a generic Pokémon fan site · a
generic crypto dashboard · a generic AI-SaaS landing page. No mascot clip-art, no
neon slot glare, no emoji, no coins raining, no fake confetti.

## Palette

RIPDEX's own chrome is fixed and must survive every generation:

| Token        | Hex        | Use                                             |
|--------------|------------|-------------------------------------------------|
| Background   | `#08090a`  | Never pure black.                               |
| Text         | `#f7f8f8`  | Never pure white.                               |
| Accent       | `#7170ff`  | The ONE interface accent (violet).              |
| Gold         | `#f5c451`  | Grail-tier value / grail moments only.          |
| Emerald      | `#4ade9b`  | "A provider confirmed this" only.               |

**Do not let AI imagery turn the site purple.** Violet is the interface accent, not
a wash over every asset. Generated artwork should read as premium and largely
neutral/dark, with restrained accent use. Individual card artwork may introduce
*temporary environmental colours* (a Charizard pools amber, a grail scene may glow
warm) — that is welcome and is bridged by the existing per-card ambient-glow system.
The chrome around it stays `#08090a` / `#f7f8f8` / `#7170ff`.

## Hard rules

- **Never generate Pokémon card art.** The real, configured card scans remain the
  actual collectible. OpenAI renders the *surrounding* universe — wrappers,
  environments, medals, backgrounds, textures — never a card face.
- **Objects come out transparent.** Packs, badges, props, mascots, cutouts must be
  generated with `--transparent` (PNG) so they layer into the UI instead of sitting
  in a rectangle.
- **Social art is background only.** The image model renders atmosphere; RIPDEX's
  own `social.ts` renderer overlays the exact card, name, variant, value, tier and
  branding as real text. Never ask the model to render dynamic text.
- **Grail environments support the card, never compete with it.** Leave deliberate
  centre negative space for the real card; the card stays visually dominant.

## Model & quality

Centralized in `tools/openai-common.ts`:

- Production: `gpt-image-2.5-sunburst` (default `OPENAI_IMAGE_MODEL`), quality
  `high` (use `xhigh`/`max` for the hero pack and grail environment).
- Drafts / iteration: `--draft` → `gpt-image-2.5-flare`, quality `medium`.

## Asset families

| Family        | Dir                        | Size preset / target      | Output                  |
|---------------|----------------------------|---------------------------|-------------------------|
| Pack wrappers | `public/art/packs/`        | `pack` (1024×1536)        | transparent PNG         |
| Environments  | `public/art/environments/` | `wide`/`section`          | opaque PNG              |
| Achievements  | `public/art/achievements/` | `badge` (1024×1024)       | transparent PNG         |
| Social        | `public/art/social/`       | `og` / `social`           | opaque PNG (bg only)    |
| Textures      | `public/art/textures/`     | `texture` (1024×1024)     | PNG (seamless intent)   |
| Scratch       | `public/art/generated/`    | any                       | drafts, not implemented |

Served read-only at `/art/...` by the web server (see `serveArt` in
`apps/web/server.ts`). A pack wrapper named `<packId>.png` (or `grail-pack.png` for
the featured pack) is picked up automatically by the homepage 3D pack scene.

## Pack wrappers — the most important asset

A sealed RIPDEX pack must read as a **physically manufactured foil wrapper**, not a
poster. Every wrapper brief must call for: a foil substrate, small folds and
crinkles, heat-sealed crimped top/bottom edges, specular highlights raking across
the foil, subtle embossing, layered ink, and real physical thickness. Portrait
(≈2:3), transparent background, generated to be mapped onto a 3D wrapper in the
scene. Consider front, back, and a foil/specular texture layer where it materially
improves the implementation.

## Every brief must define

**PURPOSE** (where it appears) · **SUBJECT** (exactly what) · **COMPOSITION** (where
elements sit) · **CAMERA** (perspective/framing) · **LIGHTING** (source, direction,
atmosphere) · **MATERIAL** (foil/paper/plastic/glass/metal) · **VISUAL LANGUAGE**
(this document) · **TEXTURE** (print imperfections, crinkles, grain) · **COLOR**
(respect the palette) · **NEGATIVE SPACE** (where UI type/the card will sit) ·
**OUTPUT** (transparent/object/background, size, format).

Never write "cool crypto pack" or "premium background". Write the brief.

## Workflow (mandatory — not "generate → accept")

1. Inspect the current presentation in the running site.
2. Write a detailed brief in `art-prompts/`.
3. `pnpm art:generate` (or `art:edit` when an asset is close and identity must hold).
4. Inspect the raw image.
5. Implement it in the interface.
6. Open the site; inspect the *actual composition in place*, desktop and mobile.
7. Decide whether the layout or the artwork is the weak part.
8. Edit/regenerate; re-implement; inspect again. Important assets take several passes.
9. Record the result in `ASSET_MANIFEST.md`.

## Generation order

1. Grail pack (showcase — prove the whole workflow first)
2. Other pack wrappers
3. Grail reveal environment
4. Achievement set (establish one canonical medal, then edit-derive the rest)
5. Homepage supporting artwork
6. Social artwork
7. Subtle textures / decorative assets
