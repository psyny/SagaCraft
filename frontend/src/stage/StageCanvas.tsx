import { motion } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { api } from '../api'
import type { SetScreen, StageSetView, StageView, ToolbarPlace } from '../api/types'
import EyeIcon from '../components/EyeIcon'
import Modal from '../components/Modal'
import Popover, { anchorOf, type Anchor } from '../components/Popover'
import { CanvasContext } from './CanvasContext'
import { TITLE_H } from './constants'
import { dragScreen, screenRect } from './layout'
import { SET_TYPE_UIS } from './sets/registry'
import { useOptionalSaga } from '../saga/SagaContext'
import { ActionsIcon, EfxIcon, FoldIcon, GearIcon, SetIcon, StageEyeIcon } from './SetIcons'
import { ActionControl, EfxControl, PlayerActions, StageSwitcher } from './StageControls'
import { ToolbarTargets } from './Toolbar'
import { dockStyle, placeOf, stackKey, toolbarsOf } from './toolbarPlaces'
import type { SetTypeUI, StageEditor, StageMode, ToolbarDef } from './types'

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
  attention?: { stage_id: number; set_id: number; actor_id: number | null; target?: Record<string, unknown>; nonce: number } | null
  /** Room kept free at the right of the Set bar (px): the Stage tab's corner (✕, Full screen) sits there. */
  barInset?: number
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

interface DockItem {
  set: StageSetView
  def: ToolbarDef
  place: ToolbarPlace
  order: number
}

/** One toolbar's place in its stack: the Set view's content is portalled into its slot (stage/Toolbar.tsx). */
function Dock({ item, outside, building, onTarget }: {
  item: DockItem
  outside: boolean
  /** Build shows where an empty toolbar would be (e.g. the turn controls, filled in Play). */
  building: boolean
  onTarget: (key: string, el: HTMLElement | null) => void
}) {
  const key = `${item.set.id}:${item.def.key}`
  const ref = useCallback((el: HTMLDivElement | null) => onTarget(key, el), [key, onTarget])
  const { place } = item
  return (
    <div className={`set-toolbar tb-${item.def.key} size-${place.size} ${place.vertical ? 'vertical' : ''} ${place.hidden || item.set.off ? 'off' : ''}`}
      style={{ order: item.order, ...dockStyle(place, outside) }} data-interactive data-toolbar={key}
      title={place.hidden ? `${item.def.name}: hidden (only shown here, in Build)` : undefined}>
      {building && <span className="toolbar-placeholder">{item.def.name}</span>}
      <div className="toolbar-slot" ref={ref} />
    </div>
  )
}

/** A slot the Set bar's menu row holds for a Set's main toolbar (its view portals its main options into it). */
function MainSlot({ setId, onTarget, id = 'main', className = 'toolbar-slot' }: {
  setId: number; onTarget: (key: string, el: HTMLElement | null) => void; id?: 'main' | 'sub'; className?: string
}) {
  const key = `${setId}:${id}`
  const ref = useCallback((el: HTMLDivElement | null) => onTarget(key, el), [key, onTarget])
  return <div className={className} ref={ref} />
}

/** Toolbars grouped by anchor: each stack lines them up from its edge. */
function stacksOf(items: DockItem[], canvas: boolean) {
  const stacks = new Map<string, DockItem[]>()
  for (const item of items) {
    const key = stackKey(item.place, canvas)
    stacks.set(key, [...(stacks.get(key) ?? []), item])
  }
  return [...stacks.entries()]
}

function boundsOf(sets: StageSetView[]): Rect | null {
  if (!sets.length) return null
  const x = Math.min(...sets.map((s) => s.x))
  const y = Math.min(...sets.map((s) => s.y))
  return { x, y, w: Math.max(...sets.map((s) => s.x + s.width)) - x, h: Math.max(...sets.map((s) => s.y + s.height)) - y }
}

/** Clicks go through the Set (only its toolbars, and its title in Build, catch them): always, or as its type says now. */
const passesThrough = (ui: SetTypeUI | undefined, set: StageSetView) =>
  typeof ui?.passThrough === 'function' ? ui.passThrough(set) : Boolean(ui?.passThrough)

const FOLDED_KEY = 'sagacraft.foldedControls'

export default function StageCanvas({ stage, mode = 'view', editor, selection = null, onSelect, attention, barInset = 0 }: Props) {
  const building = mode === 'build' && Boolean(editor)
  // interface: Sets fixed to the screen (anchors, % sizes), no pan or zoom; canvas: a world to pan and zoom
  const fixed = stage.layout === 'interface'
  const [screen, setScreen] = useState({ w: 0, h: 0 })
  const [setMenu, setSetMenu] = useState<{ setId: number; anchor: Anchor } | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 })
  // While panning or zooming, the Stage is one GPU layer (smooth); once it stops, the browser redraws it at the new
  // scale so everything stays sharp (a kept layer would just be stretched)
  const [moving, setMoving] = useState(false)
  useEffect(() => {
    setMoving(true)
    const timer = window.setTimeout(() => setMoving(false), 220)
    return () => window.clearTimeout(timer)
  }, [view])
  const viewRef = useRef(view)
  viewRef.current = view
  const [animating, setAnimating] = useState(false)
  const [pulse, setPulse] = useState<{ setId: number; actorId: number | null; nonce: number; target?: Record<string, unknown> } | null>(null)
  const [drafts, setDrafts] = useState<Record<number, Partial<StageSetView>>>({})
  // Toolbar docks, by "setId:key" (the Set views portal their controls into them)
  const [targets, setTargets] = useState<Record<string, HTMLElement | null>>({})
  const onTarget = useCallback((key: string, el: HTMLElement | null) => {
    setTargets((prev) => (prev[key] === el ? prev : { ...prev, [key]: el }))
  }, [])
  const sets = stage.sets.map((s) => {
    const set = { ...s, ...drafts[s.id] }
    if (!fixed || !screen.w) return set
    // In the interface layout a Set's px size is its share of the screen (its view lays out for that)
    const rect = screenRect(set.screen, screen.w, screen.h)
    return { ...set, x: rect.x, y: rect.y, width: Math.max(120, rect.w), height: Math.max(TITLE_H + 40, rect.h) }
  })

  useEffect(() => setDrafts({}), [stage])
  useLayoutEffect(() => {
    const el = container.current
    if (!el) return
    const measure = () => setScreen({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(el)
    return () => observer?.disconnect()
  }, [])
  useEffect(() => { if (fixed) setView({ x: 0, y: 0, scale: 1 }) }, [fixed])

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
    if (!fixed) fit(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.id, fixed])

  // Grab attention: glide to the target and make it pulse
  const lastNonce = useRef(0)
  useEffect(() => {
    if (!attention || attention.nonce === lastNonce.current || attention.stage_id !== stage.id) return
    lastNonce.current = attention.nonce
    const target = stage.sets.find((s) => s.id === attention.set_id)
    if (!target) return
    if (fixed) { // nothing to glide to: everything is on screen; the Set (and the card) pulse
      setPulse({ setId: target.id, actorId: attention.actor_id, nonce: attention.nonce, target: attention.target })
      return
    }
    let rect: Rect = { x: target.x, y: target.y, w: target.width, h: target.height }
    let maxScale = 1.2
    if (attention.actor_id !== null || attention.target) {
      const ui = SET_TYPE_UIS[target.type]
      const inner = attention.target ? ui?.targetRect?.(target, attention.target) : ui?.actorRect?.(target, attention.actor_id!)
      if (inner) {
        rect = { x: target.x + inner.x - 60, y: target.y + TITLE_H + inner.y - 40, w: inner.w + 120, h: inner.h + 80 }
        // A card: a bit closer; a Set's own target (map tiles): close enough to fill the view
        maxScale = attention.target ? MAX_SCALE : 1.6
      }
    }
    focus(rect, maxScale, true)
    setPulse({ setId: target.id, actorId: attention.actor_id, nonce: attention.nonce, target: attention.target })
  }, [attention, stage, focus, fixed])

  // Wheel zoom around the cursor (native listener: React's is passive)
  useEffect(() => {
    const el = container.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if ((e.target as HTMLElement).closest?.('[data-wheel]')) return // a Set zooming its own content (a map, a graph)
      if (fixedRef.current) return
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
  const fixedRef = useRef(fixed)
  fixedRef.current = fixed
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ moved: boolean; startView: View; startDist?: number; startMid?: { x: number; y: number } } | null>(null)

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-interactive]')) return
    if (fixed) { // no camera: a click only selects (Build)
      if (building && onSelect) {
        const setEl = (e.target as HTMLElement).closest('[data-set-id]') as HTMLElement | null
        onSelect(setEl ? { setId: Number(setEl.dataset.setId), actorId: null } : null)
      }
      return
    }
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
    if (fixed) {
      const base = stage.sets.find((s) => s.id === d.id)?.screen as SetScreen
      setDrafts((prev) => ({ ...prev, [d.id]: { screen: dragScreen(base, d.kind, dx, dy, screen.w, screen.h) } }))
      return
    }
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
    if (draft) void editor.run(() => api.updateSet(editor.sagaId, d.id, draft as Record<string, unknown>))
  }

  // -- Toolbars ------------------------------------------------------------------
  // The main toolbars live in the Set bar (the DM's); the others where the DM placed them
  const docks: DockItem[] = sets.flatMap((set) =>
    toolbarsOf(SET_TYPE_UIS[set.type]).map((def, i) => ({ set, def, place: placeOf(def, set), order: (fixed ? set.layer * 20 : 0) + i })),
  ).filter((d) => d.def.key !== 'main' && (building || (!d.place.hidden && !d.set.off)))
  const targetsOf = (setId: number) => {
    const own: Record<string, HTMLElement | null> = { main: targets[`${setId}:main`] ?? null, sub: targets[`${setId}:sub`] ?? null }
    for (const d of docks) if (d.set.id === setId) own[d.def.key] = targets[`${setId}:${d.def.key}`] ?? null
    return own
  }
  // Folded Set controls (fold, in the Set bar): the Set's toolbars hide; per Set and per person, kept in this browser
  const [folded, setFolded] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FOLDED_KEY) || '[]') as number[]) } catch { return new Set() }
  })
  const fold = (setId: number) => setFolded((current) => {
    const next = new Set(current)
    if (next.has(setId)) next.delete(setId)
    else next.add(setId)
    localStorage.setItem(FOLDED_KEY, JSON.stringify([...next]))
    return next
  })

  // -- The Set bar (the DM, Play and Build): a button per Set; the open one's menu row holds its eye, ⚙, fold and
  //    main options ------------------------------------------------------------------------------------------------
  const bar = Boolean(editor) && mode !== 'view'
  const barSets = bar
    ? [...sets].filter((set) => !toolbarsOf(SET_TYPE_UIS[set.type])[0].place.hidden).sort((a, b) => b.layer - a.layer)
    : []
  const [openSet, setOpenSet] = useState<{ id: number } | null>(null)
  const open = openSet && barSets.some((s) => s.id === openSet.id) ? openSet : null
  // The Stage's own controls (plan 33), before the Sets: the Stages selector (on the bar itself, plan 45), Actions,
  // and EFX when the Stage has EFX layers
  type ControlKey = 'actions' | 'efx'
  const switcher = bar && editor && stage.controls?.stages !== false
  const controls = bar && editor ? ([
    stage.controls?.actions !== false && { key: 'actions' as const, name: 'Actions', icon: <ActionsIcon /> },
    stage.efx && { key: 'efx' as const, name: 'EFX', icon: <EfxIcon /> },
  ].filter(Boolean) as { key: ControlKey; name: string; icon: JSX.Element }[]) : []
  const [openControl, setOpenControl] = useState<ControlKey | null>(null)
  const shownControl = controls.some((c) => c.key === openControl) ? openControl : null
  const [settingsFor, setSettingsFor] = useState<number | null>(null)
  const settingsSet = settingsFor !== null ? sets.find((s) => s.id === settingsFor) ?? null : null
  const gearOf = (set: StageSetView) => {
    if (!editor) return null
    const ui = SET_TYPE_UIS[set.type]
    return (
      <button className="set-bar-icon" aria-label={`${set.name}: settings`} title={`${set.name}: settings`}
        onClick={(e) => {
          if (building) onSelect?.({ setId: set.id, actorId: null }) // Build: its settings in the side panel
          else if (ui?.PlayMenu) setSetMenu({ setId: set.id, anchor: anchorOf(e.currentTarget) })
          else if (ui?.Inspector) setSettingsFor(set.id) // Play: its settings in a window, the Stage stays
          else editor.openSettings?.(set.id, null)
        }}><GearIcon /></button>
    )
  }
  const setBar = bar && (barSets.length > 0 || controls.length > 0 || switcher) && (
    <div className="set-bar" data-interactive style={{ right: 10 + barInset }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="set-bar-buttons" role="toolbar" aria-label="Sets">
        {switcher && editor && <StageSwitcher sagaId={editor.sagaId} editor={editor} />}
        {switcher && (controls.length > 0 || barSets.length > 0) && <span className="set-bar-sep" />}
        {controls.map((c) => {
          const isOpen = shownControl === c.key
          return (
            <button key={c.key} className={`set-bar-button control ${isOpen ? 'open' : ''}`} aria-expanded={isOpen} title={`The Stage's ${c.name} control`}
              aria-label={c.name} onClick={() => { setOpenControl(isOpen ? null : c.key); setOpenSet(null) }}>
              {c.icon}
              {isOpen && <span className="set-bar-name">{c.name}</span>}
            </button>
          )
        })}
        {controls.length > 0 && barSets.length > 0 && <span className="set-bar-sep" />}
        {barSets.map((set) => {
          const ui = SET_TYPE_UIS[set.type]
          const Icon = ui?.icon ?? SetIcon
          const isOpen = open?.id === set.id
          return (
            <button key={set.id} className={`set-bar-button ${isOpen ? 'open' : ''} ${set.off ? 'away' : ''}`} aria-expanded={isOpen}
              title={set.off ? `${set.name} (put away)` : set.name} aria-label={set.name}
              onClick={() => { setOpenSet(isOpen ? null : { id: set.id }); setOpenControl(null) }}>
              <Icon />
              {isOpen && <span className="set-bar-name">{set.name}</span>}
              {set.off && <span className="set-bar-away"><EyeIcon open={false} /></span>}
            </button>
          )
        })}
      </div>
      {barSets.map((set) => (
        <div key={set.id} className="set-bar-menu" hidden={open?.id !== set.id}>
          <button className={`set-bar-icon ${set.off ? 'off' : ''}`} aria-pressed={!set.off}
            aria-label={set.off ? `Show ${set.name}` : `Hide ${set.name}`}
            title={set.off ? `${set.name} is put away: show it again (for everyone)` : `Hide ${set.name} for now (for everyone, you too)`}
            onClick={() => void editor!.run(() => api.updateSet(editor!.sagaId, set.id, { off: !set.off }))}>
            <StageEyeIcon open={!set.off} />
          </button>
          {gearOf(set)}
          {!building && SET_TYPE_UIS[set.type]?.foldable !== false && docks.some((d) => d.set.id === set.id) && (
            <button className="set-bar-icon" aria-pressed={folded.has(set.id)} aria-label={folded.has(set.id) ? `Show ${set.name}'s controls` : `Fold ${set.name}'s controls`}
              title={folded.has(set.id) ? 'Show its controls on the Stage' : 'Fold its controls on the Stage away'} onClick={() => fold(set.id)}>
              <FoldIcon open={!folded.has(set.id)} />
            </button>
          )}
          <span className="set-bar-sep" />
          <MainSlot setId={set.id} onTarget={onTarget} />
        </div>
      ))}
      {/* The tool row: the open Set's tools for what its menu row picked (<Toolbar id="sub">), shown when it has some */}
      {barSets.map((set) => (
        <div key={set.id} className="set-bar-tools" hidden={open?.id !== set.id}>
          <MainSlot setId={set.id} onTarget={onTarget} id="sub" className="set-bar-tools-slot" />
        </div>
      ))}
      {shownControl && editor && (
        <div className="set-bar-menu">
          {shownControl === 'actions' ? <ActionControl sagaId={editor.sagaId} /> : <EfxControl stage={stage} editor={editor} />}
        </div>
      )}
    </div>
  )
  // Players: the Action control on their live Stage (not viewers, not the live link's screen)
  const saga = useOptionalSaga()
  const playerActions = !editor && mode === 'view' && saga?.saga.me.role === 'player' && stage.controls?.actions !== false
  const shownDocks = docks.filter((d) => building || !folded.has(d.set.id))
  const stacks = (items: DockItem[], canvas: boolean) => stacksOf(items, canvas).map(([key, list]) => (
    <div key={key} className={`toolbar-stack at-${list[0].place.anchor} ${key.startsWith('out-') ? 'outside' : ''}`}>
      {list.map((item) => (
        <Dock key={`${item.set.id}:${item.def.key}`} item={item} outside={key.startsWith('out-')} building={building} onTarget={onTarget} />
      ))}
    </div>
  ))

  return (
    <CanvasContext.Provider value={{ scale: view.scale }}>
      <div
        ref={container}
        className={`stage-canvas mode-${mode} layout-${fixed ? 'interface' : 'canvas'} ${setBar ? 'has-set-bar' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className={`stage-world ${moving ? 'moving' : ''}`}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: animating ? 'transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
          }}
        >
          {sets.map((set) => {
            const ui = SET_TYPE_UIS[set.type]
            const selected = building && selection?.setId === set.id
            if (set.off && !building) return null // put away: only its button in the Set bar stays (the DM's)
            // A panel as opaque as its type asks (the Desktop's slider); see-through, it loses its frame too
            const alpha = set.transparent ? null : ui?.background?.(set) ?? null
            const panel = alpha === null ? undefined : { background: `rgba(27, 23, 34, ${alpha})`, ...(alpha < 0.25 ? { borderColor: 'transparent', boxShadow: 'none' } : {}) }
            return (
              <div
                key={set.id}
                data-set-id={set.id}
                className={`stage-set ${selected ? 'selected' : ''} ${set.hidden ? 'ghost' : ''} ${set.transparent || alpha === 0 ? 'transparent' : ''} ${set.off ? 'off' : ''} ${passesThrough(ui, set) ? 'pass-through' : ''} ${ui?.fullBleed ? 'full-bleed' : ''}`}
                style={{ left: set.x, top: set.y, width: set.width, height: set.height, zIndex: set.layer, ...panel }}
              >
                <div
                  className="set-title"
                  data-interactive={building ? true : undefined}
                  onPointerDown={(e) => startSetDrag(e, set, 'move')}
                  onPointerMove={moveSetDrag}
                  onPointerUp={endSetDrag}
                >
                  <span>{set.name}</span>
                  {set.hidden && <span className="hidden-badge inline">Hidden</span>}
                </div>
                <div className="set-body" style={{ height: ui?.fullBleed ? set.height : set.height - TITLE_H }}>
                  {ui ? (
                    <ToolbarTargets.Provider value={targetsOf(set.id)}>
                    <ui.View
                      set={set}
                      mode={editor ? mode : 'view'}
                      editor={editor}
                      selectedActorId={selected ? selection!.actorId : null}
                      onSelectActor={(actorId) => onSelect?.({ setId: set.id, actorId })}
                      attention={pulse && pulse.setId === set.id ? { actorId: pulse.actorId, nonce: pulse.nonce, target: pulse.target } : null}
                    />
                    </ToolbarTargets.Provider>
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
          {/* Canvas: each Set's toolbars, inside it (under its title) or around it; above every Set */}
          {!fixed && sets.map((set) => {
            const items = shownDocks.filter((d) => d.set.id === set.id)
            if (!items.length) return null
            const inside = items.filter((d) => !d.place.outside)
            const outside = items.filter((d) => d.place.outside)
            return (
              <div key={set.id} className="toolbar-frame" style={{ left: set.x, top: set.y, width: set.width, height: set.height }}>
                {inside.length > 0 && <div className="toolbar-area" style={{ top: TITLE_H }}>{stacks(inside, true)}</div>}
                {stacks(outside, true)}
              </div>
            )
          })}
        </div>
        {/* Interface: every Set's toolbars on the screen's edges, stacked */}
        {fixed && shownDocks.length > 0 && <div className="toolbar-area screen">{stacks(shownDocks, false)}</div>}
        {setBar}
        {playerActions && saga && <PlayerActions sagaId={saga.sagaId} />}
        {fixed && building && <div className="interface-frame" aria-hidden />}
        {stage.sets.length === 0 && (
          <div className="canvas-empty">{building ? 'Empty stage. Add a Set (Actors Scene, World map...) from the side panel.' : 'Nothing on stage yet.'}</div>
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
        {settingsSet && editor && (() => {
          const Inspector = SET_TYPE_UIS[settingsSet.type]?.Inspector
          return Inspector ? (
            <Modal open wide title={settingsSet.name} onClose={() => setSettingsFor(null)}>
              <div className="set-settings-window">
                <Inspector set={settingsSet} editor={editor} selectedActorId={null} onSelectActor={() => undefined} />
              </div>
            </Modal>
          ) : null
        })()}
        {!fixed && <div className="canvas-controls" data-interactive>
          <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
          <button onClick={() => fit(true)}>Recenter</button>
          <button onClick={() => zoomBy(1.25)} aria-label="Zoom in">＋</button>
        </div>}
      </div>
    </CanvasContext.Provider>
  )
}
