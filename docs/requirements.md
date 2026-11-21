# Requirements

Working list, refined as we discuss. IDs are stable: never reuse a removed ID.

Priority: **MVP** (first usable version), **Later** (planned), **Goal** (long-term direction; the design
must allow it, even if not built soon).

## System administration (SYS)

See `concepts/sagas-and-access.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| SYS-1 | One backend instance hosts many independent Sagas; no data is shared between Sagas. | MVP |
| SYS-2 | A root system admin is created at instance setup. | MVP |
| SYS-3 | System admins create other system admins and grant them permissions (never more than they hold). | MVP |
| SYS-4 | System admins with permission create Sagas and assign each Saga's first admin. | MVP |
| SYS-5 | System admins with permission disable accounts and archive/delete Sagas. | MVP |
| SYS-6 | Instance-wide ruleset management (which rulesets Sagas can choose). | Later |
| SYS-7 | Usage and audit log of system admin actions. | Later |

## Sagas and members (SAGA)

| ID | Requirement | Priority |
|----|-------------|----------|
| SAGA-1 | Users log in to the hosted backend with their own account. | MVP |
| SAGA-2 | Saga admins create users for their Saga and give each a role: admin (DM), player or viewer. | MVP |
| SAGA-3 | A Saga can have several admins (co-DMs). | MVP |
| SAGA-4 | Saga admins change a member's role or remove them from the Saga. | MVP |
| SAGA-5 | A Saga uses exactly one Ruleset (chosen at creation; whether it can change later is TBD). | MVP |
| SAGA-6 | Invite links/codes as an alternative to creating users by hand. | Later |
| SAGA-7 | One account can belong to several Sagas with different roles (see open questions). | TBD |

## Member groups (GRP)

Groups of Saga members, for visibility. Groups of characters are CHR-4 to CHR-8.

| ID | Requirement | Priority |
|----|-------------|----------|
| GRP-1 | (Member groups) Every Saga has default groups `admins`, `players`, `viewers`; each member is automatically in the group of their role. | MVP |
| GRP-2 | Default groups can't be deleted; their membership follows the role. | MVP |
| GRP-3 | Saga admins create, rename and delete custom groups with any members; a member can be in many groups. | MVP |
| GRP-4 | Groups and members are the targets of visibility (and later permission) settings. | MVP |
| GRP-5 | Custom permissions per group (e.g. a group that may move its tokens or edit a lore page). | Later |

## Visibility (VIS)

| ID | Requirement | Priority |
|----|-------------|----------|
| VIS-1 | Every shareable item (resource, Set, Actor) has a visibility: a list of groups and/or members. Default: `admins` only. | MVP |
| VIS-2 | The server filters hidden content; clients never receive what they can't see. | MVP |
| VIS-3 | Saga admins can preview the app "as member X" or "as group Y". | Later |
| VIS-4 | Partial reveal: each resource attribute has its own visibility (defaults from the ruleset, see RUL-15). | MVP |
| VIS-5 | Saga admins override attribute visibility for a single resource. | Later |

Removed IDs: ACC-1 to ACC-7 (replaced by SYS, SAGA and GRP on 2026-11-19).

## Stages (STG)

See `concepts/stages.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| STG-1 | The DM creates, edits, duplicates and deletes Stages in a Saga. | MVP |
| STG-2 | Zero or one Stage is *live* at a time; the DM switches it. | MVP |
| STG-3 | Players have a Stage tab that always shows the live Stage, updated in real time. | MVP |
| STG-4 | Players can use the rest of the app freely while a Stage is live. | MVP |
| STG-5 | A Stage holds any number of Sets, each with position, size, layer (z-order) and visibility. | MVP |
| STG-6 | The DM can edit the live Stage; players see changes in real time. | MVP |
| STG-7 | **Grab attention**: the DM centers every player's Stage view on a point/area (and zoom), and brings them to the Stage tab. | MVP |
| STG-8 | Players can pan/zoom the Stage freely when the DM is not grabbing attention. | MVP |
| STG-9 | The DM prepares other Stages while one is live, without players seeing the drafts. | MVP |
| STG-10 | New Set types can be added without changing the Stage core (shared Set contract). | MVP (architecture) |
| STG-11 | Stage templates / reuse Sets across Stages. | Later |
| STG-12 | Grab attention for chosen groups or members only. | Later |
| STG-13 | Players interact with Sets (move their own token, ping, draw) when the DM allows it. | Later |
| STG-14 | Transitions / effects when switching Stage. | Later |
| STG-19 | Any Set can be transparent: no background or frame; its title bar shows only in Build and on hover in Play. | MVP |
| STG-15 | Every Stage has a **Build view** (build the Stage, settings) and a **Play view** (use it at the table, close to what players see). | MVP |
| STG-16 | Build view: the side panel shows only the settings of what was clicked (Stage, Set or actor). | MVP |
| STG-17 | Play view: no fixed panel; clicking a Set's title, an actor or a value opens a popup with its actions. | MVP |
| STG-18 | The DM's Stage tab is the Play view of the live Stage, with a link to Build it. | MVP |

## Sets (SET)

Set types. The **first version** ships the Creature panel (SET-11 to SET-20); the other MVP Sets follow.

| ID | Requirement | Priority |
|----|-------------|----------|
| SET-1 | **Image** Set: shows an image (handout, portrait, scene art). | MVP |
| SET-2 | **Map** Set: a location's map on a Stage (World map and Local map, SET-40 to SET-49); resources linked on tiles. | Done in SET-40..49 |
| SET-3 | **Battle grid** Set: square grid over an optional background; Actors are creatures placed on cells. | MVP |
| SET-4 | **Relationship graph** Set: shows the result of a graph query (see REL-8) on a Stage, with a saved layout. | MVP |
| SET-5 | Actors inside a Set can be linked to Saga resources (character, item, location, document) or be free-form. | MVP |
| SET-6 | Per-Actor visibility inside a Set (e.g. a hidden monster on the grid). | MVP |
| SET-7 | Document Set (show a letter or text document). | Later |
| SET-8 | Fog of war on map Sets. Covered by LOC-8..10 and SET-43. | Done |
| SET-9 | Hex grid. Covered by LOC-6. | Done |
| SET-10 | Initiative / turn tracker Set. Covered by the Actors Scene's order and turns (SET-31 to SET-34). | Done in SET-31..34 |
| SET-11 | **Actors Scene** Set (first version: Creature panel): Character resources shown as cards (picture, name, chosen attributes). | MVP (v1) |
| SET-22 | Card names that don't fit are abbreviated from the last word back; the full name shows on hover. | MVP (v1) |
| SET-12 | Card style (panel default, per-card override): face (face crop on top, name band over it, values below), none (name band, values), full (picture as background, name band on top, values band at the bottom). Cards are always compact. | MVP (v1) |
| SET-13 | Cards are displayed by **display templates** (DSP), not per-card settings: the scene picks a template per category (default: the category's). No per-group or per-member audience on values. | MVP (v1) |
| SET-14 | Discrete threshold for counters (shown as icons: balls, hearts, diamonds or squares): 4 full, 3 above A (random 60-90%), 2 above B (random 30% to A-10%), 1 above zero, 0 down; A and B seeded per creature with a server secret. Players only receive the level. | MVP (v1) |
| SET-15 | Admins always see real values (on hover) and hidden cards (ghosted). | MVP (v1) |
| SET-16 | Arrangement: layout (grid, row, column, circle, turn bar, boundary, free) and order (SET-31), per tab, chosen in the Play view. | MVP (v1) |
| SET-17 | Attention: highlight one card, spotlight (dim the others), grab attention on a card. | MVP (v1) |
| SET-18 | Animations: bar chip on damage/heal, ball pop, cards gliding when rearranged, defeated fade. | MVP (v1) |
| SET-19 | Hide/reveal a card for players in one click (per tab), reveal all. New cards start hidden from players. Clicking a card opens the character's sheet (players; DM through the card menu). | MVP (v1) |
| SET-20 | DM value editor on a card (Play view): type a value or a change, or −X −Y OK +Y +X with steps scaled to the value. | MVP (v1) |
| SET-21 | The DM's card marks values players see differently (another style, on hover, or not at all). | MVP (v1) |
| SET-23 | **Hover tray**: values set to "hover" show in a tray under the card while the pointer is on it. | MVP (v1) |
| SET-25 | **Tabs** in the Actors Scene: players see the active tab; the DM switches it in one click. New scenes get Exploration, Dialog and Combat; the DM adds, renames, reorders and deletes tabs. | MVP |
| SET-26 | The **cast** (the scene's creatures) is the same in every tab. Each tab has, per creature, shown or hidden to players and its free position, and its own layout, spacing, order, turn controls and turn, highlight and spotlight. Card style and templates are the scene's. | MVP |
| SET-27 | Add creatures to the scene: characters and **groups** in one picker; active player parties first and preselected; a group adds its creatures once (counts become instances); groups can be added again. "Add and reveal" reveals them in the tab being built or played only. Deleting a tab never removes creatures; "Remove from the scene" does. | MVP |
| SET-28 | **Initiative flow** for grid, row, column and circle: static (cards keep their places) or rotate (the current creature is always first / on top). | MVP |
| SET-29 | **Turn bar** layout: cards in order in a bar at the top; the current creature leaves the bar and shows scaled up in the centre, with a draw animation on every turn change. | MVP |
| SET-30 | **Boundary** layout: player characters on the left, from the top left corner (filling rightwards, then down), the others on the right, from the top right corner (filling leftwards, then down); a **neutral zone** (% of the width, empty, in the middle); **scatter** in px (each card's random x and y shift, up to that value). | MVP |
| SET-31 | Order per tab: custom or by a sortable attribute (highest first). **Order tray**: cards in order with move up/down and the sort value editable in place; moving while sorted switches to custom, keeping the order. | MVP |
| SET-32 | **Turn controls** (a tab option): start, previous, next, end, with the round; defeated creatures are skipped. DM only. | MVP |
| SET-33 | **Current-turn highlight** on the creature whose turn it is, separate from the DM's highlight, also for players (unless the card is hidden). | MVP |
| SET-34 | Players receive only the active tab: its shown cards, in order, with no initiative values, and the current turn only when that card is shown. | MVP |
| SET-35 | The current-turn highlight and the "Turn" tag use the card's **group color** (the group it was added with, else the character's first group; theme blue without one). The tag sits outside the card, centred above it. | MVP |
| SET-36 | Turn controls sit in a bar right below the scene's title and tab strip (Play, DM only). In Build, the same bar holds "+ Add creatures". | MVP |
| SET-37 | A card's menu lists the tabs it is **shown in**, one click each, and "Remove from the scene". | MVP |
| SET-38 | Every layout has a **distance to top** (px from the scene's top to the first cards). | MVP |
| SET-39 | Grid and turn bar have separate **horizontal** and **vertical space** (turn bar: in the bar, and from the bar to the drawn card); a row has horizontal space. | MVP |
| SET-40 | **World map** Set: the DM adds locations (its actors) and shows one at a time; a location strip (DM) switches it in one click; clicking a linked location that's in the Set shows it. | MVP |
| SET-41 | Per role (players, viewers): may they click resources on the map to open them (another map, a character's view, an item)? The DM always can. | MVP |
| SET-42 | Players receive only the shown location, as their fog allows (the composed picture, their fog states, links on tiles they know, paths shared with them). | MVP |
| SET-43 | The World map draws its fog with one of the Saga's **fog presets** (LOC-21..23), picked in its settings or Play menu; the Local map draws it flat. | MVP |
| SET-44 | (Moved to LOC-22: the fog's display, style, colours and controls are a preset's.) | Done in LOC-22 |
| SET-45 | Play tools on the map: point, reveal / known / hide (paint the fog with a brush), highlight tiles, and the full editor (fog, links, paths, regions, pictures, grid) in a modal that takes the whole window: the same tools as the location page. | MVP |
| SET-46 | **Highlight** tiles (brush sizes; a stroke from a highlighted tile removes) or a region; **on / off** keeps the tiles to show again; **grab attention** on them (every view centres and zooms on them; the title menu's grab attention goes to a shown highlight). The highlight zone: every other tile much darker; the highlighted tiles keep their look, with a splined border as thick as a normal path. | MVP |
| SET-47 | The DM sees the map through the fog (dimmed), and the fog as players see it. | MVP |
| SET-48 | **Local map** Set: one location, flat fog, the grid, no clicks. | MVP |
| SET-49 | Grab attention can target something of a Set type's own (map tiles), validated by the Set type. | MVP |
| SET-50 | Map Sets draw the grid only on known and visible tiles (not in the fog, nor its soft edge); in Build, everywhere. | MVP |
| SET-24 | Panel **spacing**: gap between cards in grid/row/column; in a circle, more spacing makes a bigger circle. Set in the Play view (live preview while dragging). | MVP (v1) |

## Display templates (DSP)

How characters are displayed, configured once. See `implementation/04-display-templates.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| DSP-1 | Display templates per kind (characters first): a catalog the DM creates, edits, duplicates and deletes. | MVP (v1) |
| DSP-2 | Each category has a default template, chosen on the templates page with the template picker. Built-in templates are created from the ruleset: one per Saga template category (DSP-20), and one per type left without a default; a category without its own default uses its type's. | MVP (v1) |
| DSP-3 | A template defines each display mode: cards (face, full, none) and sheets (immersive, informative). | MVP (v1) |
| DSP-4 | Each mode has a **player view** and a **DM view** with the same options: its regions' element lists (DSP-12..14). | MVP (v1, changed) |
| DSP-5 | Regions per mode: DSP-15 (cards), DSP-16 (immersive), DSP-17 (informative). Replaces the first version's places (card, hover, shown, highlight, body, hidden). | MVP (v1, changed) |
| DSP-6 | Sets showing characters use the category's default template; the DM may pick another per category for that Set. Nothing else to set when adding characters. | MVP (v1) |
| DSP-7 | The template editor shows a live preview with a chosen character, for the view being edited, as the server renders it. | MVP (v1) |
| DSP-8 | Character **sheet** (modal): immersive (the card's ratio, the picture as background, regions on top, at the bottom and on hover sides) or informative (face top left, the header beside it, the page body below); each person picks the mode. | MVP (v1, changed) |
| DSP-9 | Values not in the players' view never reach players; discrete values carry only the level; a character's controllers also see on its sheet what the ruleset lets them see. | MVP (v1) |
| DSP-10 | Template changes reach open Stages live. | MVP (v1) |
| DSP-11 | Templates for other kinds (items, locations), and a template per character. | Later |
| DSP-12 | Each region of a display mode is an ordered **list of elements** the DM adds, orders, moves between regions and removes; what isn't added isn't shown (no "hidden" place). An element shows once per view. | MVP |
| DSP-13 | Elements: the type's values and **system elements**: Name, Category, Group. | MVP |
| DSP-14 | Each element has a **value style** (bar, number, discrete for counters; number for numbers; text otherwise) and a **view style**: bar shape (rounded, flat) and gradient; discrete icons (balls, hearts, diamonds, squares); color (theme, group, template); number color (contrast, theme, black, white; bar and number styles); show its name or not. | MVP |
| DSP-15 | Card regions (face, full, none): top (1, the name by default), bottom, hover left, hover right, hover bottom. | MVP |
| DSP-16 | Immersive regions: top left, top center (the name), top right (1 each), bottom center, bottom panel (two columns), hover left, hover right. No category unless added. | MVP |
| DSP-17 | Informative regions: **header** (at most 4, next to the face) and **page body**; a body taller than a page is split into pages with controls at the bottom (previous, page n / m, next). | MVP |
| DSP-18 | Each template has a **color** (palette or any color), used by elements colored "template". | MVP |
| DSP-19 | Character pictures are shown either in the **card ratio** (5:7: full cards, the immersive sheet, which has the card's ratio) or as their **face crop** (1:1: face cards, the informative sheet, small portraits). | MVP |
| DSP-20 | Each Saga template category gets its own built-in template (made from its type) as its default. | MVP |

## Characters: categories, groups, instances (CHR)

See `concepts/characters.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| CHR-1 | **Saga templates**: a Saga starts from a Saga template = a ruleset + starting categories and groups. v1: one per ruleset, in the ruleset file. | MVP |
| CHR-2 | **Categories** per Saga (DnD Lite defaults: Player, Major NPC, Minor NPC), each based on a ruleset type, with flags *player characters* and *new characters instanceable*. The DM adds, renames and deletes them (not while in use). Creating a character = picking its category. | MVP |
| CHR-3 | A character can move to another category based on the same type. | MVP |
| CHR-4 | **Groups** of characters (parties): name, player party, active, favorite, creatures. A character can be in many groups. Default: "Player Party" (player party, active, favorite). | MVP |
| CHR-5 | **Groups tab** (DM): cards, favorites first, showing every parameter; add, rename, delete groups; add and remove creatures; toggle flags in one click. | MVP |
| CHR-6 | Instanceable characters are in a group with a count (Goblin × 3). | MVP |
| CHR-7 | The character form lists the character's groups; new player characters start in the active player parties. | MVP |
| CHR-8 | Groups are DM preparation: players never receive them. | MVP |
| CHR-9 | **Instanceable** characters (never player characters): each time one is added to a Set it becomes an **instance**, numbered per Set, with its own current values (it keeps only what changed, the rest follows the character). Changing an instance doesn't change the character. | MVP |
| CHR-10 | Non-instanceable characters are the same everywhere: a change on any Stage changes the character and every Stage showing it. | MVP |
| CHR-11 | An instance has its own sheet values and its own discrete thresholds. | MVP |
| CHR-12 | Each group has a **color** (palette or any color; one click on the group's card). | MVP |
| CHR-13 | The Groups tab shows **Player parties** and **Other groups** in separate sections. | MVP |
| CHR-14 | DnD Lite's Saga template: **Player** (PC, player characters), **Major NPC** (NPC, not instanceable, its own template) and **Minor NPC** (NPC, instanceable). | MVP |

## Lore and resources (LORE)

The Saga's resources (Documents, Characters, Locations, Items) are its lore. See `concepts/rulesets.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| LORE-1 | Saga admins create Document resources: uploaded files (images, maps, PDFs) and text documents. | MVP |
| LORE-2 | Saga admins create Character, Location and Item resources, with pages built from the ruleset. | MVP |
| LORE-3 | Resources link to each other through ruleset references and user relationships; resource pages show and follow those links. | MVP |
| LORE-4 | Members browse and search the resources they can see. | MVP |
| LORE-8 | Nested Locations can be browsed as a world hierarchy (world > region > city > place). Covered by LOC-1..3. | Done |
| LORE-9 | Characters tab: one section per category (DnD Lite: Players, Major NPCs, Minor NPCs), sort by name, level or date created; clicking a character opens its sheet. | MVP (v1) |
| LORE-10 | The name players see is set on the character: an alias, or a hidden name; used everywhere (lists, Stages, sheets). | MVP (v1) |
| LORE-5 | Reveal history: when something was shown to whom. | Later |
| LORE-6 | Player notes (private, or shared with the DM). | Later |
| LORE-7 | Session log / timeline of the saga. | Later |

## Locations and maps (LOC)

See `concepts/locations.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| LOC-1 | Location is a resource kind; locations nest (**part of**: the ruleset's parent attribute); a location can't be inside itself. | MVP |
| LOC-2 | **Locations tab** for every member: new location (DM), cards (icon, name, tags, parent, places inside), search by name, top level only, tags. | MVP |
| LOC-3 | A location whose parent a member can't see is at the top level for them (they don't learn the parent exists). | MVP |
| LOC-4 | The DM **tags** resources (any kind); members see the tags of what they see; tags suggest themselves. | MVP |
| LOC-5 | A location's **map**: pictures placed in map pixels, dragged with snapping (to other pictures' edges, to the grid), scaled, ordered. | MVP |
| LOC-6 | **Grid**: square, hex (pointy-top) or none; tile size; offset; columns and rows (or follow the pictures); the tile's physical size (scale legend). | MVP |
| LOC-7 | Grid lines: a colour, **contrast** (black or white per pixel) or **inverse** (per pixel); opacity; width. Drawn per pixel on the graphics card, whatever the number of tiles. | MVP |
| LOC-8 | **Fog of war** (off by default): per member group, each tile unknown, known or visible; a member sees the best of their groups. | MVP |
| LOC-9 | Fog painting: groups, state (keys V K U), brush (sizes, [ ]) or rectangle, drag; fill all; the stroke shows at once. | MVP |
| LOC-10 | Players never get the map's pictures or others' fog: a picture composed on the server for their fog (black outside known tiles and the unknown tiles touching them, the edge ring), their states, what's on tiles they know. | MVP |
| LOC-11 | Tiles are kept by column and row from the top left (the origin): resizing the grid adds or drops tiles at the last columns and rows; things stay on their tiles. | MVP |
| LOC-12 | **Links**: resources (characters, items, locations) on tiles, as round icons with a ring per kind; several share a tile, smaller. Members see those they may see, on tiles they know. | MVP |
| LOC-13 | **Paths**: tiles in order; body (solid, dashed, dotted lines; arrows or arrowheads: a string of them, no line), tail and head (none, arrow, circle), poly or spline (through the middle of each edge crossed, perpendicular to it), colour, width, visibility; lines, heads and tails have a dark contour. Drawn by clicking tiles. | MVP |
| LOC-14 | The location page: the map (pan, zoom) with the DM's tools in tabs (Details, Pictures, Grid, Fog, Links, Paths, Regions), using the whole page under the Saga's header (and a Full screen button); players get it read-only, resources on the map open on click. | MVP |
| LOC-15 | **Resource picker** (universal): kinds offered, favorites on top (a location's sub-locations), search by name or tag. | MVP |
| LOC-16 | **Resource view** (universal): any resource in a modal as the member may see it: a character's view (informative sheet), a location's map (and back), others' pictures and values. Map links and Actors Scene cards open it. | MVP |
| LOC-17 | Battle grid: creatures moving on a location's tiles. | Later |
| LOC-18 | Composing battlegrounds (props, rotation, layers). | Later |
| LOC-19 | **Regions**: named groups of tiles (islands and holes allowed), painted with a brush or rectangle (add, remove); shown filled (colour, opacity), with a border (colour, width, solid / dashed / dotted, contour) or both; the shape follows the tile edges or a spline; the name on the map or not; visibility. | MVP |
| LOC-20 | Tile borders (regions, highlight): the edges between tiles in a group and tiles out of it, as closed loops (pieces and holes), on square and hex grids; splined borders are smooth curves through the edges' middles. | MVP |
| LOC-21 | **Fog presets**: Saga data built by the DM in the Locations tab ("Fog presets"); every Saga starts with one (White mist); add, duplicate, edit, delete (at least one stays); map Sets using a deleted one fall back to the first. | MVP |
| LOC-22 | A preset's settings: display (**soft**: organic edges, visible tiles always fully shown, the soft edge in the unknown tiles touching known or visible ones; or **flat**), **style** (mist, smoke, clouds, ink, parchment, void, nebula, embers, blizzard, depths), **three colours** (roles per style; a style brings its own), **size**, **intensity** (the style's main variable), **motion** (still to fast), **edge** (smooth to ragged), **known tiles** (how much colour and light they lose). | MVP |
| LOC-23 | A **live preview** beside the settings: a sample map (drawn terrain, square or hex grid) with visible, known and unknown areas, as players see it or as the DM does; sliders preview while dragging. | MVP |

## Relationships (REL)

See `concepts/relationships.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| REL-1 | Admins and players create relationships between any two resources. Relationships are not part of the ruleset. | MVP |
| REL-2 | Each relationship has a type; types are directed (with optional inverse label) or undirected. | MVP |
| REL-3 | The app ships a predefined list of relationship types; each group has its own extra types, which players add, edit and remove in their own groups (admins in any group). | MVP |
| REL-4 | Every relationship records who created it and their role (admin or player), shown as a mark. | MVP |
| REL-5 | Every relationship belongs to one group; members see only the relationships of groups they are in (admins see all), filtered on the server. Players add, edit and remove relationships in their own groups. | MVP |
| REL-6 | Relationships have a start date and an end date (each an in-world date or "always") and an optional short note. A start date links the relationship to an Event. | MVP |
| REL-7 | Creating a relationship is fast from a resource page, from the graph (drag node to node) and from an event; missing targets can be created on the fly. | MVP |
| REL-8 | The backend builds a relationship graph on demand from a query; the frontend renders it. | MVP |
| REL-9 | Graph queries: all connections between characters; connections within a chosen set of resources with N external hops; around one resource up to N hops. | MVP |
| REL-10 | Graph filters: resource kinds/types, relationship types, creator (admins, players, a member), in-world date. | MVP |
| REL-11 | Graph viewer screen for all members (each sees only what they can see). | MVP |
| REL-12 | Comparison view: player relationships that match admin ones, that don't, and admin ones still unknown to players; the DM can show it on a Stage. | Later |
| REL-14 | Admins reveal a relationship to a group in one action (add it to that group). | MVP |
| REL-13 | Quick text entry ("A killed B") parsed into a relationship; later from voice/AI. | Later |

## Events and timeline (EVT)

See `concepts/events.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| EVT-1 | Event is a resource kind. Events have one exact in-world date (no partial dates, no durations), title, description, involved resources, sub-events (one level), visibility and creator. | MVP |
| EVT-2 | Resource sub-events: a sub-event type from the resource type's list (e.g. Location: discovered). | MVP |
| EVT-3 | Each resource type has a list of sub-event types, predefined and editable by the Saga admin. | MVP |
| EVT-4 | Relationship sub-events: adding one creates the relationship (start date = event date); giving a relationship a start date creates (or joins) an event. One record, shown in both places. | MVP |
| EVT-5 | Each Saga picks a calendar: real (Gregorian) or fantasy (predefined or defined by the Saga admin). | MVP |
| EVT-6 | The Saga keeps a current in-world date, the default for new events. | MVP |
| EVT-7 | Timeline screen: events in date order, filtered by visibility, resource, event type, creator. | MVP |
| EVT-8 | Timeline slider: sets the in-world moment for other views (e.g. the relationship graph shows relationships active at that date). | MVP |
| EVT-11 | Eras: named periods with a start and end date (end optional while ongoing), shown as bands on the timeline and usable as filters. | MVP |
| EVT-9 | Fantasy calendar editor (months, week days, eras, leap rules). | Later |
| EVT-10 | Timeline Set type for Stages. | Later |

## Rulesets (RUL)

See `concepts/rulesets.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| RUL-1 | Rulesets are data definitions loaded by the app, not code. | MVP |
| RUL-2 | The **DnD Lite** ruleset (our light take on D&D 5e 2014) ships with the app. | MVP |
| RUL-4 | Resource pages and edit forms are built from the ruleset; members view/edit attributes according to its rules (e.g. a player changes their PC's HP). | MVP |
| RUL-5 | Derived values (formulas) computed from other attributes. | Later |
| RUL-6 | Attribute resets (short rest, long rest, per session...) defined by the ruleset. | Later |
| RUL-7 | Compendium content (spells, monsters, items) shipped as pre-made resources with the ruleset. | Later |
| RUL-8 | Ruleset versioning; Sagas pin a version. | Later |
| RUL-9 | **Ruleset editor** in the app: create, edit, validate, import/export rulesets. | Goal |
| RUL-10 | Ruleset extension (homebrew on top of a base ruleset). | Goal |
| RUL-11 | Share rulesets between users. | Goal |
| RUL-12 | A ruleset defines resource types under the resource kinds (Document, Character, Location, Item, Event). | MVP |
| RUL-13 | Types can have subtypes (e.g. Character → PC, NPC); subtypes inherit the parent's attributes and add their own. | MVP |
| RUL-14 | Attribute types are structures built from blocks (text, number, boolean, choice, counter, resource ref, member ref, list, file, struct); authors can define reusable named structures. | MVP |
| RUL-15 | Each attribute declares default visibility and edit rules per group, including the contextual `controllers` group. | MVP |
| RUL-16 | Structural references between resources are attributes (refs to resources or members) defined by the ruleset. Free relationships are not part of the ruleset (see REL). | MVP |

Removed IDs: RUL-3 (replaced by RUL-12 to RUL-16 on 2026-11-19).

## Non-functional (NFR)

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1 | Real-time sync for Stage changes (target: under 1 s at the table). | MVP |
| NFR-2 | Works on desktop browsers and phones (responsive). | MVP |
| NFR-3 | Uploaded files stored outside the database (object storage), access-checked. | MVP |
| NFR-4 | Reconnecting players get the current live Stage state. | MVP |
| NFR-5 | Interface in English and Brazilian Portuguese. | Later |
| NFR-6 | Works on a poor connection for the DM. | Later |
| NFR-7 | The whole app runs locally with Docker, started by one command. | MVP |
| NFR-8 | The app deploys easily to Railway: Dockerfile per service, settings from environment variables, migrations on deploy, no local-only state. | MVP |

## Uploads (UPL)

See `implementation/02-picture-uploader.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| UPL-1 | One picture uploader for the whole app, used wherever a picture is needed. | MVP |
| UPL-2 | Upload limits per category (character, item, document, map): max size (MB) and longest side (px), set by system admins. A server setting is the hard ceiling. | MVP |
| UPL-3 | The limits are shown before choosing a file. | MVP |
| UPL-4 | Pick by click, drag and drop, or paste. | MVP |
| UPL-5 | Crop (free or fixed ratios), rotate, mirror, before uploading. | MVP |
| UPL-6 | Light colour tools before uploading: brightness, contrast, saturation, hue, with a live preview. | MVP |
| UPL-7 | The browser resizes and compresses the picture to fit the category's limits before uploading. | MVP |
| UPL-8 | The server checks again: size, real image of an allowed format, pixel size. | MVP |
| UPL-9 | More tools (sharpen, presets, background removal...). | Later |
| UPL-10 | An **icon** category (small, round pictures of any resource: lists, pickers, maps): its size is the icon image size. | MVP |
| UPL-11 | Each category also has **how many pictures one resource holds** (a gallery, a location's map), set by system admins and checked by the server. | MVP |
| UPL-12 | Image attributes name their upload category; `many` image attributes are galleries. | MVP |
| UPL-13 | Characters: a main picture, other pictures (one click makes one the main picture) and an icon. Locations: an icon (their pictures are the map's). Items: an icon where linked, a picture when looked at in detail. | MVP |

## User experience (UX)

UX is the top directive. See `concepts/ux.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| UX-1 | Frequent in-session actions (switch Stage, reveal, grab attention, change HP, add a relationship) take one or two actions. | MVP |
| UX-2 | Separate in-session (live) screens from prep screens for the DM. | MVP |
| UX-3 | Reversible actions have undo instead of confirmation dialogs. | MVP |
| UX-4 | New items are hidden from players by default; nothing is revealed by accident. | MVP |
| UX-5 | Player screens are designed for phones first and readable at a glance. | MVP |
| UX-6 | App actions are defined as named commands with parameters, so buttons, shortcuts and later voice/AI can trigger the same thing. | MVP (architecture) |
| UX-7 | Keyboard shortcuts for the DM's frequent actions. | Later |
| UX-8 | Speech recognition: the DM triggers commands by voice. | Goal |
| UX-9 | AI assistance (session summaries, lore search by meaning, prep help, suggestions). | Goal |
