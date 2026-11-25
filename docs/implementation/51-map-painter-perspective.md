# 51 - Map painter: perspective, slopes, ice, rivers' flow, a wide night glow

Status: Done (branch `feature/map_painter`)
Requirements: LOC-71..LOC-79
Depends on: 50-map-painter-edges-waterfalls
Draft: `docs/drafts/map_painter_improvements_2.md` (its second version)

## Goal

The map painter's fifth round:

- **Ice** (terrain): smooth, a little reflective, faint closed cracks.
- **Slopes** (boundaries, Cliffs): inclined faces beside the vertical cliffs (low, medium, high), seen on every side.
- **Rivers**: lava rivers flow, crusts floating on them, their banks sharp; every river can flow either way (a choice
  on the Routes tool), its flow readable even when the map is still; a waterfall sits on its river's centre, the two
  parts of the river joined by it; the Routes tool shows the link between two tiles' centres under the pointer, as the
  Boundaries tool shows an edge.
- **Lakes**: a subtle moving perturbation (the usual game water look), not rings like raindrops.
- **Night**: a second, wide glow (ten times larger, half as strong): lights seem to light the area around them.
- **Grid**: line width 0 to 2 px in steps of 0.1.
- **Perspective**: the ground is seen at the same tilt as the trees, mountains and buildings: its surface is
  foreshortened (marks lying on it squashed in height, stones showing their near side), roads and rivers thinner where
  they run across the screen than where they run up it, the far bank of rivers and shores showing; the art doc says
  every asset follows this one perspective.

## Design

- Ice: a ground pattern `ice` (faint hairline cracks in cells, no halo; a sheen: soft horizontal streaks of reflected
  sky, a few glints).
- Slopes: a boundary look `slope` with a `run` (tiles: how far its foot reaches out): its face is a parallelogram from
  its top edge to its foot (a cliff's face is the same with no run), shaded by which way it faces (light from the
  north-west); seen on edges facing away and running up the screen too; its corners filled with a cone.
- Rivers' flow: `paint.connect` takes `reverse` (the river flows back toward the stroke's start); the shader draws
  the flow as small chevrons pointing downstream (moving when animated). Lava: crust plates riding the flow, molten
  cracks between them, a jagged dark bank.
- Waterfalls: the river's wobble fades out where it falls (the kinds texture's fourth byte: per tile, the directions
  in which its river falls), so the fall sits on the river's centre; slopes make cascades along their face.
- Route preview: the link (centre to centre) nearest the pointer; while drawing, the next link.
- Wide glow: the bloom taken again at a sixteenth of the size, blurred wide, added at half the bloom's strength.
- Perspective: a style constant (the ground's foreshortening, about 0.62): lying patterns, ground colour patches,
  region borders and water are worked out in foreshortened space; standing marks (grass strokes, tufts, reeds) stay
  upright; cobbles, tiles, bricks and lava plates darker on their near side, lit on their far one; route widths scaled
  by their direction on screen; the far (north) bank of rivers and the land's edge above water drawn as a thin bank.

## Steps

- [x] A. Ice, lake perturbation, grid line width.
- [x] B. Slopes.
- [x] C. Rivers: lava flow and banks, flow direction, waterfalls centred, the route preview.
- [x] D. The wide night glow.
- [x] E. Perspective: the ground, routes, banks; the art doc.
- [x] F. Docs, checks.

## Changes from the draft

- "Rotated around the Y axis": read as the camera tilted down (the screen's vertical squashed), which is what makes
  the ground agree with the trees and buildings seen from the front and a little above; only one axis turns, as the
  draft says, and it isn't isometric.
- The terrain isn't redrawn as pictures: its patterns stay the shader's, worked out in **ground space** (foreshortened
  by `FORE`, 0.62), so every type changed at once and stays seamless; standing marks (grass strokes, reeds, tufts)
  stay upright; cobbles, tiles, bricks, cracked plates and lava plates got a shaded near side. Region borders and the
  grounds' patches are foreshortened too, and so are water's waves and the lake's surface.
- Routes: as the draft hoped, thinner across the screen (0.62) than up it, blended smoothly at bends and junctions.
  Added: the far bank of rivers (and of the land above lakes and the sea) shows as a thin strip of earth in shade.
- "Every river type should have 2 variations, the direction of the flow": a **Flow** choice on the Routes tool for
  rivers (the way you draw, or back toward the start), rather than two types each; painting over a river sets its flow
  again. Its flow is now shown on the river even when the map is still (chevrons pointing downstream).
- Waterfalls were off their river's centre because rivers wobble; now the wobble fades out where a river falls, so
  the fall sits on the river and joins its two parts.
- Slopes: three (low, medium, high), in the Cliffs category beside the vertical cliffs; Turn works on them too. A road
  through a slope cuts a gap in it, as through a cliff.
- The wide night glow is capped softly (its hue kept): spread ten times wider its light is a hundred times thinner, so
  it's raised again; a big source (a lava field) would otherwise wash the map out.
- Grid lines thinner than a pixel are drawn fainter (as much as they cover); 0 means none. Older maps with wider lines
  get 2 px.
