# 17 - Section bar, putting Sets away, the location map

Status: Done
Requirements: UX-13 (UX-10 reworded), STG-25, LOC-25
Depends on: 12-document-folders-and-navigation, 15-set-toolbars, 13-lore-relationships-events (the graph)

From the draft `docs/drafts/ui_improvements.md` (deleted once built).

## Goal

1. A page's sections (Lore: Documents, Events, Relationships…) looked like small buttons of the screen. They get a
   real second menu strip, so they read as the parts of that page.
2. On an interface Stage, stacked Sets get in each other's way: the DM can put one away (the eye) and bring it back.
3. The DM sees how the locations connect: a graph of the places, their links and what's part of what.

## Out of scope

- Saving where the DM drags places on the location map (it's recomputed each time).
- Putting away a single card or tab (whole Sets only).
- Section bars for pages without sections (Stages, Items).

## UX

- **Section bar** under the top bar: "Lore ›" then Documents | Events | Relationships, the current one underlined
  (sub-pages too: a document's page keeps Documents underlined). Page headings name the section ("Events").
  Fog presets get their own address (`/locations/fog`; the old `?section=fog` redirects). One section alone: no bar.
- **The eye**: first on a Set's main toolbar for the DM (Play and Build), and on each row of Build's Set list.
  Put away: the Set isn't drawn (players aren't sent it); its main toolbar stays with the eye struck through and
  the Set's name; in Build the Set shows faded (still selectable).
- **Location map** (`/locations/map`, "◈ Location map" beside "＋ New location"; everyone): places as nodes (icon or
  initial), links on maps as lines (arrow: one way), "part of" dashed; places of the same place share a colour and
  a soft region with their parent (regions nest), places in no region grey; click a place to open it; a legend.

## Design

- `saga/SectionTabs.tsx`: `sectionsFor(rel, isAdmin)` (pure: the page and its sections, each with its own
  "active" rule) and `SectionBar`, drawn by `SagaLayout` (not on the Stage tab). The pages' own section tabs are
  gone.
- `stage_sets.off` (migration `a8c4e2f6b917`): `render_stage` skips it for non-admins and marks it for admins;
  `PATCH /sets/{id}` takes `off`; duplicates keep it. `StageCanvas` doesn't draw a put-away Set outside Build and
  keeps only its main toolbar's dock; `EyeIcon`.
- `GET /locations/graph` (`services/locations.location_graph`): the relationship graph's shape (`GraphData`), nodes
  with `group` (the parent's node id when visible); link edges from each map's links as that member sees the map
  (fog: not on unknown tiles), merged into one undirected edge when both maps link; "part of" edges as references.
- `RelationshipGraph` gained `clusters`: layout pulls (`clusterLinks`: members to the parent), colours per group,
  regions drawn as the hull of the group and its parent (`hull`) with a wide round stroke, one opacity per region.

## Steps

- [x] Backend: `off` (column, render, update, duplicate), the location graph; tests.
- [x] Frontend: section bar and routes, the eye, the location map page and clusters; tests.
- [x] Docs: ux.md, stages.md, locations.md, requirements, glossary, decision, roadmap; the draft deleted.

## Tests

- API: `test_locations.py::test_location_graph` (groups, links merged or one-way, "part of", a player's view
  without a hidden place and without a link on an unknown tile), `::test_sets_put_away` (players not sent it,
  admins only, duplicates, back again).
- Frontend: `saga/SectionTabs.test.ts` (pages, active sections on sub-pages, no bar for one section),
  `stage/StageCanvas.test.tsx` (the eye first; a put-away Set: not drawn, its name on the toolbar, bringing it
  back), `saga/lore/timeline.test.ts` (hull, cluster pulls).
- Checked in headless Chrome: the section bar on Locations and Lore, the location map with regions (demo places
  added to "Map check"), putting the Actors Scene away on the interface Stage.

## Changes from the draft

- The location map is a page of its own (with an address) rather than a popup, so there's room for the graph;
  the button sits beside "New location" as asked, and players get it too (they see only what's shared with them).
- The eye is also in Build's Set list, and shows in Build on the canvas too (not only the interface layout).
