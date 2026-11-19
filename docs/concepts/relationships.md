# Relationships

A **relationship** links two resources with a meaning: who killed whom, who is whose brother, who
lives where. Relationships are how the Saga's lore becomes a web the group can explore.

Relationships are **not part of the ruleset**. The DM and players create them freely, between any
two resources, during prep or play.

## Examples

```
Character A  --killed-->   Character B     (directed)
Character B  --brother--   Character C     (undirected, always)
Character A  --lives in--> Location A      (directed, from year 295 to year 301)
Item X       --forged in-> Location B      (directed)
```

## Relationships belong to groups

Every relationship belongs to **one group** of the Saga (see `sagas-and-access.md`). A group's
relationships are **what that group knows** (or believes).

- A member sees the relationships of the groups they are in. Players only ever see relationships of
  their own groups.
- **Players add, edit and remove relationships in their own groups.** When a player is in several
  groups (e.g. `players` and "Party A"), they choose the group when creating (default: the last used).
- **Admins** see and manage the relationships of every group. The DM's own relationships (the truth
  of the Saga) live in the `admins` group.
- **Revealing** a fact to players = adding the relationship to their group. (The DM can do it from
  the admin relationship in one action.)

This replaces the generic visibility list for relationships: a relationship's visibility *is* its group.

## Model

| Field | Notes |
|-------|-------|
| **From / to** | Two resources of any kind (Document, Character, Location, Item, Event). |
| **Type** | From the group's list of relationship types. Defines the label and direction. |
| **Group** | The group it belongs to (see above). |
| **Created by** | The member who created it and their role at that time (**admin** or **player**). Always recorded, shown as a mark. |
| **Start date** | In-world date when it began, or **always**. Setting a date links it to an Event (see `events.md`). |
| **End date** | In-world date when it ended, or **always** (never ends). |
| **Created at** | Real-world timestamp, automatic. |
| **Note** | Optional short text ("with a poisoned dagger"). |

"Always" on both ends means the relationship is timeless (e.g. brothers): the timeline slider never
hides it. Relationships only link two resources; a fact involving more (a pact of three) is an Event.

### Relationship types

- The app ships a **predefined list** to help (e.g. killed, brother/sister of, parent of, married to,
  ally of, enemy of, member of, lives in, born in, owns, created, knows, serves, loves, hates, located in).
- Each **group has its own list** on top of the predefined one. **Players add, edit and remove types in
  their own groups**; admins can manage any group's list.
- A type has:
  - a label (`killed`),
  - a direction: **directed** or **undirected**,
  - for directed types, an optional inverse label shown from the other side (`killed` / `killed by`),
  - optionally, the resource kinds it usually connects (`lives in`: Character → Location), used only
    to rank suggestions, never to block.

### Relationships vs. references

Rulesets still have **reference attributes** (`resource_ref`, `member_ref`): structural data the
ruleset needs, like a Character's inventory or a Location's parent. Relationships are the free,
narrative links users add on top. The graph viewer can show references as edges too (see open points).

## Creating relationships: UX is the key

Adding a relationship must take seconds, from wherever the user is:

- **From a resource page**: "+ relationship" → type (autocomplete, recent types first) → target
  (autocomplete across all visible resources) → done. Group, dates and note are optional (defaults:
  last used group, "always" for both dates).
- **From the graph**: drag from one node to another, pick the type.
- **From an event**: add a sub-event "A killed B" and the relationship is created (see `events.md`).
- **Quick text** (later): type `A killed B` and the app parses it. The same command can later come from
  voice or AI (see `ux.md`).
- Missing target? Create the resource on the fly (just a name and kind), fill in details later.
- Undo instead of confirmations.

## Graph viewer

A tool to explore relationships as a graph. It exists as a **screen** anyone can open, and as a
**Set type** the DM can put on a Stage to show it to the players.

The **backend builds the graph on demand** from a query and returns nodes and edges, already filtered
to what the viewer may see. The **frontend renders** it (layout, zoom, select, drag).

### Queries

- **Which groups**: the relationship sets to include (the viewer's own groups; admins can pick any).
- **All connections between people**: every Character and the relationships among them.
- **Connections within a chosen set** of resources (e.g. these four NPCs), with an option for **how many
  external hops** to include (0 = only links among them, 1 = also their direct neighbours, ...).
- Around one resource: everything up to N hops away.
- Filters: resource kinds/types, relationship types, **created by** (admins, players, a given member),
  and **date** (only relationships active at that in-world date, using start/end; see `events.md`).

### "What did the players get right?"

Because relationships belong to groups, the DM can compare a players' group with the `admins` group
(the truth):

- relationships in the group that **match** an admin relationship (same resources, same type),
- the ones that **don't match** (wrong guesses or theories),
- admin relationships the group **doesn't have yet**.

The DM can show the players what they got right, e.g. by putting that graph on a Stage.

## Open points

- Matching rule for "got it right": same endpoints + same type label only, or also inverse/synonym types?
  Groups have their own type lists, so labels may differ.
- Revealing: is a revealed relationship a **copy** in the players' group (the group can then edit it
  freely), or a **link** to the admin one (stays in sync)? Copy fits "each group's knowledge".
- Should ruleset references (inventory, parent location, controllers) appear as edges in the graph?
- Can a player move a relationship from one of their groups to another?
- Does setting an end date also create an event ("the alliance ended")?
- Is the old manual "relationship map" Set (DM places nodes by hand) still needed, or does the graph
  Set with a saved query and saved layout cover it?
