/**
 * Build side panel, common to every Set type: the Stage's Sets from the top layer down (click to pick one; ↑ ↓
 * change what's on top), and for the picked Set its placement in the interface layout (anchor, size, offset) and
 * where its controls sit (its toolbars). See docs/concepts/stages.md ("Layouts", "Layers", "Set controls").
 */
import { useState } from 'react'
import { api } from '../api'
import type { ScreenAnchor, SetScreen, StageSetView, StageView, ToolbarPlace, ToolbarSize } from '../api/types'
import Segmented from '../components/Segmented'
import { EyeIcon } from './StageCanvas'
import { SET_TYPE_UIS } from './sets/registry'
import { ANCHORS, DEFAULT_SCREEN } from './layout'
import { FRACTIONS, placeOf, TOOLBAR_ANCHORS, toolbarsOf, verticalFor } from './toolbarPlaces'
import type { StageEditor, ToolbarDef } from './types'

/** Pure: the Sets' order (bottom to top) after moving one up (+1) or down (-1). */
export function moveLayer(sets: StageSetView[], setId: number, delta: number): number[] {
  const order = [...sets].sort((a, b) => a.layer - b.layer || a.id - b.id).map((s) => s.id)
  const i = order.indexOf(setId)
  const j = Math.max(0, Math.min(order.length - 1, i + delta))
  order.splice(j, 0, ...order.splice(i, 1))
  return order
}

export function SetList({ stage, editor, selectedId, onSelect }: { stage: StageView; editor: StageEditor; selectedId: number | null; onSelect: (id: number | null) => void }) {
  const top = [...stage.sets].sort((a, b) => b.layer - a.layer || b.id - a.id)
  if (!top.length) return null
  const move = (id: number, delta: number) => void editor.run(() => api.orderLayers(editor.sagaId, stage.id, moveLayer(stage.sets, id, delta)))
  return (
    <section className="inspector-section set-list-section">
      <div className="inspector-kind">Sets · top layer first</div>
      <div className="set-list">
        {top.map((s, i) => (
          <div key={s.id} className={`set-list-row ${s.id === selectedId ? 'on' : ''}`}>
            <button className={`small ghost toolbar-eye ${s.off ? 'off' : ''}`} aria-pressed={!s.off}
              aria-label={s.off ? `Show ${s.name}` : `Hide ${s.name}`} title={s.off ? 'Put away: show it again (for everyone)' : 'Hide it for now (for everyone, you too)'}
              onClick={() => void editor.run(() => api.updateSet(editor.sagaId, s.id, { off: !s.off }))}><EyeIcon open={!s.off} /></button>
            <button className="set-list-name" onClick={() => onSelect(s.id === selectedId ? null : s.id)}>
              <span>{s.name}</span>
              <span className="muted small">{SET_TYPE_UIS[s.type]?.name ?? s.type}{s.off ? ' · put away' : s.hidden ? ' · hidden' : ''}</span>
            </button>
            <button className="small ghost" disabled={i === 0} onClick={() => move(s.id, 1)} aria-label={`Bring ${s.name} up`} title="Up a layer">↑</button>
            <button className="small ghost" disabled={i === top.length - 1} onClick={() => move(s.id, -1)} aria-label={`Send ${s.name} down`} title="Down a layer">↓</button>
          </div>
        ))}
      </div>
    </section>
  )
}

const ANCHOR_GLYPHS: Record<ScreenAnchor, string> = {
  'top-left': '◤', top: '▲', 'top-right': '◥', left: '◀', center: '●', right: '▶', 'bottom-left': '◣', bottom: '▼', 'bottom-right': '◢',
}

/** Where the picked Set sits on the screen (interface layout). */
export function ScreenPlacement({ set, editor }: { set: StageSetView; editor: StageEditor }) {
  const screen: SetScreen = { ...DEFAULT_SCREEN, ...set.screen }
  const save = (changes: Partial<SetScreen>) => void editor.run(() => api.updateSet(editor.sagaId, set.id, { screen: changes }))
  const slider = (key: 'width' | 'height' | 'x' | 'y', label: string, min: number, max: number) => (
    <label className="inline-slider" key={key}>{label}
      <input type="range" min={min} max={max} step={1} defaultValue={screen[key]} key={`${set.id}-${key}-${screen[key]}`}
        onPointerUp={(e) => Number(e.currentTarget.value) !== screen[key] && save({ [key]: Number(e.currentTarget.value) })}
        onKeyUp={(e) => Number(e.currentTarget.value) !== screen[key] && save({ [key]: Number(e.currentTarget.value) })} aria-label={label} />
      <span className="muted small">{Math.round(screen[key])}%</span>
    </label>
  )
  return (
    <section className="inspector-section">
      <div className="inspector-kind">On the screen</div>
      <div className="placement">
        <div className="anchor-grid" role="radiogroup" aria-label="Anchor">
          {ANCHORS.map((a) => (
            <button key={a} role="radio" aria-checked={screen.anchor === a} aria-label={a} title={a}
              className={`anchor-cell ${screen.anchor === a ? 'on' : ''}`} onClick={() => save({ anchor: a, x: 0, y: 0 })}>{ANCHOR_GLYPHS[a]}</button>
          ))}
        </div>
        <div className="placement-presets">
          <button className="small" onClick={() => save({ anchor: 'center', width: 100, height: 100, x: 0, y: 0 })}>Full screen</button>
          <button className="small" onClick={() => save({ anchor: 'left', width: 50, height: 100, x: 0, y: 0 })}>Left half</button>
          <button className="small" onClick={() => save({ anchor: 'right', width: 50, height: 100, x: 0, y: 0 })}>Right half</button>
          <button className="small" onClick={() => save({ anchor: 'bottom', width: 100, height: 30, x: 0, y: 0 })}>Bottom strip</button>
        </div>
      </div>
      {slider('width', 'Width', 5, 100)}
      {slider('height', 'Height', 5, 100)}
      {slider('x', '↔ Offset', -50, 50)}
      {slider('y', '↕ Offset', -50, 50)}
      <span className="muted small">Sizes are shares of each viewer's screen. Drag the title to nudge it, the corner to resize.</span>
    </section>
  )
}

/** A distance slider: moves the toolbar on the Stage while dragging, saved when released. */
function DistanceSlider({ label, value, min, onPreview, onCommit }: {
  label: string
  value: number
  min: number
  onPreview: (v: number) => void
  onCommit: (v: number) => void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? value
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft)
    setDraft(null)
  }
  return (
    <label className="inline-slider">{label}
      <input type="range" min={min} max={400} step={2} value={shown} aria-label={label}
        onChange={(e) => { setDraft(Number(e.target.value)); onPreview(Number(e.target.value)) }}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      <span className="muted small">{shown}px</span>
    </label>
  )
}

function ToolbarPlaceEditor({ set, def, canvas, editor }: { set: StageSetView; def: ToolbarDef; canvas: boolean; editor: StageEditor }) {
  const place = placeOf(def, set)
  const save = (change: Partial<ToolbarPlace> | null) =>
    void editor.run(() => api.updateSet(editor.sagaId, set.id, { toolbars: { [def.key]: change } }))
  // While a slider moves: the Stage shows the new place right away
  const preview = (change: Partial<ToolbarPlace>) => editor.apply({
    ...editor.stage,
    sets: editor.stage.sets.map((s) => (s.id === set.id ? { ...s, toolbars: { ...s.toolbars, [def.key]: { ...s.toolbars?.[def.key], ...change } } } : s)),
  })
  const [fx, fy] = FRACTIONS[place.anchor]
  const outside = canvas && place.outside
  return (
    <details className="toolbar-place">
      <summary>
        <span className="toolbar-place-name">{def.name}</span>
        <span className="muted small">{place.hidden ? 'hidden' : `${ANCHOR_GLYPHS[place.anchor]} ${place.anchor}${outside ? ', outside' : ''}`}</span>
      </summary>
      {def.hint && <p className="muted small">Holds {def.hint}.</p>}
      <div className="placement">
        <div className="anchor-grid" role="radiogroup" aria-label={`${def.name}: anchor`}>
          {TOOLBAR_ANCHORS.map((a, i) => a === null ? <span key={i} /> : (
            <button key={a} role="radio" aria-checked={place.anchor === a} aria-label={a} title={a}
              className={`anchor-cell ${place.anchor === a ? 'on' : ''}`}
              onClick={() => save({ anchor: a, vertical: verticalFor(a), x: 0, y: 0 })}>{ANCHOR_GLYPHS[a]}</button>
          ))}
        </div>
        <div className="toolbar-place-options">
          {canvas && (
            <Segmented<'in' | 'out'> value={place.outside ? 'out' : 'in'} options={[['in', 'Inside the Set'], ['out', 'Outside']]}
              onChange={(v) => save({ outside: v === 'out', x: 0, y: 0 })} />
          )}
          <Segmented<'h' | 'v'> value={place.vertical ? 'v' : 'h'} options={[['h', '↔ Across'], ['v', '↕ Down']]}
            onChange={(v) => save({ vertical: v === 'v' })} />
          <Segmented<ToolbarSize> value={place.size} options={[['small', 'S'], ['medium', 'M'], ['large', 'L']]}
            onChange={(size) => save({ size })} />
          <label className="check">
            <input type="checkbox" checked={!place.hidden} onChange={(e) => save({ hidden: !e.target.checked })} /> Shown
          </label>
        </div>
      </div>
      {/* On an edge's middle a distance shifts along the edge (either way); elsewhere it moves away from the edge */}
      <DistanceSlider label="↔ Distance" value={place.x} min={fx === 0.5 && !(outside && fy === 0.5) ? -400 : 0}
        onPreview={(x) => preview({ x })} onCommit={(x) => save({ x })} />
      <DistanceSlider label="↕ Distance" value={place.y} min={fy === 0.5 ? -400 : 0}
        onPreview={(y) => preview({ y })} onCommit={(y) => save({ y })} />
      {set.toolbars?.[def.key] && <button className="small ghost" onClick={() => save(null)}>Back to its default place</button>}
    </details>
  )
}

/**
 * Where the picked Set's controls sit: each toolbar's anchor, direction, size, distance, shown or not; on a canvas
 * Stage inside the Set or around it, on an interface Stage on the screen's edges.
 */
export function SetToolbars({ set, editor, layout }: { set: StageSetView; editor: StageEditor; layout: string | undefined }) {
  const canvas = layout !== 'interface'
  return (
    <section className="inspector-section">
      <div className="inspector-kind">Controls · placed on {canvas ? 'the Set' : 'the screen'}</div>
      {toolbarsOf(SET_TYPE_UIS[set.type]).map((def) => (
        <ToolbarPlaceEditor key={def.key} set={set} def={def} canvas={canvas} editor={editor} />
      ))}
      <span className="muted small">{canvas
        ? 'Toolbars at the same spot line up instead of overlapping. Outside: above or below the Set, or beside it.'
        : 'Every Set\'s toolbars share the screen\'s edges: at the same spot they line up instead of overlapping.'}</span>
    </section>
  )
}
