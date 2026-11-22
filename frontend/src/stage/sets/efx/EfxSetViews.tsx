/**
 * EFX Sets on the Stage (backend set_types/efx.py). The layer Sets draw their Stage environment's layer, filling
 * their box and letting clicks through (the Stage stays usable under the rain). EFX Controls is the DM's panel:
 * switch the Stage's environment in one click, and turn each EFX layer on or off (puts its Set away).
 * See docs/concepts/efx.md.
 */
import { Link } from 'react-router-dom'
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
    <div className="efx-controls" data-interactive onPointerDown={(e) => e.stopPropagation()}>
      <div className="chips">
        {content.environments.map((env) => (
          <button key={env.id} className={`chip ${content.current === env.id ? 'on' : ''}`} onClick={() => show(env.id)}
            title={content.current === env.id ? 'Showing now' : 'Show this environment'}>{env.name}</button>
        ))}
        <button className={`chip ${content.current == null ? 'on' : ''}`} onClick={() => show(null)}>None</button>
        {content.environments.length === 0 && <span className="muted small">No environments yet.</span>}
      </div>
      <div className="efx-controls-row">
        {layers.map((s) => (
          <button key={s.id} className={`small toolbar-eye ${s.off ? 'off' : ''}`} aria-pressed={!s.off}
            title={s.off ? `${s.name}: put away (show it again)` : `${s.name}: hide it for now`}
            onClick={() => void editor.run(() => api.updateSet(editor.sagaId, s.id, { off: !s.off }))}>
            <EyeIcon open={!s.off} /> {LAYER_LABELS[s.type]}
          </button>
        ))}
        <span className="spacer" />
        {mode !== 'view' && <Link className="small" to={`/s/${editor.sagaId}/efx`}>Environments →</Link>}
      </div>
    </div>
  )
}
