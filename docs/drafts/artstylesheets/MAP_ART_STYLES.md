# World Map Art Direction — Five Style Reference Guide

**Purpose:** reproduce a consistent visual identity across AI-generated world-map assets, procedural brushes, terrain textures and assembled maps. This guide supersedes earlier style definitions. The five attached style sheets are the visual source of truth; the descriptions below translate their appearance into reproducible instructions.

## Reference files and canonical identities

| Style | Reference image | Defining visual language |
|---|---|---|
| `FairyTale` | `FairyTale.png` | Retro 16-bit fantasy RPG pixel art |
| `Sketch` | `Sketch.png` | Two drawing inks on neutral paper, hatching and stippling |
| `EpicFantasy` | `EpicFantasy.png` | Naturalistic painterly fantasy relief and dramatic lighting |
| `LowPoly` | `Lowpoly.png` | Crisp, high-resolution faceted pseudo-3D |
| `StoryBook` | `StoryBook.png` | Colored, hand-inked medieval fantasy cartography |

Comic is retired. Dark Fantasy is a tonal variant of EpicFantasy, not a separate rendering style. FairyTale is **pixel art**, not smooth enchanted illustration.

## 1. Shared visual contract

Generate **world-map elements**, not character illustrations, concept-art landscapes, battle maps or miniature product photography. All assets must work together at regional or overworld scale.

- **Viewpoint:** fixed elevated cartographic/oblique view; ground, roofs and selected front faces are visible. No horizon, vanishing point, camera tilt variation or scenic sky in isolated assets. Exact projection can vary by style but must be consistent within it.
- **Scale:** symbolic rather than literal. A tree, mountain and castle must each be recognizable at thumbnail scale. Castles may be enlarged for landmark hierarchy; forests must work as many small repeated trees, mountains as overlapping peaks or ridges.
- **Lighting:** use a consistent upper-left light direction and lower-right shadows where applicable. Sketch conveys this through mark density instead of tonal lighting.
- **Grounding:** visible ground contact; avoid floating elements. Use a compact irregular base or transparent ground transition where necessary, not a rectangular illustration background or a raised display pedestal.
- **Composition:** strong silhouette first, major internal forms second, surface details last. Avoid adding unrelated scenery to a requested asset. Keep decorative extras subordinate.
- **Brush compatibility:** produce interchangeable variants with comparable footprints, scale, lighting, palette and detail density. Vary shape, height and clustering without changing the style.
- **Terrain compatibility:** ground material fills must be continuous across hex boundaries. The hex shapes in the sheets demonstrate materials, not mandatory outlines or physical blocks. Separate grid, terrain, objects, boundaries and routes. Render coastlines on the actual land/water interface, not around each water hex.
- **Output:** for isolated sprites, request transparent background, full silhouette, generous padding and no labels. For textures, request a seamless flat material swatch, without perspective, border or vignette. For a map preview, request a coherent region with repeatable assets at the intended display scale.
- **Presentation versus artwork:** sheet banners, ornamental frames, typography, parchment margins and swatch labels are documentation design, not part of production sprites. Paper texture is an optional global substrate for StoryBook and Sketch; do not bake a separate paper rectangle into each sprite.

## 2. Style recipes

### FairyTale — retro fantasy pixel art

**Visual reference:** `FairyTale.png`. The tree has a compact stepped outline with lime-green highlights and deep teal shadows; mountains have white snow and blue-violet rock shadows; the castle has bright red roofs and light stone walls; water is vivid blue with cyan and white pixel highlights. The assembled map resembles a classic RPG overworld.

**Identity:** colorful, nostalgic, charming 16-bit game art. Its magic comes from stylized pixel shapes and color, not bloom or smooth painting.

**Construction rules**
- Establish a common logical pixel grid. Draw hard-edged, staircase silhouettes and purposeful contiguous pixel clusters. Use approximately 1 logical pixel for outer contours on small sprites, optionally 2 on larger ones.
- Use a limited shared palette, with roughly 2–4 principal shades per material and a few selective highlights. Dark contours can be navy, plum, deep green or brown rather than uniform black.
- Shade with discrete clusters of color; use selective ordered dithering only where it helps a transition. Avoid random single-pixel noise and pillow shading.
- Use a consistent pixel size across all asset categories. Suggested starting scale: 16–32 logical pixels for simple terrain motifs, 32–64 or more for detailed landmarks. These are starting points, not required hex dimensions.
- Render procedural shapes to a logical-resolution buffer or quantize to a shared world-space pixel lattice. Upscale with nearest-neighbor filtering at integer factors when possible. Do not merely pixelate a finished painting or mix smooth antialiased edges into the sprites.

| Asset | Drawing recipe |
|---|---|
| Tree | Rounded, stepped crown made of overlapping green pixel clusters; top-left yellow-green highlights, teal shadow clusters, warm brown trunk. Conifers use layered stepped triangular tiers; autumn and blossom variants retain the same pixel pitch. |
| Mountain | Jagged stepped peaks; broad blue-gray and violet shadow planes, white/pale-blue snow caps, a few dark ridge pixels; combine peaks into chains. |
| Castle | Compact stone towers, crenellations, red tiled roofs suggested by pixel bands, dark gate and windows; flags and roof highlights kept to a few pixels. |
| Water | Flat saturated blue surface with short cyan/white pixel streaks, stepped sandy shoreline and shallow-water band; waterfalls use vertical cyan/white clusters. |
| Terrain | Grass clusters, diagonal or parallel crop rows, cracked brown soil, chunky gray stones, sparse blue snow marks, golden dune bands, blue marsh with reeds. |

**Suggested palette (illustrative, not sampled):** `#123E38` `#276C38` `#65AE27` `#BCD943` `#F5C544` `#D97728` `#C43732` `#76432D` `#1553A1` `#188DDA` `#65D6EC` `#E9F2F6` `#958BAA` `#514763`.

**Prompt fragment:**
> FairyTale world-map asset, authentic retro 16-bit RPG overworld pixel art, consistent logical pixel grid, crisp stepped silhouette, intentional contiguous pixel clusters, limited vibrant shared palette, discrete two-to-four-tone material ramps, selective dark colored outlines, upper-left highlights, elevated cartographic view, readable at small map scale, modular game sprite.

**Negative prompt:** smooth digital painting, watercolor, vector curves, antialiased sprite edges, photorealism, 3D render, low-poly triangles, bloom, fairy dust, excessive dithering, inconsistent pixel sizes, pixelated photograph, decorative frame.

### Sketch — two-tone ink cartography

**Visual reference:** `Sketch.png`. Fine dark brown contours, warm rust-brown hatches, open paper interiors, contour waves, dots and parallel strokes. The mountains demonstrate outline → directional hatching → cross-hatched shadow. The sheet explicitly shows two drawing colors plus the paper substrate.

**Identity:** a hand-drafted cartographer's map; expressive but controlled pen work, with terrain distinguished through marks rather than biome colors.

**Construction rules**
- Exactly two drawing inks: primary dark brown for outlines, structural marks and strong shadow; secondary muted warm brown for hatching and selective emphasis. Neutral paper is a substrate, not a third drawing ink. Transparency may expose that substrate. No independent blue, green or other biome colors.
- Use thin, slightly irregular, confident contours. Give outer silhouettes and key boundaries more weight than internal marks. Avoid a uniformly thick cartoon outline.
- Build volume through parallel strokes following local slope, with a second crossing direction only in darker regions. Preserve open negative space on lit faces.
- Stipple with controlled density; encode terrain through characteristic stroke patterns. Keep the marks coherent, not uncontrolled scribbles.
- Use world-space pattern coordinates and clip marks to shape masks. Vary spacing and length with deterministic randomness. At low zoom, simplify or reduce mark density to avoid moiré; do not substitute smooth colored shading.

| Asset | Drawing recipe |
|---|---|
| Tree | Scalloped ink canopy, branching trunk and roots, selective short hatches and stipples on shaded foliage; conifers as layered pointed strokes. |
| Mountain | Thin irregular ridge contours, exposed paper on lit slopes, rust hatching down slope faces, darker cross-hatching on shadow faces. |
| Castle | Pen-drawn towers, crenellations and roof contours, selective roof hatch and wall masonry marks; open paper walls with sparse detail. |
| Water | Double shoreline contours and broken horizontal or contour-following wave strokes; river banks with sparse parallel flow marks; waterfall with vertical strokes. |
| Terrain | Grass short tufts; fields parallel rows; steppe dots; rock angular outlines; forest clustered canopy marks; snow mostly blank paper; desert flowing hatch bands; marsh reeds and dots. |

**Reference palette:** primary ink approximately `#3B2A1E`, secondary ink `#A66E4A`, paper `#F7E6C8` (values shown on the sheet). For a strictly binary export, the accent may be mapped to primary ink, but the reference default is two inks plus substrate.

**Prompt fragment:**
> Sketch world-map asset, two-ink hand-drafted fantasy cartography on neutral paper or transparent background, fine irregular dark sepia pen contours, muted rust-brown directional hatching, selective cross-hatching and stippling, generous negative space, traditional engraved map grammar, small-scale legible elevated cartographic silhouette, repeatable terrain marks.

**Negative prompt:** full-color terrain, blue water, green trees, smooth gradients, airbrush shadows, watercolor washes, thick comic lines, glossy surfaces, pixel art, 3D geometry, dense pencil smudging, decorative frame.

### EpicFantasy — painterly naturalistic fantasy

**Visual reference:** `EpicFantasy.png`. Deep green foliage with golden light, jagged snowy ridges and complex rock forms, imposing stone castles, dark teal seas with bright foam. Map preview emphasizes connected terrain, believable relief and dramatic lighting.

**Identity:** immersive fantasy atlas with naturalistic materials and painterly depth. High fantasy and dark fantasy share the same rendering grammar.

**Construction rules**
- Construct believable major volumes: branching canopy masses, connected mountain ridges, architectural wall/roof planes, coast relief. Avoid simple triangles and isolated cones as the final mountain form.
- Define edges with contrasts in value and material rather than heavy outlines. Use selective hard edges on ridges, walls and shoreline; softer edges on foliage, distant detail and ground transitions.
- Use directional upper-left lighting, richer shadow colors and restrained cast/contact shadows. Preserve clear separation between assets and the surrounding terrain.
- Layer large-scale material color, coherent medium-scale form, then fine painterly details. Procedural equivalents may use noise-based material variation, height-field gradients or normal-like shading, masked detail strokes and ridge functions. Noise is subordinate to structure.
- Atmosphere (mist, cloud shadows, haze) is optional and best applied as a regional map layer, not baked into every sprite. Dark Fantasy changes palette, contrast and material motifs without destroying biome recognition.

| Asset | Drawing recipe |
|---|---|
| Tree | Irregular branching trunk and grouped foliage masses, golden or cool edge highlights, deep interior shadows, textured but not individually rendered leaves at map scale. |
| Mountain | Asymmetric connected ridges with major slope planes, rocky striations, scree, snow accumulation guided by elevation and exposed slopes; subtle atmospheric separation between overlapping peaks. |
| Castle | Plausible stone massing, towers and roof planes, selective masonry and window detail; warm highlights and contact shadows. Ground/cliff bases only when appropriate to the requested placement. |
| Water | Deep blue-green base, lighter shallow bands near shore, coherent wave strokes and white foam at edges; waterfall has bright falling ribbons and darker wet-rock context. |
| Terrain | Natural greens and rock patches, directional crop patterns, eroded dry soil, stratified rocky surfaces, blue-white snow, large dune ridges, wetlands with dark water and reed clusters. |

**Suggested palette (illustrative):** `#30452F` `#657A37` `#A4A34F` `#B9A36A` `#986744` `#514A43` `#7E8890` `#DAE5EB` `#163E4C` `#216878` `#64B5BA` `#C2DCDD` `#93412B`.

**Dark Fantasy variant:** cooler or more desaturated foliage, charcoal rock, deeper teal water, restrained warm accents, ash, dead trees and volcanic features where relevant. Retain readable silhouettes and consistent lighting; do not simply apply a black overlay.

**Prompt fragment:**
> EpicFantasy world-map asset, painterly naturalistic fantasy cartography, elevated oblique map view, believable material and relief, rich earthy colors, directional upper-left light, deep coherent shadows, selective crisp ridges and soft organic edges, restrained atmospheric depth, minimal ink outlines, detailed major forms readable at overworld scale, modular terrain or landmark sprite.

**Negative prompt:** cinematic horizon scene, photographic landscape, heavy black contour, cartoon proportions, pixel grid, hard low-poly triangulation, excessive HDR, pervasive fog, microscopic noise, dramatic background sky, decorative frame.

### LowPoly — high-resolution pseudo-3D

**Visual reference:** `Lowpoly.png` (filename casing intentional). Angular canopy volumes, triangular mountain faces, geometric stone towers and roof planes, turquoise polygonal water. The map reads as a geometric miniature world despite being intended for a 2D renderer.

**Identity:** fake 3D through geometry and flat face shading, not low-resolution graphics. Crisp high-resolution silhouettes and deliberate facets.

**Construction rules**
- Build coherent projected volumes using visible polygon faces. Trees may use simplified polyhedral crowns, mountains triangulated elevation shapes, buildings extruded footprint forms and roofs. Use a fixed oblique or orthographic pseudo-isometric projection.
- Use planar color per face, grouped into a few light/base/shadow values for each material. Calculate face shade from orientation to a shared light direction when feasible. Adjacent coplanar faces should not receive arbitrary conflicting shades.
- Use large meaningful facets, with smaller facets only to describe form. Avoid triangulating every surface into visual confetti.
- Keep outer contours minimal or absent; use contact shadows and face contrast. Render at high resolution with crisp antialiased polygon edges, unlike FairyTale.
- For continuous ground, triangulate in shared world coordinates or share vertices and material colors across chunk boundaries. Visible extrusion belongs only at actual cliffs or terrain height changes, not every hex edge. A sprite base is not a permanent raised pedestal.

| Asset | Drawing recipe |
|---|---|
| Tree | Several angular polyhedral canopy masses, green face ramps, faceted trunk and roots; conifers use stacked angular crowns. |
| Mountain | Large angular peaks with coherent ridges and triangular faces, 2–3 dominant rock shade levels, white/cool snow facets. |
| Castle | Modular extruded towers and wall segments, polygon roof faces, simplified dark windows, clear gate and compact contact shadow. |
| Water | Flat or gently varied blue/turquoise triangulated planes, angular shoreline and restrained white polygon highlights; waterfall as a slanted/vertical ribbon of faceted blue. |
| Terrain | Broad grass facets, orderly crop bands, polygonal dry ground and stone, cool snow planes, angular dunes, geometric reeds. |

**Suggested palette (illustrative):** `#365D32` `#6E982D` `#A4C346` `#D8D76A` `#E5C77A` `#B88653` `#736C67` `#414B61` `#F0F4FA` `#17658E` `#159FC0` `#69D3DB` `#C7512D`.

**Prompt fragment:**
> LowPoly world-map asset, high-resolution crisp pseudo-3D low-polygon geometry, fixed elevated orthographic cartographic view, coherent large planar facets, flat per-face material shading, consistent upper-left lighting, clean geometric silhouettes, simplified saturated natural colors, minimal outlines and texture, readable modular 2D sprite that convincingly simulates a 3D map.

**Negative prompt:** pixel art, raster jaggies, smooth rounded 3D plastic, photorealistic materials, hand-painted texture, ink hatching, heavy outlines, wireframe, excessive tiny triangles, perspective camera, individual raised hex plinths, decorative frame.

### StoryBook — colored illustrated cartography

**Visual reference:** `StoryBook.png`. The island-city example shows hand-inked buildings, warm red roofs, mossy greens and a blue sea on parchment. Assets have fine dark outlines, organic shapes, light watercolor-like coloration and directional hatching. The mountain construction shows colored shape, ink ridges and final hatched shading.

**Identity:** a classic illustrated fantasy atlas, as if drawn and colored by a medieval-inspired mapmaker. Richer in color than Sketch and more restrained and cartographic than the retired Comic style.

**Construction rules**
- Draw organic, slightly irregular silhouettes and fine dark-brown ink contours with a hierarchy of line weights. Use thinner marks for secondary ridges, bark, masonry and foliage.
- Fill with restrained, warm natural colors and lightly textured washes. Use subtle variations in tone and saturation, not glossy gradients. Keep blue water distinct and sufficiently colorful; parchment does not mean sepia-only.
- Shade by combining subdued colored shadow shapes with short directional hatches. Preserve visible base color on lit faces. Use hatching as a supporting detail rather than the primary language (unlike Sketch).
- Introduce a restrained paper or watercolor grain on the global surface, with masked material variation. Avoid dirty noise and thick inconsistent outlines.
- Favor clusters of small illustrated map symbols and buildings rather than individually elaborate scene illustrations. At low zoom retain outline and color hierarchy while dropping fine marks.

| Asset | Drawing recipe |
|---|---|
| Tree | Organic scalloped canopy clusters in olive/moss greens, fine ink edge and branching warm-brown trunk; sparse leaf marks and hatches on the shaded side. |
| Mountain | Irregular outlined peaks, distinct ink ridges, muted gray/brown slopes, pale snow caps and directional hatching; combine into overlapping ranges. |
| Castle | Compact medieval towers with warm terracotta roofs, stone walls, thin contours, sparse brick and window marks; readable gate, crenellations and flags. |
| Water | Rich muted blue fill, fine dark shoreline contour, subtle broken horizontal wave marks, pale shallows and occasional rock details; river follows a continuous irregular channel. |
| Terrain | Olive grass with sparse marks, warm crop rows, ink-cracked ochre soil, gray outlined rock, canopy clusters, pale snow, golden dunes, blue-green wetlands with reeds. |

**Suggested palette (illustrative):** `#2B1E12` `#F0D8AA` `#B3B66A` `#87904A` `#52633A` `#D5AD54` `#BD8D56` `#997451` `#9A9690` `#E8E5DB` `#2C779B` `#68A9BE` `#B9D4D9` `#B64D37`.

**Prompt fragment:**
> StoryBook world-map asset, classic hand-illustrated medieval fantasy cartography, fine varied dark-brown ink contours, organic slightly irregular silhouettes, warm muted natural colors, light watercolor-like fills and restrained paper grain, selective directional hatching, detailed but elegant map symbols, elevated cartographic view, clear small-scale silhouette, modular illustrated atlas sprite.

**Negative prompt:** thick black comic-book lines, exaggerated cartoon proportions, sepia-only monochrome, heavy cross-hatching over all surfaces, retro pixel art, glossy digital painting, photorealism, faceted low-poly geometry, ornate background illustration, decorative frame.

## 3. Repeatable generation workflow

1. Attach the matching reference image for every new batch. Use only that style's reference unless intentionally comparing styles.
2. Compose the request from the common contract, one style prompt fragment, the specific subject and desired output type. Include the relevant negative prompt. If the generator has no negative prompt field, express exclusions in the main prompt.
3. Fix the scale, projection, lighting, palette and ground anchor using a previously accepted asset as an additional reference. Generate variants together when possible to reduce stylistic drift. A seed may help within the same generator but does not guarantee identical art across models or versions.
4. Review assets both individually and in a dense assembled map at intended zoom. Reject style drift even when the standalone artwork is attractive.
5. For coding agents, implement the style as reusable construction rules, material parameters, shader/pattern functions and deterministic variant generators; reference artwork is a target, not an instruction to bake a whole map as a single image.

### Reusable request template

```text
STYLE: [canonical style identifier]
REFERENCE: [matching sheet filename and accepted asset if available]
SUBJECT: [asset type, biome, variation]
OUTPUT: [isolated transparent sprite / seamless material / connected route / map preview]
SCALE: [logical pixel size or map footprint, intended viewing zoom]
VIEW: fixed elevated cartographic view matching reference
LIGHT: upper-left, consistent with accepted assets
STYLE RULES: [copy style prompt fragment and relevant asset recipe]
COMPOSITION: readable silhouette; no unrelated scenery; appropriate ground contact;
             variants share footprint, palette, viewpoint and detail density
EXCLUDE: [copy style negative prompt]; no labels, frames, watermarks or sheet decoration
```

## 4. Procedural renderer consistency

- Share terrain semantics, brush footprints, placement seeds, route connectivity and boundary topology across styles. Switching styles changes appearance, not geography or object positions.
- Generate continuous material fields in world coordinates; avoid per-hex resets of texture, hatch phase, pixel grid or facet noise. Seed object variation by stable map identifiers. Re-rendering or zooming must not reshuffle objects.
- Compose terrain first, connected water/coast/road surfaces and elevation boundaries as required, then ground-contact shadows and objects with stable depth ordering. Use masks and appropriate occlusion instead of baking unrelated terrain into landmarks.
- Waterfalls at boundary crossings are a liquid-route rendering variant driven by local height change. Do not require a special waterfall image for every wall material. Render the falling stream and splash independently of the boundary artwork, in the selected style.
- Rivers, roads, cliffs and coastlines must retain continuous geometry; only their visual stroke/face/pattern treatment changes. Lava may use the same liquid geometry with style-specific materials.
- Keep animation optional. FairyTale uses discrete pixel-frame highlights; Sketch uses sparse ink flow marks or static patterns; EpicFantasy uses coherent surface flow and foam; LowPoly uses restrained face or highlight changes; StoryBook uses subtle illustrated wave strokes. Cache static layers and choose detail levels based on zoom and performance.

## 5. Visual acceptance checklist

| Check | FairyTale | Sketch | EpicFantasy | LowPoly | StoryBook |
|---|---|---|---|---|---|
| Primary discriminator | Visible logical pixels | Two inks + paper | Painterly relief | Planar facets | Fine ink + colored washes |
| Edge language | Stepped | Pen lines | Material/value edges | Clean polygon edges | Organic ink contours |
| Shading | Discrete pixel clusters | Hatch density | Continuous material lighting | Flat face values | Colored shadows + light hatch |
| Texture | Pixel motifs | Strokes/dots | Natural materials | Minimal | Paper/wash + illustrative marks |
| Color | Limited vibrant ramps | No biome hues | Rich natural or dark | Clear geometric materials | Muted warm cartographic colors |

Before approving a batch, verify that the style is recognizable without labels, all four core asset families match the same visual grammar, repeated objects do not create seams or obvious stamps, silhouettes survive normal map zoom, and the asset is usable independently of the style-sheet decoration.

## 6. Verification against the supplied sheets

All five attached sheets were used as the basis for this specification. Important distinctions from earlier text: FairyTale is exclusively pixel art; StoryBook is colored ink cartography rather than Comic; Sketch uses the reference's two drawing inks plus paper; LowPoly is high-resolution pseudo-3D rather than pixelated or necessarily actual 3D; EpicFantasy is painterly and supports both heroic and dark palettes. The sample palette values (except the approximate Sketch values printed on its sheet), suggested logical pixel sizes, generation workflow and procedural algorithms are proposed implementation guidance, not measured properties of the reference images. The sheets are visual direction, not verified seamless texture files or an executable renderer.
