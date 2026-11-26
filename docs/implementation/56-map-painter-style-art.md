# 56 - Map Painter geometry and art direction

Status: Done
Requirements: LOC-54, LOC-79, LOC-93, LOC-94

## Design

- Style materials select connected route tessellation and terrain edge treatment. Low Poly uses three straight segments across a two-link tile and sharper polygonal terrain edges.
- The renderer integrates organic feet with an opacity gradient. Both sprite packs omit baked ground shadows and outlines along soil contact.
- Use the five reference sheets and the shared guide under `docs/concepts/map-painter-styles/`. Redraw Storybook in colored ink with selective hatching, and strengthen Low Poly's architecture, faceted boundaries and liquid materials.
- Preserve paint type keys, route links and flow, sprite anchors, layer ordering, and the animation preference.

## Verification

- Validated both 66-sprite packs and ran the frontend map and backend painter suites.
- Rendered both styles on the sample map and recorded the Low Poly liquid animation. GPU checks passed on Direct3D 11,
  Vulkan and SwiftShader. Chrome's OpenGL process lost its context before reaching the painter check.
