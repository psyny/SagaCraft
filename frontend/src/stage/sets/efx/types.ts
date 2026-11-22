import type { EfxEffect, EfxLayerKey } from '../../../api/types'

/** An EFX layer Set (far, near, fore): its Stage environment's layer. `environment` is the DM's only. */
export interface EfxLayerContent {
  layer: EfxLayerKey
  effects: EfxEffect[]
  environment?: { id: number; name: string } | null
}

/** EFX Controls (the DM's): the environments to switch to. */
export interface EfxControlsContent {
  current?: number | null
  environments?: { id: number; name: string }[]
}

export const EFX_LAYER_TYPES = ['efx_far', 'efx_near', 'efx_fore'] as const
export const LAYER_LABELS: Record<string, string> = { efx_far: 'Far', efx_near: 'Near', efx_fore: 'Front' }
