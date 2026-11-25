# 45 - Map tools bar and Stage icons

Status: Done (2026-11-25)
Requirements: STG-31, STG-32, SET-94..SET-98, LOC-37, LOC-38, DSP-31, DSP-32, CHR-25
Depends on: 39-map-drag-and-views, 33-improvements (Stage controls)

## Goal

Adding tokens, paths, regions, labels and links to a map takes too many clicks: the tools sit in a side panel (the
location page) or in a modal (the map Set's full editor). This part gives maps **one tools bar**, used the same way on
the Stage and in the map editor: pick a tool, pick or add a thing, and that thing's tools appear on the same bar, like
a drawing program. It also redraws the Stage's control icons in the colourful style of the Actions icon, and fixes a
few looks (dice shadow, immersive and informative cards).

## Out of scope

- Keyboard shortcuts beyond what exists (fog V K U, brush `[` `]`) and Esc (below). More later if the bar works.
- Renaming tokens of characters, items and groups (they show their resource's name), and links (the resource's name).
- Icons outside the Stage (pages, editors).

## UX

The DM, in prep (map editor) and live (Stage, Play). Mouse or touch.

### The Set bar gets a third row (Stage)

Today: row 1 is the Set buttons, row 2 (the open Set's menu row) is its eye, ⚙, fold and main toolbar. New: **row 3,
the tool row**, under the menu row, filled by the open Set's type (`<Toolbar id="sub">`), shown only when it has
content. Any Set type can use it; the map is the first.

The map's menu row becomes:

`👁 Hide/show · ⚙ Settings · ✎ Full editor | Location ▾ · Layer ▾ | ◎ Grab attention · ↖ Selection · ☁ Fog · 🔗 Links · 🧍 Tokens · 🛣 Paths · ⚑ Regions · 📍 Labels`

(drawn as icons, names in tooltips). The left "Map tools" toolbar and the map's **fold** button go away; the Zoom
toolbar (everyone's − Fit ＋ and Ping) stays on the map. Clicking a tool makes it active and fills row 3; clicking it
again (or Esc) closes it and goes back to Select.

### Row 3 per tool

- **Grab attention** (not a tool, an action): every view takes the DM's zoom and centre. **Feedback**: the button
  pulses, the map flashes a gold frame around what players now see, and a short notice says "Players now see your
  view" (or why not: "Make this Stage live first").
- **Selection**: Select (click a token: its menu, as today), Move (drag tokens; a click moves one to another layer),
  Highlight (and its brush size, Region ▾, On/Off, Clear, as today).
- **Fog**: Reveal, Known, Hide, brush size, rectangle, then Reveal all · All known · Hide all. Disabled with a hint
  when the map's fog is off. (Which groups it paints for stays in the editor's Fog tab: players by default.)
- **Entity tools** (Links, Tokens, Paths, Regions, Labels), all the same shape:

  `☰ (list) · ＋ (add) | the selected one's tools`

  - **☰** opens a tray under the bar with the layer's things of that kind. Each row: its name (click: select it, the
    tray closes), **eye** (players see it / only the DM), **rename** (inline), **delete** (asks first).
  - **＋** adds one and selects it, ready to draw or place:
    - Paths, Regions: a new one, drawing (paths: click tiles in order; regions: paint).
    - Labels: click the map where it goes.
    - Tokens: a small menu Character · Item · Group · Custom, the picker, then click a tile.
    - Links: the resource picker, then click a tile.
  - The selected one's name shows on the bar (a chip), then its tools:
    - **Paths**: Draw · Undo · Reverse · Clear | Colour (tray) · Width ▾ · Line ▾ · Shape ▾ · Tail ▾ · Head ▾ ·
      Progress (slider tray: today's "Shown").
    - **Regions**: Add · Remove (paint) · brush size · rectangle · Clear | Show ▾ · Fill colour · Opacity (slider
      tray) · Border colour · Width ▾ · Line ▾ · Shape ▾ · Name on map (toggle).
    - **Labels**: Move (click the new place) | Pin ▾ · Text side ▾ · Size ▾ · Colour · Text on click (toggle).
    - **Tokens**: Size ▾ · Layer ▾ | on the Stage also Open sheet · Focus · Grab attention on it.
    - **Links**: Move (click another tile) · Open the resource.
  - Clicking a thing on the map with its tool open selects it (as labels do today); Esc steps back: closes a tray,
    then stops drawing, then deselects.

**Path widths**: Thin is gone; Normal becomes Thin (4), Bold becomes Normal (7, the new default), Heavy becomes Bold
(12). Region borders get the same three. Existing width-2 lines show as Thin and keep their width until changed.

**Who sees it**: one eye per thing: players see it (the default, for new things) or only the DM. No per-member pick
any more in these tools. Things that today name some groups or members count as shown; the eye then sets "everyone"
or "DM only". Links get the same eye (new: a link can be hidden; players still see a link only if they may see its
resource).

### Map editor (location page, and ✎ on the Stage)

The same bar sits over the map (in the editor there's no Grab attention or Highlight: those are the Stage's). The
right panel keeps only the whole map's tabs: **Details, Grid, Fog, Background, Layers**; in Layers, the layers list
(add, delete, rename, order as today) and, under the selected layer, its **Pictures** (no tab of their own any more).

### Stage icons

Every control icon on the Stage (Set bar buttons, the Stage's controls, the menu row's eye, ⚙, ✎, the map tools, the
dice tray's buttons) is redrawn in the Actions icon's style: filled shapes with soft two-colour gradients and a thin
darker outline, readable at 18-20 px on the dark bar. New shapes: ⚙ a classic gear; Desktop two cards held in a hand;
the dice tray's Roll an isometric d6; the others redrawn at my discretion. The Actions icon itself becomes an SVG in
the same style (today it's the ⚡ emoji, which looks different on every OS).

### Cards

- **Dice**: the shadow on the floor a bit darker (opacity 0.35 → 0.5).
- **Immersive**: values in the bottom centre stack one per line; with nothing in the bottom panel, the bottom centre
  sits as close to the card's bottom as the panel does (no empty band); a bar (HP) in the bottom centre is almost as
  wide as the card.
- **Informative**: the card gets the panel background (it's transparent on the Stage today).

## Design

- **Stage core** (`StageCanvas.tsx`): a `SubSlot` (`${setId}:sub`) under the menu row, like `MainSlot`; hidden while
  empty. `SetTypeUI.foldable?: boolean` (default true): the fold button only for Set types that want it (the map
  doesn't). The `sub` toolbar is listed like `main` (not placed by the DM). Docs: `03-build-and-play.md`, STG-31.
- **Map tools** (`frontend/src/maps/toolbar/`): `MapToolbar` (the tool buttons, for `<Toolbar id="main">` on the Stage
  and the editor's bar) and `MapToolRow` (row 3 content), built on the existing tool hooks, which lose their panels and
  give their state and actions instead (`usePathsTool` → selected, drawing, save...). Shared bits: `EntityTray` (the
  list with eye, rename, delete), `DropdownTool` (an icon button opening a small menu), `SliderTool`, `ColorTool`
  (the existing `ColorPicker` in a tray). One `useMapTools` hook holds the active tool and selection and gives
  `MapView` its props, used by `MapSetView` and `MapEditor` alike.
- **Backend** (`domain/maps.py`, `services/locations.py`): new paths, regions and labels default to everyone (as
  tokens do); path width default 7; links get `hidden` (saved by a new `links.hide` command, left out of players'
  maps); a `links.move` command (a resource from one tile to another). No migration: missing `hidden` is false.
- **Icons** (`stage/SetIcons.tsx`): an `Icon` base with gradient `defs` (ids unique per icon via `useId`); a
  `StageIcon` palette per icon (two stops + outline).
- **Cards**: `styles.css` (`.sheet-bottom-center`, `.sheet-lower`, the informative card's background) and
  `dice/DiceScene.tsx` (`ShadowMaterial` opacity).

Visibility is still enforced on the server: hidden things are dropped in `render` for non-admins.

## Steps

- [x] Backend: defaults (everyone, width 7), `links.hide`, `links.move`, players' maps without hidden links; tests.
- [x] Stage core: the tool row slot, `foldable`; tests.
- [x] Map tools: shared pieces, the tool hooks without panels, `MapToolbar` + `MapToolRow`.
- [x] Map Set: menu row and tool row; the left toolbar removed; grab attention feedback.
- [x] Map editor: the bar over the map; the panel down to Details, Grid, Fog, Background, Layers (+ Pictures).
- [x] Icons redrawn; Actions as SVG.
- [x] Dice shadow; immersive bottom centre; informative background.
- [x] Docs: `concepts/locations.md`, `concepts/stages.md`, `03-build-and-play.md`, requirements, glossary (tool row),
      open questions.
- [ ] Check it in the running app (Stage and location page), `make gpu-check` not needed (no shader change).

## Tests

- Backend: new things shown to players by default; hidden links not sent to players; `links.move`; width default.
- Frontend: the tool row appears for the open map Set only; ☰ lists, eye, rename, delete send the right commands;
  ＋ adds and selects; selecting a path shows its tools; the editor panel has only the whole map's tabs.

## Open points

- Rename for character, item and group tokens (a name override per token)? Left out for now.

## Changes from plan

- **Added at the user's request during the build**: the Stages selector sits on the Set bar itself (no Stages button),
  and with nothing live the Stage tab keeps the DM's bar with only the selector (STG-32); clicking a character or an
  item opens its editor at once (❏ Sheet in the editor shows the sheet) and the editor has a Relationships tab
  (CHR-25); the Desktop icon is a pinboard with two pictures (not cards in a hand).
- Region borders keep their default width (4, now "Thin"); new paths are Normal (7).
- The map editor's Selection tool: Select (drag the map; in Layers, the pictures) or Move (drag tokens). Grab attention
  and Highlight are the Stage's only.
- Moving tokens from the Tokens tool doesn't send the live drag preview (Selection → Move still does).
- The whole app wasn't checked signed in (the sign-in was refused by the session's permissions): the icons were
  checked on a dev page; the rest by tests.
- Steps: all done. Tests: `test_new_things_show_and_links_hide_and_move` (backend), `maps/toolbar/MapTools.test.tsx`,
  the Set bar's selector (`StageCanvas.test.tsx`).
