# Map painter art: how it's made and how to add to it

For people and AIs making art for SagaCraft's map painter (plans 48 to 51): new types (a jungle, a desert city, a
crashed starship), new looks for existing ones, or a whole new style. Everything here is **data**: JSON files and SVG
pictures. Style packs can use registered shader looks and tune their parameters in JSON. Adding a new look to the
renderer takes shader code.
Every asset follows **one perspective** (below).

The [world-map art direction and reference sheets](map-painter-styles/MAP_ART_STYLES.md) show the visual target for
each style. See the original [StoryBook sheet](map-painter-styles/StoryBook.png) and [Low Poly sheet](map-painter-styles/Lowpoly.png).

## One perspective

A painted map is seen from the front and from above, tilted (a camera pitched down, not an isometric view: only one
axis is turned). The map's layout stays the grid's (tiles are tiles, a road goes where it was painted); what changes
with the tilt is how each thing is drawn:

- **Standing things** (trees, mountains, buildings, towers, walls, people, boats): drawn from the front, a little from
  above. Their height goes up the screen; the top of a roof or a wall shows a little; what stands further down the
  screen is nearer and covers what's behind it. (Sprites, boundaries' boxes, waterfalls.)
- **What lies on the ground** (grass patches, sand dots, cracks, stones, tiles, bricks, fields, dunes, puddles, water's
  waves and ripples): foreshortened, its height on the screen about 0.62 of its width (the shader's `FORE`): a round
  stone is a wide oval, a square tile a wide rectangle, a field a wide patch. Raised things lying on it show their
  near side (the bottom of each cobble, tile and brick a little darker, the top edge catching the light).
- **Small marks standing on the ground** (grass strokes, tufts, reeds): upright, not squashed.
- **Ways on the ground** (roads, rivers): thinner where they run across the screen than where they run up it (about
  0.62 as wide across, full width up), smoothly in between. A river cut into the ground shows its **far bank** (the one
  up the screen, facing us) as a thin strip of earth in shade; so does the land's edge above water (lakes, the sea).
- **Light** comes from the top left (the north-west): lit faces toward it, shaded faces away (a slope facing north-west
  is lit, one facing south-east is dark).
- Nothing is seen straight from above, and nothing is seen straight from the side.

A new style may draw everything differently but keeps this perspective, so its standing things and its ground agree.

## What a painted map is

A painted map is drawn in six layers, bottom to top:

| Layer | What | Painted how | Drawn as |
|-------|------|-------------|----------|
| **terrain** | grounds and water: grass, sand, desert, snow, cobblestone, ocean... | a brush on tiles | the painter's shader: colours and **patterns** (no pictures) |
| **routes** | roads and rivers | dragged from tile to tile | the painter's shader: a **look** (dirt, paved, highway, river...) |
| **boundaries** | walls, fences, cliffs, hedges | strokes over the edges between tiles (plan 50): one per edge | the sprite pass: a **look** (fence, castle, cliff...) drawn as a box standing on each edge, plus SVG towers and gates |
| **scenery** | forests, mountains, cities, castles... | a brush on tiles | **SVG sprites** scattered over the tiles, standing up |
| **effects** | fireflies, mist, smoke, embers, falling leaves, bubbles... | a brush on tiles | **particles** drawn and moved by the sprite shader (and SVG sprites like scenery's) |
| **features** | one-off things: a tower, a windmill, a portal, birds, clouds | placed on a tile | **SVG sprites**, one feature at a time |

Each type has **three colours** the DM can change (its *roles*: a forest's needles, shade and trunks). The art uses
those three colours, so one drawing works in any colours.

The map is seen from the front and a little from above, like an old storybook map: things stand on the ground and rise
**up** the page; what is lower on the map is nearer and covers what is behind it. The light comes from the **top
left**: left and top faces are lit, right faces shaded.

## Where the files are

```
backend/sagacraft/map_painter/styles/<style>/
  style.json        the style: its name, its ink and night-light colours, how big sprites are rasterized
  terrain.json      terrain types (categories, types)
  routes.json       road and river types
  boundaries.json   boundary types (walls, cliffs, hedges, barriers)
  scenery.json      scenery types
  effects.json      environmental effect types
  features.json     feature types
  sprites/*.svg     the pictures scenery and features use, named in the JSON by file name (no ".svg")
```

The bundled styles are `storybook` and `lowpoly`. All styles share **type keys** and colour roles. A map stores keys
like `trees.pine` and the selected colours, and each style supplies its own artwork. Feature variants follow the same
order across styles so the map's saved variant selects the corresponding look.

The server reads the folder (and re-reads it when a file changes: edits show on reload, no restart) and sends the whole
style to every browser at `/api/map-painter/<style>`. Browsers put each sprite's colours in, rasterize it, and draw.

## A type (every layer)

```json
{"key": "trees.pine", "category": "forests", "name": "Pine forest",
 "roles": ["Needles", "Shade", "Trunks"], "colors": ["#5d7c4c", "#2f4632", "#6b4e2e"],
 "art": { ... how it's drawn: per layer, below ... }}
```

- `key`: `<group>.<name>`, lowercase, never changed once maps use it (renaming loses it on every map).
- `category`: one of the file's `categories` (the tool's Category menu); `name`: what the DM reads.
- `roles`: what each colour paints, in the tool (A, B, C). `colors`: their defaults, `#rrggbb`.
- Routes also have `"kind": "road"` or `"river"`; features a default `"size"` in tiles (1 to 4). (Every other type's
  kind is its file's: terrain, boundary, scenery, feature.)
- Order in the file is the menus' order.

## Terrain: `art`

```json
"art": {"patches": 0.6, "patterns": [
  {"kind": "strokes", "color": "b", "scale": 0.16, "density": 0.28, "size": 0.2, "strength": 0.8}]}
```

- The ground is colour A, in soft patches toward colour C (`patches`: 0 none .. 1 strong).
- Up to **two patterns** over it, each in one of the colours (`color`: `a`, `b` or `c`). Numbers are fractions:
  `scale` the pattern's cell in tiles (0.02 to 1), `density` how many cells get a mark (0 to 1), `size` how big a
  mark is in its cell (0 to 1), `strength` how strongly it shows (0 to 1).
- Any terrain blends into any other at their border by itself (no transition art needed).

| Pattern | Draws | Typical |
|---------|-------|---------|
| `strokes` | short V grass strokes | grassland |
| `stipple` | dots | sand, ash, grit |
| `cracks` | plates with cracks between (some left out: `density`) | cracked earth, rock, flagstones |
| `flecks` | light spots in cells | rock |
| `drifts` | soft large patches | snow shadows, sand ripples |
| `sparkle` | rare bright points (they twinkle) | snow, embers |
| `puddles` | water in hollows, inked | marsh |
| `reeds` | little reeds | marsh |
| `fields` | patches in two tones, furrows (`color`), hedges (C) | farmland |
| `tufts` | grass tufts (they sway) | low and tall grass |
| `dunes` | long wavy ridges with shaded slopes | desert |
| `cobbles` | rounded stones, grout (`color`) between | cobblestone |
| `tiles` | square tiles, grout lines, a checker (`density`) | tiled floors |
| `bricks` | brick courses, mortar (`color`) | brick pavement |
| `ice` | smooth plates, faint closed hairline cracks (`color`), soft streaks of reflected sky (C) | ice |
| `lava` | dark crust plates, molten cracks between them (glowing) | lava fields |

Patterns lying on the ground are foreshortened by the shader (see "One perspective"); `strokes`, `reeds` and `tufts`
stand upright.

**Water** is a terrain with `"fluid": true` instead of patterns: `{"fluid": true, "depth": 0.85, "waves": 0.3}`
(`depth`: how far from the shore it gets deep, in tiles; `waves`: how many wave marks). Its colours are the water, the
deep water (its foam is a lighter shade of it) and the **shoreline** (sandy by default). `liquid` picks its surface:
`ocean` (waves moving with the wind), `lake` (choppy water, plan 54: three short wave trains crossing, light on their
crests, their backs darker, fine ripples; moving when animated),
`lava` (its colours molten, highlights and crust; plan 53: bright wavy highlights, the crust in solid patches with
sharp edges (its third colour is also its shoreline), only the molten part glowing). Rivers flow into fluid terrain and
roads cross it on bridges; two liquids blend into each other through swirling noise.

## Routes: `art`

```json
"art": {"look": "dirt", "width": 0.03, "wobble": 1.0}
```

- `look`: `dirt` (ruts), `paved` (stones), `trail` (dashes), `highway` (white edge and middle lines), `rail` (sleepers,
  two rails), `light` (glowing edges, running pulses), `river` (water: small chevrons pointing downstream, moving when
  animated; its far bank shows), `lava` (small pieces of crust, its molten colour darkened, floating on it and riding
  its flow; jagged dark banks; it lights itself).
- Rivers flow either way (the Routes tool's Flow: direction A, B, or as the rivers they join); where one crosses a
  boundary it falls (see Boundaries: `falls`).
- `width`: half the route's width in tiles, the type's own (the tool's 25%; the DM paints from a fifth of it to four
  times it, plan 56; at most 0.4 in all: keep it under 0.1). Where a river meets a lake or the sea it opens to about a
  tile's edge. `wobble`: 0 straight (modern) .. 1 winding (old roads, rivers). A stream is a river at a
  small width: make a new route type only for a new look.
- Colours: the route, its edge or banks, its details (ruts, joints, lines, the river's light).

## Scenery: `art`

```json
"art": {"per_tile": 25, "densities": [[1, "Village"], [15, "Town"], [35, "City"]],
 "layers": [
  {"sprites": ["church"], "spacing": 0.9, "height": [0.38, 0.42], "keep": 0.35, "clear": true, "density": [15, 35]},
  {"sprites": ["church", "tower-house"], "spacing": 0.85, "height": [0.4, 0.46], "keep": 0.44, "clear": true, "density": [35]},
  {"sprites": ["house-1", "house-2", "house-3"], "spacing": 0.18, "height": [0.13, 0.18], "keep": 0.8, "density": [0, 35]},
  {"sprites": ["townhouse-1", "townhouse-2", "townhouse-3", "house-2"], "spacing": 0.18, "height": [0.17, 0.23], "keep": 0.9, "density": [35]}],
 "inset": 0.14,
 "night": {"fireflies": 0.25}}
```

- **layers**: each scatters its `sprites` (picked at random) on a grid over the painted tiles: `spacing` between them
  in tiles (or `[across, down]`), their `height` in tiles (a range: each is picked in it), `keep` how many of the grid's
  places get one (0 to 1), `jitter` how far from the grid they wander (default 0.8), `sway` how much they move in the
  wind (trees: 1). A layer with `"clear": true` (big buildings: a church, a keep) keeps the next layers' sprites off its
  foot: list it first. Sprites stand where their base lies on a tile of this type, so neighbouring tiles of one type
  make one forest or one town, with organic edges, and tall sprites rise over the tiles behind them. `fade` (0 to 1,
  organic things: mountains, hills, trees): their foot fades into the ground over that part of their height, along a
  noisy edge (hills 0.3, mountains 0.14, trees 0.07). `flame` (plan 53): a fire on each of its sprites (a bonfire's
  logs): `{"at": [x, y], "size": 0.75, "sparks": 2}`, `at` in the sprite's heights from its anchor (up is negative),
  `size` the flame's height in the sprite's heights, `sparks` rising from it; the flame is the sprite shader's (a
  tongue of fire flickering when animated, in the type's third colour, lighting itself day and night), so the sprite
  draws only the logs (embers in a `glow` group). Features' parts take the same `flame` (in a plain fire orange).
- **Density** (plan 56): how many sprites stand on a tile. The DM paints 1% to 100% of the **category's** most (its
  `per_tile` in `categories`: `{"key": "forests", "name": "Forests", "per_tile": 100}`; default 100): every type of a
  category on one scale (Forests and Settlements 100 a tile, Mountains 30). A type's own count (where the tray starts,
  and what a tile painted without a density shows) is its layers' (each `keep` over its spacing's area), or its
  `per_tile` when its layers show at some densities only. Painted at another count, its layers keep their mix: fewer,
  fewer of the grid's places kept (the same places, sparser); more, a finer grid (packed). A layer's `density`,
  `[from, to]` in sprites a tile (or `[from]`: and up), shows it only from that count and below the second (a town's
  church from 15; a city's towers and townhouses from 35, where its cottages stop). **densities**: the type's names for
  its counts, each from its value on, in order (`[[1, "Village"], [15, "Town"], [35, "City"]]`), shown in the tray's
  hint. Types that would differ only in how packed they are should be one type (a village, a town and a city are one).
- **inset** (castles, keeps, ruins): its sprites keep this many tiles inside its outer edges (no wobble), where its
  wall stands: walls are boundaries (plans 49, 50), painted on those tiles' outer edges.
- **night**: `fireflies` (0 to 1): glowing points over it at night.

## Boundaries: `art`

```json
"art": {"look": "castle", "height": 0.18, "thickness": 0.06,
        "corner": {"sprite": "castle-tower", "height": 0.34}, "gate": {"sprite": "castle-gate", "height": 0.3}}
```

A boundary stands on the **edges between tiles** it is painted on (plan 50; one boundary per edge, none along the
map's own edge, none between diagonal neighbours on a square grid). Each edge is a box: `thickness` and `height` in
tiles, seen like everything else (front, a little from above): a wall going up the page is a thin strip (its top), one
going across shows its face and its top, and it stands in the sprites' depth order (trees in front of it cover it). It
has no outline along its foot.

- `look`: how the sprite shader draws its faces (code: a new look is shader work):
  `fence` (posts, two rails, see-through), `palisade` (pointed stakes), `stone` (courses of stones), `brick`,
  `castle` (big blocks, merlons, arrow slits), `hedge` (bumpy leaves, a few flowers), `cliff`, `barrier` (glowing,
  see-through, light running up it; it lights itself at night).
- **Slopes** (`"look": "slope"`, plan 51): an inclined face reaching `run` tiles out from its edge toward its low side
  (a cliff is the same with no run): seen on every side (one facing away when it's gentler than the view), shaded by
  which way it faces (light from the north-west), its corners rounded; a river crossing it cascades down it.
- **Cliffs** (`"look": "cliff"`): each edge has a high side (a new one: the tile above it on the screen, so its face
  looks at the viewer; the tool's Turn swaps it); the rock face hangs below the edges whose low side faces the viewer,
  its top jagged, a rim in colour C; other edges show only the rim.
- `gaps` 0..1: how broken it is (ruined walls): pieces missing along it.
- `corner`: a sprite where it ends, turns or meets another boundary (towers), `height` in tiles. `gate`: a sprite where
  a road goes through it (a gatehouse). A road always opens a gap in it.
- `falls` (default true): a river crossing it falls there as a **waterfall**. The waterfall is the **river's**, not the
  boundary's: drawn in the river's look and colours (water, lava), the same over any boundary, in front of it (down a
  cliff's face, from a wall's top to its foot; white water where the drop isn't seen), mist (lava: sparks) at its
  foot. `false` (fences, hedges, barriers): the river passes through a gap.
- Colours: A the main face (stones, rails, rock), B shade and joints, C details (coping, moss, flowers, the cliff's rim).

## Effects: `art`

```json
"art": {"particles": [
  {"shape": "glow", "color": "a", "density": 9, "size": [0.07, 0.1], "lift": [0.04, 0.3],
   "motion": "wander", "amount": 0.2, "speed": 0.5, "night": true, "glow": true, "twinkle": 0.8}],
 "layers": [ ... optional, as scenery's: glowing mushrooms ... ]}
```

An effect is painted on tiles like scenery; its particles are scattered over its tiles (organic edges, like scenery)
and stand in the same depth order as the sprites (mist drifts between the trees; a tree in front covers it). They
move only when the viewer animates maps. Each entry of `particles`:

- `shape` (the sprite shader's; code: a new shape is shader work): `glow` (a bright core, a soft halo), `puff` (soft,
  ragged, shaded below: mist, smoke, steam), `spark` (a hot point with a short trail: embers), `leaf` (a pointed oval
  and its vein: leaves, petals), `bubble` (a thin ring and a highlight), `mote` (a point with a four-pointed twinkle),
  `flame` (a tongue of fire; see scenery layers' `flame`; it stands on its point, lifted by half its height: the
  Sparse fire and Wildfire effects).
- `color`: `a`, `b` or `c` (the type's colours; puffs are shaded with B, sparks, bubbles and motes lit with C).
- `density`: how many a tile (about; up to 40). `size`: their height in tiles (a range), `stretch` how many times as
  wide (mist: 2.4). `lift`: how high over the ground they float, in tiles (a range).
- `motion`: `still`, `wander` (around their place: fireflies), `rise` (up and fading: embers, smoke, steam, bubbles),
  `fall` (down to the ground: leaves), `drift` (sideways and back: mist), `pulse` (brighter and dimmer); `amount`
  how far in tiles, `speed` how fast (each particle a little faster or slower). `spin`: turns a second (leaves; a
  negative one turns the other way). `twinkle` 0..1: blinking.
- `night`: only seen at night (fireflies, wisps). `glow`: it lights itself (not darkened at night, it adds light).
  `opacity` 0..1.

## Features: `art`

```json
"art": {"height": 0.6, "variants": [
  [{"sprite": "windmill"}, {"sprite": "windmill-sails", "at": [0, -0.64], "size": 0.9, "spin": 0.12}]]}
```

- `height`: its height in tiles at size 1 (a size 2 feature is twice as tall).
- `variants`: its looks ("Another look" in the tool goes to the next); each a list of **parts**, drawn in order:
  `sprite`; `at` where its anchor goes, `[x, y]` in the feature's heights from the tile's centre (y up is negative);
  `size` its height in the feature's heights (default 1); `spin` turns a second around its anchor (sails); `sway`;
  `frames` two sprites shown in turn, `fps` how fast (wings flapping); `fly` circling this many tiles around (birds),
  `count` how many; `drift` tiles a second, back and forth (clouds).
- `"overhead": true`: drawn over everything (birds, clouds).

## Sprites (SVG)

A sprite is one self-contained SVG file in `sprites/`, for example `pine-1.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 64" data-anchor="0.5 0.94">
  <rect x="18.4" y="49" width="3.2" height="11" fill="var(--c)"/>
  <path d="M 18.4 60 L 18.4 49 L 21.6 49 L 21.6 60" fill="none" stroke="var(--ink)" stroke-width="1.1"/>
  <path d="M20 3 L26 15 ... Z" fill="var(--a)"/>
  <path d="M20 3 L26 15 ... Z" fill="var(--b)"/>
  <path d="M20 3 L26 15 ... Z" fill="none" stroke="var(--ink)" stroke-width="1.25" stroke-linejoin="round"/>
</svg>
```

Rules:

- **viewBox** gives its shape (any units; its aspect is kept). Draw it standing up, seen from the front and a little
  from above, the base at the bottom. Keep everything inside the viewBox.
- **`data-anchor="x y"`**: where it stands on the ground, as fractions of the viewBox from the top left (default
  `0.5 1`: the bottom middle). Put it at the middle of its foot. Sails, wings, clouds: their
  centre (`0.5 0.5`).
- **Colours**: `var(--a)`, `var(--b)`, `var(--c)` are the type's three colours (its `roles`, in order); `var(--ink)` the
  style's ink (outlines); `var(--light)` the style's night-light colour. Write them as presentation attributes
  (`fill="var(--a)"`, `stroke="var(--ink)"`). Fixed colours are fine for things that never change (white highlights
  at low opacity, black shadows at low opacity, a haystack's straw).
- **Light from the top left**: the lit side in `--a`, the shaded side in `--b` (or the lit colour under a black overlay
  at `opacity=".15"` to `".2"`), a few white highlights at `.25` to `.45` opacity.
- **Ink**: an outline in `var(--ink)` around the silhouette, about 1 to 1.5 units in a viewBox about 40 to 100 units
  tall (sprites are rasterized about 128 px tall: see `style.json`, `sprite_px`), round joins. Inner lines thinner or
  at lower opacity. **No outline along the foot** (plan 49): what stands on the ground has no ink line where it
  meets it (walls' bottoms, a door's sill, a mountain's base), so it sits in the ground rather than on it: fill the
  shape without a stroke and draw its outline as an open path that leaves the ground edge out.
- **Ground contact** uses transparent edges and depth ordering. Leave out baked spot shadows and ground plates.
  Fade organic feet into the terrain with an opacity gradient. A scenery layer can set `fade`, or an organic sprite
  can set `data-foot-fade` as a fraction of its height. Cliffs and slopes fade at their feet in the renderer.
- **Night**: lights people turn on at night (windows, lanterns, a lighthouse's lamp) go in a **top-level**
  `<g class="night">...</g>` group, in `var(--light)` or the type's colour; it shows only at night, with a glow. The
  same window drawn dark (`var(--ink)` at `.6` opacity) outside that group is how it looks by day.
- **Natural glows** (plan 53): what glows by its nature (fire, embers, lava, magic, glowing mushrooms) goes in a
  **top-level** `<g class="glow">...</g>` group: it shows at every hour, is never darkened by the night, and lights
  itself (the bloom around it, weaker by day). No halo: the painter's glow draws it.
- **Self-contained**: no `<image>`, no links (`href`), no `<script>`, no `<foreignObject>`, no `<text>`, no external
  fonts or CSS. Gradients and filters in `<defs>` are fine (give them ids starting with the sprite's name).
- Small: a few KB. Several variants of a thing (`pine-1`, `pine-2`, `pine-3`) make forests and towns less repetitive.
- **Size in the map** comes from the JSON (`height` in tiles), not from the SVG: draw at any size.

## The Storybook style's look

- Warm color washes, varied brown ink contours and selective directional hatching. Keep the main silhouette readable
  at 20 px and let the ink details show when zoomed in.
- Front view from a little above: houses show their front gable and their side wall (shaded) with the roof plane
  going back; mountains a lit left face and a shaded right face from the ridge; trees a silhouette lit on the left.
- Trees about 0.3 to 0.5 tiles tall, houses 0.13 to 0.23, keeps and churches 0.4 to 0.65, mountains 0.5 to 0.9.

## The Low Poly style's look

- Flat polygon faces define trees, mountains and buildings. The sprites use the painter's three colour roles and
  keep their upper-left lighting when scattered. Larger buildings show shaped towers, raised ledges, roof planes and
  selected masonry blocks.
- Ground and water use facets shaded in world space. Water keeps the shared shoreline and depth controls and the
  ground keeps the brush patterns for details such as reeds, furrows and paving.
- Fire uses angular tongues that flicker and bend, mist and smoke use overlapping planes, and sparks and lights use
  small diamonds. Rivers carry angular highlights downstream. Waterfalls use ribbons and broken foam, and lava uses
  moving crust plates with glowing seams. Arcane barriers and light roads have their own geometric pulses.
- The checked-in sprite SVGs can be regenerated from the project root with
  `python backend/scripts/build_lowpoly_sprites.py`. Preview them with `sprite-check.html?style=lowpoly` or on the
  sample map with `painter-check.html?style=lowpoly&grid=hex`.

## Adding to a style

- **A new type** (say a jungle): add its entry to the layer's JSON (a new `category` if needed: add it to the file's
  `categories`), give it `roles`, `colors` and `art`; draw its sprites (scenery, features) into `sprites/`. Add the same
  key, drawn its way, to every other style.
- **A new look for a type**: change its `art` (patterns, numbers) or redraw its sprites (same file names), or add
  sprite variants and list them.
- **A new style**: copy a style's folder to a new name, change `style.json` (`key` = the folder's name, `name`,
  `description`, `ink`, `light`), then redraw. The Details tab offers every style folder (`GET /api/map-painter`).

## Checking it

- `make be-tests`: the style loads, every sprite the JSON names exists, every sprite has a viewBox and an anchor and
  is self-contained, every pattern and look is one the painter knows.
- `http://localhost:3100/sprite-check.html` (the app running): every sprite in its type's colours, its anchor marked
  (`?night=1` at night, `?only=pine` some, `?size=200` bigger).
- `http://localhost:3100/painter-check.html`: a sample world with every type (`?zoom=2&x=400&y=200` closer, `?hour=22`
  at night, `?grid=hex`, `?animated=1`, `?weather=rain`).

## For an AI drawing a sprite: a prompt

> Draw an SVG sprite for SagaCraft's map painter, Storybook style: a [what], seen from the front and a little from
> above (the map's one perspective: a camera tilted down, not isometric), standing up, the base at the bottom. One self-contained SVG: `viewBox` about [w] × [h] units, its
> `data-anchor` at the middle of its foot (fractions of the viewBox, e.g. `0.5 0.94`), a transparent ground contact
> with no cast shadow or outline along its foot (fills without a stroke, outlines as open paths leaving out
> the edges on the ground). Colours only as `var(--a)` ([role A]), `var(--b)` ([role B]), `var(--c)` ([role C]) and
> `var(--ink)` for outlines (about 1 to 1.5 units wide, round joins); white highlights or black shading at low opacity
> are fine. Light from the top left: lit side `var(--a)`, shaded side `var(--b)`. Flat colours, few details, readable
> at 20 px tall. [Lit windows, lanterns: in a top-level `<g class="night">` group, in `var(--light)`; drawn dark outside
> it. Fire, lava, magic: in a top-level `<g class="glow">` group, no halo.] No images, links, scripts, text or fonts.
> Answer with the SVG only.

## Shader materials in `style.json`

Choose one registered look per material slot. Parameters are optional and use the look's defaults when omitted.
The illustrated defaults apply to slots omitted by the pack. The brush JSON files still control placement, palette,
particle density, motion and glow. The material controls how the renderer draws that brush.

```json
"materials": {
  "flame": {"look": "faceted", "params": {"flicker": 3.6, "heat": 0.8}},
  "river": {"look": "shards", "params": {"spacing": 0.18, "speed": 0.20, "contrast": 0.68}}
}
```

| Slot | Registered alternate look | Parameters |
|---|---|---|
| `ground` | `faceted` | `size` in tiles, `contrast` |
| `terrain_edges` | `angular` | `size` of the polygon grid, `offset` and `blend`, in tiles |
| `routes` | `segmented` | `segments` per curved tile, integer from 1 to 12 |
| `boundaries` | `faceted` | `scale` of the faces relative to boundary height, `contrast` |
| `water` | `faceted` | `size` in tiles, `speed`, `foam`, `swell` |
| `lava` | `plates` | `size` in tiles, `speed`, `glow` |
| `river` | `shards` | `spacing` in tiles, `speed` in tiles per second, `contrast` |
| `waterfall` | `sheets` | `width` relative to the fall's width, `speed`, `foam` |
| `flame` | `faceted` | `flicker`, `heat` |
| `particles` | `faceted` | `contrast` |
| `light_road` | `pulses` | `spacing` in tiles, `speed` |
| `barrier` | `shards` | `size` relative to wall height, `speed` |

`frontend/src/maps/painter/materials.ts` contains the look registry, defaults and parameter ranges. The renderer
compiles the selected looks into its ground and sprite passes in the background. Material changes affect appearance
on the saved map. The grid, placed features, painted regions and route directions are stored separately.

## When it needs code

New ground **patterns** and route **looks** are drawn by the painter's shader (`frontend/src/maps/painter/shader.ts`,
listed in `painter/data.ts` `PATTERNS` and `LOOKS`). For a new style material, register its name and numeric parameters
in `painter/materials.ts` and add its GLSL to the relevant pass. A pattern that lies on the ground is worked out in
ground space (foreshortened; see "One perspective"). After a shader change, run `make gpu-check` to test the bundled
styles and measure shader build times on Windows.
