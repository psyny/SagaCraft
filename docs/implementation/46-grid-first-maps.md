# 46 - Grid-first maps

Status: Done (2026-11-25)
Requirements: LOC-39, LOC-40
Depends on: 45-map-tools-and-stage-icons

## Goal

Maps become grid centric: the DM sets the grid (tile size, tiles across and down, the fog of war on or off) and fits
the pictures to it, with handles to resize and turn them and flips. Fewer settings: no grid offset, no "follow the
pictures", no Fog tab and no "paint for" (the fog is the players').

## Design

- `domain/maps.py`: `default_grid` is 100 px tiles, contrast lines at 0.5 opacity and 0.5 px; `auto` is always false
  (`normalize`, `set_grid`; `fit_grid` and `fit_size` are gone). Pictures keep `rotation` (degrees, clockwise, -180 to
  180), `flip_x`, `flip_y`; `image_box` is a picture's turned box (the map's size covers it).
- `services/locations.py`: players' composed picture mirrors, then turns each picture around its middle (PIL), and its
  cache key includes them.
- Frontend: the Grid tab (tile size, Tiles X and Y, Fog of war; no offset, no follow, no note); no Fog tab; the Fog tool
  paints the players' group. `PicturesTool`: handles in the map overlay (corners resize from the opposite corner, the
  round handle turns, Shift snaps 15°; their size follows the zoom), Flip X, Flip Y, ±90°, the angle. `MapRenderer`'s
  composite draws turned and mirrored pictures. New locations (Locations page, the location form) are the players' to see.

## Changes from the request

- Older maps keep their grid offset and other groups' fog (nothing moves under existing tokens or fog); only the
  controls are gone.

## Tests

Backend `test_pictures_and_grid` (defaults, the grid not following, a turned and mirrored picture and the map's size);
frontend `maps/tools/PicturesTool.test.ts` (resize from a corner, angles, turned boxes).
