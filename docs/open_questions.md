# Open questions and decisions

When a question is settled, move it to **Decided** with the date, and update the related docs.

## Open

### Access

- **Account scope**: is an account global to the instance (one login, member of several Sagas with
  different roles), or created per Saga (one login per Saga)? Saga admins "create users for their Saga"
  either way; the difference is whether they can also add an existing account.
- **System admins and Saga content**: can a system admin open a Saga's lore and Stages (support), or
  only manage it from outside (privacy)?
- **Saga admin limits**: can a Saga admin remove another Saga admin, or only a system admin?
- **Group permissions**: beyond visibility, which permissions will groups carry later (move tokens,
  edit lore pages, see the DM's notes...)?

### Product

- **Name of the leader role**: "DM" in the UI, or a neutral "GM"/"Narrator" since the app is system-agnostic?
  (Internally the role is `admin`.)
- **Grab attention behavior**: does it lock the member's view until released, or move it once and let
  them pan away? Does it force the Stage tab open or just notify?
- **Groups for players**: should players see their own party (a player party they belong to) in a Groups view?
- **Player interaction on Stages**: can players move their own token, ping or draw in the MVP, or is
  the Stage view-only for players at first?
- **Second screen**: a "table display" mode (TV showing the live Stage)? It could simply be a viewer account.
- **Characters**: who creates player characters (player or admin)? (What players can edit follows the ruleset's edit rules.)
- **DnD Lite**: PC- and NPC-specific attributes, default visibility/edit rules, and the Document type
  (Location and Item types are set).
- **Paths and regions through the fog**: a path or region shared with players shows all its tiles (and a
  region its name), even over unknown ones. Should they be clipped to the tiles they know?
- **Players on maps**: should a player click take them into a location's map for themselves only (now), or
  can the DM let players drive the shown location of a World map?
- **Documents page by page**: should the DM reveal a document's pages one at a time (per-page visibility)?
- **Item quantities**: inventories list items; how do quantities and per-owner copies work (three potions, this
  character's longsword)?
- **Actions** in the Saga template (group and world actions: rests): how the DM writes them (a small rule editor:
  consume X, recover Y, for whom), and how they run (a button on the party, a Stage command).
- **Tokens**: characters moving on a location's tiles (the Battle grid): actors on tiles, or links that move?
- **Shown locations' pages**: a location shown on the live Stage opens for players there (its map) even if its
  page isn't shared; should its details (description, tags) open too? Resource-model questions are listed in `concepts/rulesets.md` (Open points).
- **Relationships**: open points listed in `concepts/relationships.md` (matching rule, reveal as copy or
  link, references in the graph...).
- **Events**: open points listed in `concepts/events.md` (undated events, who creates eras...).

### Rulesets

- Ruleset file format: JSON or YAML; JSON Schema for validation?
- Formula language for derived values (safe expression language vs. fixed functions).
- Can a Saga change ruleset or version after creation?

### Technical (pick when the features need them)

- How real-time scales past one API process (Redis pub/sub?).
- Canvas library for heavy Sets (battle grid, map with fog): plain DOM is enough for the Creature panel.
- Object storage for files (S3-compatible service, Railway bucket...): v1 stores pictures in Postgres.
- Auth: add OAuth (Google, Discord) next to login/password?
- Mobile: responsive web first, native app later?

## Decided

| Date | Decision |
|------|----------|
| 2026-11-19 | App name: **SagaCraft**. |
| 2026-11-19 | Stages and Rulesets are the core of the app; everything else supports them. |
| 2026-11-19 | System-agnostic through data-defined Rulesets. Reference ruleset for development: **DnD Lite**, our light take on D&D 5e 2014. |
| 2026-11-19 | Ruleset editor is a project goal; v1 may be a plain data file. |
| 2026-11-19 | Not a full VTT and no full rule automation: light resource tracking only. |
| 2026-11-19 | One live Stage at a time; members see it in a Stage tab and can use the rest of the app freely. |
| 2026-11-19 | Stages are made of Sets with position, size, layer and visibility; first Set types: image, map, battle grid, relationship graph. |
| 2026-11-19 | Stack: **Python backend, React frontend, PostgreSQL**. Libraries and tools are picked later, per feature, in implementation plans. |
| 2026-11-19 | Runs locally with **Docker**; prepared from the start for easy deploy on **Railway**. |
| 2026-11-19 | One backend instance hosts many **Sagas**; the Saga is the main division of concerns (replaces "campaign"). |
| 2026-11-19 | System admins manage the instance; they create other system admins with chosen permissions, create Sagas and their Saga admins. |
| 2026-11-19 | Saga roles: **admin (DM)**, **player**, **viewer**. Saga admins create the Saga's users. |
| 2026-11-19 | **UX is the top directive**: the app aids playing and gets out of the way; UX wins trade-offs by default. Speech recognition and AI help are long-term goals. |
| 2026-11-19 | A ruleset defines the Saga's **resources** (kinds: Document, Character, Location, Item), their types and subtypes, structured attributes with per-group visibility, and the relationships between resources. Locations nest to build the world map. |
| 2026-11-19 | DnD Lite characters: types PC and NPC; shared attributes Name, HP (current/max), Initiative, Players in control, Inventory (list of Items). |
| 2026-11-19 | **Relationships** are user data, not ruleset: admins and players link any two resources with a typed relationship (directed or undirected; predefined + custom types). Each records its creator and role. Ruleset links are called **references**. |
| 2026-11-19 | Relationship **graph viewer**: built on demand by the backend from a query (connections between characters, within a set with N hops...), rendered by the frontend; available as a screen and as a Stage Set (replaces the manual relationship map). |
| 2026-11-19 | **Events**: in-world date, description, resources, sub-events (resource event types, relationships). Dated relationships and relationship sub-events are the same record. |
| 2026-11-19 | Each Saga picks a **calendar** (real or fantasy); a **timeline** screen and slider show the saga over time. |
| 2026-11-19 | Relationships **belong to groups**: members see only their groups' relationships; players add, edit and remove relationships and relationship types in their own groups. The DM's truth lives in `admins`. |
| 2026-11-19 | Relationships have a **start and end date**, each an in-world date or "always". |
| 2026-11-19 | **Event is a resource kind**. Events have one exact date (no partial dates, no durations) and one level of sub-events. Periods are **eras** (named, with start and end date). |
| 2026-11-19 | First version tools: FastAPI + SQLAlchemy 2 + Alembic, psycopg 3, bcrypt + PyJWT; React + TypeScript + Vite, react-router, framer-motion; Stage canvas in plain DOM + CSS transforms; WebSockets (in-memory hub). |
| 2026-11-19 | v1 accounts are global to the instance: a Saga admin creates a new account or adds an existing one by login. |
| 2026-11-19 | First Set type: **Creature panel** (cards, per-attribute display modes and audiences, discrete threshold, layouts, highlight/spotlight/attention, animations). |
| 2026-11-19 | **Picture uploader**: crop, rotate/mirror and colour tools in the browser; resized and compressed to per-category limits (character, item, document, map) set by system admins; checked again on the server (Pillow). |
| 2026-11-19 | Every Stage has a **Build view** and a **Play view**. The DM's Stage tab is Play on the live Stage. Build's side panel shows only the selected thing; Play acts through popups. |
| 2026-11-19 | Creature panel: arrangement = shape (grid, row, column, circle, free) + order (manual, initiative); each value has "how players see" and "how DM sees"; value editor steps: one order of magnitude below the value's scale, and 1. |
| 2026-11-19 | Creature panel cards are always compact (no card size). "Picture" became **card style**: face, none, full. |
| 2026-11-19 | Creature card settings split into **Player view** and **DM view** (same options). Values: style (bar, number, balls) + displayed on (card, hover tray, hidden). Card visibility is shown/hidden per view, no per-group choice; per-value audiences dropped. Panel **spacing** setting (circle grows with it). |
| 2026-11-19 | **Display templates**: how characters are displayed is set once per template (cards: face/full/none; sheets: immersive/informative; player and DM views), not per card. Each type has a default; a Set may pick another per type. The name players see (alias / hidden) lives on the character. Characters tab: sections per type, sort by name/level/date, click opens the sheet. |
| 2026-11-19 | Groups: default `admins`, `players`, `viewers` (automatic by role) plus custom groups, used in visibility and later permission settings. |
| 2026-11-21 | **Saga templates**: a Saga starts from a Saga template = ruleset + starting categories and groups (v1: one per ruleset, in the ruleset file, key `saga_template`). Code keeps the name `ruleset` for the rules part. |
| 2026-11-21 | **Categories** organize characters (defaults Player, DM, NPC, renamed below; the DM adds and deletes them). Each category is based on a ruleset type: picking the category picks the type. Characters tab sections and default display templates go by category. |
| 2026-11-21 | **Groups** are sets of characters (parties): name, player party, active, favorite, creatures; default "Player Party". Groups tab, favorites first. Member groups (visibility) keep their role and are called *member groups* in docs. |
| 2026-11-21 | **Instanceable** characters (never player characters) become numbered **instances** when added to a Set, each with its own current values (stored as changes over the character). Non-instanceable characters are the same everywhere. |
| 2026-11-21 | The Creature panel becomes the **Actors Scene**: tabs (default Exploration, Dialog, Combat), each with its **own cast** (creatures added on a tab go to that tab only), layout, order and turns; card style and templates are the scene's. (Cast: changed the same day, see below.) |
| 2026-11-21 | Adding a group to a scene is a **one-time shortcut** for adding its creatures one by one: no link to the group afterwards; groups can be added again and several at once. |
| 2026-11-21 | New layouts **turn bar** and **boundary**; **initiative flow** static/rotate for grid, row, column and circle. Order custom or by attribute, edited in the **order tray** (move up/down, initiative in place); **turn controls** (start, previous, next, end) per tab; current-turn highlight. Defeated creatures are skipped. |
| 2026-11-21 | Set types get **commands** (named actions with parameters) through one generic Set command route. |
| 2026-11-21 | Display templates become **lists per region**: the DM adds, orders and styles elements (values; system elements Name, Category, Group); hidden = not added; "style" is now **value style** ("balls" → **discrete**); a new **view style** (bar shape, gradient, icons, color, number color, show name). Regions: cards top / bottom / hover left, right, bottom; immersive top left, center, right / bottom center / bottom panel / hover left, right; informative **header** (was "highlight") and a paged **page body**. Older templates are upgraded when read. |
| 2026-11-21 | **Colors**: each group and each template has one. A card's group is the one it was added with, else the character's first; its color drives the current-turn highlight and the Turn tag. |
| 2026-11-21 | Character pictures show in the **card ratio** (5:7) or as the **face crop** (1:1); the immersive sheet has the card's ratio and no longer shows the category (unless added). |
| 2026-11-21 | DnD Lite categories: **Player**, **Major NPC** (NPC, not instanceable) and **Minor NPC** (NPC, instanceable), each with its own built-in template ("DM" was a bad name). Existing Sagas keep their categories. |
| 2026-11-21 | Actors Scene: the **cast is the scene's**, the same in every tab (replaces "each tab has its own cast"); shown/hidden and positions stay per tab. Turn controls move to a bar under the tab strip; in Build it holds "+ Add creatures". Groups tab: player parties and other groups in separate sections. |
| 2026-11-22 | **Locations** are a resource kind with **sub-locations** (the ruleset's `parent` attribute) and the DM's **tags** (any resource). A **Locations tab** for everyone: search, top level only, tags. A parent a member can't see doesn't show: the location is at the top level for them. |
| 2026-11-22 | A location's **map** is app data, not attributes: pictures (snapped side by side), a **grid** (square, pointy-top hex, none; physical size; lines in a colour, contrast or inverse), **fog of war per member group** (unknown, known, visible; best of a member's groups), **links** (resources on tiles) and **paths** (tiles in order, poly or spline). Tiles are kept by column and row from the top left: resizing adds or drops the last ones. |
| 2026-11-22 | Players never receive a map's pictures: a **composed picture** made on the server for their fog (black outside known tiles), signed per fog. The grid and fog are drawn by one WebGL shader (per pixel): fast at any size. |
| 2026-11-22 | Map Sets: **World map** (a list of locations, one shown; who may click per role; fog display flat / immersive / animated; fog styles mist, smoke, clouds, ink, parchment, void; play tools; highlight and grab attention on tiles) and **Local map** (one location, simple). The locations are the Set's actors; grab attention gains Set-type targets. |
| 2026-11-22 | Immersive fog fades **inside the known tiles** (the map's colour from visible tiles, the fog from unknown ones); unknown tiles are pure fog. So nothing outside what players know is needed, and visible tiles stay full. |
| 2026-11-22 | Every resource can have an **icon** (upload category of its own: "icon image size") and **galleries** (`many` image attributes); upload categories gain **how many pictures per resource**. A universal **resource picker** and **resource view** (characters open their sheet, informative). |
| 2026-11-21 | Layout controls: every layout has a **distance to top**; grid, row and turn bar have **horizontal** and **vertical space** (a row, one line, uses only the horizontal). Boundary: the right side fills from the top right corner leftwards; a **neutral zone** (% of the width) stays empty in the middle; **scatter** is a px value (random x and y shift per card up to it; older "on" became 12 px). |
| 2026-11-22 | Paths with an **arrows** or **arrowheads** body are a string of them, with no line; lines, arrows, heads and tails have a dark contour. |
| 2026-11-22 | **Regions** on maps: named groups of tiles, filled, outlined or both; the border follows the tile edges or a spline (Catmull-Rom through the border edges' middles); the name shows on the tile nearest the middle; own visibility. Players get the regions shared with them (not clipped by fog, like paths). |
| 2026-11-22 | Map Sets' **highlight**: every other tile much darker, the highlighted tiles unchanged with a splined border (5 map px, like a normal path); the DM can highlight a region. The same border code draws regions and the highlight. |
| 2026-11-22 | Immersive fog also fades from **visible into unknown** tiles: the fog creeps into the visible tiles' edge (their picture is real there), with the same falloff as known tiles. Tiles off the grid don't count. **Void** uses the fog colour as its sky, motes 5% to 50% of their old size; new **Nebula** style. |
| 2026-11-22 | The location page and the map Sets' full editor take the whole window (no page width limit); a **Full screen** button uses the browser's full screen. |
| 2026-11-22 | Immersive fog: **visible tiles always fully shown**, known tiles fully seen; the fog's soft edge moves into the **edge ring** (unknown tiles touching known or visible ones), whose picture players now get: they glimpse up to one tile beyond what they know, never farther. Replaces "the fog creeps into visible tiles" (a one-tile corridor was barely visible). |
| 2026-11-22 | Map Sets' highlight: a brush with sizes (a stroke starting on a highlighted tile removes); **on / off** keeps the tiles; grab attention on tiles zooms the view up to the Stage's maximum, and the title menu's grab attention targets a shown highlight. Nebula drawn at half its size. |
| 2026-11-22 | Map Sets draw the **grid only on known and visible tiles** (Play and players' views; Build shows it everywhere). The location page keeps it everywhere: it's where the grid is set up. |
| 2026-11-22 | The fog has **three colours** (each style gives them roles, e.g. nebula: space, gas, second gas), a **size** (×0.25 to ×4) and an **intensity** (the style's main variable), replacing the single tint. Picking a style applies its own colours (kept on the server, `FOG_PALETTES`); "Reset" brings them back. Sets saved with the old single colour get their style's colours. |
| 2026-11-22 | **Fog presets** replace the map Sets' own fog settings: the DM builds them in the Locations tab (with a live preview on a sample map), a World map picks one. Every Saga starts with **White mist** (soft mist, light greys and white, drifting slowly); at least one stays; Sets on a deleted preset use the first. A preset adds **motion** (replaces "static / animated"), **edge** and **known tiles** to style, colours, size and intensity; the displays become **soft** and **flat**. New styles: **embers**, **blizzard**, **depths**. |
| 2026-11-22 | The **Saga template** becomes each Saga's own data (a copy of the built-in one on the first change), edited on a **Template** page: variables (attributes) per kind, shared or per type (item categories, character types), who sees and edits them, overrides per type, starting groups, Actors Scene tabs, turn order. Categories, display templates and fog presets stay the DM's runtime data, edited where they live, and go with an **export** (JSON file); a new Saga can start from a file; a file can be imported into a Saga (definitions replaced, the rest added by name). |
| 2026-11-22 | "Character templates" and "item templates" are the **display templates**; items get informative-sheet templates, one default per item category. Item categories are item **types** with their own variables. |
| 2026-11-22 | **Documents** are pages (text or picture) in one `pages` variable; reader page by page; per-document visibility for now. **Items**: DnD Lite categories weapon, armor, consumable, gear, treasure; inventories list items (no quantities yet). |
| 2026-11-23 | **Document folders**: one level (no sub-folders), a table with a `kind` (only documents use it), sorted by name (numbers in order), no manual order. Players see a folder only when it holds a document they see. Deleting a folder keeps its documents. The DM files by dragging cards onto folders or with a picker on the document page. Folders don't go in template exports. |
| 2026-11-23 | **Lore tab**: Documents, Events (the timeline) and Relationships move into one Lore tab (replacing the Documents tab). The calendar joins the Saga page. |
| 2026-11-23 | **Relationships built**: masked ends for hidden resources; revealing copies; players may move relationships between their groups; an end date doesn't make an event; template references can show in the graph; the graph Set (groups and query picked by the DM, layout placed by the DM) replaces the manual relationship map. The graph is drawn with our own deterministic force layout (no new library). |
| 2026-11-23 | **Events built**: every event has a date (default: today in the story); dates are one number per day in any calendar; calendars Gregorian, Twelve Moons (ours, DnD Lite's default) or the DM's own months; sub-event lists per type in the Saga template, as suggestions; eras are the DM's, with visibility. A dated relationship makes (or joins) an event; one record. |
| 2026-11-23 | **Stage layouts**: a Stage is a **canvas** (today's world) or an **interface** (Sets fixed to the screen by an anchor and % sizes, offsets in %); layers are reordered from a Set list in Build. The live **Stage tab takes the whole window** (✕ back to the last page). Map Sets zoom and pan inside the map; maps get **labels** (pins with text, on click or always, hidden on unknown places). Graph nodes and map resources show the picture's face when there's no icon. |
| 2026-11-24 | **Set controls in toolbars**: each Set type groups its controls in toolbars (every Set has a main one, with ⚙ for its settings: the title no longer opens a menu). The DM places each toolbar in Build: anchor (corners, edge middles), across or down, distance in px, size S/M/L, shown or hidden; on a canvas Stage relative to the Set, inside or outside it; on an interface Stage relative to the screen. Toolbars at one spot stack instead of overlapping, always above the Sets. Toolbars float, so the DM's Play view lays Sets out like the players'. Only changes from the type's defaults are stored. |
| 2026-11-24 | **Events can last; a horizontal timeline**: an event may have an end date (the event kind's Ends, the app's; older templates get it): a period, never ending before it starts. Lore → Events is a timeline or a list with shared filters (dates from/to, eras pick their period). The timeline: ticks by zoom, circles by type colour, bars for periods, piled up where they'd touch; eras colour the line in two alternating colours; events expand into boxes placed where they fit; a minimap shows where the view is. |
| 2026-11-24 | **Section bar, the eye, the location map**: a page's sections move to a second menu strip under the top bar (naming the page, underlining the section; headings name the section); the DM can put a Set away with the eye on its main toolbar (drawn for no one, players aren't sent it); Locations has a location map: places, links on their maps, "part of", places of the same place in one coloured region; clicking opens the place. |
| 2026-11-23 | **Navigation**: Groups becomes a section of Characters; a new **Saga** page (DM) holds Members, Template and Display templates (display templates cover characters and items, so they leave the Characters page). Sections are tabs under a page's title with their own addresses; old addresses redirect. |
