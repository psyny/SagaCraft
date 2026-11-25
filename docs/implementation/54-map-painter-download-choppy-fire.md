# 54 - Map painter: the download's options, choppy lakes, fire effects

Status: In progress (branch `feature/map_painter`)
Requirements: LOC-90..LOC-92
Depends on: 53-map-painter-natural-glow
Draft: `docs/drafts/map_painter_improvements_5.md`

## Goal

- **Download a map**: one button opening a window where the DM picks, before downloading, its **resolution**, **PNG
  or PDF**, **with the fog or without**, **with the grid or without**.
- **Lake**: choppy water, moving, built like the ocean (crests, darker backs, light catching them, fine ripples) but
  short, crossing chop instead of long waves.
- **Effects → Lights**: **Sparse fire** (a fire here and there on its tiles) and **Wildfire** (the tiles burning: many
  flames, smoke and embers), with the camp fire's flame.

## Design

- Download: a modal from the Details tab's button: resolution (the map's long side: 1024, 2048 or 4096 px; the
  renderer's limit), format, fog, grid (default: as the players see it, the grid on). Without the fog it's still the
  players' view (what's shared with them, no DM-only labels or hidden features), with all of the painting and the
  pictures not hidden (the server's players' view, `?fog=0`).
- Lake: three short wave trains crossing (each bent by noise, moving its way), their sum the surface: light on the
  crests (broken, short), shade in the troughs, fine ripples over it; foreshortened like all the ground.
- Fire effects: effect types whose particles are flames (the sprite shader's `flame` shape: standing on the ground,
  lighting themselves) with sparks rising; Wildfire adds smoke. A flame particle stands on its point (lifted by half
  its height).

## Steps

- [ ] A. The download's window and options.
- [ ] B. Choppy lakes.
- [ ] C. Fire effects.
- [ ] D. Docs, checks; merged into main.

## Changes from the draft

(Filled in when done.)
