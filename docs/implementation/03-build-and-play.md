# 03 - Build and Play views

Status: Done
Requirements: STG-15..18, SET-13 (changed), SET-16 (changed), SET-17, SET-19 (changed), SET-20 (changed), SET-21, SET-23, SET-24
Depends on: 01-first-version

## Goal

Separate building a Stage from using it. Using a Stage at the table must not go through the crowded
editor: the DM acts on the Stage itself, as the players see it, with popups.

## UX

Every Stage has two views (toggle in the Stages tab; the DM's Stage tab is always Play on the live Stage):

- **Build**: put Sets on the Stage, move and resize them. Click something to select it; the side panel
  shows the settings of **only that thing**: the Stage (background), a Set (its title or empty area) or a
  card. Settings are about what is shown and to whom: visibility, names, pictures, and for each value
  "Players see" and "DM sees".
- **Play**: the Stage as the players see it, no fixed panel.
  - Click a **value** → value editor: type `15`, `-7` or `+3`, or use −X −Y **OK** +Y +X. X is one order of
    magnitude below the value's scale (the max for counters): HP 230 → ±10/±1, HP 3300 → ±100/±1. Small
    values: under 5 → ±1; 5-9 → ±2/±1; 10-99 → ±5/±1. From 10 000, Y grows too (45 000 → ±1000/±100).
    Arrow keys step too (Shift for the big step). The preview shows `230 → 209 (−21)`.
  - Click a **card** → menu: highlight, spotlight, grab attention, reveal/hide, "Card settings…" (opens Build
    with that card selected).
  - Click a **panel title** → menu: arrangement (grid, row, column, circle, free), order (my order / by
    initiative), card size, reveal all / hide all, clear highlight, grab attention, "Panel settings…".
  - Drag cards to reorder them (or to place them, in free arrangement).
- The Stage tab has a "✎ Build" link that opens the live Stage in the Stages tab.

## Design

- `StageMode` = `view` (players) | `play` (DM using) | `build` (DM building), passed by the Stage core to every
  Set view. The Set type contract gains `PlayMenu` (popup for the Set's title) next to `Inspector` (Build
  side panel, which now receives either a selected actor or none).
- Popovers render in screen space (portal), so they stay readable at any zoom.
- Creature panel config: `layout` split into `shape` (grid | row | column | circle | free) and `order`
  (manual | initiative). Old panels are converted when read. Circle grows until no cards overlap.
- Each card attribute has `dm_mode` ("DM sees", default bar for counters, number otherwise) next to `mode`
  ("Players see"). The DM's payload uses `dm_mode` as `mode` and adds `player_mode`; players' payloads are
  unchanged.
- The Stages tab keeps the open Stage, view and selection in the URL (`?stage=3&view=play&set=1&card=7`).

## Follow-up adjustments

- Stages tab header: the Stage name on top; Build / Play and Live in a row below it.
- No card size: cards are always compact (150 px wide; the height follows the style and the values shown,
  so grid rows are as tall as their tallest card).
- "Picture" became **card style** with three designs (face, none, full); see `../concepts/stages.md`.
  Bands are black at 10% opacity (90% transparent) (CSS variable `--band` on `.creature-card`). Old panels and cards are
  converted when read (`picture` → `card_style`, `card_size` dropped).

- *(Superseded by `04-display-templates.md`: these settings moved from cards to display templates.)*
  **Player view / DM view** (card settings): the same options in two sections. Card shown/hidden (players:
  the actor's visibility, everyone or nobody; DM: `dm.hidden`, left out of Play), name or hidden name, and per
  value `style` (bar, number, discrete) + `display_on` (card, hover, hidden). "Hidden" left the styles and
  became a place; per-value audiences were dropped. Card config: `{card_style, player: {name, hide_name},
  dm: {name, hide_name, hidden}, attributes: [{key, player: {style, display_on}, dm: {...}}]}`; old configs
  are converted when read. The DM's payload: `name` (DM view), `player_name`, `dm_hidden`, and per value
  `player_style` / `player_display_on`.
- **Hover tray** under the card for `display_on: hover` values (CSS hover on the card slot, also open while
  the card's menu is open, for touch). Only "card" values count for the card's height.
- **Spacing** (panel config, 0-300, default 14): gap between cards; the circle is now the smallest one
  with cards `spacing` apart (it no longer stretches to fill the panel). Slider in the panel's Play menu,
  previewed locally and saved on release.

## Tests

Backend: DM mode separate from players' (and `player_mode` never sent to players), shapes, old layout
conversion. Frontend: shapes (circle never overlaps), nearest slot, quick steps (230 → 10/1, 3300 → 100/1,
small and large values), typed values, Play view (DM sees bar + players' marker, value editor buttons and typed
change send the right command).
