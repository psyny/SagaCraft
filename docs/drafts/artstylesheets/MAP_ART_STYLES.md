# World Map — Art Style Specification

## 1. Purpose

This document defines four interchangeable visual styles for a procedural, hex-based fantasy world map editor: **Comic**, **FairyTale**, **EpicFantasy**, and **LowPoly** (pseudo-3D low poly). It is intended for AI coding agents and technical artists implementing drawing algorithms, brushes, shaders, and procedural assets. The accompanying reference images establish visual targets, not mandatory production sprites.

The objective is to reproduce the visual language of the references through rendering logic, not to create standalone fantasy illustrations or miniature scenes. The map must remain editable, scalable, and visually coherent when hundreds of objects are painted together.

## 2. Shared rendering contract

### Projection, scale and composition

- Maintain the editor's existing hex geometry and map-space coordinates. Ground regions, roads, water and boundaries follow the existing map plane; upright objects use a consistent elevated, approximately three-quarter map view where appropriate. Do not tilt or distort the grid to simulate perspective.
- Preserve the underlying world data when switching styles: region masks, object positions, route topology, boundary geometry and semantic terrain types. Visual footprints may vary modestly, but must not change gameplay or editing semantics.
- Design for the actual map zoom, not the enlarged reference sheet. A tree is a repeatable vegetation element; a mountain is a terrain motif; a castle is a landmark; water is a continuous surface. Do not give each a decorative island or self-contained scenic backdrop.
- Keep silhouettes recognizable when reduced to a few dozen pixels or smaller. Reduce interior detail before sacrificing the defining silhouette. Landmarks should remain distinct from ordinary vegetation and terrain.
- Use a consistent apparent light source, preferably upper-left, as a proposed default for all styles. Match the existing renderer if it already establishes another direction.

### Procedural brush behavior

- Generate deterministic variations from stable world-space seeds. Repainting unrelated tiles, panning or zooming must not reshuffle existing vegetation, texture patterns or objects.
- Separate region fill, edge treatment, object placement, object drawing, route rendering and boundary rendering. Reuse shared geometry and brush logic; delegate appearance to style-specific renderers and materials.
- Distribute vegetation and repeated terrain motifs with controlled randomness, spacing, clustering and size variation. Avoid perfectly regular grids or obvious repeated stamps unless the terrain is intentionally organized (e.g., farmland).
- Blend adjacent region masks in world space where suitable. Do not produce visible texture resets or artificial seams at every hex edge. Preserve hard edges for cliffs, walls, and other intentional boundaries.
- Render overlapping upright objects in a consistent depth order using ground anchors. Integrate shadows with the terrain rather than baking rectangular backgrounds or large opaque bases into assets.
- Routes must remain legible over their terrain. Rivers follow route geometry; a river crossing an elevation boundary may render a local waterfall as part of the liquid route, not as a unique wall asset. Style changes must not alter connectivity.
- Keep grid, selection, hover and editing overlays separate from art. Their visibility must not depend on terrain brightness or artistic texture.

### Materials and performance

Use appropriate combinations of vector paths, procedural shapes, raster caches, noise textures, masks and shaders. The specifications below describe visual results, not a mandated graphics API. Precompute or cache expensive static details where possible; animate only necessary material layers. Use world-space noise and mipmapping or equivalent filtering where appropriate. Avoid per-pixel procedural complexity that provides no visible benefit at the intended zoom.

---

## 3. Comic

**Visual identity:** traditional illustrated fantasy cartography with hand-inked contours, warm colors, simplified shapes and restrained painterly texture. It should feel drawn by a human illustrator rather than rendered by a 3D engine.

### Rendering language

- **Shape:** organic, slightly irregular silhouettes; rounded vegetation, angular mountain ridges, simple readable medieval architecture.
- **Linework:** dark warm charcoal or brown outlines, stronger on external silhouettes and lighter inside. Avoid perfectly uniform mathematical outlines where small irregularities improve the hand-drawn appearance. Keep line weight proportional to asset size.
- **Color:** muted but lively greens, ochres, slate grays, warm ivory masonry, terracotta roofs and medium blue water. Avoid neon saturation and pure black fills.
- **Shading:** two or three broad tonal regions per major form, with occasional soft brushlike accents. Prefer designed shadow shapes to realistic lighting gradients.
- **Texture:** subtle grain, short ink marks or sparse hatching. Texture must remain secondary to the silhouette.

### Element recipes

| Element | Procedural drawing direction |
|---|---|
| Tree | Build a tapered brown trunk and overlapping irregular rounded foliage lobes. Use dark outer contours, a darker lower canopy and lighter upper clusters. Vary lobe placement and proportions by seed. For conifers, use layered tapered bough silhouettes with simplified shadow wedges. |
| Mountain | Construct irregular triangular peaks with asymmetric ridges. Divide each into broad light and shaded rock faces; add angular snowcaps where appropriate. Use a strong silhouette and sparse interior fracture lines. Overlap peaks to form ranges. |
| Castle | Combine a central keep, towers, crenellated curtain walls, arched gates and conical or pitched red roofs. Use warm masonry fills, ink contours, simple shadow faces and sparse brick accents. Keep the silhouette more important than architectural detail. |
| Water | Use continuous blue fill with subtle broad tonal variation, short curved wave strokes and an organic shoreline contour. Add a lighter shallow-water band where appropriate. Use sparse hand-drawn highlights, not photorealistic reflections. |

### Implementation notes

Procedural Bézier or polygon silhouettes, layered fills, stroked paths, seeded shape perturbation and low-amplitude paper-like noise are suitable. For water, combine low-frequency noise with sparse directional curved marks. Keep shore outlines continuous across hexes.

**Avoid:** heavy black outlines at small zoom, excessive hatching, geometric perfection, shiny plastic shading, and decorative scene backgrounds.

---

## 4. FairyTale

**Visual identity:** colorful retro fantasy overworld art. In this project, FairyTale specifically means the pixel-art-inspired reference style, not generic whimsical storybook painting. It evokes classic 16-bit fantasy RPG maps.

### Rendering language

- **Shape:** compact, strongly readable silhouettes with deliberate stepped edges and simplified proportions.
- **Linework:** selective dark pixel contours, often using deep colored shadows rather than pure black. Internal contours should be sparse.
- **Color:** brighter and more saturated than Comic; fresh greens, warm golds, cool blue-gray mountains, warm cream stone, red-orange roofs and cyan-blue water. Use limited, coherent tonal ramps per material.
- **Shading:** discrete color clusters, stepped highlights and shadows. Do not rely on continuous gradients across individual objects.
- **Texture:** intentionally placed pixel clusters; occasional controlled dithering if it improves tonal transitions. Avoid random single-pixel noise everywhere.

### Element recipes

| Element | Procedural drawing direction |
|---|---|
| Tree | Generate compact foliage clusters using stepped rounded shapes and a narrow visible trunk. Use a dark green shadow mass, mid-green clusters and bright upper-left highlights. Quantize details to a consistent pixel lattice. |
| Mountain | Use angular stepped silhouettes, diagonal ridges, discrete gray and blue-gray rock planes, and bright snowcaps. Group neighboring peaks with deliberate pixel-level overlap. |
| Castle | Construct a compact medieval silhouette with towers, crenellations, warm stone, red roofs and dark gate/window clusters. Represent masonry selectively with a few pixel groups. Keep fine details aligned to the same pixel scale. |
| Water | Use a continuous blue surface, stepped lighter shallows, clustered cyan highlights and short pixel wave marks. Shore transitions should be deliberately quantized, not independently outlined per hex. Animate coherent pixel clusters if needed. |

### Implementation notes

Use a stable virtual pixel resolution or explicit world-space pixel quantization for art layers, with nearest-neighbor sampling at suitable magnifications. Palette quantization and deliberate cluster masks can be applied to procedural shapes. Avoid screen-space pixel snapping that makes textures crawl when panning. Keep the editor's grid and UI crisp independently of the pixel-art layer. At distant zoom, choose a controlled filtering or LOD strategy to avoid shimmer.

**Avoid:** merely downsampling Comic artwork, inconsistent pixel sizes between objects, blurred edges, modern glossy lighting, excessive dithering and excessive sparkle or magical decoration.

---

## 5. EpicFantasy

**Visual identity:** mature, painterly fantasy cartography with naturalistic materials, dramatic landforms and convincing depth. It supports both heroic high fantasy and darker fantasy through palette and atmosphere variations within the same style family.

### Rendering language

- **Shape:** irregular natural silhouettes, believable slopes, layered ridges and more plausible architectural proportions. Still exaggerate key features for map readability.
- **Linework:** minimal explicit outlines. Define edges with changes in value, hue, material and occlusion instead of heavy strokes.
- **Color:** rich but controlled earth tones, forest greens, slate, ivory snow and deep blue or teal water. Maintain useful contrast between neighboring biomes. Dark fantasy variants can shift toward cooler, muted colors and stronger shadows without making the map unreadable.
- **Shading:** continuous or softly stepped directional lighting, form shadows and localized ambient occlusion. Use a consistent light source across assets.
- **Texture:** layered organic texture at multiple scales, with larger forms dominating. Rock strata, foliage masses, masonry and subtle surface roughness should suggest material without overwhelming the map.

### Element recipes

| Element | Procedural drawing direction |
|---|---|
| Tree | Create an irregular canopy from overlapping foliage masses with directional highlights and dark internal occlusion. Suggest trunk and major branches where visible; individual leaves are optional at high zoom only. Integrate a restrained ground-contact shadow. |
| Mountain | Build asymmetric mountain silhouettes and branching ridges, with light and shaded slopes, rocky fractures and elevation-dependent snow. Use a mixture of broad relief and finer material texture. Blend foothills into the surrounding terrain instead of placing mountains on isolated bases. |
| Castle | Generate a believable medieval fortress with a keep, walls, towers, roof planes, buttresses or gates as appropriate. Use subdued masonry variation, directional shadows and coherent roof lighting. Emphasize the fortress silhouette over tiny windows and brickwork. |
| Water | Combine deep blue/teal water with lighter depth-dependent shallows, subtle multi-scale surface variation, directional ripples and restrained foam near shore or obstacles. Reflections and highlights should support a painterly aerial view, not become a cinematic eye-level scene. |

### Implementation notes

Consider layered fBm noise, ridged noise for rock relief, domain warping, procedural height or normal approximations and directional shading. Use masks to constrain texture to its material and elevation band. For water, use one or two scrolling noise layers or a precomputed surface texture with a depth/shore mask; use more complex shading only where justified. Cache expensive static relief and detail where supported by the renderer.

A dark fantasy preset may adjust saturation, hue, contrast, fog and vegetation health. It should not require a separate brush implementation or introduce horror motifs into every normal asset.

**Avoid:** photorealistic miniature scenes, excessive microdetail, cinematic sky backgrounds, heavy atmospheric effects that obscure the hex grid, and indiscriminately darkening all materials.

---

## 6. LowPoly — Pseudo-3D

**Visual identity:** high-resolution, clean, faceted low-poly 3D appearance rendered into a 2D map. The visual goal is a coherent miniature-like world with convincing volume, not actual low-resolution graphics. The implementation may use projected geometry, 2D polygons, generated meshes or pre-rendered elements as appropriate.

### Rendering language

- **Shape:** deliberately simplified geometric volumes with clear polygonal planes. Organic objects remain recognizable despite angular construction.
- **Linework:** no heavy outlines; silhouettes and edges are primarily defined by adjacent face colors.
- **Color:** clear, cohesive colors with distinct light and shadow faces. Prefer matte materials over plastic gloss.
- **Shading:** flat shading per facet with a stable directional light source. Add restrained contact shadows or ambient occlusion to reinforce apparent depth. Preserve visible facet boundaries rather than smoothing them away.
- **Texture:** mostly clean surfaces. Polygon facets provide the visual texture; avoid grain, pixelation and photographic detail.

### Element recipes

| Element | Procedural drawing direction |
|---|---|
| Tree | Use a tapered faceted trunk and several irregular polyhedral canopy volumes. Triangulate or divide canopy faces into meaningful light and shade regions. Conifers can use layered polygonal cones. Vary volume proportions and orientation without changing global lighting. |
| Mountain | Build an irregular triangulated peak or ridge mesh with broad angular faces and a nonuniform base. Shade each face according to its approximate normal and light direction. Assign snow by elevation and slope where appropriate. Connect or overlap peaks into ranges. |
| Castle | Assemble projected boxes, prisms, polygonal cylinders and pyramidal or conical roofs. Shade visible wall and roof faces consistently. Show roof geometry, battlements and tower depth without excessive subdivision. |
| Water | Use a continuous triangulated or polygon-faceted water surface in blue and turquoise. Subtle face-to-face value changes suggest shallow waves. Blend depth colors toward the shore and use sparse angular foam highlights. Do not render a separate raised block around every water hex. |

### Implementation notes

For a 2D implementation, construct simple 3D-like vertices, project them using a consistent orthographic convention, sort visible faces and calculate flat face colors from normals. Alternatively, explicitly design 2D facets where projection is unnecessary. Triangulate irregular surfaces with stable world-space points so adjacent tiles do not reset their patterns. Avoid arbitrary random colors on every triangle; facet values must imply coherent volume. Any ground-plane projection must remain compatible with the editor's existing hex geometry.

**Avoid:** pixelated edges, excessive tiny triangles, smooth glossy gradients, inconsistent perspective, floating miniature bases and full 3D camera behavior that conflicts with editing.

---

## 7. Quick comparison

| Property | Comic | FairyTale | EpicFantasy | LowPoly |
|---|---|---|---|---|
| Primary identity | Ink illustration | Retro pixel RPG | Painterly relief | Faceted pseudo-3D |
| Edge treatment | Organic ink strokes | Stepped pixel clusters | Material/value edges | Crisp polygon faces |
| Shading | Broad tonal shapes | Quantized color ramps | Directional, layered | Flat per face |
| Surface detail | Sparse marks and grain | Pixel clusters | Multi-scale natural texture | Geometric facets |
| Depth | Illustrated | Stylized | Naturalistic | Geometric volume |
| Water signature | Drawn wave strokes | Pixel ripples | Depth, ripples, foam | Angular surface facets |
| Main failure mode | Too busy or cartoonish | Blurry or inconsistent pixels | Too realistic or noisy | Random triangles or toy islands |

## 8. Suggested implementation workflow

1. Create one fixed test map with a forest brush, mountain brush, castle landmark, continuous water region, river, road, elevation boundary and several adjoining biomes.
2. Establish the style-specific palette ramps, outline behavior, lighting and texture scale at the intended map zoom before adding fine detail.
3. Implement each element using the existing brush or renderer interfaces. Keep shared semantics and geometry unchanged. Where possible, expose art parameters rather than duplicating entire systems.
4. Compare all four styles on the same map and seed, using the reference sheets as visual targets. Judge the full map as well as isolated objects.
5. Test overlapping forests and mountain ranges, irregular region edges, multiple zoom levels, route crossings, editing operations and style switching. Check for seams, popping, readability and performance regressions.
6. Refine high-impact visual differences first: silhouette, edge treatment, shading language, color and texture scale. Do not add complexity merely to reproduce a zoomed-in reference detail.

## 9. Acceptance criteria

- Each style is distinguishable immediately, even without its name or a different color palette.
- Trees, mountains and castles remain identifiable at ordinary world-map zoom; water reads as a continuous terrain material.
- Repeated brush elements look varied but belong to a coherent visual system.
- Adjacent hexes and regions do not expose accidental texture seams or inconsistent lighting.
- Style switching preserves map geometry, semantic information and editing behavior.
- Panning, zooming and unrelated edits do not cause random visual changes.
- The resulting art looks like a map assembled from compatible procedural elements, not a collection of independent illustrations.
- Performance is measured on representative dense maps; visual complexity is adjusted to meet the application's actual rendering budget.

**Naming note:** `LowPoly` is a proposed concise style identifier for Pseudo Low Poly. `FairyTale` retains the pixel-art meaning established for this project. All suggested techniques, lighting defaults and palette directions are implementation guidance, not fixed engine requirements or exact colors sampled from the references.
