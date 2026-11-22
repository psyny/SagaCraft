/** Build: an EFX Set's settings: its name, who sees it, and the Stage's environment (shared by all its EFX Sets). */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../../api'
import type { Environment } from '../../../api/types'
import VisibilityPicker from '../../../components/VisibilityPicker'
import { useSaga } from '../../../saga/SagaContext'
import type { SetInspectorProps, StageEditor } from '../../types'

/** The Stage's environment (EFX): a select, shared by the Stage panel and the EFX Sets' panels. */
export function StageEnvironment({ editor }: { editor: StageEditor }) {
  const [list, setList] = useState<Environment[] | null>(null)
  useEffect(() => { api.environments(editor.sagaId).then(setList).catch(() => setList([])) }, [editor.sagaId])
  const current = editor.stage.environment_id ?? null
  return (
    <div className="field">
      <span className="field-label">Environment (EFX)</span>
      <select value={current ?? ''} aria-label="Environment"
        onChange={(e) => void editor.run(() => api.setStageEnvironment(editor.sagaId, editor.stage.id, e.target.value ? Number(e.target.value) : null))}>
        <option value="">None</option>
        {(list || []).map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}
      </select>
      <span className="muted small">What this Stage's EFX Sets show (far, near, foreground). <Link to={`/s/${editor.sagaId}/efx`}>Build environments</Link></span>
    </div>
  )
}

export default function EfxInspector({ set, editor }: SetInspectorProps) {
  const { saga } = useSaga()
  const [name, setName] = useState(set.name)
  useEffect(() => setName(set.name), [set.id, set.name])
  const controls = set.type === 'efx_controls'
  return (
    <div className="inspector">
      <section className="inspector-section">
        <div className="inspector-kind">{controls ? 'EFX controls' : 'EFX layer'}</div>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== set.name && editor.run(() => api.updateSet(editor.sagaId, set.id, { name }))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </label>
        <div className="field">
          <span className="field-label">Who sees it</span>
          <VisibilityPicker value={set.visibility || { groups: [], members: [] }} groups={saga.groups} members={saga.members}
            emptyLabel="Hidden (admins only)" onChange={(visibility) => editor.run(() => api.updateSet(editor.sagaId, set.id, { visibility }))} />
        </div>
        <StageEnvironment editor={editor} />
        <p className="muted small">{controls
          ? 'Your panel at the table: switch the environment in one click, turn each EFX layer on or off.'
          : 'Layers never catch clicks: whatever is under them stays usable. Far and near go behind the other Sets, the foreground over them.'}</p>
      </section>
      <section className="inspector-section">
        <button className="danger ghost" onClick={() => editor.run(() => api.deleteSet(editor.sagaId, set.id))}>Delete</button>
      </section>
    </div>
  )
}
