# EFX: environment effects

**EFX** are effects that help immersion on Stages: a sky behind the scene, rain over it, embers drifting up.
They're the DM's: built on the **EFX** page (top bar, DM only) and shown through **EFX Sets** on a Stage. The first
kind of EFX is the **environment**; sounds and other effects can join the EFX page later.

The Stage must stay readable and usable: EFX layers never catch clicks, and the foreground is meant to be light
enough to see through.

## Environments

An **environment** has three **layers**, back to front:

| Layer | Holds | Notes |
|-------|-------|-------|
| **Far background** | Sky, space, colours (plain or gradient), abstract light, a picture | Covers everything (opaque). |
| **Near background** | Landscape, fog, abstract light, a transparent picture | Between the far background and the Stage; can be **empty** (an environment with nothing here). |
| **Foreground** | Weather, fog, abstract light, a vignette | Over the Stage; procedural only. |

Each layer stacks up to 4 **effects**, drawn in order (↑ ↓ change it). An effect is a kind from the catalog with
its settings. Animated effects also have:

- an **intensity range** (0–100: what it drives depends on the effect: cloud cover, how much rain, the wind in a
  landscape's trees, a nebula's glow…),
- **changes every** N seconds (0: steady, at the middle of the range): every N seconds the intensity eases to a
  new value inside the range, then holds. It follows the clock, so every screen shows the same storm at the same
  time. Rain between 30 and 50 changing every 60 s keeps a long scene alive without anyone touching it.

### The effects

| Effect | Layers | Settings | Intensity |
|--------|--------|----------|-----------|
| **Colours** | far | plain, top to bottom, from the middle; two colours | — |
| **Sky** | far | time of day (dawn, day, dusk, night), sun or moon and its height, stars, cloud colour, wind | cloud cover |
| **Space** | far | two nebula colours, stars, a planet (colour, size), drift | nebula glow |
| **Abstract** | far, near, fore | bokeh, aurora, silk, light rays, dust motes; two colours, size, speed | amount |
| **Picture** | far, near | an uploaded picture (category "Environment pictures"), fill or whole, middle or bottom, slow drift | — |
| **Landscape** | near | mountains, hills, forest, water, buildings; silhouette and haze colours, height, variation | wind |
| **Fog** | near, fore | banks of fog sliding across: speed and direction, size of the banks, opacity, how low it lies, colour | density |
| **Weather** | fore | rain, storm (with lightning), snow, hail, sandstorm, leaves, wind, embers (short bright strokes), dark motes, fireflies; wind, size, **chaos** (gusts and swirls), **length** (of streaks: rain, hail, wind, embers, sand), colour | amount |
| **Vignette** | fore | colour, size | darkness |

Depth comes from layering: a slow, soft bokeh far away and a livelier one in front; mountains fading into the haze.
The landscape is drawn artistically (silhouettes, swaying pines, shimmering water); for a specific place, upload a
transparent picture for the near layer.

The catalog of effects lives on the server (`domain/efx.py`): the editor is built from it and every change is
checked against it. Adding an effect = a catalog entry + a renderer (`frontend/src/efx/effects/`).

**Examples** to start from (our own): Starry night, Stormy coast, Deep space, Autumn forest, Desert noon, Ember cave,
Dreamscape.

## The EFX page

EFX → Environments: the list (＋ New, From an example…), and for the picked one: its name, Duplicate, Delete, a
**live preview** (the three layers as on a Stage, with an optional **sample Stage** ghost between the near layer and
the foreground to judge readability; full screen), and the three layers' effects with their settings. Changes save
by themselves and show at once on every Stage using the environment.

## On Stages: the EFX Sets

A Stage has **one environment** (Build: the Stage panel's "Environment", or any EFX Set's panel). Its EFX Sets are
connected: each shows its own layer of the Stage's environment, and switching the environment changes them all.

| Set | Shows | When added |
|-----|-------|-----------|
| **EFX - Far background** | the far layer | at the back; covers the screen (interface) or the other Sets (canvas); no frame |
| **EFX - Near background** | the near layer | just above the far background |
| **EFX - Foreground** | the foreground | over the other Sets |
| **EFX - Controls** | the DM's panel: the environments (one click switches the Stage's, "None" too) and an eye per EFX layer (puts that Set away) | on top; the DM's (hidden from players) |

EFX layer Sets fill their whole box and let every click through (in Build only their title catches clicks, to move
them; pick them in the Set list too). Their own main toolbar starts hidden: their eye is on EFX Controls. Players get
the layers' effects (pictures as signed URLs), never the environments' names or the DM's choices. With "reduce
motion" asked for by the system, effects are drawn once and stay still.

## Open points

- Sounds and music as EFX (ambient loops per environment, one-shot effects).
- Per-tab or per-scene environments (switching with the Actors Scene's tabs).
- Effects reacting to the Stage (lightning when the DM grabs attention…).
