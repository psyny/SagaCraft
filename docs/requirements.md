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

## Groups (GRP)

| ID | Requirement | Priority |
|----|-------------|----------|
| GRP-1 | Every Saga has default groups `admins`, `players`, `viewers`; each member is automatically in the group of their role. | MVP |
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
| SET-2 | **Map** Set: large image with pan/zoom, pins/markers linked to lore. | MVP |
| SET-3 | **Battle grid** Set: square grid over an optional background; Actors are creatures placed on cells. | MVP |
| SET-4 | **Relationship graph** Set: shows the result of a graph query (see REL-8) on a Stage, with a saved layout. | MVP |
| SET-5 | Actors inside a Set can be linked to Saga resources (character, item, location, document) or be free-form. | MVP |
| SET-6 | Per-Actor visibility inside a Set (e.g. a hidden monster on the grid). | MVP |
| SET-7 | Document Set (show a letter or text document). | Later |
| SET-8 | Fog of war on grid and map Sets. | Later |
| SET-9 | Hex grid. | Later |
| SET-10 | Initiative / turn tracker Set. | Later |
| SET-11 | **Creature panel** Set: Character resources shown as cards (picture, name, chosen attributes). | MVP (v1) |
| SET-22 | Card names that don't fit are abbreviated from the last word back; the full name shows on hover. | MVP (v1) |
| SET-12 | Card style (panel default, per-card override): face (face crop on top, name band over it, values below), none (name band, values), full (picture as background, name band on top, values band at the bottom). Cards are always compact. | MVP (v1) |
| SET-13 | Per card, a **player view** and a **DM view** with the same options: card shown or hidden; display name (or hidden name); per value a style (bar, number, balls) and where it shows (card, hover tray, hidden). Player defaults from the ruleset. No per-group or per-member audience on values. | MVP (v1) |
| SET-14 | Discrete threshold for counters: 4 balls full, 3 above A (random 60-90%), 2 above B (random 30% to A-10%), 1 above zero, 0 down; A and B seeded per creature with a server secret. Players only receive the ball count. | MVP (v1) |
| SET-15 | Admins always see real values (on hover) and hidden cards (ghosted). | MVP (v1) |
| SET-16 | Arrangement: shape (grid, row, column, circle, free) and order (manual by dragging, or by initiative), chosen in the Play view. | MVP (v1) |
| SET-17 | Attention: highlight one card, spotlight (dim the others), grab attention on a card. | MVP (v1) |
| SET-18 | Animations: bar chip on damage/heal, ball pop, cards gliding when rearranged, defeated fade. | MVP (v1) |
| SET-19 | Card options: hide/reveal card for players in one click, reveal all. New cards start hidden from players. | MVP (v1) |
| SET-20 | DM value editor on a card (Play view): type a value or a change, or −X −Y OK +Y +X with steps scaled to the value. | MVP (v1) |
| SET-21 | The DM's card marks values players see differently (another style, on hover, or not at all). | MVP (v1) |
| SET-23 | **Hover tray**: values set to "hover" show in a tray under the card while the pointer is on it. | MVP (v1) |
| SET-24 | Panel **spacing**: gap between cards in grid/row/column; in a circle, more spacing makes a bigger circle. Set in the Play view (live preview while dragging). | MVP (v1) |

## Lore and resources (LORE)

The Saga's resources (Documents, Characters, Locations, Items) are its lore. See `concepts/rulesets.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| LORE-1 | Saga admins create Document resources: uploaded files (images, maps, PDFs) and text documents. | MVP |
| LORE-2 | Saga admins create Character, Location and Item resources, with pages built from the ruleset. | MVP |
| LORE-3 | Resources link to each other through ruleset references and user relationships; resource pages show and follow those links. | MVP |
| LORE-4 | Members browse and search the resources they can see. | MVP |
| LORE-8 | Nested Locations can be browsed as a world hierarchy (world > region > city > place). | MVP |
| LORE-5 | Reveal history: when something was shown to whom. | Later |
| LORE-6 | Player notes (private, or shared with the DM). | Later |
| LORE-7 | Session log / timeline of the saga. | Later |

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
