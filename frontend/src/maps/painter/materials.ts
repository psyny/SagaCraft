import type { PaintMaterials } from '../../api/types'
import { ANGULAR_EDGES, FACET_FIELD, LAVA_PLATES, FACET_FLAME, FACET_PARTICLES } from './facetedMaterials'

type Slot = keyof PaintMaterials
type Parameter = readonly [defaultValue: number, min: number, max: number]
interface Material {
  parameters: Record<string, Parameter>
  functions?: string
}

/** Each slot has an illustrated default in the shared pass. Register alternate GLSL looks here. */
const looks: Record<Slot, Record<string, Material>> = {
  ground: { faceted: { functions: FACET_FIELD, parameters: { size: [0.53, 0.15, 1.5], contrast: [0.22, 0, 0.7] } } },
  terrain_edges: { angular: { functions: ANGULAR_EDGES, parameters: { size: [0.42, 0.15, 1], offset: [0.13, 0, 0.35], blend: [0.015, 0, 0.15] } } },
  routes: { segmented: { parameters: { segments: [3, 1, 12] } } },
  boundaries: { faceted: { functions: FACET_FIELD, parameters: { contrast: [0.48, 0, 1], scale: [0.7, 0.2, 2] } } },
  water: { faceted: { functions: FACET_FIELD, parameters: { size: [0.48, 0.15, 1.5], speed: [0.55, 0, 3], foam: [0.55, 0, 1], swell: [0.4, 0, 1] } } },
  lava: { plates: { functions: LAVA_PLATES, parameters: { size: [0.26, 0.06, 0.8], speed: [0.14, 0, 1], glow: [0.55, 0, 1] } } },
  river: { shards: { parameters: { spacing: [0.18, 0.06, 0.6], speed: [0.18, 0, 1], contrast: [0.62, 0, 1] } } },
  waterfall: { sheets: { parameters: { width: [0.34, 0.15, 1], speed: [2.4, 0, 8], foam: [0.72, 0, 1] } } },
  flame: { faceted: { functions: FACET_FLAME, parameters: { flicker: [3.4, 0, 10], heat: [0.70, 0, 1] } } },
  particles: { faceted: { functions: FACET_PARTICLES, parameters: { contrast: [0.55, 0, 1] } } },
  light_road: { pulses: { parameters: { spacing: [0.42, 0.1, 1.5], speed: [0.44, 0, 2] } } },
  barrier: { shards: { parameters: { size: [0.24, 0.1, 0.8], speed: [1.1, 0, 5] } } },
}

export interface Materials {
  key: string
  ground: string
  sprites: string
  defines: string
}

const groundSlots: Slot[] = ['ground', 'terrain_edges', 'routes', 'water', 'lava', 'river', 'light_road']

export function resolveMaterials(settings: PaintMaterials = {}): Materials {
  const defines: string[] = []
  const ground = new Set<string>()
  const sprites = new Set<string>()
  for (const slot of Object.keys(looks) as Slot[]) {
    const choice = settings[slot]
    if (!choice || !Object.prototype.hasOwnProperty.call(looks[slot], choice.look)) continue
    const material = looks[slot][choice.look]
    const prefix = `MAP_${slot.toUpperCase()}`
    defines.push(`#define ${prefix}_${choice.look.toUpperCase()}`)
    for (const [name, [fallback, min, max]] of Object.entries(material.parameters)) {
      const raw = choice.params?.[name]
      const number = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(min, Math.min(max, raw)) : fallback
      defines.push(`#define ${prefix}_${name.toUpperCase()} ${name === 'segments' ? Math.round(number) : number.toFixed(4)}`)
    }
    if (material.functions) (groundSlots.includes(slot) ? ground : sprites).add(material.functions)
  }
  const header = defines.join('\n')
  return { key: header, defines: header, ground: [...ground].join('\n'), sprites: [...sprites].join('\n') }
}

export const DEFAULT_MATERIALS = resolveMaterials()

export function withMaterials(source: string, materials: Materials, pass: 'ground' | 'sprites'): string {
  const marker = '// @materials'
  if (!source.includes(marker)) throw new Error('Map Painter shader is missing its material functions marker')
  return `${materials.defines}\n${source.replace(marker, materials[pass])}`
}
