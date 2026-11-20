# Stages and Sets

The Stage is SagaCraft's core feature. This doc holds the model as discussed so far; Set types will be
detailed one by one.

## Model

```
Saga
└── Stage (many; one may be live)
    ├── viewport defaults (initial center, zoom)
    └── Set (many)
        ├── type          image | map | grid | graph | ...
        ├── position      x, y on the Stage canvas
        ├── size          width, height
        ├── layer         z-order (higher draws on top)
        ├── visibility    groups and/or members (default: admins only)
        ├── config        type-specific settings (grid size, background file...)
        └── Actor (many, depending on the type)
            ├── position inside the Set (cell, coordinates or node)
            ├── visibility
            └── link to a Saga resource (character, location, item, document) or free-form
```

- **Stage**: a canvas the DM prepares. Any number per Saga.
- **Live Stage**: the one the players see. Zero or one at a time; the DM switches it at will.
- **Set**: a rectangular component placed on the Stage canvas. A Set can be **transparent**: no
  background, border or title bar for players, so Sets can be composed over a background image; the DM
  still sees the title bar in the Build view and on hover in the Play view. Sets can overlap; `layer` decides
  which is on top. Many Sets of any type can share one Stage.
- **Actor**: something placed inside a Set. What an Actor is depends on the Set type (a creature on a
  grid, a node on a relationship graph, a pin on a map).

## Build and Play views

Building a Stage and using it are separate (see `ux.md`):

- **Build view** (DM): put Sets on the Stage, move and resize them. Clicking selects one thing (the Stage, a
  Set or a card) and the side panel shows **only its settings**: who sees what, names, pictures, how each
  value is shown to players and to the DM.
- **Play view** (DM): the Stage as players see it, with no fixed panel. Clicking acts through popups:
  a value opens the value editor, a card opens its menu (highlight, spotlight, grab attention,
  reveal/hide), a Set's title opens the Set's menu (e.g. how cards are arranged). The DM's Stage tab is
  always the Play view of the live Stage; any Stage can be opened in Play from the Stages tab to rehearse.
- **Players and viewers** only watch (pan and zoom).

## Who sees what

- Players and viewers only ever see the live Stage, in their **Stage tab**. Non-live Stages are admin-only drafts.
- Inside the live Stage, each Set and each Actor has its own visibility. A player receives only the
  Sets and Actors visible to them (filtered on the server).
- Saga admins (DMs) see everything, with hidden items marked as hidden.
- Players can use the rest of the app (lore, character pages) while a Stage is live. The Stage tab
  keeps updating in the background.

## Grab attention

The DM can "grab" the players' attention:

- Every player's Stage view pans/zooms to a point or area chosen by the DM.
- Players on another tab are brought to the Stage tab (or get a strong notification: to decide).
- When not grabbing, players pan and zoom the Stage freely.

Open details are in `../open_questions.md` (lock while grabbed or just move once, target some players).

## Set types

The Stage core must not know the details of any Set type. Each type provides, through a shared contract:

- its config schema and Actor schema (validated on the server),
- a view for the three modes (players watch, DM plays, DM builds),
- a Build side panel (settings of the Set or of one actor) and a Play menu (popup on the Set's title),
- how its state is filtered for a given player (visibility of its parts),
- how its changes are sent in real time.

Adding a Set type = adding one module that implements the contract. No change to the Stage core.

### First version: Creature panel

The **Creature panel** is the first Set type we build. The DM adds creatures (Character resources:
PCs, NPCs, monsters) to it. **How** each card is displayed comes from **display templates** (see below):
adding creatures needs no settings.

**Cards**

- Each creature is a **card** with its picture, name and chosen values. Cards are always compact (fixed
  width); their height follows the style and how many values they show.
- **Card style** for the panel (each style's layout is set in the display templates):
  - **Face**: the face crop on top, the name centred on a dark band over the top of the picture; values
    below. Each value shows its name centred, and the display on the row below.
  - **None**: no picture: the name band, then the values right below it.
  - **Full**: the whole picture as the card's background; the name band on top and a dark band at the
    bottom behind the values.
- Names too long for their band are abbreviated from the last word back ("Goblin King of the North" →
  "Goblin King of the N." → … → "Goblin K. o. t. N."); the full name shows on hover.
- A card is **shown or hidden** to players (the DM sees hidden cards ghosted) and revealed in one click.
  New cards start hidden (UX: nothing is shown by accident); "Reveal all" reveals the whole panel. There is
  no per-player or per-group choice: players see the card, or they don't.
- The name players see comes from the **character**: an alias ("Hooded figure") or a hidden name (`???`),
  set once in the character's form and used everywhere.
- Players click a card to open the character's **sheet**; the DM's card menu has "Open sheet".
- The panel picks a **template per character type** ("Default" unless the DM chooses another).

**Display templates.** How characters are displayed is configured once, in the Characters tab →
*Display templates*, not on each card. Each character type has a default template (built from the ruleset
the first time: "Player character", "NPC"); a Set can pick another per type. A template holds, for each
**display mode** and for two views (**Player view** and **DM view**, same options), where each value shows
and its style:

- Card modes: **Face**, **Full**, **None** (the panel's card style picks which one is used).
- Sheet modes: **Immersive** (name on top, the picture as background, values on the bottom half) and
  **Informative** (the face top left, up to 4 highlighted values next to it, everything else below).

Styles and places for a value:

| Style | Shows | For |
|-------|-------|-----|
| **Bar** | A bar from 0 to max | Counters (current/max), e.g. a PC's HP |
| **Number** | The exact value (`23 / 31`, or `+3`) | Counters and numbers |
| **Balls** (discrete threshold) | A few balls giving a degree of information, not the value | Counters, e.g. an enemy's HP |

| Mode | Displayed on |
|------|--------------|
| Cards | **Card**; **Hover** (a **hover tray** that opens under the card while the pointer is on it, or while the DM's card menu is open); **Hidden** |
| Immersive sheet | **Shown**; **Hidden** |
| Informative sheet | **Highlight** (next to the picture, at most 4); **Body**; **Hidden** |

Hidden values are never sent to players. Built-in templates follow the ruleset: on cards, its Stage
defaults (DnD Lite: PC HP as a bar, NPC HP as balls, NPC initiative hidden); on sheets, its view rules. The
DM view shows everything (extra numbers on hover on cards), so the DM sees an enemy's exact HP while
players see balls; the DM's cards mark values players see differently. A character's controllers also see,
on its sheet, what the ruleset lets them see (their own inventory). Details:
`../implementation/04-display-templates.md`.

**Discrete threshold** (for counters):

| Balls | Meaning |
|-------|---------|
| 4 | Full (current = max) |
| 3 | Above point **A** (A is random between 60% and 90%) |
| 2 | Above point **B** (B is random between 30% and A − 10%) |
| 1 | Above zero |
| 0 | Dead / down (current ≤ 0) |

A and B are **seeded per creature** with a server secret, so players can't learn the exact percentages
either. **The server never sends hidden or discrete values to players**: their payload only has the
number of balls. Admins always see the real values (on hover).

**Spacing** (panel setting, Play view's title menu): the space between cards in grid, row and column; in
a circle, how far apart the cards are, so more spacing makes a bigger circle.

**Arranging** (Play view, panel title menu)

- **Shape**: grid, row, column, circle (spreads to fill the panel, grows so cards never overlap), or free
  (the DM drags cards anywhere).
- **Order** (all shapes but free): the DM's order (drag cards to reorder) or **by initiative**.

**Drawing attention**

- **Highlight** one card (glow and lift), e.g. whose turn it is.
- **Spotlight**: dim every other card.
- **Grab attention** on a card: every player's view moves to it.

**Feel**

Changes animate: a bar shrinks with a trailing "chip" when damage lands (and grows on healing), a
ball pops when the level drops, cards glide to their new place when rearranged, a defeated creature
fades to grey. It should feel nice.

**DM value editor** (Play view): click a value, then type `15`, `-7` or `+3`, or use −X −Y **OK** +Y +X.
X is one order of magnitude below the value's scale (HP 230 → 10, HP 3300 → 100) and Y is 1; small and very
large values get friendlier steps.

### Next types (to be detailed)

| Type | What it shows | Actors |
|------|---------------|--------|
| Image | A single image (handout, portrait, scene) | None |
| Map | A large image with pan/zoom | Pins/markers, linked to lore |
| Battle grid | Square grid over an optional background | Creatures (characters, NPCs, monsters) on cells |
| Relationship graph | The result of a graph query (see `relationships.md`), with a saved layout | Resources as nodes, relationships as edges |

Later candidates: text/document, timeline (see `events.md`), initiative tracker, hex grid, fog of war, timer, dice results.

## Real-time

- Stage edits by the DM reach players live.
- A player who connects or reconnects receives the full current state of the live Stage (filtered).
- Switching the live Stage replaces the player's view.
