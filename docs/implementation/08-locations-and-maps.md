# 08 - Locations and map Sets

Status: Done
Requirements: LOC-1..16, UPL-10..13, SET-40..49, SET-2 (changed), SET-8, SET-9, LORE-8 (covered)
Depends on: 07-layout-controls

## Goal

Locations become real: a resource kind with sub-locations, tags, an icon and a **map** (pictures placed and
snapped, a square or hex grid, fog of war per member group, resources linked to tiles, paths). Two Set
types show them on Stages: the **World map** (the DM switches between a list of locations, players can
click through) and the **Local map** (one location, a simple display).

## Out of scope

- Composing battlegrounds (rotation, layers of props): pictures are placed, scaled and snapped only.
- Tokens moving on the map (characters on tiles are links, not actors).
- Measuring distances (the physical tile size shows as a scale legend).
- Item pages (the docs specify how items use icons and pictures).

## UX

**Locations tab** (everyone; players see the locations shared with them): search by name, "Top level only",
tag chips (the DM's tags); cards with icon, name, tags, parent and sub-location count; "+ New location".

**A location's page**: the map on the left (pan, zoom), tool tabs on the right:

| Tab | What |
|-----|------|
| Details | name, icon, description, part of (parent), tags, who sees it, sub-locations (+ new one) |
| Pictures | upload pictures; drag them on the map, snap to the grid or to other pictures' edges; scale; order |
| Grid | none / square / hex, tile size, offset, columns and rows (or "Fit to pictures"), physical tile size, line color (a color, contrast, inverse), opacity, line width |
| Fog | on/off; paint for member groups; Visible / Known / Unknown (keys V K U); brush size; rectangle; reveal all / hide all |
| Links | click a tile: its resources; "Link…" opens the resource picker (characters, items, locations; sub-locations first) |
| Paths | list; a path's name, color, width, body (solid, dashed, dotted, arrows, arrowheads), head and tail (none, arrow, circle), poly or spline, who sees it; draw by clicking tiles in order |

Players get the same page read-only: the map with their fog, the links they may see (click: the resource's
view), the paths shared with them.

**Resource view** (universal): a resource's view in a modal. Characters: the informative sheet; locations: the
map viewer with details; others: their values. Map links and Actors Scene cards open it.

**Resource picker** (universal): a modal with the kinds allowed, favorites on top, search.

**World map Set**: the DM adds locations (Build), picks the one shown (a strip of location chips in Play and
Build), sets which roles may click resources (players, viewers), the fog display (flat, immersive static,
immersive animated), the fog style and color. Play: a tool strip on the map: point, reveal, known, hide,
brush size, highlight tiles; "Full editor…" opens the location's tools in a modal. Grab attention on tiles.
**Local map Set**: one location, flat fog, no clicks.

## Design

- Ruleset: kind `location` (DnD Lite: type Location; name, icon, description, part of). Attributes gain
  `category` (image upload category) and `parent` (the structural hierarchy); `image` attributes can be
  `many` (DnD Lite characters and items: icon + other pictures).
- Upload categories gain **icon** and a **max count** (pictures per resource, or per map).
- `resources.tags` (JSON list, DM edits, everyone who sees the resource sees them); `GET /tags?kind=`.
- `location_maps` (resource_id, data, version). `domain/maps.py`: grid geometry (square, pointy-top hex in
  odd-row offset), fit, resize (tiles keep their column and row from the top left origin; tiles added or
  dropped at the last columns and rows), fog layers (one string per member group: 0 unknown, 1 known,
  2 visible), effective fog (best state over the viewer's groups), links, paths.
- `services/locations.py`: map commands (`images.set`, `grid.set`, `fog.set`, `fog.paint`, `fog.fill`,
  `links.add`, `links.remove`, `paths.save`, `paths.delete`) at `POST /locations/{id}/map/command`; the map for
  a viewer at `GET /locations/{id}/map`. Players never get the pictures: they get a **composed picture**
  (`/api/maps/{id}`, signed for their fog), where everything outside known and visible tiles is black, plus
  their fog states, the links they may see on tiles they know, and the paths shared with them.
- Set types `world_map` and `local_map` (`set_types/maps.py`): the locations are the Set's **actors**; config
  `current` (actor id), `interactive` per role, `fog_display`, `fog_style`, `fog_color`, `show_grid`; commands
  `location.show`, `highlight`. They render through `RenderContext.maps`.
- Grab attention gains a **target** (a Set type's own: tiles here): `AttentionIn.target`, `SetType.attention_target`,
  and the UI's `targetRect`.
- Frontend `maps/`: geometry (mirrors the backend), a WebGL renderer (one quad: the picture, grid lines and
  fog computed per pixel, so big grids cost nothing; immersive fog: blurred tile states with smooth falloff
  into non-visible tiles, noise fog, animated or static), an SVG overlay (paths, link icons, highlight), the
  map view (pan, zoom, pointer → tile), and the tools.

## Steps

- [x] Docs.
- [x] Backend: ruleset, uploads, tags, maps domain, locations service and API, composed picture.
- [x] Backend: map Set types, attention target.
- [x] Frontend: geometry, renderer, overlay, map view, tools.
- [x] Frontend: Locations tab and page, resource picker and view, forms (icons, galleries, references, tags).
- [x] Frontend: World and Local map Sets.
- [x] Tests.

## Tests

Backend: location CRUD with parent and tags, parent hidden for players, image galleries and counts, map
commands, grid resize keeps tiles, fog per group and effective, players' payload (no pictures, composed
picture masks unknown tiles, links filtered), paths visibility, map Sets (actors are locations, show,
players see the current one, config), attention on tiles. Frontend: geometry, paths, fog painting, picker,
location filters.

## Changes from plan

- Map pictures can come from any of the Saga's files (the uploader sends them as "map"); the "map" category's
  "pictures each" limits how many a map holds.
- The Stage's fog brush paints for the players' and viewers' groups; other groups are painted in the full
  editor (or the location page).
- Immersive fog fades inside the **known** tiles (not into unknown ones): players' composed picture is black in
  unknown tiles, so a fade there showed a black ring. Visible tiles stay full; unknown tiles are pure fog.
- Link icons use a centred square crop of the icon (or of the picture): the face crop needs the picture's size.
- A player clicking a linked location opens it in their resource view (their own navigation); the DM's click
  shows it on the Set when it's one of its locations.
- The shown location of a live map Set opens for players (its map) even when its page isn't shared (like a
  card's sheet): the actor of the shown location is visible to everyone.
- Checked with API tests (SQLite and Postgres), component tests, a production build, the shader compiled and
  rendered in headless Chrome (flat and immersive, square and hex, the four grid/fog combinations), and the
  real pages screenshotted in headless Chrome for the DM (Locations tab, location page, World map in Play) and
  a player (live World map, location page). Interactions (painting, dragging, picking) were not clicked
  through.

