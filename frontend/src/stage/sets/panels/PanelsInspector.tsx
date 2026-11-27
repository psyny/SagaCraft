/**
 * Build: a Panels Set's side panel (plan 60): its name and who sees it; the shapes (pick one); the picked shape's look:
 * a rectangle's corners, fill (colour, flat or gradient, opacity, effect) and border; a line's colour, thickness, style,
 * rounded corners and opacity.
 */
import { useEffect, useState } from 'react'
import { api } from '../../../api'
import ColorPicker from '../../../components/ColorPicker'
import Segmented from '../../../components/Segmented'
import VisibilityPicker from '../../../components/VisibilityPicker'
import { useSaga } from '../../../saga/SagaContext'
import type { SetInspectorProps, StageEditor } from '../../types'
import { selectShape, setPanelTool, useSelectedShape } from './selection'
import type { FillEffect, FillStyle, LineStyle, PanelLine, PanelRect, PanelShape, PanelsContent } from './types'

const EFFECTS: [FillEffect, string][] = [['none', 'None'], ['blur', "Blur what's under it"], ['frost', 'Frosted glass'], ['glow', 'Glow'], ['inset', 'Inner shadow']]

/** A slider saved when it's let go. */
function Slider({ label, value, min, max, step = 1, unit = '', onSave }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onSave: (v: number) => void
}) {
  const [shown, setShown] = useState(value)
  useEffect(() => setShown(value), [value])
  const commit = () => { if (shown !== value) onSave(shown) }
  return (
    <label className="slider">
      <span className="slider-head">{label} <span className="muted">{shown}{unit}</span></span>
      <input type="range" min={min} max={max} step={step} value={shown} aria-label={label}
        onChange={(e) => setShown(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </label>
  )
}

function RectLook({ shape, save }: { shape: PanelRect; save: (changes: Record<string, unknown>) => void }) {
  const fill = (changes: Partial<PanelRect['fill']>) => save({ fill: changes })
  return (
    <>
      <Slider label="Rounded corners" value={shape.radius} min={0} max={200} unit=" px" onSave={(radius) => save({ radius })} />
      <div className="field">
        <span className="field-label">Fill</span>
        <Segmented<FillStyle> value={shape.fill.style} options={[['flat', 'Flat'], ['linear', 'Gradient'], ['radial', 'Radial']]} onChange={(style) => fill({ style })} />
        <ColorPicker label="Fill colour" value={shape.fill.color} onChange={(color) => fill({ color })} />
        {shape.fill.style !== 'flat' && <ColorPicker label="Second colour" value={shape.fill.color2} onChange={(color2) => fill({ color2 })} />}
        {shape.fill.style === 'linear' && <Slider label="Angle" value={shape.fill.angle} min={0} max={360} step={5} unit="°" onSave={(angle) => fill({ angle })} />}
        <Slider label="Opacity" value={shape.fill.opacity} min={0} max={1} step={0.05} onSave={(opacity) => fill({ opacity })} />
      </div>
      <div className="field">
        <span className="field-label">Effect</span>
        <select value={shape.fill.effect} aria-label="Fill effect" onChange={(e) => fill({ effect: e.target.value as FillEffect })}>
          {EFFECTS.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
        </select>
        {shape.fill.effect !== 'none' && <Slider label="Effect size" value={shape.fill.effect_size} min={0} max={40} unit=" px" onSave={(effect_size) => fill({ effect_size })} />}
      </div>
      <div className="field">
        <span className="field-label">Border</span>
        <Slider label="Thickness" value={shape.border.width} min={0} max={30} unit=" px" onSave={(width) => save({ border: { width } })} />
        {shape.border.width > 0 && <ColorPicker label="Border colour" value={shape.border.color} onChange={(color) => save({ border: { color } })} />}
      </div>
    </>
  )
}

function LineLook({ shape, save }: { shape: PanelLine; save: (changes: Record<string, unknown>) => void }) {
  return (
    <>
      <ColorPicker label="Line colour" value={shape.color} onChange={(color) => save({ color })} />
      <Slider label="Thickness" value={shape.width} min={1} max={30} unit=" px" onSave={(width) => save({ width })} />
      <div className="field">
        <span className="field-label">Style</span>
        <Segmented<LineStyle> value={shape.style} options={[['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]} onChange={(style) => save({ style })} />
      </div>
      <Slider label="Rounded corners" value={shape.radius} min={0} max={200} unit=" px" onSave={(radius) => save({ radius })} />
      <Slider label="Opacity" value={shape.opacity} min={0} max={1} step={0.05} onSave={(opacity) => save({ opacity })} />
    </>
  )
}

const shapeName = (s: PanelShape, i: number) => `${s.kind === 'rect' ? 'Rectangle' : 'Line'} ${i + 1}`

function Shapes({ set, editor }: { set: SetInspectorProps['set']; editor: StageEditor }) {
  const content = (set.content ?? { shapes: [] }) as PanelsContent
  const selected = useSelectedShape(set.id)
  const shape = content.shapes.find((s) => s.id === selected)
  const save = (changes: Record<string, unknown>) => shape && void editor.run(() => api.setCommand(editor.sagaId, set.id, 'shape.save', { shape: { id: shape.id, ...changes } }))
  return (
    <section className="inspector-section">
      <div className="field">
        <span className="field-label">Shapes</span>
        <div className="panel-shape-list">
          {content.shapes.map((s, i) => (
            <button key={s.id} type="button" className={`small ${s.id === selected ? 'primary' : ''}`} onClick={() => { setPanelTool(set.id, 'select'); selectShape(set.id, s.id) }}>
              {shapeName(s, i)}
            </button>
          ))}
        </div>
        {!content.shapes.length && <span className="muted small">Draw with the Set bar's ＋ Rectangle (drag) and ＋ Line (click points, double-click to end).</span>}
      </div>
      {shape && (
        <>
          <div className="inspector-kind">{shapeName(shape, content.shapes.indexOf(shape))}</div>
          {shape.kind === 'rect' ? <RectLook shape={shape} save={save} /> : <LineLook shape={shape} save={save} />}
          <button type="button" className="danger ghost small" onClick={() => { void editor.run(() => api.setCommand(editor.sagaId, set.id, 'shape.delete', { id: shape.id })); selectShape(set.id, null) }}>
            Delete this {shape.kind === 'rect' ? 'rectangle' : 'line'}
          </button>
        </>
      )}
    </section>
  )
}

export default function PanelsInspector({ set, editor }: SetInspectorProps) {
  const { saga } = useSaga()
  const [name, setName] = useState(set.name)
  useEffect(() => setName(set.name), [set.id, set.name])
  return (
    <div className="inspector">
      <section className="inspector-section">
        <div className="inspector-kind">Panels</div>
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
        <p className="muted small">Panels frame and divide the Stage. Live they're only shown or put away (the eye); they catch no clicks.</p>
      </section>
      <Shapes set={set} editor={editor} />
      <section className="inspector-section">
        <button className="danger ghost" onClick={() => editor.run(() => api.deleteSet(editor.sagaId, set.id))}>Delete the Set</button>
      </section>
    </div>
  )
}
