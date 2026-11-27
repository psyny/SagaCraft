import type { LocationMap } from '../../../api/types'
import type { FogLook } from '../../../maps/shader'

/** A map Set's content, as the server rendered it for this viewer. */
export interface MapSetContent {
  /** The look the fog is drawn with (the Set's fog preset). */
  fog: FogLook
  show_grid: boolean
  /** How fast a planned move's token goes along its route (plan 59): 1 (slow) to 10 (at once). */
  move_speed?: number
  /** May this viewer click resources on the map (their role is interactive)? */
  interactive: boolean
  /** The shown location's map (null: no location yet). */
  map: LocationMap | null
  // admin only
  locations?: { actor_id: number; id: number; name: string }[]
  current?: number | null
  /** DM, World map: the Saga's fog presets and the one this Set uses. */
  fog_presets?: { id: number; name: string }[]
  fog_preset?: number
  config?: {
    interactive: { players: boolean; viewers: boolean }
    /** The highlighted tiles, kept while the highlight is off. */
    highlight?: [number, number][] | null
    highlight_on?: boolean
  }
}
