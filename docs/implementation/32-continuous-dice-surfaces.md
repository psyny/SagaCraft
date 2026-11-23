# 32 - Continuous dice surfaces, six metals, new styles, debossed numbers

Status: Done
Requirements: SAGA-11 reworded (34 styles, grouped)
Depends on: 23-dice-roller, 29-new-dice-styles

From the user's notes on plan 29's styles (in the conversation, not a draft): Jelly and Cosmic keep their faces but
lose the edges' own texture; Metal becomes six metals; new Carbon fiber, Amber, Crystal, Charoite and Iridescent;
all of these **continuous** (one texture over faces and edges); Cobblestone and Sanded glass go. Then: Crystal
without lines between its facets, sparkles on Iridescent, a new **Hellish**, and on every style numbers **debossed**
(cut into the surface) and never caught by a highlight. Then: Crystal's edges more reflective than its faces (the
die's shape reads), Iridescent's pits finer and fainter and twice the sparkles turning hue at their own rate, a hard
deboss on Polished wood and none on Elven, and outlines that darken the surface instead of a black line. Then:
Hellish's cracks and Neon's edges in a shade of the colour (its hue turned a little), Crystal's edges halfway back to
the faces, two new Regal styles (Aristocrat, Guild) with Noble made a blend of materials, and the styles grouped by
context.

## Why edges looked different

A die's faces are painted one atlas cell each; its rounded edges and corners all read **one pixel** of a plain cell.
So whatever a face showed (smoke, nebulae), the edges were one flat colour, and two faces never met in one pattern.

## Design

### Continuous surfaces (`dice/surfaces.ts`)

- A style with a **surface** isn't painted per face: its material is worked out on the graphics card for each point,
  from where the point is on the die (in the die's own frame, so the pattern turns with it). Faces, edges and corners
  are one unbroken material; neighbouring faces meet in one pattern.
- The atlas still holds the numbers, on their own colour, plus a mask of where they are (`uInk`); on the numbers the
  surface gives way: their colour, solid, matte (rough, not metal), not bent by the relief. They're still cut in
  (Metal) and kept out of the clear coat, as before.
- Each kind is GLSL added to three.js's physical material (`onBeforeCompile`, before the lighting): a **relief** (a
  height turned into a bent normal, or the bend itself: the procedural "normal map") and a **look** (colour, gloss,
  metal, glow, opacity), from shared helpers: smooth noise and its octaves, cells around scattered points (dimples,
  sparkles, stars), a colour ramp, a frame along the surface (weaves, brushing; it turns around one corner of the
  die, where it can't be continuous) and a fade for patterns finer than a pixel (so they don't shimmer).
- The colours are uniforms: one compiled program per kind, shared by every colour and die.

### Styles

| Style | Surface |
|-------|---------|
| Jelly | The same smoky shades and glowing sparkles, now over the edges too; a little see-through. |
| Cosmic | The same nebulae and stars, over the edges too. |
| Matte metal | Metal with a diffuse sheen (rough), a faint even grain. |
| Satin metal | A smooth, soft lustre. |
| Polished metal | A near mirror, no texture. |
| Hammered metal | Dimples (cells, each a shallow cup) bending the light; duller at their rims. |
| Brushed metal | Streaks along the surface (the frame), in the relief and the gloss. The first Metal's key: members who had picked Metal get it. |
| Rusted metal | Rust patches (noise): raised, pitted, rough and not metal (the gloss and metal maps), the metal darker and pitted around them. |
| Carbon fiber | A 2×2 twill of tows in the colour (each a rounded ridge diving under the next), lit by how it lies to the light, under a soft resin coat. |
| Amber | Low-contrast flows of the colour, almost see-through, a light inside (most where it faces the eye), a few bubbles. |
| Crystal | A cut stone: flat facets around the die's centre (directions spread evenly over a sphere, so their edges are straight), each tilted out, reflective (no clear coat to flatten them), facets flashing as they face the eye; no lines between facets (only the light tells them apart); a little see-through. The edges are smooth, solid polished bevels (a lighter mirror), so the die's shape reads through all that sparkle; the shader knows them because the edges all read one spot of the atlas (`uPlainUv`). |
| Charoite | The Cosmic smoke, warped into swirls of silky fibres in shades of the colour, white and black streaks, a sheen that grows as the stone turns. |
| Iridescent | A beetle's shell: the colour facing the eye, turning to other hues as the surface turns away (goniochromism), metallic, fine faint pits (gone when finer than a pixel), glowing sparkles in most cells, each turning through the hues faster than the shell and from its own start. |
| Hellish | Very dark purple marble, satin, whose veins are cracks glowing in a shade of the colour (its hue turned 90°; sunk a little); numbers glowing in the colour, with a patch around each kept clear of cracks (the numbers' mask carries it). |

### Numbers on every style

- **Debossed**: cut into the surface. The height field has each number sunk, its walls sloping in from its edge (the
  normal map: the walls catch and lose the light), and the colour map has the shade the face around casts into it.
  Both stay inside the number, which catches no highlight: the walls shade but never glint. A **soft** wall by default,
  a **hard** one on Polished wood; **none** on Elven and on glowing numbers (Ember, Neon, Gnomish, Cosmic, Hellish:
  the glow would hide it).
- **Outlines** (light numbers on busy or dark surfaces) aren't painted dark lines: the numbers' mask carries them
  (blue) and the shader darkens what's under them by half at the very end (colour, gloss, glow: a darken filter), so
  they look like the surface in shade. A painted line had to sit on the number's colour (a surface style's atlas is
  filled with it, so the numbers' edges stay clean), and where the line met the surface that colour showed: a second,
  white contour.
- **No highlight**: every die's shader (not only the continuous ones) takes the specular away where the numbers are
  (`material.specularColor` and `specularF90` to 0: no glint from the lights or the reflected room), on top of being
  rough, not metal and out of the clear coat, sheen and iridescence. They still glow a little to read in shade.

### Regal, and gloss and metal by area

Noble, Aristocrat and Guild share one look: a satin-matte lacquer of the colour (rough, not metal, no clear coat) with
the filigree and the edges in polished metal (gold, silver, or the colour's complement; Guild's numbers are the
complement pushed until they read on the lacquer). A style can now paint **metal by area** (`metal`, like `rough` for
gloss) with the same random numbers as its colour; Noble used to find its gold by the pixels' colour, which only
worked for gold.

### Hex, a wizard's die

The body is the colour turned 90° at half its brightness; each face carries a glowing seal in the turned colour (at
full brightness), always in from the edges, never on them: a double frame along the edges, a circle inscribed in it
(touching the frame at each edge's middle, where a small diamond notches it), a second circle inside with runic marks
between the two (small circles, triangles, ticks), and in each corner a seal (a ringed dot in a triangle) tied to the
corner by a line. Sizes follow the face's inradius, so every die's seal looks alike (`painters.arcaneSeal`). The
numbers glow in the colour.

### Fire

Fire is a charred body (the colour, almost black, with glowing embers) burning with tongues of flame in the colour,
hotter (the hue turned, lighter) to white at their cores. **Each face burns from its bottom edge up towards its
number's top**: the mesh gives every vertex its face's up (`DieMesh.ups`, the number's top; blended over edges and
corners, where the flames grow rounder if the faces around disagree), so a result, turned upright when it lands, burns
straight up the screen. The flames are **still**, fixed to the die (a first version moved and climbed the screen's top,
which slid over a turning die). They leave the numbers a clear patch (as Hellish's cracks do); the numbers glow white-hot.

### Orcish, redone

A continuous surface now: a hacked lump of mottled hide in the colour with short straight gouges, old dried stains
(dark, matte), and fresh liquid in the colour's complement: splashes with spikes flung out, a drip running down from
most (towards the die's -y, ending in a drop), droplets around; wet (glossy), its middle bulging, darker at the thin
rim. Splashes are placed by direction from the die's centre, so each lands on the surface whatever the die's shape
(cells in space mostly missed it); they run over edges. The bulge is worked out from how it changes across the screen
(one evaluation instead of four).

### Groups

The styles come in groups (`DIE_STYLES`' fourth field), in this order: Classic (Minimalist, Glass, Jelly, Neon), Regal
(Noble, Aristocrat, Guild), Metal (the six and Carbon fiber), Natural (Raw wood, Polished wood, Nature, Bone),
Gems (Marble, Granite, Agate, Charoite, Amber, Crystal, Iridescent), Folk (Elven, Dwarven, Gnomish, Orcish), Arcane
(Ember, Hellish, Fire, Hex, Cosmic). Saga → User picks in two rows: the **group** (chips; a dot marks the one
holding your style) and the **style** in it (hovering one shows it in the preview). Groups are only the picker's: a
member's style is stored as its key, as before.

Cobblestone and Sanded glass are taken out: members who had them get Granite and Glass (a migration); the server
refuses them.

## UX

- Saga → User: a row of groups, then the open group's styles beside the preview (it opens on your style's group).
- Numbers stay readable: light numbers on busy or dark surfaces have a dark edge (Carbon fiber, Crystal, Charoite,
  Iridescent); Carbon fiber's resin is soft, so a result's face (it lands facing the camera) isn't washed out.

## Steps

- [x] The surface module (shared GLSL, kinds, wiring into the material; the numbers' mask).
- [x] Jelly and Cosmic moved to surfaces; the six metals; Carbon fiber, Amber, Crystal, Charoite, Iridescent.
- [x] Cobblestone and Sanded glass out (frontend, server list, migration).
- [x] Crystal without cuts, Iridescent's sparkles, Hellish; numbers debossed and out of every highlight.
- [x] Crystal's polished edges; Iridescent's finer pits and twice the sparkles; deboss per style; outlines as a
  darken filter (no white contour).
- [x] Hellish's and Neon's shade of the colour; Crystal's edges halfway; Regal (Noble reworked, Aristocrat, Guild);
  groups in the list and the picker.
- [x] Neon's and Hellish's second colour at 90°; groups Natural and Gems; Hex as a wizard's die.
- [x] Iridescent to Gems; Fire (still flames climbing each face to its number's top); Orcish redone as a continuous
  splashed surface.
- [x] Tests (the style list; each kind has one relief and one look, numbers untouched), checks in the running app in
  several colours, docs.

## Changes from the request

- **Charoite** is in the member's colour like every style (charoite's pattern; a purple colour gives the real stone).
- **Brushed metal** keeps the old Metal's key, so members who picked Metal keep a metal.
- **Crystal**'s facets are regular (around the die's centre), not random: random cells looked like a mosaic; then,
  as asked, no lines between them.
- **Hellish** is continuous like the other new styles (its cracks run over the edges); its clear patch around each
  number is soft-edged, so cracks fade out instead of stopping at a line.
- **Hellish** became satin with a weaker reflection: on so dark a body, the room's light washed out a result's face
  (it lands facing the camera). Neon's and Hellish's second colour is the hue turned 90° (15° couldn't be seen; Ember's complement is 180°).
- **The picker picks a group, then a style**: 33 buttons in one list pushed the preview out of sight.
- **Glowing numbers** aren't debossed, and neither are Elven's; Polished wood's are cut hard.
- **Debossed numbers** are painted (a normal map and a shaded inner edge), not modelled: the die stays one smooth
  mesh; the styles whose numbers were already cut in (Dwarven, Bone, the woods, the metals) look as before, only deeper.
- **Hammered** and **Rusted** use relief and gloss worked out per point (the same as normal and specular maps, but
  continuous); **Carbon fiber**'s weave follows a frame along the surface that turns around one corner of each die,
  where the weave twists (a corner, hardly seen).
