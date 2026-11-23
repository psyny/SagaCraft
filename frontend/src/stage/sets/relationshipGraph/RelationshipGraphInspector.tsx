/** Relationship graph Set's settings (Build, or a window in Play): whose knowledge it shows, the query, labels, the
 * moment; reset the layout; delete it. */
import { useEffect, useState } from 'react'
import { api } from '../../../api'
import type { Resource } from '../../../api/types'
import ResourcePicker from '../../../components/ResourcePicker'
import DateInput from '../../../saga/lore/DateInput'
import { KIND_NAMES, sagaKinds } from '../../../saga/lore/relationships'
import { useSaga } from '../../../saga/SagaContext'
import type { SetInspectorProps } from '../../types'
import type { RelationshipGraphConfig, RelationshipGraphContent } from './types'

export default function RelationshipGraphInspector({ set, editor }: SetInspectorProps) {
  const { ruleset } = useSaga()
  const content = set.content as RelationshipGraphContent
  const config = content.config as RelationshipGraphConfig
  const [picking, setPicking] = useState(false)
  const [names, setNames] = useState<Record<number, string>>({})
  const update = (changes: Partial<RelationshipGraphConfig>) => void editor.run(() => api.updateSet(editor.sagaId, set.id, { config: changes }))
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x])
  useEffect(() => {
    const missing = config.ids.filter((i) => !names[i])
    if (missing.length) Promise.all(missing.map((i) => api.resource(editor.sagaId, i).catch(() => null)))
      .then((rs) => setNames((n) => ({ ...n, ...Object.fromEntries(rs.filter((r): r is Resource => r !== null).map((r) => [r.id, r.name])) })))
  }, [config.ids, names, editor.sagaId])

  return (
    <div className="tool-panel">
      <div className="field">
        <span className="field-label">Whose knowledge</span>
        <div className="chips">
          {(content.groups || []).map((g) => (
            <button key={g.id} className={`chip ${config.groups.includes(g.id) ? 'on' : ''}`} onClick={() => update({ groups: toggle(config.groups, g.id) })}>
              {g.key === 'admins' ? 'The truth (DM)' : g.name}
            </button>
          ))}
        </div>
        <span className="muted small">Whoever sees this Set sees these relationships (resources they can't see stay “???”).</span>
      </div>
      <div className="field">
        <span className="field-label">Show</span>
        <div className="chips">
          {([['characters', 'Characters'], ['all', 'Everything'], ['around', 'Around…'], ['set', 'Among…']] as const).map(([m, label]) => (
            <button key={m} className={`chip ${config.mode === m ? 'on' : ''}`} onClick={() => update({ mode: m })}>{label}</button>
          ))}
        </div>
        {(config.mode === 'around' || config.mode === 'set') && (
          <>
            <div className="chips">
              {config.ids.map((i) => <button key={i} className="chip on" onClick={() => update({ ids: config.ids.filter((x) => x !== i) })}>{names[i] ?? '…'} ✕</button>)}
              <button className="chip" onClick={() => setPicking(true)}>＋</button>
            </div>
            <label className="inline-slider">Reach
              <select value={config.hops} onChange={(e) => update({ hops: Number(e.target.value) })} aria-label="Hops">
                {[0, 1, 2, 3].map((h) => <option key={h} value={h}>{h === 0 ? 'only them' : `${h} step${h > 1 ? 's' : ''}`}</option>)}
              </select>
            </label>
          </>
        )}
      </div>
      <div className="field">
        <span className="field-label">Kinds</span>
        <div className="chips">
          {sagaKinds(ruleset).map((k) => <button key={k} className={`chip ${config.kinds.includes(k) ? 'on' : ''}`} onClick={() => update({ kinds: toggle(config.kinds, k) })}>{KIND_NAMES[k]}</button>)}
        </div>
      </div>
      <DateInput label="As of" value={config.at} optional emptyLabel="Any time" onChange={(v) => update({ at: v })} />
      <label className="check"><input type="checkbox" checked={config.labels} onChange={(e) => update({ labels: e.target.checked })} /> Labels on links</label>
      <label className="check"><input type="checkbox" checked={config.references} onChange={(e) => update({ references: e.target.checked })} /> Also the template's links</label>
      <div className="button-row">
        <span className="muted small">Drag nodes to place them for everyone.</span>
        {Object.keys(config.positions).length > 0 && (
          <button className="small" onClick={() => void editor.run(() => api.setCommand(editor.sagaId, set.id, 'nodes.reset'))}>Reset layout</button>
        )}
      </div>
      <ResourcePicker open={picking} title="Resources" kinds={sagaKinds(ruleset)} exclude={config.ids}
        onPick={(ids, rs) => { setNames((n) => ({ ...n, ...Object.fromEntries(rs.map((r) => [r.id, r.name])) })); update({ ids: [...config.ids, ...ids] }) }}
        onClose={() => setPicking(false)} />
      <div className="button-row">
        <span className="spacer" />
        <button className="danger ghost" onClick={() => {
          if (window.confirm(`Delete "${set.name}"?`)) void editor.run(() => api.deleteSet(editor.sagaId, set.id))
        }}>Delete</button>
      </div>
    </div>
  )
}
