# 48 - Map painter: layers, art as assets, day and weather

Status: In progress (branch `feature/map_painter`)
Requirements: LOC-49..LOC-58, EFX-10, EFX-11 (and LOC-42, LOC-48 changed)
Depends on: 47-map-painter
Draft: `docs/drafts/map_painter_improvements.md`

## Goal

The map painter's second round, from the DM's first use:

- **Layers**, bottom to top: **terrain** (grounds and water) → **routes** (roads and rivers) → **scenery** (forests,
  hills, mountains, cities, castles... painted on tiles, drawn standing over the terrain and routes) → **features**
  (unique things: a portal, a windmill, a tower, birds, clouds). Scenery and features stand in one depth order: what is
  nearer (lower on the map) covers what is behind it.
- **Art as assets**: what each type looks like is data (JSON) and pictures (SVG), in one folder per style, documented
  for people and AIs to add or redraw types without touching code.
- One style for now, **Storybook** (sketch renamed; diorama dropped), the styles mechanism kept.
- Better routes (curves, wobble, modern and futuristic roads), rivers that flow into lakes and seas, roads that bridge
  water, moving water.
- **Daytime** (lighting, night lights: windows, fireflies, stars on water) and **weather** (EFX effects over the map,
  presets the DM edits in the EFX tab).
- Tools: colours' reset, an eyedropper.

## UX

Map editor tools bar (after Labels): `|` Images `|` **Terrain**, **Routes**, **Scenery**, **Features** `|` **Daytime**,
**Weather**. Daytime and Weather are also on the Stage's map tools (live: the DM changes the hour or the weather
during play; players see it).

- **Terrain**: category (Ground, Grass, Water), type | size, shape | Paint, Erase, **Pick** | colours A, B, C, **↺**
  (the type's colours; always there, greyed when they're the type's).
- **Routes** (was Roads & rivers): category (Roads, Modern, Rivers), type (dirt road, paved road, trail; highway,
  railway, light road; river, stream) | Paint, Erase, Pick | colours, ↺.
- **Scenery** (new): category (Forests, Mountains, Settlements), type (pine, broadleaf, redwood, dead, palms; hills,
  mountains, snowy peaks, volcano; city, town, village, farms, castle, keep, ruins) | size, shape | Paint, Erase, Pick |
  colours, ↺. Painted on tiles like terrain; tiles of one type join into one forest, range or city (castles get walls
  along their outer edges, towers at the corners, gates where a road goes through).
- **Features** (was Landmarks): ☰ list, ＋ place; category (Buildings, Places, Sky), type (tower, windmill, lighthouse,
  temple; mine, cave, camp, standing stones, portal, monument; birds, clouds) | size, another look, colours, ↺.
- **Pick** (eyedropper): a click on a tile takes its type and colours (then back to Paint).
- **Daytime**: a sun/moon button with a slider (0-24 h): day, golden dawn and dusk, night (dark blue, still readable;
  lit windows, fireflies over forests, stars on water).
- **Weather**: a menu of the Saga's map weathers (none, clear, light rain, heavy rain, thunderstorm, light snow, heavy
  snow, snowstorm, sandy wind, sandstorm, mist, falling leaves, emberfall, ashfall); EFX tab → **Map weather**: the
  list, add, rename, delete, edit (the effects over the map, as an environment's foreground).
- Details tab: style **Storybook** (the only one for now), map type, animated.

## Design

### Data (`domain/map_paint.py`)

```
layer["paint"] = {
  "palette": [{"type", "colors": [a, b, c]}],      # terrain, routes and scenery entries (at most 255)
  "tiles": RLE, "scenery": RLE,                    # per tile: its terrain's / scenery's entry + 1
  "roads", "road_kinds", "rivers", "river_kinds", "river_out": RLE,
  "features": [{"id", "type", "tile", "size", "variant", "colors", "name", "hidden"}],
}
data["painter"] = {"style": "storybook", "kind": "world", "animated": bool}
data["ambience"] = {"hour": 0..24, "weather": environment id | null}
```

Older paintings (plan 47) are read once into this: forest and mountain terrain become scenery over a ground of their
colour; settlement objects (castle, city, village, farm) become scenery on their tiles; the other objects features.
Styles other than `storybook` read as `storybook`.

### Art as assets (`backend/sagacraft/map_painter/`)

One folder per style (`styles/storybook/`): `style.json` (name, ink and paper, night colours), `terrain.json`,
`routes.json`, `scenery.json`, `features.json` (each: categories and types: key, name, colour roles and defaults, and
`art`, how it's drawn), `sprites/*.svg`. The server loads them (the catalogue: what can be painted, checked on every
command) and serves the folder (`/api/map-painter/...`, cacheable, no sign-in: the live link draws maps too). Type keys
are the same in every style; a style draws them its way.

- **Terrain and routes** are drawn by the painter's shader (per pixel, transitions between any pair): their `art`
  picks and tunes the shader's patterns (grass strokes, stipple, cracks, flecks, puddles, furrows, tufts; water) and
  route looks (dirt, paved, trail, highway, rail, light, river) with numbers.
- **Scenery and features** are sprites: SVGs using `var(--a)`, `var(--b)`, `var(--c)` (the type's colours) and
  `var(--ink)`, elements of class `night` lit at night. The browser fills in the colours and rasterizes each sprite once
  per colour set into an atlas. Scenery `art`: layers of sprites scattered on a jittered grid (spacing, heights, how
  many kept, sway), walls (wall, tower, gate sprites along the type's outer edges), night extras (fireflies). Feature
  `art`: variants, each parts (sprites; a part may spin around a pivot, sway, flap), height, overhead (birds, clouds:
  drawn over everything, moving).
- How to make art: `docs/concepts/map-painter-art.md` (for people and AIs).

### Rendering (`frontend/src/maps/painter/`)

- **Ground pass** (one full-canvas shader, built per style): terrain with its patterns (params in the palette texture),
  the transitions, water (fluid), routes, night grading and stars on water.
- **Sprite pass** (instanced quads, a tiny shader): scenery sprites (made on the CPU from the scenery tiles: deterministic
  per cell, kept where their base lies in their type's region: organic edges), walls along edges, features' parts;
  sorted by their base (back to front), overhead ones last. The vertex shader sways trees, spins sails, drifts clouds,
  flaps birds; the fragment shader samples the atlas (mipmapped), grades for the hour and adds the night lights.
- Water: **fluid** terrain (ocean, lake). Rivers are never drawn over fluid: an arm toward a water tile runs on to its
  centre and stops at the shore, which opens there (no ink across the mouth), widening a little. Roads over fluid
  (rivers, water) are bridges.
- Routes: a tile with two connections draws a curve between its edges' middles; others, arms from the centre. Old
  looks wobble along their length but not at the ends (tiles still join); modern ones don't.
- Daytime: `hour` → light; the painter grades its own drawing (so lights stay bright), the map shader grades the
  pictures the same way.
- Weather: the weather's effects (EFX renderers) drawn over the map view, catching no clicks.

### Map weather (EFX)

Environments get a `kind`: `stage` (as before) or `weather` (a map weather: only its foreground layer is used). A
Saga's map weathers start as the presets above (made the first time they're listed). Map commands: `ambience.set`
(hour, weather). Players get the ambience with the weather's effects.

### Performance

Ground shader smaller than plan 47's (the glyphs left it: faster to build on Direct3D); sprites: one draw call,
instances rebuilt only when the painting changes. SVGs: a few KB each, fetched once per browser (cached).

## Steps

- [x] 1. Tools: colours' reset, eyedropper; water: foam from the deep colour, shoreline its third colour; Storybook
      (diorama dropped).
- [ ] 2. Assets and layers: the style folder (JSON, sprites), served; the data (scenery, features), old paintings read;
      commands; ground pass from JSON; sprite pass; first art; Terrain, Routes, Scenery, Features tools.
- [ ] 3. Routes and water: curves, wobble, new roads, rivers into water, bridges, moving water.
- [ ] 4. Daytime: grading, night lights, fireflies, stars; the tool.
- [ ] 5. Weather: map weathers in EFX, presets, ambience, the overlay, the tool.
- [ ] 6. Art pass (mountains, settlements, castles), the art doc, docs, checks.

## Tests

Backend: the catalogue loads from the style folder (every sprite referenced exists), old paintings convert, scenery and
features commands, ambience, map weathers (presets, kind). Frontend: scatter is deterministic and keeps its region,
walls and gates from edges, eyedropper, tools' commands; gpu-check builds both passes.

## Changes from the draft

Filled during the build.
