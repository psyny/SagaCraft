/** A small map painting style for tests (plan 48): a few types of each layer and their sprites. */
import type { PaintPack } from '../../api/types'

const box = (w: number, h: number, anchor = '0.5 1', night = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" data-anchor="${anchor}"><rect width="${w}" height="${h}" fill="var(--a)"/>${night}</svg>`

export const TEST_PACK: PaintPack = {
  style: { key: 'storybook', name: 'Storybook', ink: '#1f1a17', light: '#ffd27a', paper_grain: 0.09, sprite_px: 64, feature_px: 96 },
  categories: [
    { key: 'ground', name: 'Ground', layer: 'terrain' }, { key: 'water', name: 'Water', layer: 'terrain' },
    { key: 'roads', name: 'Roads', layer: 'routes' }, { key: 'rivers', name: 'Rivers', layer: 'routes' },
    { key: 'walls', name: 'Walls', layer: 'boundaries' }, { key: 'cliffs', name: 'Cliffs', layer: 'boundaries' },
    { key: 'forests', name: 'Forests', layer: 'scenery' }, { key: 'settlements', name: 'Settlements', layer: 'scenery' },
    { key: 'lights', name: 'Lights', layer: 'effects' }, { key: 'mists', name: 'Mist and smoke', layer: 'effects' },
    { key: 'buildings', name: 'Buildings', layer: 'features' },
  ],
  types: [
    { key: 'ground.grass', kind: 'terrain', layer: 'terrain', category: 'ground', name: 'Grassland', roles: ['Ground', 'Strokes', 'Light'],
      colors: ['#cdc98d', '#8f9a58', '#e6dfb0'], art: { patches: 0.6, patterns: [{ kind: 'strokes', color: 'b', scale: 0.16, density: 0.28, size: 0.2, strength: 0.8 }] } },
    { key: 'water.lake', kind: 'terrain', layer: 'terrain', category: 'water', name: 'Lake', roles: ['Water', 'Deep', 'Shoreline'],
      colors: ['#93c2d1', '#5f93a8', '#d6c79e'], art: { fluid: true, depth: 0.75, waves: 0.2 } },
    { key: 'road.dirt', kind: 'road', layer: 'routes', category: 'roads', name: 'Dirt road', roles: ['Road', 'Edge', 'Ruts'],
      colors: ['#c8a676', '#6b4e2e', '#9c7a4e'], art: { look: 'dirt', width: 0.03, wobble: 1 } },
    { key: 'river.river', kind: 'river', layer: 'routes', category: 'rivers', name: 'River', roles: ['Water', 'Bank', 'Light'],
      colors: ['#86b8cc', '#3f6f86', '#e2f2f7'], art: { look: 'river', width: 0.06, wobble: 1 } },
    { key: 'trees.pine', kind: 'scenery', layer: 'scenery', category: 'forests', name: 'Pine forest', roles: ['Needles', 'Shade', 'Trunks'],
      colors: ['#5d7c4c', '#2f4632', '#6b4e2e'], art: { layers: [{ sprites: ['pine-1'], spacing: 0.25, height: [0.3, 0.4], keep: 1, sway: 1 }] } },
    { key: 'settlement.castle', kind: 'scenery', layer: 'scenery', category: 'settlements', name: 'Castle', roles: ['Stone', 'Roofs', 'Banners'],
      colors: ['#c9c1b2', '#55607a', '#b23a3a'], art: {
        inset: 0.12,
        layers: [{ sprites: ['keep-1'], spacing: 1, jitter: 0, height: [0.5, 0.5], keep: 1, clear: true }, { sprites: ['pine-1'], spacing: 0.2, height: [0.2, 0.2], keep: 1 }] } },
    { key: 'wall.castle', kind: 'boundary', layer: 'boundaries', category: 'walls', name: 'Castle wall', roles: ['Stone', 'Shade', 'Banners'],
      colors: ['#c9c1b2', '#55607a', '#b23a3a'], art: { look: 'castle', height: 0.18, thickness: 0.06,
        corner: { sprite: 'castle-tower', height: 0.34 }, gate: { sprite: 'castle-gate', height: 0.3 } } },
    { key: 'wall.fence', kind: 'boundary', layer: 'boundaries', category: 'walls', name: 'Wooden fence', roles: ['Rails', 'Posts', 'Light'],
      colors: ['#a07a4c', '#5c4128', '#c9a878'], art: { look: 'fence', height: 0.07, thickness: 0.012, falls: false } },
    { key: 'cliff.low', kind: 'boundary', layer: 'boundaries', category: 'cliffs', name: 'Low cliff', roles: ['Rock', 'Shade', 'Top'],
      colors: ['#a89c88', '#5e554a', '#9aa868'], art: { look: 'cliff', height: 0.12, thickness: 0.02 } },
    { key: 'lights.fireflies', kind: 'effect', layer: 'effects', category: 'lights', name: 'Fireflies', roles: ['Glow', 'Halo', 'Core'],
      colors: ['#e8ff7a', '#9adf4a', '#ffffff'], art: { particles: [{ shape: 'glow', density: 9, size: [0.05, 0.075], lift: [0.04, 0.3],
        motion: 'wander', amount: 0.2, speed: 0.5, night: true, glow: true, twinkle: 0.8 }] } },
    { key: 'mists.ground', kind: 'effect', layer: 'effects', category: 'mists', name: 'Ground mist', roles: ['Mist', 'Shade', 'Light'],
      colors: ['#eef2f6', '#c3ccd6', '#ffffff'], art: { particles: [{ shape: 'puff', density: 7, size: [0.3, 0.45], stretch: 2.4,
        motion: 'drift', amount: 0.25, speed: 0.12, opacity: 0.4 }] } },
    { key: 'feature.windmill', kind: 'feature', layer: 'features', category: 'buildings', name: 'Windmill', size: 1, roles: ['Walls', 'Sails', 'Roof'],
      colors: ['#e6d8b8', '#8a6a4a', '#8a4a3a'], art: { height: 0.6, variants: [[{ sprite: 'windmill' }, { sprite: 'windmill-sails', at: [0, -0.64], size: 0.9, spin: 0.12 }]] } },
    { key: 'feature.birds', kind: 'feature', layer: 'features', category: 'buildings', name: 'Birds', size: 2, roles: ['Wings', 'Shade', 'Beak'],
      colors: ['#2e2a28', '#1a1716', '#c8902a'], art: { height: 0.07, overhead: true, variants: [[{ sprite: 'bird-1', frames: ['bird-1', 'bird-2'], fps: 3, fly: 0.45, count: 2 }]] } },
  ],
  sprites: {
    'pine-1': box(40, 64, '0.5 0.94'), 'castle-tower': box(30, 56), 'castle-gate': box(44, 42), 'keep-1': box(54, 64, '0.5 0.95', '<g class="night"><rect width="2" height="2"/></g>'),
    windmill: box(30, 50, '0.5 0.96'), 'windmill-sails': box(50, 50, '0.5 0.5'), 'bird-1': box(20, 12, '0.5 0.5'), 'bird-2': box(20, 12, '0.5 0.5'),
  },
  version: 'test',
}
