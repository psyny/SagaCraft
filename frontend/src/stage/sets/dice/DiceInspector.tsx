/** Dice roller Set's settings (Build): name, who sees it, its roll types (they start as the Saga template's). */
import { useEffect, useState } from 'react'
import { api } from '../../../api'
import Segmented from '../../../components/Segmented'
import VisibilityPicker from '../../../components/VisibilityPicker'
import { useSaga } from '../../../saga/SagaContext'
import type { SetInspectorProps } from '../../types'
import RollTypesEditor from './RollTypesEditor'
import type { DiceContent } from './types'

export default function DiceInspector({ set, editor }: SetInspectorProps) {
  const { saga } = useSaga()
  const content = set.content as DiceContent
  const [name, setName] = useState(set.name)
  useEffect(() => setName(set.name), [set.id, set.name])
  return (
    <div className="inspector">
      <section className="inspector-section">
        <div className="inspector-kind">Dice roller</div>
        <label>Name
          <input value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== set.name && editor.run(() => api.updateSet(editor.sagaId, set.id, { name }))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </label>
        <div className="field">
          <span className="field-label">Who sees it</span>
          <VisibilityPicker value={set.visibility || { groups: [], members: [] }} groups={saga.groups} members={saga.members}
            emptyLabel="Hidden (admins only)" onChange={(visibility) => editor.run(() => api.updateSet(editor.sagaId, set.id, { visibility }))} />
          <span className="muted small">Players who see it add dice and roll; viewers watch.</span>
        </div>
        <div className="field">
          <span className="field-label">The tray</span>
          <Segmented value={content.tray_edge ?? 'bottom'} options={[['bottom', 'Bottom'], ['top', 'Top'], ['left', 'Left'], ['right', 'Right']]}
            onChange={(tray_edge) => editor.run(() => api.updateSet(editor.sagaId, set.id, { config: { tray_edge } }))} />
          <span className="muted small">Where the dice wait; they're thrown from there. The roll buttons sit in its main toolbar; the tray's list and the results are toolbars too: place them under Controls.</span>
        </div>
        <label className="inline-slider">Speed
          <input type="range" min={0.5} max={5.5} step={0.25} value={content.speed ?? 2} aria-label="Roll speed"
            onChange={(e) => editor.run(() => api.updateSet(editor.sagaId, set.id, { config: { speed: Number(e.target.value) } }))} />
          <span className="small">{(content.speed ?? 2) > 5 ? 'Instant' : `×${content.speed ?? 2}`}</span>
        </label>
        <label className="inline-slider">Dice size
          <input type="range" min={0.6} max={1.8} step={0.1} value={content.dice_size ?? 1} aria-label="Dice size"
            onChange={(e) => editor.run(() => api.updateSet(editor.sagaId, set.id, { config: { dice_size: Number(e.target.value) } }))} />
          <span className="small">{Math.round((content.dice_size ?? 1) * 100)}%</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={Boolean(set.transparent)} onChange={(e) => editor.run(() => api.updateSet(editor.sagaId, set.id, { transparent: e.target.checked }))} />
          Transparent (no background: the dice roll over what's under it)
        </label>
      </section>
      <section className="inspector-section">
        <span className="field-label">Roll types</span>
        <RollTypesEditor value={content.roll_types} onSave={(roll_types) => editor.run(() => api.updateSet(editor.sagaId, set.id, { config: { roll_types } }))} />
        <span className="muted small">New dice rollers start with the Saga template's (Saga → Template → Dice rolls).</span>
      </section>
      <section className="inspector-section">
        <button className="danger ghost" onClick={() => editor.run(() => api.deleteSet(editor.sagaId, set.id))}>Delete</button>
      </section>
    </div>
  )
}
