# 05 - Groups and encounters

Status: Done (some choices changed in `06-template-lists-and-colors.md`: the cast is now the scene's, the
DnD Lite categories are Player, Major NPC and Minor NPC, the turn highlight follows the group color)
Requirements: CHR-1..11, SET-25..34, SET-10 (covered), SET-11, SET-13, SET-16, SET-19 (changed), DSP-2, DSP-6 (changed), LORE-9 (changed)
Depends on: 04-display-templates

## Goal

Go from creating characters to running a combat with as few steps as possible. Characters are organized
in **categories** and **groups**; NPCs can be **instanceable**. The Creature panel becomes the
**Actors Scene**, with tabs (Exploration, Dialog, Combat), new layouts, an order tray and turn controls.
When this is done, the DM can prepare the party and each encounter as groups, put them in a scene's
Combat tab in two clicks, and run the initiative at the table.

## Out of scope

- Players seeing groups (open question).
- Linked groups (the scene following a group): adding a group is a one-time shortcut.
- Several Saga templates per ruleset, templates with starting lore.
- Rolling dice: initiative is rolled at the table and typed in.
- Undo for turn and order changes (the order tray and "Previous" cover mistakes).

## UX

**Prep (DM, laptop)**

- Characters tab: sections per category; "Categories" (DM) manages them; the form picks the category
  (segmented control), has "Instanceable" (non-player categories; default from the category) and
  "Groups" chips (new player characters: active player parties preselected).
- Groups tab: one card per group (favorites first): name (click to rename), three toggles (★ favorite,
  player party, active), the creatures as small portraits with a count stepper for instanceable ones,
  "+ Add" (a character picker) and delete. "+ New group".
- Stages tab, Build: a new Actors Scene comes with its three tabs. A tab strip on top of the scene (DM
  only) selects which tab is being built; the side panel shows the scene's settings and the selected
  tab's (name, layout, order, turn controls). "+ Add creatures" opens the picker for that tab.
- Picker: groups first (active player parties preselected unless already all in the tab), then
  characters by category; "Add hidden" / "Add and reveal".

**Play (DM at the table)**

- The tab strip is on the scene: one click switches what players see.
- Title menu: layout, flow, scatter, spacing, order ("Order…" opens the order tray), turn controls on/off,
  reveal all / hide all, add creatures, grab attention.
- Turn controls on the scene (when on): ⏮ Start · ◀ Previous · Round N · Next ▶ · ■ End, and "Order…".
- Order tray (popup): rows in order with ▲ ▼ and the initiative typed in place (Enter jumps to the next
  row), "Sort by Initiative", "Start".
- Card menu: as before, plus "In tabs" toggles and "Remove from tab".

**Players (phones)**: only the active tab; current-turn highlight; the turn bar's centre card is big
enough to read at a glance.

## Design

**Data**

- `character_categories`: `id, saga_id, key, name, plural, type, player, instanceable, sort_order`.
- `character_groups`: `id, saga_id, name, player_party, active, favorite, sort_order, created_at`.
- `character_group_members`: `group_id, resource_id, count, sort_order` (cascade on both sides).
- `resources.category_id` (nullable, set null on delete), `resources.instanceable`.
- `sagas.template_applied`: the Saga template's defaults were created (once: deleting "Player Party"
  must not bring it back).
- `sagas.display_defaults` gains `categories: {category_id: template_id}`; the per-type defaults stay as
  the built-in fallback. A Set's `templates` are keyed by category id (old keys by type still read).
- Set type `creature_panel` → `actors_scene` (migration renames and converts old panels: one tab per
  default name, all cards in all three tabs, the old layout in the first).
- Actors Scene config:
  `{card_style, templates, active_tab, next_tab, tabs: [{id, name, shape, flow, scatter, spacing, order_by, order: [actor ids], turn_controls, turn: {actor_id, round}, highlight_actor_id, spotlight}]}`.
- Actor config: `{tabs: {tab_id: {shown, position}}, instance: {number, values}}`. A tab's cast = actors
  whose `tabs` contains it. `values` are only the attributes changed on the Stage.

**Services and API**

- `services/characters.py`: Saga template defaults (`ensure_template`), categories CRUD, groups CRUD.
  Routes in `api/characters.py`, admin only:
  `GET|POST /api/sagas/{id}/categories`, `PATCH|DELETE /categories/{cid}`;
  `GET|POST /api/sagas/{id}/character-groups`, `PATCH|DELETE /character-groups/{gid}`
  (`{name?, player_party?, active?, favorite?, members?: [{resource_id, count}]}`).
- Resources: `category_id` replaces `type` when creating (type still accepted: the type's first
  category), `instanceable`, `group_ids` (admin). Serialized: `category_id` for everyone,
  `instanceable` and `group_ids` for admins.
- Set contract (`set_types/base.py`): `place_actors(ctx, set, resources, options)` (where new actors go:
  into the tab, as instances), `command(ctx, set, name, args)` (named actions), `copy_config` (duplicate
  a Stage: actor ids change), `actor_values` hooks are generic in the core (instances).
- Stage routes: `POST /sets/{id}/actors {resource_ids, group_ids, tab_id, hidden}`;
  `POST /sets/{id}/command {name, args}`; `POST /actors/{id}/counter` and `PATCH /actors/{id}/values`
  (instance: changes the instance; otherwise forwards to the character); `DELETE /actors/{id}`.
  The old reveal and order routes are gone (commands now).
- Actors Scene commands: `tab.switch`, `tab.add`, `tab.rename`, `tab.move`, `tab.delete`, `tab.set`
  (layout settings), `card.show`, `cards.show_all`, `card.tabs` (in/out of a tab), `card.position`,
  `order.set` (by, or a custom list), `order.move` (up/down), `turn` (start, next, previous, end),
  `highlight`.
- Sheet: `GET /resources/{rid}/sheet?set_id=&actor_id=`: an instance's values and name.

**Visibility**: players get only the active tab: shown cards, ordered on the server, no sort values,
no other tab, the turn's actor only if shown. Groups and categories' flags come only to admins (cards
carry a `side` for the boundary layout). Instance values never leak another viewer's hidden values: they
go through the same template rendering.

## Steps

- [x] Docs: concepts (`characters.md`, `stages.md`, `rulesets.md`, `sagas-and-access.md`), requirements,
  glossary, decisions, this plan.
- [x] Backend: models + migration, Saga template in the ruleset file, categories, groups.
- [x] Backend: resources with categories, instanceable, groups; display defaults per category.
- [x] Backend: Actors Scene (tabs, casts, instances, layouts config, order, turns, commands) + core routes.
- [x] Frontend: Characters tab (categories, form), Groups tab, templates per category.
- [x] Frontend: Actors Scene (tabs, layouts, turn bar animation, boundary, order tray, turn controls,
  picker with groups, card menu, inspector).
- [x] Tests (backend and frontend), docs updated with what changed.

## Tests

Backend: Saga template applied once (deleted defaults stay deleted); categories pick the type, can't be
deleted while used; groups CRUD and admin only; instanceable never on player categories; instances
numbered, own values, the character unchanged, group counts expand; non-instance changes reach every
Stage; tabs (own cast, switch, players see only the active tab, delete keeps one); order by attribute and
custom (move switches to custom), turns (start, next wraps and counts rounds, skips defeated, previous),
no initiative values or hidden turn for players; duplicate Stage remaps ids; template per category.
Frontend: layouts (rotate puts the current first, boundary sides, turn bar centre), order tray commands,
turn controls, tab strip.

## Changes from plan

- Actors' `visibility` mirrors "shown in the active tab" (kept in sync after every change), so grab attention,
  the realtime filter and opening a sheet from the live Stage keep working without knowing about tabs.
- The DM's tabs also carry `sequence` (the order before rotating) and the scene `turn_order` (the Saga
  template's value, e.g. initiative), so the order tray shows who goes first and which value to type.
- Card style stays a scene setting (cards would otherwise need rendering once per tab); tabs hold layout,
  cast, order, turns and highlight.
- `PATCH /actors/{id}` is gone: cards have no settings; values go through `/actors/{id}/counter` and
  `/actors/{id}/values`.
- "Add creatures" is drawn by the scene's view (a store opens it), so it survives the popup that opened it.
- The current-turn highlight is **blue**, so it never reads as the DM's gold highlight.
- Categories are readable by every member (they are the Characters tab's sections); their counts, and all
  groups, are admin only.
- Built-in display templates stay one per type; a category without its own default uses its type's.
- The migration converts old Creature panels: three tabs, every card in all of them (shown as before), the
  old layout and highlight in the first.
- Checked with API and component tests (backend on SQLite and Postgres, frontend with Vitest) and a
  production build; the screens weren't tried in a browser during the build.
