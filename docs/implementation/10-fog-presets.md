# 10 - Fog presets

Status: Done
Requirements: LOC-21, LOC-22, LOC-23, SET-43 (changed), SET-44 (moved to LOC-22)
Depends on: 09-map-regions-and-highlight

## Goal

The fog's look becomes the DM's **presets**: built once in the Locations tab with a live preview, picked on the
Stage in one click. Presets add motion, edge and known-tile controls, and three new styles (embers, blizzard,
depths).

## Out of scope

- Sharing presets between Sagas (a Saga template could carry them later).
- Per-location fog presets (the map Set picks; the location page shows flat fog).

## UX

- **Locations tab → Fog presets** (DM; "Places" is the list of locations): three columns. The presets ("+ New",
  Duplicate, Delete; the first is marked default), the picked preset's settings, and the **preview** (players'
  view or the DM's; square or hex). Sliders preview while dragging and save on release; colours and choices save
  at once.
- **World map settings and Play menu**: "Fog" chips (the presets) and "Edit fog presets…". Nothing else about
  the fog lives on the Set.

## Design

- `domain/fog.py`: styles, palettes, ranges, the default look ("White mist": soft mist, `#7d8590`, `#d3d8df`,
  `#ffffff`, intensity 0.45, motion 0.6), `normalize`, `update` (a style brings its palette unless colours come
  with it).
- `fog_presets` table (`id, saga_id, name, look`); the migration gives every existing Saga the default. New Sagas
  get it in `create_saga` (`services/fog_presets.ensure_default`, also called lazily).
- `services/fog_presets.py`: list, create (or copy), update, delete (not the last), `FogBook` for Set types
  (`RenderContext.maps.fog`: one query per render; `resolve` falls back to the first preset).
- API: `GET/POST /sagas/{id}/fog-presets`, `PATCH/DELETE /sagas/{id}/fog-presets/{preset}` (DM). Changes
  re-render the Stages that have map Sets.
- Map Sets: config `fog_preset` (old fog keys dropped); content `fog` (the resolved look; a Local map's is flat),
  and for the DM `fog_presets` (id, name) and `fog_preset`.
- Shader: `uMode` 0 flat, 1 soft; `uTime` already scaled by motion (0: still, no animation frames); `uEdge`
  scales the soft edge's wobble and the colour fade's warp; `uKnown` sets the known tiles' saturation and
  light; styles 7 embers (rising, flickering particles over warped smoke), 8 blizzard (two layers of flakes on
  the wind over haze), 9 depths (caustic lines over deep water).
- Frontend: `FogLook` (shader.ts), `MapRenderer` takes `fogLook` and a canvas source (the preview's drawn
  terrain), `saga/locations/FogPresets.tsx`.

## Steps

- [x] Docs.
- [x] Backend: domain, model, migration, service, API, map Sets, tests.
- [x] Shader: motion, edge, known tiles, three styles.
- [x] Frontend: presets section with preview, Set settings, types.
- [x] Tests.

## Tests

Backend: the default preset with a new Saga, DM only, create (style palettes, copies), update and validation,
the last one stays, Saga scoping; map Sets render the picked preset, players get the look but not the list,
deleting falls back. Frontend: the presets section (list, default mark, colour roles, style and display
changes saved, flat hides style settings).

## Changes from plan

- Checked in headless Chrome: the presets section with its preview (white mist), the World map's Play menu
  with preset chips, the player's live Stage, and the new styles and edge / known variations in the shader.
