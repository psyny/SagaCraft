# 55 - Map Painter materials by style

Status: Done
Requirements: LOC-54, LOC-79, LOC-92, LOC-93

## Goal

Let each style choose the shader looks and parameters for animated map art. Keep the saved map, brush types, flow direction, animation controls and lighting behavior compatible across styles.

## Design

- Style packs select named materials in `style.json`. Type JSON files still set brush colors, densities, routes and dimensions. A renderer registry maps material names and bounded parameters to the ground and sprite shader passes.
- Compile the selected materials into each pass using the existing background compilation. Existing packs use the illustrated defaults. Low Poly selects angular flame, effect, ground and flowing liquid materials with flat faces, while keeping the current projection and night lighting.
- Use the same flame material for Wildfire, Sparse fire and both campfire brushes. Use the same waterfall material for water and lava, with their respective palettes and glow.

## Steps

- [x] Register reusable materials and support style switching.
- [x] Implement and tune the Low Poly materials.
- [x] Document the JSON fields and check both styles in the tests and browser.

The browser check rendered both styles on square and hex grids under Direct3D 11, Vulkan, and SwiftShader.
Low Poly built in 4.3 s on Direct3D 11. The OpenGL context failed before the painter check on this machine.
The sample map draws changing frames with animation on and identical frames with animation off.
