# Roadmap

Phases in order. Order and content will change as we discuss.

**Current**: `01-first-version.md`, a first vertical slice across phases 00, 01, 02 and 03, with the
Creature panel as the first Set type. Later phases complete what it leaves out.

Done since: `02-picture-uploader.md` (crop, adjust and resize pictures before upload; limits per category),
`03-build-and-play.md` (Build and Play views of every Stage; popups, value editor, arrangements).

| # | Part | Covers | Status |
|---|------|--------|--------|
| 00 | **Foundation**: repo layout, Python backend and React frontend skeletons, PostgreSQL, Docker Compose for local dev (plus a production-like compose), run scripts, migrations, test setup, first deploy to Railway. | NFR-2, NFR-7, NFR-8 | Done (in 01) |
| 01 | **Access**: login, root system admin, system admins and permissions, Sagas, Saga members and roles, default and custom groups, the shared visibility check. | SYS-1..5, SAGA-1..5, GRP-1..4, VIS-1, VIS-2 | Mostly done (in 01) |
| 02 | **Rulesets and resources**: ruleset file format and validation, DnD Lite, resource kinds/types/attributes, resource pages and forms, references, per-attribute visibility, file upload, browse/search. | RUL-1, 2, 4, 12..16, LORE-1..4, LORE-8, VIS-4, NFR-3 | Characters done (in 01); documents, locations, items next |
| 03 | **Stages core**: Stage and Set model, the Set type contract, live Stage, real-time sync, Stage tab, grab attention, first Set type: Image. | STG-1..10, SET-1, NFR-1, NFR-4 | Done with the Creature panel (in 01); Image Set next |
| 04 | **Relationships and graph**: relationship types, creating relationships fast, creator mark, graph queries and viewer screen, graph Set. | REL-1..11, REL-14, SET-4 | Idea |
| 05 | **Events and timeline**: calendars (real + one fantasy), events and sub-events, eras, relationship/event sync, timeline screen and slider. | EVT-1..8, EVT-11 | Idea |
| 06 | **More Set types**: Map, Battle grid, Actors linked to Saga resources, per-Actor visibility. | SET-2, SET-3, SET-5, SET-6 | Idea |

## Notes on order

- 01 comes early because every later part depends on Saga scoping and visibility.
- 02 (Rulesets and resources) comes before 03 (Stages) because Sets show resources: an Image Set shows
  a Document, a grid's Actors are Characters. The resource model and per-attribute visibility must exist
  first. To confirm with the user.
- Each part ends with something usable, so the app can be tried at a real table as early as possible.
