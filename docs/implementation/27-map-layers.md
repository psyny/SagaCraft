# 27 - Map layers, sharp zoom, the no-map colour

Status: Done
Requirements: LOC-32, LOC-33, LOC-34, LOC-35, SET-79 (LOC-26, LOC-29 reworded)
Depends on: 08-locations-and-maps, 21-map-set-tokens-attention-pings, 24-general-improvements

From the draft `docs/drafts/improvements.md` (deleted once built).

## Goal and design

### Sharp at any zoom

- The map's canvas covers only the part of the map in view (plus a margin), at the screen's resolution, instead of the
  whole map at most 4096 px wide and stretched: the grid's lines, the fog's edges and the pictures stay sharp however
  far you zoom in (the shader gets the view's rectangle).
- **Pictures** get filters: zoomed out, a mipmapped texture (trilinear, anisotropic where the browser has it) so they
  don't shimmer; zoomed in past their resolution, a bicubic (Catmull-Rom) sample instead of a blocky bilinear one.

### Layers

A map has **layers** (floors of a tower, a cave under a forest, the same place by day and by night), in order:

- **For the whole map**: the grid, the fog (one fog for every layer), the **no-map colour** (what shows where no
  picture covers the map; black by default) and the layers' list.
- **Each layer**: a name, **see-through** (where it has no picture, the layers under it show), its **pictures**, and
  its **tokens, links, paths, regions and labels**.
- Viewing a layer shows its pictures and, where it's see-through, the layers below it (down to one that isn't), over
  the no-map colour; and only its own tokens, links, paths, regions and labels.
- Players get one composed picture per layer and fog, like today (the server composes the layer's pictures and those
  showing through).
- **Tokens** move from one layer to another (the Tokens tool: a layer per token), keeping their tile.
- Maps from before have one layer ("Map") with everything they had.

### Where

- **The map editor**: tabs for the whole map (Details, Grid, Fog, **Background** — the no-map colour —, **Layers**), and
  per layer (Pictures, Links, Tokens, Paths, Regions, Labels: the layer picked above the tabs).
  The Layers tab: add, rename, see-through, move up and down, delete (not the last; its content goes).
- **The location page**: a layer picker over the map when it has more than one (everyone who sees the map).
- **The Map Set**: in the Set bar, a layer picker next to the location picker; players see the layer the DM picked
  (per location).

### Tokens

- Sizes 1 to 10 tiles (hex clusters keep growing: 1, 3, 7, 12, 19, then larger).

## Steps

- [x] Backend: layers in the map data (upgrade on read), per-layer commands, layer commands, background, composition
  per layer, the Map Set's layer, token sizes to 10; tests.
- [x] Renderer: viewport canvas, picture filters, background.
- [x] Editor, location page, Map Set: layers, background, token layer and sizes.
- [x] Checks in the running app, docs.

## Changes from plan

- Per-layer commands run on a view of the layer (its content with the map's grid and fog: `layer_view`, then `commit`),
  so the rules for links, paths, regions, labels and tokens didn't change; a token's own commands find its layer.
- The editor opened from a Map Set starts on the layer the Set shows.

## Changes from the draft

- **"No map color" is the Background tab** (a tab for one colour, named for what it is), for the whole map.
- **The Map Set's picker is a dropdown** of the layers, shown when the map has more than one.
- **Viewing a layer shows only its own things** (tokens, links, paths, regions, labels), even where lower layers show
  through: their pictures show, not their markers.
- **Fog stays one for every layer**, as the draft lists it with the whole map's settings.
- **Pictures' "resize filter"**: mipmaps when zoomed out, bicubic when zoomed in; the grid is sharp at any zoom.
- Tokens from 1 to 10 tiles, as asked (the size buttons are 1 to 10).
