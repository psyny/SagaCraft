# 04 - Character display templates

Status: Done
Requirements: DSP-1..10, SET-13 (changed), SET-19 (changed), SET-21, SET-23, LORE-9, LORE-10
Depends on: 03-build-and-play

## Goal

How a character is displayed is configured once, in **display templates**, not on every card. Putting
characters on a Stage stays quick: add them, done. They come with their type's default template; the most a
DM sets on a Set is which template it uses, if not the default. The same templates drive the character
**sheet** (the modal that opens when you click a character).

## Out of scope

- Templates for other kinds (items, locations...): the model is per kind, only `character` has a UI.
- A template per character (the dragon always "Boss"): a Set can override per type, that's enough for now.
- Live refresh of an open sheet when values change elsewhere (it refreshes when reopened, and on the
  Stage whenever the Stage updates).

## UX

**Characters tab**

- Sections: **Characters**, with one sub-section per character type of the ruleset (DnD Lite:
  **Players**, **NPCs**). Your own characters come first in their section.
- Sort: Name, Level, Date created (name and date always; plus the ruleset's sortable numbers).
- Next to "＋ New character": **Display templates** (DM only).
- Clicking a character opens its **sheet**; "Edit" in the sheet opens the form (for those who may edit).

**Display templates page** (`/s/:id/characters/templates`)

- **Defaults**: one slot per character type (Players, NPCs). Clicking a slot opens the **template
  picker** (the same picker the creature panel uses).
- **Catalog**: every template, with what it's the default for. New (blank, or a copy of another),
  open to edit, duplicate, delete (not while it's a default).

**Template editor** (`/s/:id/characters/templates/:templateId`)

- Tabs for each display mode: **Card**: Face, Full, None; **Sheet**: Immersive, Informative.
- A **Player view / DM view** switch: you edit one view at a time, and the preview shows that view.
- A live **preview** with a character you pick (rendered by the server, so it's exactly what that view
  receives, balls included).
- Per value: where it shows, and its style (bar, number, balls) for counters.

| Mode | Where a value can show |
|------|------------------------|
| Card: face / full / none | **Card**, **Hover** (tray under the card), **Hidden** |
| Sheet: immersive | **Shown** (bottom half, over the picture), **Hidden** |
| Sheet: informative | **Highlight** (right of the picture, at most 4, bigger), **Body** (the rest of the sheet), **Hidden** |

Cards show counters and numbers; sheets show every value except the name and the picture (they are the
sheet's header and background).

**Sheet** (modal)

- **Immersive**: the name at the top, the picture as the whole background, values on the bottom half.
- **Informative**: the face at the top left, highlighted values to its right, everything else below.
- A switch between the two in the sheet's header (remembered on this device).

**Creature panel**

- Adding characters: no settings. Each card uses its type's default template, in the panel's card style.
- Panel settings: **Templates**, one slot per character type, "Default" unless the DM picks another.
- Card settings (Build): only what the card *is* (character, template in use, link to edit it), shown or
  hidden to players, remove. Per-card display settings are gone.
- Players click a card to open the character's sheet; the DM's card menu has "Open sheet".

**Names for players**: the name players see (alias, e.g. "Hooded figure") and "hide the name" moved from
the card to the **character** (character form, DM only), so they apply everywhere the character shows.

## Design

- **Data**
  - `display_templates`: `id, saga_id, kind, name, config (JSON), created_at, updated_at`.
  - `sagas.display_defaults` (JSON): `{"character": {"pc": template_id, "npc": template_id}}`.
  - `resources.presentation` (JSON): `{"alias": str | null, "hide_name": bool}`.
  - Template config: `{"modes": {mode: {attr_key: {"player": {"style", "display_on"}, "dm": {...}}}}}`.
    Missing entries fall back to: players hidden; DM shown (card / shown / highlight for counters and numbers,
    body otherwise).
  - Creature panel config gains `templates: {type: template_id}`; actor config is no longer used.
- **Built-in templates**: the first time a Saga's templates are needed, one template per character type is
  created from the ruleset ("Player character", "NPC") and set as that type's default. Player view: the
  ruleset's `stage_display`, else shown when the ruleset lets players view the value, else hidden.
- **Pure rules** in `domain/display.py`: modes, places, validation (highlight limit), built-in config,
  `value_view`, and rendering one value for a viewer (shared by cards, sheets and previews).
- **Services** `services/displays.py`: templates CRUD, defaults, `DisplayBook` (a Saga's templates loaded
  once per render, passed to Set types through `RenderContext.displays`), sheet and preview rendering.
- **API**
  - `GET /api/sagas/{id}/display-templates` (admins): templates, defaults.
  - `POST /api/sagas/{id}/display-templates` `{name, copy_from?}`; `PATCH /display-templates/{tid}`
    `{name?, modes?}` (deep merge: `{"modes": {"face": {"hp": {"player": {"style": "bar"}}}}}`);
    `DELETE /display-templates/{tid}`.
  - `PUT /api/sagas/{id}/display-defaults` `{kind, type, template_id}`.
  - `GET /api/sagas/{id}/display-templates/{tid}/preview?resource_id=` (admins): the cards in all three
    styles and the sheet, for the DM view and for a plain player.
  - `GET /api/sagas/{id}/resources/{rid}/sheet?set_id=`: the sheet for the caller (the Set's template
    override applies when opened from a Set).
  - Template or default changes push `stage_updated` for Stages with creature panels.
- **Visibility** (server-side, as everywhere): players receive only values their view shows; balls carry
  only the level. The template is the DM's display decision (like the creature panel before it); built-in
  templates follow the ruleset's view rules so nothing shows by default that the ruleset hides. A character's
  **controllers** also see, on its sheet, values the ruleset lets them view, even when the players' view
  hides them (their own inventory). Non-admins get the alias (or no name) everywhere, not the real name.

## Tests

Backend: built-ins created from the ruleset and set as defaults; the Set's override; players' sheet leaves
out hidden values and gets only the ball level; controllers see their own values; highlight limit; delete
refused while default; alias and hidden name for players (resource list, cards, sheet); preview as a player.
Frontend: sheet layouts (immersive and informative), Characters sections and sort, card values by template.

## Changes from plan

- Display modes are fixed per surface (cards: card/hover/hidden; sheets: their own places) rather than the
  generic primary/secondary discussed earlier: the user defined each mode's layout directly.
