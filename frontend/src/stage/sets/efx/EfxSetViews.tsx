/**
 * EFX Sets on the Stage (backend set_types/efx.py). The layer Sets draw their Stage environment's layer, filling
 * their box and letting clicks through (the Stage stays usable under the rain). EFX Controls is the DM's panel:
 * pick the Stage's environment (a dropdown), and turn each EFX layer on or off (puts its Set away). They're its main
 * options, in the Set bar; the Set itself is see-through and lets clicks through.
 * See docs/concepts/efx.md.
 */
import { Link } from 'react-router-dom'
import Toolbar from '../../Toolbar'
import { api } from '../../../api'
import EfxLayerView from '../../../efx/EfxLayerView'
import EyeIcon from '../../../components/EyeIcon'
import type { SetViewProps } from '../../types'
import { EFX_LAYER_TYPES, LAYER_LABELS, type EfxControlsContent, type EfxLayerContent } from './types'

export function EfxLayerSetView({ set, mode }: SetViewProps) {
  const content = set.content as EfxLayerContent
  if (!content.effects?.length) {
    return mode === 'build'
      ? <div className="panel-empty efx-empty">{content.environment ? `${content.environment.name}: nothing on this layer` : 'No environment yet: pick one in the Stage panel (or with EFX Controls)'}</div>
      : null
  }
  return <EfxLayerView layer={{ effects: content.effects }} />
}

export function EfxControlsView({ set, editor, mode }: SetViewProps) {
  const content = set.content as EfxControlsContent
  if (!editor || !content.environments) return null
  const show = (environmentId: number | null) =>
    void editor.run(() => api.setCommand(editor.sagaId, set.id, 'environment.show', { environment_id: environmentId }))
  const layers = editor.stage.sets.filter((s) => (EFX_LAYER_TYPES as readonly string[]).includes(s.type)).sort((a, b) => a.layer - b.layer)
  return (
    <Toolbar id="main">
      <select className="small efx-pick" aria-label="Environment" title="The Stage's environment" value={content.current ?? ''}
        onChange={(e) => show(e.target.value ? Number(e.target.value) : null)}>
        <option value="">No environment</option>
        {content.environments.map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}
      </select>
      {layers.map((s) => (
        <button key={s.id} className={`small toolbar-eye ${s.off ? 'off' : ''}`} aria-pressed={!s.off}
          title={s.off ? `${s.name}: put away (show it again)` : `${s.name}: hide it for now`}
          onClick={() => void editor.run(() => api.updateSet(editor.sagaId, s.id, { off: !s.off }))}>
          <EyeIcon open={!s.off} /> {LAYER_LABELS[s.type]}
        </button>
      ))}
      {mode !== 'view' && <Link className="small efx-link" to={`/s/${editor.sagaId}/efx`}>Environments →</Link>}
    </Toolbar>
  )
}
