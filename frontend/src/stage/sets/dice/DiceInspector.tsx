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
          <span className="muted small">Where the dice wait; they're thrown from there. The buttons, the tray's list and the results are toolbars: place them under Controls.</span>
        </div>
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
