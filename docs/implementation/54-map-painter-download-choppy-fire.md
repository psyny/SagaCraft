# 54 - Map painter: the download's options, choppy lakes, fire effects

Status: Done (branch `feature/map_painter`, merged into main)
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

- [x] A. The download's window and options.
- [x] B. Choppy lakes.
- [x] C. Fire effects.
- [x] D. Docs, checks (in the running app: the window, a large PNG without fog and grid); merged into main.

## Changes from the draft

- Resolution: three sizes of the long side (1024, 2048, 4096 px; the window shows the picture's size), 4096 being
  the renderer's largest canvas.
- No fog: still the players' view (never the DM's hidden things), not the DM's own map; the pictures are the
  originals (not the players' composed picture, which carries their fog).
- Lake: plan 53's simplex surface is replaced; the chop moves faster than it did (it was too slow to notice), still
  only when the device animates maps.
- Fire effects: in Lights as the draft says; Sparse fire has a little smoke, Wildfire flames of two sizes, many
  sparks and dark smoke rising.
