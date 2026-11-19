# Open questions and decisions

When a question is settled, move it to **Decided** with the date, and update the related docs.

## Open

### Access

- **Account scope**: is an account global to the instance (one login, member of several Sagas with
  different roles), or created per Saga (one login per Saga)? Saga admins "create users for their Saga"
  either way; the difference is whether they can also add an existing account.
- **System admins and Saga content**: can a system admin open a Saga's lore and Stages (support), or
  only manage it from outside (privacy)?
- **Saga admin limits**: can a Saga admin remove another Saga admin, or only a system admin?
- **Group permissions**: beyond visibility, which permissions will groups carry later (move tokens,
  edit lore pages, see the DM's notes...)?

### Product

- **Name of the leader role**: "DM" in the UI, or a neutral "GM"/"Narrator" since the app is system-agnostic?
  (Internally the role is `admin`.)
- **Grab attention behavior**: does it lock the member's view until released, or move it once and let
  them pan away? Does it force the Stage tab open or just notify?
- **Player interaction on Stages**: can players move their own token, ping or draw in the MVP, or is
  the Stage view-only for players at first?
- **Second screen**: a "table display" mode (TV showing the live Stage)? It could simply be a viewer account.
- **Characters**: who creates player characters (player or admin)? (What players can edit follows the ruleset's edit rules.)
- **DnD Lite**: PC- and NPC-specific attributes, default visibility/edit rules, and the Document,
  Location and Item types. Resource-model questions are listed in `concepts/rulesets.md` (Open points).
- **Relationships**: open points listed in `concepts/relationships.md` (matching rule, reveal as copy or
  link, references in the graph...).
- **Events**: open points listed in `concepts/events.md` (undated events, who creates eras...).

### Rulesets

- Ruleset file format: JSON or YAML; JSON Schema for validation?
- Formula language for derived values (safe expression language vs. fixed functions).
- Can a Saga change ruleset or version after creation?

### Technical (pick when the features need them)

- How real-time scales past one API process (Redis pub/sub?).
- Canvas library for heavy Sets (battle grid, map with fog): plain DOM is enough for the Creature panel.
- Object storage for files (S3-compatible service, Railway bucket...): v1 stores pictures in Postgres.
- Auth: add OAuth (Google, Discord) next to login/password?
- Mobile: responsive web first, native app later?

## Decided

| Date | Decision |
|------|----------|
| 2026-11-19 | App name: **SagaCraft**. |
| 2026-11-19 | Stages and Rulesets are the core of the app; everything else supports them. |
| 2026-11-19 | System-agnostic through data-defined Rulesets. Reference ruleset for development: **DnD Lite**, our light take on D&D 5e 2014. |
| 2026-11-19 | Ruleset editor is a project goal; v1 may be a plain data file. |
| 2026-11-19 | Not a full VTT and no full rule automation: light resource tracking only. |
| 2026-11-19 | One live Stage at a time; members see it in a Stage tab and can use the rest of the app freely. |
| 2026-11-19 | Stages are made of Sets with position, size, layer and visibility; first Set types: image, map, battle grid, relationship graph. |
| 2026-11-19 | Stack: **Python backend, React frontend, PostgreSQL**. Libraries and tools are picked later, per feature, in implementation plans. |
| 2026-11-19 | Runs locally with **Docker**; prepared from the start for easy deploy on **Railway**. |
| 2026-11-19 | One backend instance hosts many **Sagas**; the Saga is the main division of concerns (replaces "campaign"). |
| 2026-11-19 | System admins manage the instance; they create other system admins with chosen permissions, create Sagas and their Saga admins. |
| 2026-11-19 | Saga roles: **admin (DM)**, **player**, **viewer**. Saga admins create the Saga's users. |
| 2026-11-19 | **UX is the top directive**: the app aids playing and gets out of the way; UX wins trade-offs by default. Speech recognition and AI help are long-term goals. |
| 2026-11-19 | A ruleset defines the Saga's **resources** (kinds: Document, Character, Location, Item), their types and subtypes, structured attributes with per-group visibility, and the relationships between resources. Locations nest to build the world map. |
| 2026-11-19 | DnD Lite characters: types PC and NPC; shared attributes Name, HP (current/max), Initiative, Players in control, Inventory (list of Items). |
| 2026-11-19 | **Relationships** are user data, not ruleset: admins and players link any two resources with a typed relationship (directed or undirected; predefined + custom types). Each records its creator and role. Ruleset links are called **references**. |
| 2026-11-19 | Relationship **graph viewer**: built on demand by the backend from a query (connections between characters, within a set with N hops...), rendered by the frontend; available as a screen and as a Stage Set (replaces the manual relationship map). |
| 2026-11-19 | **Events**: in-world date, description, resources, sub-events (resource event types, relationships). Dated relationships and relationship sub-events are the same record. |
| 2026-11-19 | Each Saga picks a **calendar** (real or fantasy); a **timeline** screen and slider show the saga over time. |
| 2026-11-19 | Relationships **belong to groups**: members see only their groups' relationships; players add, edit and remove relationships and relationship types in their own groups. The DM's truth lives in `admins`. |
| 2026-11-19 | Relationships have a **start and end date**, each an in-world date or "always". |
| 2026-11-19 | **Event is a resource kind**. Events have one exact date (no partial dates, no durations) and one level of sub-events. Periods are **eras** (named, with start and end date). |
| 2026-11-19 | First version tools: FastAPI + SQLAlchemy 2 + Alembic, psycopg 3, bcrypt + PyJWT; React + TypeScript + Vite, react-router, framer-motion; Stage canvas in plain DOM + CSS transforms; WebSockets (in-memory hub). |
| 2026-11-19 | v1 accounts are global to the instance: a Saga admin creates a new account or adds an existing one by login. |
| 2026-11-19 | First Set type: **Creature panel** (cards, per-attribute display modes and audiences, discrete threshold, layouts, highlight/spotlight/attention, animations). |
| 2026-11-19 | **Picture uploader**: crop, rotate/mirror and colour tools in the browser; resized and compressed to per-category limits (character, item, document, map) set by system admins; checked again on the server (Pillow). |
| 2026-11-19 | Every Stage has a **Build view** and a **Play view**. The DM's Stage tab is Play on the live Stage. Build's side panel shows only the selected thing; Play acts through popups. |
| 2026-11-19 | Creature panel: arrangement = shape (grid, row, column, circle, free) + order (manual, initiative); each value has "how players see" and "how DM sees"; value editor steps: one order of magnitude below the value's scale, and 1. |
| 2026-11-19 | Creature panel cards are always compact (no card size). "Picture" became **card style**: face, none, full. |
| 2026-11-19 | Creature card settings split into **Player view** and **DM view** (same options). Values: style (bar, number, balls) + displayed on (card, hover tray, hidden). Card visibility is shown/hidden per view, no per-group choice; per-value audiences dropped. Panel **spacing** setting (circle grows with it). |
| 2026-11-19 | Groups: default `admins`, `players`, `viewers` (automatic by role) plus custom groups, used in visibility and later permission settings. |
