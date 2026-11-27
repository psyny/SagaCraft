/**
 * The Panels Set (plan 60): rectangles and lines that divide or frame the Stage, drawn in list order. Live they're only
 * shown (or put away with the Set bar's eye) and catch no clicks. In Build the DM draws them (the Set bar's tools: Select,
 * ＋ Rectangle: drag; ＋ Line: click points, double-click or Enter to end, Esc to drop), picks one (its look in the side
 * panel), moves it by dragging, resizes a rectangle by its corner, brings it forward or back, deletes it (or Delete).
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { api } from '../../../api'
import type { StageView } from '../../../api/types'
import { useCanvas } from '../../CanvasContext'
import { TITLE_H } from '../../constants'
import Toolbar from '../../Toolbar'
import type { SetViewProps } from '../../types'
import { lineBox, linePath, lineStroke, rectStyle } from './draw'
import { selectShape, setPanelTool, usePanelTool, useSelectedShape, type PanelTool } from './selection'
import type { PanelLine, PanelRect, PanelShape, PanelsContent } from './types'

type Point = [number, number]
type Drag = { kind: 'move' | 'resize'; id: number; from: Point; to: Point }

/** A shape as it is while being moved or resized. */
function moved(shape: PanelShape, drag: Drag | null): PanelShape {
  if (!drag || drag.id !== shape.id) return shape
  const [dx, dy] = [drag.to[0] - drag.from[0], drag.to[1] - drag.from[1]]
  if (shape.kind === 'line') return drag.kind === 'move' ? { ...shape, points: shape.points.map(([x, y]) => [x + dx, y + dy] as Point) } : shape
  return drag.kind === 'move' ? { ...shape, x: shape.x + dx, y: shape.y + dy } : { ...shape, w: Math.max(8, shape.w + dx), h: Math.max(8, shape.h + dy) }
}

export default function PanelsView({ set, mode, editor }: SetViewProps) {
  const content = (set.content ?? { shapes: [] }) as PanelsContent
  const { scale } = useCanvas()
  const building = mode === 'build' && Boolean(editor)
  const tool = usePanelTool(set.id)
  const selected = useSelectedShape(set.id)
  const box = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [rectDraft, setRectDraft] = useState<[Point, Point] | null>(null)
  const [lineDraft, setLineDraft] = useState<Point[] | null>(null)
  const [hover, setHover] = useState<Point | null>(null)
  const H = set.height - TITLE_H
  const at = (e: { clientX: number; clientY: number }): Point => {
    const r = box.current!.getBoundingClientRect()
    return [Math.round((e.clientX - r.left) / scale), Math.round((e.clientY - r.top) / scale)]
  }
  const save = (shape: Record<string, unknown>, pickNew = false) => editor && void editor.run(async () => {
    const stage = await api.setCommand(editor.sagaId, set.id, 'shape.save', { shape }) as StageView
    if (pickNew) {
      const shapes = (stage.sets.find((s) => s.id === set.id)?.content as PanelsContent | undefined)?.shapes ?? []
      if (shapes.length) selectShape(set.id, Math.max(...shapes.map((s) => s.id)))
    }
    return stage
  })
  const finishLine = (points: Point[]) => {
    setLineDraft(null)
    if (points.length >= 2) save({ kind: 'line', points }, true)
    setPanelTool(set.id, 'select')
  }
  // Keys while building: Esc drops a line being drawn (or the selection), Enter ends it, Delete removes the selection
  useEffect(() => {
    if (!building) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      if (e.key === 'Escape') { setLineDraft(null); setRectDraft(null); if (tool !== 'select') setPanelTool(set.id, 'select'); else selectShape(set.id, null) }
      if (e.key === 'Enter' && lineDraft) finishLine(lineDraft)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null && editor) {
        void editor.run(() => api.setCommand(editor.sagaId, set.id, 'shape.delete', { id: selected }))
        selectShape(set.id, null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building, tool, lineDraft, selected])

  const onDown = (e: ReactPointerEvent) => {
    if (!building || e.button !== 0) return
    e.stopPropagation()
    const p = at(e)
    if (tool === 'rect') { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setRectDraft([p, p]) }
    else if (tool === 'line') setLineDraft((d) => [...(d ?? []), p])
    else selectShape(set.id, null)
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!building) return
    const p = at(e)
    if (rectDraft) setRectDraft([rectDraft[0], p])
    else if (drag) setDrag({ ...drag, to: p })
    else if (lineDraft) setHover(p)
  }
  const onUp = () => {
    if (rectDraft) {
      const [[x0, y0], [x1, y1]] = rectDraft
      setRectDraft(null)
      if (Math.abs(x1 - x0) >= 6 && Math.abs(y1 - y0) >= 6) {
        save({ kind: 'rect', x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }, true)
      }
      setPanelTool(set.id, 'select')
    }
    if (drag) {
      const shape = content.shapes.find((s) => s.id === drag.id)
      setDrag(null)
      if (shape && (drag.to[0] !== drag.from[0] || drag.to[1] !== drag.from[1])) {
        const next = moved(shape, drag)
        save(next.kind === 'line' ? { id: next.id, points: next.points } : { id: next.id, x: next.x, y: next.y, w: next.w, h: next.h })
      }
    }
  }
  const grab = (shape: PanelShape, kind: Drag['kind']) => (e: ReactPointerEvent) => {
    if (!building || tool !== 'select' || e.button !== 0) return
    e.stopPropagation()
    box.current?.setPointerCapture(e.pointerId)
    selectShape(set.id, shape.id)
    const p = at(e)
    setDrag({ kind, id: shape.id, from: p, to: p })
  }

  const shapes = content.shapes.map((s) => moved(s, drag))
  const chosen = building ? shapes.find((s) => s.id === selected) : undefined
  const picking = building && tool === 'select'
  return (
    <div ref={box} className={`panels-set ${building ? `building tool-${tool}` : ''}`} style={{ width: set.width, height: H }}
      data-interactive={building ? true : undefined} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
      onDoubleClick={() => lineDraft && finishLine(lineDraft)}>
      {shapes.map((s) => s.kind === 'rect' ? (
        <div key={s.id} className="panel-rect" style={{ ...rectStyle(s), pointerEvents: picking ? 'auto' : 'none' }} onPointerDown={grab(s, 'move')} />
      ) : (
        <svg key={s.id} className="panel-line" width={set.width} height={H} style={{ pointerEvents: 'none' }}>
          <path d={linePath(s.points, s.radius)} {...lineStroke(s)} />
          {/* a wider, invisible stroke to pick it by */}
          {picking && <path d={linePath(s.points, s.radius)} stroke="transparent" strokeWidth={Math.max(12, s.width + 10)} fill="none" style={{ pointerEvents: 'stroke' }} onPointerDown={grab(s, 'move')} />}
        </svg>
      ))}
      {chosen && <Selection shape={chosen} onResize={chosen.kind === 'rect' ? grab(chosen, 'resize') : undefined} />}
      {rectDraft && <div className="panel-draft" style={{ left: Math.min(rectDraft[0][0], rectDraft[1][0]), top: Math.min(rectDraft[0][1], rectDraft[1][1]),
        width: Math.abs(rectDraft[1][0] - rectDraft[0][0]), height: Math.abs(rectDraft[1][1] - rectDraft[0][1]) }} />}
      {lineDraft && (
        <svg className="panel-line draft" width={set.width} height={H}>
          <polyline points={[...lineDraft, ...(hover ? [hover] : [])].map((p) => p.join(',')).join(' ')} />
          {lineDraft.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={4} />)}
        </svg>
      )}
      {building && (
        <Toolbar id="main">
          {([['select', 'Select'], ['rect', '＋ Rectangle'], ['line', '＋ Line']] as [PanelTool, string][]).map(([t, label]) => (
            <button key={t} type="button" className={`small ${tool === t ? 'primary' : ''}`} aria-pressed={tool === t}
              title={t === 'rect' ? 'Drag on the Set to draw a rectangle' : t === 'line' ? 'Click points; double-click or Enter to end, Esc to drop' : 'Pick a shape: drag to move it, its look in the side panel'}
              onClick={() => { setLineDraft(null); setPanelTool(set.id, t) }}>{label}</button>
          ))}
          {selected !== null && editor && (
            <>
              <button type="button" className="small" title="Bring it forward" onClick={() => void editor.run(() => api.setCommand(editor.sagaId, set.id, 'shape.order', { id: selected, by: 1 }))}>▲</button>
              <button type="button" className="small" title="Send it back" onClick={() => void editor.run(() => api.setCommand(editor.sagaId, set.id, 'shape.order', { id: selected, by: -1 }))}>▼</button>
              <button type="button" className="small danger" onClick={() => { void editor.run(() => api.setCommand(editor.sagaId, set.id, 'shape.delete', { id: selected })); selectShape(set.id, null) }}>Delete</button>
            </>
          )}
        </Toolbar>
      )}
    </div>
  )
}

/** The picked shape's outline (and a rectangle's corner to resize it by). */
function Selection({ shape, onResize }: { shape: PanelShape; onResize?: (e: ReactPointerEvent) => void }) {
  const [x, y, w, h] = shape.kind === 'rect' ? [shape.x, shape.y, shape.w, shape.h] : lineBox((shape as PanelLine).points)
  return (
    <div className="panel-selection" style={{ left: x - 4, top: y - 4, width: w + 8, height: h + 8 }}>
      {onResize && <span className="panel-resize" onPointerDown={onResize} title="Drag to resize" />}
    </div>
  )
}

export type { PanelRect }
