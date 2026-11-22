# 21 - One Map Set, mobile tokens, grab attention on the view, pings

Status: Done
Requirements: SET-53, SET-54, SET-55, SET-56, LOC-26, LOC-27, UPL-14 (SET-24 and the Local map's requirements
retired)
Depends on: 14-stage-layouts-and-map-labels, 20-character-item-editors-user-page (tokens, player colours)

From the draft `docs/drafts/map_improvements.md` (deleted once built).

## Goal

1. **One Map Set.** The World map and the Local map were too alike: the World map stays, named **Map**, and existing
   Local maps become Maps.
2. **Mobile tokens** on a location's map, like labels and regions:
   - kinds: a character, an item, a group of characters, or a custom one (a name and a picture uploaded on the spot);
   - they snap to tiles, have a size in tiles, and are dragged easily (on the Set and in the map editor).
3. **Grab attention** leaves the Highlight tool: it puts every player's map at the DM's view (zoom and centre).
   Highlight is only the highlight.
4. **Ping**: players and the DM (not viewers) ping a tile. It glows in their colour, with a contour, a pin and their
   name.

## Out of scope

- Players moving tokens (the DM moves them).
- Token paths or animation along paths.
- Fog of war cast by tokens (vision).
- Pings outside map Sets (the location page).

## UX

- **Map Set** (Build: "＋ Map"): what the World map was, with the locations in its main toolbar. Old Local maps keep
  their location, as a Map with the Saga's fog preset and players' clicks off, as before.
- **Tokens**:
  - **Tokens** tool in the map editor (location page; the Set's "Full editor"): "＋ Character / Item / Group /
    Custom".
    - Character and item: pick the resource.
    - Group: pick a character group.
    - Custom: a name and a picture (upload, category "Token pictures").
  - Then click a tile to place it. The list shows each token: its size (1–4 tiles), who sees it, remove.
  - Look: a character or item shows its icon (else its face, else its initials); a group shows its initials; a custom
    one shows its picture.
  - Border:
    - a character's: its player's colour (several players: white; no player: black), in its token style;
    - an item's: its owner's colour, by the same rule;
    - a group's: the group's colour;
    - a custom token's: black.
  - **Drag** a token (the DM): on the Set in Play (with ☝ Point) and in the editor's Tokens tool. It follows the pointer
    and snaps to the centre of the tile it's dropped on. Moving one doesn't redraw the players' map picture.
  - Players see a token when it's shared with them and not on a tile their fog hides. A character or item they can't
    see shows as "?".
  - A custom token's picture is temporary: removing the token (or giving it another picture) deletes the file.
- **Grab attention** (DM, Play, live Stage): **◎ Grab attention** in the map's tools. Every view of the Set takes the
  DM's zoom and centre, and the Set pulses. **Highlight** keeps its brush, region, On/Off and Clear only.
- **Ping** (players and the DM): **📍 Ping** in the map's zoom toolbar arms one ping; the next tile clicked is pinged
  (Alt+click pings straight away).
  - Everyone who sees the Set (the live link too) sees, for about 4 seconds:
    - the tile glowing in the pinger's colour, with a thick contour;
    - a pin with their name.
  - Viewers don't ping. A member pings at most twice a second.

## Design

- **Set types**:
  - `LocalMap` goes. `WorldMap` (key `world_map`, kept so placements and toolbars stay) is named "Map", and its
    "simple" branches go.
  - Migration `e5b9c3d7a281`: `local_map` Sets become `world_map`, with interactive off.
- **Tokens** (`domain/maps.py`): `data["tokens"]`, at most 100. Each is
  `{id, kind: character|item|group|custom, ref, name, file_id, tile, size 1..4, visibility}`.
  - Map commands:
    - `tokens.save {token}`: add or change one (checks refs in the Saga, and a custom picture of category `token`);
    - `tokens.move {id, tile}`;
    - `tokens.delete {id}`: deletes its custom picture.
  - Token commands don't bump the map's version, so the players' composed picture stays cached.
  - `render` sends the tokens the viewer may see, built per viewer: `{id, kind, tile, size, name, icon, color, style}`.
- **Colours**: `resources.token_of` gives no player black (#000000), as the draft says. The frontend `tokenColor`
  matches. A black ring gets a light hairline so it shows on dark maps.
- **Upload category** `token` ("Token pictures", 0.3 MB, 512 px).
- **Grab attention**: `attention_target` takes `{view: {k, cx, cy}}`: the zoom (1–8) and the centre (0..1 of the map),
  besides tiles. `MapSetView` computes the DM's view and applies a received one.
- **Ping**: `POST /api/sagas/{id}/sets/{set_id}/ping {tile}`:
  - Players and admins only, on a map Set of the live Stage they can see, on a tile of the shown location.
  - `hub.ping` sends `{type: "ping", stage_id, set_id, location_id, tile, member_id, name, color}` to whoever sees the
    Set, live link screens included. Nothing is stored.
  - A frontend `PingContext` (Saga and live screen) feeds map Sets. `MapOverlay` draws the pings.

## Steps

- [x] Backend: one Map Set (+ migration), tokens (domain, commands, render, picture clean-up), upload category, grab
  attention on the view, ping route and hub.
- [x] Frontend: registry, tokens on the map (draw, drag, snap), Tokens tool, grab attention, ping button and drawing.
- [x] Tests; checked in the running app; docs.

## Tests

- **Backend**:
  - the Local map migration's shape;
  - tokens: save, move, delete, refs, visibility and fog, colours;
  - a custom picture deleted with its token;
  - the map version unchanged by token moves;
  - grab attention on a view;
  - pings: who may, who gets them, the rate limit.
- **Frontend**: the view maths (DM view ↔ inner view); token snapping.

## Changes from plan

- The ⚙ menu's Grab attention also left the highlight: it shows everyone the whole map; the Map tools' one shares the
  DM's view. Tiles stay accepted as a target (the server), unused by the app now.
- No-player black applies to character tokens on map links too (plan 20 drew them grey).
- A token dropped off the grid doesn't move; tokens off a shrunk grid are dropped (their custom picture stays until
  the location is deleted).

## Changes from the draft

- Item tokens take their owner's colour by the same rule as characters (the draft named only "the person in control").
- Groups' tokens show the group's initials in the group's colour (a group has no picture).
- Custom tokens' borders are black (no player); their picture is optional (a name alone shows its initials).
- Ping: 📍 then a tile, or Alt+click; ~4 seconds; at most twice a second per member; live link screens see pings too.
- Only the DM moves tokens.
