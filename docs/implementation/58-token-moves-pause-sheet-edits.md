# 58 - Players move tokens, pausing the Stage, editing values on sheets

Status: Done
Requirements: SET-99, SET-100, SET-101, SET-102, STG-33, STG-34, DSP-37 (SET-56, STG-13 changed)
Depends on: 45-map-tools-and-stage-icons, 39 (token drags seen live), 37 (values clicked on sheet cards)

From the draft `docs/drafts/next_steps.md` (the user's standing draft: emptied, not deleted, once done).

## Goal

The DM lets players (or a character's own players, or anyone) move a token on a map Set of the live Stage, always or
only on its character's turn; a move shows as an arrow from where it was to where it goes. The DM pauses the Stage:
players can't act until it's resumed. A character's sheet opened from a card or a token lets whoever may change its
values change them there, as the DM does on cards.

## UX

- **Who moves a token** (the map tools: a selected token's row, after Size and Layer): **Moved by** DM only (the
  default) · Players · Its players (a character's players in control; an item's owners) · Anyone (players and
  viewers); **When** Always · On its turn (character tokens). The DM always moves every token.
- **Players move tokens** they may move by dragging them on the live Stage's map (no tool to pick), onto tiles they
  know; the others see the drag live (as the DM's). A click on a character's token they can see opens its sheet.
- **The drag's arrow**: from the centre of where it was to the centre of where it would land, under the token being
  dragged, for whoever sees the drag.
- **Pause**: the first button of the DM's Set bar, ⏸ (paused: ▶, highlighted). While the live Stage is paused, a
  "Paused by the DM" badge shows at the top for everyone; players and viewers can't act: no dice, pings, token
  moves, value changes on sheets opened from the Stage, nor running actions (anywhere). The DM keeps every control.
- **Sheets**: a card clicked (players) or its menu's Open sheet (the DM), and a token's sheet, open on **Informative**
  (as before, now also from players' token clicks). Its numbers and counters that you may change are clickable (a
  dotted underline on hover): the same quick editor as cards (type 15, -7 or +3; the buttons). In both sheet modes.

## Design

- **Token moves** (`domain/maps.py`): a token's `move_by` (dm | players | owners | anyone) and `move_when` (always |
  turn), saved by `tokens.save` (owners: character and item tokens; turn: character tokens); `may_move(token, role,
  owns, on_turn)` is the rule. `services/locations`: the tokens players get carry `movable` (the rule, with whose turn
  it is) when the map is drawn for a map Set of the live Stage (not paused), and `ref` for a character they can see
  (its sheet); the DM gets the settings. `move_token_as(...)`: a member's move, checked again on the server (the
  token on the shown layer, shared with them and not under their fog; the target tile known to them; the rule).
- **Whose turn** (`services/locations.turn_characters`): the characters (their resource ids) that are the current
  creature of an Actors Scene's active tab with turns running (round ≥ 1), on the same Stage.
- **The Map Set** (`set_types/maps.py`): `act("token.move", {id, tile})` for members; render passes the move context
  (`ctx.maps.moves_for`). The act route also refreshes the other Stages showing the location and its open pages. The
  token drag route (`token-drag`) takes members who may move the token, not only the DM.
- **Pause** (`stages.paused`, migration `e2a9c4f7b318`): the Stage's PATCH takes `paused`; the Stage view carries it.
  `services/stages.live_paused`: players' Set acts, pings, token drags and moves, and action runs
  (`services/actions`) are refused (403 "The DM paused the game") while the live Stage is paused.
- **Sheets** (`services/displays.render_sheet`): `editable`, the keys of counters and numbers this viewer may change
  (the DM: all but calculated ones; an instance's: the DM only; players: the ruleset's edit rules for the character).
  `CharacterSheetModal`'s `editable` (from the Stage: cards and tokens; not while paused for players) makes them
  clickable: the DM on a card changes it through the card (an instance keeps its own values), anyone else through the
  character (`POST resources/{id}/counter`, `PATCH resources/{id}`), checked by the server as before.
- Frontend: `maps/MapTokens.tsx` (`canMove`; the arrow), `maps/tools/TokensTool.tsx` (Moved by, When),
  `stage/sets/maps/MapSetView.tsx` (players' moves and sheets), `stage/StageCanvas.tsx` (pause button, badge,
  `StagePaused` context), `saga/sheet/CharacterSheet.tsx` (clickable values, the value editor).

## Steps

- [x] Token move settings, the rule, players' moves and drags (backend), whose turn it is.
- [x] Pause: column, route, refusals, the Stage view.
- [x] Sheets' editable values.
- [x] Frontend: token settings, players dragging, the arrow, the pause button and badge, sheets' value editor.
- [x] Tests: backend 216 (who may move: DM only, its players, players, anyone with viewers; moves checked: not live,
  fog, unknown tiles, bad tiles; drags; on its turn with an Actors Scene's turns; pause refusing acts, pings, drags and
  actions, not the DM's, another live Stage not paused; sheets' editable keys per viewer and instance), frontend 297
  (sheets' clickable values and the editor, through the card for the DM; only movable tokens drag; the arrow; Moved by
  options; the pause button, badge and players' Actions).
- [x] Checked in the running app (Test Saga, "Exploration" live; put back after): Anna's token set to Its players,
  dragged by its player (the arrow, the distance), the goblin's not draggable; paused: the player's badge, Actions off,
  nothing to drag, the DM's ▶ Paused button and badge; resumed: a click on Anna's token opens her sheet on Informative,
  HP clickable (the quick editor), Level not.
- [x] Docs; the draft emptied.

## Changes from the draft

- **Who moves**: "admins only, players, token char owner, anyone" are **DM only**, **Players**, **Its players**
  (a character's players in control; an item's owners) and **Anyone**. "Anyone" adds viewers (who otherwise never
  change anything), for that token only. A group or custom token has no "its players".
- **On its turn** is for character tokens: the character (or one of its instances) is the current creature of a
  running turn order (an Actors Scene's shown tab, on the same Stage). With no turns running, only the DM moves it.
- **Players drop a token only on tiles they know** (not where their fog hides): it would vanish for them, and reveal
  nothing new.
- **Pause** stops players' and viewers' acting on the live Stage and running actions anywhere; their own pages
  (characters, lore) stay theirs. It's the Stage's: pausing one and making another live leaves the other as it was.
- **Sheets**: values are editable in both modes (immersive too), not only informative. Players also open a sheet by
  clicking a character's token they can see (only the DM could, from its menu).
