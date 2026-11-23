/**
 * EFX Sets on the Stage (backend set_types/efx.py). The layer Sets draw their Stage environment's layer, filling
 * their box and letting clicks through (the Stage stays usable under the rain). Switching the environment and the
 * layers is the Stage's EFX control (stage/StageControls.tsx). See docs/concepts/efx.md.
 */
import EfxLayerView from '../../../efx/EfxLayerView'
import type { SetViewProps } from '../../types'
import type { EfxLayerContent } from './types'

export function EfxLayerSetView({ set, mode }: SetViewProps) {
  const content = set.content as EfxLayerContent
  if (!content.effects?.length) {
    return mode === 'build'
      ? <div className="panel-empty efx-empty">{content.environment ? `${content.environment.name}: nothing on this layer` : "No environment yet: pick one in the Stage panel (or with the Stage's EFX control)"}</div>
      : null
  }
  return <EfxLayerView layer={{ effects: content.effects }} />
}
