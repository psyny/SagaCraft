# SagaCraft

A companion app for tabletop RPG campaigns, built for the Dungeon Master (DM) and their players. It does four things:

1. **Stages**: the DM builds scenes ("Stages") out of composable "Sets" (battle grid, map, image, relationship graph...) and shows one Stage at a time to the players, live.
2. **Lore**: the DM keeps the Saga's documents, pictures, maps and notes, and decides who can see each one.
3. **Relationships and events**: anyone links resources with relationships ("A killed B"), each marked with who created it; events put resources and relationships on the Saga's calendar and timeline.
4. **Light tracking**: HP, initiative, inventory and similar data on the Saga's resources (documents, characters, locations, items), shaped by a swappable **Ruleset**. SagaCraft is system-agnostic; *DnD Lite* (our light take on D&D 5e 2014) is the reference ruleset during development.

It is **not** a full virtual tabletop and does **not** automate every game rule. People play at the table (or on a call); SagaCraft supports them.

Status: **first version in progress** (`docs/implementation/01-first-version.md`): access, DnD Lite characters (types, colored groups, instanceable NPCs, list-based display templates and sheets, a full-screen tabbed editor, tokens in the player's colour), locations with maps (grid, fog of war, links, paths, regions) and a location map (how they connect), items and documents (documents, items and locations in folders with their own who can see), relationships (graph screen and Set) and events (a horizontal timeline or a list, periods, eras, calendars) in a Lore tab, an editable Saga template (export/import; actions with dice formulas, archetypes), a Saga page for set-up (and everyone's User page), EFX environments (animated skies, landscapes, weather) shown by connected EFX Sets, live Stages (canvas or interface layout, Set controls in toolbars the DM places, Sets put away with an eye, the Stage's own Stages, EFX and Action controls) with the Actors Scene, the Map Set (labels, mobile tokens, pings, grab attention on the DM's view) and the Relationship graph, Timeline, Desktop and Dice roller Sets (3D dice in each member's colour and style), and the live link (the live Stage on a second screen, no sign-in) work end to end.

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
- A new Set type = one backend module in `set_types/` + one frontend folder in `stage/sets/`, both registered. The Stage core must not change. Members (players and the DM) act on a Set through `SetType.act` (route `POST /sets/{id}/act`; the DM's own changes stay `command`). Its view handles the three Stage modes (`view` players, `play` DM using it with popups, `build` DM building it); its `Inspector` shows only the selected thing; its `PlayMenu` is the popup on its ⚙ in the Set bar (without one, the ⚙ opens its `Inspector` in a window in Play); its `icon` is its Set bar button; its main toolbar (`<Toolbar id="main">`) shows in the Set bar's menu row, and `<Toolbar id="sub">` in the tool row under it (the tools of what the main toolbar picked: the Map's tools, `maps/toolbar/`); its other controls go in toolbars (`SetTypeUI.toolbars`, filled with `<Toolbar id>` from `stage/Toolbar.tsx`) that the Stage places where the DM set them up, never in strips of its own. Its view lays out for the `width`/`height` it's given (in the interface layout that's its share of the screen); content that zooms itself is marked `data-wheel`. See `docs/implementation/03-build-and-play.md`.
- Set types expose **commands** (`SetType.command`, route `POST /sets/{id}/command`) for their named actions and decide where new actors go (`place_actors`); instances of instanceable characters keep their own values in `actor.config["instance"]`. See `docs/implementation/05-groups-and-encounters.md`.
- Viewers act on a Set only through the acts its type names in `SetType.viewer_acts` (the Map's `token.move`). While the live Stage is paused (`stages.paused`), players' and viewers' acts, pings, token drags and action runs are refused (`services/stages.refuse_if_paused`); new player actions must check it too. See `docs/implementation/58-token-moves-pause-sheet-edits.md`.
- The map painter (`domain/map_paint.py`, `frontend/src/maps/painter/`): the server keeps paintings as data in layers
  (terrain, routes, boundaries on the edges between tiles, scenery, effects, features; viewers get only their tiles')
  and the browser draws them (a ground shader, then sprites, boundaries' boxes, rivers' waterfalls and effects'
  particles). What can be painted and how each style draws it is data in `backend/sagacraft/map_painter/styles/<style>/`
  (JSON types, SVG sprites): a new type or a redrawn one is a change there, not code; see
  `docs/concepts/map-painter-art.md`. New patterns or route looks are shader code, checked with `make gpu-check`. See
  `docs/implementation/48-map-painter-layers.md`.
- Locations' maps (`domain/maps.py`, `services/locations.py`): tiles are kept by column and row from the grid's top left. Players never get a map's pictures: only the composed picture made for their fog (`/api/maps/{id}`, signed). Map editing goes through map commands (`POST /locations/{id}/map/command`), the same from the location page and map Sets. Map Sets draw the fog with the Saga's fog presets (`domain/fog.py`, `services/fog_presets.py`), never their own fog settings. See `docs/concepts/locations.md`.
- How characters are displayed (cards, sheets) comes from display templates (`domain/display.py`, `services/displays.py`): per mode and view, lists of elements per region. Set types render them through `RenderContext.displays` (`DisplayBook.render`) and don't add their own per-card display settings. See `docs/implementation/06-template-lists-and-colors.md`.
- The ruleset is the Saga's own Saga template (`sagas.template`: every Saga owns a copy, made when it's created; a built-in file changing never changes a Saga): always read it with `services/resources.ruleset_for`, never `get_ruleset` on a Saga. Template edits go through `domain/saga_template.py` and are validated by parsing. A template file also carries what the Saga set up (display templates, fog presets, EFX environments, Stages, groups: `services/template_extras.py`), never its content; a Set type lists the settings that go (`SetType.template_settings`). Tests run on DnD Lite 0.4.0 (`rulesets/archive/`), not the shipped file. See `docs/concepts/rulesets.md` ("Saga templates").
- Relationships and events (`services/relationships.py`, `services/events.py`, `api/lore.py`): relationships are read and written per member group, ends a member can't see are masked, and a dated relationship and its event's date are one record (keep `sync_event_date` / `_set_dates` in charge of that). In-world dates are integers `y*10000+m*100+d` read with the Saga's calendar (`domain/calendar.py`; frontend `saga/lore/dates.ts`). See `docs/concepts/relationships.md` and `docs/concepts/events.md`.
- EFX (`domain/efx.py`, `services/environments.py`, `frontend/src/efx/`): the effect catalog on the server is the single source of effect kinds and their settings (the editor is built from it, changes are checked against it); a new effect = a catalog entry + a renderer in `frontend/src/efx/effects/`. EFX layers never catch clicks (Set contract `passThrough`). New Sets are placed by the backend hints `depth`, `backdrop`, `default_transparent`, `default_screen`, `private`. See `docs/concepts/efx.md`.
- Every picture upload goes through `frontend/src/components/imageEditor/ImageUploader.tsx` with an upload category, and through `services/uploads.py` on the server (limits per category, Pillow checks). Don't add other upload paths.
- Show pictures with `components/Picture.tsx` (or `components/sizedUrl.ts` in SVG): they ask for the width they're drawn at (`/api/files/{id}?w=`) and load lazily; inside a box scaled up by a CSS transform, give the scale with `PictureScale`. File and map picture responses stay cacheable (`security.cache_headers`). See `docs/implementation/31-performance-overhaul.md`.
- A resource's variables come from `Ruleset.def_for(resource)`: its type's, plus a character's archetypes' up to their levels. Use it (not `type_def`) wherever values are read, shown, checked or changed. Archetype variables that change by level are set by `domain/archetypes.apply_levels` when a character's archetypes change (the editor's preview mirrors it in `saga/archetypes.ts`). See `docs/implementation/33-improvements.md`.
- Saga-wide options live in `sagas.settings` (`services/access.SAGA_SETTINGS`, read with `saga_settings`: missing ones at their defaults), on Saga → Settings. An action's lines are costs, changes (add / remove / set) and triggers; older "gains" are read through `domain/actions.upgrade`. Sets that show an action's dice implement `SetType.action_rolled`. See `docs/implementation/37-display-and-action-upgrades.md`.
- Controls that need no Set are the Stage's own (`stages.controls`: Stages, EFX, Actions; `frontend/src/stage/StageControls.tsx`), in the DM's Set bar (Actions for players too); don't make a Set type just for controls.
- Dice styles live in `frontend/src/dice/styles.ts` (the server's list: `services/access.DIE_STYLES`). A style is painted face by face into an atlas (its edges plain), or gives a `surface`: a GLSL kind in `dice/surfaces.ts` worked out per point, one material over faces and edges; numbers stay in the atlas either way (solid, matte, debossed; every die's shader takes their specular away). See `docs/implementation/32-continuous-dice-surfaces.md`.

## Commands

```sh
make.bat up              # Postgres + API + frontend in Docker: http://localhost:3100 (API :8100/docs), sign in admin / admin123
make.bat down            # stop (data kept); make.bat reset-db deletes local data
make.bat be-tests        # backend tests on SQLite, no Docker
make.bat be-tests-postgres   # same tests against the Docker Postgres test DB
make.bat fe-build        # frontend typecheck + build
make.bat fe-tests        # frontend unit tests
make.bat gpu-check       # build every WebGL shader under each graphics backend this machine has (app running)
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
- **Accounts** are the server's (one login per person, lowercase: not case sensitive; System → Users for system admins with `users.manage`); a **membership** (`SagaMember`) puts one in a Saga with a role (admin/DM, player, viewer) and that Saga's display name, colour and dice options. An account has no name: show members with `services/access.member_name`. Saga admins add existing accounts or create new ones for their Saga. System administration of Sagas (list, a Saga's numbers, on/off, delete) is `services/system_sagas.py`: numbers and names, never a Saga's content.
- **Member groups**: default `admins`, `players`, `viewers` (automatic by role) plus custom groups. Visibility is a list of member groups and/or members.
- **Characters** are organized by **type** (the Saga template's character types: their variables, *player characters*, *new ones instanceable*; plan 40 merged the old categories into them) and **groups** of characters (the party, encounters; DM only, `CharacterGroup` in code). A Saga starts from a **Saga template** (ruleset + starting groups and more). Read "is it a player character" from `Ruleset.type_def(...).player`, never from a type key. See `docs/concepts/characters.md`.
- **Visibility is enforced on the server**: a client never receives what its user can't see (including file URLs). Never rely on hiding things in the UI.
- **Viewers see what players see and never edit** (`viewer_for` gives them the players group; `rule_allows(..., edit=True)` refuses them). A resource's visibility can name its **owners**; a folder's can override its resources' (`services/resources.effective_visibility`: always go through `can_see_resource`). Several-at-once picks use `components/ComboTray.tsx`.
- An actor may own an upload (`actor.config["temp_file_id"]`): the Stage core deletes it with the actor, Set or Stage and copies it on duplicate; never keep a Set's temporary pictures elsewhere.

## Docs

Read the relevant doc before planning or changing anything in its area.

| Doc | What it holds |
|-----|---------------|
| `README.md` | Short overview for humans |
| `docs/vision.md` | Product idea, goals, non-goals, principles |
| `docs/requirements.md` | Requirements list with IDs and priority (MVP / Later / Goal) |
| `docs/concepts/ux.md` | UX directive and principles; future speech/AI help |
| `docs/concepts/stages.md` | Stages, Sets, Actors, layers, visibility, "grab attention", the Actors Scene, the map Sets |
| `docs/concepts/rulesets.md` | Resources, types, attributes (variables; counters' min and max), references, Saga templates (Template page, export/import, actions), calculated variables, DnD Lite items and documents, editor roadmap, licensing |
| `docs/concepts/characters.md` | Character types, groups (parties), instanceable characters, the prep-to-combat flow |
| `docs/concepts/locations.md` | Locations, maps (pictures, grid, fog of war, links, paths, regions), icons and galleries, resource picker and view |
| `docs/concepts/relationships.md` | User relationships, types, creator mark, graph viewer and queries, reveal, the graph Set |
| `docs/concepts/events.md` | Events, sub-events, eras, calendars, the timeline |
| `docs/concepts/map-painter-art.md` | The map painter's art: style folders, JSON types, SVG sprite rules, a prompt for AIs |
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
   and what wasn't checked. **Exception: `docs/drafts/next_steps.md`** is the user's standing draft: once it's
   implemented, clear its content (leave it empty) but never delete the file.

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
- The app must work on every common platform: Chrome, Edge, Firefox and Safari, on Windows, macOS, Linux, iOS and Android, touch included. WebGL shaders (maps, EFX, dice) are the fragile part: each platform translates them its own way (Windows to Direct3D, macOS and iOS to Metal), and one that works on macOS can fail on Windows (the map shader did, from a texture read nested two function calls deep). Direct3D's compiler also inlines every call and unrolls every loop that reads no texture, so a big shader can take tens of seconds to build there, and the browser freezes meanwhile (the map painter's did, 50 s): keep big code once, in loops that read a texture, and build big shaders in the background (`KHR_parallel_shader_compile`, as `maps/painter/renderer.ts`). After a shader change, run `make gpu-check` (it builds them all under each backend the machine has: Direct3D, Vulkan, OpenGL, Metal, software, and reports the painter's build time); check browser APIs before using them (iPhones have no fullscreen, the Clipboard API needs HTTPS, Safari before 18 needs `-webkit-backdrop-filter`).
- Uploaded Saga files (images, maps, PDFs) are user data: never commit them; samples go in a dedicated examples folder.
- Git: work on `main` (no feature branches); commit and push only when asked. Commit messages are plain and short: never add a watermark, a `Co-Authored-By` line or any mention of Claude or AI.
