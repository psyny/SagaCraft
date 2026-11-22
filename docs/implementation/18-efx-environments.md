# 18 - EFX: environments

Status: Done
Requirements: EFX-1..8 (EFX-9 later)
Depends on: 14-stage-layouts-and-map-labels, 15-set-toolbars, 17-sections-set-eye-location-map

From the draft `docs/drafts/EFX.md` (deleted once built).

## Goal

Immersion on Stages: a sky behind the scene, a landscape, weather over it, built once and switched in one click
during play, without ever getting in the way of the Stage. A new concept, **EFX**, with a top page of its own; its
first kind is the **environment** (three layers of effects), shown by **connected Sets**.

## Out of scope

- Sounds and music (EFX-9), environments per scene tab, effects reacting to Stage events.
- Drawing landscapes by hand (upload a transparent picture instead).
- Saving a rendered still of an environment (thumbnails are drawn from its colours).

## UX

- **EFX** tab (DM). **Environments**: the list (＋ New, From an example…, each with a small thumbnail) and the editor:
  name (saved by itself), Duplicate, Delete, a **live preview** 16:9 (far, near, a "sample Stage" ghost, fore; full
  screen), then three columns: **Far background**, **Near background**, **Foreground**, each with its effect cards
  (settings generated from the catalog; ↑ ↓ ✕) and "＋ Sky / ＋ Weather…" chips. Animated effects show their
  intensity ("Clouds 35–55": From, To) and "Changes every N s" (0: steady).
- **On a Stage**: Build → Stage panel → **Environment** (also on every EFX Set's panel). Add the EFX Sets like any
  Set: far and near go to the back, fore over the others, Controls on top (the DM's). On an interface Stage the
  layers cover the screen; on a canvas they cover the other Sets.
- **Play**: EFX Controls: the environments as chips (one click switches them, None), an eye per layer (Far, Near,
  Front), "Environments →". The layers never catch clicks: the map and the cards stay usable under the rain.
- Players see the effects; with "reduce motion" asked for by the system, they stay still.

## Design

- **Backend**: `domain/efx.py`: the catalog (kinds per layer, settings with types and limits, what intensity
  drives), `clean_layer`/`clean_effect` (defaults filled in, numbers clamped, colours, choices, pictures by id,
  intensity sorted, vary 0..600 s, at most 4 effects), `examples()`. Table `environments` (name, far, near, fore
  JSON) and `stages.environment_id` (SET NULL), migration `b5d9e3a7c214`. `services/environments.py`: CRUD
  (examples, copies), pictures checked to be the Saga's uploads, signed URLs added for drawing (`<key>_url`),
  `EfxBook` for rendering. Routes `api/efx.py`: catalog (+ examples), environments; editing or deleting pushes the
  Stages using it. Stage `PATCH` takes `environment_id`; duplicates keep it (and now their layout too). Upload
  category `efx` (6 MB, 4096 px).
- **Set types** `set_types/efx.py`: `efx_far`, `efx_near`, `efx_fore` (render their layer of the Stage's
  environment; the DM also gets its name) and `efx_controls` (command `environment.show`; renders the choices for
  admins only). Generic hints added to the Set contract, used by `add_set`: `depth` (layer order), `backdrop`
  (covers the other Sets on a canvas), `default_transparent`, `default_screen`, `private` (admins only).
- **Frontend**: `efx/` the engine: `variation.ts` (intensity over time from the clock, seeded by the effect id),
  `ticker.ts` (one rAF loop; reduced motion), `gl.ts` (full-screen shaders with value noise/fbm), `random.ts`, and
  `effects/` (sky, space and three abstract styles as shaders; bokeh, dust, landscape, weather, vignette on 2D
  canvases; colours and pictures as CSS). `EfxLayerView` stacks a layer's effects (each its own canvas, sized by a
  ResizeObserver; intensity changes don't restart it). `saga/efx/EnvironmentsPage.tsx`; `stage/sets/efx/` (views,
  inspector, `StageEnvironment` select). Set contract (frontend): `passThrough`, `fullBleed`.

## Steps

- [x] Backend: catalog and checks, model and migration, service and routes, Set types, contract hints; tests.
- [x] Frontend: engine and effects, EFX page with preview, EFX Sets and Controls, Stage panel; tests.
- [x] Docs: `concepts/efx.md` (new), stages.md, ux.md, requirements (EFX), glossary, decision, roadmap, AGENTS.md;
  the draft deleted.

## Tests

- API (`tests/test_efx.py`): environments (catalog, defaults and clamping, refusals, examples, copies, admins only),
  a Stage's environment through its EFX Sets (layer order by depth, defaults, players' view, live switch from
  Controls, edits showing at once, duplicates, deletion), pictures (an `efx` upload, its signed URL).
- Frontend: `efx/variation.test.ts` (steady, in range, changing and holding, smooth, seeded; pictures sent by id),
  `stage/StageCanvas.test.tsx` (EFX layers let clicks through, fill their box).
- Checked in headless Chrome: the EFX page with seven examples (sky with sun and clouds over mountains and a
  forest with leaves, a storm, space with a planet, an aurora with bokeh, embers), the interface "Table view"
  Stage with all four EFX Sets in Play (rain over the map, Controls) and live for a player.

## Changes from the draft

- The environment is **per Stage** (each Stage keeps its own; Controls switches it live) rather than one for the
  whole Saga, so a forest camp and a space battle can be prepared side by side.
- Each layer **stacks effects** (rain + mist + a vignette) instead of holding one.
- "Black spots in the dark" are the **dark motes** weather; **mist** and **fireflies** were added to the weather,
  **vignette** to the foreground, **light rays** and **dust** to the abstract styles.
- EFX Controls also turns each layer on or off (the eye), handy to see the map without the rain for a moment.

## After the first review (2026-11-22)

- **Changing a setting showed only after switching environments** (e.g. Abstract: bokeh → aurora): an effect kept
  its canvas when it restarted, and a canvas keeps the first kind of drawing it got (2D or WebGL), so the new
  WebGL effect couldn't draw. Each effect now makes a fresh canvas when it (re)starts, and gives its WebGL context
  back when it stops.
- **Mist** (a weather kind) became the **Fog** effect, on the near layer and the foreground: banks sliding across
  (a warped noise shader with two depths), with speed and direction, size, opacity, how low it lies and colour;
  density is its intensity (so it can thicken and thin over time). Stormy coast's example uses it.
- **Embers** are short bright strokes along their motion (a hot core over a faint glow), pushed by the wind and
  tossed by gusts. Weather gained **Chaos** (gusts and swirls: embers, snow, leaves, motes, fireflies, rain's
  angle, sand) and **Length** (streaks: rain, storm, hail, wind, embers, sand), shown only where they apply.
