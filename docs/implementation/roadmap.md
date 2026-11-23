# Roadmap

Phases in order. Order and content will change as we discuss.

**Current**: `01-first-version.md`, a first vertical slice across phases 00, 01, 02 and 03, with the
Creature panel as the first Set type. Later phases complete what it leaves out.

Done since: `02-picture-uploader.md` (crop, adjust and resize pictures before upload; limits per category),
`03-build-and-play.md` (Build and Play views of every Stage; popups, value editor, arrangements),
`04-display-templates.md` (character display templates, sheets, Characters tab sections and sorting),
`05-groups-and-encounters.md` (Saga templates, categories, groups, instanceable characters; the Creature panel
became the Actors Scene with tabs, new layouts, order tray and turns), `06-template-lists-and-colors.md`
(display templates as lists per region with value and view styles, group and template colors, one cast per
scene, Major and Minor NPCs), `07-layout-controls.md` (distance to top, horizontal and vertical space,
boundary from both corners with a neutral zone and scatter in px), `08-locations-and-maps.md` (locations with
sub-locations and tags; maps with pictures, square/hex grid, fog of war per member group, links and paths;
World and Local map Sets; icons, galleries, resource picker and view)), `09-map-regions-and-highlight.md` (regions, arrow strings and contours on paths, the highlight zone,
visible-to-unknown fog fades, void and nebula fog styles, full-window map tools)), `10-fog-presets.md` (the DM's fog presets
with a live preview, picked by map Sets; motion, edge, known tiles; embers, blizzard and depths styles),
`11-saga-templates-items-documents.md` (the Template page: variables and types per kind, starting content, export
and import; items with categories; multipage documents), `12-document-folders-and-navigation.md` (document folders with drag and
drop; Groups under Characters; the Saga page with Members, Template and Display templates),
`13-lore-relationships-events.md` (the Lore tab; relationships with groups, types, reveal and a graph screen and
Set; events, sub-events, eras, calendars and the timeline), `14-stage-layouts-and-map-labels.md` (canvas and
interface Stages, the Set list with layers, the full-window Stage tab, zoom inside map Sets, map labels, faces in
the graph), `15-set-toolbars.md` (Set controls in toolbars the DM places: anchors, direction, distance, size,
inside or outside the Set on a canvas, on the screen in the interface layout; the ⚙ settings button),
`16-events-timeline.md` (events may last: an end date; Lore → Events as a horizontal timeline with piled-up marks,
expandable boxes, eras along the line and a minimap, or a list; date filters), `17-sections-set-eye-location-map.md`
(the section bar under the top bar; putting Sets away with the eye; the location map with regions),
`18-efx-environments.md` (EFX: environments of far, near and fore layers of animated effects, built with a live
preview; connected EFX Sets and EFX Controls on Stages), `19-access-folders-timeline-set-live-link.md` (viewers see what
players see; owners; who can edit for characters; folders for documents, items and locations with their own who can
see; the combo tray; the Timeline Set; a plain events list; the live link), `20-character-item-editors-user-page.md`
(full-screen tabbed character and item editors, inventory with Use, Active, tokens in the player's colour, Saga →
User), `21-map-set-tokens-attention-pings.md` (one Map Set, mobile tokens, grab attention on the DM's view, pings),
`22-desktop-set.md` (the Desktop Set: characters, items, documents and pictures laid out Auto or Free),
`23-dice-roller.md` (the Dice roller: roll types, a shared tray, 3D dice in ten styles, the DM's pick),
`24-general-improvements.md` (tokens drawn by display templates with shapes for sizes; path contours, ping notices,
sharp zoom; dice speed and size; folding Set controls; frames on cards and sheets), `25-set-bar-and-dice-tray.md` (the
Set bar with every Set's main controls, settings in Play, the map's location picker, the dice tray with rows per roll), `26-group-variables.md` (the Saga template's group variables, the group editor), `27-map-layers.md` (map layers, the
no-map colour, sharp zoom, tokens to size 10), `28-small-fixes.md` (grid zoom, fog presets
on EFX, the dice tray minimized, desk drops).

| # | Part | Covers | Status |
|---|------|--------|--------|
| 00 | **Foundation**: repo layout, Python backend and React frontend skeletons, PostgreSQL, Docker Compose for local dev (plus a production-like compose), run scripts, migrations, test setup, first deploy to Railway. | NFR-2, NFR-7, NFR-8 | Done (in 01) |
| 01 | **Access**: login, root system admin, system admins and permissions, Sagas, Saga members and roles, default and custom groups, the shared visibility check. | SYS-1..5, SAGA-1..5, GRP-1..4, VIS-1, VIS-2 | Mostly done (in 01) |
| 02 | **Rulesets and resources**: ruleset file format and validation, DnD Lite, resource kinds/types/attributes, resource pages and forms, references, per-attribute visibility, file upload, browse/search. | RUL-1, 2, 4, 12..16, LORE-1..4, LORE-8, VIS-4, NFR-3 | Characters done (in 01); documents, locations, items next |
| 03 | **Stages core**: Stage and Set model, the Set type contract, live Stage, real-time sync, Stage tab, grab attention, first Set type: Image. | STG-1..10, SET-1, NFR-1, NFR-4 | Done with the Creature panel (in 01); Image Set next |
| 04 | **Relationships and graph**: relationship types, creating relationships fast, creator mark, graph queries and viewer screen, graph Set. | REL-1..11, REL-14, SET-4 | Done (in 13) |
| 05 | **Events and timeline**: calendars (real + one fantasy), events and sub-events, eras, relationship/event sync, timeline screen and slider. | EVT-1..8, EVT-11 | Done (in 13) |
| 06 | **More Set types**: Map (done: World and Local map, in 08), Battle grid (creatures on a location's tiles), Actors linked to Saga resources, per-Actor visibility. | SET-2, SET-3, SET-5, SET-6, LOC-17 | Map done; the rest Idea |

## Notes on order

- 01 comes early because every later part depends on Saga scoping and visibility.
- 02 (Rulesets and resources) comes before 03 (Stages) because Sets show resources: an Image Set shows
  a Document, a grid's Actors are Characters. The resource model and per-attribute visibility must exist
  first. To confirm with the user.
- Each part ends with something usable, so the app can be tried at a real table as early as possible.
