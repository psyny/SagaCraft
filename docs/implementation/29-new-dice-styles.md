# 29 - New dice styles

Status: Done
Requirements: SAGA-11 reworded (22 styles)
Depends on: 23-dice-roller, 24-general-improvements

From the draft `docs/drafts/new_dice_styles.md` (deleted once built).

## What changed

- **New**: Marble, Granite, Cobblestone, Agate (stones), Hex, Glass, Sanded glass, Gnomish, Jelly, and two more:
  **Cosmic** (nebulae of the colour, stars) and **Bone** (carved ivory, scrimshaw in the colour).
- **Replaced**: Elven (black or white against the colour, runes of the colour written along each face's edges, numbers
  in the colour), Orcish (matte colour, glossy blood splatter in its complement, black or white numbers; still a hacked
  lump), Nature (dark earth wound with raised roots of the colour). Their keys stay (members keep their pick).
- **How** (`dice/styles.ts`, `dice/painters.ts`):
  - painters get the face's outline (runes along its edges);
  - a style may paint **gloss by area** (`rough`: the blood is glossy on a matte die) and **see-through** (`alpha`:
    glass and jelly; numbers always solid);
  - height, gloss and glow maps get the same random numbers as the base, so raised roots, gears and sparkles line up
    with what's painted;
  - pixel painters for marble veins, granite flecks, agate bands and smoky gels (smooth noise, deterministic).
- The server's list of styles has the new keys (`services/access.py`).

## Changes from the draft

- "Other stones and gemstones": Granite and Agate (with Marble and Cobblestone); the "more creative" ones are Cosmic and
  Bone.
- Hex's sigil is the colour's vivid complement; its numbers the complement pushed until they read on the colour.
- Glass is tinted see-through (an opacity map, not refraction: light on any table, cheap to draw), with a soft streak
  of light and a faint inner glow so the tint shows on dark tables.
