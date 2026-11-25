# 47 - Map painter

Status: Done, first version (branch `feature/map_painter`, not merged)
Requirements: LOC-41..LOC-48
Depends on: 45-map-tools-and-stage-icons, 46-grid-first-maps
Draft: `docs/drafts/map_painter.md` (with `barovia.png`, the look of the sketch style; both left in place: the user deletes or moves them once the branch is merged)

## Goal

The DM paints a world map on the map's grid instead of (or under) uploading pictures: terrain tiles (forests, grass,
sand, mountains, water...) blending into each other, roads and rivers that join, and landmarks (castles, villages,
mines...). Two looks: **sketch** (flat colours and ink, like a hand-drawn fantasy map) and **diorama** (pixel art with
light and shadow, like Octopath Traveler's HD-2D), optionally **animated** (trees and grass sway, water ripples, rivers
flow). Local maps (battlegrounds) come later on the same system.

## Out of scope (for now)

- Local maps (battlegrounds): the map type is there, its assets aren't.
- Undo; a fill bucket; custom assets uploaded by the DM.

## UX

The DM, in prep, on the map editor (location page, and the Stage's full editor; never the Stage's tool row).

- **Details tab**: *Map painting*: style (Sketch, Diorama), map type (World map; Local map later), animated.
- **Map tools bar** (editor only), after Labels: a line, **Images** (the pictures, moved out of the Layers tab:
  ☰ list with eye, rename, delete, order; ＋ upload; the picked one's snap, scale, turn, flip, order), a line,
  **Terrain**, **Roads & rivers**, **Landmarks**.
- **Terrain**: category ▾ (Ground, Grass, Trees, Mountains, Water), type ▾ (e.g. Trees: pine, broadleaf, redwood,
  dead), | brush size (slider tray), brush shape ▾ (round, square), | Paint, Erase, | Colour A, B, C (each type names
  what its colours paint). Drag on the map.
- **Roads & rivers**: category ▾ (Roads, Rivers), type ▾ (dirt road, paved road, trail; river, stream), | Paint, Erase,
  | colours. Drag from tile to tile: each step connects two tiles; tiles where several connections meet draw a
  junction. Rivers flow the way they were drawn.
- **Landmarks**: category ▾ (Settlements, Landmarks), type ▾ (castle, town, village, tower; mine, ruins, temple,
  standing stones...), size ▾ (1 to 4 tiles), | colours; a click on a tile places one (its look picked at random among
  the type's variants), ☰ lists them (select, rename, delete); a selected one has Move, size, colours, "Another look".
- Pictures always lie **over** the painting.

## Design

### Data (`domain/map_paint.py`, per layer: `layer["paint"]`; map settings `data["painter"]`)

```
painter: {"style": "sketch"|"diorama", "kind": "world"|"local", "animated": bool}
layer["paint"] = {
  "palette": [{"type": "trees.pine", "colors": ["#...", "#...", "#..."]}, ...],   # at most 255
  "tiles":  RLE,   # per tile: palette index + 1 of its terrain (0: not painted)
  "roads":  RLE,   # per tile: its road connections (a bit per direction: square 8, hex 6)
  "road_kinds": RLE,   # per tile: palette index + 1 of its road
  "rivers": RLE, "river_kinds": RLE, "river_out": RLE,   # rivers: connections, kind, the ways they flow out
  "objects": [{"id", "type", "tile": [c, r], "size", "variant", "colors", "name"}],
}
```

- **RLE**: base64 of (count - 1, value) byte pairs over the tiles, row by row. Painted maps are big areas of one thing:
  a 100 × 100 map is a few hundred bytes, not 10 000. Players get the same encoding.
- Palette entries are shared: painting adds an entry only for a new (type, colours) and drops unused ones.
- The **catalogue** (`domain/map_paint.py`) is the single source of types: key, kind (terrain, road, river, object),
  category, name, the shader's material number, the colours' roles and defaults, objects' size and variant count. The
  editor reads it (`GET /api/map-paint`); rendered maps carry each palette entry's material, so viewers never need it.
- Grid resizes keep every channel on its tiles (like the fog); layers copy and delete with their painting.

### Who sees what

Players get the painting only on the tiles they see (known, visible, and the fog's edge ring); objects and connections
there only. Hidden pictures (the Images eye) aren't in their composed picture. With a painting, players' composed
picture is transparent where no picture lies (WebP with alpha) and black outside their tiles, as before.

### Rendering (`frontend/src/maps/painter/`)

- The map's WebGL context gets a second program, the **painter**: before the map shader draws, the painter draws the
  part of the map in view into a texture (a framebuffer the canvas's size), then the map shader uses it under the
  pictures (`base = paint × (1 − picture alpha) + picture`), and fog and grid go on top as before. No painting: nothing
  changes.
- Per pixel: the tile data (one RGBA texture: terrain, roads, rivers, flow; one for the road and river kinds) and the
  palette (a 256 × 4 texture: material, three colours). **Transitions** are one system, not pairs: the point is
  wobbled by noise, the tile whose centre is nearest wins (the Voronoi of tile centres is the square or hex grid
  itself), and near the border with the second nearest the two materials blend within a band (each material's own
  fade: dithered stipple in sketch, soft in diorama). So any terrain meets any other, inside about a tile.
- **Materials** are GLSL functions of the world point, the tile's seed and its three colours (seamless: world space;
  varied: the tile's hash changes density, glyph sizes, tones). Glyph materials (trees, tufts, hills, mountains) scatter
  glyphs on a jittered grid, check 3 × 3 cells, draw back to front, and keep a glyph only where its centre's tile has
  the same terrain (organic forest edges, whole trees).
- **Roads and rivers**: each connection is an arm from the tile's centre to the edge's middle, wobbled in world space;
  arms of the 3 × 3 tiles around are unioned with a smooth minimum (rounded joins, junctions). Rivers are water with an
  ink bank; roads a band (dashed for trails, cobbles for paved).
- **Objects**: one quad each (drawn after the terrain into the same texture), a signed-distance drawing per type and
  variant; size in tiles from the anchor tile's centre, so the same object works on square and hex grids.
- **Styles**: sketch = flat colours, ink outlines and hatching on the map's background; diorama = the world snapped to
  a pixel grid (24 per tile), light from the top left with soft shadows cast by trees, hills and buildings, colours
  posterized into ramps, a warm light and a vignette.
- **Animated**: a time uniform (trees and tufts sway, water ripples, rivers flow along their out bits); the map redraws
  every frame only then.

### Performance

- Storage and traffic: RLE channels and a small palette; no pictures. Players' composed picture only when the map has
  pictures (as before).
- GPU: one pass for the visible part only (the map renderer's view rect), loops of fixed small size, no per-tile
  geometry; static maps draw once per change; `make gpu-check` builds the painter on every backend and reports how long
  its build takes.
- Building the shaders: Windows browsers translate them to Direct3D, whose compiler inlines every call and unrolls every
  loop that reads no texture; the first version took 50 s to build there and froze the browser (see "After the first
  try"). So: each big piece is in the code once, in a loop that reads a texture (ANGLE keeps those as loops); the
  programs are built for the painting's style only; they build in the background (`KHR_parallel_shader_compile`) and
  nothing waits for them (the painting is the background colour until they're ready); the editor starts them when it
  opens. About 3.5 s (sketch) or 5 s (diorama) the first time on Direct3D, in the background; then the browser's cache
  (milliseconds). Vulkan, OpenGL and Metal take milliseconds.

## Steps

- [x] Backend: catalogue, data (RLE, palette), commands (`paint.settings`, `paint.tiles`, `paint.connect`,
      `paint.objects.save/delete`, `images.hide`), render per viewer, resize and layers, composed picture with alpha.
- [x] Renderer: painter program, framebuffer, map shader blend, objects; a dev page (`painter-check.html`) with
      sample maps for both styles; gpu-check covers it.
- [x] Art: sketch materials, roads and rivers, objects.
- [x] Tools: Images tool (pictures out of the Layers tab), Terrain, Roads & rivers, Landmarks; Details tab settings.
- [x] Art: diorama.
- [x] Animation.
- [x] Docs (locations concept, requirements, glossary, decisions), tests, checks in the app.

## Tests

Backend: RLE round trips, painting and erasing tiles, palette reuse and pruning, connections both ways (square and
hex), players' painting cut to their tiles, resize, objects. Frontend: the painter builds (gpu-check), tools send the
right commands, decoding.

## Changes from the draft

- **Names**: the draft's tile, path and object tools are **Terrain**, **Roads & rivers** and **Landmarks** (clearer to a
  DM, and "Paths" is already the treasure paths); their icons: a brush over a globe, a river past a road, a castle.
- **Art is procedural** (GLSL), not pictures: nothing to download or store, any colour, seamless variation, both styles
  from the same data; a type's three colours are its uniforms. Fewer variants per style where a shader does better.
- **Transitions**: one system (noise-wobbled Voronoi of tile centres, a blend band), no hand-made pairs; shores stay sharp
  and inked.
- **Roads and rivers are connections between tiles** (a bit per direction per tile), so junctions come free and rivers
  keep their direction; a stroke joins the tiles it crosses (filled in when the pointer skips tiles).
- **Landmarks** got an eye (a secret castle) and a DM-only name, like the other map things; "Another look" cycles the
  random variant.
- **Pictures**: the Images tool also has an eye (left out of players' composed picture) and names.
- **Diorama extras**: dithered tone ramps, cast shadows, darker-tone outlines instead of ink, and a Stage-only tilt-shift
  (the editor stays sharp for painting).
- **Not done yet**: local maps; undo; a fill bucket. Erasing a road on a tile clicked alone clears all its connections.
- **Commits**: the session's permissions refused `git commit` (also on this branch), so the work is left uncommitted on
  `feature/map_painter` for the user to commit.

## After the first try: the browser froze

The user's first stroke froze Chrome (Windows), then the console filled with "attempt to use a deleted object".

- **The freeze**: the painter's shaders were built at the first stroke, synchronously, and Direct3D's compiler took
  50 s on them (Vulkan: 14 ms). Chrome's GPU process (every tab) waited. ANGLE marks a loop `[loop]` only when it reads
  a texture; the others were unrolled, so the glyphs (15 cells × every glyph's code, three call sites, each cell a
  9-tile region search) grew huge. Fixed: the region grounds and the glyphs are each one call in a two-pass loop reading
  their colours, a glyph's base reads its tile (the tile is the nearest centre's: same result, no search), the roads read
  their tiles in their loop (50 s → 7 s); the programs are built per style (→ 3.5 s sketch, 5 s diorama); and they build
  in the background (`Painter.state`: building, ready, failed), started when the editor opens (`paintable`), the tools
  saying "Getting the painter ready…" meanwhile. `gpu-check` reports the build time per style and fails past 20 s.
- **The errors**: React's StrictMode (dev) unmounts and mounts again; the map renderer disposed the painter on the first
  unmount but kept using it. Fixed: it forgets a disposed painter (a new one is made), and a disposed painter does
  nothing.
- Tests: `maps/painter/renderer.test.ts` (no build is waited for; the background colour until ready; a style change
  builds again; a disposed painter makes no GL call). `painter-check.html?strict=1` renders in StrictMode; `wait=1`
  builds synchronously (headless screenshots: virtual time runs ahead of a background build).

## Checks

- Backend: `tests/test_map_paint.py` (RLE, palette, connections square and hex, landmarks, resize, players' cut, hidden
  landmarks and pictures, the composed picture's alpha, layers seen through).
- Frontend: `maps/painter/data.test.ts` (the RLE matches the server's bytes; previews), `maps/painter/tools.test.tsx`
  (strokes, connections, placing; the Stage shows none of the painter's tools).
- `make gpu-check`: the painter builds and draws in both styles, square and hex, on Direct3D 11, Vulkan and software.
- The look: `frontend/painter-check.html` (dev only) paints a sample world with every type (`?style=diorama&grid=hex&
  zoom=2&animated=1&tilt=1`, `bench=1` times the painter). About 4 ms a frame at 1920 × 1080 on a desktop GPU.
- Not checked in the signed-in app (the session couldn't sign in).
