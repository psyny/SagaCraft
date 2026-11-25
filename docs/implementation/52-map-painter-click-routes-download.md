# 52 - Map painter: routes by a click, liquids, a nearer night glow, the map's download

Status: In progress (branch `feature/map_painter`)
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

- [ ] A. Lava river, liquids, transitions between liquids.
- [ ] B. Routes by a click; the flow's three choices.
- [ ] C. The wide glow nearer and steady.
- [ ] D. Download the map (PNG, PDF).
- [ ] E. Docs, checks.

## Changes from the draft

(Filled in when done.)
