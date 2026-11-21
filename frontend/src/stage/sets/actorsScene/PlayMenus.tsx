/** Play view popups: what the DM can do at the table without leaving the Stage. */
import { useEffect, useRef, useState } from 'react'
import { api } from '../../../api'
import type { StageSetView } from '../../../api/types'
import Segmented from '../../../components/Segmented'
import type { SetMenuProps, StageEditor } from '../../types'
import { sceneCommands, type SceneCommands } from './commands'
import { GAP } from './layout'
import { openAddCreatures } from './viewedTab'
import { FLOW_SHAPES, tabView, type ActorsSceneContent, type Flow, type SceneTab, type Shape, type TabCard } from './types'

export const SHAPES: [Shape, string, string][] = [
  ['grid', '▦', 'Grid'],
  ['row', '▤', 'Row'],
  ['column', '▥', 'Column'],
  ['circle', '◌', 'Circle'],
  ['bar', '▭', 'Turn bar'],
  ['boundary', '◫', 'Boundary'],
  ['free', '✥', 'Free'],
]

export function CardMenu({ card, set, tab, content, editor, commands, close, onOpenSheet }: {
  card: TabCard
  set: StageSetView
  tab: SceneTab
  content: ActorsSceneContent
  editor: StageEditor
  commands: SceneCommands
  close: () => void
  onOpenSheet?: () => void
}) {
  const highlighted = tab.highlight_actor_id === card.id
  const spotlit = highlighted && tab.spotlight
  const act = (action: () => Promise<unknown>) => {
    void action()
    close()
  }
  const playersSee = tab.id === content.active_tab
  return (
    <div className="menu">
      <div className="menu-title">
        {card.real_name}
        {card.player_name !== card.real_name && <span className="muted small"> · players see {card.player_name ?? '???'}</span>}
      </div>
      <button className={`menu-item ${highlighted ? 'on' : ''}`} onClick={() => act(() => commands.highlight(tab.id, highlighted ? null : card.id))}>
        <span className="menu-icon">★</span>{highlighted ? 'Remove highlight' : 'Highlight'}
      </button>
      <button className={`menu-item ${spotlit ? 'on' : ''}`} onClick={() => act(() => commands.highlight(tab.id, card.id, !spotlit))}>
        <span className="menu-icon">◐</span>{spotlit ? 'Stop spotlight' : 'Spotlight (dim the others)'}
      </button>
      <button
        className="menu-item"
        disabled={!editor.stage.is_live || card.hidden || !playersSee}
        title={!editor.stage.is_live ? 'Make this Stage live first' : card.hidden ? 'Reveal the card first' : undefined}
        onClick={() => act(() => editor.run(() => api.grabAttention(editor.sagaId, set.id, card.id)))}
      >
        <span className="menu-icon">◎</span>Grab attention
      </button>
      <button className="menu-item" onClick={() => act(() => commands.showCard(tab.id, card.id, Boolean(card.hidden)))}>
        <span className="menu-icon">{card.hidden ? '👁' : '⦸'}</span>{card.hidden ? 'Reveal to players' : 'Hide from players'}
      </button>
      {onOpenSheet && (
        <button className="menu-item" onClick={() => { onOpenSheet(); close() }}>
          <span className="menu-icon">❏</span>Open sheet
        </button>
      )}
      <TabsOfCard card={card} content={content} commands={commands} />
      <button className="menu-item subtle" onClick={() => {
        if (window.confirm(`Remove ${card.real_name ?? 'this card'} from the scene (every tab)?`)) act(() => editor.run(() => api.deleteActor(editor.sagaId, card.id)))
      }}>
        <span className="menu-icon">✕</span>Remove from the scene
      </button>
      {editor.openSettings && (
        <button className="menu-item subtle" onClick={() => { editor.openSettings!(set.id, card.id); close() }}>
          <span className="menu-icon">⚙</span>Card settings…
        </button>
      )}
    </div>
  )
}

/** Every tab has the scene's creatures: which tabs show this card to players, one click each. */
export function TabsOfCard({ card, content, commands }: { card: TabCard; content: ActorsSceneContent; commands: SceneCommands }) {
  return (
    <div className="menu-field">
      <span className="field-label">Shown in</span>
      <div className="chips">
        {content.tabs?.map((t) => {
          const on = Boolean(card.tabs?.[String(t.id)]?.shown)
          return (
            <button key={t.id} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => void commands.showCard(t.id, card.id, !on)}>
              {t.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type SliderField = 'spacing' | 'spacing_y' | 'top' | 'neutral' | 'scatter'

/**
 * A layout slider (spacing, distance to top, neutral zone, scatter). Dragging it moves the cards on the DM's screen
 * right away (a local preview); the setting is saved, and sent to the players, when the slider is released.
 */
function LayoutSlider({ set, tab, editor, commands, field, label, max, unit = 'px', step = 2 }: {
  set: StageSetView
  tab: SceneTab
  editor: StageEditor
  commands: SceneCommands
  field: SliderField
  label: string
  max: number
  unit?: string
  step?: number
}) {
  const saved = Number(tab[field] ?? GAP)
  const [value, setValue] = useState(saved)
  const start = useRef<number | null>(null)
  useEffect(() => setValue(saved), [saved])

  const preview = (next: number) => {
    if (start.current === null) start.current = saved
    setValue(next)
    const changed = (t: SceneTab) => (t.id === tab.id ? { ...t, [field]: next } : t)
    editor.apply({
      ...editor.stage,
      sets: editor.stage.sets.map((s) => {
        if (s.id !== set.id) return s
        const c = s.content as ActorsSceneContent
        return { ...s, content: { ...c, tab: changed(c.tab), tabs: c.tabs?.map(changed) } }
      }),
    })
  }
  const commit = () => {
    const before = start.current
    start.current = null
    if (before !== null && value !== before) void commands.setTab(tab.id, { [field]: value })
  }

  return (
    <div className="menu-field">
      <span className="field-label">{label} <span className="muted">{value}{unit}</span></span>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => preview(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  )
}

/** A tab's layout settings: shared by the Play menu and the Build side panel. */
export function TabLayoutSettings({ set, content, tab, editor, commands }: {
  set: StageSetView
  content: ActorsSceneContent
  tab: SceneTab
  editor: StageEditor
  commands: SceneCommands
}) {
  const keys = content.sort_keys || []
  const slider = { set, tab, editor, commands }
  return (
    <>
      <div className="menu-field">
        <span className="field-label">Layout</span>
        <div className="shape-picker">
          {SHAPES.map(([key, icon, label]) => (
            <button key={key} className={tab.shape === key ? 'on' : ''} onClick={() => void commands.setTab(tab.id, { shape: key })}>
              <span className="shape-icon">{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>
      {FLOW_SHAPES.includes(tab.shape) && (
        <div className="menu-field">
          <span className="field-label">Initiative flow</span>
          <Segmented<Flow>
            value={tab.flow}
            options={[['static', 'Static'], ['rotate', 'Rotate (current first)']]}
            onChange={(flow) => void commands.setTab(tab.id, { flow })}
          />
        </div>
      )}
      <LayoutSlider {...slider} field="top" label="Distance to top" max={300} step={4} />
      {(tab.shape === 'grid' || tab.shape === 'bar') && (
        <>
          <LayoutSlider {...slider} field="spacing" label="Horizontal space" max={200} />
          <LayoutSlider {...slider} field="spacing_y" label={tab.shape === 'bar' ? 'Vertical space (bar to the drawn card)' : 'Vertical space'} max={200} />
        </>
      )}
      {tab.shape === 'row' && <LayoutSlider {...slider} field="spacing" label="Horizontal space" max={200} />}
      {(tab.shape === 'column' || tab.shape === 'circle' || tab.shape === 'boundary') && <LayoutSlider {...slider} field="spacing" label="Spacing" max={200} />}
      {tab.shape === 'boundary' && (
        <>
          <LayoutSlider {...slider} field="neutral" label="Neutral zone (empty middle)" max={80} unit="%" step={1} />
          <LayoutSlider {...slider} field="scatter" label="Scatter (random shift per card)" max={80} step={1} />
        </>
      )}
      {tab.shape !== 'free' && (
        <div className="menu-field">
          <span className="field-label">Order</span>
          <Segmented<string>
            value={tab.order_by}
            options={[['custom', 'My order'], ...keys.map(([k, name]) => [k, `By ${name}`] as [string, string])]}
            onChange={(by) => void commands.orderBy(tab.id, by)}
          />
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={Boolean(tab.turn_controls)} onChange={(e) => void commands.setTab(tab.id, { turn_controls: e.target.checked })} />
        Turn controls (start, next, previous)
      </label>
    </>
  )
}

/** Popup when the DM clicks the scene's title in the Play view: tabs, layout, order, turns, reveal. */
export function ScenePlayMenu({ set, editor, close }: SetMenuProps) {
  const content = set.content as ActorsSceneContent
  const commands = sceneCommands(editor, set.id)
  const { tab, cards } = tabView(content, null)
  const hiddenCount = cards.filter((c) => c.hidden).length
  return (
    <div className="menu wide">
      <div className="menu-title">{set.name} · {tab.name}</div>
      <div className="menu-field">
        <span className="field-label">Players see</span>
        <div className="chips">
          {content.tabs?.map((t) => (
            <button key={t.id} type="button" className={`chip ${t.id === content.active_tab ? 'on' : ''}`} onClick={() => void commands.switchTab(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
      </div>
      <TabLayoutSettings set={set} content={content} tab={tab} editor={editor} commands={commands} />
      <div className="menu-row">
        <button className="primary" onClick={() => { openAddCreatures(set.id); close() }}>＋ Add creatures</button>
        <button disabled={!hiddenCount} onClick={() => void commands.showAll(tab.id, true)}>
          Reveal all{hiddenCount ? ` (${hiddenCount})` : ''}
        </button>
        <button disabled={hiddenCount === cards.length} onClick={() => void commands.showAll(tab.id, false)}>Hide all</button>
        {tab.highlight_actor_id !== null && (
          <button onClick={() => void commands.highlight(tab.id, null)}>Clear highlight</button>
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
          <button className="ghost" onClick={() => { editor.openSettings!(set.id, null); close() }}>⚙ Scene settings…</button>
        )}
      </div>
    </div>
  )
}
