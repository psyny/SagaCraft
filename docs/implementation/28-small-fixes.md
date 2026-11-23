# 28 - Small fixes: grid zoom, fog presets on EFX, dice tray, saved note, desk

Status: Done
Requirements: LOC-21, SET-58, SET-63 reworded (no new ones)
Depends on: 24-general-improvements, 25-set-bar-and-dice-tray, 27-map-layers

From the draft `docs/drafts/small_fixes.md` (deleted once built).

## What changed

- **Grid lines grow with zoom**: the grid's line width is how it looks unzoomed (the map fitted); zooming in (the
  location page, a map Set's own zoom) thickens it like the rest of the map, zooming out thins it (never under about
  half a pixel). `MapRenderer` gets `lineZoom` (MapView: its zoom over fit; map Sets: their inner zoom).
- **Fog presets moved to the EFX page**: EFX has sections, **Environments** and **Fog presets** (`/efx/fog`); the
  Locations page is Places alone; the old address and links lead to the new one.
- **The dice tray minimizes whole**: minimized, it's one button that opens it again (no results, no controls).
- **"Saved." doesn't move the User page**: it shows in a fixed spot in the header and fades after a few seconds.
- **Desktop**:
  - a piece dropped stays where it was dropped until the server's places arrive (it no longer jumped back for a
    moment, the DM's screen only);
  - the selected piece's options bar sits 60 px above it (clear of the rotate handle), or under it at the desk's top;
  - in Auto, no piece is taller than 40% of the desk (a first piece no longer fills it).

## Changes from the draft

- The grid line width is defined for the unzoomed (fitted) view, as the draft says; for map Sets the zoom counted is
  the map's own (not the Stage camera's), so the DM's canvas framing doesn't change the lines.
- The 40% applies to Auto layouts (where new pieces land); pieces placed by hand (Free) keep their size.
