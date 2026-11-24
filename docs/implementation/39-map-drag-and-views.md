# 39 - Map views kept, dragging tokens seen live; template follow-ups

Status: Done
Requirements: SET-91, SET-92, SET-93 (TPL-18 reworded)
Depends on: 21-map-set-tokens-attention-pings, 38-categories-in-the-template

From the user's request (no draft file).

## 1. Map Sets

### UX

- **Zoom and centre are kept**: each viewer's view of a Map Set (per location) comes back when they leave the Stage
  and return (and after a reload), instead of the whole map. A new "grab attention" from the DM wins.
- **Dragging a token** (the DM, Move tool): the token is drawn over every other token; **where it was** shows dashed,
  **where it would land** in bright gold (the token's tiles), with **"Distance moved: 15 ft"** above: tiles × the
  grid's distance per tile (square: a diagonal counts one; hex: hex steps), else "3 tiles".
- **Seen live**: on the live Stage the others see the drag as it happens (the same preview, the token where it
  would land), each only where they'd see the token (shared with them, not under their fog where it was or where
  it's going). Dropped, the token stays there until the map moves it; a cancelled drag goes back at once.

### Design

- `MapSetView`: the view is saved to `localStorage` (`sagacraft.mapView.<set>.<location>`: the shared view and the
  attention it followed) on changes the viewer makes (wheel, buttons, pan, focus, a ping's notice), and restored when
  the Set opens unless a newer attention came.
- `MapTokens`: `DragPreview` (under: where it was and would land; over: the landing edge and the distance) and a top
  layer for moving tokens (the original stays in place, hidden, so the pointer isn't lost); `onDragTile` per tile
  change; `remote` (others' drags). `geometry.tileDistance`, `distanceLabel`.
- `POST /sets/{id}/token-drag {token, tile|null, dropped}` (`services/stages.token_drag`: the DM, a Map Set of the
  live Stage, a token of its location; nothing saved). `Hub.token_drag` sends it to the others who see the Set: the
  tile to those who'd see the token at both places (`_drag_targets`), `tile: null` to the rest. The ping hub
  (`realtime/pings.ts`) carries them to map Sets.

## 2. Saga template follow-ups

- Categories (and item types) no longer show a **default display template**: it was the same setting as Display
  templates' defaults, set in two places. Display templates keeps it.
- Item **categories are types**, like every other kind's ("Item types"; Items → Types; the item form's "Type").
  `?tab=item&sub=categories` still opens it.

## Steps

- [x] Views kept; drag preview and distance; drags seen live (backend, realtime, frontend).
- [x] No default template on categories and types; item types.
- [x] Tests (backend: the drag route, who's told; frontend: distances), checks in the running app (a drag on the
  DM's screen, a player's live view, the kept zoom), docs.

## Changes from the request

- The drag goes out once per tile it would land on, not per pixel: enough to follow it, light on the server.
- Only the DM drags tokens, so only the DM's drags are sent; players watch.
- Under the DM's fog, the preview dims like everything drawn there.
