/** Map Sets' settings (Build side panel) and Play menu: locations, the fog preset, who may click. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../../api'
import type { StageSetView } from '../../../api/types'
import ResourcePicker from '../../../components/ResourcePicker'
import VisibilityPicker from '../../../components/VisibilityPicker'
import { useSaga } from '../../../saga/SagaContext'
import type { SetInspectorProps, SetMenuProps, StageEditor } from '../../types'
import type { MapSetContent } from './types'

function Locations({ set, editor }: { set: StageSetView; editor: StageEditor }) {
  const content = set.content as MapSetContent
  const [picking, setPicking] = useState(false)
  const locations = content.locations || []
  const add = (ids: number[]) => void editor.run(() => api.addActors(editor.sagaId, set.id, { resource_ids: ids }))
  return (
    <div className="field">
      <span className="field-label">Locations</span>
      <div className="location-rows">
        {locations.map((l) => (
          <div key={l.id} className={`location-row ${l.id === content.current ? 'on' : ''}`}>
            <input type="radio" name={`map-${set.id}`} checked={l.id === content.current} aria-label={`Show ${l.name}`}
              onChange={() => void editor.run(() => api.setCommand(editor.sagaId, set.id, 'location.show', { location_id: l.id }))} />
            <span>{l.name}</span>
            <button className="small ghost" aria-label={`Remove ${l.name}`} onClick={() => void editor.run(() => api.deleteActor(editor.sagaId, l.actor_id))}>✕</button>
          </div>
        ))}
      </div>
      <button className="small" onClick={() => setPicking(true)}>＋ Add locations</button>
      <span className="muted small">Players see one at a time: switch it from the map's button in the Set bar (any location, these first).</span>
      <ResourcePicker open={picking} title="Locations on this map" kinds={['location']}
        multiple exclude={locations.map((l) => l.id)}
        onPick={(ids) => add(ids)} onClose={() => setPicking(false)} />
    </div>
  )
}

/** How fast a planned move's token goes along its route (plan 59): saved when the slider is let go; 10 is at once. */
function MoveSpeed({ value, onSave }: { value: number; onSave: (speed: number) => void }) {
  const [shown, setShown] = useState(value)
  useEffect(() => setShown(value), [value])
  const commit = () => { if (shown !== value) onSave(shown) }
  return (
    <label className="slider">
      <span className="slider-head">Planned moves' speed <span className="muted">{shown >= 10 ? 'at once' : `${shown} / 10`}</span></span>
      <input type="range" min={1} max={10} step={1} value={shown} aria-label="Planned moves' speed"
        onChange={(e) => setShown(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </label>
  )
}

function Display({ set, editor }: { set: StageSetView; editor: StageEditor }) {
  const content = set.content as MapSetContent
  const update = (config: Record<string, unknown>) => void editor.run(() => api.updateSet(editor.sagaId, set.id, { config }))
  const interactive = content.config?.interactive ?? { players: true, viewers: false }
  return (
    <>
      <label className="check"><input type="checkbox" checked={content.show_grid} onChange={(e) => update({ show_grid: e.target.checked })} /> Show the grid</label>
      <MoveSpeed value={content.move_speed ?? 5} onSave={(move_speed) => update({ move_speed })} />
      <>
          <div className="field">
            <span className="field-label">Fog</span>
            <div className="chips">
              {(content.fog_presets || []).map((p) => (
                <button key={p.id} type="button" className={`chip ${p.id === content.fog_preset ? 'on' : ''}`}
                  onClick={() => p.id !== content.fog_preset && update({ fog_preset: p.id })}>{p.name}</button>
              ))}
            </div>
            <Link className="small" to={`/s/${editor.sagaId}/efx/fog`}>Edit fog presets…</Link>
          </div>
          <div className="field">
            <span className="field-label">Clicking resources on the map</span>
            {(['players', 'viewers'] as const).map((role) => (
              <label key={role} className="check">
                <input type="checkbox" checked={interactive[role]} onChange={(e) => update({ interactive: { [role]: e.target.checked } })} />
                {role === 'players' ? 'Players' : 'Viewers'} open them (characters, items, other maps)
              </label>
            ))}
          </div>
      </>
    </>
  )
}

export default function MapSetInspector({ set, editor }: SetInspectorProps) {
  const { saga } = useSaga()
  const [name, setName] = useState(set.name)
  useEffect(() => setName(set.name), [set.id, set.name])
  return (
    <div className="inspector">
      <section className="inspector-section">
        <div className="inspector-kind">Map</div>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== set.name && editor.run(() => api.updateSet(editor.sagaId, set.id, { name }))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </label>
        <div className="field">
          <span className="field-label">Who sees this map</span>
          <VisibilityPicker value={set.visibility || { groups: [], members: [] }} groups={saga.groups} members={saga.members}
            emptyLabel="Hidden (admins only)" onChange={(visibility) => editor.run(() => api.updateSet(editor.sagaId, set.id, { visibility }))} />
        </div>
        <label className="check">
          <input type="checkbox" checked={Boolean(set.transparent)} onChange={(e) => editor.run(() => api.updateSet(editor.sagaId, set.id, { transparent: e.target.checked }))} />
          Transparent (no background; title bar only in Build and on hover)
        </label>
      </section>
      <section className="inspector-section"><Locations set={set} editor={editor} /></section>
      <section className="inspector-section"><Display set={set} editor={editor} /></section>
      <section className="inspector-section">
        <button className="danger ghost" onClick={() => editor.run(() => api.deleteSet(editor.sagaId, set.id))}>Delete map</button>
      </section>
    </div>
  )
}

/** Play: the title's popup. */
export function MapSetPlayMenu({ set, editor, close }: SetMenuProps) {
  const content = set.content as MapSetContent
  // A shown highlight is what attention goes to
  return (
    <div className="menu wide">
      <div className="menu-title">{set.name}{content.map ? ` · ${content.map.location.name}` : ''}</div>
      {(content.locations?.length ?? 0) > 1 && (
        <div className="menu-field">
          <span className="field-label">Players see</span>
          <div className="chips">
            {content.locations!.map((l) => (
              <button key={l.id} type="button" className={`chip ${l.id === content.current ? 'on' : ''}`}
                onClick={() => void editor.run(() => api.setCommand(editor.sagaId, set.id, 'location.show', { location_id: l.id }))}>{l.name}</button>
            ))}
          </div>
        </div>
      )}
      <Display set={set} editor={editor} />
      <div className="menu-row">
        <button disabled={!editor.stage.is_live}
          title={!editor.stage.is_live ? 'Make this Stage live first' : 'Every view shows the whole map (Map tools → Grab attention shares your zoom)'}
          onClick={() => { void editor.run(() => api.grabAttention(editor.sagaId, set.id, null)); close() }}>
          ◎ Grab attention (whole map)</button>
        {editor.openSettings && <button className="ghost" onClick={() => { editor.openSettings!(set.id, null); close() }}>⚙ Map settings…</button>}
      </div>
    </div>
  )
}
