# 01 - First version (vertical slice)

Status: In progress
Requirements: NFR-2, NFR-7, NFR-8, SYS-1..5, SAGA-1..5, GRP-1..4, VIS-1, VIS-2, VIS-4 (partly), RUL-1, RUL-2,
RUL-4, RUL-12..15, STG-1..10, STG-12 (no), SET-11..20, UX-1, UX-3 (partly), UX-4, UX-5, NFR-1, NFR-4
Depends on: nothing (first part)

## Goal

A DM can run a real scene: log in, create PCs and NPCs with pictures, build Stages with a Creature panel,
make one live, and change HP during play while players watch it update on their phones. The system admin
can create Sagas and their admins; Saga admins create players and groups.

## Out of scope (later parts)

Relationships, events, eras, calendars, timeline, documents/lore pages, locations, items UI (Inventory is
in the ruleset but not editable yet), other Set types (image, map, grid, graph), ruleset upload/editor,
invite links, object storage (see Design: files), multi-process real-time.

## UX

- **DM (laptop)**: one Stages screen: stage list on the left (live marker, "Go live"), the Stage canvas in
  the middle (drag Sets, drag cards), an inspector on the right for the selected Set/card. HP change on a
  card: click the HP, type `-7`, Enter. Highlight / spotlight / grab attention: one click on the selected card.
- **Players / viewers (phone)**: the Stage tab shows the live Stage full-screen, pan/zoom with fingers or
  mouse, "Recenter" button. Grab attention brings them to the Stage tab and glides the view to the target.
- **Characters**: list of cards; create with type, name, HP, initiative, picture (face crop with sliders),
  players in control. Players see what's visible to them and edit what the ruleset allows (their PC's HP).
- New cards start hidden; "Reveal all" in one click.

## Design

### Backend (`backend/sagacraft/`)

Layers like the sibling projects: `api/` (thin routes) → `services/` (use cases) → `models/` (SQLAlchemy).
`domain/` holds pure rules (visibility, permissions, ruleset loading/validation, discrete threshold).
`set_types/` holds Set type modules (`creature_panel.py`) behind one contract (`base.py`).

Tables: `users`, `system_admins` (permissions list, root flag), `sagas` (ruleset key, live stage),
`saga_members` (role), `groups` (default groups have a `key`), `group_members` (custom groups),
`resources` (kind, type, name, attributes JSON, visibility JSON), `files`, `stages`, `stage_sets`
(type, x/y/w/h, layer, visibility, config JSON), `stage_actors` (set, resource, position, order,
visibility, config JSON).

- **Accounts** are global to the instance; a Saga admin creates a new account for the Saga, or adds an
  existing one by login (open question: account scope).
- **Root system admin** created on startup from `ROOT_ADMIN_LOGIN` / `ROOT_ADMIN_PASSWORD` when the
  instance has no system admin.
- **Visibility** = `{"groups": [group ids], "members": [member ids]}`; admins see everything. Ruleset
  attribute rules use group keys (`admins`, `players`, `viewers`, `controllers`).
- **Set type contract**: `default_config`, `validate_config`, `validate_actor_config`, `render(viewer)`.
  `render` returns the Set already filtered for that viewer.
- **Real-time**: one WebSocket per open Saga (`/api/sagas/{id}/ws?token=`). After a change the server sends
  each connection its own message: `live_stage` (the live Stage filtered for that member) and
  `stage_updated` (admins refetch the Stage they're editing). `attention` messages for grab attention.
  In-memory hub: one API process (enough for now; Redis pub/sub if we scale out).
- **Files**: stored in Postgres for v1 (behind a small storage module, max 5 MB, images only), served with
  short-lived signed URLs so `<img>` tags work without exposing files. Railway-safe (no container disk).
  Move to object storage later (NFR-3).
- **Commands (UX-6)**: each API mutation is one named, self-contained action (e.g. `change_attribute`,
  `set_live_stage`, `grab_attention`), so voice/AI can call the same actions later.

### Frontend (`frontend/`)

React + TypeScript + Vite. `src/api/` (typed client), `src/pages/`, `src/saga/` (Saga screens),
`src/stage/` (canvas, pan/zoom, attention) and `src/stage/sets/<type>/` (one folder per Set type:
view + inspector, registered in `src/stage/sets/registry.ts`).

## Tools chosen

| Need | Choice | Why |
|------|--------|-----|
| API | FastAPI + Uvicorn | Same as sibling projects; async WebSockets built in |
| ORM / migrations | SQLAlchemy 2 + Alembic | Same as sibling projects |
| Auth | bcrypt + PyJWT (Bearer token) | Simple, no external service |
| Tests | pytest on SQLite (no Docker), optional Postgres | Same as sibling projects |
| Frontend | React 18 + TypeScript + Vite + react-router | Decided stack |
| Animations | framer-motion | Layout animations (cards gliding), springs; makes the UI feel nice |
| Stage canvas | Plain DOM + CSS transforms | Cards are rich HTML; no canvas library needed yet |

## Steps

- [x] Docs: Creature panel concept and requirements
- [x] Backend: settings, DB, models, migration, auth, bootstrap
- [x] Backend: system admin, Sagas, members, groups
- [x] Backend: ruleset loader + DnD Lite, resources, files
- [x] Backend: Stages, Sets, actors, live Stage, Creature panel render, WebSocket hub, attention
- [x] Backend tests (31, SQLite and Postgres)
- [x] Frontend: login, home, system admin, Saga layout, members/groups, characters
- [x] Frontend: Stage canvas, Creature panel view + inspector, animations, live Stage tab, attention
- [x] Docker (dev + prod-local), make scripts, Railway notes
- [x] Run it end to end in Docker (API + WebSocket script; production images build)
- [ ] Try it at a real table and collect UX feedback

## Tests

Backend API tests: bootstrap and login; system admin permissions (can't grant what you don't hold);
Saga isolation (a member of Saga A gets 404 on Saga B); member roles and default groups; resource
visibility and attribute rules (player edits own PC's HP, not an NPC's); live Stage filtering: hidden cards
and attributes absent from player payloads, discrete mode sends only the ball count, never raw values;
discrete threshold levels and seeding. Frontend: unit tests for the card layout.

## Open points

- Account scope (global vs per Saga): v1 uses global accounts.
- Grab attention: v1 moves the view once (no lock).

## Changes from plan

- **Subtype overrides**: DnD Lite needs PC HP visible to everyone but NPC HP hidden, so types can override
  inherited `view`/`edit` rules (`overrides` in the ruleset). Only those two rules can be overridden for now.
- **Stage display defaults** live in the ruleset (`stage_display` per type: PC HP as bar, NPC HP discrete,
  NPC initiative hidden).
- **Sets are visible to players and viewers by default**; their **cards start hidden**. A Stage that isn't
  live is already a draft, so hiding the Set as well would only add a click.
- **Hidden** in admin views means "shared with nobody but admins" (admins see everything, so "can see" can't
  be used for that).
- **psycopg 3** instead of psycopg2: SQLAlchemy 2.1 uses it by default for `postgresql://` URLs.
- **Ports 3100/8100/5442** (prod-local 8180/5443) so SagaCraft runs next to ibis and AdaptaFit.
- **Frontend nginx listens on `$PORT`** (template), so Railway needs no port setting.
- **Inventory** is in the DnD Lite ruleset but shown as "coming soon" (needs Items UI).
