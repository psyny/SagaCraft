# Locations and maps

A **Location** is a resource (see `rulesets.md`) that represents a place and its **map**: a world map, a region,
a town, a tavern, a battleground. Locations nest (**sub-locations**: a town is *part of* a region), and each
has a map built from pictures, with a grid, fog of war, resources placed on tiles, paths and regions. Map Sets put
them on Stages (see `stages.md`).

## The Locations tab

A tab for every member (players see the locations shared with them, like any resource):

- **New location** (DM).
- A list of locations as cards (icon, name, tags, what it is part of, how many places are inside), with:
  - **search by name**,
  - **Top level only**: locations that aren't part of another one,
  - **tags**: the DM's tags (picking several shows the locations that have all of them).
- A location whose parent a player can't see shows to them at the top level: they don't learn the parent exists.

## A location's page

The page uses the whole width and height under the Saga's header (the DM needs room), and **Full screen** puts
the whole page in the browser's full screen. The map takes most of it (pan with a drag, zoom with the wheel or
the buttons, "Fit"); the DM's tools are tabs in a side panel, and the map stays in place while switching
between them:

| Tab | What the DM does |
|-----|------------------|
| **Details** | Name, icon, description, **part of** (the parent, picked with the resource picker), **tags**, who sees it, the places inside (and "+ New place inside") |
| **Pictures** | Upload the map's pictures; drag them on the map (snap to the other pictures' edges, to the grid, or off); scale; order; remove |
| **Grid** | Square, hex or none; tile size; offset; columns and rows (or follow the pictures); the tile's physical size; line look |
| **Fog** | Turn fog of war on; paint it per member group |
| **Links** | Put resources on tiles |
| **Paths** | Draw paths over tiles |
| **Regions** | Name groups of tiles and show them (filled, outlined or both) |

Players get the page read-only: the map as they may see it (their fog, the paths, regions and links they may see), the
description, tags and places inside. Clicking a resource on the map opens it (the resource view).

## Pictures

A map is one or more **pictures** placed in map pixels: one big picture, or many put side by side (the tiles of
a big map) or on top of each other. While dragging, a picture snaps to the other pictures' edges (so tiles meet
exactly) or to the grid lines. A picture keeps its own scale. For now this is a tile editor; composing
battlegrounds (props, rotation, layers) comes later.

How many pictures a map holds, and how big each may be, are the "Location map pictures" upload limits.

## Grid

| Setting | Meaning |
|---------|---------|
| Type | **Square**, **hex** (pointy-top, odd rows shifted half a tile) or **none** |
| Tile size | In map pixels (square: its side; hex: its width) |
| Offset | Moves the grid over the pictures (X, Y) |
| Columns, rows | How many tiles; "Follow the pictures" keeps them covering the pictures |
| Physical size | What one tile is at the table ("5 ft", "1 mile", "1 day"): a scale legend on the map |
| Lines | **A color**, **contrast** (black or white at each pixel, against the map under it) or **inverse** (the inverse of the map's colour at each pixel); opacity; width |

**Tiles are counted from the grid's top left corner** (the origin): a tile is (column, row). Everything that
sits on tiles (fog, links, paths) is kept by column and row. So:

- changing the tile size or the offset moves things *with* their tiles;
- adding columns or rows adds empty tiles at the end; removing them drops the last columns or rows (and what
  was on them).

Setting the grid up is a first step (before painting fog or placing links); the Grid tab says so when the map
already has things on tiles.

The grid is drawn by the graphics card, per pixel (from its distance to the tile's edge), never as one shape
per tile: a 40 000-tile grid costs the same as a small one.

## Fog of war

Off by default (everyone who sees the map sees all of it). When on, each tile has a state **for each member
group** (see `sagas-and-access.md`):

| State | On the location page (flat) |
|-------|-----------------------------|
| **Unknown** | Black |
| **Known** | The map in black and white (greyed); the grid line between known and visible tiles turns grey |
| **Visible** | The map in colour |

A member sees, on each tile, the best state among their groups (e.g. a player who is also a scout). Groups with
nothing painted see everything unknown.

**Painting** is meant to be quick: pick the groups painted for (players and viewers by default), a state
(keys **V**, **K**, **U**), a brush size (**[** and **]**) or a rectangle, and drag. The stroke shows at once
and is saved when released. "Reveal all", "All known", "Hide all" fill the whole map.

**Players never receive what they don't know**: they get one picture composed by the server for their fog
(black outside the tiles they know and the unknown tiles touching them: the **edge ring**, where the immersive
fog's soft edge is drawn), their fog states, the links on tiles they know, and the paths and regions
shared with them. The DM's pictures and fog layers stay with the DM.

On Stages, map Sets draw the fog with one of the Saga's **fog presets** (below).

## Fog presets

How map Sets draw the fog of war for everyone, built by the DM in the **Locations** tab ("Fog presets", next to
"Places"); on the Stage a World map only **picks** one (chips in its settings and Play menu). Every Saga starts
with one, **White mist** (a soft, bright mist drifting slowly); the DM adds, duplicates, edits and deletes
presets, keeping at least one. A map using a deleted preset falls back to the first one.

The section has three columns: the presets (the first is the default), the picked preset's settings, and a
**live preview**: a sample map (a drawn terrain, no picture, under a square or hex grid) with visible, known and
unknown areas, as players will see it ("Players see") or as the DM does ("You see"). Sliders preview while
dragging and save when released.

| Setting | What |
|---------|------|
| Name | |
| **Display** | **Soft** (styled fog with organic edges, never in the tiles' shape: visible tiles are always fully shown and known tiles fully seen; the map's colour fades into the known tiles next to visible ones; the fog's soft edge is drawn in the edge ring, the unknown tiles touching known or visible ones; farther unknown tiles are all fog) or **Flat** (tile by tile: black, grey, the map) |
| **Style** | Mist, Smoke, Clouds, Ink, Parchment, Void, Nebula, Embers, Blizzard, Depths (soft only) |
| **Colors** | Three, each with a role in the style (below). Picking a style gives it its own; then any changes ("Reset" brings the style's back) |
| **Size** | ×0.25 to ×4: how big the fog's features are |
| **Intensity** | 0 to 100%: the style's main variable (below) |
| **Motion** | Still (0) to ×2: how fast it moves |
| **Edge** | Smooth to ragged: how organic the soft edge is |
| **Known tiles** | How much colour and light known tiles lose: 0 like visible ones, 50% grey (the default), 100% dark grey (both displays) |

| Style | Colours (1, 2, 3) | Intensity |
|-------|-------------------|-----------|
| Mist (drifting veils) | shadow, veils, light | denser, more contrasted veils |
| Smoke (curling) | dark, smoke, wisps | more curl, thicker wisps |
| Clouds (puffs over a sky) | sky, cloud shade, cloud | more of the sky covered |
| Ink (still, dark) | ink, grain, stains | more grain and stains |
| Parchment (old paper) | stains, paper, light paper | more stains |
| Void (a sky with twinkling motes of random sizes) | sky, stars, tinted stars | more stars |
| Nebula (space: glowing gas, dust, tiny stars; swirls and slides slowly) | space, gas, second gas | brighter gas |
| Embers (ash and smoke, glowing embers rising and flickering) | ash, smoke, embers | more embers |
| Blizzard (snow haze, flakes on the wind) | shadow, snow haze, flakes | harder snow, stronger wind |
| Depths (deep water, rippling light) | deep, water, light | brighter light |

The location page (the DM's editor) always shows the fog flat; the players' read-only location page uses the
default White mist look.

## Resources on tiles (links)

A tile can link to one or more resources (characters, items, other locations). Each shows as a **round icon
with a ring** (gold: character, blue: location, purple: item) on the tile; several on one tile share it,
smaller. The icon is the resource's icon (or its picture's face crop, or its initial).

- The DM clicks a tile (Links tab) to see and change what's there; "Link…" opens the **resource picker** with
  the location's sub-locations suggested first.
- Members see an icon for each resource they may see, on tiles they know. Clicking it opens the resource (in
  map Sets, only for the roles the DM allows).

## Paths

A path is a list of tiles **in order**: the party's journey, a treasure trail, directions. Its look:

| Setting | Options |
|---------|---------|
| Body | **solid**, **dashed**, **dotted** (a line); **arrows** (chevrons) or **arrowheads** (filled): a string of them along the way, with no line |
| Tail (start), head (end) | none, arrow, circle |
| Shape | **poly**: straight from tile centre to tile centre; **spline**: curves through the middle of each edge it crosses, perpendicular to it (the entry and exit edges come from the previous and next tiles) |
| Color, width | |
| Who sees it | like any visibility (hidden by default) |

Lines, arrows, heads and tails all have a dark **contour**, so they read on any map.

Drawing: pick or create a path, "Draw", click tiles in order (clicking the last one again removes it); "Undo
last tile", "Reverse", "Clear".

## Regions

A region is a **named group of tiles**: a kingdom, a forest, a district, the dragon's hunting grounds. The
tiles needn't touch (islands) and may leave holes.

| Setting | Options |
|---------|---------|
| Show | **Fill** (the tiles get a colour), **border** (only the outline), or **both** |
| Fill | Colour, opacity |
| Border | Colour, width (thin, normal, bold, heavy), line (solid, dashed, dotted); a dark contour like paths |
| Shape | **Tile edges** (the outline follows the tiles exactly) or **spline** (a smooth curve through the middle of each border edge: straight runs stay straight, corners round off, a hex border's zigzag smooths out); the fill follows the same shape |
| Name | Shown on the map (on the tile nearest the region's middle), or not |
| Who sees it | Like any visibility (hidden by default) |

**Painting**: pick or create a region, **Add** or **Remove**, then drag a brush (sizes, **[** **]**) or a
rectangle on the map; the stroke shows at once and is saved when released. While one region is edited, the
others fade.

**Borders** (regions and the map Sets' highlight) are the tile edges between tiles in the group and tiles out of
it (or off the grid), chained into closed loops: one per separate piece, and one per hole. On hex grids too.

## Labels

A label marks a place on the map without editing its picture: a village, a cave, "here be dragons".

| Setting | Options |
|---------|---------|
| Text | Up to 80 characters |
| Pin | **Pin**, **dot**, **star**, **flag**, **diamond**, or **none** (text only) |
| Text side | **Above** the pin (centred), on its **left** or its **right** |
| Size | Small, medium, large (follows the grid's tile size, so it keeps its scale with the map) |
| Pin colour | Any colour |
| Text on click | Players see only the pin; a click shows the text (another click hides it) |
| Who sees it | Like any visibility (hidden by default); players also see it only on a place they know (known or visible tile) |

**Placing**: "＋ New label", then click the map; pick a label in the list or on the map; "Move", then click the
new place. The editor shows every label's text.

## Icons and pictures (every resource)

Resources that can be shown can have an **icon** (small, round: in lists, pickers, on maps) and **several
pictures** (see `rulesets.md`, image attributes):

- **Characters**: the main picture (cards, sheets), other pictures to switch to (★ makes one the main picture),
  and an icon.
- **Locations**: an icon; their pictures are the map's.
- **Items** (pages to come): the icon wherever an item is linked, the picture when it's looked at in detail.

Each picture category has its limits (size, pixels and **how many per resource**), set by system admins;
**icons** are a category of their own (their size is the "icon image size").

## Universal tools

- **Resource picker**: a modal to pick resources: the kinds offered, favorites on top, search by name or tag.
- **Resource view**: any resource in a modal, as this member may see it: a character's view (its sheet, the
  informative template; an instance's own values from a Stage), a location's map (with a way back when going
  from map to map), anything else's pictures and values.

See `../implementation/08-locations-and-maps.md`.
