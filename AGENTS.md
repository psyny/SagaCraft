# SagaCraft

A companion app for tabletop RPG campaigns, built for the Dungeon Master (DM) and their players. It does four things:

1. **Stages**: the DM builds scenes ("Stages") out of composable "Sets" (battle grid, map, image, relationship graph...) and shows one Stage at a time to the players, live.
2. **Lore**: the DM keeps the Saga's documents, pictures, maps and notes, and decides who can see each one.
3. **Relationships and events**: anyone links resources with relationships ("A killed B"), each marked with who created it; events put resources and relationships on the Saga's calendar and timeline.
4. **Light tracking**: HP, initiative, inventory and similar data on the Saga's resources (documents, characters, locations, items), shaped by a swappable **Ruleset**. SagaCraft is system-agnostic; *DnD Lite* (our light take on D&D 5e 2014) is the reference ruleset during development.

It is **not** a full virtual tabletop and does **not** automate every game rule. People play at the table (or on a call); SagaCraft supports them.

Status: **first version in progress** (`docs/implementation/01-first-version.md`): access, DnD Lite characters (categories, colored groups, instanceable NPCs, list-based display templates and sheets), locations with maps (grid, fog of war, links, paths, regions) and a location map (how they connect), items and documents (in folders), relationships (graph screen and Set) and events (a horizontal timeline or a list, periods, eras, calendars) in a Lore tab, an editable Saga template (export/import), a Saga page for set-up, EFX environments (animated skies, landscapes, weather) shown by connected EFX Sets, live Stages (canvas or interface layout, Set controls in toolbars the DM places, Sets put away with an eye) with the Actors Scene, the World and Local map Sets (with labels) and the Relationship graph Set work end to end.

Stack: FastAPI + SQLAlchemy 2 + Alembic backend (Python 3.12), React 18 + TypeScript + Vite frontend (framer-motion for animations), PostgreSQL 16 (psycopg 3). New libraries are chosen per feature in the implementation plans (`docs/implementation/`); record each choice in `docs/open_questions.md`.

## Where things live

| Part | Location | Entry point |
|------|----------|-------------|
| Backend API | `backend/sagacraft/` | `main.py` (`uvicorn main:app`, `PYTHONPATH=backend/sagacraft`) |
| Rulesets (data) | `backend/sagacraft/rulesets/*.json` | loaded by `domain/ruleset.py` |
| Set types (backend) | `backend/sagacraft/set_types/` | contract `base.py`, registry `__init__.py` |
| Migrations | `backend/sagacraft/alembic/versions/` | |
| Backend tests | `backend/sagacraft/tests/` | SQLite by default, Postgres optional |
| Frontend | `frontend/src/` | `main.tsx`; `api/`, `pages/`, `saga/`, `stage/` |
| Set types (frontend) | `frontend/src/stage/sets/<type>/` | registry `stage/sets/registry.ts` |
| Deploy | `docs/railway/setup.md` | |

Backend layers, outside in: `api/` (thin routes) → `services/` (use cases, HTTP-independent, raise `services/errors.py`) → `models/` (tables). `domain/` holds pure rules (visibility, permissions, ruleset loading and validation, discrete threshold) with no database or HTTP code. Keep that separation.

- Every Saga-scoped route takes the caller's membership (`api/deps.py: current_member`); non-members get 404.
- Responses that can contain hidden data are built per viewer in services (`serialize`, `render`): never return raw models.
- After a change that players may see, routes push it with `services/realtime.py` (`hub.notify` / `hub.attention`).
- A new Set type = one backend module in `set_types/` + one frontend folder in `stage/sets/`, both registered. The Stage core must not change. Its view handles the three Stage modes (`view` players, `play` DM using it with popups, `build` DM building it); its `Inspector` shows only the selected thing; its `PlayMenu` is the popup on the ⚙ of its main toolbar; its controls go in toolbars (`SetTypeUI.toolbars`, filled with `<Toolbar id>` from `stage/Toolbar.tsx`) that the Stage places where the DM set them up, never in strips of its own. Its view lays out for the `width`/`height` it's given (in the interface layout that's its share of the screen); content that zooms itself is marked `data-wheel`. See `docs/implementation/03-build-and-play.md`.
- Set types expose **commands** (`SetType.command`, route `POST /sets/{id}/command`) for their named actions and decide where new actors go (`place_actors`); instances of instanceable characters keep their own values in `actor.config["instance"]`. See `docs/implementation/05-groups-and-encounters.md`.
- Locations' maps (`domain/maps.py`, `services/locations.py`): tiles are kept by column and row from the grid's top left. Players never get a map's pictures: only the composed picture made for their fog (`/api/maps/{id}`, signed). Map editing goes through map commands (`POST /locations/{id}/map/command`), the same from the location page and map Sets. Map Sets draw the fog with the Saga's fog presets (`domain/fog.py`, `services/fog_presets.py`), never their own fog settings. See `docs/concepts/locations.md`.
- How characters are displayed (cards, sheets) comes from display templates (`domain/display.py`, `services/displays.py`): per mode and view, lists of elements per region. Set types render them through `RenderContext.displays` (`DisplayBook.render`) and don't add their own per-card display settings. See `docs/implementation/06-template-lists-and-colors.md`.
- The ruleset is the Saga's own Saga template (`sagas.template`, else the built-in file): always read it with `services/resources.ruleset_for`, never `get_ruleset` on a Saga. Template edits go through `domain/saga_template.py` and are validated by parsing. See `docs/concepts/rulesets.md` ("Saga templates").
- Relationships and events (`services/relationships.py`, `services/events.py`, `api/lore.py`): relationships are read and written per member group, ends a member can't see are masked, and a dated relationship and its event's date are one record (keep `sync_event_date` / `_set_dates` in charge of that). In-world dates are integers `y*10000+m*100+d` read with the Saga's calendar (`domain/calendar.py`; frontend `saga/lore/dates.ts`). See `docs/concepts/relationships.md` and `docs/concepts/events.md`.
- EFX (`domain/efx.py`, `services/environments.py`, `frontend/src/efx/`): the effect catalog on the server is the single source of effect kinds and their settings (the editor is built from it, changes are checked against it); a new effect = a catalog entry + a renderer in `frontend/src/efx/effects/`. EFX layers never catch clicks (Set contract `passThrough`). New Sets are placed by the backend hints `depth`, `backdrop`, `default_transparent`, `default_screen`, `private`. See `docs/concepts/efx.md`.
- Every picture upload goes through `frontend/src/components/imageEditor/ImageUploader.tsx` with an upload category, and through `services/uploads.py` on the server (limits per category, Pillow checks). Don't add other upload paths.

## Commands

```sh
make.bat up              # Postgres + API + frontend in Docker: http://localhost:3100 (API :8100/docs), sign in admin / admin123
make.bat down            # stop (data kept); make.bat reset-db deletes local data
make.bat be-tests        # backend tests on SQLite, no Docker
make.bat be-tests-postgres   # same tests against the Docker Postgres test DB
make.bat fe-build        # frontend typecheck + build
make.bat fe-tests        # frontend unit tests
make.bat prod-local      # production-like build (Railway images) on http://localhost:8180
```

`Makefile` has the same targets for Linux/macOS: keep both in sync. Ports (3100/8100/5442) avoid the sibling projects' ports. From Git Bash, run Docker Compose through PowerShell/cmd (`make.bat`): Compose's build fails there with an "additional privileges" error.

## Top directive: UX

The user experience comes before everything else. SagaCraft aids RPG playing: it must help, then get out of the way. Every click or wait during a session is attention taken from the story, especially the DM's. When a choice trades UX against simpler code or more features, UX wins by default; if the trade is big, ask the user. Speech recognition and AI help are long-term goals: keep app actions as named commands that any input (button, shortcut, voice, AI) can trigger. See `docs/concepts/ux.md`.

## Development and deployment

- **Local**: the whole app (backend, frontend, PostgreSQL) runs locally with Docker (`docker compose`), with one-command run scripts (`Makefile` + `make.bat` for Windows, kept in sync, like `../ibis` and `../AdaptaFit`).
- **Production**: the app must be easy to deploy on **Railway**. Keep it ready: one Dockerfile per service, all settings from environment variables (`backend/.env.example`), no local-only paths, migrations run on deploy, port from `PORT`, no files on the container disk (v1 stores pictures in Postgres; object storage later).
- A production-like local run (`docker-compose.prod-local.yml`) to check the deploy build before pushing.
- Deploy steps: `docs/railway/setup.md`. The real-time hub is in memory: one API replica until we add a shared pub/sub.

## Core concepts: Stages, Rulesets, Relationships, Events

Stages and Rulesets are the heart of the app; Relationships and Events are main concepts built on top of resources. Everything else (administration, Sagas, groups, resource pages) exists to support them. When a design choice trades one against the other, ask the user.

- **Stages must stay flexible**: a Stage is a canvas of Sets; each Set has position, size, layer and visibility. New Set types must be addable without changing the Stage core (plugin-like Set types with a shared contract). See `docs/concepts/stages.md`.
- **Rulesets are data, not code**: a ruleset defines resource types and subtypes (under the kinds Document, Character, Location, Item, Event), their attributes (structured types, per-group visibility and edit rules) and the structural references between resources. Never hard-code game-system specifics: code that needs "HP" or "NPC" must read them from the active ruleset. A ruleset editor is a project goal, even if version 1 is a JSON/YAML file. See `docs/concepts/rulesets.md`.
- **Relationships are user data, not ruleset**: each relationship belongs to one group (its visibility); members see only their groups' relationships, and players add/edit/remove relationships and types in their own groups. Types: predefined list + each group's own. Every relationship records its creator and role, and has a start and end date (or "always"). The backend builds graphs on demand (filtered by visibility); the frontend renders them. See `docs/concepts/relationships.md`.
- **Events**: a resource kind, with one exact date on the Saga's calendar (real or fantasy), maybe an end date (the date variable marked `ends`: a period), resources and one level of sub-events; the ages of the world are **eras** (start and end date). A dated relationship and its relationship sub-event are one record, never copies. See `docs/concepts/events.md`.

## Structure and access

See `docs/concepts/sagas-and-access.md`.

- One backend instance hosts many **Sagas**. The Saga is the main division of concerns: members, groups, ruleset, Stages and resources belong to one Saga. Every query on Saga data must be scoped to a Saga; data never leaks between Sagas.
- **System admins** manage the instance through granted permissions: create other system admins, Sagas, and each Saga's first admin.
- **Saga roles**: admin (DM), player, viewer. Saga admins create the Saga's users.
- **Member groups**: default `admins`, `players`, `viewers` (automatic by role) plus custom groups. Visibility is a list of member groups and/or members.
- **Characters** are organized by **category** (based on a ruleset type; Saga-editable) and **groups** of characters (the party, encounters; DM only, `CharacterGroup` in code). A Saga starts from a **Saga template** (ruleset + starting categories and groups). See `docs/concepts/characters.md`.
- **Visibility is enforced on the server**: a client never receives what its user can't see (including file URLs). Never rely on hiding things in the UI.

## Docs

Read the relevant doc before planning or changing anything in its area.

| Doc | What it holds |
|-----|---------------|
| `README.md` | Short overview for humans |
| `docs/vision.md` | Product idea, goals, non-goals, principles |
| `docs/requirements.md` | Requirements list with IDs and priority (MVP / Later / Goal) |
| `docs/concepts/ux.md` | UX directive and principles; future speech/AI help |
| `docs/concepts/stages.md` | Stages, Sets, Actors, layers, visibility, "grab attention", the Actors Scene, the map Sets |
| `docs/concepts/rulesets.md` | Resources, types, attributes (variables), references, Saga templates (Template page, export/import, actions later), DnD Lite items and documents, editor roadmap, licensing |
| `docs/concepts/characters.md` | Categories, groups (parties), instanceable characters, the prep-to-combat flow |
| `docs/concepts/locations.md` | Locations, maps (pictures, grid, fog of war, links, paths, regions), icons and galleries, resource picker and view |
| `docs/concepts/relationships.md` | User relationships, types, creator mark, graph viewer and queries, reveal, the graph Set |
| `docs/concepts/events.md` | Events, sub-events, eras, calendars, the timeline |
| `docs/concepts/efx.md` | EFX: environments (far, near, fore layers of effects), the EFX page, EFX Sets on Stages |
| `docs/concepts/sagas-and-access.md` | System admins, Sagas, roles, member groups, visibility, lore library |
| `docs/glossary.md` | Shared vocabulary; use these terms in code and UI |
| `docs/open_questions.md` | Undecided points and the decision log |
| `docs/implementation/` | Roadmap and one plan per part of the software being built |
| `docs/railway/setup.md` | Deploying on Railway |

## Planning and implementing

Work is done through plans in `docs/implementation/` (see its `README.md` for the process and template):

- Before building a part, write (or update) its plan and get the user's agreement.
- A plan lists the requirement IDs it covers, the design, the tools picked, and the steps.
- Keep the plan's status and the roadmap up to date while implementing; note what changed from the plan.

## Drafts

`docs/drafts/` holds the user's rough notes for something to build (a problem, ideas, a wished-for UI). They are not
specs and nothing links to them. When asked to implement a draft:

1. Read it whole, then the docs and code of its area (it may assume things that changed, or need a model change).
2. Turn it into a plan (`docs/implementation/NN-<name>.md`, requirement IDs added to `docs/requirements.md`),
   following the draft's intent; decide unclear points with the UX directive, and improve on it where it helps.
3. Build it, with tests, and check it in the running app.
4. Update the docs as for any settled discussion (below); the plan's "Changes from the draft" says what differs
   and why.
5. Delete the draft file (keep the folder's `.gitkeep`), and report what was built, what differs from the draft,
   and what wasn't checked.

## Keeping docs up to date

The product is still being shaped in conversation with the user. When a discussion settles something:

- Update the concept doc and `docs/requirements.md` (add or change requirement IDs; never reuse a removed ID).
- Move the item in `docs/open_questions.md` from "Open" to "Decided", with the date and the decision.
- Add new terms to `docs/glossary.md`.
- Keep this file short: rules and pointers only, details go in `docs/`.

## Rules

- Use only openly licensed game content (D&D 5e SRD 5.1, CC-BY-4.0) when bundling rules text or content. Never copy non-SRD text from published books into the repo. See `docs/concepts/rulesets.md`.
- Don't add game-rule automation beyond "light tracking" without asking: it's a deliberate non-goal.
- Never create two files whose names differ only in case (e.g. `fitName.ts` and `FitName.tsx`), and avoid renaming a file to another case: Windows and Docker Desktop's file sharing are case-insensitive and keep stale entries, which breaks the dev server until the name changes.
- Uploaded Saga files (images, maps, PDFs) are user data: never commit them; samples go in a dedicated examples folder.
