# 40 - Character types take over categories; counters' min and max

Status: Done
Requirements: CHR-24, RUL-35 (CHR-1, CHR-2, CHR-3, CHR-16, DSP-2, DSP-6, DSP-13, DSP-16, DSP-20, SET-13, SET-60,
LORE-9, RUL-32, TPL-1, TPL-7, TPL-9, TPL-11, TPL-18, ITEM-1, ITEM-2, ITEM-4 reworded)
Depends on: 05-groups-and-encounters (categories), 38-categories-in-the-template, 39-map-drag-and-views

From the user's request (no draft file): "do the merge" (the open question of plan 39: character categories and
types) "and also: variables of counter type should have a min and a max; changing the current value never goes out
of them, it's set to the boundary (on the Actors Set we can click on HP and set it beyond the max)."

## 1. Character types take over categories

### Why

A character had a **type** (the Saga template's: its own variables, who sees each shared one) and a **category** (the
Saga's, based on a type: the Characters page's sections, *player characters*, *new ones instanceable*, a default
display template, the Actors Scene's template per category). Only the variables used the type; everything a DM sees
used the category, and the template page showed both side by side. Every other kind has types only. Now characters
do too: one concept, **type**.

### UX

- **Template → Characters → Types**: the list and the type picked (name, plural, what can happen to one in events,
  **Player characters**, **New characters are instanceable**, delete while unused and not the last, add). The
  Categories sub-tab is gone (`?sub=categories` opens Types).
- **Characters page**: a section per type (DnD Lite: Players, Major NPCs, Minor NPCs); its **Types** button opens
  Template → Characters → Types. The section's ＋ starts a character of that type.
- **Character editor**, Admin → **Type**: a row of buttons, one per type (the DM's). A character moves to **any**
  type (it used to be only categories of the same base type); values its new type doesn't have stay, unseen.
- **Display templates**: one default slot per type (characters and items alike); a template that is a type's
  default can't be deleted.
- **Actors Scene**: the DM picks a template per type; the Boundary layout's players' side is the types marked as
  player characters.
- The display element **Type** (was *Category*) shows a character's type name.

### Design

- `Ruleset.TypeDef` gets `player` and `instanceable` (characters only; a player type is never instanceable),
  in `to_dict` too. `rulesets/dnd_lite.json`: `pc` "Player" (player), `npc` "Major NPC", `minor_npc` "Minor NPC"
  (instanceable, a copy of `npc`'s variables); `starting.categories` is gone.
- `domain/saga_template.py`: `update_type` takes `player` and `instanceable`; `merge_categories(doc, categories)`
  turns a document with categories (an older file's `starting.categories`, or the Saga's rows) into types and
  returns the mapping category → type key.
- `services/characters.ensure_template`: a built-in display template per character type that has no default, and
  the starting groups. All category CRUD (service, routes, `CategoryIn`) is gone.
- `services/resources`: creating a character takes `type` (instanceable from the type; a player type's new
  characters join the active player parties); `update_resource(new_type=...)` moves one (the DM).
- `services/displays`: `display_defaults[kind][type]` only; `template_for` = the scene's pick for the type, else
  the type's default; the `@category` system element renders the type's name (its key stays, so saved templates
  keep working).
- `services/saga_templates`: export and import without categories (`display_templates[].for_types` only);
  `parse_file` merges an older file's categories first and reads `for_categories` as `for_types`.
- `set_types/actors_scene.py`: the card's side from `type_def(...).player`; `config.templates` keyed by type.
- `models`: `CharacterCategory` and `Resource.category_id` are gone. Frontend: `saga/characterTypes.ts` (the
  ruleset's character types) replaces the categories fetch in `SagaContext`; `saga/template/TypesTab.tsx` (was
  `CategoriesTab.tsx`).

### Migration (`b8e2f6a0d514`)

Per Saga, its categories in order: the first of each base type keeps the type's key (so DnD Lite's Player stays
`pc`, Major NPC `npc`), the others become copies of their base type (a key from their own key or name: `minor_npc`,
`dm`), each with the category's name, plural and flags; actions limited to the base type also apply to the copies.
Characters take their category's type; display defaults (a category's own, else its base type's) and the Actors
Scenes' templates per category move to the types. A Saga on the built-in template keeps reading it when the result
equals the built-in types. Then `resources.category_id` and `character_categories` are dropped (the downgrade
brings back an empty table and column). Self-contained: no app imports.

On the dev database: Saga 4 (built-in DnD Lite) stays on the built-in template, defaults `{pc, npc, minor_npc}`;
Saga 3 (its own template) has `pc` "Player", `dm` "DM" (a copy of `pc`, keeping its own default template) and `npc`
"NPC" (instanceable).

## 2. Counters' min and max

### UX

- A counter has a **min** (0 unless set) besides its max: Template → a counter variable's starting value has
  Current, Min and Max; a character's or item's Variables show Current / Min / Max.
- Its current value never leaves them: typed past one (a form, a card's value on the Actors Set, an instance), it's
  set to it, with no error. Actions' costs and *remove* stop at the min, *add* at the max, *set* between them.

### Design

- `domain/ruleset.validate_block` (every write goes through it: forms, `/counter`, cards, instances): `min`
  optional (refused above the max; may be negative), `current` clamped; `min` stored only when not 0.
- `domain/actions.Thing.floor(key)`: a counter's min (else 0) for costs, *remove* and *set*.
- `domain/display.render_element` sends a counter's `min`; the Actors Scene's value editor clamps before it saves,
  so the card shows the value it will keep at once.

## Steps

- [x] Ruleset types with player and instanceable; DnD Lite's three types; the merge (domain, files, migration).
- [x] Services, routes and Set type by type; category code, table and column removed.
- [x] Frontend: Types tab with the flags, Characters page by type, the editor's Type, display slots per type.
- [x] Counters' min: validation, actions, rendering, forms, the card editor.
- [x] Tests (backend 160, frontend 228): types and flags, defaults and deletes, export and import (an older file's
  categories as types), counters kept within min and max (resources, cards, actions). Checked in the running app:
  the migration on both Sagas, the Characters page's sections, Template → Characters → Types, display slots per
  type, the Actors Scene's cards, the new-character form (Type, HP Current / Min / Max), HP set to 50 and −7 on
  the live API (kept at 10 and 0, then put back).
- [x] Docs.

## Changes from the request

- **"type" keeps the old keys**: the first category of each type takes the type's key (`pc`, `npc`), so characters,
  actions limited to a type, and files' `for_types` keep working; only the extra categories got new keys.
- A character now moves to **any** type, not only types with the same variables: values the new type lacks stay
  hidden on it, as when a variable is deleted.
- The display element is labelled **Type** but keeps the key `@category`, so existing templates need no change.
- A counter's min defaults to 0, which is what actions already did; it may be set below 0 (a DM who wants HP to go
  negative).
- Past a boundary the value is **set to it**, as asked, on the server (so every client and action obeys), and the
  card editor clamps too so nothing flickers.
