# 35 - Desktop Focus layout

Status: Done
Requirements: SET-88, SET-89, SET-90 (SET-58 reworded)
Depends on: 22-desktop-set, 05-groups-and-encounters (the turn bar it mirrors)

From the draft `docs/drafts/improvements.md` (deleted once built).

## Goal

A third arrangement for the Desktop Set, **Focus**: one piece big in the middle of the desk and the others in a row
at the bottom, the way the Actors Scene's turn bar draws its current creature. The DM goes through the pieces one at
a time (a letter, then the map, then the signet), the players seeing each up close.

## Out of scope

- Reordering the row by dragging (the row keeps the order pieces were added in, like Auto).
- Keyboard shortcuts for next and previous.

## UX

- **Focus** joins Auto and Free (the Desktop's main options in the Set bar, and its settings).
- The piece **in focus** is as big as fits, centred, 100 px from the top and 100 px above the row.
- The **row**: every other piece, 100 px tall in its own shape, 100 px from the bottom, in order; the focused piece's
  place stays empty (it goes back there), like the turn bar. The space between pieces is at most 50 px and narrows to
  fit more, down to overlapping (each keeps a strip showing); a piece under the pointer, or picked, comes over its
  neighbours.
- **‹ ›** in circles at the row's ends (the DM's): the previous or next piece comes to the middle; dimmed at the ends.
- A piece's bar (click it): the eye, then **◎ Focus**, then its display, template or pages, then ✕. Focus works from
  any layout: it switches the desk to Focus with that piece in the middle.
- In Focus, pieces are picked, not dragged: no move, resize or rotate.
- Pieces **glide** to their new places (into focus, back to the row, a layout switched).
- On a short desk the margins, the row and its space shrink together, never taking more than half its height (the
  draft's sizes fit a full-screen desk; the default 1000 × 620 desk would leave the focused piece a sliver).
- Players see the same: the piece in focus and the row, without the arrows. A piece only the DM sees isn't in focus
  for them (nothing in the middle, the shown pieces in the row).

## Design

- `set_types/desktop.py`: layout `focus`; config `focus_id` (the piece in focus; none or gone: the first piece). Command
  `piece.focus` `{actor_id}` or `{step: 1 | -1}` (stops at the ends) sets it and the layout. `forget_actor` drops it,
  `copy_config` maps it to the copy's piece. Render sends `focus_id` (the resolved one) in Focus, or null; for a
  player, null when that piece is hidden from them.
- `stage/sets/desktop/layout.ts`: `focusLayout(sizes, focus, width, height, arrows)` (pure) gives the boxes and the
  arrows' places; `FOCUS` holds the measures.
- `DesktopView.tsx`: the layout, arrows, the bar's Focus button; CSS transitions on the pieces (not the one dragged).
- **Sharp pictures when scaled**: pieces are drawn at their own size and scaled with a CSS transform, so their
  pictures were asked for at the small size. `components/Picture.tsx` gets a `PictureScale` context (how much a
  transform scales it up); the Desktop sets it per piece. A picture piece is now drawn at its box's size directly.

## Steps

- [x] Backend: layout, focus, command, render, copy and forget; tests.
- [x] Frontend: `focusLayout` with tests; view, bar, arrows, settings; transitions; `PictureScale`.
- [x] Checks in the running app (DM and player, picking, Focus, next, a crowded row); docs.

## Changes from the draft

- The draft's "vertical line on the bottom" is read as a **row** (horizontal), as its later lines describe.
- **Focus** in a piece's bar works from Auto and Free too (it switches the desk to Focus).
- The arrows **stop** at the first and last piece (dimmed) rather than wrapping round.
- The draft's px sizes (100 margins, 100 row, 50 space) hold on a full-screen desk; a shorter desk shrinks them
  together, so the piece in focus keeps at least half the height.
- The arrows are the DM's: players see the row and the piece in focus only.
- Added: pieces glide between places, and pictures stay sharp when a piece is drawn big.
