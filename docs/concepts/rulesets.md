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
| **Document** | Text page, image, PDF, letter, handout | Mentions other resources; attached to any resource |
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

A ruleset is one part of a **Saga template**: what a new Saga starts from. The Saga template adds the
Saga's starting **categories** and **groups** (DnD Lite: categories Player, Major NPC and Minor NPC; the
group "Player Party"). Each category gets its own built-in display template, made from its type. v1 keeps
them in the ruleset file, under `saga_template`:

```json
"saga_template": {
  "name": "DnD Lite",
  "categories": [
    {"key": "player", "name": "Player", "plural": "Players", "type": "pc", "player": true, "instanceable": false},
    {"key": "major_npc", "name": "Major NPC", "plural": "Major NPCs", "type": "npc", "player": false, "instanceable": false},
    {"key": "minor_npc", "name": "Minor NPC", "plural": "Minor NPCs", "type": "npc", "player": false, "instanceable": true}
  ],
  "groups": [{"name": "Player Party", "player_party": true, "active": true, "favorite": true, "color": "#6cc9e0"}]
}
```

Later, Saga templates may become their own files (several templates on one ruleset, with starting lore).

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
| `file` | An uploaded file | A PDF handout |
| `struct` | Named fields made of other blocks | A custom "Spell slots" structure |

**Pictures** (`image`): a picture with its face crop. An image attribute names its **upload category**
(`category`: character, icon, item, document, map), which sets its size limits; `many: true` makes it a
**gallery** (several pictures, at most the category's "pictures each" limit). An image of category `icon` is
the resource's icon (small and round: lists, pickers, maps); the first other single image is its main picture.

Ruleset authors can define **named structures** (e.g. `pool` = {current, max, temp}) and reuse them
across attributes and types. Derived values (formulas) are a later step.

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

### Items

Type: `Item`. Attributes: Name, **Icon** (shown wherever the item is linked), **Picture** (shown when it's
looked at in detail), **Other pictures**, Description.

Still to define: type-specific attributes for PC and NPC, default visibility/edit rules per attribute,
Document types and attributes.

### Licensing

DnD Lite uses generic game concepts (HP, initiative, inventory). If we ever bundle rules text or content
(spells, monsters), it must come from the **SRD 5.1**, released under **CC-BY-4.0**, with its attribution
notice. Never copy non-SRD text from published books into the repo. DMs can add their own content in
their Sagas.

## Roadmap toward an editor

The ruleset editor is a project goal. Steps:

1. **v1**: rulesets are data files (JSON or YAML) with a schema; DnD Lite is the only one. The app
   validates them on load and builds resource pages and forms from them.
2. Import/export ruleset files; admins can upload a custom ruleset.
3. Extension: a homebrew ruleset builds on a base one (add/override types and attributes).
4. In-app editor with validation and a live preview of resource pages.
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
