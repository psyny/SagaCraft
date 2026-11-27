# 59 - Borders and grid styles, owner colours, the player view, players' bar, tactical moves

Status: Done (built part by part, each committed)
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
- **4. Players' Set bar** (done; reworked after the user's review): players and viewers get the DM's Set bar
  (`StageCanvas`: the same bar, built for them with only Actions and the Sets marked `SetTypeUI.playerMenu`; no eye, ⚙,
  fold, Stages, Pause or Player view). The Map fills its `main` toolbar for them with Select and Move (greyed out with
  why when they may move no token) and `sub` with the plan's controls. Placed toolbars stay put for everyone: the dice
  tray (rolling for those who may) and the map's Zoom (with Ping). First built as a separate bar holding the dice
  buttons and the zoom: the user meant the Set bar. Checked: beta's live Stage (⚡ Actions, World map: Select, Move
  greyed out; the tray and Zoom with Ping where placed).
- **5. Tactical moves** (done): `domain/maps.py` layers' `moves` ({"c,r": 2 | 3 | "x"}), `paint_moves`, `step_cost`,
  `route_cost` (each step to a touching tile, none blocked, known to the mover); map command `moves.paint`; the map
  sends the shown layer's costs (players: on tiles they know). `move_token_as` takes a `path` (required for members:
  they plan; the DM may give a tile alone). `POST /sets/{id}/token-route` (`services/stages.token_route`, broadcast like
  drags: whoever sees the token at its origin, its end and along the route). Frontend: `geometry.findRoute` (A*),
  `routeCost`; `maps/tools/MovementTool.tsx` (a map tool); `MapOverlay` draws costs and routes; `MapSetView` plans
  (players: Move in their bar; the DM: Selection's Plan), shares the route as it changes, moves with ✓ Move (the Set's
  act), drops a plan whose token can't move any more. Checked: beta planned Anna round blocked and harder tiles ("6
  tiles · 30 ft"), moved her (the map then put back). Found while checking: the known-tile test read the fog's bytes
  as the shader's (0/1/2 here). Tests: backend 219, frontend 301.
- **5b. Moves going along their route** (done, the user's follow-up): the Map Set's `move_speed` (1 to 10, default
  5; 10: at once; in its settings and Saga templates); `SetType.act` may return what happened: the Map returns a planned
  move's route, which `api/stages.act` sends to the others (`token_route` with `moved`); the mover glides at once.
  `MapSetView` glides tokens along `[origin, ...path]` (eased steps, `STEP_MS` per speed) through `MapTokens`' `glide`,
  until the map has them at the end. Checked: beta's Anna caught mid-route at speed 1 (the map and the Set put back).
- **6. Borders** (done): the template's `visual` ({mode: {style, color, custom, width}}, `domain/display.py`:
  `visual_of`, `border` resolves the colour; checked in `merge_config`); cards (`actors_scene._card`), sheets
  (`render_sheet`: `borders` per sheet mode), tokens (`DisplayBook.token`, the map's tokens and links, the editor's
  preview) carry `border`. `components/borders/Border.tsx`: `BoxBorder` (an SVG over a card or sheet, measured with a
  ResizeObserver: rects, gradients, dashes, a glow and a displacement filter, a fret pattern, flourish paths on the
  corners) and `RingBorder` (the same styles around a circle, or along a larger token's outline, clipped inside;
  ornaments only on circles); `TokenRing` draws it when given. The editor's Visual tab (`VisualPanel`). Checked: Noble
  on the Encounter Stage's cards (the Turn tag now in the owner's colour too: it sat outside the card), Neon on a map
  token, HUD in the editor's preview (the templates put back after). Tests: backend 221, frontend 306 (after 5b).
- **6b. Borders, after the user's review**: the layer (z 1) is over the picture and under the values: bands' shade moves
  to their `::before` (under the border), their content over it; a card drawn as a sheet draws the sheet's border inside
  it. Neon's glow is a drop shadow on the card or sheet (`borderGlow`), outside it (the card clips what's drawn inside).
  `RingBorder` grows inwards: every ring's outer edge is inside the token's (a test checks every style and width); the
  older token borders go through it too. Checked: tokens of sizes 1 to 3 on a square and a hex map (inside their
  tiles; the maps put back), Neon on a full card in the editor's preview, Noble over the picture and under the name and
  HP on the Stage (the templates put back as they were, the user's own settings included). Tests: frontend 307.

## Changes from the draft

- **Owner colours** for a character without a player (black) fall back to the theme's colours (gold, the turn's
  blue): black would vanish on dark maps and cards.
- **Grid**: the glow's numbers out of range are kept in it (like the opacity); no glow without WebGL (the plain 2D
  drawing).
- **Player view**: as every player sees it (the live link's guest) or as one player; a preview (nothing acts). The
  Stages page's Play view already was the Stage's own component: it lost its hint and gained the Player view.
- **Players' Set bar**: as the user meant it after review: the DM's Set bar with what players may do; placed
  toolbars stay put (the first build moved the dice buttons and the zoom into a separate bar).
- **Borders**: the reference pictures are reproduced in SVG from the colour (no pictures shipped); on tokens, the
  framed styles become rings (ornaments at four points; on larger tokens' outlines, their lines only). The border is the
  mode's, the same for the DM's and players' views; it's on the Visual tab with the template's other looks to come.
- **Tactical moves**: players plan (no drag, as the draft says); the DM drags and also plans. Diagonals count one tile
  (as the token drag's distance); costs are per layer; a blocked tile can't be a route's end.
