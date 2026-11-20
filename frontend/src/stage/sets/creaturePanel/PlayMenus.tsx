/** Play view popups: what the DM can do at the table without leaving the Stage. */
import { useEffect, useRef, useState } from 'react'
import { api } from '../../../api'
import Segmented from '../../../components/Segmented'
import type { SetMenuProps, StageEditor } from '../../types'
import { GAP } from './layout'
import type { Card, CreaturePanelContent, Order, PanelConfig, Shape } from './types'

const SHAPES: [Shape, string, string][] = [
  ['grid', '▦', 'Grid'],
  ['row', '▤', 'Row'],
  ['column', '▥', 'Column'],
  ['circle', '◌', 'Circle'],
  ['free', '✥', 'Free'],
]

function setPanel(editor: StageEditor, setId: number, changes: Partial<PanelConfig>) {
  return editor.run(() => api.updateSet(editor.sagaId, setId, { config: changes }))
}

export function CardMenu({ card, setId, content, editor, close, onOpenSheet }: {
  card: Card
  setId: number
  content: CreaturePanelContent
  editor: StageEditor
  close: () => void
  onOpenSheet?: () => void
}) {
  const highlighted = content.highlight_actor_id === card.id
  const spotlit = highlighted && content.spotlight
  const act = (action: () => Promise<unknown>) => {
    void editor.run(action)
    close()
  }
  return (
    <div className="menu">
      <div className="menu-title">
        {card.real_name}
        {card.player_name !== card.real_name && <span className="muted small"> · players see {card.player_name ?? '???'}</span>}
      </div>
      <button className={`menu-item ${highlighted ? 'on' : ''}`} onClick={() => act(() => api.updateSet(editor.sagaId, setId, { config: { highlight_actor_id: highlighted ? null : card.id, ...(highlighted ? { spotlight: false } : {}) } }))}>
        <span className="menu-icon">★</span>{highlighted ? 'Remove highlight' : 'Highlight'}
      </button>
      <button className={`menu-item ${spotlit ? 'on' : ''}`} onClick={() => act(() => api.updateSet(editor.sagaId, setId, { config: spotlit ? { spotlight: false } : { highlight_actor_id: card.id, spotlight: true } }))}>
        <span className="menu-icon">◐</span>{spotlit ? 'Stop spotlight' : 'Spotlight (dim the others)'}
      </button>
      <button
        className="menu-item"
        disabled={!editor.stage.is_live || card.hidden}
        title={!editor.stage.is_live ? 'Make this Stage live first' : card.hidden ? 'Reveal the card first' : undefined}
        onClick={() => act(() => api.grabAttention(editor.sagaId, setId, card.id))}
      >
        <span className="menu-icon">◎</span>Grab attention
      </button>
      <button className="menu-item" onClick={() => act(() => api.updateActor(editor.sagaId, card.id, { revealed: card.hidden }))}>
        <span className="menu-icon">{card.hidden ? '👁' : '⦸'}</span>{card.hidden ? 'Reveal to players' : 'Hide from players'}
      </button>
      {onOpenSheet && (
        <button className="menu-item" onClick={() => { onOpenSheet(); close() }}>
          <span className="menu-icon">❏</span>Open sheet
        </button>
      )}
      {editor.openSettings && (
        <button className="menu-item subtle" onClick={() => { editor.openSettings!(setId, card.id); close() }}>
          <span className="menu-icon">⚙</span>Card settings…
        </button>
      )}
    </div>
  )
}

/**
 * Space between cards. Dragging the slider moves the cards on the DM's screen right away (a local preview);
 * the setting is saved, and sent to the players, when the slider is released.
 */
function SpacingSlider({ set, editor }: Pick<SetMenuProps, 'set' | 'editor'>) {
  const content = set.content as CreaturePanelContent
  const saved = content.spacing ?? GAP
  const [value, setValue] = useState(saved)
  // The saved value when the drag started (the preview changes `saved` locally)
  const start = useRef<number | null>(null)
  useEffect(() => setValue(saved), [saved])

  const preview = (spacing: number) => {
    if (start.current === null) start.current = saved
    setValue(spacing)
    editor.apply({
      ...editor.stage,
      sets: editor.stage.sets.map((s) => (s.id === set.id ? { ...s, content: { ...(s.content as CreaturePanelContent), spacing } } : s)),
    })
  }
  const commit = () => {
    const before = start.current
    start.current = null
    if (before !== null && value !== before) void setPanel(editor, set.id, { spacing: value })
  }

  return (
    <div className="menu-field">
      <span className="field-label">Spacing <span className="muted">{value}px</span></span>
      <input
        type="range"
        min={0}
        max={200}
        step={2}
        value={value}
        aria-label="Spacing between cards"
        onChange={(e) => preview(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  )
}

/** Popup when the DM clicks the panel's title in the Play view: how the cards are arranged. */
export function PanelPlayMenu({ set, editor, close }: SetMenuProps) {
  const content = set.content as CreaturePanelContent
  const hiddenCount = content.cards.filter((c) => c.hidden).length
  return (
    <div className="menu wide">
      <div className="menu-title">{set.name}</div>
      <div className="menu-field">
        <span className="field-label">Arrange</span>
        <div className="shape-picker">
          {SHAPES.map(([key, icon, label]) => (
            <button key={key} className={content.shape === key ? 'on' : ''} onClick={() => setPanel(editor, set.id, { shape: key })}>
              <span className="shape-icon">{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>
      {content.shape !== 'free' && <SpacingSlider set={set} editor={editor} />}
      {content.shape !== 'free' && (
        <div className="menu-field">
          <span className="field-label">Order</span>
          <Segmented<Order>
            value={content.order}
            options={[['manual', 'My order (drag cards)'], ['initiative', 'By initiative']]}
            onChange={(order) => setPanel(editor, set.id, { order })}
          />
        </div>
      )}
      <div className="menu-row">
        <button disabled={!hiddenCount} onClick={() => editor.run(() => api.revealAll(editor.sagaId, set.id, true))}>
          Reveal all{hiddenCount ? ` (${hiddenCount})` : ''}
        </button>
        <button disabled={hiddenCount === content.cards.length} onClick={() => editor.run(() => api.revealAll(editor.sagaId, set.id, false))}>Hide all</button>
        {content.highlight_actor_id !== null && (
          <button onClick={() => setPanel(editor, set.id, { highlight_actor_id: null, spotlight: false })}>Clear highlight</button>
        )}
      </div>
      <div className="menu-row">
        <button
          disabled={!editor.stage.is_live}
          title={editor.stage.is_live ? undefined : 'Make this Stage live first'}
          onClick={() => { void editor.run(() => api.grabAttention(editor.sagaId, set.id, null)); close() }}
        >
          ◎ Grab attention
        </button>
        {editor.openSettings && (
          <button className="ghost" onClick={() => { editor.openSettings!(set.id, null); close() }}>⚙ Panel settings…</button>
        )}
      </div>
    </div>
  )
}
