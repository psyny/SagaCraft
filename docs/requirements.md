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
| SAGA-8 | Saga **settings** (Saga → Settings, admins): the live link (STG-26) on or off, and a new link. | MVP |
| SAGA-9 | **Saga → User** (everyone): change your display name (every Saga) and your password (with the current one). | MVP |
| SAGA-10 | Each member picks their **colour** in a Saga (a palette colour until then: token borders, pings later) and a **dice style** (Minimalist for now; the dice roller later). | MVP |
| SAGA-11 | Eleven **dice styles** (Minimalist, Ember, Metal, Raw wood, Polished wood, Noble, Elven, Dwarven, Orcish, Nature, Neon), each led by the member's colour; numbers are never glossy and glow a little, picked on Saga → User with a live 3D preview. | MVP |

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
| VIS-1 | Every shareable item (resource, Set, Actor) has a visibility: a list of groups and/or members (resources and folders: also "Owner", VIS-7). Default: `admins` only. | MVP |
| VIS-2 | The server filters hidden content; clients never receive what they can't see. | MVP |
| VIS-3 | Saga admins can preview the app "as member X" or "as group Y". | Later |
| VIS-4 | Partial reveal: each resource attribute has its own visibility (defaults from the ruleset, see RUL-15). | MVP |
| VIS-5 | Saga admins override attribute visibility for a single resource. | Later |
| VIS-6 | **Viewers see what players see** (they count as in the `players` group for seeing: resources, relationships, fog, ruleset rules) and **never edit** anything; "all viewers" is no longer a choice anywhere. | MVP |
| VIS-7 | **Owner**: a resource's owners (a character's Players in control; other resources an Owner field set by the DM) are a who-can-see choice ("Owner"), on resources and folders. | MVP |
| VIS-8 | Who can see and who can edit are picked in the **combo tray** (UX-14): Admins only, All players, Owner, Inherit (folders), custom groups, people. | MVP |

Removed IDs: SET-48 (the Local map Set, merged into the Map on 2026-11-25). ACC-1 to ACC-7 (replaced by SYS, SAGA and GRP on 2026-11-19).

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
| STG-17 | Play view: no fixed panel; clicking a Set's ⚙ (in the Set bar), an actor or a value opens a popup with its actions. | MVP |
| STG-18 | The DM's Stage tab is the Play view of the live Stage, with a link to Build it. | MVP |
| STG-20 | Build's side panel lists the Stage's Sets from the top layer down: pick one, move it up or down a layer. | MVP |
| STG-21 | The Stage tab takes the whole browser window: no top bar; a corner with the connection dot, full screen, the DM's Build link and ✕ (back to the last page). | MVP |
| STG-22 | Stage **layouts**: canvas (Sets on a world to pan and zoom) or **interface** (Sets fixed to the screen: anchor, width and height in % of the screen, offset in %; presets; drag to nudge and resize in Build). | MVP |
| STG-23 | A Set's controls are in **toolbars** (each Set type names its own; every Set has a main one, in the Set bar: STG-28). In Build, each other toolbar's place: anchor (corner or edge middle), across or down, distance from the anchor, size (S/M/L), shown or hidden; on a canvas Stage inside or outside the Set, on an interface Stage on the screen. Toolbars at the same spot line up instead of overlapping, above every Set; in Build, empty and hidden ones show where they are. The DM's Play view lays a Set out like the players' (toolbars float). | MVP |
| STG-24 | A Set's settings open from its ⚙ in the Set bar, not from its title: in Play its Play menu, or (a type without one) its settings in a window over the Stage (STG-29); in Build, the side panel. | MVP |
| STG-25 | The DM can **put a Set away** (the eye, in the Set bar's menu row and in Build's Set list): it is drawn for no one (players aren't sent it); its button in the Set bar stays, faded, to bring it back; in Build it shows faded. Duplicates keep it. | MVP |
| STG-26 | The **live link**: a secret address (`/live/<token>`) showing the live Stage full screen as a viewer, with no sign-in and nothing else of the app, in real time; off by default; a new link or Off stops screens on the old one. | MVP |
| STG-27 | **Fold a Set's controls** (the DM, Play: in the Set bar's menu row): its toolbars on the Stage fold away and back; per Set, remembered in the browser. The Stage stays sharp when zoomed: it is redrawn at the new scale once panning or zooming stops. | MVP |
| STG-28 | The **Set bar** (the DM, Play and Build; on the Stage tab beside its corner): a button per Set (its type's icon; EFX layers aren't on it); clicking one opens it (its name shows) and a menu row under the bar: the eye, ⚙, fold (Play) and its main options (its main toolbar). One open at a time. Players and viewers have no Set bar. | MVP |
| STG-29 | In Play, a Set type without a Play menu opens its **settings in a window** over the Stage (its Build settings), so the DM never leaves the Stage for them. | MVP |

## Sets (SET)

Set types. The **first version** ships the Creature panel (SET-11 to SET-20); the other MVP Sets follow.

| ID | Requirement | Priority |
|----|-------------|----------|
| SET-1 | **Image** Set: shows an image (handout, portrait, scene art). | MVP |
| SET-2 | **Map** Set: a location's map on a Stage (SET-40 to SET-49, SET-53); resources linked on tiles. | Done in SET-40..49 |
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
| SET-36 | Turn controls are the scene's *Turns* toolbar (Play, DM only); the tabs and, in Build, "+ Add creatures" are its main options, in the Set bar (STG-28). | MVP |
| SET-37 | A card's menu lists the tabs it is **shown in**, one click each, and "Remove from the scene". | MVP |
| SET-38 | Every layout has a **distance to top** (px from the scene's top to the first cards). | MVP |
| SET-39 | Grid and turn bar have separate **horizontal** and **vertical space** (turn bar: in the bar, and from the bar to the drawn card); a row has horizontal space. | MVP |
| SET-40 | **Map** Set (was the World map): the DM adds locations (its actors) and shows one at a time; its main option in the Set bar (DM) is a picker of locations (SET-71); clicking a linked location that's in the Set shows it. | MVP |
| SET-41 | Per role (players, viewers): may they click resources on the map to open them (another map, a character's view, an item)? The DM always can. | MVP |
| SET-42 | Players receive only the shown location, as their fog allows (the composed picture, their fog states, links on tiles they know, paths shared with them). | MVP |
| SET-43 | The Map draws its fog with one of the Saga's **fog presets** (LOC-21..23), picked in its settings or Play menu; the Local map draws it flat. | MVP |
| SET-44 | (Moved to LOC-22: the fog's display, style, colours and controls are a preset's.) | Done in LOC-22 |
| SET-45 | Play tools on the map: point, reveal / known / hide (paint the fog with a brush), highlight tiles, and the full editor (fog, links, paths, regions, pictures, grid) in a modal that takes the whole window: the same tools as the location page. | MVP |
| SET-46 | **Highlight** tiles (brush sizes; a stroke from a highlighted tile removes) or a region; **on / off** keeps the tiles to show again; **grab attention** on them (every view centres and zooms on them; the ⚙ menu's grab attention goes to a shown highlight). The highlight zone: every other tile much darker; the highlighted tiles keep their look, with a splined border as thick as a normal path. | MVP |
| SET-47 | The DM sees the map through the fog (dimmed), and the fog as players see it. | MVP |
| SET-49 | Grab attention can target something of a Set type's own (map tiles), validated by the Set type. | MVP |
| SET-51 | Map Sets zoom and pan inside the map (wheel, the *Zoom* toolbar, drag once zoomed) for everyone; grab attention fits the map again. | MVP |
| SET-52 | **Timeline Set**: the horizontal timeline on a Stage; the DM picks whose knowledge (groups; players by default), dates or an era, event types, and whether events start expanded; everyone pans and zooms; clicking shows or hides an event's box; it updates live. | MVP |
| SET-53 | **One Map Set**: the Local map is merged into the Map (old Local maps become Maps, players' clicks off). | MVP |
| SET-54 | **Grab attention** on a Map: every view takes the DM's zoom and centre (its own Set size), out of the Highlight tool; the ⚙ menu's shows the whole map. | MVP |
| SET-55 | **Pings**: players and the DM (not viewers) ping a tile of a Map on the live Stage (📍 Ping then a tile, or Alt+click); whoever sees the Set (live link too) sees it glow in the pinger's colour with a contour, a pin and their name for 10 s, and a notice in the screen's top right corner (clicking it zooms the map to the tile; SET-67); nothing stored; at most twice a second each. | MVP |
| SET-56 | The DM drags **tokens** on a Map in Play (Point); they snap to tiles. | MVP |
| SET-57 | **Desktop** Set: the DM lays pieces for the players: characters, items, documents and pictures; each has an eye (shown to players or only to the DM). | MVP |
| SET-58 | Desktop layout: **Auto** (rows at one scale filling the desk) or **Free** (each piece's place, size, angle: move, resize, rotate with Shift snapping); dragging in Auto switches to Free keeping every place; places are fractions of the desk. | MVP |
| SET-59 | Desktop characters show as a card (face, full, values) or a sheet (immersive, informative), in a template of their kind; documents show the page the DM turns to. | MVP |
| SET-60 | The Desktop **item card**: picture, name banner, category, its first choice variable as a tier gem (colour by the option's place), its template's values; tilt and sheen, the top tier shimmers. | MVP |
| SET-61 | **Temporary files** in the Stage core: an actor's own upload (`temp_file_id`) is deleted with the actor, its Set or its Stage, and copied when the Stage is duplicated. | MVP |
| SET-62 | **Dice roller** Set: roll types (from the Saga template; the DM changes them per Set): name, dice (d4 to d100, d100 as two d10s), read as sum, highest, lowest, sum above or below X, and a modifier. | MVP |
| SET-63 | The dice **tray** (one toolbar the DM places): its columns are the roll types; at the bottom minimize, Roll, Clear (your row), Clear all (the DM) and the roll-type buttons, a number in a circle over each for how many you're about to roll (click: one less); results above (SET-66); the 3D dice waiting over it, in the band by the tray's edge (bottom, top, left, right: a setting; the dice are thrown from it), clear of its controls. The same roll again joins your group (read together). It never minimizes by itself. | MVP |
| SET-64 | 3D dice (three.js): textures, normal maps, glow, chamfered edges; the throw flies, bounces off the Set's edges and each other, tumbles and lands on the server's values; the same seed gives the same throw. Dice land flat with their value face up and its number upright (a d4: a crystal, its value on top; a d2: a coin). | MVP |
| SET-65 | **The DM's pick**: clicking a waiting die (anyone's) picks the value it lands on; players never receive it. | MVP |
| SET-66 | Roll **results**: one row per roll on the Set (the latest 4 shown; the rest on demand), the roller's name on the left, each roll type's result in its column over its button, its dice (counted ones standing out) in small print. The Set may be transparent and lets clicks through when no dice are on it. Members act on Sets through the Set contract's `act`. | MVP |
| SET-67 | **Ping notices**: every ping also shows a notice in the top right corner of the screen ("Ana pinged") for 10 s, for everyone who sees the map; clicking it centres and zooms that map on the pinged tile. | MVP |
| SET-68 | Dice **speed** (Set settings, a slider): half to five times the first speed (default 2×); its last step is **instant** (the dice appear landed). | MVP |
| SET-69 | Dice **size** (Set settings, a slider): 60% to 180%. | MVP |
| SET-70 | (Changed by SET-63: the roll buttons moved from the main toolbar to the tray.) | MVP |
| SET-71 | The Map's main option is the shown location: a picker with the Set's locations on top and every other location below; picking one not on the Set adds it and shows it. | MVP |
| SET-72 | The Relationship graph and Timeline Sets: "What it shows…" (main option, Play) opens their settings in a window (whose knowledge, the query or the dates...); their settings have **Delete**. | MVP |
| SET-73 | The Desktop's **background**: a slider (0–100%, default 78%) for its panel's opacity (0: see-through, no frame). An empty desk is invisible (no panel, no message) and lets clicks through (Build still outlines it). | MVP |
| SET-74 | **Your preparation is yours**: each member's waiting dice are their own (players get only theirs; the DM everyone's); Roll throws only yours; several members can prepare and roll at once. | MVP |
| SET-75 | **Who can roll** (dice settings): every player who sees it (default), or some groups and members; the DM always; the server refuses the others. | MVP |
| SET-76 | **Rolls stay** on the Set until their roller clears their row or the DM clears every row (at most 12 rolls, 60 dice: the oldest go); new throws bounce off the dice already there; rolls already there when a screen opens rest where they are. | MVP |
| SET-77 | Dice shapes: a **d2** (a coin: 1 and 2 on its faces) for roll types; the **d4** is a crystal (a square prism with pointed ends, its value on the long face on top). | MVP |
| SET-78 | **Hiding rolled dice**: the DM's eye in the tray hides the rolled 3D dice for everyone (the results stay; a new roll shows them again); clicking a rolled die hides it for whoever clicked. The Set lets clicks through unless dice are waiting in the tray; rolled dice still catch their own clicks. | MVP |
| SET-79 | The Map Set's **layer**: in the Set bar next to the location, the layer players see (per location). | MVP |
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
| DSP-5 | Regions per mode: DSP-15 (cards), DSP-16 (immersive), DSP-17 (informative), DSP-21 (token). Replaces the first version's places (card, hover, shown, highlight, body, hidden). | MVP (v1, changed) |
| DSP-6 | Sets showing characters use the category's default template; the DM may pick another per category for that Set. Nothing else to set when adding characters. | MVP (v1) |
| DSP-7 | The template editor shows a live preview with a chosen character, for the view being edited, as the server renders it. | MVP (v1) |
| DSP-8 | Character **sheet** (modal): immersive (the card's ratio, the picture as background, regions on top, at the bottom and on hover sides) or informative (face top left, the header beside it, the page body below); each person picks the mode. | MVP (v1, changed) |
| DSP-9 | Values not in the players' view never reach players; discrete values carry only the level; a character's controllers also see on its sheet what the ruleset lets them see. | MVP (v1) |
| DSP-10 | Template changes reach open Stages live. | MVP (v1) |
| DSP-11 | Templates for other kinds (items, locations), and a template per character. | Later |
| DSP-12 | Each region of a display mode is an ordered **list of elements** the DM adds, orders, moves between regions and removes; what isn't added isn't shown (no "hidden" place). An element shows once per view. | MVP |
| DSP-13 | Elements: the type's values and **system elements**: Name, Category, Group. | MVP |
| DSP-14 | Each element has a **value style** (bar, number, discrete for counters; number for numbers; text otherwise) and a **view style**: bar shape (rounded, flat) and gradient; discrete icons (balls, hearts, diamonds, squares); color (theme, group, template, player: the token colour; text values take it too); number color (contrast, theme, black, white; bar and number styles); show its name or not. | MVP |
| DSP-15 | Card regions (face, full, none): top (1, the name by default), bottom, hover left, hover right, hover bottom. | MVP |
| DSP-16 | Immersive regions: top left, top center (the name), top right (1 each), bottom center, bottom panel (two columns), hover left, hover right. No category unless added. | MVP |
| DSP-17 | Informative regions: **header** (at most 4, next to the face) and **page body**; a body taller than a page is split into pages with controls at the bottom (previous, page n / m, next). | MVP |
| DSP-18 | Each template has a **color** (palette or any color), used by elements colored "template". | MVP |
| DSP-19 | Character pictures are shown either in the **card ratio** (5:7: full cards, the immersive sheet, which has the card's ratio) or as their **face crop** (1:1: face cards, the informative sheet, small portraits). | MVP |
| DSP-20 | Each Saga template category gets its own built-in template (made from its type) as its default. | MVP |
| DSP-21 | A **Token** display mode (the map token of characters of the template): regions **on the token** and **hover left / right / top (the name by default) / bottom**, shown while the pointer is on the token (each tray fits its content, against the token, growing away from it); used by mobile tokens and map links of characters. | MVP |
| DSP-22 | The template holds the token's **border style**: Gradient (default), Simple, Chip; the template editor previews the token with its values. | MVP |
| DSP-23 | Every card and sheet has a thin **gradient frame** (4–5 px) in the token colour (the player's; several: white; none: black; an item's from its owners). The immersive sheet's top bar is thin and the gradient behind its lower values starts right under the first one. Text over pictures (full cards, immersive sheets) has a 50% black drop shadow. | MVP |

## Characters: categories, groups, instances (CHR)

See `concepts/characters.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| CHR-1 | **Saga templates**: a Saga starts from a Saga template = a ruleset + starting categories and groups (and more: TPL-1..12). Built-in ones are files; each Saga keeps its own copy. | MVP |
| CHR-2 | **Categories** per Saga (DnD Lite defaults: Player, Major NPC, Minor NPC), each based on a ruleset type, with flags *player characters* and *new characters instanceable*. The DM adds, renames and deletes them (not while in use). Creating a character = picking its category. | MVP |
| CHR-3 | A character can move to another category based on the same type. | MVP |
| CHR-4 | **Groups** of characters (parties): name, player party, active, favorite, creatures. A character can be in many groups. Default: "Player Party" (player party, active, favorite). | MVP |
| CHR-5 | **Groups** (DM; a section of the Characters page): cards, favorites first, showing the name, its state (★, Active), its variables' values and its creatures; add and delete groups; add and remove creatures; **Edit** opens the group's editor (CHR-22). | MVP |
| CHR-6 | Instanceable characters are in a group with a count (Goblin × 3). | MVP |
| CHR-7 | The character form lists the character's groups; new player characters start in the active player parties. | MVP |
| CHR-8 | Groups are DM preparation: players never receive them. | MVP |
| CHR-9 | **Instanceable** characters (never player characters): each time one is added to a Set it becomes an **instance**, numbered per Set, with its own current values (it keeps only what changed, the rest follows the character). Changing an instance doesn't change the character. | MVP |
| CHR-10 | Non-instanceable characters are the same everywhere: a change on any Stage changes the character and every Stage showing it. | MVP |
| CHR-11 | An instance has its own sheet values and its own discrete thresholds. | MVP |
| CHR-12 | Each group has a **color** (palette or any color; in the group's editor). | MVP |
| CHR-13 | Groups show **Player parties** and **Other groups** in separate sections. | MVP |
| CHR-14 | DnD Lite's Saga template: **Player** (PC, player characters), **Major NPC** (NPC, not instanceable, its own template) and **Minor NPC** (NPC, instanceable). | MVP |
| CHR-15 | Characters have a **who can edit** (the DM's; members, groups, Owner, default Owner): they change the variables the Saga template opens to "its players" and always see the character; viewers never edit. | MVP |
| CHR-16 | The character editor is **full screen with tabs**: Admin (the DM: category, active, instanceable, groups, tags, players in control, who can edit, who can see, name players see), Identity (name, pictures, token, hide the name, its players' sharing, relationships), Variables, Inventory; one Save. Its players open it too. | MVP |
| CHR-17 | **Active** (the DM): an inactive character stays off Actor Sets (players aren't sent it; the DM sees it faded in Build) and out of groups added to Sets. | MVP |
| CHR-18 | A character's **token**: its icon (else face) in a border in its player's colour (several: white; none: black), styled by its display template (DSP-21, DSP-22: gradient, simple, chip; borders 20% thinner than first made; a larger token keeps the size-1 border, drawn inside its shape); shown on maps. | MVP |
| CHR-19 | A character's players may hide its name and share it with all players or some players (the DM's other choices stay). | MVP |
| CHR-20 | The character editor's Identity tab shows the token as its display template draws it, with a pointer to the template (no token picker of its own). | MVP |
| CHR-21 | **Group variables**: every group of characters has values for the Saga template's group variables (TPL-15), checked like a character's values; values of a deleted variable stay hidden on the group. Groups stay the DM's (CHR-8). | MVP |
| CHR-22 | The group's **editor** (a modal, from Edit on its card): Group (name, colour, Player party, Active, Favorite), then its variables (the template's group variables, edited like a character's), Save or Cancel. | MVP |

## Lore and resources (LORE)

The Saga's resources (Documents, Characters, Locations, Items) are its lore. See `concepts/rulesets.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| LORE-1 | Saga admins create Document resources: multipage documents, each page a text or a picture (DOC-1..4). PDFs and other files: later. | MVP |
| LORE-2 | Saga admins create Character, Location and Item resources, with pages built from the ruleset. | MVP |
| LORE-3 | Resources link to each other through ruleset references and user relationships; resource pages show and follow those links. | MVP |
| LORE-4 | Members browse and search the resources they can see. | MVP |
| LORE-8 | Nested Locations can be browsed as a world hierarchy (world > region > city > place). Covered by LOC-1..3. | Done |
| LORE-9 | Characters tab: one section per category (DnD Lite: Players, Major NPCs, Minor NPCs), sort by name, level or date created; clicking a character opens its sheet. | MVP (v1) |
| LORE-11 | The **Lore** tab holds Documents, Events (the timeline) and Relationships. | MVP |
| LORE-12 | **Folders** for documents, items and locations (one level): All / each folder / Not in a folder; drag cards onto folders or use the page's folder picker; each folder's ⚙: name, **who can see** (Inherit, or a choice overriding its resources', kept underneath), delete. Members see a folder when it's shown to them or holds something they see. | MVP |
| LORE-13 | Resources other than characters have an **Owner** field (members, the DM's). | MVP |
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
| LOC-24 | **Labels** on maps: text and a pin (pin, dot, star, flag, diamond, none), text above, left or right, three sizes, a pin colour, text only on click, visibility; players see them only on places they know. | MVP |
| LOC-23 | A **live preview** beside the settings: a sample map (drawn terrain, square or hex grid) with visible, known and unknown areas, as players see it or as the DM does; sliders preview while dragging. | MVP |
| LOC-25 | **Location map** (Locations, beside "New location"; everyone): the locations the member sees as a graph: links on their maps between them (an arrow when one way; not on tiles unknown to the member) and "part of" (dashed); places in the same place share a colour and a region (regions nest), and settle together. Clicking a place opens it. | MVP |
| LOC-26 | **Mobile tokens** on a location's map: a character, an item, a group or a custom one (name and a temporary picture, deleted with it); a size of 1–10 tiles (LOC-29); its layer (LOC-32); who sees it (and never on unknown tiles); borders in the player's colour (several: white; none: black), a group's colour; characters styled by their display template (DSP-21); the DM drags them and they snap to tiles. Token changes don't redraw the players' composed picture. | MVP |
| LOC-27 | The **Tokens** tool in the map editor (location page, the Map's Full editor): add (pick, or name and upload), place with a click, size, who sees it, remove. | MVP |
| LOC-28 | **Path contours**: each path's line, arrows and ends are outlined in black or white, whichever stands out from its colour. | MVP |
| LOC-29 | **Token shapes**: a size n token covers n×n tiles as a rounded square on a square grid, or a cluster of hexes on a hex grid (2 → 3 hexes, 3 → 7, 4 → 12, 5 → 19, 6 → 27, 7 → 37, to size 10). | MVP |
| LOC-30 | Label pins and ping pins have a soft gradient (light at the top, the colour, then darker). | MVP |
| LOC-31 | A path's **shown** part (0–100%, the DM's slider, the map following while dragging): only that much of it is drawn from its start, its head at the cut (progress on a route); players get only the tiles up to the cut. | MVP |
| LOC-32 | **Map layers**: a map's layers in order, each with a name, see-through (where it has no picture, the layers under it show), its pictures, tokens, links, paths, regions and labels; the grid, the fog and the no-map colour are the whole map's. Viewing a layer shows it (and what shows through) and only its own things; players get a composed picture per layer. Add, rename, order, delete (a map keeps one); tokens move between layers. Older maps have one layer. | MVP |
| LOC-33 | The map's **no-map colour** (Background tab; black by default): what shows where no picture covers the map. | MVP |
| LOC-34 | The map editor's tabs: the whole map's (Details, Grid, Fog, Background, Layers), then the layer picked and its tabs (Pictures, Links, Tokens, Paths, Regions, Labels). The location page has a layer picker for everyone when there are several. | MVP |
| LOC-35 | **Sharp at any zoom**: the map is drawn for the part in view at the screen's resolution (grid, fog edges); pictures are mipmapped zoomed out and sampled bicubically zoomed in past their resolution. | MVP |

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
| REL-15 | A relationship's resource a member can't see comes back masked ("???": no id, no name). | MVP |
| REL-17 | Graph nodes show the icon, else the picture's face crop, else the initial (map resources too). | MVP |
| REL-16 | Relationships are added from every resource page (⟷ Relationships), the graph (drag a node's "+" onto another), an event's page and the Lore tab, in one sentence-like form; types ranked by recent use and the kinds linked. | MVP |

## Events and timeline (EVT)

See `concepts/events.md`.

| ID | Requirement | Priority |
|----|-------------|----------|
| EVT-1 | Event is a resource kind. Events have one exact in-world date (no partial dates) and maybe an end date (EVT-18), title, description, involved resources, sub-events (one level), visibility and creator. | MVP |
| EVT-2 | Resource sub-events: a sub-event type from the resource type's list (e.g. Location: discovered). | MVP |
| EVT-3 | Each resource type has a list of sub-event types, predefined and editable by the Saga admin. | MVP |
| EVT-4 | Relationship sub-events: adding one creates the relationship (start date = event date); giving a relationship a start date creates (or joins) an event. One record, shown in both places. | MVP |
| EVT-5 | Each Saga picks a calendar: real (Gregorian) or fantasy (predefined or defined by the Saga admin). | MVP |
| EVT-6 | The Saga keeps a current in-world date, the default for new events. | MVP |
| EVT-7 | Timeline screen: events in date order, filtered by visibility, resource, event type, creator and dates (EVT-16). | MVP |
| EVT-8 | Timeline slider: sets the in-world moment for other views (e.g. the relationship graph shows relationships active at that date). | MVP |
| EVT-11 | Eras: named periods with a start and end date (end optional while ongoing), shown on the timeline (EVT-17) and usable as filters (an era picks its dates). | MVP |
| EVT-9 | Fantasy calendar editor (months, week days, eras, leap rules). | Later |
| EVT-10 | Timeline Set type for Stages. | Later |
| EVT-12 | Saga → Calendar (DM): Gregorian, Twelve Moons or the DM's own months; today in the story. Dates keep their day, month and year when the calendar changes; template files carry the calendar. | MVP |
| EVT-13 | Each type's sub-event list lives in the Saga template (editable on the Template page); resource sub-events take any text, the list being suggestions. | MVP |
| EVT-14 | The moment in the story (timeline slider) is shared with the relationship graph. | MVP |
| EVT-15 | Events show as a **timeline** or a **list** (EVT-19) (remembered); the filters on top serve both. Clicking an event (a list card, an expanded box) opens the whole event in a modal, with a link to its page. | MVP |
| EVT-16 | Date filters: from and to (each optional); an event counts when any of it is inside; an era's chip sets them to its period; "Clear filters". | MVP |
| EVT-17 | The **horizontal timeline**: a line with ticks by zoom (days, months, years); circles in the type's colour, bars for periods; what would touch piles up (periods first, circles over them); eras colour the line (two alternating colours) with long ticks at their ends; today and the moment as lines. Events start collapsed; clicking one (or Expand all) draws a dashed line up to a box (title, dates, the start of the description) placed left or right of it where it fits (a period's box covers the period). Wheel zoom, drag pan, Fit, Today; a **minimap** of the whole timeline shows the part in view and moves it. | MVP |
| EVT-18 | An event may have an **end date** (the event kind's Ends, the app's: never deleted; older templates get it): never before its date; such an event is a period on the timeline. | MVP |
| EVT-19 | The events **list** is plain: one row per event (date or span, icon, name, type colour, the start of what happened, resources and relationships involved, its eras), oldest or newest first; later than the moment dimmed. | MVP |

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

## Saga templates (TPL)

See `concepts/rulesets.md` ("Saga templates").

| ID | Requirement | Priority |
|----|-------------|----------|
| TPL-1 | A **Saga template** holds: character, item, document and location **variables** (shared and per type), types (character types, item categories...), who sees what per type, character categories, display templates (characters and items), starting groups, Actors Scene starting tabs, turn order, fog presets. | MVP |
| TPL-2 | Each Saga has its **own copy** (the built-in one until the first change); changes apply to the Saga at once. | MVP |
| TPL-3 | The **Template** (DM; a section of the Saga page): per kind, shared variables, types and a type's own variables; the variable editor (name, who sees, who edits, starting value, options, sorting, order). | MVP |
| TPL-4 | New variables: text, long text, number, yes/no, choice, counter. Keys come from names and never change, nor types. | MVP |
| TPL-5 | Deleting a variable keeps saved values (hidden). The app's own variables (name, controllers, parent) stay; types in use stay. | MVP |
| TPL-6 | A type changes who sees a shared variable (overrides). | MVP |
| TPL-7 | Add, rename and delete types (item categories, character types...). | MVP |
| TPL-8 | **Starting content**: groups, Actors Scene tabs (names, layouts, turns: not layout settings), turn order. New Actors Scenes start with the tabs. | MVP |
| TPL-9 | **Export** a Saga's template as a JSON file, with its categories, display templates (and their defaults) and fog presets. | MVP |
| TPL-10 | A **new Saga from a template file** (system admins), starting with everything in it. | MVP |
| TPL-11 | **Import** a file into a Saga: its variables and types replace the Saga's; its categories, display templates and fog presets are added where missing; refused if it lacks a type in use. | MVP |
| TPL-12 | **Actions** in the template: group actions (short and long rests: consume supplies, recover HP) and world actions, as rules the DM defines. | Goal |
| TPL-13 | The Template page edits events too, adds **date** variables (any kind) and each type's sub-event list. | MVP |
| TPL-14 | The Saga template's **dice rolls** (starting content): the roll types new Dice rollers start with, edited on the Template page. | MVP |
| TPL-15 | The Saga template's **group variables** (`group_attributes`): the Template page's Groups tab adds, edits, moves and deletes them like a kind's shared variables (no types; no who-sees rules asked, groups being the DM's); exported and imported with the template. DnD Lite has *Shared gold*. | MVP |

## Items (ITEM)

| ID | Requirement | Priority |
|----|-------------|----------|
| ITEM-1 | **Items tab** for every member: the items they may see, search, category and tag filters; new item (DM) picks its category. | MVP |
| ITEM-2 | Items have shared variables and their **category**'s own (DnD Lite: weapon, armor, consumable, gear, treasure). | MVP |
| ITEM-3 | An item's page: its **sheet** (the item display template's informative mode) for everyone who sees it; the DM's form beside it. Item links and inventories open the same sheet. | MVP |
| ITEM-4 | **Item display templates**: per item category a default; built from the category; edited like character templates (sheet only). | MVP |
| ITEM-5 | A character's **inventory** lists items (add with the picker, remove). | MVP |
| ITEM-6 | Item quantities and per-owner copies (three potions; this character's longsword). | Later |
| ITEM-7 | The item editor is the same full-screen tabbed editor (Admin, Identity, Variables). An item with a counter (Uses, charges) can be **used** from a character's inventory: one less, by the DM or whoever may change that inventory. | MVP |

## Documents (DOC)

| ID | Requirement | Priority |
|----|-------------|----------|
| DOC-1 | **Documents tab** for every member: the documents they may see, search, type and tag filters; new document (DM). | MVP |
| DOC-2 | A document is **pages** in order, each a text (title, text) or a picture (title). | MVP |
| DOC-3 | The **reader**: one page at a time (arrows, the page list, ← → keys); the resource view opens documents in it. | MVP |
| DOC-4 | The DM adds text and picture pages, edits titles and text, reorders and deletes pages; picture pages count against the "document" upload category's limit. | MVP |
| DOC-5 | Per-page visibility (reveal a document page by page). | Later |
| DOC-6 | PDFs and other files as documents. | Later |
| DOC-7 | **Folders**: the DM files documents in folders (LORE-12); the Documents tab lists them (all grouped by folder, one folder, or those in no folder). | MVP |
| DOC-8 | The DM makes, renames and deletes folders (documents stay, out of any folder) and files documents by dragging their cards onto a folder or with the document page's folder picker; a new document made in an open folder goes in it. | MVP |
| DOC-9 | Members see a folder when it's shown to them or holds a document they can see, with the count of those only (LORE-12). | MVP |

## EFX: environment effects (EFX)

| ID | Requirement | Priority |
|----|-------------|----------|
| EFX-1 | An **EFX** page (top bar, DM only) where the DM builds **environments** (later other EFX, like sounds). | MVP |
| EFX-2 | An environment has three layers: **far background** (sky, space, colours, abstract, a picture; opaque), **near background** (landscape, fog, abstract, a transparent picture; can be empty) and **foreground** (weather, fog, abstract, vignette; procedural only). Each layer stacks up to 4 effects, in an order the DM sets. | MVP |
| EFX-3 | The effects: colours (plain, vertical, radial); a **sky** (time of day, sun or moon, stars, clouds, wind); **space** (nebulae, stars, a planet, drift); **abstract** (bokeh, aurora, silk, light rays, dust); a **picture** (uploaded, "Environment pictures"); a **landscape** (mountains, hills, forest swaying, water shimmering, buildings; colours, height, variation); **weather** (rain, storm with lightning, snow, hail, sandstorm, leaves, wind, embers as short strokes, dark motes, fireflies; wind, size, chaos, length, colour); **fog** (near or fore: sliding banks; speed and direction, size, opacity, how low it lies, colour; density is the intensity); a **vignette**. Animated. | MVP |
| EFX-4 | Animated effects have an **intensity range** and **change every N seconds** (0: steady): the intensity eases to a new value in the range each period, the same on every screen (follows the clock). | MVP |
| EFX-5 | A **live preview** of the three layers, with an optional sample Stage between near and fore, and full screen; changes save by themselves and show live on the Stages using the environment. | MVP |
| EFX-6 | Examples to start from (our own): Starry night, Stormy coast, Deep space, Autumn forest, Desert noon, Ember cave, Dreamscape; duplicate, delete. | MVP |
| EFX-7 | A Stage has one environment (Build's Stage panel). **EFX Sets**: far background, near background, foreground (each shows its layer of the Stage's environment; they never catch clicks; fill their box; added at the back or the front, full screen / covering the other Sets, frameless) and **EFX Controls** (the DM's, in the Set bar: the environment in a dropdown, an eye per EFX layer, a link to the EFX page; the Set see-through). | MVP |
| EFX-8 | Players get the layers' effects (pictures as signed URLs), never the environments or the DM's choices; the effects check against a catalog on the server. With reduced motion asked for, effects stay still. | MVP |
| EFX-9 | Sounds and music as EFX; environments per Actors Scene tab. | Later |

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
| UPL-14 | Upload category **Token pictures** (custom map tokens; 0.3 MB, 512 px): temporary, deleted with their token. | MVP |
| UPL-15 | Upload category **Desktop pictures** (3 MB, 2560 px): temporary, deleted with their Desktop piece. | MVP |

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
| UX-10 | The top bar has one tab per page (Stage, Stages, Characters, Locations, Items, Lore, Saga); a page's sections are in the **section bar** under it (UX-13). | MVP |
| UX-11 | The **Saga page** (DM) holds what's about how the Saga is set up: Members, Template (the Saga template), Display templates, Calendar; later Saga settings join it. | MVP |
| UX-12 | Moved pages keep working from old addresses (redirects). | MVP |
| UX-13 | The **section bar**: a second menu strip under the top bar, on every page of a top page with sections (Characters › Characters, Groups; Locations › Places, Fog presets; Lore › Documents, Events, Relationships; Saga › Members, Template, Display templates, Calendar, Settings, User; players: User only, so no bar). It names the page, underlines the current section (sub-pages too) and is left out when there's only one section; page headings name the section. | MVP |
| UX-14 | The **combo tray**: wherever several things are picked together (who can see, who can edit, members, groups), one button says the pick and opens a tray in sections (special cases, groups, people with a search). | MVP |
| UX-15 | **Colour theory** helpers (contrast, readable ink and complements) keep anything drawn in a member's colour readable. | MVP |
