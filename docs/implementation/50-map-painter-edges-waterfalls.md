# 50 - Map painter: boundaries on tile edges, rivers' waterfalls

Status: Done (branch `feature/map_painter`)
Requirements: LOC-61 (changed), LOC-69, LOC-70
Depends on: 49-map-painter-boundaries-effects

## Goal

The user's feedback on plan 49's boundaries:

- **Boundaries on edges**: a boundary belongs to the **edge between two neighbouring tiles**, not to a tile. One edge has
  at most one boundary. Painting works like routes, a stroke across the map: crossing the line between two tiles puts a
  boundary on it (perpendicular to the step from one to the other), and running along the grid's lines draws a
  continuous wall. A lone wall is one line (plan 49 made a painted strip's two sides).
- **Waterfalls are the river's**: where a river crosses a boundary, the river turns into a waterfall at the crossing,
  in its own look and colours (water, lava), the same for every boundary type: no boundary has a waterfall look of its
  own. Roads still open a gap (a gate where the type has one).

## Design

- Data (`layer["paint"]`): plan 49's `bounds` (per tile) becomes three edge channels, `bounds_0`, `bounds_1`,
  `bounds_2`: per tile, the boundary (palette entry + 1) on each of its **own edges** (every edge is kept on one of its
  two tiles: square grids east and south; hex grids east, south-east and south-west), and `bound_sides` (bits per own
  edge: the neighbour's side is the high one; cliffs). Plan 49's painted areas become their outer edges once, plan 48's
  walled scenery the same way. A new grid type clears them with the roads and rivers (directions change meaning).
- Commands: `paint.boundaries` takes `edges` (`[column, row, direction]`, the direction from that tile to the
  neighbour), a type (none: erase) and colours; `paint.boundaries.turn` turns cliffs' edges the other way.
- Players get an edge's boundary when they may see either of its tiles.
- The tool: the edge nearest the pointer (near its middle) is the one shown and painted; a stroke paints every edge it
  passes over (sampled between pointer events, so a fast stroke skips none). Paint, Erase, Pick, and Turn for cliffs
  (a stroke turns each cliff edge it passes over once). A new cliff faces the viewer (the tile above it on the screen is
  the high ground).
- Drawing: each edge is a box as in plan 49 (cliffs hang their face below their edge toward their low side). Towers
  (corner sprites) stand where a boundary ends, turns or meets others.
- Waterfalls: made from the routes (`painter/sprites.ts`): a river crossing an edge with a boundary that rivers fall
  over (all but fences, hedges and barriers: `"falls": false` in their JSON, where the river passes through a gap)
  falls there, drawn by the sprite pass in front of the boundary: a curtain of water (or lava) from the boundary's top
  to its foot (walls) or down a cliff's face, widening as it falls, a foam pool and mist (lava: sparks) at its foot;
  where the drop can't be seen (an edge running up the screen, a cliff facing away), white water across the river.

## Steps

- [x] A. Data and commands (edges, sides, conversions, players' view), backend tests.
- [x] B. Drawing: boundaries from edges, the river's waterfalls.
- [x] C. The tool (edges under the pointer, Turn), the overlay's edge preview.
- [x] D. Docs, check pages, checks (unit tests, gpu-check, the running app: a stroke along a grid line in the map
  editor drew one continuous fence; the hover shows the edge).

## Changes from the request

- The request's "connection between two tiles" is kept (crossing the line between two tiles puts a boundary on that
  edge) and widened: a stroke **along** the grid's lines takes every edge it runs along, so a long wall is one stroke
  (a stroke from tile to tile along a row would otherwise make rungs, not a wall). Edges are picked near their middle,
  so a stroke passing a corner doesn't catch the edges meeting there.
- Cliffs need a high side, which an edge alone doesn't say: a new cliff faces the viewer (the tile above it is high),
  and **Turn** (shown for cliffs) swaps it, a stroke turning each edge once.
- Fences, hedges and the arcane barrier let rivers through a gap rather than making them fall (`"falls": false` in
  their JSON; any type can change it); walls and cliffs make waterfalls.
- The waterfall is drawn by the sprite pass (in front of the boundary, in the scenery's depth order), not the ground
  pass: down a cliff's face the water must cover the rock, which the sprite pass draws after the ground. It is made
  from the river's crossing and drawn in the river's look and colours (a lava river makes a lava fall); the boundary
  only gives its height and which way it faces.
- Towers (corner sprites) also stand at a wall's ends and where boundaries meet, not only where one turns; on hex
  grids a wall's zigzag isn't a turn.
