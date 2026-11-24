# 41 - DnD Lite from the adventure: templates carry Stages, EFX and groups

Status: Done
Requirements: TPL-21, TPL-22, TPL-23 (TPL-1, TPL-2, TPL-8, TPL-9, TPL-11, CHR-1, CHR-2, CHR-4 reworded)
Depends on: 11-saga-templates-items-documents (export, import), 40-types-take-over-categories

From the draft `dnd_lite_defaults.md`: "Create the DnD Lite with the configs we have right now on our adventure.
Including: EFX presets, Stages with their Sets and Set settings, character groups with no characters in them, the
rest that is part of a template. Not included: characters, items, relationships, documents, live Stage additions, any
other specific content. If these things are not saved with the template (mostly as starting content), add them."

The user's answers before building: the adventure is the **Test Saga**; its template replaces DnD Lite's as it is;
existing Sagas stay as they are ("a Saga is a set of settings that has nothing to do with the template, plus the
template, plus its specific content").

## 1. What a template file carries

### UX

- **Export** (Template page) now also takes the Saga's **Stages**, **EFX environments** and **character groups**. A
  Saga made from the file, or importing it, gets them (where it has none with the same name): the Stages with their
  Sets in place, set up, with nothing on them.
- Template → **Starting content**: Actors Scene tabs, turn order, dice rolls, and **Goes with an export**: the Saga's
  Stages, EFX environments, character groups, display templates and fog presets, each a link with its count, and what
  never goes (its content). The **starting groups** list is gone: an export takes the Saga's real groups.
- The import's note says what it added ("Added 2 Stages, 1 EFX environment.").

What goes and what doesn't:

| Goes | Doesn't |
|------|---------|
| Stages: name, layout, environment (by name), controls | Which Stage is live |
| Each Set: type, name, place (canvas and screen), layer, transparent, put away, toolbars, who sees it (member groups by key or name) | Members named in who sees it (they're the Saga's) |
| Actors Scene: its tabs' layout settings (shape, spacing, margins, card sizes and styles, turn controls, order by), the template per type (by name) | Its cards, their order, turns, highlight, spotlight |
| Map: players' interaction, grid, fog preset (by name) | The location shown, its layers, highlights, tokens |
| Dice roller: roll types, speed, dice size, tray edge, who rolls (groups) | The tray, the rolls |
| Desktop: layout, gap, panel opacity | Its pieces |
| Timeline, Relationship graph: their settings, groups by key or name | The graph's resources and node positions |
| EFX environments: their layers | Uploaded pictures (left empty) |
| Character groups: name, colour, player party, active, favorite | Their characters and variable values (shared gold) |

### Design

- `set_types/base.py`: `TemplateRefs` (the Saga's member groups, characters' display templates and fog presets by id
  and by name) and three contract members: `template_settings` (the config keys a template keeps), `template_config`
  (ids to names) and `config_from_template` (names to ids; each setting checked with `validate_config` as the DM's
  change; a bad one stays at its default). The Actors Scene overrides both (its tabs live in commands; each tab
  setting goes through `_set_tab`). The Stage core stays generic.
- `services/template_extras.py`: `export_extras` (environments without pictures, Stages, groups) and
  `apply_environments`, `apply_groups`, `apply_stages` (by name; limits: 40 Stages, 40 Sets each; unknown Set types
  skipped; screens and toolbars cleaned). `services/stages.admin_context` renders as the DM for a Saga being made.
- `services/saga_templates`: `export` adds them (the groups as `starting.groups`); `apply_extras` applies them after
  the display templates and fog presets (the Sets point to those by name); `get` counts them.
  `domain/saga_template.EXTRAS` lists the file-only parts `definitions` leaves out.

## 2. Every Saga owns its template

- A new Saga copies its template, the built-in one too (`access.create_saga`): a built-in file changing later never
  changes it. Then the file's extras, then `ensure_template` (a built-in display template only for types still
  without a default; starting groups only those not there by name).
- This also fixed how a Saga is made from a file: the built-in templates were made first, so a file's template with
  the same name ("NPC") was skipped, and every template that wasn't a default was then deleted (alternatives a Set
  used). `prune_builtin_templates` is gone.
- Migration `d3a7c1e9f520`: Sagas still reading the built-in file (`sagas.template` NULL) get a copy of DnD Lite
  0.4.0, kept in `rulesets/archive/dnd_lite_0.4.0.json` (not offered as a built-in). Plan 40's migration reads it too,
  so a database upgrading through both still merges categories against the DnD Lite they were made with.
- Tests run on that archived DnD Lite (`tests/conftest.py`, also after the app's startup reloads the files), so the
  shipped file can change without rewriting them; `test_template_extras.py` tests the shipped one.

## 3. The new DnD Lite (0.5.0)

The Test Saga exported with the above, renamed back to DnD Lite 0.5.0: types **Player**, **DM**, **NPC**
(instanceable); variables (Initiative Mod, Initiative Rolled; no Hit dice); actions **Long rest** and **Roll
Initiative**, each on a character and on a group; archetype categories Class, Race, Talent; group variable Shared
gold; its 7 display templates and their defaults; White mist; EFX **Abstract Cave**, **Dark Night**; Stages
**Exploration** (map, dice roller, Desktop) and **Encounter** (Dark Night: EFX layers, Actors Scene, dice roller,
Desktop); groups **Player Party** and **Enemy**.

## Steps

- [x] Set contract and each Set type's template settings; extras export and apply; Template page.
- [x] Sagas own their template (creation, migration, archive); creation order fixed.
- [x] The new `rulesets/dnd_lite.json` from the Test Saga.
- [x] Tests: backend 164 (export without content, a Saga from the file with ids pointing to its own things, import by
  name and a broken file, the shipped DnD Lite and a Saga keeping its template when the file changes), frontend 230.
  Checked in the running app: the migration (Saga 4 got its copy; Saga 3 untouched), a new Saga from DnD Lite (two
  Stages, the Encounter Stage with Dark Night and its toolbars, both environments, empty groups, the 7 display
  templates and defaults, types Player / DM / NPC; deleted after), the Starting content tab.
- [x] Docs; the draft deleted.

## Changes from the draft

- **Groups**: an export takes the Saga's groups as they are, so the Template page's separate "starting groups" list
  went (two lists of groups, one of them unused, was confusing). Their variable values (shared gold) stay behind:
  they're the Saga's.
- **The map Set** comes without a location (the Saga's content); the DM picks one. **Desktop and Actors Scene** come
  empty. **EFX pictures** are left out (uploads are the Saga's; none of the Test Saga's environments has one).
- **Who sees a Set** keeps member groups (players, viewers, the DM's custom groups by name) but not single members.
- "Enconter" became **Encounter** in the built-in file (agreed before building).
- Beyond the draft: a Saga owning its template from the start (the user's answer), and the fix for a Saga made from
  a file losing same-named display templates.
