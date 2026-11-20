# Glossary

Use these terms in code, UI and docs.

| Term | Meaning |
|------|---------|
| **Actor** | Something placed inside a Set: a creature on a grid, a node on a relationship graph, a pin on a map. Can link to a Saga resource. |
| **Attribute** | A piece of data on a resource type (Name, HP, Inventory...), with an attribute type and per-group visibility and edit rules. |
| **Attribute type** | The shape of an attribute's data: a structure built from blocks (text, number, counter, resource ref, member ref, list, struct...). |
| **Character** | Resource kind: PCs, NPCs, monsters. |
| **Controllers** | Contextual group: the members in control of a given resource (e.g. a PC's player). |
| **Counter** | Attribute block with `current` and `max` (e.g. HP). |
| **Default groups** | `admins`, `players`, `viewers`: exist in every Saga; each member is in the one matching their role. |
| **DnD Lite** | Our light take on D&D 5e (2014): the reference ruleset during development. |
| **Document** | Resource kind: text pages, images, PDFs, handouts. |
| **DM** | Dungeon Master / Game Master. In the app, the DM is a Saga member with the **admin** role. |
| **Build view** | The DM building a Stage: Sets on the canvas, settings of the selected thing in a side panel. |
| **Calendar** | The date system of a Saga: real (Gregorian) or fantasy (custom months, week days, eras). |
| **Created by (mark)** | The member and role (admin or player) that created a relationship or event. |
| **Era** | A named in-world period with a start and end date ("The Long War"). Shown as a band on the timeline. |
| **Event** | Resource kind: something that happened at one exact in-world date, with resources and sub-events. |
| **Graph query** | A request the backend turns into a relationship graph (e.g. a set of resources + N hops). |
| **Grab attention** | Admin action that centers members' Stage view on a chosen point/area and brings them to the Stage tab. |
| **Group** | A set of Saga members, used as a target of visibility (and later permission) settings. Default or custom. |
| **Item** | Resource kind: equipment, treasure, keys... Can sit in a Character's inventory. |
| **Kind** | Top-level category of resource known by the app: Document, Character, Location, Item, Event. |
| **Layer** | A Set's z-order on its Stage. |
| **Display template** | How a kind's resources (characters) are displayed in each display mode (cards: face, full, none; sheets: immersive, informative), for players and for the DM. Each type has a default; a Set may pick another. |
| **Hover tray** | The panel that opens under a creature card on hover, with the values set to "hover". |
| **Live Stage** | The single Stage currently shown to the Saga's members. |
| **Location** | Resource kind: places. Locations contain other Locations, building the world map. |
| **Lore** | The Saga's resources as a whole: what the DM keeps and reveals. |
| **Member** | A user who belongs to a Saga, with one role: admin, player or viewer. |
| **Permission** | A named right granted to a system admin (e.g. `sagas.create`). Later also per group inside a Saga. |
| **Play view** | The DM using a Stage at the table: what players see, plus popups to act (change values, arrange, highlight). |
| **Player view / DM view** | The two views of a display template, with the same options: what players see and what the DM sees, per value (where it shows, its style). |
| **Sheet** | The modal that opens when you click a character: immersive or informative, laid out by its display template. |
| **PC / NPC** | DnD Lite Character types: player character / non-player character. |
| **Player** | Saga role: plays a character and sees what was shared with them. |
| **Reference** | A structural link defined by the ruleset as an attribute (inventory, parent location, players in control). |
| **Relationship** | A user-created, typed link between two resources ("A killed B"). Belongs to one group (its visibility), has a creator mark and start/end dates (or "always"). Not part of the ruleset. |
| **Relationship type** | Label and direction of a relationship (directed with optional inverse label, or undirected). Predefined list + each group's own types. |
| **Resource** | Anything in a Saga described by the ruleset: a Document, Character, Location, Item or Event. (Not a counter: HP is an attribute.) |
| **Resource type / subtype** | A ruleset-defined type under a kind (Character → PC, NPC). Subtypes inherit their parent's attributes. |
| **Root system admin** | The first system admin, created at instance setup. |
| **Ruleset** | Data definition of a game system: resource types and subtypes, their attributes, visibility/edit rules and relationships. |
| **Saga** | The main division of the system: one game world/campaign with its own members, groups, ruleset, Stages and resources. Nothing is shared between Sagas. |
| **Saga admin** | Saga role (the DM): full control of the Saga. A Saga can have several. |
| **Saga date** | A date in the Saga's calendar; the Saga also keeps a current in-world date. |
| **Set** | A component placed on a Stage (image, map, battle grid, relationship graph...), with position, size, layer and visibility. |
| **Set type** | A kind of Set, implemented as a module following the shared Set contract. |
| **Stage** | A canvas of Sets that a Saga admin prepares and can make live. |
| **Sub-event** | A part of an event (one level): a resource sub-event (Location X: discovered) or a relationship sub-event (A killed B). |
| **Sub-event type** | Something that can happen to a resource type (Location: discovered). Predefined, editable by Saga admins. |
| **Stage tab** | The tab that always shows the live Stage to players and viewers. |
| **System admin** | Manages the backend instance (Sagas, Saga admins, other system admins) through granted permissions. |
| **Timeline** | Screen showing events in date order; its slider sets the in-world moment for other views. |
| **Upload category** | Kind of picture (character, item, document, map), each with its own size and pixel limits. |
| **Viewer** | Saga role: sees the live Stage and what was shared with them; no character, no editing. |
| **Visibility** | Who can see an item: a list of groups and/or members. Default `admins` only. Applies to whole resources and to each attribute. Enforced on the server. |
