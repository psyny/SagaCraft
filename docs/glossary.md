# Glossary

Use these terms in code, UI and docs.

| Term | Meaning |
|------|---------|
| **Active player party** | A group marked both *player party* and *active*: preselected when adding creatures to a scene. |
| **Active tab** | The Actors Scene tab the players see. The DM switches it at the table. |
| **Actor** | Something placed inside a Set: a creature on a grid, a node on a relationship graph, a pin on a map. Can link to a Saga resource. |
| **Actors Scene** | The main Set type for showing characters: cards in tabs; the scene has one cast (its creatures), each tab its own shown/hidden cards, layout, order and turns. Replaces the first version's Creature panel. Key `actors_scene`. |
| **Anchor** (Set) | In the interface layout, where a Set holds on to the screen: top-left, top, top-right, left, centre, right, bottom-left, bottom, bottom-right. |
| **Attribute** | A piece of data on a resource type (Name, HP, Inventory...), with an attribute type and per-group visibility and edit rules. |
| **Attribute type** | The shape of an attribute's data: a structure built from blocks (text, number, counter, resource ref, member ref, list, struct...). |
| **Boundary** | Actors Scene layout: player characters from the top left, the others from the top right; a neutral zone in the middle and a scatter (px). |
| **Build view** | The DM building a Stage: Sets on the canvas, settings of the selected thing in a side panel. |
| **Calendar** | The date system of a Saga: real (Gregorian) or fantasy (custom months, week days, eras). |
| **Card ratio** | 5:7, the shape of a full card and of the immersive sheet. A character picture is shown either in the card ratio or as its face crop (1:1). |
| **Cast** | The creatures of an Actors Scene: the same in every tab; each tab shows or hides each of them to players. |
| **Category** | How a Saga organizes its characters (Player, Major NPC, Minor NPC, or the DM's own). Each is based on a ruleset type; a character has exactly one. Drives the Characters tab sections and default display templates. |
| **Character** | Resource kind: PCs, NPCs, monsters. |
| **Character view** | A character in the resource view: its sheet, informative template. |
| **Composed picture** | What players get of a map: the map's pictures in one picture, made by the server for their fog (black outside the tiles they know). |
| **Controllers** | Contextual group: the members in control of a given resource (e.g. a PC's player). |
| **Counter** | Attribute block with `current` and `max` (e.g. HP). |
| **Created by (mark)** | The member and role (admin or player) that created a relationship or event. |
| **Current-turn highlight** | The frame on the creature whose turn it is, and the "Turn" tag above the card, in the card's group color (theme blue without a group; the DM's highlight is gold). |
| **Default groups** | The default **member groups** `admins`, `players`, `viewers`: exist in every Saga; each member is in the one matching their role. |
| **Display template** | How a kind's resources (characters) are displayed in each display mode (cards: face, full, none; sheets: immersive, informative), for players and for the DM. Each category has a default; a Set may pick another. |
| **DM** | Dungeon Master / Game Master. In the app, the DM is a Saga member with the **admin** role. |
| **DnD Lite** | Our light take on D&D 5e (2014): the reference ruleset during development. |
| **Document** | Resource kind: text pages, images, PDFs, handouts. |
| **Edge ring** | The unknown tiles touching a member's known or visible tiles: their picture is in the member's composed picture, and the immersive fog's soft edge is drawn there. |
| **Effect (EFX)** | One item of an environment's layer: a kind from the catalog (sky, weather…) with its settings, an intensity range and how often it changes. |
| **EFX** | Environment effects: what helps immersion on Stages (environments now; sounds later). The EFX page is the DM's. |
| **EFX Set** | A Set showing the Stage's environment: far background, near background, foreground (let clicks through), and EFX Controls (the DM's switch). |
| **Element** | One item of a display template region: a value (attribute) or a system element (Name, Category, Group), with its value style and view style. |
| **Environment (EFX)** | Three layers of effects (far background, near background, foreground) built by the DM; a Stage shows one through its EFX Sets. |
| **Era** | A named in-world period with a start and end date ("The Long War"). Colours the timeline's line. |
| **Event** | Resource kind: something that happened at one exact in-world date (maybe lasting until an end date: a period), with resources and sub-events. |
| **Fog display** | How a map Set draws the fog: flat (tile by tile), immersive (soft organic edges) or immersive animated (drifting). |
| **Fog of war** | On a location's map: per member group, each tile unknown, known (greyed) or visible. A member sees the best of their groups. |
| **Fog preset** | How map Sets draw the fog of war (display, style, colours, size, intensity, motion, edge, known tiles), built by the DM on the Locations tab; a World map picks one. Every Saga starts with "White mist". |
| **Fog style** | A fog preset's look: mist, smoke, clouds, ink, parchment, void, nebula, embers, blizzard, depths; with three colours, a size and an intensity. |
| **Active** | A character in play; an inactive one stays off Actor Sets and out of groups added to Sets. |
| **Group variable** | A variable every group of characters has (the Saga template's Groups tab), e.g. a party's shared gold; each group's value is set in its editor. |
| **Player colour** | A member's colour in a Saga (Saga → User): their characters' token borders and frames, pings, dice. |
| **Frame** | The thin gradient border of a card or sheet, in its token colour. |
| **Shown (path)** | How much of a path is drawn from its start (0–100%): progress on a route; players get only that part. |
| **Ping notice** | The top-right notice of a ping (who pinged); clicking it centres the map on the tile. |
| **Fold (controls)** | Folding a Set's toolbars on the Stage away (the DM, from the Set bar); per Set and per browser. |
| **Set bar** | The DM's bar across the top of a Stage: a button per Set (its icon); the open one's menu row holds its eye, ⚙, fold and main options. |
| **Row (dice)** | One roll on a Dice roller: its roller's results across the roll types; it stays until its roller (or the DM) clears it. |
| **Token** | A character on a map: its icon in a border of its player's colour, drawn by its display template's *Token* mode (border style, values on it and in hover trays). |
| **Combo tray** | The picker for "several things together" (who can see, who can edit, members, groups): a button saying the pick opens a tray in sections. `components/ComboTray.tsx`. |
| **Owner** | A resource's owners: a character's Players in control, else the DM's Owner field. "Owner" in who can see / who can edit means them. |
| **Who can edit** | A character's list of who changes what the Saga template opens to "its players" (Owner by default). In code `Resource.editors`. |
| **Timeline Set** | A Set type showing the Saga's timeline (the knowledge of the groups the DM picks). |
| **Folder** | Where the DM files documents, items and locations (one level, no sub-folders). Its who can see is Inherit (each keeps its own) or overrides its resources'. Members see a folder when it's shown to them or holds something they see. In code `ResourceFolder`. |
| **Gallery** | An image attribute with several pictures (`many`): a character's other pictures. |
| **Grab attention** | Admin action that centers members' Stage view on a chosen point/area and brings them to the Stage tab. |
| **Graph query** | A request the backend turns into a relationship graph (e.g. a set of resources + N hops). |
| **Group** | A set of **characters** that go together (sometimes a **party**): the party, an encounter's enemies. Has a name, *player party*, *active* and *favorite* flags, and creatures (instanceable ones with a count). Managed under Characters → Groups; DM only. In code `CharacterGroup`. Not to be confused with **member groups**. |
| **Group action** | (Later) An action of the Saga template that a group takes (a long rest: use supplies, recover HP). |
| **Group color** | Each group's color: its cards' current-turn highlight and Turn tag, and elements colored "group". |
| **Header** | The informative sheet's region next to the face (at most 4 elements). Formerly "highlight". |
| **Highlight zone** | Tiles a map Set highlights: everything else darkens, the tiles get a splined border. |
| **Hover tray** | A panel that opens beside (left, right) or under a creature card on hover, with its hover regions' elements. |
| **Icon** | A resource's small round picture (lists, pickers, map tiles); an upload category of its own. |
| **Initiative flow** | How a layout follows turns: **static** (cards stay, the current one is highlighted) or **rotate** (the current creature is always first / on top). |
| **Instance** | An Actor made from an instanceable character, with its own current values and a number ("Goblin 2"). Changing it doesn't change the character. |
| **Instanceable** | A character parameter: when true, each time it's added to a Set an instance is created. Player characters never are. |
| **Intensity range** | An EFX effect's low and high intensity: every N seconds ("changes every") it eases to a new value between them. |
| **Interface layout** | A Stage layout where Sets are fixed to the screen: each anchored (a corner, an edge's middle, the centre) with a width and height in % of the screen. The other layout is the **canvas** (a world to pan and zoom). |
| **Item** | Resource kind: equipment, treasure, keys... Can sit in a Character's inventory. |
| **Item category** | An item type (weapon, armor...), with its own variables; items are filtered and displayed by it. |
| **Kind** | Top-level category of resource known by the app: Document, Character, Location, Item, Event. |
| **Label** (map) | A marker on a location's map: a pin and a text, maybe shown only on click; seen by members it's shared with, on places they know. |
| **Layer** | A Set's z-order on its Stage. |
| **Link (map)** | A resource placed on a map tile, shown as a round icon; members click it to open the resource. |
| **Map (Set)** | The Set showing a location's map on a Stage: locations shown one at a time, fog, highlight, tokens, pings. Key `world_map` (the World map and Local map were merged into it). |
| **Mobile token** | A character, item, group or custom piece on a map's tile; the DM drags it; it snaps to tiles. |
| **Ping** | A member pointing at a map tile on the live Stage: it glows in their colour with their name for a few seconds. |
| **Live Stage** | The single Stage currently shown to the Saga's members. |
| **Desktop (Set)** | A Set where the DM lays pieces for the players (characters, items, documents, pictures), arranged Auto or Free. |
| **Piece** | Something on a Desktop: a character, an item, a document or a picture (an actor of the Desktop). |
| **Dice roller** | A Set with roll types, a shared tray and 3D dice rolls. |
| **Roll type** | A named roll: dice (count × sides), how they're read (sum, highest, lowest, sum above/below X) and a modifier. |
| **Dice style** | How a member's dice look (Minimalist, Ember, Metal…), always in their colour. |
| **Live link** | A secret web address (`/live/<token>`) showing the live Stage as a viewer, with no sign-in; the DM turns it on, off or makes a new one (Saga → Settings). |
| **Location** | Resource kind: places, each with a map (pictures, grid, fog, links, paths). Locations contain other Locations (part of), building the world map. See `concepts/locations.md`. |
| **Location map** | Locations → Location map: the places as a graph: links on their maps, "part of", places of the same place in one coloured region. |
| **Lore** | The Saga's resources as a whole: what the DM keeps and reveals. |
| **Lore** (tab) | Documents, Events (the timeline) and Relationships (the graph). |
| **Map** | A location's map: its pictures, grid, fog, links and paths. Not a ruleset attribute. |
| **Member** | A user who belongs to a Saga, with one role: admin, player or viewer. |
| **Member group** | A set of Saga members, used as a target of visibility (and later permission) settings. Default (`admins`, `players`, `viewers`) or custom. In code `Group`. |
| **Minimap (timeline)** | The strip under the timeline: the whole timeline, lightly drawn, with the part in view marked; click or drag it to move. |
| **Moment in the story** | A date the Lore views share: the timeline dims what comes after, the relationship graph keeps what was true then. |
| **Neutral zone** | Boundary layout: the middle of the scene (a % of its width) where no cards go. |
| **Order tray** | The Actors Scene tray to edit a tab's order: cards in order with move up/down and the sort value (initiative) editable in place. |
| **Origin** | A grid's top left corner: tiles are counted (column, row) from it, so things stay on their tiles when the grid changes. |
| **Page (document)** | One page of a document: a text (title and text) or a picture. |
| **Page body** | The informative sheet's main region; split into pages (with page controls) when it doesn't fit. |
| **Part of** | A location's parent location (the ruleset's parent attribute). Its children are its places inside, or sub-locations. |
| **Party** | Another word for a group, usually the players' (see **player party**). |
| **Path** | Tiles in order on a map (a journey, a trail), drawn as a line (poly or spline) with a body, head and tail; with its own visibility. |
| **PC / NPC** | DnD Lite Character types: player character / non-player character. |
| **Period (event)** | An event with an end date: a bar on the timeline, from its date to its end. |
| **Permission** | A named right granted to a system admin (e.g. `sagas.create`). Later also per group inside a Saga. |
| **Play view** | The DM using a Stage at the table: what players see, plus popups to act (change values, arrange, highlight). |
| **Player** | Saga role: plays a character and sees what was shared with them. |
| **Player party** | A group flag: this group is the players' party. The default group "Player Party" is one. |
| **Player view / DM view** | The two views of a display template, with the same options: what players see and what the DM sees (each region's elements and their styles). |
| **Put away (Set)** | A Set the DM hid with the eye on its toolbar: drawn for no one (players aren't sent it) until the DM brings it back. |
| **Reference** | A structural link defined by the ruleset as an attribute (inventory, parent location, players in control). |
| **Region** (display template) | A place in a display mode that holds a list of elements: cards' top, bottom and hover trays; the immersive sheet's top slots, bottom center, bottom panel and hover sides; the informative header and page body. |
| **Region** (map) | A named group of tiles on a location's map (a kingdom, a forest), shown filled, outlined or both; with its own visibility. |
| **Relationship** | A user-created, typed link between two resources ("A killed B"). Belongs to one group (its visibility), has a creator mark and start/end dates (or "always"). Not part of the ruleset. |
| **Relationship graph** (Set) | A Set showing a graph query of the groups the DM picks, with a layout the DM places. |
| **Relationship type** | Label and direction of a relationship (directed with optional inverse label, or undirected). Predefined list + each group's own types. |
| **Resource** | Anything in a Saga described by the ruleset: a Document, Character, Location, Item or Event. (Not a counter: HP is an attribute.) |
| **Resource picker** | The modal to pick resources: kinds offered, favorites on top, search by name or tag. |
| **Resource type / subtype** | A ruleset-defined type under a kind (Character → PC, NPC). Subtypes inherit their parent's attributes. |
| **Resource view** | Any resource in a modal, as the member may see it (character view, location map, pictures and values). |
| **Reveal** (relationship) | The DM copies a relationship into a member group: what that group now knows. |
| **Root system admin** | The first system admin, created at instance setup. |
| **Ruleset** | Data definition of a game system: resource types and subtypes, their attributes, visibility/edit rules and relationships. |
| **Saga** | The main division of the system: one game world/campaign with its own members, groups, ruleset, Stages and resources. Nothing is shared between Sagas. |
| **Saga admin** | Saga role (the DM): full control of the Saga. A Saga can have several. |
| **Saga date** | A date in the Saga's calendar; the Saga also keeps a current in-world date. |
| **Saga page** | The DM's page for how the Saga is set up: Members, Template (the Saga template), Display templates, Calendar. |
| **Saga template** | What a Saga is built on: variables per kind and type, categories, display templates, starting groups, Actors Scene tabs, turn order, fog presets. Each Saga keeps its own copy (Saga page → Template); exported and imported as a JSON file. |
| **Section bar** | The second menu strip under the top bar: a page's sections (Lore › Documents, Events, Relationships), the current one underlined. |
| **Set** | A component placed on a Stage (image, map, battle grid, relationship graph...), with position, size, layer and visibility. |
| **Set type** | A kind of Set, implemented as a module following the shared Set contract. |
| **Sheet** | The character view: the modal that opens when you click a character (a Stage card, a map icon). Opens on the informative template; immersive is a switch away. Laid out by the display template. |
| **Stage** | A canvas of Sets that a Saga admin prepares and can make live. |
| **Stage tab** | The tab that always shows the live Stage to players and viewers. |
| **Starting content** | What a Saga made from a template starts with: groups, Actors Scene tabs, turn order (and, from a file, categories, display templates, fog presets). |
| **Sub-event** | A part of an event (one level): a resource sub-event (Location X: discovered) or a relationship sub-event (A killed B). |
| **Sub-event list** | What can happen to a resource of a type in an event (a Location: discovered, conquered); in the Saga template, suggested when adding a sub-event. |
| **Sub-event type** | Something that can happen to a resource type (Location: discovered). Predefined, editable by Saga admins. |
| **Sub-location** | A location that is part of another. |
| **System admin** | Manages the backend instance (Sagas, Saga admins, other system admins) through granted permissions. |
| **Tab** | A part of an Actors Scene with the scene's creatures (each shown or hidden there), its own layout, order and turn. Defaults: Exploration, Dialog, Combat. |
| **Tag** | A free word the DM puts on resources ("dungeon", "capital") to find them; seen with the resource. |
| **Template color** | A display template's color, used by elements colored "template". |
| **Tile** | One cell of a map's grid (square or hex), addressed by column and row from the origin. |
| **Timeline** | Lore → Events as a horizontal line of events (circles; bars for periods), eras and ticks, with a minimap; or as a list. Its slider sets the in-world moment for other views. |
| **Today in the story** | The Saga's current in-world date (`sagas.story_date`): new events' date, marked on the timeline. |
| **Toolbar (Set)** | A group of a Set's controls (the Actors Scene's turn controls, a map's tools, its zoom, the dice tray) that the DM places: an anchor, across or down, a distance, a size, shown or hidden; on a canvas Stage inside or outside the Set, on an interface Stage on the screen. Every Set's main toolbar (its main options) is in the Set bar instead. |
| **Turn bar** | Actors Scene layout: cards in order in a bar at the top; the current creature is drawn to the centre, scaled up. |
| **Turn controls** | Start, previous, next, end (and the round) for a tab's turns; a tab option, DM only, in the scene's *Turns* toolbar. |
| **Upload category** | Kind of picture (character, icon, item, document, map, efx), each with its own limits: size, pixels, and how many pictures one resource holds. |
| **Value style** | How an element's value is drawn: bar, number or discrete (counters), number, or text. Formerly "style"; "balls" are now **discrete**. |
| **Variable** | An attribute in the Template page's words: a value every resource of a kind has (shared) or a type's own (an item category's). |
| **View style** | How an element looks: bar shape and gradient, discrete icons (balls, hearts, diamonds, squares), color (theme, group, template), number color, whether its name shows. |
| **Viewer** | Saga role: sees the live Stage and whatever players see; no character, never edits. |
| **Visibility** | Who can see an item: a list of groups and/or members. Default `admins` only. Applies to whole resources and to each attribute. Enforced on the server. |
| **World action** | (Later) An action of the Saga template on the world (a day passes). |
