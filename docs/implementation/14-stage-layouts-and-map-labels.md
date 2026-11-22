# 14 - Stage layouts, Set layers, map labels

Status: Done
Requirements: STG-22 (first numbered STG-19 by mistake: that ID was taken), STG-20, STG-21, SET-51, LOC-24, REL-17
Depends on: 03-build-and-play, 08-locations-and-maps, 13-lore-relationships-events

## Goal

Stages can keep every piece in view: an **interface** layout fixes Sets to the screen (a map filling it, the
Actors Scene over its bottom), next to today's **canvas**. Build lists the Stage's Sets and their layers. The live
Stage tab takes the whole window. Map Sets zoom and pan inside the map. The DM marks places on maps with
**labels** instead of editing pictures. Relationship graph nodes show faces when there's no icon.

## Out of scope

- Per-device layouts (a phone layout apart from the table's screen).
- Grab attention zooming inside a map Set in the interface layout (it pulses; the map goes back to fitted).
- Dragging labels on the map (Move + click instead).

## UX

- **Stage panel (Build)**: Layout: Canvas | Interface, with a one-line explanation. **Sets** (always on top of
  the side panel): top layer first, click to pick, ↑ ↓ for layers.
- **Interface**: the picked Set gets "On the screen": a 3×3 anchor grid, presets (Full screen, Left half, Right
  half, Bottom strip), width, height and offsets (%). Dragging the title nudges, the corner resizes. A dashed frame
  shows the screen in Build.
- **Stage tab**: the whole window; corner: connection dot, Full screen, ✎ Build (DM), ✕ (back to the last page).
- **Map Sets**: wheel zooms the map (not the Stage), − Fit ＋ in its corner, drag pans once zoomed (the DM's
  painting tools keep their drag).
- **Labels tool** (location page, the Set's full editor): ＋ New label then click the map; text, pin, side,
  size, colour, text on click, who sees it, Move, Delete.

## Design

- `stages.layout` (canvas | interface), `stage_sets.screen` (JSON); `domain/stage_layout.py` (anchors,
  `clean_screen`, `screen_rect`, mirrored by `frontend/src/stage/layout.ts`); `PATCH /stages/{id}` takes `layout`;
  `PUT /stages/{id}/layers` {set_ids bottom to top}; `PATCH /sets/{id}` takes `screen`; duplicates keep it.
  Migration `e9a1c5d7b382`.
- `StageCanvas`: in the interface layout, each Set's px rect comes from its screen place and the container's
  size, and the Set's view gets that size (so Set types need no change); no pan, zoom or camera.
- Sets zooming their own content mark it `data-wheel` (the Stage's wheel leaves it) and `data-interactive` where
  they drag.
- Map labels: `data.labels` (id, text, point in map px, pin, side, size, color, on_click, visibility);
  `labels.save` / `labels.delete` map commands; players get those shared with them on a known or visible tile
  (`maps.tile_at`). Drawn by `maps/MapLabels.tsx` in the overlay; `maps/tools/LabelsTool.tsx`.
- Faces: graph endpoints and nodes carry `face` (from `resource_icon`: the icon, else the picture's face crop);
  `components/SvgPicture.tsx` draws a face crop in SVG (graph nodes, map resources).

## Steps

- [x] Backend: layouts, screen places, layers command, labels, faces in graphs; migration.
- [x] Frontend: interface layout in StageCanvas, Set list and placement panel, full-window Stage tab, map Set
  zoom, labels (overlay, tool), SvgPicture.
- [x] Docs; the draft `docs/drafts/sets_improvements.md` deleted.

## Tests

- API: `test_locations.py::test_map_labels` (save, defaults, clamping, refusals, players' filter by visibility and
  fog, delete, hex `tile_at`), `::test_stage_layouts_and_layers` (layout switch, screen defaults and checks,
  layers order and refusals, duplicates, `screen_rect`); `test_lore.py::test_graph_shows_faces`.
- Frontend (`stage/layout.test.ts`): screen rects, drags in %, layer moves, the map Set's zoom and clamping, face
  boxes in SVG.
- Checked in headless Chrome: an interface Stage live for a player (map full screen, scene over its bottom,
  labels, close corner), wheel zoom inside the map, Build with the Set list and layout switch, the Labels tool,
  a face in the graph.
