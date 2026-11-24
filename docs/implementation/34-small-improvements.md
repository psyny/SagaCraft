# 34 - Small improvements: scene layouts, cards in the card ratio, hover connectors, action notices

Status: Done
Requirements: SET-82..SET-87, DSP-25..DSP-28, TPL-17, RUL-31 (SET-38 and SET-12 reworded; plan 33's map tools
renumbered SET-80, SET-81)
Depends on: 05-groups-and-encounters, 06-template-lists-and-colors, 21-map-set-tokens-attention-pings,
33-improvements

From the draft `docs/drafts/improvements.md` (deleted once built), in three parts: the Actors Scene's layouts, how
cards, tokens and their hover areas display, and who hears about an action.

## 1. Actors Scene layouts

### UX

- **Top margin** (was "Distance to top"; default 50 px) on every layout; a new **Sides margin** (default 50 px) on the
  layouts that start from an edge: grid, row, column, boundary (players from the left edge, the others from the
  right) and free (where cards not placed yet start). Circle and turn bar are centred: no sides margin.
- **Boundary scatter** works per card: each card has its own shift, from minus to plus the scatter value, on x and,
  separately, on y, the same on every screen (seeded by the card). A card is kept on the scene when the margins are
  smaller than the scatter.
- The scene's **Default card style** (was "Card style") and a new **Evidence card style**, both Face, Full picture,
  No picture, **Immersive** or **Informative** (the sheets, drawn in the card). The evidence style is for the card in
  evidence: today the turn bar's current creature.
- Every layout gets **Card size** (50–200 %); the turn bar also **Current turn card size** (50–300 %, default 170 %:
  the old largest; it still fits the room under the bar).

### Design

- Tab settings `margin_top`, `margin_sides`, `card_size`, `current_size` (`set_types/actors_scene.py`). A tab saved
  before keeps its distance to top as its top margin, except the old default (16), which becomes 50.
- Scene settings `card_style` and `evidence_card_style` (`display.CARD_MODES + SHEET_MODES`); a scene without an
  evidence style uses its default style.
- A card in a sheet style carries its `sheet` (`displays.render_sheet`, instances with their own values); the card
  in evidence (the current creature of a turn bar tab: any tab for the DM, the active one for players) carries
  `evidence` (its rendering in the evidence style) when that style differs.
- `layout.ts`: every card is one size (the card ratio, scaled by the card size); the margins replace the fixed
  padding at the edges; `scatterOffset` mixes its hash (FNV-1a alone gave neighbouring ids almost the same shift:
  the bug) and returns -scatter..+scatter.

## 2. Display

### UX

- **Cards keep the card ratio** (5:7) whatever they show. Face: the face crop on top, the values on a band at the
  bottom that grows upwards over the picture as values are added (the face keeps at least its top band and a strip
  of picture); Full: the picture as the whole card, the bottom band grows the same way; No picture: the name band and
  the values. What doesn't fit is cut: hover areas are where more goes.
- **Sheets as cards** (Immersive, Informative): the sheet, drawn at a sheet's width and scaled into the card.
- **Token hover areas fit their content** with a small margin: a value whose name is hidden takes no room for it.
- **Hover connectors**: an open hover area (on cards and tokens) is joined to its card or token by a line from the
  card's or token's centre to the area's, drawn under both; the areas sit 5 px away.
- **Display template editor**: on the Player view, **Copy DM view** at the top of the lists (on the DM view, **Copy
  player view**): the other view's lists for the mode being edited (face, full…), after a confirm.
- **Display templates are a tab of Saga → Template** (the same defaults and catalog); the template editor stays its
  own page, its back link returns to the tab. The old address opens the tab.

## 3. Actions: who is told

### UX

An action's **Settings** get **Notify**: *Who ran it* (default; the DM is always told), *Only the DM* (a player who
runs it learns only that it went to the DM: a secret check), *Everyone*. A **notice** (bottom right, for 10 s or
until clicked) tells the others: "Ana ran Second Wind on Thorin", with the changes and rolls each may see (the same
rules as the result).

### Design

- `notify` on actions (`domain/actions.py`: `user`, `dm`, `all`; default `user`).
- `services/actions._run` returns the runner's result (hidden, `secret`, for a player when only the DM is told) and a
  notice per member to tell (`_shown` and `_rolls_shown` for each); the routes send them with `hub.direct` (one
  message per member).
- `saga/ActionNotices.tsx`: the notices stack, fed by `SagaContext` (`action_notice` messages).

## Steps

- [x] Scene: margins, card size, current turn card size, evidence and sheet card styles, scatter per card.
- [x] Cards in the card ratio; sheets as cards; token trays that fit; hover connectors and the 5 px gap.
- [x] Copy a view in the template editor; display templates as a Template tab.
- [x] Actions' Notify and the notices.
- [x] Tests (backend: tab settings and their migration, sheet and evidence cards, notify; frontend: layout, scatter),
  checks in the running app, docs.

## Changes from the draft

- **Scatter** shifts each card from minus to plus the scatter value on x and y, as the draft asked (first built as 0
  to the value, inwards and down; corrected after review). A card that would leave the scene is held at its edge.
- **Sides margin** isn't on the circle and the turn bar (centred), as the draft said for "already centered" layouts.
- **Evidence card style** defaults to the scene's default style, so scenes made before look the same.
- **Sheets as cards** are cut to the card like the other styles; a value on them wasn't clicked to change (the DM
  changed values from the card's menu or a card style). Plan 37 made them clickable, as on the other styles.
- **"DM only"** is read as a secret: the player who runs it doesn't get the result, only the DM does.
- **Copy a view** asks first (it replaces that view's lists for the mode).
- The **5 px** gap and the connector line apply to cards' and tokens' hover areas alike.
