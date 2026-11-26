# 59 - Borders and grid styles, owner colours, the player view, players' bar, tactical moves

Status: In progress (built part by part, each committed)
Requirements: DSP-38..DSP-41, LOC-97..LOC-99, SET-103..SET-110, STG-35..STG-37 (SET-99, SET-100 changed)
Depends on: 57-value-style-options, 58-token-moves-pause-sheet-edits

From the draft `docs/drafts/next_steps.md` (the user's standing draft: emptied, not deleted, once done).

## Parts

1. **Owner colours** (C): a dragged token's landing tiles in its owner's colour; the Actors Scene's current turn and
   highlight in the character's owner's colour.
2. **Grid styles** (B): a map grid's **style** (solid, dot, crosshair) and **glow** (colour, opacity, amount).
3. **The player view** (D): next to Pause, the DM's **Player view** toggle shows the Stage exactly as players see it;
   the Stages page's Play view is the Stage as on the Stage tab (no special view), so a Stage can be previewed, and seen
   as players, without going live.
4. **Players' bar** (F): players' controls at the top left, where the DM's Set bar is: Actions, then each Set's tools
   in one row (Map: zoom, ping, plan a move; Dice roller: the roll buttons), a labelled divider between Sets.
5. **Tactical moves** (E): a token's move is planned (tile by tile, or a far tile: the cheapest route, A*), seen by
   everyone while planned, and made on **Move**; tiles have states (blocked, movement cost 2 or 3), painted with the
   map tools' **Movement** tool. Players no longer drag tokens (plan 58): they plan moves; the DM drags and plans.
6. **Borders** (A): the display template editor's regions get two tabs, **Visual** and **Variables** (the lists; Copy
   the other view beside the tabs). Visual: the mode's **border style** (Flat, Gradient, Chip, Neon; framed: Electric,
   HUD, Light frame, Mayan, Noble, Roses, Vines), **colour** (owner, group, custom) and **width**, for every mode
   (cards, sheets, the token); drawn as a layer over the card or token.

## Design

- **1. Owner colours** (done): `components/ownerColor.ts` (`ownerColor`, `ownerStyle`: `--owner`, `--owner-ink`; black,
  no player, falls back to the theme's gold); the drag preview (`maps/MapTokens.tsx`) and the cards
  (`CreatureCard.tsx`) set them; CSS reads `--owner` for the landing tiles, the arrow, the current turn, its tag and the
  highlight. Tests: frontend 298.
- **2. Grid styles** (done): the grid's `style` (solid, dot, crosshair), `glow`, `glow_color`, `glow_opacity`
  (`domain/maps.py`; older maps read them at their defaults); the map shader (`maps/shader.ts`) draws dots by the
  distance to the tile's corners and crosshairs as the lines near them, and the glow around what it draws (a gaussian of
  the distance, growing with the zoom like the lines); the plain 2D drawing (no WebGL) draws dots and crosshairs without
  the glow. The Grid tool: Style, Glow (colour and opacity once it's on). Checked: the shader check page (80 checks,
  SwiftShader), crosshairs with a glow on a square map and dots on a hex map; backend test.
- **3. The player view** (done): `GET /stages/{id}/as-players?member_id=` (the DM's; `services/stages.stage_as_players`:
  the live link's guest, or that player's viewer; any Stage). `stage/PlayerView.tsx`: the Set bar's button (every
  player, or one) and the screen that replaces the DM's canvas (refetched on every Stage update; the players' controls as
  a player's, through a SagaContext with their role; inert). The Stages page's Play view lost its hint. Checked: the
  Test Saga's live Stage as beta. Tests: backend (every player, one player, not live, the DM's only), frontend (the Set
  bar's buttons).
- **4. Players' bar** (done): `SetTypeUI.playerTools` (its label: Map, Dice roller) and `<Toolbar id="player">`, a slot
  per Set in the bar StageCanvas draws for players and viewers in a Saga; PlayerActions first (its control opens under
  it). The Map sends its zoom and Ping there for players (the DM's and the live link's stay in the placed Zoom toolbar);
  the dice roller its Roll, Clear and roll types (the tray then shows players only the results, without minimize).
  Checked: beta's live Stage (Actions | Map | Dice roller). Tests: frontend (the dice test updated).

## Changes from the draft

Filled in per part as it's built.
