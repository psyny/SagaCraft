# 52 - Map painter: routes by a click, liquids, a nearer night glow, the map's download

Status: Done (branch `feature/map_painter`)
Requirements: LOC-80..LOC-85
Depends on: 51-map-painter-perspective
Draft: `docs/drafts/map_painter_improvements_3.md`

## Goal

The map painter's sixth round:

- **Lava**: a lava river's floating pieces smaller, in its molten colour a little darker (not its crust's); its banks
  30% thinner. A lava lake looks like the lake did (its surface perturbed, in lava's colours, glowing); a lake is a
  cheap, low-contrast noise.
- **Liquids meeting liquids** (a lake and the sea, lava and water): a smooth gradient through swirling noise, like
  blood spreading in water, not a dithered band.
- **Routes by a click**: the link under the pointer (shown since plan 51) is added by one click; dragging still draws
  many. A river's flow: **Direction A** (toward the south or east), **Direction B** (toward the north or west), or
  **Surrounding** (the default: the way the rivers it joins flow; direction A when it joins none).
- **Night**: the wide glow reaches a quarter as far as it did (about two and a half times the bloom), steady (it
  flickered).
- **Download the map** (the map editor's Details tab): PNG or PDF, as the players see it (their fog, what's shared
  with them), without the weather.

## Design

- Lava river: crusts from a finer noise, fewer of them, in its molten colour darkened; the dark bank a narrower band.
- Liquids: the lake's perturbation moves to the lava lake (lava's colours; it lights itself); a lake gets one noise
  at a low contrast. Two different liquids blend over a wider band through noise warped by noise (no dither); neither
  gets shore effects at that border.
- Routes: `paint.connect` takes `flow` (`a`, `b`, `join`; plan 51's `reverse` goes). Each step of a stroke decides on
  its own with `join`: water arriving at one end (or leaving from the other) sets it; otherwise direction A. The tool:
  a press on a link adds that link (then a drag goes on from its far tile); a press near a tile's centre starts a
  stroke there, as before.
- Wide glow: blurred at the bloom's quarter size (no sixteenth-size texture: its texels shimmered as things moved),
  about 2.5 times the bloom's reach, raised less.
- Download: a DM-only map view as the players see it (`GET .../map/players`: the live link's guest viewer, which sees
  what players see), drawn offscreen by the map's renderer (still, no weather) at up to 4096 px, its regions, paths
  and labels drawn over it; saved as PNG, or as a one-page PDF (A4, the picture as JPEG; written by a small function,
  no library).

## Steps

- [x] A. Lava river, liquids, transitions between liquids.
- [x] B. Routes by a click; the flow's three choices.
- [x] C. The wide glow nearer and steady.
- [x] D. Download the map (PNG, PDF).
- [x] E. Docs, checks (unit tests, gpu-check; in the running app: a PNG and a PDF downloaded from the Details tab,
  the players' fog and a label in them).

## Changes from the draft

- "Lava liquid terrain should be just like the current lake": the lava lake took the lake's perturbed surface (in
  lava's colours, its crust as the darker part, glowing); the lake got the cheap low-contrast noise.
- Two liquids blend through noise warped by noise (drifting when animated), offset the same way seen from either side
  of their border so the two sides meet without a seam.
- Routes: a click adds the link under the pointer; a press near a tile's centre still starts a stroke (and, erasing,
  a click there still clears the tile). The draft put this under "Boundary problems"; boundaries already worked by a
  click on an edge.
- The flow's choices are named Surrounding (the default), Direction A (south, east) and Direction B (north, west). A
  stroke with Surrounding decides each step as it goes, so a whole stroke follows its first step (or the river it
  starts from); where water would arrive from both ends (or neither), direction A.
- The wide glow's flicker came from its sixteenth-size texture (its texels shimmered as things moved): it now blurs at
  the bloom's quarter size, about 2.5 times the bloom's reach (a quarter of before), raised less.
- Download: added in the map editor's Details tab, for the DM. "Same fog view as the player": the server's players'
  view of the map (the live link's guest viewer), in the default fog look (as the location page shows players); the
  regions, paths and labels shared with them are drawn too; tokens, resource icons and pings are left out. The hour is
  the map's (only the weather is left out). The PDF is A4; no PDF library (a small writer, one JPEG page).
