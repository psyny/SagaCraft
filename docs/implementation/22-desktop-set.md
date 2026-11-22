# 22 - The Desktop Set

Status: Done
Requirements: SET-57, SET-58, SET-59, SET-60, SET-61, UPL-15
Depends on: 20-character-item-editors-user-page, 21-map-set-tokens-attention-pings

From the draft `docs/drafts/desktopset.md` (deleted once built).

## Goal

A Set for showing the players anything, neatly: the DM lays **pieces** on a desk. A piece can be:

- **a character**, in the display template and mode the DM picks;
- **an item**, as an item card;
- **a document**, on the page the DM turns to;
- **a picture**, uploaded on the spot and deleted with its piece.

Pieces arrange themselves to use the space (**Auto**), or the DM places them by hand (**Free**: move, resize,
rotate).

## Out of scope

- Players moving pieces or turning pages themselves: the desk is the DM's display.
- Stacks and groups of pieces.
- Text notes as pieces (a document does that).

## UX

- **Add a Desktop** in Build ("＋ Desktop").
- **Main toolbar** (DM, Play and Build):
  - ⚙, then **＋ Character**, **＋ Item**, **＋ Document** (the resource picker, several at once) and **＋ Picture**
    (the uploader, category "Desktop pictures");
  - **Auto / Free**.

  New pieces show to whoever sees the Set; each has an eye to hide it again.
- **Auto**: pieces are packed in rows, in the order they were added, scaled as one so they use the whole desk. Order
  doesn't matter: the space does.
- **Free**: each piece keeps its own place, size and angle.
  - Dragging a piece in Auto switches the desk to Free, with every piece staying where it was.
  - "Auto" packs them again.
- **A piece** (the DM clicks it; it's outlined) shows a small bar:
  - the eye (shown to players or only to the DM, faded);
  - for a character, its **display**: a card (Face, Full, None) or a sheet (Immersive, Informative), and its
    **template** (the category's default, or any template of its kind);
  - for a document, **‹ page n / N ›** (players see the page the DM is on);
  - ✕ removes the piece; a picture's file goes with it.

  In Free mode, the DM also has a corner handle to **resize** (keeping its shape), a top handle to **rotate** (snaps
  to 15° with Shift), and dragging moves the piece to the front.
- **The item card** ("surprise me"):
  - a framed card: its picture (else its icon), its name on a banner, and its category;
  - its first choice variable (in DnD Lite, the rarity) as a gem whose colour climbs with the option's place in its
    list: grey, green, blue, purple, gold;
  - the values its item template shows (informative sheet).

  It tilts toward the pointer with a sheen, and the top tier shimmers.
- **Players** see the desk as the DM arranged it, scaled to their screen, and can't change it.

## Design

- `set_types/desktop.py`, `Desktop` (key `desktop`):
  - Actors are characters, items and documents (resources), and pictures (no resource; `config.kind = "image"`,
    `config.temp_file_id`).
  - Config `{layout: auto|free, gap}`.
  - Actor config `{kind, mode, template_id, page, caption, shown}`; `position {x, y, w, rot, z}` in fractions of the
    Set (w: of its width), so it fits any size.
  - Commands:
    - `pieces.place {positions: {id: {x, y, w, rot}}}`: one or many; switching to Free sends them all;
    - `piece.set {actor_id, mode?, template_id?, page?, shown?}`;
    - `image.add {file_id, caption?}`.
  - `render` builds each piece the viewer may see, with its natural shape for the layout:
    - a character's card (the Actors Scene's card builder) or sheet (`displays.render_sheet`);
    - an item's sheet and tier;
    - a document's current page (text, or a signed picture) and page count;
    - a picture's signed URL and ratio.
- **Stage core** (generic, no type-specific code): actors whose config has `temp_file_id` are **temporary files**.
  - Deleting the actor, its Set or its Stage deletes the file.
  - Duplicating a Stage copies the file, so each copy owns its own.
  - `RenderContext.files` checks an uploaded file belongs to the Saga; `DisplayBook.sheet` renders sheets.
- Upload category `desk` ("Desktop pictures": 3 MB, 2560 px).
- Frontend `stage/sets/desktop/`:
  - `layout.ts` (pure: natural sizes, auto packing, free placement);
  - `DesktopView` (pieces, selection, drag / resize / rotate);
  - `ItemCard`, `DocumentPiece`;
  - `DesktopInspector` (Build: layout, gap, the pieces).

## Steps

- [x] Backend: Set type, commands, render; core temporary files; upload category; tests.
- [x] Frontend: layout, view, pieces, toolbar, inspector; tests; checked in the running app; docs.

## Tests

- **Backend**:
  - adding each kind;
  - what players get (hidden pieces, a hidden character shown by the DM);
  - display modes and templates;
  - document pages;
  - a picture's file deleted with its piece, its Set and its Stage, and copied on duplicate;
  - commands' checks.
- **Frontend**: auto packing fills the box and keeps shapes; free placement; the item tier.

## Changes from plan

- Sheets come from `DisplayBook.sheet` (the book keeps the database session), not a new context field.
- Character cards get more room in Auto (×1.6 of their natural size): beside item cards and pages they looked tiny.
- The rotate handle sits on the top-right corner (the piece's bar covered a handle above it).
- Going Free by dragging brings the dragged piece to the front (`front` in `pieces.place`).

## Changes from the draft

- "Resized, rotated, etc." is Free mode (move, resize keeping the shape, rotate); Auto arranges by itself.
- The item display ("surprise me"): a collectible-style card with a tier gem from the item's first choice variable
  (rarity in DnD Lite: no names hard-coded), tilting with a sheen; the top tier shimmers.
- Characters choose between card and sheet displays, besides the template.
- Pieces have an eye (players or only the DM); players don't move pieces or turn pages.
- The pictures' clean-up is a Stage core rule any Set type can use (`temp_file_id`), copied on duplicate.
