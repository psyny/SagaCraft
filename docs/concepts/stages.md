# Stages and Sets

The Stage is SagaCraft's core feature. This doc holds the model as discussed so far; Set types will be
detailed one by one.

## Model

```
Saga
└── Stage (many; one may be live)
    ├── layout        canvas | interface
    └── Set (many)
        ├── type          image | map | grid | graph | ...
        ├── position      x, y on the Stage canvas (canvas layout)
        ├── size          width, height (canvas layout)
        ├── screen        anchor, width %, height %, offset % (interface layout)
        ├── layer         z-order (higher draws on top)
        ├── visibility    groups and/or members (default: admins only)
        ├── config        type-specific settings (grid size, background file...)
        └── Actor (many, depending on the type)
            ├── position inside the Set (cell, coordinates or node)
            ├── visibility
            ├── link to a Saga resource (character, location, item, document) or free-form
            └── instance values (instances of instanceable characters: their own current values)
```

- **Stage**: a canvas the DM prepares. Any number per Saga.
- **Live Stage**: the one the players see. Zero or one at a time; the DM switches it at will.
- **Set**: a rectangular component placed on the Stage canvas. A Set can be **transparent**: no
  background, border or title bar for players, so Sets can be composed over a background image; the DM
  still sees the title bar in the Build view and on hover in the Play view. Sets can overlap; `layer` decides
  which is on top. Many Sets of any type can share one Stage.
- **Actor**: something placed inside a Set. What an Actor is depends on the Set type (a creature on a
  grid, a node on a relationship graph, a pin on a map). An Actor of an **instanceable** character is an
  **instance**: it keeps its own current values, and changing them doesn't change the character (see
  `characters.md`).

## Layouts: canvas and interface

A Stage has one of two layouts (Build, the Stage's panel: **Layout**):

- **Canvas**: Sets sit on a big world; they can be anywhere, and viewers pan and zoom. Grab
  attention glides the camera to its target. The world is a GPU layer only while it moves; once panning or zooming
  stops it is redrawn at the new scale, so text and lines stay sharp (pictures as sharp as their upload).
- **Interface** (new Stages start with it; duplicates keep their Stage's): Sets are fixed to the screen, whatever its size, so every piece stays in view all the time. Each
  Set has an **anchor** (a corner, the middle of an edge, or the centre), a **width and height in % of the
  screen** and an **offset in %** from its anchor. A Map can fill the screen with an Actors Scene over
  its bottom (initiative at a glance), or take the left half with the scene on the right. The Set's panel has
  the anchor grid, sizes, offsets and presets (Full screen, Left half, Right half, Bottom strip); in Build,
  dragging a Set's title nudges it and its corner resizes it (in %). Nothing to pan; grab attention makes the
  target pulse. Each Set lays out for the size it gets on that screen.

**Layers** work the same in both: Build's side panel always lists the Stage's Sets from the top layer down;
click one to pick it, ↑ ↓ to move it up or down a layer (command: the Sets' order, bottom to top).

## Set controls (toolbars)

A Set's controls (the DM's, and some for everyone, like a map's zoom) are grouped in **toolbars**, and the
person building the Stage decides where each one sits, so they never cover each other or what they control.

- **The Set bar** (the DM, in Play and Build; on the Stage tab beside its corner): one bar across the top of the
  Stage with the **Stages selector** first (on the bar itself), then the Stage's own **controls** (Actions; EFX when the
  Stage has an EFX layer: see below), then a button per Set, its type's **icon** (`SetTypeUI.icon`; EFX layers aren't on it), its
  name as a tooltip. Clicking one **opens** it: its name shows beside the icon (the button widens) and a **menu row**
  opens under the bar, from its left edge: the **eye**, **⚙**, in Play **fold** (unless its type has nothing to fold:
  `SetTypeUI.foldable`), then the Set's **main options** (its *main toolbar*: what its view puts in `<Toolbar id="main">`).
  Under it, the **tool row** (plan 45): what its view puts in `<Toolbar id="sub">` (the tools of what the main options
  picked; the Map's tools), shown only when it has something. One Set open at a time; clicking it again closes it.
  - **Icons** (plan 45): every control on the Stage has a coloured icon with soft gradients and a thin outline
    (`components/GlossIcon.tsx`), the same on every platform (no emoji).
  - The **eye** **puts the Set away**: it is drawn for no one (players aren't even sent it); its button in the bar
    stays, faded with a crossed eye, to bring it back. In Build a put-away Set shows faded, and Build's Set list has
    the same eye.
  - **⚙**: in Play, the Set's **Play menu** (a popup), or for a type without one its **settings in a window** over the
    Stage (its Inspector: no trip to Build); in Build, the Set's settings in the side panel. The Set's title opens
    nothing.
  - **Fold** (Play): the Set's other toolbars on the Stage fold away, and back; per Set and per browser
    (`localStorage`).
  - Main options per type: **Actors Scene** the tabs (in Build also "+ Add creatures"); **Map** ✎ the full editor, the
    shown location (a picker) and layer, then in Play ◎ grab attention and the map tools (their tools in the tool row;
    see "Map"); **Relationship graph** and **Timeline** "What it shows…" (their settings in a window); **Desktop** ＋
    Character / Item / Document / Picture and Auto / Free; **Dice roller** none (its tray holds everything).
  - **The Stage's controls** (plan 33; Build's Stage panel turns each on or off): **Stages**: on the bar itself (plan
    45), which Stage is live (a picker, "Nothing live" too; a red dot when one is) and "● Make this one live"; picking
    one makes it live (on the Stages page it opens too). With nothing live, the Stage tab's dark screen keeps the DM's
    bar with only the selector; **EFX** (the DM's, when the Stage has
    an EFX layer Set): the environment (a dropdown), the layers' eyes (Far, Near, Front) and "Environments →";
    **Actions**: the Action control (what kind of thing, which one, the action, ⚡ Run; the result under it). Players
    get the Action control too, as a ⚡ Actions button first in their bar (plan 59; it was at the bottom left) on their live Stage (their characters, their
    items and groups; not viewers or the live link).
  - Players and viewers have no Set bar: main toolbars hold only the DM's controls.
- A type's **other toolbars** sit on the Stage where the DM places them: **Actors Scene** *Turns* (the turn controls,
  in Play when the tab has them); **Map** *Zoom* (− Fit ＋, Ping, for everyone; its tools are in the Set bar); **Dice
  roller** *Tray* (everyone who rolls).
- **Where a toolbar sits** (Build, the Set's panel → **Controls**; one row per toolbar, unfolded on click):
  an **anchor** (a corner or the middle of an edge), **across or down** (a vertical toolbar for the sides), a
  **distance** from the anchor in px (on an edge's middle, a shift along it), a **size** (S, M, L: larger for
  touch screens at the table), **shown** or hidden, and "Back to its default place".
- **What it's placed on**: on a **canvas** Stage, the **Set**: **inside** it (over its content, under its
  title) or **outside** it (above or below it for top and bottom anchors and corners, beside it for left and
  right). On an **interface** Stage, the **screen**: every Set's toolbars share the screen's edges.
- **Toolbars at the same spot line up** (stack) instead of overlapping, the first nearest the edge; on an
  interface Stage, by layer. Toolbars are always above the Sets.
- The toolbars float: **the DM's Play view lays the Set out exactly like the players'** (no strips taking
  room), so what the DM sees is what players see, and grab attention targets are the same.
- In Build, toolbars show where they'll be (one that's empty there, like *Turns*, shows its name; a hidden
  one, dimmed).
- Defaults: *Turns* outside the bottom (the screen's bottom middle); *Zoom* inside the
  bottom right; the dice *Tray* inside the bottom left. On the Stage tab, the screen's top-right toolbars sit under its
  corner (✕, Full screen); on an interface Stage, toolbars at the screen's top edge start under the Set bar.

A Set type's view puts its controls in a toolbar with `<Toolbar id="...">` (`stage/Toolbar.tsx`) and declares
it (`SetTypeUI.toolbars`: key, name, default place); the Stage core places it. The Set keeps only what the DM
changed (`stage_sets.toolbars`, checked by `domain/stage_layout.py`).

## The Stage tab

The live Stage takes the **whole browser window**: no top bar, only a corner with the connection dot, **Full
screen** (the browser's), the DM's **✎ Build** link and **✕**, which goes back to the page the member was on
before (players are brought here by grab attention).

## Build and Play views

Building a Stage and using it are separate (see `ux.md`):

- **Build view** (DM): put Sets on the Stage, move and resize them. Clicking selects one thing (the Stage, a
  Set or a card) and the side panel shows **only its settings**: who sees what, names, pictures, how each
  value is shown to players and to the DM.
- **Play view** (DM): the Stage as players see it, with no fixed panel. Clicking acts through popups:
  a value opens the value editor, a card opens its menu (highlight, spotlight, grab attention,
  reveal/hide), a Set's **⚙** (in the Set bar) opens the Set's menu (e.g. how cards are arranged) or its settings in a
  window. The DM's Stage tab is
  always the Play view of the live Stage; any Stage can be opened in Play from the Stages tab to rehearse.
- **Players and viewers** only watch (pan and zoom).

## The live link

A Saga's **live link** (Saga → Settings, the DM: Off by default) is a web address, `/live/<secret>`, that shows the
live Stage full screen, as a viewer sees it, to anyone who opens it: no sign-in and nothing else of the Saga. It's for
a TV, a tablet or a second screen at the table. It follows the live Stage in real time (and grab attention). **New
link** makes a new address and **Off** turns it off: screens on the old one say the link no longer works. The
secret is shown only to admins; the screen is a guest viewer on the server (`services/live_link.py`).

## Who sees what

- Players and viewers only ever see the live Stage, in their **Stage tab**. Non-live Stages are admin-only drafts.
- Inside the live Stage, each Set and each Actor has its own visibility. A player receives only the
  Sets and Actors visible to them (filtered on the server).
- Saga admins (DMs) see everything, with hidden items marked as hidden.
- Players can use the rest of the app (lore, character pages) while a Stage is live. The Stage tab
  keeps updating in the background.

## Grab attention

The DM can "grab" the players' attention:

- Every player's Stage view pans/zooms to a point or area chosen by the DM: a Set, a card, or something of the
  Set type's own (tiles of a map Set: the Highlight tool's tiles).
- Players on another tab are brought to the Stage tab (or get a strong notification: to decide).
- When not grabbing, players pan and zoom the Stage freely.

Open details are in `../open_questions.md` (lock while grabbed or just move once, target some players).

## Set types

The Stage core must not know the details of any Set type. Each type provides, through a shared contract:

- its config schema and Actor schema (validated on the server),
- a view for the three modes (players watch, DM plays, DM builds),
- a Build side panel (settings of the Set or of one actor, also shown in a window from the Set bar's ⚙ in Play when the
  type has no Play menu) and a Play menu (popup on its ⚙ in the Set bar),
- its **icon** for the Set bar (`SetTypeUI.icon`) and, if the DM may choose it, its panel's opacity
  (`SetTypeUI.background`),
- its **toolbars** (see "Set controls"): which there are, what they hold, where they sit by default,
- how its state is filtered for a given player (visibility of its parts),
- how its changes are sent in real time,
- its **commands**: named actions with parameters (switch tab, next turn...), sent through one generic
  Set command route, so a button, a shortcut or later voice/AI trigger the same thing,
- where new actors go when added (e.g. into the current tab, as instances),
- its own **attention targets** (e.g. map tiles), validated on the server, and where they are on screen,
- which of its settings a **Saga template** keeps (plan 41: `template_settings`, `template_config` and
  `config_from_template`): a Stage goes into a template file with its Sets' settings but nothing put on them (no
  cards, pieces, tokens, rolls, turns), the Saga's own things named instead of their ids (see `rulesets.md`).

A Set that zooms its own content marks it `data-wheel` (the Stage's wheel zoom leaves it alone) and
`data-interactive` where a drag is its own (the Stage doesn't pan). Set types render through helpers the core hands them (`RenderContext`): the display templates (characters'
cards), the locations' maps and the relationship graphs, so they never touch the database themselves.

Adding a Set type = adding one module that implements the contract. No change to the Stage core.

### Main Set: Actors Scene

The **Actors Scene** is the main Set for showing characters to the players (it replaces the first
version's Creature panel). Stages and Sets show and combine what already exists elsewhere in the app, so
the scene leans on what was prepared there: characters and their **types**, **groups** (the party,
each planned encounter) and **instanceable** characters (see `characters.md`). The DM adds creatures, or
whole groups, and the cards follow the display templates: adding needs no settings.

**Tabs**

A scene has **tabs**; the players see one, the **active tab**, and the DM switches it at the table in one
click. Every new scene starts with **Exploration**, **Dialog** and **Combat**; the DM adds, renames,
reorders and deletes tabs (a scene keeps at least one).

| Settings of | Hold |
|-------------|------|
| The scene | name, visibility, card style, templates per character type, its creatures (the **cast**), the active tab |
| Each tab | which creatures players see there (each shown or hidden), free positions, layout, spacing, order, turn controls and the current turn, highlight and spotlight |

- The **cast is the scene's**: every tab has the same creatures, and an instance is the same instance
  (same HP) in every tab. Each tab shows or hides each creature to players: the card menu's "Shown in"
  lists the tabs, one click each. Deleting a tab never removes creatures; "Remove from the scene" does.
- A non-instanceable character is at most once in the scene; an instanceable one is added as a new
  instance every time (see `characters.md`).
- Default layouts: Exploration: grid, the DM's order. Dialog: boundary (party on the left). Combat: turn
  bar, by initiative, turn controls on.

**Adding creatures** (Build: the scene's toolbar or the side panel; Play: the ⚙ menu): one
picker with **groups** on top (active player parties first and preselected, then favorites) and
**characters** below, by type. Adding a group adds its creatures (counts become instances): a one-time
shortcut for adding them one by one. Groups can be added again, and several groups at once. Creatures join
the scene (every tab); "Add and reveal" reveals them only in the tab being built or played, "Add hidden"
nowhere. A card remembers the group it came with: its **group color**.

**Cards**

- Each creature is a **card** with its picture and the template's elements. Every card is **one size in the card
  ratio** (5:7; plan 34), whatever it shows: more values grow its value band over the picture, never the card, and
  what doesn't fit is cut (hover trays hold the rest). The tab's **card size** scales them all.
- Each **tab** has a **default card style**, and a turn bar tab an **evidence card style** for the card in evidence
  (its current creature): lists in the tab's layout settings (Build's side panel, Play's ⚙). A tab saved before
  plan 36 takes the scene's styles (the evidence one: the default before plan 34); a new tab takes the active tab's.
  What each style shows is set in the display templates:
  - **Face**: the face crop (square) on top, the **top** element (the name) centred on a dark band over the
    top of the picture; the **bottom** elements below. Each value shows its name centred (unless the
    template leaves it out), and the display on the row below.
  - **None**: no picture: the top band, then the bottom elements right below it.
  - **Full**: the whole picture, in the **card ratio** (5:7), as the card's background; the top band on top
    and a dark band at the bottom behind the values.
  - **Immersive**, **Informative**: the character's sheet in that mode, drawn at a sheet's width and scaled into
    the card (its hover values open in the card's trays). In Play the DM clicks its numbers and counters to change
    them, as on the other styles (plan 37). A counter typed past its min or max is set to it (plan 40).
- **Hover trays** open 5 px from the card, side trays centred on it, each tied to the card by a line from the
  card's centre to the tray's, drawn under both (map tokens' trays too).
- **Pictures** are shown either in the card ratio (5:7: full cards, the immersive sheet) or as their face
  crop (1:1: face cards, the informative sheet, small portraits).
- Names too long for their band are abbreviated from the last word back ("Goblin King of the North" →
  "Goblin King of the N." → … → "Goblin K. o. t. N."); the full name shows on hover.
- A card is **shown or hidden** to players **per tab** (the DM sees hidden cards ghosted) and revealed
  in one click. New cards start hidden (UX: nothing is shown by accident); "Reveal all" reveals every
  card in the tab. There is no per-player or per-group choice: players see the card, or they don't.
- The name players see comes from the **character**: an alias ("Hooded figure") or a hidden name (`???`),
  set once in the character's form and used everywhere. Instances add their number ("Goblin 2").
- Players click a card to open the character's **sheet** (an instance's sheet shows its own values); the
  DM's card menu has "Open sheet".
- The scene picks a **template per character type** ("Default" unless the DM chooses another).

**Display templates.** How characters are displayed is configured once, in Saga → Template → Characters → *Display
templates* (a sub-tab since plan 38, a tab in plan 34; each template's editor is its own page), not on each card. Each character type has a default template (the Saga template's
types get built-in ones made from them: "Player", "Major NPC", "Minor NPC"); a Set can pick
another per type. A template has a **color**, and holds, for each **display mode** and for two views
(**Player view** and **DM view**, same options), the mode's **regions**:

- Card modes: **Face**, **Full**, **None** (the scene's card styles pick which one is used; they can also pick a
  sheet mode).
- The editor's **Copy DM view** (on the Player view; **Copy player view** on the DM view) takes the other view's
  lists for the mode being edited, after a confirm.
- Sheet modes: **Immersive** (the card's ratio, the picture as background) and **Informative** (the face
  top left, the header next to it, the page body below).

Each region is an ordered **list of elements**. The DM adds elements ("+ Add": the values and the system
elements **Name**, **Type** (was *Category*; `@category`), **Group** not used yet in that view), orders them, moves them to another
region and removes them. What isn't added isn't shown: there is no "hidden" place, and an element shows
once per view.

| Mode | Regions |
|------|---------|
| Cards | **Top** (one element; the name by default), **Bottom** (the card itself), **Hover left**, **Hover right**, **Hover bottom** (hover trays beside and under the card, while the pointer is on it or the DM's card menu is open) |
| Immersive sheet | **Top left**, **Top center** (the name), **Top right** (one element each), **Bottom center** (above the bottom panel), **Bottom panel** (two columns), **Hover left**, **Hover right** (slide in while the pointer is on the sheet; a tap on touch screens) |
| Informative sheet | **Header** (next to the face, bigger, at most 4), **Page body** (when it doesn't fit, it is split into pages with controls at the bottom: ‹ Prev, the page dots and "2 / 3", Next ›) |
| Token (maps) | **On the token**, **Hover over** (a tray centred over the token itself, while the pointer is on it; plan 37), **Hover top** (the name by default), **Hover left**, **Hover right**, **Hover bottom** (trays around the token while the pointer is on it, each as big as its content, against the token and growing away from it: up, down, outwards) |

The editor's regions have two tabs (plan 59): **Variables** (the lists; **Copy** the other view beside the tabs) and
**Visual**: the mode's **border** (the same in both views): its **style** (simple: Flat, Gradient (the default),
Chip (embossed segments), Neon (one flat line in a lighter colour, glowing in the colour itself; plan 60); framed, drawn as a layer over the card, sheet or
token: Electric, HUD, Light frame, Mayan, Noble, Roses, Vines, after `docs/drafts/border_styles`' references), its
**colour** (the **owner's**: the token colour; the **group's**, else the owner's; a **custom** one) and its **width**
(S, M, L, XL). The token's mode's border is its token's (its older token border reads as its style). The border sits
**over the picture and under the values** (names, bars, labels: their bands keep their shade under it); a card drawn as
a sheet uses the sheet's. **Neon**'s glow is outside the card or sheet. On a **token** the border grows **inwards** from
its edge: a token is the same size whatever its border's style and width, at every token size, on square and hex grids.
The editor's *Map › Token* mode also sets the template's **token border** (Gradient, the default; Simple; Chip) and
previews the token with its values. Every card and sheet has a thin **frame** (4–5 px, a gradient) in the token
colour: the player's (several: white; none: black; an item's from its owners). The immersive sheet keeps its top bar
thin, and the gradient behind the lower values starts right under the first one. Text over pictures (full cards,
immersive sheets) has a soft drop shadow (50% black) so it reads on any picture.

Each element has a **value style** and a **view style**:

| Value style | Shows | For |
|-------------|-------|-----|
| **Bar** | A bar from the counter's min to its max, with its value on it (or not) | Counters (current/max), e.g. a PC's HP |
| **Number** | The exact value (`23 / 31`, or `+3`); a counter's can be a percentage or nothing | Counters and numbers |
| **Discrete** (discrete threshold) | A few icons giving a degree of information, not the value | Counters, e.g. an enemy's HP |
| **Text** | The value as text, yes/no or a list | Everything else, and the system elements |

| View style | Options | For |
|------------|---------|-----|
| Bar | **round** (a pill), **rounded** (rounded corners) or **flat** (square corners); **gradient** or not | Bar |
| Value | **None**, **Current / Max** (`23 / 31`, the default) or **Percentage** (`74%`: 0 to 100 from the min to the max, whole; never 0% above the min nor 100% below the max) | Bar, a counter's number |
| Icons | **balls**, **hearts**, **diamonds**, **squares**, **stars**, **bars** (half as wide as tall: side by side, a segmented meter); **number of icons** (1–10, default 4); **icon spacing** (0–50 px, default 5; a row wider than its room is drawn smaller); **logic** (below); **hide when full** (no icons while the value is at its max) | Discrete |
| Color | **theme** (the app's: bars green → yellow → red as they drop, red icons), **group** (the card's group color), **template** (the template's color), **player** (the token colour: its player's; several: white; none: black). Text values (and the card's name) take it too | All |
| Number color | **contrast** (black or white against the bar), **theme**, **black**, **white** | Bar, number |
| Show the name | the value's name above it, or not | All |

Values not in the players' view are never sent to players. Built-in templates follow the ruleset: on
cards, its Stage defaults (DnD Lite: PC HP as a bar, NPC HP as discrete balls, NPC initiative left out); on
sheets, its view rules. The DM view shows everything (on cards, values without a Stage default go to the
hover bottom tray), so the DM sees an enemy's exact HP while players see balls; the DM's cards mark values
players see differently. A character's controllers also see, on its sheet, what the ruleset lets them see
(their own inventory), in the region the DM view puts it. Templates made before the lists, or before
plan 57's settings (version 2: their "rounded" bars are now *round* and their "flat" ones *rounded*, so they keep their
look), are upgraded when read. Details: `../implementation/04-display-templates.md`,
`../implementation/06-template-lists-and-colors.md`, `../implementation/57-value-style-options.md`.

**Discrete threshold** (for counters; plan 57): the counter's range (min to max) is cut by breakpoints: the min,
*icons − 1* points between, the max. An icon shows for each breakpoint under the value, the min's included: above the
min there's at least one icon, at the min or below none. The element's **logic** says where the points between sit:

| Logic | Points between | Range 100, 4 icons |
|-------|----------------|--------------------|
| **Precise** | Even shares: an icon goes when its share is lost | 25, 50, 75: 4 icons at 100, 80 or 76; 3 at 75; none at 0 |
| **Full variant** (default) | Each moved by a random whole amount up to *K = int(0.4 × range / icons)* either way | 25 ± 10, 50 ± 10, 75 ± 10 |
| **Soft variant** | As Full variant, but the breakpoint at half the range stays put: for systems where half matters. There is one when the number of icons is even (4 icons: 0, 25, **50**, 75, 100); with an odd number none falls at half (3 icons: 0, 33, 67, 100), so it's Full variant | 25 ± 10, 50, 75 ± 10 |

The moves are **seeded per creature** (per instance) and value with a server secret: the same on every screen,
different between characters, and players can't work them out. **The server never sends hidden or discrete values to
players**: their payload only has the number of icons lit and how many there are, and nothing while a value hidden
when full is full. A bar or number showing a percentage or nothing sends players only the percentage. Admins always
see the real values (on hover).

**Layouts** (per tab, chosen in the Play view's ⚙ menu)

| Layout | Cards | Options |
|--------|-------|---------|
| **Grid** | Rows filling the scene's width | Flow, horizontal space, vertical space |
| **Row** | One line, left to right | Flow, horizontal space |
| **Column** | One line, top to bottom | Flow, spacing |
| **Circle** | Spread on a circle (the smallest one with cards `spacing` apart), centred in the room below the top margin | Flow, spacing |
| **Turn bar** | A bar at the top with the cards in order; the creature whose turn it is leaves the bar and shows in the centre at its **current turn card size** (50–300 %, default 170 %; smaller if the room under the bar is smaller), in the evidence card style, as if drawn, with an animation on every turn change | Horizontal space (in the bar), vertical space (between the bar and the drawn card), current turn card size |
| **Boundary** | Player characters (types marked as player characters) on the left, from the top left corner, filling rightwards then down; the others on the right, from the top right corner, filling leftwards then down | Spacing, **neutral zone** (% of the width, in the middle, with no cards; Dialog starts at 20%), **scatter** (px: each card's own random shift, from minus to plus that value on x and on y, kept on the scene, the same on every screen) |
| **Free** | The DM drags cards anywhere (positions are per tab); cards not placed yet start where the grid would put them | |

Every layout also has a **top margin** (default 50 px): the space between the top of the scene (under its title
and tabs) and the first cards; the layouts that start from an edge (grid, row, column, boundary, free) a **sides
margin** (default 50 px) from the edges; and every layout a **card size** (50–200 %).

**Initiative flow** (grid, row, column, circle): **static**, cards keep their places and the current
card is highlighted; or **rotate**, the creature whose turn it is is always first (top of the circle,
first in the grid, row or column) and the others follow in order, so the whole arrangement turns.

**Spacing**: the space between cards; in a circle, more spacing makes a bigger circle. Every layout slider
(spacing, margins, card sizes, neutral zone, scatter) is previewed while
dragging the slider, saved on release.

**Order and turns**

- **Order** (per tab, a list): **custom** (the DM's order) or **by a variable**: any number, counter (its current
  value) or calculated variable characters have, archetypes' too (plan 38: none is named in the code; DnD Lite:
  Level, HP, Initiative, Hit dice, Weight carried…), highest first, ties in the custom order. The order tray types a
  number or a counter's current value in place; a calculated one is shown.
- The **order tray** (Play: the turn controls → "Order…") lists the tab's cards in
  order, each with **move up / move down** and its sort value (initiative) editable in place. Moving a
  card while sorted by an attribute switches to custom, keeping the order the DM sees: roll initiative,
  then adjust it for the table's rules or arrangements. "Sort by Initiative" sorts again.
- **Turn controls** (a tab option, on by default in Combat): **Start** (jump to the first), **Previous**,
  **Next**, **End**, with the round number. Defeated creatures are skipped. In the Play view they are the
  scene's *Turns* toolbar, for the DM only (placed like any toolbar: see "Set controls").
- The creature whose turn it is gets the **current-turn highlight**: a frame, and a "Turn" tag outside the
  card, centred above it, both in the character's **owner's colour** (its token colour: its player's; several:
  white; plan 59, was the group's). The DM's highlight is in that colour too; a character without a player shows
  them in the theme's colours (turn blue, highlight gold).
  Players see it too (unless the card is hidden from them).

**Drawing attention**

- **Highlight** one card (glow and lift).
- **Spotlight**: dim every other card.
- **Grab attention** on a card: every player's view moves to it.

**Feel**

Changes animate: a bar shrinks with a trailing "chip" when damage lands (and grows on healing), a
ball pops when the level drops, cards glide to their new place when rearranged or when the turn rotates,
the turn bar draws the current card to the centre, a defeated creature fades to grey. It should feel nice.

**DM value editor** (Play view): click a value, then type `15`, `-7` or `+3`, or use −X −Y **OK** +Y +X.
X is one order of magnitude below the value's scale (HP 230 → 10, HP 3300 → 100) and Y is 1; small and very
large values get friendlier steps. On an instance it changes the instance only; on any other character,
the character everywhere.

A new Actors Scene starts with the Saga template's **Actors Scene tabs** (names, layouts, which ones have turns;
DnD Lite: Exploration, Dialog, Combat). See `rulesets.md`, "Saga templates".

### Pause

The DM's Set bar starts with **⏸ Pause** (plan 58). While the live Stage is paused a badge shows at its top for
everyone ("The DM paused the game"; the DM's: "Paused: players can't act", the button highlighted ▶ **Paused** to
resume), and players and viewers can't act: no dice, pings, token moves, value changes on sheets opened from the Stage,
and no actions run (anywhere: the server refuses them, `services/stages.refuse_if_paused`). Their own pages
(characters, lore) stay theirs. Pausing belongs to the Stage (`stages.paused`): making another Stage live leaves that
one as it was.

### Players' Set bar

Players and viewers have the DM's **Set bar** too (plan 59), in the same place, with only what they may do: **⚡
Actions** (players; their Action control under it, off while paused) and the Sets with a menu for them: the **Map**
(Select: a click opens a character's sheet or a linked place; **Move**: plan a move of a token the DM lets them move,
its controls in the tool row; greyed out, saying why, when they may move none). No eye, ⚙, fold, Stages, Pause or Player
view. Toolbars the DM placed stay where they are for everyone, with what each viewer may use: the dice tray (rolling for
those who may roll, else the results), the map's Zoom toolbar (with Ping for players and the DM).

### Player view

Next to Pause, the DM's **Player view** (plan 59) shows the Stage exactly as players see it, in place of the DM's: as
every player sees it (what the live link shows), or as one player (their characters, their groups' fog), switched from
the bar at its top, which also goes back to the DM's view. It's a preview: the players' controls show, nothing acts. It
works on any Stage, live or not: the Stages page's **Play** view is the Stage as on the Stage tab, so a Stage can be
tried, and seen as its players will, before going live.

### Map Set

A Location's map (see `locations.md`) on a Stage: the map fits the Set, with its grid, its fog for each member,
the resources on its tiles, its **tokens** and the paths, regions and labels they may see. Everyone can **zoom and
pan inside the map** (wheel, the − Fit ＋ buttons of its *Zoom* toolbar, dragging once zoomed; the DM drags with
Select or Move). The map always fills the Set: its controls are toolbars. (There used to be a World map and a Local map:
they were one Set, the Map; old Local maps became Maps with players' clicks off. Its key stays `world_map`.)

The DM adds **locations** to the Set (they are its actors) and shows **one at a time**: its main option in the Set bar
(DM only, in Build and Play) is the shown location's name; it opens a picker with the Set's locations on top ("On this
map") and every other location below; picking one not on the Set adds it and shows it, for everyone. In Play, clicking a
linked location that's in the Set shows it too. Next to it, when
the map has more than one, the **layer** players see (per location; the map's first until the DM picks one); then,
after a thin line, a **token picker**: picking one focuses the DM's own view on it (players aren't moved).

| Setting | Options |
|---------|---------|
| Locations | Added with the resource picker; one is shown |
| **Clicking resources** | Per role (players, viewers): may they click resources on the map to open them (another map, a character's view, an item)? The DM always can |
| **Fog** | One of the Saga's **fog presets** (chips; "Edit fog presets…" opens them on the Locations page): how the fog looks, its display, style, colours and motion. See `locations.md`, "Fog presets" |
| Grid | Shown or not; in Play and for players only on known and visible tiles (never in the fog); everywhere in Build |

In Play the DM's **menu row** (the Set bar, plan 45) holds ✎ **Full editor**, the location and layer, ◎ **Grab
attention**, then the **map tools**, each opening its tools in the **tool row** under it: **Selection** (Select, Move,
Highlight), **Fog** (Reveal, Known, Hide, brush or rectangle and size, Reveal all, All known, Hide all), **Links**,
**Tokens**, **Paths**, **Regions**, **Labels** (☰ the list with eye, rename, delete; ＋ add one, selected; the selected
one's tools: see `locations.md`; a token's also **Sheet**, **Focus**, **Grab**). The same bar is the map editor's.
- **Select** (the default): click resources (open them, or show a linked location), drag the map once zoomed; a click
  on a **token** opens its menu: a character's **sheet** (with its ⚡ Actions), **Focus on it** (the DM's view),
  **Grab attention** (every view zooms to it) and **Hide from players / Show to players**;
- **Move**: **drag tokens** (they snap to the tile they're dropped on) or the map; a click on a token (a map with
  layers) moves it to another layer, on the same tile; while dragging, an **arrow** runs from the centre of where it
  was to the centre of where it would land (everyone who sees the drag sees it too); where it would land and the
  arrow are in its owner's colour (no player: gold; plan 59);
- **Reveal / Known / Hide** (Fog): paint the fog for players, with a brush or a rectangle;
- **Highlight**: drag a brush of any size, from 1 tile (a stroke starting on a highlighted tile removes, else adds),
  or pick a region; **On / Off** hides the highlight from everyone and keeps the tiles, outlined for the DM, to show
  again in one click; Clear;
- **Grab attention**: every view of the map takes the DM's **zoom and centre** (whatever size their Set is), and the
  Set pulses. The DM sees it happen: the button pulses, a gold frame flashes around what players now see and a notice
  says "Players now see your view" (not live: it says to make the Stage live first);
- **Full editor**: the map editor in a modal that takes the whole window (the same bar; the grid, fog, background,
  layers and pictures in its side panel; **Full screen** too).

The DM sees the map through the fog (dimmed), and the fog as players see it. The ⚙ menu's Grab attention shows
everyone the whole map.

**Players moving tokens** (plan 58): a token's **Moved by** (in its tools: DM only, the default; **Players**; **Its
players**: a character's players in control, an item's owners; **Anyone**: viewers too) and **When** (character tokens:
**Always** or **On its turn**: while its character, or one of its instances, is the current creature of an Actors
Scene's shown tab with its turns running, on the same Stage) let others move it on the live Stage's map. They **plan the
move** (plan 59; they no longer drag): the Map's **Move** in their Set bar, a click on the token, then tiles (each touching the last,
or a far one: the cheapest route there, around blocked tiles and through tiles they know, A*); Undo takes a step back,
**✓ Move** makes it, ✕ drops it. Everyone who sees the token along the route sees it while it's planned (in its
owner's colour, a dot per step, what it counts: "6 tiles, counts 8 · 40 ft"). Made, the token **goes along its route**
for everyone, at the Map Set's **planned moves' speed** (a setting: 1 to 10; 10 moves it at once). The DM drags tokens,
and plans too (Selection's **Plan**). Tiles' costs (blocked, 2, 3: the Movement tool, `locations.md`) show while planning.
A click on a character's token they can see opens its **sheet** (Informative; its values they may change are
clickable: DSP-37). The DM always moves every token. The server checks every move again (`SetType.act` "token.move").

**The highlight zone**, for everyone: every other tile gets much darker; the highlighted tiles keep their look,
with a splined border (as thick as a normal path, gently pulsing) around them, drawn like a region's border.

**Pings**: players and the DM (not viewers) ping a tile with **📍 Ping** in the Zoom toolbar (then click a tile;
Esc cancels) or **Alt+click**. Everyone who sees the Set (live link screens too) sees the tile glow in the pinger's
colour (Saga → User) with a thick contour, and a pin with their name, for 10 seconds. A **notice** in the screen's
top right corner ("Ana pinged") lasts as long; clicking it centres and zooms that map on the tile. Pings are live only
(nothing is stored); one member pings at most twice a second.

Players never get a location's pictures here either: the Set sends the composed picture made for their fog.

### Relationship graph Set

A graph query's result on a Stage (see `relationships.md`). No actors: the DM picks in Build **whose knowledge**
it shows (member groups; default the players' group), the query (characters, everything, around resources,
among a set with neighbours; kinds; template links; as of a date) and labels; dragging a node places it for
everyone (command `nodes.place`; "Reset layout": `nodes.reset`). Nodes show the resource's icon, else its
picture's face crop, else its initial. Its graph zooms and pans on its own, like a map. Whoever sees the Set sees those relationships
(the DM's choice, like a reveal), with resources they can't see masked. Players pan and zoom. It updates live
when relationships or resources change. In Play, its main option "What it shows…" (and ⚙) opens these settings in a
window; the settings have Delete.

### Timeline Set

The Saga's timeline on a Stage ("what happened so far"; see `events.md`): the horizontal timeline, panned and zoomed
by everyone, events' boxes shown or hidden by a click (no page to open on a Stage). The DM picks in Build **whose
knowledge** it shows (member groups; the players by default; none: everything, the DM's), the dates (from, to, or an
era), the event types, and whether events **start expanded**. Like the relationship graph Set, whoever sees the Set
sees those events. It updates live when events, sub-events, relationships or eras change. In Play, "What it shows…"
(and ⚙) opens these settings in a window; the settings have Delete.

### Desktop Set

A desk where the DM lays **pieces** for the players: **characters** (a card, Face / Full / values, or a sheet,
Immersive / Informative, in the template picked: the type's default or any of its kind), **items** (an item card:
its picture, name banner and type, its first choice variable as a gem whose colour climbs with the option's place,
grey to gold, and its template's values; it tilts toward the pointer with a sheen, the top tier shimmers),
**documents** (on the page the DM turns to: ‹ n / N ›) and **pictures** (uploaded on the spot, category "Desktop
pictures", deleted with their piece).

- **Auto**: pieces in rows, in the order added, at one scale that fills the desk (cards get a bit more room), no piece
  taller than 40% of the desk (a first piece doesn't fill it). A piece dropped stays where it was dropped (no jump
  back while the server answers); its options bar sits well above it (clear of the rotate handle), or under it at the
  desk's top.
  **Free**: each keeps its place, size and angle; dragging a piece in Auto switches to Free, everything staying where
  it was, and the dragged piece comes to the front.
  **Focus**: one piece as big as fits in the middle (50 px from the top and above the row), the others in a row at
  the bottom (100 px tall in their own shapes, 50 px from the bottom, at most 50 px apart, narrowing down to
  overlapping to fit more), the focused piece's place left empty, like the Actors Scene's turn bar. The DM's **‹ ›**
  (circles at the row's ends) bring the previous or next piece, stopping at the ends; **◎ Focus** in a piece's bar
  brings that one, from any layout. Pieces are picked, not moved, resized or rotated. On a short desk the margins and
  the row shrink together (at most half its height). A piece only the DM sees isn't in focus for the players.
- The **background** (settings, a slider 0–100%, 78% by default): how opaque the desk's panel is (0: see-through, no
  frame). An **empty desk** shows nothing at all (no panel, no message) and lets clicks through, so it can stay on the
  Stage until the DM lays something on it; in Build its outline, title and a hint stay, to find it.
- The DM (Play and Build): the main options (in the Set bar) add pieces (＋ Character / Item / Document / Picture) and switch Auto /
  Free / Focus; clicking a piece gives its bar (the eye: shown to players or only to the DM, faded; Focus; a
  character's display and template; a document's pages; ✕), and in Auto and Free a corner handle to resize and one
  to rotate (Shift: 15° steps). Pieces glide to their new places.
- Places are fractions of the desk, so every screen shows the same arrangement at its size. Players only look.
- Showing a piece shows it to whoever sees the Set (the DM's choice, like a revealed card).
- **Temporary files** (Stage core, any Set type): an actor whose config holds `temp_file_id` owns that upload: deleting
  the actor, its Set or its Stage deletes the file; duplicating the Stage copies it.

### Dice roller

A shared dice tray with 3D dice. Its **roll types** start as the Saga template's (Template → Dice rolls; DnD Lite:
d20, Advantage, Disadvantage, d4 … d100, 2d6, Ability 4d6) and the DM changes them per Set (Build): a name, its dice
(count × d2, d4, d6, d8, d10, d12, d20, d100), how they're read (**sum**, **highest**, **lowest**, **sum above X**, **sum
below X**) and a **modifier**.

- **Who rolls** (settings): every player who sees it (the default), or some groups and members; the DM always.
  Viewers and the live link watch.
- **An action's dice** (plan 37; Saga → Settings → Actions, on by default): when an action's formula rolls dice, they're
  thrown on the live Stage's dice rollers as the action rolled them, in the dice of the character's player (else
  whoever ran it), with a result per formula on their row ("Mappy · Short rest (1d8 + 1) 5"). Not for a secret action
  (only the DM is told), nor dice the tray can't draw (a d3).
- **The tray** (a toolbar the DM places, inside the Set's bottom left by default) is a grid whose columns are the roll
  types:
  - at the bottom: **minimize** (the tray folds to one button that opens it again; it never minimizes by itself), **Roll**, **Clear** (your row:
    your waiting dice and your rolls), **Clear all** (the DM: every row), the **eye** (the DM: hides the rolled 3D dice
    for everyone, the results staying; a new roll shows them again), then the roll-type buttons. Clicking one adds
    its dice to **your** tray, in your **colour** and **dice style** (Saga → User); a number in a circle over it says
    how many of it you're about to roll, and clicking the number takes one back. The same roll type added again joins
    your group, read (summed) together: three clicks on d12 is "d12 ×3", one result;
  - above, the **results**: one row per roll on the Set (the latest 4; "＋N earlier" shows the rest), the roller's name
    on the left and each roll type's result in its column (its dice in small print, the counted ones in the colour);
  - over it all, the 3D dice waiting (in the band by the tray's edge: bottom, top, left or right; they're thrown from
    there), kept clear of the tray's controls.
- **Your preparation is yours**: players get only their own waiting dice (the DM gets everyone's, to pick values);
  **Roll** throws only yours. Several members can have dice waiting and rolled at once.
- **Rolls stay** on the Set (a row and their dice) until their roller clears their row, or the DM clears every row; at
  most 12 rolls (60 dice): the oldest go. New throws bounce off the dice already there. **Clicking a rolled die** hides
  it for whoever clicked (the DM or a player; kept in their browser; new throws don't bounce off it for them). The Set
  can be **transparent**, and unless dice are waiting in the tray it lets clicks through to what's under it; rolled dice
  still catch their own clicks (a click over the Set is checked against them first), and its tray always works (Set
  contract: `passThrough` may depend on the Set's content).
- The throw: the dice fly up, bounce off the Set's edges, each other and the resting dice, tumble and land flat, their
  value face up and its number upright on the screen (a d4 is a **crystal**: a square prism with pointed ends, lying on a
  long face with its value on the long face on top, across the screen; a **d2** is a **coin**, 1 and 2 on its faces; a
  d6's numbers are square to its edges). The camera looks straight
  down with a narrow view, so dice at the edges show their top, not their sides. Screens with the same Set size and
  tray see the same throw (a seed from the server; dice/physics.ts), and every screen the same numbers; rolls already
  there when a screen opens rest where they are. A roll's results show once its dice land.
- **Speed and size** (the Set's settings, sliders): the throw runs from half to five times its first speed (2× by
  default); the last step is **Instant** (the dice appear landed). Dice size: 60% to 180%.
- **The DM's pick**: clicking a waiting die (the DM, anyone's) opens its faces: the pick is where it lands (or "Let it roll").
  Players never see the pick, nor that there was one; the DM sees a small gold dot on the die.
- The server draws the values (honouring picks) and reads the results (`domain/dice.py`); the frontend lands each die
  on its value. A d100 is two d10s (tens and units).
- Members act on Sets through the Set contract's `act` (route `POST /sets/{id}/act`): players and the DM, on the live
  Stage's Sets they see (the DM anywhere); a type decides its acts.

**Dice styles** (each in the member's colour; 34), grouped by context (Saga → User picks a group, then a style in it; the
group is only the picker's):
- **Classic**: Minimalist (default: glossy, rounded, numbers in a readable complementary colour), Glass (clear, tinted
  with the colour, see-through; solid numbers in the colour), Jelly (a glossy gel: smoky shades of the colour, glowing
  sparkles; numbers in its complement), Neon (matte black; the edges and a rim inside each face glow in a shade of the
  colour, its hue turned 90°, the numbers in the colour).
- **Regal** (a blend of materials: a satin-matte lacquer of the colour, the filigree and the edges polished metal):
  Noble (gold, gold numbers), Aristocrat (silver, silver numbers), Guild (metal in the colour's complement, numbers to
  match).
- **Metal** (metal of the colour; numbers cut in, black or white): Matte (a diffuse sheen), Satin (a soft lustre),
  Polished (a near mirror), Hammered (dimples catching the light), Brushed (fine streaks), Rusted (raised, rough rust
  eating it); and Carbon fiber (a twill of tows in the colour under a soft resin coat).
- **Natural**: Raw wood, Polished wood (clear coat), Nature (dark earth wound with raised roots of the colour;
  cream numbers), Bone (carved ivory with scrimshaw in the colour; sepia numbers).
- **Gems**: Marble (polished, the colour pale with dark veins; black or white numbers), Granite (polished,
  flecked with the colour, black and white), Agate (glossy bands in shades of the colour), Charoite (swirls of silky
  fibres in shades of the colour, white and black streaks, a sheen as it turns), Amber (low-contrast flows of the
  colour, almost see-through, lit from inside, tiny bubbles), Crystal (a cut stone: reflective facets that flash as it
  turns; no lines between facets, polished edges that draw its shape), Iridescent (a beetle's shell: the colour turning
  to other hues as it turns away, glowing sparkles).
- **Folk**: Elven (black or white against the colour, slender; runes of the colour written along each face's edges,
  numbers in the colour), Dwarven (iron, thick bevels, rivets), Gnomish (copper clockwork, gears and rivets raised,
  numbers glowing in the colour), Orcish (a hacked lump of mottled hide in the colour, gouged, splashed with fresh
  liquid in its complement: wet, glossy, spikes flung out, drips running down, droplets; over old dried stains; the
  splashes run over faces and edges; black or white hacked numbers).
- **Arcane**: Ember (black stone, cracks glowing in the colour's complement, numbers glowing in the colour), Hellish
  (very dark purple marble, satin, its veins cracks glowing in the colour turned 90°; glowing numbers in a patch clear
  of cracks), Fire (a charred body, each face burning from its bottom edge with tongues of flame in the colour that
  climb towards its number's top, hotter to white at their cores, still; embers; white-hot numbers in a patch the flames
  leave clear), Hex (a wizard's die: the colour turned 90° at half its brightness; on each face a glowing seal in the
  turned colour, in from the edges: a double frame, a circle touching it with a second inside and runic marks between,
  corner seals of triangles and ringed dots; numbers glowing in the colour), Cosmic (deep space:
  nebulae of the colour and stars; glowing numbers).

Each member's **Performance** settings (Saga → User, their screen only, both off at first): **turn off dice
animations** (rolls show where they land, the tray's dice stay still, the scene draws only when something changes) and
**simplify dice visuals** (everyone's dice as plain 3D dice in their roller's colour, without styles).

The metals, Carbon fiber, Amber, Crystal, Charoite, Iridescent, Hellish, Fire, Orcish, Jelly and Cosmic are **continuous**: one material
over faces, edges and corners, worked out for each point from where it is on the die (`dice/surfaces.ts`); the other
styles are painted face by face, their edges plain.

The lighting stays soft so light styles read, and the reflected room is
tilted so glossy tops seen from above don't wash out. Numbers always reach a readable contrast (`color/theory.ts`),
are **never glossy** (masks take them out of every shine: fully rough, no metal, clear coat, sheen or iridescence, and
no specular at all: no highlight lands on them), are **debossed** (cut into the surface: sunk in the normal map, their
inner edge in shade; hard on Polished wood, not on Elven or glowing numbers) and glow a little on their own (fully on
Ember, Neon and Hellish). Light numbers on busy or dark surfaces get an outline that darkens the surface under it by
half (not a painted line).

### EFX Sets

**EFX - Far background**, **EFX - Near background** and **EFX - Foreground**: the Stage's
environment (see `efx.md`). They're connected: the Stage has one environment and each layer Set shows its layer of
it. Layer Sets fill their box, let every click through (contract: `passThrough`, `fullBleed`) and go to the back
(far, near) or the front (fore) when added (backend `SetType.depth`, `backdrop`, `default_transparent`,
`default_screen`). Switching the environment and the layers is the Stage's **EFX control** in the Set bar (EFX
Controls was a Set until plan 33).

### Next types (to be detailed)

| Type | What it shows | Actors |
|------|---------------|--------|
| Image | A single image (handout, portrait, scene) | None |

Later candidates: text/document, timer, dice results.

## Real-time

- Stage edits by the DM reach players live.
- A player who connects or reconnects receives the full current state of the live Stage (filtered).
- Switching the live Stage replaces the player's view.
