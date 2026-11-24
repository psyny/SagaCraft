# Rulesets

SagaCraft is system-agnostic. Everything specific to a game system lives in a **Ruleset**: a data
definition the app loads. Code never hard-codes "Hit Points", "Initiative" or "NPC".

**A ruleset defines the Saga's resources**: what kinds of things exist in the world, what data each one
carries, who can see and edit that data, and the structural references between them.

Free, narrative **relationships** ("A killed B") are *not* part of the ruleset: users create them. See
`relationships.md`. Events and calendars are in `events.md`.

## Resources

A **resource** is any thing in a Saga that the ruleset describes. Every resource has a **kind**.
The first kinds:

| Kind | Examples | References typical of the kind |
|------|----------|-----------------------------------|
| **Document** | Letter, book, handout: pages of text or pictures | Mentions other resources; attached to any resource |
| **Character** | Player character, NPC, monster | Controlled by members; has an inventory of Items; is at a Location |
| **Location** | World, region, city, tavern, room | Contains other Locations (this builds the world map) |
| **Item** | Sword, potion, key, treasure | Held in a Character's inventory or found at a Location |
| **Event** | Battle, festival, death, discovery | Has a date, involved resources and sub-events (see `events.md`) |

More kinds may come later (e.g. Faction, Quest): see open points.

The app knows how to handle each kind as a whole (documents show their content, locations nest,
items go in inventories). The ruleset decides what's *inside* each kind.

> Note: "resource" used to mean a counter like HP in earlier drafts. HP is now an **attribute** of a
> Character, of the **counter** attribute type.

## Types and subtypes

Under each kind, the ruleset defines **types**, which can have **subtypes**:

```
Character
├── Player     (pc: player characters)
├── DM         (dm)
└── NPC        (npc: new ones instanceable)
```

- A subtype **inherits** its parent's attributes and can add its own.
- Types can share attributes (defined on the parent) or have their own (defined on the subtype).
- Every resource in a Saga is of one type (e.g. "Thorin" is a PC, the Goblin is an NPC).
- A character type also says whether its characters are **player characters** (the players' side) and whether new
  ones are **instanceable** (`"player"`, `"instanceable"`). Characters are organized by type (the Characters page's
  sections, display defaults); until plan 40 a Saga's **categories** did that, each based on a type, and were merged
  into the types. See `characters.md`.

## Saga templates

A ruleset is the core of a **Saga template**: what a Saga is built on. A Saga template holds:

| Part | What | Applies |
|------|------|---------|
| **Character variables** | The attributes every character has (HP, level...) and each character type's own (Player, NPC...) | Live: the Saga's forms, sheets and Stages read them |
| **Item variables** | The attributes every item has (rarity, value, weight...) and each **item type**'s own (weapon: damage) | Live |
| **Document and location variables** | Details on documents and locations (their pages and maps are the app's) | Live |
| **Who sees what, per type** | A type can change who sees a shared variable (NPC HP hidden from players) | Live |
| **Character types** | Player, DM, NPC...: their own variables, player characters or not, new ones instanceable or not (see `characters.md`) | Live (Template → Characters → Types) |
| **Character and item templates** | The display templates: how characters (cards, sheets) and items (their sheet) look | When a Saga is made; then the DM's (Saga → Template → Characters / Items → Display templates) |
| **Starting groups** | The character groups a new Saga starts with (DnD Lite: Player Party, Enemy); an export takes the Saga's groups, without their characters | When a Saga is made; then the DM's (Characters → Groups) |
| **Actors Scene tabs** | The tabs a new Actors Scene starts with: names, layouts, which has turns (not the layouts' settings) | Each new Actors Scene |
| **Dice rolls** | The roll types a new Dice roller starts with: name, dice, how they're read, modifier (none: d4 to d100) | Each new Dice roller |
| **Turn order** | The character number turns follow (DnD Lite: initiative) | Each new Actors Scene |
| **Fog presets** | How map Sets draw the fog (see `locations.md`) | When a Saga is made; then the DM's (Locations → Fog presets) |
| **EFX environments** (plan 41) | Skies, landscapes, weather for Stages (see `efx.md`), without uploaded pictures | When a Saga is made; then the DM's (EFX) |
| **Stages** (plan 41) | The Stages, each with its layout, environment, controls and Sets: each Set's place, layer, toolbars, who sees it and settings, with nothing put on it | When a Saga is made; then the DM's (Stages) |

Kept small on purpose: what a system or a narrative style needs, nothing a DM would tune every session.

**Every Saga has its own copy**, made when the Saga is (plan 41): changes on the **Template** page (DM only) apply to
the Saga at once, and a built-in template changing never changes a Saga that exists. (Before plan 41 a Saga read its
built-in file until its first change; the migration gave those Sagas a copy of DnD Lite 0.4.0, kept in
`rulesets/archive/`.)

A Saga is its settings (Saga → Settings, members), its template and its content. A template file holds the template
and what the Saga set up to play (the parts applied "when a Saga is made" above: the "extras", `services/
template_extras.py`), never the content: characters, items, documents, locations, relationships, events, pictures,
what was put on Sets (cards, Desktop pieces, map tokens, rolls), turns, the live Stage. Settings that point to the
Saga's own things go by name (member groups: the default ones by key; display templates, fog presets, environments).
Each Set type says which of its settings go (`SetType.template_settings`; `template_config` turns ids into names,
`config_from_template` back, checking each setting as the DM's change: a bad one stays at its default).

### The Template page

The **Template** section of the **Saga** page (DM), next to Members.

- One tab per kind (**Characters**, **Items**, **Documents**, **Locations**, **Events**), then **Groups**,
  **Archetypes**, **Actions** and **Starting content**.
- Every kind has sub-tabs (plan 38): **Variables** and **Types**; **Characters** and **Items** also **Display
  templates** (the kind's defaults, one per type, and catalog; a tab of its own in plan 34). Item types were called
  "item categories" until plan 39; character categories were merged into the types in plan 40. **Types**: the list
  on the left, the type picked on the right with room for each field: name, plural, what can happen to one in events,
  delete while unused (never the last); character types also **player characters** and **new ones instanceable**.
  The Characters page's **Types** button opens the character types. Their own variables stay in Variables, where
  they're only picked.
- A kind's **Variables** (plan 38): on top, **whose variables**: *every …* (the shared ones) or one of its types
  (item types, character types...); below, that one list (＋ add; for a type, also who sees each shared variable
  for it) and, on the right, the variable being edited. Types are added, named and deleted in the kind's **Types**
  sub-tab. Which display template a type uses is set in Display templates only.
- A **variable**: name, **who sees it** and **who edits it** (the DM always; players, viewers, and for characters
  "its players", the controllers), its starting value, a choice's options, its order. Lists sort by any number,
  counter or calculated variable (plan 38): there's no "sortable" flag to set any more.
  New variables are text, long text, number, yes/no, choice or counter; the key (how values are stored) is made
  from the name and never changes, nor does the type. A counter's starting value has a **min** (0 unless set) and a
  **max** (plan 40): its current value always stays between them (see "Attribute types").
- Deleting a variable keeps the values already saved (hidden; they come back if a variable with the key returns).
  The app's own variables (a name, a character's players, a location's "part of") can't be deleted. A type can't
  be deleted while resources use it.
- **Groups** (a tab): the variables every group of characters has (`group_attributes`: a party's shared gold...),
  edited like a kind's shared variables; groups have no types, and since groups are the DM's, who sees and edits them
  isn't asked (players and viewers see, admins edit, kept for later). DnD Lite has *Shared gold* (a number). Each
  group's values are set in its editor (Characters → Groups; see `characters.md`).
- **Starting content**: Actors Scene tabs, turn order, dice rolls; and **Goes with an export**: links to what the Saga
  set up (its Stages, EFX environments, character groups, display templates, fog presets), with their counts. The
  starting groups are no longer a list of their own (plan 41): an export takes the Saga's groups.

### Export and import

A Saga template is a JSON file (`"format": "sagacraft.saga_template"`), to keep and share:

- **Export** (Template page): the Saga's template, plus its display templates (and which type each is the default
  for), fog presets, EFX environments, Stages and character groups (as its starting groups).
- **A new Saga from a file**: a system admin picks a built-in template or uploads a file when creating a Saga.
  The Saga starts with everything in it.
- **Import into a Saga** (Template page): the file's variables and types replace the Saga's; its display templates,
  fog presets, EFX environments, Stages and character groups are added where the Saga has none with the same name. Refused when the file lacks a type the Saga's
  resources use. A file from before plan 40 has its categories turned into character types first (the first of each
  type keeps the type's key; `for_categories` become `for_types`).

```json
{
  "format": "sagacraft.saga_template", "format_version": 1,
  "key": "dnd_lite", "name": "DnD Lite", "version": "0.5.0", "description": "...",
  "kinds": {"character": {"attributes": [...], "types": {"pc": {"name": "Player", "plural": "Players", "player": true, ...},
                                                        "npc": {"name": "NPC", "instanceable": true, ...}}},
            "item": {...}, ...},
  "starting": {
    "groups": [{"name": "Player Party", "player_party": true, "active": true, "favorite": true, "color": "#6cc9e0"}],
    "turn_order": "initiative",
    "actors_tabs": [{"name": "Combat", "layout": "bar", "turns": true}]
  },
  "display_templates": [{"name": "Player character", "kind": "character", "config": {...}, "for_types": ["pc"]}],
  "fog_presets": [{"name": "White mist", "look": {...}}],
  "environments": [{"name": "Dark Night", "far": {"effects": [...]}, "near": {...}, "fore": {...}}],
  "stages": [{"name": "Encounter", "layout": "interface", "environment": "Dark Night", "controls": null, "sets": [
    {"type": "actors_scene", "name": "Actors Scene", "x": 0, "y": 1290, "width": 1000, "height": 520, "layer": 3,
     "transparent": true, "off": false, "screen": {...}, "toolbars": {"turns": {...}}, "visibility": {"groups": ["players"]},
     "config": {"templates": {"npc": "NPC"}, "active_tab": 1, "tabs": [{"id": 1, "name": "Exploration", "shape": "bar", ...}]}}]}]
}
```

### Actions

The Saga template defines **actions** (`actions`): rules that spend some values and give others, run in one click
(a short rest spends a hit die and gives back HP; a party's long rest eats a ration and runs every member's long
rest). They're light tracking: the table still plays (see `../vision.md`); an amount can roll dice, but the table
keeps its own rolls for everything else.

- **On** characters, items or groups (characters and items: optionally only some types), and **who runs it**:
  *its players* (a character's players in control; an item's owner's; a group's characters'), *its party's players*,
  *any player*, *only the DM*. The DM can always run an action; viewers never.
- **Notify** (plan 34): who is told it ran. *Who ran it* (the default: they see the result; the DM is told too),
  *Only the DM* (a secret: a player who runs it learns only that it went to the DM), *Everyone*. The others get a
  **notice** (bottom right, 10 s): "Ana ran Second Wind on Thorin", with the changes and rolls each may see.
- **Costs**: where from, a variable, an amount; *spent* (else only checked) and *needed* (not enough: it doesn't
  run; not needed: it takes what there is, never under 0, a counter never under its min).
- **Changes** (plan 37; were *gains*): where to, a variable, what it does (**Add**: a counter never passes its
  maximum; **Remove**: never below 0, a counter never below its min; **Set to**: a counter between its min and its
  maximum) and an amount. Actions written with
  gains (older templates and files) read as changes that add.
- An **amount** is **Fixed** (a number), **Max** (adding to a counter fills it; setting it: its maximum) or a **Formula** (plan 33): the
  calculated variables' language plus **dice**: `2d6`, `d20`, `level d20` (a d20 per level), e.g. "level d20 + int".
  Its variables are the thing the line is on (a cost's source, a change's target); it's never below 0; the server rolls
  each time the action runs, and the result lists the rolls (the DM all; a player those on their characters, their
  items and groups). With Saga → Settings → Actions on (the default; plan 37), the dice are also thrown on the live
  Stage's dice roller, in the dice of the character's player (`stages.md`, "Dice roller"); a secret action's never are.
- **Then** (triggers): another action, on itself, its party, or each of a group's characters, optionally without
  its costs, changes or own triggers.

Where values come from or go: on a character, *itself* or *its party*; on an item, *itself*, *its owner* (the
character holding it) or *its owner's party*; on a group, *itself* or *each of its characters* (an instanceable
character: each of its **instances** that came with the group, on any Stage, their own values changing; with none,
the character itself; plan 37). A character's
**party** is the active player party it's in, else its first player party, else its first group. Values are numbers
and counters (a counter's current value); group values are the group variables.

Running an action is one change: everything, or nothing (a needed cost short: refused, saying what's missing).
A loop (an action triggering itself on the same thing) stops; chains go at most 8 deep. The result lists the
changes the member may see. They run from the character and item editors' **Actions** tab, the group editor or a
group card, a character sheet's **Actions** (an instance's sheet has none: actions change the character), and the
Stage's **Action control** (the DM's Set bar; players' live Stage: see `stages.md`).

**Template › Actions** is a page of action cards, filtered (search, what it's on, a type, who runs it); ＋ New action
names one; a card opens its window: **Settings** (name, description, types, who runs it) and **Mechanics** (costs,
changes, then; amounts with the formula builder: dice, the thing's variables, operators).
**World actions** (a day passes, a season turns) are later. See `../implementation/30-actions-and-calculated-variables.md`.

### Archetypes

What a character is besides its type: a race, a class, a talent... (plan 33). The Saga template names the
**categories** (`archetype_categories`: Race, Class, Talent) and the **archetypes** (`archetypes`), each in a
category, with **levels** (1 to 30; 1: no number shown) and **variables, each coming at a level** (text, long text,
numbers, yes/no, choices, counters). A character with "Warrior 4" has the Warrior's variables of levels 1 to 4. They
are character variables (one key across the types and archetypes): actions, formulas and display templates use them.
A character's archetypes are listed on it (`[{key, level}]`); the server works out a character's variables from its
type and its archetypes (`Ruleset.def_for`). See `characters.md` and `../implementation/33-improvements.md`.

A variable may **change at later levels** of its archetype: it lists only the levels where it changes and its value
there (`by_level`; a counter: its max). A Battle Master's superiority dice are one counter: 4 at level 3, 5 at 7, 6
at 15. When a character's archetype level crosses a change, the server sets the new value (a counter's current moves
with its max: what was spent stays spent); between changes, the DM's own edits stay. Template › Archetypes shows it
all in each archetype's **Progression** table (levels × variables).

### Parked: archetype actions, cues, conditions

Ideas from 2026-11-24, shaped but **not built**. Cues and conditions move SagaCraft toward running the rules by
itself, which the vision keeps out ("Light, not complete": the app tracks, the table plays), and the app already
covers what it sets out to. They wait until play at the table shows they're needed. What's decided keeps the door
open, so nothing built now should rule them out:

- **Actions that come with archetypes** (RUL-28). The one piece that isn't automation: it only says which actions
  a character has. Actions stay in Template › Actions: one editor, and an action can come with several archetypes
  (Extra Attack with Fighter, Paladin and Ranger). An archetype lists the actions it gives and the level each comes
  at; a character's actions are its type's plus its archetypes' up to their levels, as `def_for` does for
  variables. The archetype's window gets an **Actions** tab, its Progression table shows them, an action's window
  says "Comes with Fighter 2". Actions don't change by level: their formulas read variables that do. Dice sides
  could come from a variable for that ("1 d superiority_die": d8, d10 from level 10, d12 from 18).
- **Cues: when an action runs** (RUL-29). Today every action runs by hand; one could also run on a **cue** (the
  theatre's word, like Stage, Set and Actors; "moment" is the Lore's and "trigger" the chained actions'):
  - the turn controls' cues (the Actors Scene's Start, Next, End): combat start, round start, turn start, turn end,
    combat end;
  - cues the Saga template names and the DM gives (Short rest, Long rest, Dawn): this may answer the open "world
    actions" question;
  - on whom: turn start and end, the character whose turn it is; round and combat cues, each one in the fight that
    has the action; the DM's cues, the party or whoever the DM picks;
  - it runs by itself and says so (a log on the turn bar: "Turn start: Thorin regains 1 ki"); a needed cost short
    skips it, saying why; a cue never runs twice (Previous then Next doesn't repeat a turn's start);
  - first: actions on NPC instances (today an instance's sheet has none: they'd change the character, not the
    instance), and the chained actions' `triggers` renamed `then`, so "trigger" isn't two things;
  - still open: actions that ask first (a player's choice) and whom they ask; who sees the log.
- **Conditions** (RUL-30; Poisoned, Blessed, Stunned): a **temporary archetype**. Put on and taken off in play (by
  the DM, or by an action's line "applies Poisoned"), it gives variables and actions while on, reacts to cues ("turn
  start: 1d6 poison") and lasts a number of rounds or turns (counted by cues) or until taken off. Built on the two
  above. Out of it, as out of the app: advantage and disadvantage, saves worked out by the app, anything that decides
  for the table.

## Attributes

An **attribute** is a piece of data on a resource type. Each attribute has:

- a **key** and a display **name**,
- an **attribute type** (what shape of data it holds),
- **visibility rules**: which groups see it by default,
- **edit rules**: which groups can change it,
- optional defaults, limits and display hints (where it shows on the resource's page, how big, etc.).

### Attribute types are structures

Under the hood, every attribute is a **structure** built from basic blocks, so ruleset authors have
freedom to build their own. The app ships common building blocks:

| Block | Holds | Example |
|-------|-------|---------|
| `text` / `rich_text` | Text | Name, description |
| `number` | A number, with optional min/max | Armor class |
| `boolean` | Yes/no | Inspired |
| `choice` | One or many values from a list | Alignment, conditions |
| `counter` | `current` + `max`, optional `min` (0 unless set; plan 40); `current` is always kept between them (a value past one is saved as it) | HP |
| `resource_ref` | A link to a resource of a given kind/type | Current location |
| `member_ref` | A link to Saga members | Players in control |
| `list` | A list of any block | Inventory = list of `resource_ref` to Items |
| `image` | A picture (with its face crop); `many`: a gallery | Portrait, icon, other pictures |
| `pages` | A document's pages, in order: each a text (title, text) or a picture (title) | A letter, a book, a handout |
| `file` | An uploaded file | A PDF handout |
| `struct` | Named fields made of other blocks | A custom "Spell slots" structure |
| `calculated` | A value worked out, never typed (see below) | Weight carried |

**Pictures** (`image`): a picture with its face crop. An image attribute names its **upload category**
(`category`: character, icon, item, document, map), which sets its size limits; `many: true` makes it a
**gallery** (several pictures, at most the category's "pictures each" limit). An image of category `icon` is
the resource's icon (small and round: lists, pickers, maps); the first other single image is its main picture.

Ruleset authors can define **named structures** (e.g. `pool` = {current, max, temp}) and reuse them
across attributes and types.

**Calculated variables** (`calculated`, with its `calc`) are worked out by the server whenever it sends the
thing (lists, cards, sheets), never typed or saved: a **total, count, lowest, highest or average** of a variable over
a list (a character's **inventory** or **groups**, an item's **owner**, a group's **characters**; each optionally
multiplied by another variable, like a quantity), or a **formula** of the thing's own numbers and counters
(`strength * 15`; + - * /, brackets, min, max, floor, ceil, round). On cards they show like numbers.

### Visibility and edit rules per attribute

Each attribute declares who sees and edits it, using groups:

- Saga default groups: `admins`, `players`, `viewers`.
- Contextual groups: `controllers` (the members in control of *this* resource, e.g. the PC's player).
- Saga custom groups: a Saga admin can extend the rules with their own groups.

Example: an NPC's HP might be visible to `admins` only, while a PC's HP is visible to everyone and
editable by `admins` and `controllers`. The ruleset sets the **defaults**; a Saga admin can override
them per Saga or per resource (later), and still has the resource-level visibility from
`sagas-and-access.md` (a resource hidden from players hides all its attributes).

## References

References are attributes that point to other resources (`resource_ref`, `list` of refs) or to
members (`member_ref`). They are **structural**: the ruleset needs them to work. Examples:

- Location → parent Location ("part of"): the hierarchy that builds the **world map**. The attribute is marked
  `parent: true` (a single `resource_ref` to the same kind, with `of.kind`); the app shows "places inside",
  "top level only", and refuses a location inside itself. See `locations.md`.
- Character → inventory: a list of Items.
- Character → players in control: members.
- Document → about: any resources it describes.

References are different from **relationships** (`relationships.md`), which users add freely and which
carry a creator mark and an optional date. Both let the app link lore together (open a character, see
their items, their location, the documents about them, who they killed).

## Reference ruleset: DnD Lite

For development we use **DnD Lite**: our own light take on D&D 5e (2014 rules). It keeps only what
helps at the table, consistent with the UX directive (`ux.md`). It is defined step by step as we go.

### Characters (agreed)

Types (0.5.0, plan 41): **Player** (`pc`, player characters), **DM** (`dm`) and **NPC** (`npc`, new ones instanceable; its level hidden from players). Until 0.4.0: Player, Major NPC (`npc`) and Minor NPC (`minor_npc`).

Shared attributes (on Character, inherited by every type):

| Attribute | Type | Notes |
|-----------|------|-------|
| Name | `text` | |
| Level | `number` | |
| HP | `counter` (current, min 0, max) | Players see a Player's and a DM type's |
| Initiative Mod (`initiative`) | `number`: the modifier | The turn order a new Actors Scene starts with |
| Initiative Rolled | `number` | Set by **Roll Initiative** (Initiative Mod + 1d20); the Encounter's Combat tab orders by it |
| Weight carried | `calculated` | The inventory's weight |
| Players in control | `member_ref` (list) | Defines the `controllers` group for this character |
| Inventory | `list` of `resource_ref` → Item | |

Pictures: **Picture** (`image`, the main picture: cards and sheets), **Icon** (`image`, category `icon`) and
**Other pictures** (`image`, `many`: a gallery; one can become the main picture).

Actions (0.5.0): **Long rest** (a character: HP to its max; a group: each of its characters'), **Roll Initiative** (a
character: Initiative Rolled = Initiative Mod + 1d20; a group: each of its characters'). Groups have **Shared gold**.
Archetype categories: Class, Race, Talent (no archetypes yet). It also starts a Saga with two Stages (Exploration: map,
dice roller, Desktop; Encounter: the Dark Night environment, an Actors Scene, dice roller, Desktop), two EFX
environments (Abstract Cave, Dark Night) and the groups Player Party and Enemy. (0.4.0 had Hit dice, Short rest, a
party's Long rest using Rations, no Stages.)

### Locations (agreed)

Type: `Location`. Attributes: **Name**, **Icon** (`image`, category `icon`), **Part of** (`resource_ref` to a
Location, `parent: true`), **Description** (`rich_text`). The map (pictures, grid, fog, links, paths) is not an
attribute: it is the location's map, kept by the app (see `locations.md`).

### Items (agreed)

Shared variables: **Name**, **Icon** (shown wherever the item is linked), **Picture** (when it's looked at in
detail), **Other pictures**, **Rarity** (choice: Common to Legendary), **Value** (text: "15 gp"), **Weight**
(number), **Description**. Item types and their own variables:

| Type | Own variables |
|----------|---------------|
| Weapon | Damage (text: "1d8 slashing"), Properties (text) |
| Armor | Armor class (number), Stealth disadvantage (yes/no) |
| Consumable | Uses (counter) |
| Gear, Treasure | (none) |

A character's **Inventory** lists items (an item is one thing: the same longsword in two inventories is the same
resource; quantities and per-owner copies are an open point).

An item with a **counter** (DnD Lite: a consumable's Uses) can be **used** from a character's inventory: one less,
for the DM and whoever may change that inventory (its template rule).

### Documents (agreed)

Type: `Document`. Variables: **Title**, **Icon**, **Pages** (`pages`). The DM writes pages of text or adds
pictures (upload category "document"; its "pictures each" limit is the picture pages per document), reorders and
deletes them; members read the documents shared with them, page by page.

Documents live in the **Lore** tab, with Events and Relationships.

Documents are filed in **folders** (see "Folders" below).

### Folders (agreed)

**Documents, items and locations** are filed in folders (one level, no sub-folders; characters have types and
groups, events types and eras). Their lists show *All* (grouped under folder headings), each folder, and *Not in a
folder*. The DM makes folders, files a resource by dragging its card onto a folder or with the folder picker on its
page, and sets each folder up with its **⚙**: its name, **who can see** what's in it, and Delete (its resources stay,
out of any folder, with their own who can see).

- **Who can see** of a folder: **Inherit** (the default: each resource keeps its own) or a choice that **overrides**
  its resources' (an eye marks such a folder for the DM). "Owner" there shows each resource to its own owners (a
  "Journals" folder). A resource's own choice is kept underneath and applies again when it leaves the folder; its form
  says "Set by the folder …" meanwhile.
- Members see a folder when its own who can see shows it to them, or when it holds something they see (counting only
  those). Folders are Saga content: they don't go in a template export.

### Owners (agreed)

A resource's **owners** are members: a character's are its **Players in control** (the controllers variable); any
other resource has an **Owner** field the DM sets. "Owner" is a choice in who can see (and a character's who can
edit): the resource's owners.

### Licensing

DnD Lite uses generic game concepts (HP, initiative, inventory). If we ever bundle rules text or content
(spells, monsters), it must come from the **SRD 5.1**, released under **CC-BY-4.0**, with its attribution
notice. Never copy non-SRD text from published books into the repo. DMs can add their own content in
their Sagas.

## Roadmap toward an editor

The ruleset editor is a project goal. Steps:

1. **v1**: rulesets are data files (JSON) with a schema; DnD Lite is the only built-in one. The app
   validates them on load and builds resource pages and forms from them. **Done.**
2. Import/export Saga template files; a new Saga from a file. **Done.**
3. Extension: a homebrew ruleset builds on a base one (add/override types and attributes).
4. In-app editor with validation and a live preview of resource pages. **Started**: the Template page edits
   variables (calculated ones too), types, who sees what, actions and starting content (no previews yet; no
   structures).
5. Sharing rulesets between users; versioning, with Sagas pinned to a version.

The v1 format must already be what the editor will produce later, so step 1 doesn't create a dead end.

## Open points

- Are resource kinds fixed by the app (Document, Character, Location, Item, Event), or can a ruleset add new
  kinds (Faction, Quest)? Or is "kind" just a top-level type with app-known behaviors?
- Can a type have more than one level of subtypes (Character → NPC → Monster)?
- Can a subtype override more than an inherited attribute's view/edit rules (v1 allows only those two)?
- Can the Saga admin add attributes to a single resource (free-form notes, custom fields) outside the ruleset?
- Initiative: just a number, or a structure (modifier + current roll + order)?
- Formula language for derived values (later).
- Can a Saga switch ruleset (or version) after creation, and how is data migrated?
- How compendium content (spells, monsters, items) fits: as pre-made resources shipped with the ruleset?

See `../open_questions.md`.
