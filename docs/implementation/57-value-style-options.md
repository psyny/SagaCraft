# 57 - Value style options: bars, numbers, discrete icons

Status: Done
Requirements: DSP-33, DSP-34, DSP-35, DSP-36 (DSP-14, SET-14 changed)
Depends on: 06-template-lists-and-colors, 40-types-take-over-categories (counters' min)

From the draft `docs/drafts/improvements.md` (Character Display Templates): more options for the three ways a
display template shows a counter (Bar, Number, Discrete).

## Goal

The DM shapes how each counter reads on cards, sheets and tokens: a bar's shape and what it writes on it, a number as
its value or a percentage (or nothing), and discrete icons with their count, spacing, look, when they go (precise or
varied per character) and whether they hide while the value is full.

## UX

All in the template editor, in the element's ⚙ (its view style), with the live preview:

- **Bar**: **Bar** Round · Rounded · Flat (the old "Rounded" is now Round, the old "Flat" Rounded: its corners were
  rounded; Flat is new, with square corners); **Gradient**; **Value** None · Current / Max · Percentage.
- **Number** (a counter): **Value** None · Current / Max · Percentage.
- **Discrete**: **Icons** (a list now: Balls, Hearts, Diamonds, Squares, Stars, Bars); **Number of icons** (1–10) and
  **Icon spacing** (0–50 px) sliders; **Logic** Precise · Full variant · Soft variant, with a line saying what the
  picked one does; **Hide when full**.
- Sliders save when they stop moving (no save per pixel).

## Design

- **Discrete logic** (`domain/discrete.py`, rewritten): the counter's range (min to max) is cut by breakpoints: the
  min, *icons − 1* points between and the max. An icon shows for each breakpoint under the value, the min's included:
  any value above the min shows at least one icon and none at the min or below.
  - **Precise**: the points between are even (range 100, 4 icons: 25, 50, 75; at 100, 80 or 76, 4 icons; at 75, 3; at
    0, none).
  - **Full variant**: each point between moves by a random whole amount up to *K = int(0.4 × range / icons)* either way
    (100 and 4 icons: ±10). The moves are seeded per creature (per instance) and value with the server's secret, so
    they're the same on every screen and for everyone, and differ between characters. 0.4 keeps the points in order
    and off the ends.
  - **Soft variant**: as Full variant, but the breakpoint at half the range stays (4 icons: 0, 25, 50, 75, 100: 50
    never moves); with an odd number of icons no breakpoint falls at half (3 icons: 0, 33, 67, 100) and it's Full
    variant.
- **Percentage** (`discrete.percent`): from the min to the max, a whole number 0–100, rounded; never 0 above the min
  nor 100 below the max (1/300 HP reads 1%, not 0%).
- **Element settings** (`domain/display.py`, template config **version 3**): `bar` round | rounded | flat, `value_shown`
  none | current_max | percent, `icon` + stars | bars, `icons` 1–10, `icon_gap` 0–50, `logic` precise | full_variant |
  soft_variant, `hide_full`. Defaults: round, current_max, 4 icons, 5 px, full_variant (the closest to the old logic),
  hidden when full off.
- **Version 3**: version 2 configs are upgraded when read (`display.upgrade`: Saga template files from before) and
  in the database by migration `c4e7a2b9d816` (bars renamed rounded → round, flat → rounded, so they keep their look;
  missing settings at their defaults). The shipped DnD Lite file's display templates are version 3.
- **What players get** (`display.render_element`): exact numbers only when they're shown. A bar or a counter's number
  showing *Current / Max* sends current, max (and min) as before; *Percentage* or *None* sends only `percent` (the bar
  fills from it). Discrete sends `level` and `levels` (its number of icons), as before. A discrete element hiding when
  full isn't sent at all while the value is full (≥ max). The DM gets every number; the level the DM's card gets for
  players' discrete is worked out with the players' element (its icons and logic).
- **Bars fill from the min** (they filled from 0: a counter with a min other than 0 now fills as its percentage reads).
- Frontend: `AttributeDisplays.tsx` (`Bar`: shape, value shown; `Balls`: icon spacing, stars and bars shapes; bars
  are half as wide as tall; a row wider than its parent is scaled down to it, on one line: ten icons fit a small card), `SheetValue.tsx` (`ValueBody`), `saga/templates/modes.ts` (options, defaults; elements
  read with every setting), `TemplateEditor.tsx` (the controls, `SliderSetting`).

## Steps

- [x] Discrete breakpoints, levels and percentage (`domain/discrete.py`).
- [x] Element settings, version 3 and its upgrade, rendering per viewer (`domain/display.py`); migration; DnD Lite file.
- [x] Frontend: bar shapes and value, numbers' value, icons (spacing, stars, bars), the editor's controls.
- [x] Tests: backend 212 (the draft's precise example, variants within ±K, stable per seed and different between
  creatures, soft's middle, small ranges, a min; percent's rounding; settings checked; the version 2 upgrade; players
  get only `percent` with Percentage or None, nothing when full and hidden, the DM's level with the players' icons),
  frontend 291 (bars' value, shapes and fill from the min; counters' numbers; icons' count, spacing and shapes; the
  editor's controls, sliders saving once they stop).
- [x] Checked in the running app (Test Saga, its live Stage; the templates and Anna's HP put back after): a player's
  cards with a flat bar at "70%" (the payload: only `percent`), 10 stars and 8 bars with no spacing on the NPCs' cards,
  hide when full (nothing sent for the full NPCs, the DM still sees theirs), the editor's bar and discrete settings
  with the preview. The migration ran on the dev database: 22 templates to version 3, every bar Round.
- [x] Docs.

## Changes from the draft

- **Bar shape names**: as the draft says (Round, Rounded, Flat). Existing templates keep their look: their "rounded"
  becomes Round and their "flat" Rounded.
- **Value for numbers** applies to counters (Current / Max and Percentage need a max); a plain number shows its value
  as before.
- **Percentage** never reads 0% while above the min or 100% while below the max (a rounding to 0 or 100 would say
  "down" or "untouched" when it isn't).
- **Players don't receive the exact numbers** when the bar or number shows a percentage or nothing (visibility is
  the server's: they get the percentage only).
- **Hide when full**: the element isn't sent while full, for the view it's set in.
- **The old logic** (4 icons: full, above a random 60–90 %, above a random 30 % to A − 10 %, above 0) is replaced by
  the three logics; templates made before use **Full variant**, the nearest, so their levels change a little: 4 icons
  now show down to about three quarters (use *Hide when full* to tell an untouched creature).
- **Soft variant with an odd number of icons** has no breakpoint at half to keep (3 icons: 0, 33, 67, 100): it's Full
  variant. (An even number of icons is an odd number of breakpoints, the middle one at half.)
- **Bars fill from the counter's min** (before, from 0), matching the percentage.
- **Many icons on a small card** stay on one line, drawn smaller (wrapping split ten stars 8 + 2); a tray or a big
  sheet with room draws them at full size.
