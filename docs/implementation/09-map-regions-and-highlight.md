# 09 - Map regions, highlight zone and fog polish

Status: Done
Requirements: LOC-10, LOC-13, LOC-14 (changed), LOC-19, LOC-20, SET-43..46 (changed), SET-50
Depends on: 08-locations-and-maps

## Goal

Maps get **regions** (named groups of tiles, filled, outlined or both, with smooth or tile-edge borders), and
the map Sets' **highlight** becomes a zone: everything else darkens and the highlighted tiles get a splined
border, drawn by the same border code as regions. Paths' arrow bodies become strings of arrows with no line, and
every line, head and tail gets a contour. The immersive fog fades from visible into unknown tiles too; Void uses
the fog colour and smaller motes; a new Nebula style. The map tools use the whole window.

## Out of scope

- Clipping paths and regions to the tiles players know (open question).
- Regions as resources (with pages): they are map data, like paths.

## UX

- **Regions tab** (location page and the Set's full editor): list, "+ New region"; a region's name, Add or
  Remove, brush (sizes, [ ]) or rectangle, "Clear tiles"; Show (fill and border, fill, border); fill colour and
  opacity; border colour, width, line; shape (spline, tile edges); "Show its name on the map"; who sees it;
  delete. Painting shows at once; the region being edited stands out, the others fade.
- **Highlight** (Set tool strip, Play): click or drag tiles, or pick a region from "Region…"; everyone sees the
  zone; Grab attention and Clear as before.
- The location page fills the page under the Saga's header (compact title row, **Full screen** button); the
  full editor modal fills the window (Full screen there too).

## Design

- `domain/maps.py`: `regions` in a map's data (`id, name, tiles, show, color, fill, opacity, width, line,
  render, label, visibility`); `save_region` (tiles deduplicated, at most 10 000 per region, 60 regions),
  `delete_region`; resizing the grid drops their tiles past the edge, like paths. Highlight and attention take
  up to 10 000 tiles (a region).
- `services/locations.py`: commands `regions.save`, `regions.delete`; players get the regions they may see
  (without their visibility).
- Frontend `maps/geometry.ts`: `pathCurves` (a path as cubic pieces), `pathSamples` (points every N px with their
  direction, and the ends' directions), `tilesOutline` (boundary edges between tiles in and out of a set, found
  through the tile just past each edge's middle; vertices matched on the half-tile lattice so square and hex
  corners meet exactly; chained into loops), `outlineD` (tile edges, or a closed Catmull-Rom through the edges'
  middles), `labelPoint`.
- `maps/MapOverlay.tsx`: `RegionShape`, `PathLine` (arrows and arrowheads placed along the line; heads and tails
  as shapes with a contour instead of SVG markers), `HighlightZone` (a full-map rectangle with the zone cut out,
  even-odd, darkened; the splined border on top).
- `maps/tools/useTileBrush.tsx`: the brush or rectangle stroke shared by the Fog and Regions tools.
- `maps/shader.ts`: the immersive blur runs only near a different state (a 5×5 tile check first), in known and
  visible tiles; off-grid samples are skipped (no fog at the map's edges); Void's sky is the fog colour, motes
  of random size and place in their cell; Nebula (domain-warped noise in the fog colour and a second hue, dust,
  stars; animated, a slow circular swirl and slide).

## Steps

- [x] Docs.
- [x] Backend: regions, limits, tests.
- [x] Frontend: geometry (curves, samples, outlines), overlay, Regions tool, shared brush, highlight zone.
- [x] Shader: visible to unknown fade, void, nebula.
- [x] Full-window location page and full editor.
- [x] Tests.

## Tests

Backend: regions saved, deduplicated, filtered for players, validated, trimmed by a grid resize, deleted.
Frontend: outlines (squares, holes, hexes in every direction, two pieces), splines, label point, path samples
and end directions, region painting.

## Changes from plan

Second round (after review):

- **Fog**: visible tiles are always fully shown (a one-tile corridor was barely visible when the fog crept into
  them); known tiles fully seen (the colour fade into them stays). The soft edge moves into the **edge ring**:
  unknown tiles touching known or visible ones. The fog texture marks them (51: `fogBytes`, mirroring the
  server's `neighbours`); the shader fades by the distance to the nearest known tile against the nearest farther
  unknown tile (both 0 at their tiles, so it meets them seamlessly), wobbled by noise in its middle. The server's
  composed picture includes the ring (`maps.shown_tiles`): players get up to one tile beyond what they know.
- **Highlight**: a brush (sizes 1 to 8; a stroke from a highlighted tile removes, else adds) and **on / off**
  (config `highlight_on`; command `highlight` takes `tiles` and/or `on`; off, players get no highlight and the
  DM sees the kept tiles outlined). Picking a region turns it on; grab attention turns it on.
- **Grab attention** on tiles zooms up to the Stage's maximum (it stopped at 1.6, so a region barely changed the
  view); the title menu's Grab attention targets a shown highlight.
- **Nebula** at half its size.
- **Fog look**: three colours (`fog_colors`, roles per style), `fog_size` (×0.25 to ×4) and `fog_intensity` (0 to 1)
  replace `fog_color`. The server keeps each style's palette (`FOG_PALETTES`) and applies it when the style changes
  (unless colours come with it) and to Sets saved before; the shader takes `uFog1..3`, `uFxSize`, `uFxIntensity`
  (`FogLook` in the frontend). Sizes and intensity save when the slider is released.
- Map Sets draw the **grid only on known and visible tiles** (`gridOnlySeen`, shader `uGridSeen`; the 2D fallback too); Build shows it everywhere (SET-50).
- Checked in headless Chrome: a corridor of visible tiles (square and hex, every style), the player's view after
  grab attention on a region (zoomed onto it), the DM's strip with the highlight off.

- Checked in headless Chrome: the shader compiled and rendered (square and hex, visible next to unknown, void,
  nebula); the DM's location page, the player's live Stage (highlighted region, nebula fog) and the Set's full
  editor on the Regions tab. Painting regions by dragging was not clicked through.
