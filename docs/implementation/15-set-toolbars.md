# 15 - Set controls in toolbars

Status: Done
Requirements: STG-23, STG-24 (and STG-17, SET-36, SET-40, SET-46, SET-51 reworded)
Depends on: 03-build-and-play, 14-stage-layouts-and-map-labels

## Goal

On an interface Stage the DM's controls overlapped: the Actors Scene's tab strip ran across the map, the map's
strips and zoom buttons sat under other Sets, and the title bars held the Sets' menus. Every Set's controls now
come in **toolbars** that whoever builds the Stage places, so they stay reachable and never cover each other.

## Out of scope

- Dragging a toolbar on the Stage to place it (the panel's anchor grid and sliders instead).
- Toolbars for the relationship graph's own zoom (it keeps its buttons, shared with the Lore page).
- Different places per viewer or device.

## UX

- **Play**: every Set has a main toolbar starting with **⚙** (its settings: the Play menu the title used to
  open; a type without one opens the Set in Build). On an interface Stage the ⚙ shows the Set's name, since
  toolbars leave their Sets for the screen's edges. The title opens nothing.
- **Toolbars per type**: Actors Scene: *Scene* (⚙, tabs; Build: + Add creatures), *Turns* (turn controls, Play).
  Maps: *Map* (⚙, locations), *Map tools* (Point, fog brushes, Highlight, Full editor; Play), *Zoom* (everyone).
- **Build → the Set's panel → Controls**: one folded row per toolbar (name, where it is); unfolded: what it
  holds, a 3×3 anchor grid without the centre, Inside the Set | Outside (canvas only), ↔ Across | ↕ Down, size
  S M L, Shown, ↔ and ↕ distance sliders (the Stage moves while dragging), "Back to its default place".
- In Build the toolbars show where they'll be; an empty one (Turns, filled in Play) shows its name, a hidden one
  is dimmed.
- Defaults keep content clear on a canvas: main toolbars above the Set's top left, Turns under its bottom
  middle, Map tools down its left side (outside), Zoom inside its bottom right. On an interface Stage the same
  anchors are the screen's.

## Design

- `stage_sets.toolbars` (JSON): only what the DM changed, `{key: {anchor, vertical, x, y, size, hidden,
  outside}}`; `domain/stage_layout.clean_toolbars` checks and merges a partial change (`null` = back to the
  default); `PATCH /sets/{id}` takes `toolbars`; rendered for everyone (players place the map's zoom too);
  duplicates keep it. Migration `f3b7d2c8a914`.
- Contract (`stage/types.ts`): `SetTypeUI.toolbars` (`ToolbarDef`: key, name, hint, default place); the core
  adds `main` when a type doesn't name it (`stage/toolbarPlaces.ts: toolbarsOf`). Views fill toolbars with
  `<Toolbar id>` (`stage/Toolbar.tsx`), a portal into the core's dock, so the content keeps the view's state
  and popups. Outside a Stage (tests) it renders in place.
- `StageCanvas`: docks grouped in stacks per anchor (flex, the first nearest the edge; `order` by layer on an
  interface Stage). Canvas: a frame per Set above every Set (inside area under the title; outside stacks around
  the frame). Interface: one screen layer. Distances are margins away from the anchor's edge (a shift on an
  edge's middle): `dockStyle`. The canvas is `isolation: isolate`, so toolbars stay under popups and modals.
- The Actors Scene and map Sets no longer take room for strips: the DM's layout is the players' (grab attention
  rects and `mapPlacement` lost their strip offsets).

## Steps

- [x] Backend: `toolbars` column, checks, route, duplicate; test.
- [x] Frontend: Toolbar portal, placements, docks and stacks, ⚙ gear; the scene's and maps' controls moved into
  toolbars; the Controls panel in Build; styles.
- [x] Docs: stages.md "Set controls (toolbars)", requirements (and the duplicate STG-19 of plan 14 renumbered
  STG-22), glossary, decision, roadmap, AGENTS.md.

## Tests

- API: `test_locations.py::test_set_toolbars` (partial merges, reset, refusals, admins only, duplicates).
- Frontend: `stage/toolbarPlaces.test.ts` (main first, place merging, stacks, distances inside and outside),
  `stage/StageCanvas.test.tsx` (the scene's toolbars in their stacks, the ⚙ opening the menu, the title opening
  nothing, interface stacks across Sets in layer order, hidden toolbars left out), the scene and map view tests
  updated (toolbars, the DM's layout equal to the players').
- Checked in headless Chrome: the interface "Table view" Stage in Play (stacked main toolbars, map tools down
  the left, zoom bottom right, the ⚙ popover above the toolbars), the canvas "Journey" Stage in Play and on the
  live Stage tab (toolbars around the map Set), Build with the Controls panel and placeholders.
