# 60 - Flat neon, the player view's menu, movement costs by the half, the Panels Set

Status: In progress (built part by part, each committed)
Requirements: DSP-43, STG-37, STG-38, LOC-100, SET-109..SET-113 (DSP-39, STG-35, LOC-99 changed)
Depends on: 59-styles-player-view-tactical-moves

From the draft `docs/drafts/next_steps.md` (the user's standing draft: emptied, not deleted, once done).

## Parts

1. **Neon**: the line inside the glow is one flat colour, the lighter one (no brighter core, no darker edges); the glow
   outside stays the exact colour.
2. **The player view's menu**: next to Pause, its button drops down **DM**, **Players** (every player) and each
   player. On the player view the Stage is exactly the player's (their Set bar: Actions, the Map's Select and Move),
   with one difference: the DM's player view button stays first in that bar, to switch or go back.
3. **Movement costs**: the Movement tool's costs are **Normal** (1), **Double** (2), **Blocked**, and **Other** (a
   slider dropping down: 1× to 10× by 0.5). Costs are any of those (1.5, 2.5, ...).
4. **Panels**, a new Set type: rectangles and lines to divide or frame the Stage. Live: only shown or hidden (the Set
   bar's eye). In Build, the DM draws **rectangles** (drag) and **lines** (click points, double-click to end), selects,
   moves and deletes them, and sets each one's look: a rectangle's corner radius, fill (colour, flat or gradient,
   opacity, an effect: blur what's under it, frosted glass, glow, inner shadow), border (thickness, 0 for none, and
   colour); a line's colour, thickness, style (solid, dashed, dotted) and rounded corners.

## Design

- **1. Neon** (done): `components/borders/Border.tsx`: one stroke of `shade(colour, 0.45)` on cards, sheets and tokens
  (the token's glow ring in the colour under it; the card's and sheet's glow outside, as before).
- **3. Movement costs** (done): `domain/maps.move_cost` (1 to 10 by halves, or "x"; 1 clears), routes' costs are
  sums of halves; `MovementTool`: Normal, Double, Blocked and Other (a popover slider, 1 to 10 step 0.5; opening it
  picks its value); tiles show "2.5×", tinted warmer as they cost more. Checked: the tool's row and slider on a Saga 4
  map. Tests: backend (halves accepted, 11, 1.25, 0.5 refused), frontend (labels with halves).
- **2. The player view's menu** (done): `stage/PlayerView.tsx`: `PlayerViewButton` (whose view, a menu: DM, Players,
  each player) next to Pause; `PlayerViewScreen` draws the player's Stage with `StageCanvas`'s `preview` (the players'
  Set bar with the button first; the Stage, toolbars and the bar's other buttons inert); the separate bar of plan 59
  is gone. Found while checking: the screen's class (`player-view`) was also the button's: renamed. Checked: the live
  Stage as beta (beta ▾ | Actions | the map; the menu). Tests: frontend (the preview's bar, DM in its menu).

## Changes from the draft

Filled in per part as it's built.
