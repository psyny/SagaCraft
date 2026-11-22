/** Timeline Set's settings (Build): whose knowledge it shows, the dates (or an era), the event types, expanded. */
import { api } from '../../../api'
import ComboTray from '../../../components/ComboTray'
import DateInput from '../../../saga/lore/DateInput'
import type { SetInspectorProps } from '../../types'
import type { TimelineConfig, TimelineContent } from './types'

export default function TimelineInspector({ set, editor }: SetInspectorProps) {
  const content = set.content as TimelineContent
  const config = content.config as TimelineConfig
  const update = (changes: Partial<TimelineConfig>) => void editor.run(() => api.updateSet(editor.sagaId, set.id, { config: changes }))
  const groups = (content.groups || []).filter((g) => g.key !== 'viewers')
  const pickedEra = content.eras.find((e) => e.start === config.from && e.end === config.to && e.end !== null)
  return (
    <div className="tool-panel">
      <div className="field">
        <span className="field-label">Whose knowledge</span>
        <ComboTray title="Whose knowledge" emptyLabel="Everything (the DM's)" value={config.groups.map(String)} onChange={(next) => update({ groups: next.map(Number) })}
          sections={[
            { title: 'Special', options: [{ id: '_dm', label: "Everything (the DM's)", whenEmpty: true }] },
            { title: 'Groups', options: groups.filter((g) => g.key !== 'admins').map((g) => ({ id: String(g.id), label: g.key === 'players' ? 'The players' : g.name })) },
          ]} />
        <span className="muted small">The events those groups can see. Whoever sees this Set sees them.</span>
      </div>
      <DateInput label="From" value={config.from} optional emptyLabel="The beginning" onChange={(v) => update({ from: v })} />
      <DateInput label="To" value={config.to} optional emptyLabel="The end" onChange={(v) => update({ to: v !== null && config.from !== null && v < config.from ? config.from : v })} />
      {content.eras.length > 0 && (
        <div className="field">
          <span className="field-label">Or an era</span>
          <div className="chips">
            {content.eras.filter((e) => e.end !== null).map((e) => (
              <button key={e.id} className={`chip era-chip ${pickedEra?.id === e.id ? 'on' : ''}`} style={{ borderColor: e.color }}
                onClick={() => update(pickedEra?.id === e.id ? { from: null, to: null } : { from: e.start, to: e.end })}>
                <span className="era-swatch" style={{ background: e.color }} />{e.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {(content.types || []).length > 1 && (
        <div className="field">
          <span className="field-label">Event types</span>
          <ComboTray title="Event types" emptyLabel="All types" value={config.types} onChange={(next) => update({ types: next })}
            sections={[
              { title: 'Special', options: [{ id: '_all', label: 'All types', whenEmpty: true }] },
              { title: 'Types', options: content.types.map((t) => ({ id: t.key, label: t.name })) },
            ]} />
        </div>
      )}
      <label className="check"><input type="checkbox" checked={config.expanded} onChange={(e) => update({ expanded: e.target.checked })} /> Events start expanded (their boxes shown)</label>
    </div>
  )
}
