#!/usr/bin/env bash
# Generate the five vibrant pack wrappers (CS:GO-case energy: glossy themed foil,
# gold emblem, glow burst, sparks). Overwrites public/art/packs/<id>.png.
#
# Needs OPENAI_API_KEY in the environment (never commit it). Uses OpenAI credits.
#
#   export OPENAI_API_KEY=sk-...
#   bash tools/generate-vibrant-packs.sh
#   # review the 5 PNGs, then:  git add public/art/packs && git commit -m "Vibrant pack wrappers" && git push
#
# Tips: pass --draft on each command below for cheaper/faster drafts while
# tuning; drop it for the final high-quality render. Add "-2" style suffixes by
# hand if you want alternates to compare.
set -euo pipefail
cd "$(dirname "$0")/.."

COMMON="A premium foil trading-card booster pack wrapper standing upright, dramatic 3/4 product-shot view, floating in space. %s with a sharp geometric diamond emblem embossed in bright gold at the center, catching intense studio rim-light along the edges. High energy: %s, bright radiating light rays behind the pack, glowing sparks and embers swirling around it, cinematic high-contrast lighting like a premium loot-case reveal. Ultra glossy, saturated, vibrant, AAA game marketing render, sharp focus, volumetric light. The pack ONLY — no cards, no characters, no creatures, no text, no logos, no watermarks. Clean transparent background."

gen () { # id  foil-desc  glow-desc
  local out="public/art/packs/$1.png"
  local prompt; prompt=$(printf "$COMMON" "$2" "$3")
  echo "==> $1"
  node tools/openai-art.ts --prompt "$prompt" --out "$out" --size pack --transparent --quality high
}

gen "151-rip"              "glossy crimson and black holographic mylar foil"      "a vivid crimson-to-magenta glow bursts from behind the pack"
gen "base-set-rip"        "glossy antique-gold and black holographic foil"       "a radiant gold-to-amber glow bursts from behind the pack"
gen "jungle-rip"          "glossy emerald-green and black holographic foil"      "a vivid emerald-to-teal glow bursts from behind the pack"
gen "obsidian-flames-rip" "glossy molten ember-orange and black holographic foil" "a fiery orange-to-red glow bursts from behind the pack"
gen "kanto-starters-rip"  "glossy warm-amber and black holographic foil"         "a golden amber glow bursts from behind the pack"

echo "Done. Review public/art/packs/*.png, then commit + push."
