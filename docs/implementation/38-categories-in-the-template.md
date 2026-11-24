# 38 - Categories, types and variables in the Saga template; sorting by any variable

Status: Done (its character categories were merged into the types by `40-types-take-over-categories.md`)
Requirements: TPL-18, TPL-19, TPL-20 (TPL-17, DSP-27, CHR-2, SET-31 reworded)
Depends on: 05-groups-and-encounters (categories, the scene's order), 11-saga-templates-items-documents (the Template
page), 34-small-improvements (display templates as a tab)

From the user's request (no draft file): character categories were made on the Characters page, in a small window
whose fields were too short to read; the Template page's variables editor had two cards that hardly related; sort
lists only offered Level and Initiative.

## UX

- **Sub-tabs per kind**: Characters: **Variables**, **Types**, **Display templates**, **Categories**. Items:
  **Variables**, **Display templates**, **Categories** (the item categories are the item types). Documents,
  Locations, Events: **Variables**, **Types**. Display templates are no longer a tab of the Template page.
- **Categories** (characters) and **Types** (every kind; items' are their Categories): the list on the left (name,
  how many own variables or what it's based on, how many resources use it) and ＋ Add under it; the one picked on
  the right, its fields full width.
  - Character categories: Name, Plural (the Characters page's section title), Based on (the character type; fixed
    while characters use it), its **default display template** (a slot that opens the template picker; "Its type's"
    when it follows its type), Player characters, New characters are instanceable, how many characters (a link to
    the Characters page), Delete (while unused). The Characters page's **Categories** button opens it.
  - Types: Name, Plural, what can happen to one in events (not for events), an item category's default display
    template, how many own variables (edited in Variables), how many resources, Delete (while unused; not the last).
- **Variables**: a top card picks **whose variables**: *Every …* or one of the types (each with how many it has).
  Below, one list (the picked scope's variables, ＋ add; for a type, also who sees the shared variables for it) and
  the variable being edited. Types aren't picked or added in the list's card any more.
- **Sorting**: the Characters page's sort, the Actors Scene's **Order** (per tab) and the order tray offer **every
  number, counter (its current value) and calculated variable** of characters (types' and archetypes'), in a
  dropdown, nothing named in the code (DnD Lite: Level, HP, Initiative, Hit dice, Weight carried). The order tray
  types a number or a counter's current value in place, and shows a calculated one. The turn order a Saga starts
  with (Starting content) lists every character number. The variable editor's "Lists can sort by it" is gone.
- Addresses: `?sub=categories`, `?tab=location&sub=types`, `?tab=item&sub=displays`…; the older
  `?tab=displays[&kind=item]` and `/saga/displays` still open the display templates.

## Design

- `saga/template/CategoriesTab.tsx`: `CharacterCategories` (the categories API, the display defaults),
  `TypesEditor` (template commands `type.add`, `type.update`, `type.delete`; items' `setTypeTemplate`), and
  `SubEventList` (moved). `KindEditor` (SagaTemplatePage) is the new Variables layout. `TemplatesPage` takes its
  kind from the tab. `saga/CategoriesManager.tsx` (the old window) is deleted.
- `Ruleset.sort_variables(kind)` (`domain/ruleset.py`, `SORT_TYPES`): the variables a kind sorts by. The Actors
  Scene orders by it (`sort_values`: numbers, counters' current values, calculated values worked out once per
  card), sends `sort_keys` as `[key, name, type]`, and accepts any of them in `order.set`. The `sortable` key stays
  readable in templates but nothing uses it.

## Steps

- [x] Sub-tabs and addresses; Display templates folded in; links (picker, editor's back link, item page, redirect).
- [x] Character categories editor; the types editor for every kind; the Characters page button.
- [x] The Variables layout (whose variables on top).
- [x] Sorting by any numeric variable (backend and the three lists; the turn order's choices).
- [x] Tests (Template page: sub-tabs, scope, item categories; character sort; scene sort by a counter, order.set),
  checks in the running app, docs.

## Changes from the request

- Character **types** (PC, NPC) get a **Types** sub-tab too: they hold the variables categories are based on, and the
  type list left the variables card.
- **Documents** get Types like Locations and Events (they have a type list as well).
- Each category also shows and changes its **default display template**, so a category is set up in one place.
- Sorting offers numbers, counters and calculated values, not text: an order is "highest first".

## Later

- Plan 39: categories no longer show their default display template (Display templates keeps it), and item
  categories became **types** like every kind's.
