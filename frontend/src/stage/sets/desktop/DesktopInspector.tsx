/** Desktop Set's settings (Build, or a window in Play): name, who sees it, Auto or Free, the space between pieces, the
 * background's opacity, and the pieces. */
import { useEffect, useState } from 'react'
import { api } from '../../../api'
import EyeIcon from '../../../components/EyeIcon'
import Segmented from '../../../components/Segmented'
import VisibilityPicker from '../../../components/VisibilityPicker'
import { useSaga } from '../../../saga/SagaContext'
import type { SetInspectorProps } from '../../types'
import type { DeskLayout, DesktopContent, Piece } from './types'

const label = (p: Piece) => p.kind === 'image' ? (p.caption || 'Picture') : p.kind === 'document' ? (p.title ?? '???')
  : p.kind === 'item' ? (p.sheet.name ?? '???') : (p.card?.name ?? p.sheet?.name ?? '???')

/** The desk's background opacity: the Stage follows while dragging, saved when released. */
function BackgroundSlider({ set, editor }: Pick<SetInspectorProps, 'set' | 'editor'>) {
  const content = set.content as DesktopContent
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? content.background ?? 78
  const preview = (background: number) => editor.apply({
    ...editor.stage, sets: editor.stage.sets.map((s) => (s.id === set.id ? { ...s, content: { ...(s.content as DesktopContent), background } } : s)),
  })
  const commit = () => {
    if (draft === null) return
    void editor.run(() => api.updateSet(editor.sagaId, set.id, { config: { background: draft } }))
    setDraft(null)
  }
  return (
    <label className="inline-slider">Background
      <input type="range" min={0} max={100} step={1} value={shown} aria-label="Background opacity"
        onChange={(e) => { const v = Number(e.target.value); setDraft(v); preview(v) }} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      <span className="muted small">{shown}%</span>
    </label>
  )
}

export default function DesktopInspector({ set, editor }: SetInspectorProps) {
  const { saga } = useSaga()
  const content = set.content as DesktopContent
  const [name, setName] = useState(set.name)
  useEffect(() => setName(set.name), [set.id, set.name])
  const update = (config: Record<string, unknown>) => void editor.run(() => api.updateSet(editor.sagaId, set.id, { config }))
  return (
    <div className="inspector">
      <section className="inspector-section">
        <div className="inspector-kind">Desktop</div>
        <label>Name
          <input value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== set.name && editor.run(() => api.updateSet(editor.sagaId, set.id, { name }))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </label>
        <div className="field">
          <span className="field-label">Who sees it</span>
          <VisibilityPicker value={set.visibility || { groups: [], members: [] }} groups={saga.groups} members={saga.members}
            emptyLabel="Hidden (admins only)" onChange={(visibility) => editor.run(() => api.updateSet(editor.sagaId, set.id, { visibility }))} />
        </div>
        <div className="field">
          <span className="field-label">Arrangement</span>
          <Segmented<DeskLayout> value={content.layout} options={[['auto', 'Auto: fill the desk'], ['free', 'Free: by hand']]} onChange={(layout) => update({ layout })} />
        </div>
        <label className="inline-slider">Space between pieces
          <input type="range" min={0} max={80} value={content.gap} onChange={(e) => update({ gap: Number(e.target.value) })} />
        </label>
        <BackgroundSlider set={set} editor={editor} />
      </section>
      <section className="inspector-section">
        <span className="field-label">Pieces <span className="muted">{content.pieces.length}</span></span>
        {content.pieces.length === 0 && <p className="muted small">Add them from the desk's toolbar: characters, items, documents, pictures.</p>}
        <div className="path-list">
          {content.pieces.map((p) => (
            <div key={p.id} className="path-row">
              <button className="small ghost" title={p.shown === false ? 'Show it to the players' : 'Hide it from the players'}
                onClick={() => void editor.run(() => api.setCommand(editor.sagaId, set.id, 'piece.set', { actor_id: p.id, shown: p.shown === false }))}>
                <EyeIcon open={p.shown !== false} /></button>
              <span>{label(p)}</span>
              <span className="muted small">{p.kind}</span>
              <span className="spacer" />
              <button className="small ghost danger" aria-label={`Remove ${label(p)}`} onClick={() => void editor.run(() => api.deleteActor(editor.sagaId, p.id))}>✕</button>
            </div>
          ))}
        </div>
      </section>
      <section className="inspector-section">
        <button className="danger ghost" onClick={() => editor.run(() => api.deleteSet(editor.sagaId, set.id))}>Delete</button>
      </section>
    </div>
  )
}
