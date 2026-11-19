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
PCs, NPCs, monsters) to it and controls, per card and per attribute, **how** each value is displayed and
**to whom**.

**Cards**

- Each creature is a **card** with its picture, name and chosen values. Cards are always compact (fixed
  width); their height follows the style and how many values they show.
- **Card style** for the panel, and per card if needed:
  - **Face**: the face crop on top, the name centred on a dark band over the top of the picture; values
    below. Each value shows its name centred, and the display on the row below.
  - **None**: no picture: the name band, then the values right below it.
  - **Full**: the whole picture as the card's background; the name band on top and a dark band at the
    bottom behind the values.
- Names too long for their band are abbreviated from the last word back ("Goblin King of the North" →
  "Goblin King of the N." → … → "Goblin K. o. t. N."); the full name shows on hover.
**Player view and DM view.** Each card's settings come in two sections with the same options, one for
what the players see and one for what the DM sees:

- **Card**: shown or hidden. Hidden from players: the DM sees it ghosted; it can be revealed in one click.
  New cards start hidden from players (UX: nothing is shown by accident); "Reveal all" reveals the whole
  panel. Hidden from the DM: left out of the DM's Play view (and Stage tab), still listed in Build.
  There is no per-player or per-group choice here: players see the card, or they don't.
- **Name**: a display name ("Hooded figure" instead of the real name), or the name hidden (`???`).
- For each value, its **style** and where it is **displayed on**:

| Style | Shows | For |
|-------|-------|-----|
| **Bar** | A bar from 0 to max | Counters (current/max), e.g. a PC's HP |
| **Number** | The exact value (`23 / 31`, or `+3`) | Counters and numbers |
| **Balls** (discrete threshold) | A few balls giving a degree of information, not the value | Counters, e.g. an enemy's HP |

| Displayed on | Means |
|--------------|-------|
| **Card** | On the card itself |
| **Hover** | In a **hover tray**: a panel that opens under the card while the pointer is on it (or while the DM's card menu is open), with only these values |
| **Hidden** | Not shown (players don't even receive it) |

Player defaults come from the ruleset (DnD Lite: PC HP as a bar, NPC HP as balls, NPC initiative hidden).
DM defaults: every value on the card, bars for counters and numbers otherwise, so the DM sees an enemy's
exact HP while players see balls. The DM's cards mark values players see differently (another style,
on hover, or not at all).

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
