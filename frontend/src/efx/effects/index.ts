/** The animated effects by kind (gradient and image are plain CSS: see EfxLayerView). */
import { abstract } from './abstract'
import { fog } from './fog'
import { landscape } from './landscape'
import { sky } from './sky'
import { space } from './space'
import type { EffectFactory } from './types'
import { vignette } from './vignette'
import { weather } from './weather'

export const EFFECTS: Record<string, EffectFactory> = { sky, space, abstract, landscape, weather, vignette, fog }
