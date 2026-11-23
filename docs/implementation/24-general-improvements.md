# 24 - General improvements: maps, tokens, dice, display templates

Status: Done
Requirements: LOC-28, LOC-29, LOC-30, LOC-31, SET-67, SET-68, SET-69, SET-70, STG-27, DSP-21, DSP-22, DSP-23, CHR-20 (CHR-18 and
SET-55 reworded)
Depends on: 21-map-set-tokens-attention-pings, 23-dice-roller

From the draft `docs/drafts/improvements.md` (deleted once built).

## Goal and design

### Maps

- **Path contours**: each path is outlined in solid black or solid white, whichever stands out from its colour
  (`color/theory.bestInk`), on its line, arrows and ends.
- **Ping notices**: a ping also shows a notice in the top-right corner of the screen ("Ana pinged"), for everyone who
  sees the map. Clicking it zooms that map to the pinged tile. A ping and its notice last **10 seconds**.
- **Sharp zoom**: the Stage keeps its GPU layer hint (`will-change`) only while it is being panned or zoomed. Once it
  stops, the browser redraws at the new scale, so text, lines and pictures stay sharp instead of being stretched.
- **Livelier markers**: label pins and ping pins get a soft gradient: light at the top, the colour, then darker.

### Tokens

- **Token style moves to the character display templates**, with a new **Token** display mode.
  - Regions: **On the token**, and **Hover left / right / top / bottom**, shown while the pointer is on the token.
  - The template also holds the token's **border style**: Gradient (the default), Simple, Chip.
  - The Identity tab of the character editor loses its token picker; it shows the token as its template draws it.
  - Map links and mobile tokens of characters use their template: its style, and the values it places.
- **Shapes for larger sizes**:
  - On a square grid, a size n token covers n×n tiles as a rounded square.
  - On a hex grid, it covers a cluster of hexes: 2 → 3 hexes, 3 → 7 (a hex and its ring), 4 → 12, 5 → 19.
  - Sizes go up to 5.
- **Borders**: Double and Studded are gone; Gradient is the default; borders are 20% thinner.

### Dice roller

- **Speed** (Set settings, a slider): from half the current speed to five times it; the last step is **instant**.
- **Dice size** (a slider): 60% to 180%.
- The **roll buttons** live in the Set's main toolbar, beside the eye and ⚙ (like the locations on a Map). The
  separate "Rolls" toolbar goes.
- **Collapse controls**: every Set's main toolbar gets a ▸/▾ button that folds all of that Set's toolbars away, and
  back. The choice is per Set and per person, remembered in the browser.

### Display templates

- **Immersive sheets**: the shaded panel behind the top values is as thin as it can be, and the gradient behind the
  lower values starts right under the first one.
- **A frame on every card and sheet**: a thin (5 px) gradient border.
  - Its colour follows the token rules: the player's colour, white for several players, black for none.
  - An item's comes from its owners, by the same rules.

## Steps

- [x] Maps: contours, ping notices (10 s), sharp zoom, gradient pins.
- [x] Tokens: the Token display mode, style from templates, shapes for sizes, borders.
- [x] Dice: speed, size, roll buttons in the main toolbar; collapsing Set controls (Stage core).
- [x] Display templates: immersive spacing, frames.
- [x] Tests, checks in the running app, docs.

## Changes from plan

- The narrow immersive sheet's modal header wraps (its controls on a row of their own), so its close button isn't cut
  off.
- Older templates without a Token mode get its defaults when read (the name in Hover top), so the editor and the maps
  agree.

## After the review

- **Dice land square**: a d4 rests on a face and shows its value at its top corner (three numbers per face, one by each
  corner) instead of balancing on a corner; every die's number ends upright on the screen (turned about its face, so the
  value is unchanged); a d6's numbers are square to its edges; the camera looks straight down with a 12° view, so dice
  at the edges don't show their sides; rough dice (Orcish) take their faces' best-fit normals.
- **Numbers never glossy**: roughness, metalness and shine masks (clear coat, sheen, iridescence) take the numbers out of
  every highlight; numbers glow a little (22% of their colour; Ember's and Neon's fully). The reflected room is tilted
  so glossy tops seen from straight above don't wash out.
- **Neon**, an eleventh dice style: matte black, the chamfered edges and a rim inside each face glowing in the colour,
  glowing numbers (a very dark colour glows lighter so it shows).
- **Larger tokens' borders**: as thick as a size-1 token's (the width no longer follows the shape's size), and drawn
  inside the shape only (a doubled stroke clipped to it), so they don't spill past the token's tiles.
- **Token hover trays** fit their content and sit against the token, growing away from it (top: up; bottom: down; sides:
  outwards, centred on the token); before, a tray took a fixed width.
- **Text over pictures** (full cards, immersive sheets): a 50% black drop shadow.
- **Player colour for elements**: the element Color gets **Player** (the token colour, by the border's rules), which
  colours text values too (and the card's name band). It's the existing Color option rather than a separate text
  colour, since Color already colours text.
- **Path progress** (LOC-31): a path's *Shown* % (0–100, a slider in the Paths tool; the map follows while dragging)
  draws it only that far from its start, the head at the cut. Progress counts tiles along the path (not lengths), so
  the server cuts it without geometry: players get only the tiles up to the cut's piece and `cut` (never the route
  ahead), and draw exactly what the DM sees.

## Changes from the draft

- **Dice speed**: the slider runs ½× to 5× of the *first* speed with Instant as its last step, and the default is now
  2× (the first speed read as slow).
- **Token sizes go up to 5** (hex clusters of 1, 3, 7, 12 and 19 hexes); the draft named only 2 and 3.
- **Folding** is per Set and per browser, for players too (each person tidies their own screen), not a DM setting.
  Folded, the main toolbar keeps the eye, ⚙ and the fold button.
- **Frames** are 4 px on cards and 5 px on sheets (the draft said about 5 px); items' frames follow their owners'
  colours, by the token rules.
- **Sharp zoom**: the Stage drops its GPU layer once it stops moving, so it's redrawn at the new scale; pictures are
  still only as sharp as their upload.
- The ping notice also says who pinged, and the pin and the notice last 10 s for everyone, the live link too.
