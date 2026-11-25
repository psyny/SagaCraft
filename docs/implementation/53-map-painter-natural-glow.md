# 53 - Map painter: natural glows by day, lava and lake surfaces, an animated camp fire

Status: In progress (branch `feature/map_painter`)
Requirements: LOC-86..LOC-89
Depends on: 52-map-painter-click-routes-download
Draft: `docs/drafts/map_painter_improvements_4.md`

## Goal

The map painter's seventh round:

- **Lava lake**: its colours are molten (a little redder), its highlights (orange to yellow) and its crust, which is
  also its shoreline; the crust lies in solid patches with sharp edges; its glow at night is softer.
- **Lake**: its surface twice as fine and in much stronger contrast, like a body of water (gradient noise: Perlin or
  simplex, whichever reads better).
- **Natural glows by day**: fire, lava and magic glow at every hour (less visibly by day, under the daylight); lights
  people turn on (windows, lanterns, a lighthouse) glow only at night.
- **Camp fire**: no halo (the glow does it); an animated fire.

## Design

- Lava lake: roles Molten, Highlights, Crust (and shore); highlights are the wavy lines, crust patches a sharp cut of
  the warped noise, nearly opaque; the molten part alone lights itself, less than before. Stored lava lakes in the old
  default colours get the new ones.
- Lake: two octaves of gradient noise at twice the frequency, mapped to the deep colour and a light one.
- Glows: sprites get a second lit group, `class="glow"` (natural: shown always, never darkened, glowing), beside
  `class="night"` (lit at night). The painting's texture keeps in its alpha how much each pixel lights itself (the
  ground's lava; sprites cover it; a second, alpha-only sprite pass adds what they light: glow parts, night parts at
  night, fires, glowing particles); the bloom takes its light from that, not from bright pixels (snow doesn't glow),
  so it runs by day too where something glows, weaker by day.
- Camp fire: a `flame` particle (a flickering tongue of fire, drawn and moved by the sprite shader, lighting itself)
  set on the bonfire's logs by its layer's `flame` (the scenery JSON; features' parts too), sparks rising from it; the
  bonfire and camp sprites lose their drawn flames and halos.

## Steps

- [ ] A. Lava lake, lake.
- [ ] B. Natural glows by day.
- [ ] C. The camp fire.
- [ ] D. Docs, checks.

## Changes from the draft

(Filled in when done.)
