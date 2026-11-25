# 49 - Map painter: boundaries, environmental effects, lava, weather on the map

Status: Done (branch `feature/map_painter`)
Requirements: LOC-60..LOC-68
Depends on: 48-map-painter-layers
Draft: `docs/drafts/map_painter_improvements_2.md` (its first lines, pavement and desert, were built in plan 48)

## Goal

The map painter's third round:

- **New types**: lava ground (cracks glowing with lava), a lava lake (terrain **Water** becomes **Liquids**), lava rivers
  (their own look), scenery **camps** (tents, bonfires glowing at night); bricks larger (they were too dense for a world
  map).
- **Boundaries** (new layer, after Routes): fences, palisades, stone, brick, castle and ruined walls, low, medium and
  high cliffs, hedgerows, an arcane barrier. Painted on tiles like scenery, drawn on the outer **edges** of the painted
  area, standing up in the same perspective as trees and buildings (a wall going up the screen is a thin strip, across
  it shows its face), in their depth order. A road through a boundary opens it (a gate); a river falling over a cliff
  is a **waterfall**. The castle, keep and ruins scenery lose their flat walls: their walls are boundaries now.
- **Environmental effects** (new layer, between Scenery and Features): fireflies, ground mist, magic motes, rising
  embers, falling leaves, swamp bubbles, glowing mushrooms; painted on tiles, joining with their own kind, standing in
  the scenery's depth order.
- **Tools bar**: Selection ... Labels | **Daytime, Weather** (they're on Stages too) | **Terrain, Routes, Boundaries,
  Scenery, Effects, Features, Images**.
- **Visuals**: ocean waves moving with the wind; calm lake ripples (no wind); mountains, hills and buildings without a
  bottom outline, organic ones fading into the ground (noisy); a soft **bloom** around night lights.
- **Weather on the map**: rain, snow, hail, ash, embers, leaves and sand fall onto the map in its perspective (they
  land on the ground: splashes, settling flakes), with better shapes; mist drifts on the ground.
- **Animation is the user's choice per device** (User page: "Animate maps on this device"), not a map setting.

## Design

- Data (`layer["paint"]`): two more tile channels, `bounds` and `effects` (palette entries of kinds `boundary`,
  `effect`), and two more style files (`boundaries.json`, `effects.json`). Commands `paint.boundaries`,
  `paint.effects`. Plan 48's walled scenery becomes the matching boundary once (castle and keep: castle wall; ruins:
  ruined wall).
- Boundaries: each outer edge of a painted area is a box (its footprint along the edge, a thickness, a height)
  drawn by the sprite pass: its top and the faces turned toward the viewer, worked out per pixel; cliffs hang their
  face below their edge where it faces the viewer. Looks (fence, palisade, stone, brick, castle, hedge, cliff, barrier)
  are the sprite shader's, tuned by JSON (height, thickness, gaps, colours); corner and gate sprites are SVGs (towers,
  gatehouses, posts).
- Effects: particles of the sprite pass (glow, puff, spark, leaf, bubble, mote shapes), scattered like scenery, each
  moving its way (wander, rise, drift, fall, pulse), some only at night.
- Lava: a ground pattern (`lava`), a liquid look (`"liquid": "lava"`), a route look (`lava`); lava lights itself (it
  isn't darkened at night, it glows).
- Bloom: the painting's bright, lit parts at night are blurred at a quarter size and added back by the map shader.
- Weather on the map: a canvas over the map view whose particles live in map space (they fall, at a height, onto a
  ground point; they move with the map), drawn with pre-rendered shapes.

## Steps

- [x] A. Lava, liquids, camps, bricks; the tools bar; animation per device.
- [x] B. Boundaries (data, tool, drawing, gates, waterfalls; walled scenery converted).
- [x] C. Environmental effects.
- [x] D. Waves and ripples, sprites' bottoms, night bloom.
- [x] E. Weather on the map.
- [x] F. Docs (art doc), checks.

## Changes from the draft

- Boundaries are painted on **tiles** (a brush, like scenery) and stand on the painted area's outer edges, rather than
  drawn edge by edge: one gesture walls a town or raises a plateau, and the edges stay closed. A lone line of wall
  (not around anything) is a one-tile strip's two sides for now; an edge-by-edge mode can come later if it's missed.
- Boundaries are drawn by the sprite pass as boxes worked out per pixel (no pictures): the draft's "thin when vertical,
  height when horizontal or diagonal" comes from the perspective itself, at any angle (hex grids too).
- Cliffs: the painted tiles are the high ground; only their faces toward the viewer show rock (the others a rim).
- Extra categories: Hedges (hedgerow) and Barriers (arcane barrier); ruined walls and palisades among the walls.
- Plan 48's castle, keep and ruins walls (drawn by the scenery itself) became boundaries; old maps get them once.
- Effects: eleven types in four categories (Lights, Mist and smoke, Falling, Rising). Their particles stand in the
  sprites' depth order, which is the draft's "integration with scenery and features": mist passes behind the trees in
  front of it and over the ground behind them. A river or a road over lava ground now covers its glow.
- Sprites' feet: no ink along any sprite's foot (buildings, mountains, hills, trees, walls' towers: the SVGs were
  redrawn so); organic scenery fades into the ground (`fade` in the style's JSON, a noisy edge), buildings don't.
- Night bloom: every glowing thing (lava, windows, fires, fireflies, glowing effects) glows over a larger area: a
  bright pass and two blurs at a quarter size; only at night.
- Weather on the map: a canvas over the map view whose drops live in the map (they land on map points, move with the
  map), drawn in the painter's perspective plus a little depth (higher: nearer the eye); falling flakes cast shadows
  that sharpen as they near the ground. The EFX weather effect (Stages' foregrounds) is unchanged: map weathers' `weather`
  and `fog` effects are drawn by `maps/weather/` instead, their other effects stay screen effects. A map opened in a
  weather shows it already falling (and lying: snow, ash, leaves); a change sets in gently.
