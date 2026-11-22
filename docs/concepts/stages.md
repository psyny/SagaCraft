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

- **Canvas** (the default): Sets sit on a big world; they can be anywhere, and viewers pan and zoom. Grab
  attention glides the camera to its target.
- **Interface**: Sets are fixed to the screen, whatever its size, so every piece stays in view all the time. Each
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

- Every Set has a **main toolbar**: for the DM it starts with the **eye**, which **puts the Set away**: it is drawn
  for no one (players aren't even sent it), and only its main toolbar stays, with the Set's name, to bring it
  back (handy when Sets are stacked on an interface Stage). In Build a put-away Set shows faded, and Build's Set
  list has the same eye. Then, in Play, **⚙** opens the Set's **settings** (its Play
  menu: what the title used to open; a type without one opens the Set in Build). The Set's title opens
  nothing. Each type puts more in it and adds its own toolbars:
  - **Actors Scene**: *Scene* (⚙, the tabs; in Build also "+ Add creatures") and *Turns* (the turn controls,
    in Play when the tab has them).
  - **Map**: *Map* (⚙, the locations), *Map tools* (Point, Reveal, Known, Hide, Highlight, Grab attention,
    Full editor; Play) and *Zoom* (− Fit ＋, for everyone).
  - **Relationship graph**: the main toolbar (⚙).
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
- Defaults: main toolbars outside the Set's top left (on an interface Stage: the screen's top left, stacked);
  *Turns* outside the bottom (the screen's bottom middle); *Map tools* down the left side; *Zoom* inside the
  bottom right. On the Stage tab, the screen's top-right toolbars sit under its corner (✕, Full screen).

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
  reveal/hide), a Set's **⚙** (in its main toolbar) opens the Set's menu (e.g. how cards are arranged). The DM's Stage tab is
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
- a Build side panel (settings of the Set or of one actor) and a Play menu (popup on the ⚙ of its main
  toolbar),
- its **toolbars** (see "Set controls"): which there are, what they hold, where they sit by default,
- how its state is filtered for a given player (visibility of its parts),
- how its changes are sent in real time,
- its **commands**: named actions with parameters (switch tab, next turn...), sent through one generic
  Set command route, so a button, a shortcut or later voice/AI trigger the same thing,
- where new actors go when added (e.g. into the current tab, as instances),
- its own **attention targets** (e.g. map tiles), validated on the server, and where they are on screen.

A Set that zooms its own content marks it `data-wheel` (the Stage's wheel zoom leaves it alone) and
`data-interactive` where a drag is its own (the Stage doesn't pan). Set types render through helpers the core hands them (`RenderContext`): the display templates (characters'
cards), the locations' maps and the relationship graphs, so they never touch the database themselves.

Adding a Set type = adding one module that implements the contract. No change to the Stage core.

### Main Set: Actors Scene

The **Actors Scene** is the main Set for showing characters to the players (it replaces the first
version's Creature panel). Stages and Sets show and combine what already exists elsewhere in the app, so
the scene leans on what was prepared there: characters and their **categories**, **groups** (the party,
each planned encounter) and **instanceable** characters (see `characters.md`). The DM adds creatures, or
whole groups, and the cards follow the display templates: adding needs no settings.

**Tabs**

A scene has **tabs**; the players see one, the **active tab**, and the DM switches it at the table in one
click. Every new scene starts with **Exploration**, **Dialog** and **Combat**; the DM adds, renames,
reorders and deletes tabs (a scene keeps at least one).

| Settings of | Hold |
|-------------|------|
| The scene | name, visibility, card style, templates per category, its creatures (the **cast**), the active tab |
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
**characters** below, by category. Adding a group adds its creatures (counts become instances): a one-time
shortcut for adding them one by one. Groups can be added again, and several groups at once. Creatures join
the scene (every tab); "Add and reveal" reveals them only in the tab being built or played, "Add hidden"
nowhere. A card remembers the group it came with: its **group color**.

**Cards**

- Each creature is a **card** with its picture and the template's elements. Cards are always compact
  (fixed width); their height follows the style and how many values they show.
- **Card style** for the scene (what each style shows is set in the display templates):
  - **Face**: the face crop (square) on top, the **top** element (the name) centred on a dark band over the
    top of the picture; the **bottom** elements below. Each value shows its name centred (unless the
    template leaves it out), and the display on the row below.
  - **None**: no picture: the top band, then the bottom elements right below it.
  - **Full**: the whole picture, in the **card ratio** (5:7), as the card's background; the top band on top
    and a dark band at the bottom behind the values.
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
- The scene picks a **template per category** ("Default" unless the DM chooses another).

**Display templates.** How characters are displayed is configured once, in the Characters tab →
*Display templates*, not on each card. Each category has a default template (the Saga template's
categories get built-in ones made from their type: "Player", "Major NPC", "Minor NPC"); a Set can pick
another per category. A template has a **color**, and holds, for each **display mode** and for two views
(**Player view** and **DM view**, same options), the mode's **regions**:

- Card modes: **Face**, **Full**, **None** (the scene's card style picks which one is used).
- Sheet modes: **Immersive** (the card's ratio, the picture as background) and **Informative** (the face
  top left, the header next to it, the page body below).

Each region is an ordered **list of elements**. The DM adds elements ("+ Add": the values and the system
elements **Name**, **Category**, **Group** not used yet in that view), orders them, moves them to another
region and removes them. What isn't added isn't shown: there is no "hidden" place, and an element shows
once per view.

| Mode | Regions |
|------|---------|
| Cards | **Top** (one element; the name by default), **Bottom** (the card itself), **Hover left**, **Hover right**, **Hover bottom** (hover trays beside and under the card, while the pointer is on it or the DM's card menu is open) |
| Immersive sheet | **Top left**, **Top center** (the name), **Top right** (one element each), **Bottom center** (above the bottom panel), **Bottom panel** (two columns), **Hover left**, **Hover right** (slide in while the pointer is on the sheet; a tap on touch screens) |
| Informative sheet | **Header** (next to the face, bigger, at most 4), **Page body** (when it doesn't fit, it is split into pages with controls at the bottom: ‹ Prev, the page dots and "2 / 3", Next ›) |

Each element has a **value style** and a **view style**:

| Value style | Shows | For |
|-------------|-------|-----|
| **Bar** | A bar from 0 to max | Counters (current/max), e.g. a PC's HP |
| **Number** | The exact value (`23 / 31`, or `+3`) | Counters and numbers |
| **Discrete** (discrete threshold) | A few icons giving a degree of information, not the value | Counters, e.g. an enemy's HP |
| **Text** | The value as text, yes/no or a list | Everything else, and the system elements |

| View style | Options | For |
|------------|---------|-----|
| Bar | **rounded** or **flat**; **gradient** or not | Bar |
| Icons | **balls**, **hearts**, **diamonds**, **squares** | Discrete |
| Color | **theme** (the app's: bars green → yellow → red as they drop, red icons), **group** (the card's group color), **template** (the template's color) | All |
| Number color | **contrast** (black or white against the bar), **theme**, **black**, **white** | Bar, number |
| Show the name | the value's name above it, or not | All |

Values not in the players' view are never sent to players. Built-in templates follow the ruleset: on
cards, its Stage defaults (DnD Lite: PC HP as a bar, NPC HP as discrete balls, NPC initiative left out); on
sheets, its view rules. The DM view shows everything (on cards, values without a Stage default go to the
hover bottom tray), so the DM sees an enemy's exact HP while players see balls; the DM's cards mark values
players see differently. A character's controllers also see, on its sheet, what the ruleset lets them see
(their own inventory), in the region the DM view puts it. Templates made before the lists are upgraded
when read. Details: `../implementation/04-display-templates.md`,
`../implementation/06-template-lists-and-colors.md`.

**Discrete threshold** (for counters):

| Icons | Meaning |
|-------|---------|
| 4 | Full (current = max) |
| 3 | Above point **A** (A is random between 60% and 90%) |
| 2 | Above point **B** (B is random between 30% and A − 10%) |
| 1 | Above zero |
| 0 | Dead / down (current ≤ 0) |

A and B are **seeded per creature** (per instance) with a server secret, so players can't learn the exact
percentages either. **The server never sends hidden or discrete values to players**: their payload only
has the number of icons (the level). Admins always see the real values (on hover).

**Layouts** (per tab, chosen in the Play view's ⚙ menu)

| Layout | Cards | Options |
|--------|-------|---------|
| **Grid** | Rows filling the scene's width | Flow, horizontal space, vertical space |
| **Row** | One line, left to right | Flow, horizontal space |
| **Column** | One line, top to bottom | Flow, spacing |
| **Circle** | Spread on a circle (the smallest one with cards `spacing` apart), centred in the room below the distance to top | Flow, spacing |
| **Turn bar** | A bar at the top with the cards in order; the creature whose turn it is leaves the bar and shows scaled up in the centre, as if drawn, with an animation on every turn change | Horizontal space (in the bar), vertical space (between the bar and the drawn card) |
| **Boundary** | Player characters (categories marked as player characters) on the left, from the top left corner, filling rightwards then down; the others on the right, from the top right corner, filling leftwards then down | Spacing, **neutral zone** (% of the width, in the middle, with no cards; Dialog starts at 20%), **scatter** (px: each card's random shift on x and on y, up to that value, the same on every screen) |
| **Free** | The DM drags cards anywhere (positions are per tab); cards not placed yet start where the grid would put them | |

Every layout also has a **distance to top**: the space between the top of the scene (under its title and
tabs) and the first cards.

**Initiative flow** (grid, row, column, circle): **static**, cards keep their places and the current
card is highlighted; or **rotate**, the creature whose turn it is is always first (top of the circle,
first in the grid, row or column) and the others follow in order, so the whole arrangement turns.

**Spacing**: the space between cards; in a circle, more spacing makes a bigger circle. Every layout slider
(spacing, distance to top, neutral zone, scatter) is previewed while
dragging the slider, saved on release.

**Order and turns**

- **Order** (per tab): **custom** (the DM's order) or **by an attribute** (the ruleset's sortable numbers:
  Initiative, Level), highest first, ties in the custom order.
- The **order tray** (Play: the turn controls → "Order…") lists the tab's cards in
  order, each with **move up / move down** and its sort value (initiative) editable in place. Moving a
  card while sorted by an attribute switches to custom, keeping the order the DM sees: roll initiative,
  then adjust it for the table's rules or arrangements. "Sort by Initiative" sorts again.
- **Turn controls** (a tab option, on by default in Combat): **Start** (jump to the first), **Previous**,
  **Next**, **End**, with the round number. Defeated creatures are skipped. In the Play view they are the
  scene's *Turns* toolbar, for the DM only (placed like any toolbar: see "Set controls").
- The creature whose turn it is gets the **current-turn highlight**: a frame, and a "Turn" tag outside the
  card, centred above it, both in the card's **group color** (the group it was added with, else the
  character's first group; theme blue without one). It is separate from the DM's (gold) highlight.
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

### Map Set

A Location's map (see `locations.md`) on a Stage: the map fits the Set, with its grid, its fog for each member,
the resources on its tiles, its **tokens** and the paths, regions and labels they may see. Everyone can **zoom and
pan inside the map** (wheel, the − Fit ＋ buttons of its *Zoom* toolbar, dragging once zoomed; the DM drags with the
Point tool). The map always fills the Set: its controls are toolbars. (There used to be a World map and a Local map:
they were one Set, the Map; old Local maps became Maps with players' clicks off. Its key stays `world_map`.)

The DM adds **locations** to the Set (they are its actors) and shows **one at a time**: the location chips in its
main toolbar (DM only, in Build and Play) switch the shown location for everyone in one click. In Play, clicking a
linked location that's in the Set shows it too.

| Setting | Options |
|---------|---------|
| Locations | Added with the resource picker; one is shown |
| **Clicking resources** | Per role (players, viewers): may they click resources on the map to open them (another map, a character's view, an item)? The DM always can |
| **Fog** | One of the Saga's **fog presets** (chips; "Edit fog presets…" opens them on the Locations page): how the fog looks, its display, style, colours and motion. See `locations.md`, "Fog presets" |
| Grid | Shown or not; in Play and for players only on known and visible tiles (never in the fog); everywhere in Build |

In Play the DM has the **Map tools** toolbar:
- **Point**: click resources (open them, or show a linked location) and **drag tokens** (they snap to the tile they're
  dropped on);
- **Reveal / Known / Hide**: paint the fog for players, with a brush;
- **Highlight**: drag a brush of any size, from 1 tile (a stroke starting on a highlighted tile removes, else adds),
  or pick a region; **On / Off** hides the highlight from everyone and keeps the tiles, outlined for the DM, to show
  again in one click; Clear;
- **Grab attention**: every view of the map takes the DM's **zoom and centre** (whatever size their Set is), and the
  Set pulses;
- **Full editor…**: the location's tools in a modal that takes the whole window (tokens, fog, links, labels, paths,
  regions, pictures, grid; **Full screen** too).

The DM sees the map through the fog (dimmed), and the fog as players see it. The ⚙ menu's Grab attention shows
everyone the whole map.

**The highlight zone**, for everyone: every other tile gets much darker; the highlighted tiles keep their look,
with a splined border (as thick as a normal path, gently pulsing) around them, drawn like a region's border.

**Pings**: players and the DM (not viewers) ping a tile with **📍 Ping** in the Zoom toolbar (then click a tile;
Esc cancels) or **Alt+click**. Everyone who sees the Set (live link screens too) sees the tile glow in the pinger's
colour (Saga → User) with a thick contour, and a pin with their name, for about 4 seconds. Pings are live only
(nothing is stored); one member pings at most twice a second.

Players never get a location's pictures here either: the Set sends the composed picture made for their fog.

### Relationship graph Set

A graph query's result on a Stage (see `relationships.md`). No actors: the DM picks in Build **whose knowledge**
it shows (member groups; default the players' group), the query (characters, everything, around resources,
among a set with neighbours; kinds; template links; as of a date) and labels; dragging a node places it for
everyone (command `nodes.place`; "Reset layout": `nodes.reset`). Nodes show the resource's icon, else its
picture's face crop, else its initial. Its graph zooms and pans on its own, like a map. Whoever sees the Set sees those relationships
(the DM's choice, like a reveal), with resources they can't see masked. Players pan and zoom. It updates live
when relationships or resources change.

### Timeline Set

The Saga's timeline on a Stage ("what happened so far"; see `events.md`): the horizontal timeline, panned and zoomed
by everyone, events' boxes shown or hidden by a click (no page to open on a Stage). The DM picks in Build **whose
knowledge** it shows (member groups; the players by default; none: everything, the DM's), the dates (from, to, or an
era), the event types, and whether events **start expanded**. Like the relationship graph Set, whoever sees the Set
sees those events. It updates live when events, sub-events, relationships or eras change.

### Desktop Set

A desk where the DM lays **pieces** for the players: **characters** (a card, Face / Full / values, or a sheet,
Immersive / Informative, in the template picked: the category's default or any of its kind), **items** (an item card:
its picture, name banner and category, its first choice variable as a gem whose colour climbs with the option's place,
grey to gold, and its template's values; it tilts toward the pointer with a sheen, the top tier shimmers),
**documents** (on the page the DM turns to: ‹ n / N ›) and **pictures** (uploaded on the spot, category "Desktop
pictures", deleted with their piece).

- **Auto**: pieces in rows, in the order added, at one scale that fills the desk (cards get a bit more room).
  **Free**: each keeps its place, size and angle; dragging a piece in Auto switches to Free, everything staying where
  it was, and the dragged piece comes to the front.
- The DM (Play and Build): the main toolbar adds pieces (＋ Character / Item / Document / Picture) and switches Auto /
  Free; clicking a piece gives its bar (the eye: shown to players or only to the DM, faded; a character's display and
  template; a document's pages; ✕), a corner handle to resize and one to rotate (Shift: 15° steps).
- Places are fractions of the desk, so every screen shows the same arrangement at its size. Players only look.
- Showing a piece shows it to whoever sees the Set (the DM's choice, like a revealed card).
- **Temporary files** (Stage core, any Set type): an actor whose config holds `temp_file_id` owns that upload: deleting
  the actor, its Set or its Stage deletes the file; duplicating the Stage copies it.

### Dice roller

A shared dice tray with 3D dice. Its **roll types** start as the Saga template's (Template → Dice rolls; DnD Lite:
d20, Advantage, Disadvantage, d4 … d100, 2d6, Ability 4d6) and the DM changes them per Set (Build): a name, its dice
(count × d4, d6, d8, d10, d12, d20, d100), how they're read (**sum**, **highest**, **lowest**, **sum above X**, **sum
below X**) and a **modifier**.

- On the Stage, players and the DM (viewers and the live link watch) click roll types: their dice drop into the
  **tray**, a row along the edge the DM picked (bottom, top, left, right; the dice are thrown from it), in the clicker's
  **colour** and **dice style** (Saga → User), for everyone to see. The same roll type added again by the same member
  joins their group, read (summed) together: three clicks on d12 is "d12 ×3", one result. Whoever added a group takes
  it back (✕; the DM: any, and Clear). **Roll** throws the whole tray.
- The roll buttons, the tray's list (with Roll) and the results are **toolbars** ("Rolls", "Tray", "Results"): the DM
  places them under Controls like any Set's. The results' **✕** (players and the DM) clears them and the rolled dice
  from the Set, for everyone (they stay under "Earlier rolls"). The Set can be **transparent**, and with no dice on it
  (nothing in the tray, no roll shown) it lets clicks through to what's under it; its toolbars still work (Set contract:
  `passThrough` may depend on the Set's content).
- The throw: the dice fly up, bounce off the Set's edges and each other, tumble and land showing their numbers; a Set
  of the same size sees the same throw (a seed from the server; dice/physics.ts), and every screen the same numbers.
  The **results** then show: each roll type's name, who added it, its dice (the counted ones in their colour) and the
  result; earlier rolls under "Earlier rolls".
- **The DM's pick**: clicking a die in the tray (the DM) opens its faces: the pick is where it lands (or "Let it roll").
  Players never see the pick, nor that there was one; the DM sees a small gold dot on the die.
- The server draws the values (honouring picks) and reads the results (`domain/dice.py`); the frontend lands each die
  on its value. A d100 is two d10s (tens and units).
- Members act on Sets through the Set contract's `act` (route `POST /sets/{id}/act`): players and the DM, on the live
  Stage's Sets they see (the DM anywhere); a type decides its acts.

**Dice styles** (each in the member's colour): Minimalist (default: glossy, rounded, numbers in a readable
complementary colour), Ember (black stone, cracks glowing in the colour's complement, numbers glowing in the colour), Metal (brushed and reflective; black or white
numbers), Raw wood, Polished wood (clear coat), Noble (lacquer, gold filigree and numbers), Elven (pearly, slender,
sharp edges, a sheen of the colour), Dwarven (iron, thick bevels, rivets), Orcish (blackened, rusted iron hacked into an uneven lump,
claw slashes of war paint in the colour, studs, hacked bone-white numbers), Nature (a living pebble wrapped in vines and
leaves of the colour, little flowers in its complement, cream numbers). The lighting stays soft so light styles
read. Numbers always reach a readable contrast
(`color/theory.ts`).

### EFX Sets

**EFX - Far background**, **EFX - Near background**, **EFX - Foreground** and **EFX - Controls**: the Stage's
environment (see `efx.md`). They're connected: the Stage has one environment and each layer Set shows its layer of
it. Layer Sets fill their box, let every click through (contract: `passThrough`, `fullBleed`) and go to the back
(far, near) or the front (fore) when added (backend `SetType.depth`, `backdrop`, `default_transparent`,
`default_screen`); EFX Controls is the DM's (`private`) panel to switch the environment and turn each layer on or
off.

### Next types (to be detailed)

| Type | What it shows | Actors |
|------|---------------|--------|
| Image | A single image (handout, portrait, scene) | None |

Later candidates: text/document, timer, dice results.

## Real-time

- Stage edits by the DM reach players live.
- A player who connects or reconnects receives the full current state of the live Stage (filtered).
- Switching the live Stage replaces the player's view.
