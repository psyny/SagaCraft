# 19 - Who sees and edits, folders everywhere, the combo tray, the Timeline Set, the live link

Status: Done
Requirements: VIS-6, VIS-7, VIS-8, CHR-15, LORE-12, LORE-13, EVT-19, SET-52, STG-26, SAGA-8, UX-14 (DOC-7 to DOC-9
reworded, VIS-1 and EVT-15 updated)
Depends on: 12-document-folders-and-navigation, 13-lore-relationships-events, 16-events-timeline

From the draft `docs/drafts/improvements.md` (deleted once built).

## Goal

1. Lore → Events' **list** becomes a plain, informative list (the timeline stays the timeline).
2. A **Timeline Set** shows the Saga's timeline on a Stage.
3. **Locations and Items get folders** like Documents, and a folder gets its own **who can see**: *Inherit* (the
   resources keep theirs) or a choice that **overrides** its resources'. Members see a folder when the folder is
   shown to them or when it holds something they see.
4. **Who can see / who can edit**:
   - Characters get a **who can edit**.
   - "All viewers" goes away: viewers see what players see, and never edit.
   - **Owner** is a new choice in both.
5. Those choices (and the other "pick several" lists) move from chips laid out in place to a **combo tray**: a button
   that says what's picked and opens a roomy picker.
6. A **live link**: a URL that shows the live Stage, as a viewer, to anyone who has it. Nothing else in the app is
   reachable through it, and it needs no sign-in. The DM turns it on or off in the Saga settings.

## Out of scope

- Sub-folders.
- Folders for characters: they have categories and groups.
- Folders for events: they have types and eras.
- **Who can edit** for kinds other than characters: their variables are the DM's (the Saga template allows "its
  players" only on characters).
- A QR code for the live link (a later nicety for tablets).
- Several live links per Saga, or links to one Stage (it's always the live one).
- Players making resources (and so owning what they make).

## UX

- **Combo tray** (`components/ComboTray.tsx`): wherever several things can be picked together, there's one button
  showing the pick ("Admins only", "All players", "Owner · Party A", "Ana, Bruno +2"). Clicking it opens a tray (a
  modal) in sections:
  - **Special**: Admins only / All players / Owner / Inherit, where they apply.
  - **Groups**: the custom member groups.
  - **Players**: each player, with a search once the list is long.

  Picks apply at once; Done or Esc closes it. It's one component used by every who-can-see and who-can-edit, the
  "Players in control" and Owner fields, and a character's groups.
- **Viewers**: the choice is gone everywhere (resources, Sets, Actors, eras, map paths, regions, labels, the Template
  page's "who sees" and "who edits"). A viewer sees whatever players see, and edits nothing.
- **Owner**:
  - A character's owners are its **Players in control**.
  - Any other resource gets an **Owner** field (players; the DM's).
  - "Owner" in who can see shows the resource to its owners; in who can edit, it lets them edit.
  - It's most useful on folders: a "Journals" folder with who can see = Owner shows each journal to its owner only.
- **Who can edit** (characters; the DM's): the same tray, Owner by default (today's behaviour: the players in control
  edit). It lets members edit the variables the Saga template opens to "its players". Whoever can edit a character
  also sees it.
- **Folders** (Documents, Items, Locations): the same sidebar.
  - Each folder gets a ⚙ (DM): name and **who can see**, Inherit by default.
  - A folder that overrides shows a small eye mark in the sidebar.
  - A resource in such a folder shows "Who can see: set by the folder *Journals*" in its form instead of its own
    picker. Its own setting is kept, and comes back when it leaves the folder.
- **Events list**: one row per event, in date order:
  - its date (or span);
  - the icon, name and type (with the type's colour);
  - the start of what happened, and how many resources and relationships are involved;
  - the eras it falls in, as small tags.

  An Oldest / Newest first switch. No rails, year rows or era rows. Events after the moment are dimmed, and clicking
  a row opens the event as before.
- **Timeline Set** (Build: add "Timeline"): the horizontal timeline in the Set's box; players pan and zoom.
  - The DM picks **whose knowledge** it shows (member groups; the players by default, as on the relationship graph
    Set), dates from and to (or an era), the event types, and whether events start **expanded**.
  - Clicking an event expands or collapses its box (no page to go to on a Stage).
- **Live link** (Saga → Settings, DM):
  - "Live link: Off / On".
  - When on: the link, **Copy**, and **New link**, which makes a new address so the old one stops working.
  - Opening the link shows the live Stage full screen, like a viewer's Stage tab but with no top bar and no ✕. It
    follows the live Stage in real time.
  - When the link is off or replaced, the page says so.

## Design

### Visibility

- **Viewers**:
  - `viewer_for` adds the `players` group to a viewer's groups.
  - In a ruleset rule, `players` also lets viewers see.
  - `rule_allows(..., edit=True)` is always False for viewers.
  - Relationship writes were already players' and admins' only.
- **Owner flag**: a visibility may hold `"owner": true` (`domain/visibility.normalize` keeps it), and
  `can_see(viewer, vis, owners)` honours it.
- **Owners**: `services/resources.owner_ids(ruleset, resource)` returns the controllers variable for characters, else
  the new `resources.owners` column (a list of member ids).
- **Who can edit**: `resources.editors` (characters; a visibility, None = `{"owner": true}`).
  - `controller_ids(ruleset, resource, viewer)` returns the owners, plus the viewer when the editors name them or one
    of their groups, but never for a viewer.
  - Every place that used the controllers set (names, displays, relationships, maps) passes the viewer.
- **Folders**:
  - `resource_folders.visibility` (None = Inherit) and any kind of document, item or location.
  - `Resource.folder` is loaded with the resource (`selectin`).
  - The effective visibility is the folder's when it overrides, else the resource's own. `can_see_resource` uses it,
    and so does the admin "hidden" mark.
  - `list_folders`: a folder shows when the folder visibility lets the member see it, or when it holds a resource
    they see.
  - `PATCH /folders/{id}` takes `visibility`; it is admin only, and the push refreshes the lists.
- **Migration**:
  - New columns: `resources.owners`, `resources.editors`, `resource_folders.visibility`, `sagas.live_token`.
  - Data: the `viewers` group id comes out of every stored visibility (resources, eras, Sets, Actors, map paths,
    regions and labels). A viewers-only item becomes admins only, which the DM can see and change, where before it
    was a choice they could no longer see.

### The Timeline Set

- `set_types/timeline.py`:
  - Config: `groups` (whose knowledge; players by default), `from`, `to`, `types`, `expanded`.
  - It renders through `RenderContext.events` (`services/events.EventBook`): the timeline as seen by a viewer with
    those groups (`timeline_for(db, saga_id, viewer)`, shared with Lore → Events), filtered by the config. The
    calendar and today come with it, so the Set is self-contained.
  - Admins also get their config and the groups.
- Frontend `stage/sets/timeline/`: the view wraps `TimelineView` (with `data-wheel`), and an inspector sets the
  config. `TimelineView` gets `onOpen` optional: without it, clicking a box collapses it.

### The live link

- `sagas.live_token`: None means off. A token is 22 URL-safe characters (secrets.token_urlsafe(16)).
  - `PUT /sagas/{id}/live-link` `{on: bool}` turns it on (keeping the token) or off.
  - `POST /sagas/{id}/live-link/new` makes a new token.
  - Both are admin only, and the token is shown only to admins, in the overview.
- `GET /api/live/{token}`: no sign-in. It returns `{saga: {name, calendar, story_date}, stage}`, as seen by a
  **guest viewer** (`Viewer(member_id=0, role="viewer", groups={viewers, players})`). An unknown token gets 404.
- WebSocket `/api/live/{token}/ws`:
  - The hub keeps guest connections with the token.
  - Every rebuild checks the token is still the Saga's: if not, it sends `live_closed` and closes.
  - Attention messages reach guests like viewers.
  - Turning the link off or replacing it pushes to the Saga.
- Frontend `/live/:token` (`pages/LiveScreen.tsx`), outside sign-in. A small provider gives the Stage views what
  they need (the calendar, a viewer `me`, no members).

### Events list

- `saga/lore/EventList.tsx` (pure helpers tested): rows from the filtered events and the eras.
- The old list (`timelineRows`, rails) goes.

## Tools chosen

| Need | Choice | Why |
|------|--------|-----|
| Live link token | Python `secrets.token_urlsafe` | Unguessable, URL-safe, no library |

## Steps

- [x] Backend: viewers as players, the owner flag, owners, who can edit, the controllers set with the viewer.
- [x] Backend: folders for every kind, with who can see (inherit or override).
- [x] Migration (columns and viewers clean-up).
- [x] Backend: Timeline Set (`timeline_for`, EventBook).
- [x] Backend: live link (settings, guest routes, socket).
- [x] Frontend: ComboTray; VisibilityPicker on it (owner, inherit); members and groups fields on it; viewers gone.
- [x] Frontend: Owner and Who can edit on the resource form; a folder's override shown.
- [x] Frontend: folders on Items and Locations; folder settings.
- [x] Frontend: Events list.
- [x] Frontend: Timeline Set.
- [x] Frontend: Saga → Settings (live link) and the live screen.
- [x] Tests; checked in the running app; docs.

## Tests

- **Backend**:
  - viewers see players' things and never edit;
  - owner visibility;
  - who can edit (groups, members, owner; never viewers);
  - folder override and inherit, and folders shown by their own visibility;
  - the Timeline Set renders only the chosen knowledge;
  - the live link: off, on, new token, a guest's view, Saga isolation, an unknown token.
- **Frontend**: ComboTray summaries; the event list's rows; the timeline Set view renders.

## Changes from plan

- Member groups' members (Saga → Members) also moved to the combo tray; the Template page's "who sees / edits" keeps
  its two chips (Players, Its players: a short fixed list) and lost Viewers.
- The fog tool paints for the players by default and no longer offers the viewers' group (viewers see the players'
  fog).
- The Timeline Set's own toolbar sits outside the Set (top left), so it never covers the timeline's tools.
- A stale sign-in on a device must not send the live screen to the login page: the client skips that redirect on
  `/live/` pages.

## Changes from the draft

- "Owner" needed a meaning: a character's owners are its Players in control. Other resources get an Owner field,
  set by the DM, because players don't make resources yet.
- Who can edit covers what the Saga template opens to "its players"; the DM always edits everything.
- A folder's override keeps the resource's own setting underneath, so taking it out of the folder brings that back.
- The live link always shows the live Stage, never one particular Stage, and the DM can replace it to cut off old
  screens.
