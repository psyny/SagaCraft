# 56 - Map painter: scenery's density, routes' width

Status: Done
Requirements: LOC-94..LOC-96
Depends on: 55-map-painter-materials

## Goal

- **Scenery → Density**: a slider choosing how many of the type's sprites stand on each tile, from a few (a lone farm,
  scattered trees) to far more than before (a packed city, a dense forest). Types that differed only by how packed
  they were become one: Village, Town and City are one settlement type.
- **Routes → Width**: a slider for roads and rivers; Stream and River become one River.
- Two routes of different widths that meet **narrow or widen** from one tile to the next.

## UX

The DM, during prep. Scenery and Routes get one more tray on their tool row, like the brush's size: Density (1% to
100% of its category's most sprites a tile, one scale for every type of a category; a type starts at its own; its
hint: about how many a tile, and the type's named densities: Village, Town, City) and Width (5% to 100%: 25% the
type's own, 100% four times it). What's painted keeps its density and width; Pick takes them too. A river drawn into
another doesn't change the one it joins (its kind and width where they meet stay): a tributary widens into the river.

## Design

- A palette entry may carry `per_tile` (scenery: sprites a tile; none: the type's own) or `width` (roads, rivers:
  times the type's own; 1 left out), part of what the entry is (the same type at two densities: two entries). Commands
  `paint.scenery` (`per_tile`) and `paint.connect` (`width`) take them.
- Density: a scenery category's `per_tile` is its most (the tray's 100%: Forests and Settlements 100, Mountains 30);
  a type's own count is its layers' (or its `per_tile`). Painted at a count, its layers keep their mix: fewer places
  kept (the same places), or a finer grid. A layer can show only within a range of counts (`"density": [from, to]` in
  its JSON: a town's church from 15, a city's townhouses and towers from 35); a type names some counts
  (`"densities"`) for the tray's hint.
- Width: the palette's route width is the type's times the entry's. The ground shader works out each route's width
  along its curve: its tile's at the tile's centre, the two tiles' mean at the edge between them, so a link between two
  widths changes smoothly; a tile's piece and its neighbour's meet end to end (a plain union: no bump). Waterfalls take
  the river's width. At a shore a river opens to about a tile's edge (not a multiple of its width).
- A stroke's first or last tile that already has a route of that kind (other links than the stroke's) keeps its kind.
- Stored maps: City becomes the town type at 50 a tile, Village at 10, Stream a river at width 0.6 (in the old default
  colours: the new type's own; other colours kept). The first take's densities (times the type's own) are read as
  counts.

## Steps

- [x] A. Server: entries' density and width, the commands, the stroke's ends, the merged types and their migration.
- [x] B. Density in sprites; the Scenery tool's tray.
- [x] C. Width in the shader (transitions), waterfalls; the Routes tool's tray.
- [x] D. Docs, checks (both styles, square and hex, on the check page; in the running app: a city painted through
  the Density tray, a river widened downstream and a narrow tributary through the Width tray).

## Changes from the request

- Density, after a first take relative to each type's own (10% to 500%): the user asked for 100% to be the most (the
  old 500%) and the same count for every type of a category. The tray goes down to 1% (not 10%): on one scale per
  category, a keep (one building a tile) or a lone farm needs it.
- Width: 100% is the first take's 400% (four times the type's own), so the type's own is 25%; down to 5%.
- The first take smoothed the join of a route's pieces from tile to tile, which made a bump at every tile edge; and a
  river's mouth was its width times 2.4, too wide for wide rivers. Both fixed.
- Merged: Village, Town and City into one type, "Village, town, city" (cottages up to 35 a tile, a church from 15,
  townhouses and towers from 35). Castle and Keep stay apart (a keep is one building in the middle of its walls, not a
  sparser castle), as do Farms, Camp and Ruins (their own pictures). Stream became a river at 60% of its width.
- Added: a stroke's first and last tiles keep their kind where their route goes on elsewhere, so a narrow tributary
  drawn into a river doesn't narrow the river's tile (it widens into it).
- Effects keep their own densities (no slider): not asked; their particles would take one the same way.
- The ground shader reads each neighbour's width (two more texture reads per link, in the loop that already reads
  textures): its Direct3D build went from about 5.1 s to 5.4 s.
