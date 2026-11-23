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
├── PC   (player character)
└── NPC
```

- A subtype **inherits** its parent's attributes and can add its own.
- Types can share attributes (defined on the parent) or have their own (defined on the subtype).
- Every resource in a Saga is of one type (e.g. "Thorin" is a PC, the Goblin is an NPC).
- Characters are also organized by **category** (Player, Major NPC, Minor NPC, or the DM's own), each based on a
  type: picking the category picks the type. Categories belong to the Saga, not to the ruleset. See
  `characters.md`.

## Saga templates

A ruleset is the core of a **Saga template**: what a Saga is built on. A Saga template holds:

| Part | What | Applies |
|------|------|---------|
| **Character variables** | The attributes every character has (HP, level...) and each character type's own (PC, NPC) | Live: the Saga's forms, sheets and Stages read them |
| **Item variables** | The attributes every item has (rarity, value, weight...) and each **item category**'s own (weapon: damage) | Live |
| **Document and location variables** | Details on documents and locations (their pages and maps are the app's) | Live |
| **Who sees what, per type** | A type can change who sees a shared variable (NPC HP hidden from players) | Live |
| **Character categories** | Player, Major NPC, Minor NPC... each based on a character type (see `characters.md`) | When a Saga is made; then the DM's (Characters tab) |
| **Character and item templates** | The display templates: how characters (cards, sheets) and items (their sheet) look | When a Saga is made; then the DM's (Characters → Display templates) |
| **Starting groups** | The character groups a new Saga starts with (DnD Lite: the Player Party) | When a Saga is made; then the DM's (Characters → Groups) |
| **Actors Scene tabs** | The tabs a new Actors Scene starts with: names, layouts, which has turns (not the layouts' settings) | Each new Actors Scene |
| **Dice rolls** | The roll types a new Dice roller starts with: name, dice, how they're read, modifier (none: d4 to d100) | Each new Dice roller |
| **Turn order** | The character number turns follow (DnD Lite: initiative) | Each new Actors Scene |
| **Fog presets** | How map Sets draw the fog (see `locations.md`) | When a Saga is made; then the DM's (Locations → Fog presets) |

Kept small on purpose: what a system or a narrative style needs, nothing a DM would tune every session.

**Every Saga has its own copy.** A Saga reads its built-in template (DnD Lite) until the DM changes something on
the **Template** page (DM only); then it keeps its own copy, and changes apply to the Saga at once.

### The Template page

The **Template** section of the **Saga** page (DM), next to Members and Display templates.

- One tab per kind (**Characters**, **Items**, **Documents**, **Locations**) and **Starting content**.
- A kind's tab: **every …** (the shared variables), its **types** (item categories, character types...) and, for
  a type, its own variables and who sees each shared variable for it; the variable being edited on the right.
- A **variable**: name, **who sees it** and **who edits it** (the DM always; players, viewers, and for characters
  "its players", the controllers), its starting value, a choice's options, whether lists sort by it, its order.
  New variables are text, long text, number, yes/no, choice or counter; the key (how values are stored) is made
  from the name and never changes, nor does the type.
- Deleting a variable keeps the values already saved (hidden; they come back if a variable with the key returns).
  The app's own variables (a name, a character's players, a location's "part of") can't be deleted. A type can't
  be deleted while resources or categories use it.
- **Groups** (a tab): the variables every group of characters has (`group_attributes`: a party's shared gold...),
  edited like a kind's shared variables; groups have no types, and since groups are the DM's, who sees and edits them
  isn't asked (players and viewers see, admins edit, kept for later). DnD Lite has *Shared gold* (a number). Each
  group's values are set in its editor (Characters → Groups; see `characters.md`).
- **Starting content**: starting groups, Actors Scene tabs, turn order, dice rolls; and links to what the Saga made its own
  (categories, display templates, fog presets), which go with an export.

### Export and import

A Saga template is a JSON file (`"format": "sagacraft.saga_template"`), to keep and share:

- **Export** (Template page): the Saga's template, plus its categories, display templates (and which category or
  item category each is the default for) and fog presets.
- **A new Saga from a file**: a system admin picks a built-in template or uploads a file when creating a Saga.
  The Saga starts with everything in it.
- **Import into a Saga** (Template page): the file's variables and types replace the Saga's; its categories,
  display templates and fog presets are added where the Saga has none with the same name. Refused when the file
  lacks a type the Saga's resources or categories use.

```json
{
  "format": "sagacraft.saga_template", "format_version": 1,
  "key": "dnd_lite", "name": "DnD Lite", "version": "0.2.0", "description": "...",
  "kinds": {"character": {"attributes": [...], "types": {"pc": {...}, "npc": {...}}}, "item": {...}, ...},
  "starting": {
    "categories": [{"key": "player", "name": "Player", "plural": "Players", "type": "pc", "player": true, "instanceable": false}],
    "groups": [{"name": "Player Party", "player_party": true, "active": true, "favorite": true, "color": "#6cc9e0"}],
    "turn_order": "initiative",
    "actors_tabs": [{"name": "Combat", "layout": "bar", "turns": true}]
  },
  "display_templates": [{"name": "Player", "kind": "character", "config": {...}, "for_categories": ["player"], "for_types": ["pc"]}],
  "fog_presets": [{"name": "White mist", "look": {...}}]
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
- **Costs**: where from, a variable, an amount; *spent* (else only checked) and *needed* (not enough: it doesn't
  run; not needed: it takes what there is, never under 0).
- **Gains**: where to, a variable, an amount, or a counter's **max**. A counter never passes its maximum.
- An **amount** is **Fixed** (a number), **Max** (a gain on a counter: fill it) or a **Formula** (plan 33): the
  calculated variables' language plus **dice**: `2d6`, `d20`, `level d20` (a d20 per level), e.g. "level d20 + int".
  Its variables are the thing the line is on (a cost's source, a gain's target); it's never below 0; the server rolls
  each time the action runs, and the result lists the rolls (the DM all; a player those on their characters, their
  items and groups).
- **Then** (triggers): another action, on itself, its party, or each of a group's characters, optionally without
  its costs, gains or own triggers.

Where values come from or go: on a character, *itself* or *its party*; on an item, *itself*, *its owner* (the
character holding it) or *its owner's party*; on a group, *itself* or *each of its characters*. A character's
**party** is the active player party it's in, else its first player party, else its first group. Values are numbers
and counters (a counter's current value); group values are the group variables.

Running an action is one change: everything, or nothing (a needed cost short: refused, saying what's missing).
A loop (an action triggering itself on the same thing) stops; chains go at most 8 deep. The result lists the
changes the member may see. They run from the character and item editors' **Actions** tab, the group editor or a
group card, a character sheet's **Actions** (an instance's sheet has none: actions change the character), and the
Stage's **Action control** (the DM's Set bar; players' live Stage: see `stages.md`).

**Template › Actions** is a page of action cards, filtered (search, what it's on, a type, who runs it); ＋ New action
names one; a card opens its window: **Settings** (name, description, types, who runs it) and **Mechanics** (costs,
gains, then; amounts with the formula builder: dice, the thing's variables, operators).
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
| `counter` | `current` + `max` (+ optional extras) | HP |
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

Types: `PC` (player character) and `NPC`.

Shared attributes (on Character, inherited by both):

| Attribute | Type | Notes |
|-----------|------|-------|
| Name | `text` | |
| HP | `counter` (current, max) | |
| Initiative | `number` (structure to refine: modifier? last roll?) | |
| Players in control | `member_ref` (list) | Defines the `controllers` group for this character |
| Inventory | `list` of `resource_ref` → Item | |

Pictures: **Picture** (`image`, the main picture: cards and sheets), **Icon** (`image`, category `icon`) and
**Other pictures** (`image`, `many`: a gallery; one can become the main picture).

### Locations (agreed)

Type: `Location`. Attributes: **Name**, **Icon** (`image`, category `icon`), **Part of** (`resource_ref` to a
Location, `parent: true`), **Description** (`rich_text`). The map (pictures, grid, fog, links, paths) is not an
attribute: it is the location's map, kept by the app (see `locations.md`).

### Items (agreed)

Shared variables: **Name**, **Icon** (shown wherever the item is linked), **Picture** (when it's looked at in
detail), **Other pictures**, **Rarity** (choice: Common to Legendary), **Value** (text: "15 gp"), **Weight**
(number), **Description**. Item categories and their own variables:

| Category | Own variables |
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

**Documents, items and locations** are filed in folders (one level, no sub-folders; characters have categories and
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
