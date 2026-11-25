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
- **Location map** (beside New location): how the places connect, to see how the world can be travelled.

## Location map

Locations → Location map (`/locations/map`): the locations the member sees, as a graph (drawn like the
relationship graph):

- A **line** is a link on a place's map to another place (see "Resources on tiles"): an arrow when only one
  map links to the other, a plain line when both do. Players get the links they'd see on each map: not on tiles
  unknown to them.
- A **dashed line** goes from a place to the place it's **part of**.
- Places that are part of the same place **share a colour** and sit in a **soft region** of it (with their
  parent); regions nest (a town's region inside its land's). Places in no region are grey. The layout pulls each
  region's places together.
- **Click a place** to open its page. Wheel zooms, drag pans, nodes can be dragged (not saved).

## A location's page

The page uses the whole width and height under the Saga's header (the DM needs room), and **Full screen** puts
the whole page in the browser's full screen. The map takes most of it (pan with a drag, zoom with the wheel or
the buttons, "Fit"). Over the map, the **map tools bar** (plan 45; the same as on a Map Set, see `stages.md`): its first
row the tools (**Selection**: Select, or Move to drag tokens; **Fog**; **Links**; **Tokens**; **Paths**; **Regions**;
**Labels**), its second row the open tool's tools. A kind of things (links, tokens, paths, regions, labels) starts its row
with **☰** (the layer's list: a click on a name selects it; its **eye**: players see it or only the DM; **rename**;
**delete**) and **＋** (add one: it's selected, ready to draw or place), then the selected one's name and tools. A
click on a thing on the map with its tool open selects it too. **Esc** steps back (a tray, then drawing or placing,
then the selection, then back to Selection). The whole map's settings are tabs in a side panel, and the map stays in
place while switching between them:

The whole map's tabs:

| Tab | What the DM does |
|-----|------------------|
| **Details** | Name, icon, description, **part of** (the parent, picked with the resource picker), **tags**, who sees it, the places inside (and "+ New place inside") |
| **Grid** | Square, hex or none; tile size; tiles X and Y; **fog of war** on or off; the tile's physical size; line look |
| **Background** | The **no-map colour**: what shows where no picture covers the map (black by default) |
| **Layers** | The map's layers (see "Layers": add, rename, order, delete); ✎ in a layer's row picks the **layer being edited**; under the list, its **Pictures** |

The layer's pictures (in Layers, under the layer picked): upload them; drag them on the map (with the Selection tool),
snapping to the other pictures' edges, to the grid, or off; scale; order; remove. The bar's tools work on the layer
being edited.

Players get the page read-only: the map as they may see it (their fog, the paths, regions and links they may see), the
description, tags and places inside; a layer picker when the map has more than one. Clicking a resource on the map
opens it (the resource view).

The map is drawn for the part of it in view, at the screen's resolution, so the grid, the fog's edges and the pictures
stay sharp at any zoom; pictures are smoothed both ways (mipmapped when zoomed out, bicubic when zoomed in past their
resolution).

## Layers

A map has one or more **layers**, in order (floors of a tower, the cave under the forest, the same place by night):

- **The whole map's**: the grid, the fog (one fog for every layer), the no-map colour, and the layers' list.
- **Each layer's**: a name, **see-through** (where it has no picture, the layers under it show), its **pictures**, and
  its **tokens, links, paths, regions and labels**.
- Viewing a layer shows its pictures and, where it's see-through, those of the layers under it (down to one that
  isn't), over the no-map colour; and only its own tokens, links, paths, regions and labels. Players get one composed
  picture per layer and fog (signed, like the map's).
- The Layers tab: first the list (add a layer on top, rename, see-through, move up and down, delete with what's on it;
  a map keeps one; the layer being edited is outlined), the ✎ starting each row picks it, then the layer's tools.
- A token moves to another layer from the Tokens tool, or with a click in a Map Set's Move tool (on the same tile).
- Maps from before layers have one layer, "Map", with everything they had.

## The map painter

Plans 47 and 48. Instead of (or under) pictures, the DM **paints** the map on its grid, in the map editor only (the
location page and a map Set's full editor; never a Stage's tool row), in **layers**, bottom to top: **terrain**
(grounds and water), **routes** (roads and rivers), **scenery** (forests, mountains, settlements) and **features**
(unique things). One tool each on the map tools bar, after the **Images** tool (the pictures). Pictures always lie
**over** the painting.

- **Settings** (Details tab, *Map painting*; the whole map's): the **style**, **Storybook** (flat colours, ink
  outlines, paper grain: a hand-drawn fantasy map; plan 48 renamed it from sketch and dropped the diorama style; more
  styles will come); the **map type**, **world map** (local maps, battlegrounds, come later on the same system);
  **animated** (trees and grass sway, water ripples, rivers flow, sails turn, birds fly, clouds drift).
- Every painting tool picks a category and a type, has **Paint**, **Erase** and **Pick** (the eyedropper: a click on a
  tile takes its type and colours, then Paint again), and the type's **three colours** (each type names what they
  paint: a forest's needles, shade and trunks), **↺** right after them putting the type's own back.
- **Terrain**: Ground (grassland, sand, cracked earth, rock, snow, marsh, farmland, ash), Grass (low, tall), Water
  (ocean, lake), with a brush (size, round or square). Drag on the map: the stroke shows at once, saved when released;
  **[** and **]** change the brush. **Transitions** are one system for every pair: borders wobble with noise around the
  tile centres and the two blend within a dithered band, inside about a tile; water meets land with a sharp shore in the
  water's third colour (its shoreline, sandy by default; its foam is a lighter shade of its deep colour). Each tile
  varies at random, seamlessly.
- **Routes**: Roads (dirt road, paved road, trail), Modern (highway, railway, light road), Rivers (river, stream). Drag
  from tile to tile: each step joins two neighbouring tiles; where several meet, a junction. A river flows the way it
  was drawn. Erasing parts tiles along the drag, or clears a tile clicked alone. Changing between square and hex grids
  clears them (their directions mean another thing).
- **Scenery**: Forests (pine, broadleaf, redwood, dead trees, palms), Mountains (hills, mountains, snowy peaks,
  volcano), Settlements (city, town, village, farms, castle, keep, ruins), painted on tiles with a brush like terrain
  and drawn standing over the terrain and routes: tiles of one type join into one forest, range or city (organic edges;
  trees and peaks rise over the tiles behind them). Castles and keeps get a wall along their outer tile edges, towers at
  its corners and gates where a road goes through; ruins a broken wall.
- **Features**: Buildings (tower, windmill, lighthouse, temple), Places (mine, cave, camp, standing stones, portal,
  monument), Sky (birds, clouds: over everything, moving). ☰ lists them (select, eye, rename, delete); ＋ then click tiles
  to place them (Esc stops). Each has a **size** in tiles (so it fits square and hex grids), a **look** among its type's
  ("Another look" changes it), and its three colours. Scenery and features stand in one depth order: what is nearer
  (lower on the map) covers what is behind it.

**Art as assets**: what can be painted and how each style draws it is data, one folder per style
(`backend/sagacraft/map_painter/styles/<style>/`: JSON for each layer's types, SVG sprites for scenery and features),
served to every browser (cached); see `docs/concepts/map-painter-art.md`.

**Kept as data, drawn by every browser**: a layer's painting is a palette (type and colours) and per-tile channels
(terrain, scenery, roads, rivers, their kinds and the river's flow) run-length encoded, plus its features: a few hundred
bytes for a whole map, no pictures. Players get only the painting of the tiles they see (known, visible, and the fog's
edge ring), no hidden feature, no feature names. Layers seen through show the painting under them where the upper one
painted nothing. The first time a browser on Windows shows a painting it takes a moment to get the painter ready (the
map shows meanwhile, the painting appears when it's ready; the editor gets it ready when it opens; the browser keeps it
for the next times). Each browser draws the part in view on the GPU (the ground in one pass, the sprites in one more),
and only again when the painting, the view or the time (animated) changes.

## Pictures

A map is one or more **pictures** placed in map pixels: one big picture, or many put side by side (the tiles of
a big map) or on top of each other. Maps are **grid first** (plan 46): the DM sets the grid, then places and sizes the
pictures on it (the grid never follows them). While dragging, a picture snaps to the other pictures' edges (so tiles
meet exactly) or to the grid lines. The picked picture has **handles**: its corners resize it (the opposite corner
stays), the round handle above it turns it (Shift: by 15°); it can be **flipped** across (X) or down (Y) and turned by
90°. A picture keeps its own scale, angle and flips; players' composed picture draws them the same. Each layer has its
own pictures (see "Layers"). They're the **Images** tool on the map tools bar (plan 47): ☰ lists them in drawing order
(**eye**: only the DM sees it, players' composed picture leaves it out; rename; delete), ＋ uploads one, the picked one
can be sent back or brought forward. On a painted map, pictures lie over the painting (players' composed picture is
transparent where no picture lies).

How many pictures a map holds, and how big each may be, are the "Location map pictures" upload limits.

## Grid

| Setting | Meaning |
|---------|---------|
| Type | **Square**, **hex** (pointy-top, odd rows shifted half a tile) or **none** |
| Tile size | In map pixels (square: its side; hex: its width); 100 by default |
| Tiles X, tiles Y | How many tiles across and down (the pictures don't change them) |
| Fog of war | On or off (see "Fog of war") |
| Physical size | What one tile is at the table ("5 ft", "1 mile", "1 day"): a scale legend on the map |
| Lines | **Contrast** (the default: black or white at each pixel, against the map under it), **a color** or **inverse** (the inverse of the map's colour at each pixel); opacity (0.5 by default); width (0.5 px by default; as seen unzoomed, fitted: zooming in thickens the lines like the rest of the map; a map Set's own zoom does too) |

The grid starts at the map's top left (older maps keep the offset they had; it's no longer set in the Grid tab).

**Tiles are counted from the grid's top left corner** (the origin): a tile is (column, row). Everything that
sits on tiles (fog, links, paths) is kept by column and row. So:

- changing the tile size moves things *with* their tiles;
- adding tiles adds empty ones at the end; removing them drops the last columns or rows (and what was on them).

The grid is drawn by the graphics card, per pixel (from its distance to the tile's edge), never as one shape
per tile: a 40 000-tile grid costs the same as a small one.

## Fog of war

Off by default (everyone who sees the map sees all of it); turned on in the **Grid** tab. When on, each tile has a
state **for each member group** (see `sagas-and-access.md`); the DM paints the **players'** (viewers see what players
see; older maps keep what other groups had):

| State | On the location page (flat) |
|-------|-----------------------------|
| **Unknown** | Black |
| **Known** | The map in black and white (greyed); the grid line between known and visible tiles turns grey |
| **Visible** | The map in colour |

A member sees, on each tile, the best state among their groups (e.g. a player who is also a scout). Groups with
nothing painted see everything unknown.

**Painting** is meant to be quick (the **Fog** tool on the map tools bar, always for the players): a state
(keys **V**, **K**, **U**), a brush size (**[** and **]**) or a rectangle, and drag. The stroke shows at once
and is saved when released. "Reveal all", "All known", "Hide all" fill the whole map.

**Players never receive what they don't know**: they get one picture composed by the server for their fog
(black outside the tiles they know and the unknown tiles touching them: the **edge ring**, where the immersive
fog's soft edge is drawn), their fog states, the links on tiles they know, and the paths and regions
shared with them. The DM's pictures and fog layers stay with the DM.

On Stages, map Sets draw the fog with one of the Saga's **fog presets** (below).

## Fog presets

How map Sets draw the fog of war for everyone, built by the DM on the **EFX** page ("Fog presets", next to
"Environments"; the old Locations address leads there); on the Stage a Map only **picks** one (chips in its settings and Play menu). Every Saga starts
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

- The DM's **Links** tool: **＋** opens the **resource picker** (the location's sub-locations suggested first), then a
  click on a tile puts them there. A link is selected from ☰ or by clicking its icon; **Move** (click another tile),
  **Open** (its resource).
- Each link has its own **eye** (plan 45): hidden, only the DM sees it (faded).
- Members see an icon for each resource they may see, on tiles they know, unless the link is hidden. Clicking it opens
  the resource (in map Sets, only for the roles the DM allows).

## Paths

A path is a list of tiles **in order**: the party's journey, a treasure trail, directions. Its look:

| Setting | Options |
|---------|---------|
| Body | **solid**, **dashed**, **dotted** (a line); **arrows** (chevrons) or **arrowheads** (filled): a string of them along the way, with no line |
| Tail (start), head (end) | none, arrow, circle |
| Shape | **poly**: straight from tile centre to tile centre; **spline**: curves through the middle of each edge it crosses, perpendicular to it (the entry and exit edges come from the previous and next tiles) |
| Color, width | Width: **thin**, **normal** (the default) or **bold** |
| Progress | 0–100% (default 100): how much of it is drawn, from its start; the head sits at the cut. Progress on a route: the whole path stays, the DM slides how far the party got (the map follows while dragging). Players get only the tiles up to the cut, never the route ahead |
| Who sees it | The eye: players (the default) or only the DM |

Lines, arrows, heads and tails all have a **contour** in black or white, whichever stands out from the path's colour
(`color/theory.bestInk`), so they read on any map.

Drawing: **＋** adds a path, drawing at once (or pick one and **Draw**): click tiles in order (clicking the last one
again removes it); **Undo** (the last tile), **Reverse**, **Clear**. Not drawing, a click on a tile picks the path through
it.

## Regions

A region is a **named group of tiles**: a kingdom, a forest, a district, the dragon's hunting grounds. The
tiles needn't touch (islands) and may leave holes.

| Setting | Options |
|---------|---------|
| Show | **Fill** (the tiles get a colour), **border** (only the outline), or **both** |
| Fill | Colour, opacity |
| Border | Colour, width (thin, normal, bold), line (solid, dashed, dotted); a dark contour like paths |
| Shape | **Tile edges** (the outline follows the tiles exactly) or **spline** (a smooth curve through the middle of each border edge: straight runs stay straight, corners round off, a hex border's zigzag smooths out); the fill follows the same shape |
| Name | Shown on the map (on the tile nearest the region's middle), or not |
| Who sees it | The eye: players (the default) or only the DM |

**Painting**: **＋** adds a region (or pick one), **Add** or **Remove**, then drag a brush (sizes, **[** **]**) or a
rectangle on the map (none selected, a click on a tile picks the region there); the stroke shows at once and is saved when released. While one region is edited, the
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
| Who sees it | The eye: players (the default) or only the DM; players also see it only on a place they know (known or visible tile) |

Pins (and ping pins) have a soft gradient: light at the top, the colour, then darker.

**Placing**: **＋**, then click the map (its text is its name: rename it in ☰); pick a label in the list or on the
map; **Move**, then click the new place. The editor shows every label's text.

## Tokens

**Mobile tokens** sit on a map's tiles and move: the **Tokens** tool (location page, the Map Set's Full editor):
"＋" a **character** or an **item** (picked), a **group** of characters, or a **custom** one (a name and a picture
uploaded on the spot, category "Token pictures": temporary, deleted with the token or when replaced). Click a tile to
place it (it's selected); each has a **size** (1 to 10), a **layer** (it moves to another, on the same tile) and an
**eye** (players see it, the default, or only the DM); a custom one can be renamed.

- **Look**: the resource's icon (else its face crop, else its initials); a group's initials; a custom one's picture or
  initials.
- **Shape**: size 1 is round. On a square grid a size n token covers n×n tiles as a rounded square; on a hex grid a
  cluster of hexes (2 → 3 hexes, 3 → 7: a hex and its ring, 4 → 12, 5 → 19, 6 → 27, 7 → 37, on to 10), outlined as one
  shape.
- **Border**: as thick at every size as a size-1 token's, and on a larger token drawn inside its shape (never past its
  tiles). A character's in its player's colour (several players: white; no player: black) in the style of its
  display template (Gradient by default);
  an item's in its owner's colour, by the same rule; a group's in the group's colour; a custom one's black. A black
  border has a light hairline so it shows on dark maps.
- **Moving**: the DM drags tokens (the Tokens tool; a Map Set in Play with Move, where a click moves one to another
  layer); they follow the pointer and snap to
  the tile they're dropped on. Moving or adding tokens doesn't redraw the players' composed picture.
  While one is dragged (plan 39) it's drawn over every token, with **where it was** (dashed), **where it would land**
  (the tiles, bright gold) and **"Distance moved: 15 ft"**: tiles (a square's diagonal counts one; hex steps) × the
  grid's distance per tile, else in tiles. On a Map Set of the live Stage the others see the same, live, as the DM
  drags (each where they'd see the token: shared with them, not under their fog where it was or where it's going);
  nothing is saved until the drop.
- **Values**: a character's token shows what its display template's *Token* mode places: on the token, and in hover
  trays (left, right, top: the name by default, bottom) while the pointer is on it. Map links to characters use the
  same template.
- Players see a token when it's shared with them and not on a tile their fog hides; a character or item they can't
  see shows as "?".

## Pings

On a Map Set of the live Stage, players and the DM ping a tile (see `stages.md`, "Map Set"): it glows in their
colour, with a contour, a pin and their name, for 10 seconds, for everyone who sees the Set; a notice in the screen's
top right corner says who pinged, and clicking it centres the map on the tile.

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
