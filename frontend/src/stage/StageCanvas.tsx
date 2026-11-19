import { motion } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { api } from '../api'
import type { StageSetView, StageView } from '../api/types'
import Popover, { anchorOf, type Anchor } from '../components/Popover'
import { CanvasContext } from './CanvasContext'
import { TITLE_H } from './constants'
import { SET_TYPE_UIS } from './sets/registry'
import type { StageEditor, StageMode } from './types'

export { TITLE_H }
const MIN_SCALE = 0.15
const MAX_SCALE = 2.5

export interface Selection {
  setId: number
  actorId: number | null
}

interface Props {
  stage: StageView
  /** view: players; play: the DM using the Stage (popups); build: the DM building it (select, move, resize). */
  mode?: StageMode
  editor?: StageEditor
  selection?: Selection | null
  onSelect?: (selection: Selection | null) => void
  attention?: { stage_id: number; set_id: number; actor_id: number | null; nonce: number } | null
}

interface View {
  x: number
  y: number
  scale: number
}
interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

function boundsOf(sets: StageSetView[]): Rect | null {
  if (!sets.length) return null
  const x = Math.min(...sets.map((s) => s.x))
  const y = Math.min(...sets.map((s) => s.y))
  return { x, y, w: Math.max(...sets.map((s) => s.x + s.width)) - x, h: Math.max(...sets.map((s) => s.y + s.height)) - y }
}

export default function StageCanvas({ stage, mode = 'view', editor, selection = null, onSelect, attention }: Props) {
  const building = mode === 'build' && Boolean(editor)
  const [setMenu, setSetMenu] = useState<{ setId: number; anchor: Anchor } | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [animating, setAnimating] = useState(false)
  const [pulse, setPulse] = useState<{ setId: number; actorId: number | null; nonce: number } | null>(null)
  const [drafts, setDrafts] = useState<Record<number, Partial<StageSetView>>>({})
  const sets = stage.sets.map((s) => ({ ...s, ...drafts[s.id] }))

  useEffect(() => setDrafts({}), [stage])

  /** Glide (or jump) the camera so a rect fills the view. */
  const focus = useCallback((rect: Rect, maxScale: number, animate: boolean) => {
    const el = container.current
    if (!el) return
    const pad = 40
    const cw = el.clientWidth
    const ch = el.clientHeight
    const scale = clamp(Math.min((cw - pad * 2) / rect.w, (ch - pad * 2) / rect.h, maxScale), MIN_SCALE, MAX_SCALE)
    setAnimating(animate)
    setView({ scale, x: cw / 2 - (rect.x + rect.w / 2) * scale, y: ch / 2 - (rect.y + rect.h / 2) * scale })
    if (animate) window.setTimeout(() => setAnimating(false), 850)
  }, [])

  const fit = useCallback(
    (animate: boolean) => {
      const bounds = boundsOf(stage.sets)
      if (bounds) focus(bounds, 1.1, animate)
    },
    [stage.sets, focus],
  )

  // Fit when another Stage is shown
  useLayoutEffect(() => {
    fit(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.id])

  // Grab attention: glide to the target and make it pulse
  const lastNonce = useRef(0)
  useEffect(() => {
    if (!attention || attention.nonce === lastNonce.current || attention.stage_id !== stage.id) return
    lastNonce.current = attention.nonce
    const target = stage.sets.find((s) => s.id === attention.set_id)
    if (!target) return
    let rect: Rect = { x: target.x, y: target.y, w: target.width, h: target.height }
    let maxScale = 1.2
    if (attention.actor_id !== null) {
      const inner = SET_TYPE_UIS[target.type]?.actorRect?.(target, attention.actor_id)
      if (inner) {
        rect = { x: target.x + inner.x - 60, y: target.y + TITLE_H + inner.y - 40, w: inner.w + 120, h: inner.h + 80 }
        maxScale = 1.6
      }
    }
    focus(rect, maxScale, true)
    setPulse({ setId: target.id, actorId: attention.actor_id, nonce: attention.nonce })
  }, [attention, stage, focus])

  // Wheel zoom around the cursor (native listener: React's is passive)
  useEffect(() => {
    const el = container.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const v = viewRef.current
      const scale = clamp(v.scale * Math.exp(-e.deltaY * 0.0015), MIN_SCALE, MAX_SCALE)
      setAnimating(false)
      setView({ scale, x: px - ((px - v.x) * scale) / v.scale, y: py - ((py - v.y) * scale) / v.scale })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Pan with one pointer, pinch-zoom with two
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ moved: boolean; startView: View; startDist?: number; startMid?: { x: number; y: number } } | null>(null)

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-interactive]')) return
    container.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    const g = { moved: gesture.current?.moved || false, startView: viewRef.current } as NonNullable<typeof gesture.current>
    if (pts.length === 2) {
      g.startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      g.startMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
    } else {
      g.startMid = { x: e.clientX, y: e.clientY }
    }
    gesture.current = g
    setAnimating(false)
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    const pts = [...pointers.current.values()]
    const rect = container.current!.getBoundingClientRect()
    if (pts.length >= 2 && g.startDist) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const mid = { x: (pts[0].x + pts[1].x) / 2 - rect.left, y: (pts[0].y + pts[1].y) / 2 - rect.top }
      const start = { x: g.startMid!.x - rect.left, y: g.startMid!.y - rect.top }
      const scale = clamp(g.startView.scale * (dist / g.startDist), MIN_SCALE, MAX_SCALE)
      const wx = (start.x - g.startView.x) / g.startView.scale
      const wy = (start.y - g.startView.y) / g.startView.scale
      setView({ scale, x: mid.x - wx * scale, y: mid.y - wy * scale })
      g.moved = true
    } else if (pts.length === 1) {
      const dx = e.clientX - g.startMid!.x
      const dy = e.clientY - g.startMid!.y
      if (Math.hypot(dx, dy) > 4) g.moved = true
      setView({ ...g.startView, x: g.startView.x + dx, y: g.startView.y + dy })
    }
  }

  const onPointerUp = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (pointers.current.size === 0) {
      gesture.current = null
      if (g && !g.moved && onSelect && building) {
        const setEl = (e.target as HTMLElement).closest('[data-set-id]') as HTMLElement | null
        onSelect(setEl ? { setId: Number(setEl.dataset.setId), actorId: null } : null)
      }
    } else if (g) {
      // One finger left after a pinch: continue panning from here
      const [p] = [...pointers.current.values()]
      gesture.current = { moved: true, startView: viewRef.current, startMid: p }
    }
  }

  const zoomBy = (factor: number) => {
    const el = container.current!
    const cx = el.clientWidth / 2
    const cy = el.clientHeight / 2
    const v = viewRef.current
    const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
    setAnimating(true)
    setView({ scale, x: cx - ((cx - v.x) * scale) / v.scale, y: cy - ((cy - v.y) * scale) / v.scale })
    window.setTimeout(() => setAnimating(false), 300)
  }

  // -- DM: move and resize Sets ------------------------------------------------
  const setDrag = useRef<{ id: number; kind: 'move' | 'resize'; sx: number; sy: number; base: StageSetView } | null>(null)

  const startSetDrag = (e: PointerEvent, set: StageSetView, kind: 'move' | 'resize') => {
    if (!editor || !building) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag.current = { id: set.id, kind, sx: e.clientX, sy: e.clientY, base: set }
    onSelect?.({ setId: set.id, actorId: null })
  }
  const moveSetDrag = (e: PointerEvent) => {
    const d = setDrag.current
    if (!d) return
    const dx = (e.clientX - d.sx) / viewRef.current.scale
    const dy = (e.clientY - d.sy) / viewRef.current.scale
    const draft =
      d.kind === 'move'
        ? { x: Math.round(d.base.x + dx), y: Math.round(d.base.y + dy) }
        : { width: Math.max(240, Math.round(d.base.width + dx)), height: Math.max(160, Math.round(d.base.height + dy)) }
    setDrafts((prev) => ({ ...prev, [d.id]: draft }))
  }
  const endSetDrag = () => {
    const d = setDrag.current
    setDrag.current = null
    if (!d || !editor) return
    const draft = drafts[d.id]
    if (draft) void editor.run(() => api.updateSet(editor.sagaId, d.id, draft))
  }

  return (
    <CanvasContext.Provider value={{ scale: view.scale }}>
      <div
        ref={container}
        className={`stage-canvas mode-${mode}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="stage-world"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: animating ? 'transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
          }}
        >
          {sets.map((set) => {
            const ui = SET_TYPE_UIS[set.type]
            const selected = building && selection?.setId === set.id
            return (
              <div
                key={set.id}
                data-set-id={set.id}
                className={`stage-set ${selected ? 'selected' : ''} ${set.hidden ? 'ghost' : ''} ${set.transparent ? 'transparent' : ''}`}
                style={{ left: set.x, top: set.y, width: set.width, height: set.height, zIndex: set.layer }}
              >
                <div
                  className={`set-title ${mode === 'play' && ui?.PlayMenu ? 'menu-title-button' : ''}`}
                  data-interactive={editor && mode !== 'view' ? true : undefined}
                  onPointerDown={(e) => startSetDrag(e, set, 'move')}
                  onPointerMove={moveSetDrag}
                  onPointerUp={endSetDrag}
                  onClick={(e) => {
                    if (mode === 'play' && editor && ui?.PlayMenu) setSetMenu({ setId: set.id, anchor: anchorOf(e.currentTarget) })
                  }}
                >
                  <span>{set.name}</span>
                  {mode === 'play' && ui?.PlayMenu && <span className="set-title-menu">⋯</span>}
                  {set.hidden && <span className="hidden-badge inline">Hidden</span>}
                </div>
                <div className="set-body" style={{ height: set.height - TITLE_H }}>
                  {ui ? (
                    <ui.View
                      set={set}
                      mode={editor ? mode : 'view'}
                      editor={editor}
                      selectedActorId={selected ? selection!.actorId : null}
                      onSelectActor={(actorId) => onSelect?.({ setId: set.id, actorId })}
                      attention={pulse && pulse.setId === set.id ? { actorId: pulse.actorId, nonce: pulse.nonce } : null}
                    />
                  ) : (
                    <div className="panel-empty">Unknown Set type: {set.type}</div>
                  )}
                </div>
                {pulse && pulse.setId === set.id && pulse.actorId === null && (
                  <motion.div key={pulse.nonce} className="attention-ring set-ring" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 1.4, repeat: 2 }} />
                )}
                {building && (
                  <div
                    className="resize-handle"
                    data-interactive
                    onPointerDown={(e) => startSetDrag(e, set, 'resize')}
                    onPointerMove={moveSetDrag}
                    onPointerUp={endSetDrag}
                  />
                )}
              </div>
            )
          })}
        </div>
        {stage.sets.length === 0 && (
          <div className="canvas-empty">{building ? 'Empty stage. Add a Creature panel from the side panel.' : 'Nothing on stage yet.'}</div>
        )}
        {setMenu && editor && (() => {
          const target = stage.sets.find((st) => st.id === setMenu.setId)
          const Menu = target ? SET_TYPE_UIS[target.type]?.PlayMenu : undefined
          return target && Menu ? (
            <Popover anchor={setMenu.anchor} onClose={() => setSetMenu(null)}>
              <Menu set={target} editor={editor} close={() => setSetMenu(null)} />
            </Popover>
          ) : null
        })()}
        <div className="canvas-controls" data-interactive>
          <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
          <button onClick={() => fit(true)}>Recenter</button>
          <button onClick={() => zoomBy(1.25)} aria-label="Zoom in">＋</button>
        </div>
      </div>
    </CanvasContext.Provider>
  )
}
