# 11 - Saga templates, items and documents

Status: Done
Requirements: TPL-1..11 (TPL-12 Goal), ITEM-1..5, DOC-1..4, CHR-1 (changed), LORE-1 (changed), LORE-2, LORE-4
Depends on: 10-fog-presets

## Goal

The DM shapes the Saga's system on a **Template** page: the variables of characters, items, documents and
locations (shared and per type), item categories and character types, who sees what, and what a Saga starts with.
The template is a JSON file to export, share and start new Sagas from. **Items** (with categories and their own
variables, an Items tab, item display templates, inventories) and **documents** (pages of text or pictures, a
reader) become real.

## Out of scope

- Actions (group and world actions: rests), formulas, named structures, pictures and references as new variable
  types (they come with the built-in template).
- Item quantities and per-owner copies; per-page document visibility; PDFs.
- Previews on the Template page.

## UX

- **Template** tab (DM): the template's name and description; Export… / Import…; tabs Characters, Items, Documents,
  Locations, Starting content. A kind's tab has three columns: "Every …" (shared variables, + New variable) and
  the types (chips, + New), the picked type (name, plural, its own variables, who sees each shared variable for it,
  delete), the variable being edited (name, who sees, who edits, starting value, options, sorting, up/down,
  delete). Every change saves at once and reaches open pages and Stages live.
- **Items** and **Documents** tabs (everyone): cards, search, category and tag filters; "+ New" (DM) opens the form
  (an item picks its category).
- **Item page**: the item's sheet; the DM's form beside it.
- **Document page**: the page list, the reader (arrows, ← →), and for the DM the page editor (title, text, order,
  delete; "+ Text page", "+ Picture page"); a Details tab with the form.
- **Characters → Display templates**: Characters | Items; item categories' defaults; item templates edit the sheet
  only.
- **System → New saga**: a built-in template or a template file.

## Design

- `sagas.template` (JSON, the Saga's own copy; None: the built-in `ruleset_key`) and `template_version`.
  `services/resources.ruleset_for` parses it once per version (cache key: Saga, its creation time, version).
- The built-in file (`rulesets/dnd_lite.json`) is a template document: `format`, `kinds`, `starting` (categories,
  groups, turn order, Actors Scene tabs). DnD Lite gains item categories with variables and the Document kind.
- `domain/saga_template.py`: pure edits (variables add/update/delete/move, overrides, types, starting content,
  info), checked by parsing with `domain/ruleset.Ruleset`. New block `pages` in `domain/ruleset.py`.
- `services/saga_templates.py`: get (with usage per type), commands, export (with categories, display templates
  and their defaults, fog presets), import (types in use must stay; the rest added by name), `apply_extras` for a
  new Saga from a file. API `GET /sagas/{id}/template`, `POST .../template/command`, `GET .../template/export`,
  `POST .../template/import`; `POST /system/sagas` takes `template`. Changes push `saga_updated` and the Stages.
- Display templates for items (`services/displays.KINDS`): one built-in per item category, defaults per type, the
  sheet endpoint renders items; previews have no cards for items.
- Actors Scene: `initial_config` uses the starting tabs.
- Frontend: `saga/template/SagaTemplatePage.tsx`, `saga/lore/` (ResourceList, ItemPage, DocumentPage),
  `CharacterForm` (choice fields, inventories, category picker), `ResourceView` (items' sheets, documents' reader),
  Templates page and editor (items), System page (template files).

## Steps

- [x] Docs.
- [x] Backend: template storage, editing, export/import, new Sagas from files, pages block, item templates, tests.
- [x] Frontend: Template page, Items and Documents tabs and pages, forms, templates for items, System page.
- [x] Tests.

## Tests

Backend: variables and types (shared and per type, edits, order, overrides, refusals, deleting keeps values),
starting content (Actors Scene tabs), export, a new Saga from the file (variables, groups, fog presets, display
templates), import (types in use, additions), documents' pages (players' signed URLs, refusals). Frontend: list
filters, the document reader, the Template page (kinds, types, adding a variable, the app's variables).

## Changes from plan

- Checked in headless Chrome: the Template page (Items, a category's variables, the variable editor), the Items
  list and an item page (DM and player), a document (DM editor and the player's reader). Picture pages and the
  import file picker were not clicked through.
