/**
 * The Map Set: a location's map on the Stage, fitted to the Set (the Stage zooms).
 * - view (players): their fog in the Set's display (flat, immersive static, immersive animated), resources they
 *   may click (if their role is interactive) open in the resource view; they ping tiles (📍, or Alt+click),
 * - play (DM): the locations (one click shows another location to everyone), a token to focus on (the DM's view
 *   only), the map tools: select (a token's menu: its sheet, focus, grab attention, hide), move (drag tokens; a
 *   click moves one to another layer), highlight tiles or a region (everything else darkens), grab attention (every
 *   view takes the DM's zoom and centre); reveal, known, hide (brush); the full editor; the DM pings too,
 * - build (DM): the locations; settings in the side panel.
 * Everyone zooms (wheel, buttons) and pans (drag, once zoomed) inside the map. The controls are toolbars the
 * Stage places (stage/Toolbar.tsx): "main" (locations), "tools" and "zoom"; the map always fills the Set.
 * Pings arrive through realtime/pings.ts and show for a few seconds (maps/MapTokens.tsx).
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../../api'
import type { MapLink, MapToken, StageSetView } from '../../../api/types'
import FullscreenButton from '../../../components/FullscreenButton'
import Modal from '../../../components/Modal'
import ResourcePicker from '../../../components/ResourcePicker'
import ResourceView, { type ResourceTarget } from '../../../components/ResourceView'
import { brushTiles, fogFromString, inGrid, tileAt, tileCenter, tileKey, tilesBox, type Tile } from '../../../maps/geometry'
import MapEditor from '../../../maps/MapEditor'
import type { DrawnPing } from '../../../maps/MapTokens'
import MapView, { fitScale, ScaleLegend } from '../../../maps/MapView'
import { defaultFogGroups, fogFor, useFogTool } from '../../../maps/tools/FogTool'
import { paintRegion } from '../../../maps/tools/RegionsTool'
import type { MapCommand } from '../../../maps/useLocationMap'
import { PING_MS, usePings } from '../../../realtime/pings'
import Popover from '../../../components/Popover'
import { tokenShape } from '../../../maps/MapTokens'
import { useOptionalSaga } from '../../../saga/SagaContext'
import CharacterSheetModal from '../../../saga/sheet/CharacterSheet'
import { useCanvas } from '../../CanvasContext'
import { TITLE_H } from '../../constants'
import Toolbar from '../../Toolbar'
import type { SetViewProps } from '../../types'
import type { MapSetContent } from './types'

type Tool = 'select' | 'move' | 'highlight' | 'reveal' | 'known' | 'hide'
/** The tools tray, in groups: looking and pointing; the fog's brushes. */
const TOOL_GROUPS: [Tool, string, string][][] = [
  [['select', '☝ Select', 'Drag the map; click a token for its menu (a character\'s sheet, focus, grab attention, hide)'],
    ['move', '✥ Move', 'Drag tokens (or the map); click a token to move it to another layer']],
  [['reveal', '☀ Reveal', 'Paint tiles players see'], ['known', '◐ Known', 'Paint tiles players know (dimmed)'], ['hide', '● Hide', 'Paint tiles players don\'t see']],
]
const PAINT: Partial<Record<Tool, '2' | '1' | '0'>> = { reveal: '2', known: '1', hide: '0' }

/** Each viewer's zoom and centre on a map Set, per location (plan 39): kept when they go to another Stage and come
 * back (and on reload), until the DM grabs attention again (`nonce`: the attention it was saved after). */
type SavedView = { view: SharedView; nonce: number | null }
const VIEW_KEY = (setId: number, locationId: number) => `sagacraft.mapView.${setId}.${locationId}`
export function loadView(setId: number, locationId: number): SavedView | null {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY(setId, locationId)) || 'null') as SavedView | null
    return saved && typeof saved.view?.k === 'number' ? saved : null
  } catch {
    return null
  }
}
function saveView(setId: number, locationId: number, saved: SavedView) {
  try { localStorage.setItem(VIEW_KEY(setId, locationId), JSON.stringify(saved)) } catch { /* storage full or off: not kept */ }
}

/** Where the map sits in the Set's content area: fitted and centred (the same for the DM and players). */
export function mapPlacement(set: StageSetView) {
  const content = set.content as MapSetContent
  const box = { w: set.width, h: set.height - TITLE_H }
  const size = content.map?.size ?? [1, 1]
  const s = fitScale(box, size)
  return { box, s, x: (box.w - size[0] * s) / 2, y: (box.h - size[1] * s) / 2 }
}

/** Grab attention on tiles: their box inside the Set's content area (players' view, or the DM's Play view). */
export function tilesRect(set: StageSetView, target: Record<string, unknown>) {
  const content = set.content as MapSetContent
  const tiles = target.tiles as Tile[] | undefined
  if (!content.map || !tiles?.length || (target.location_id && target.location_id !== content.map.location.id)) return null
  const place = mapPlacement(set)
  const [x, y, w, h] = tilesBox(content.map.grid, tiles)
  return { x: place.x + x * place.s, y: place.y + y * place.s, w: w * place.s, h: h * place.s }
}

/** The map's own zoom inside the Set: 1 fits it; panning keeps the map over the whole box. */
export interface InnerView { k: number; x: number; y: number }
export const INNER_FIT: InnerView = { k: 1, x: 0, y: 0 }
export const MAX_INNER = 8

export function clampInner(v: InnerView, w: number, h: number): InnerView {
  const k = Math.max(1, Math.min(MAX_INNER, v.k))
  return { k, x: Math.min(0, Math.max(w * (1 - k), v.x)), y: Math.min(0, Math.max(h * (1 - k), v.y)) }
}

/** Zoom by a factor around a point of the box (px from its top left). */
export function zoomInner(v: InnerView, factor: number, px: number, py: number, w: number, h: number): InnerView {
  const k = Math.max(1, Math.min(MAX_INNER, v.k * factor))
  return clampInner({ k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }, w, h)
}

/** A map's view to share: the zoom, and the map point at the centre of the box (0..1 of the map). */
export interface SharedView { k: number; cx: number; cy: number }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Pure: the view someone is looking at (their inner zoom and pan) as a shared view. */
export function viewOf(inner: InnerView, place: ReturnType<typeof mapPlacement>, size: [number, number]): SharedView {
  const bx = (place.box.w / 2 - inner.x) / inner.k
  const by = (place.box.h / 2 - inner.y) / inner.k
  return { k: inner.k, cx: clamp01((bx - place.x) / (size[0] * place.s)), cy: clamp01((by - place.y) / (size[1] * place.s)) }
}

/** Pure: the inner zoom and pan that shows a shared view in this Set (its own size and fit). */
export function innerFor(view: SharedView, place: ReturnType<typeof mapPlacement>, size: [number, number]): InnerView {
  const k = Math.max(1, Math.min(MAX_INNER, view.k))
  const bx = place.x + view.cx * size[0] * place.s
  const by = place.y + view.cy * size[1] * place.s
  return clampInner({ k, x: place.box.w / 2 - bx * k, y: place.box.h / 2 - by * k }, place.box.w, place.box.h)
}

export default function MapSetView({ set, mode, editor, attention }: SetViewProps) {
  const content = set.content as MapSetContent
  const map = content.map
  const saga = useOptionalSaga()
  const { scale } = useCanvas()
  const [tool, setTool] = useState<Tool>('select')
  // A token clicked (Select: its menu; Move: its layers) and a character's sheet opened from it
  const [tokenMenu, setTokenMenu] = useState<{ token: MapToken; at: { x: number; y: number } } | null>(null)
  const [sheetOf, setSheetOf] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [viewing, setViewing] = useState<ResourceTarget | null>(null)
  const [highlightDraft, setHighlightDraft] = useState<Tile[] | null>(null)
  const admin = content.locations !== undefined
  const playing = mode === 'play' && Boolean(editor) && admin
  const command = (name: string, args: Record<string, unknown>) => editor && editor.run(() => api.setCommand(editor.sagaId, set.id, name, args))
  // The DM shows a location: one of this map's, or another (added to the map, then shown)
  const [pickingMap, setPickingMap] = useState(false)
  const showLocation = (id: number) => {
    if (!editor || id === content.current) return
    const onMap = content.locations?.some((l) => l.id === id)
    void editor.run(async () => {
      if (!onMap) await api.addActors(editor.sagaId, set.id, { resource_ids: [id] })
      return api.setCommand(editor.sagaId, set.id, 'location.show', { location_id: id })
    })
  }
  // Painting from the Stage goes straight to the location's map (the same command as the location page's tools)
  const run: MapCommand = async (name, args = {}) => {
    if (!editor || !map) return null
    let result = null
    await editor.run(async () => { result = await api.mapCommand(editor.sagaId, map.location.id, name, args) })
    return result
  }
  const painting = playing && Boolean(PAINT[tool])
  const fogTool = useFogTool({ map, run, active: painting })
  const paintState = PAINT[tool]
  const { setState: setPaintState } = fogTool
  useEffect(() => { if (paintState) setPaintState(paintState) }, [paintState, setPaintState])

  const place = mapPlacement(set)
  // The map's own zoom and pan (wheel, buttons, drag once zoomed); grab attention brings it back to the whole map
  const body = useRef<HTMLDivElement>(null)
  const [inner, setInner] = useState<InnerView>(INNER_FIT)
  const pan = useRef<{ x: number; y: number; view: InnerView } | null>(null)
  // Grab attention: the DM's view (zoom and centre), else the whole map; another location: the whole map. Coming back
  // to this Stage: the view you left (unless the DM grabbed attention since)
  const sharedView = attention?.target?.view as SharedView | undefined
  const nonce = attention?.nonce ?? null
  useEffect(() => {
    if (!map) return
    const saved = loadView(set.id, map.location.id)
    setInner(saved && saved.nonce === nonce ? innerFor(saved.view, place, map.size)
      : sharedView ? innerFor(sharedView, place, map.size) : INNER_FIT)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, map?.location.id])
  // What you zoom or pan to is kept (what the Set sets by itself isn't: a fresh "fit" would overwrite it)
  const moved = useRef(false)
  const moveView: typeof setInner = (next) => {
    moved.current = true
    setInner(next)
  }
  useEffect(() => {
    if (moved.current && map) saveView(set.id, map.location.id, { view: viewOf(inner, place, map.size), nonce })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inner])
  useEffect(() => {
    const el = body.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const sx = rect.width / el.clientWidth || 1 // the Stage's zoom
      const px = (e.clientX - rect.left) / sx, py = (e.clientY - rect.top) / sx
      moveView((v) => zoomInner(v, Math.exp(-e.deltaY * 0.0015), px, py, el.clientWidth, el.clientHeight))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  // Pings: players and the DM (not viewers, not the live link's screen), on the live Stage
  const role = saga?.saga.me.role
  const canPing = Boolean(map) && mode !== 'build' && (role === 'player' || (role === 'admin' && playing))
  const [pingArmed, setPingArmed] = useState(false)
  const [pings, setPings] = useState<DrawnPing[]>([])
  const subscribe = usePings()
  // Tokens the DM is dragging (plan 39): drawn where they'd land; dropped, they stay there until the map has moved
  // them (no jump back), cancelled they go back at once; a drag left hanging goes after a while
  const [remoteDrags, setRemoteDrags] = useState<Record<string, { tile: Tile; live: boolean }>>({})
  const dragTimers = useRef<Record<string, number>>({})
  const forgetDrag = (token: string) => setRemoteDrags((d) => {
    if (!(token in d)) return d
    const next = { ...d }
    delete next[token]
    return next
  })
  useEffect(() => {
    const tokens = map?.tokens ?? []
    setRemoteDrags((d) => {
      const done = Object.keys(d).filter((id) => !d[id].live && tokens.some((t) => t.id === id && t.tile[0] === d[id].tile[0] && t.tile[1] === d[id].tile[1]))
      if (!done.length) return d
      const next = { ...d }
      done.forEach((id) => delete next[id])
      return next
    })
  }, [map?.tokens])
  useEffect(() => subscribe?.((p) => {
    if (p.set_id !== set.id || p.location_id !== map?.location.id) return
    if (p.type === 'token_drag') {
      window.clearTimeout(dragTimers.current[p.token])
      const tile = p.tile
      if (tile) {
        setRemoteDrags((d) => ({ ...d, [p.token]: { tile, live: true } }))
        dragTimers.current[p.token] = window.setTimeout(() => forgetDrag(p.token), 30000)
      } else if (p.dropped) {
        setRemoteDrags((d) => (d[p.token] ? { ...d, [p.token]: { ...d[p.token], live: false } } : d))
        dragTimers.current[p.token] = window.setTimeout(() => forgetDrag(p.token), 3000)
      } else forgetDrag(p.token)
      return
    }
    const key = `${p.member_id}-${Date.now()}`
    setPings((list) => [...list.filter((x) => !x.key.startsWith(`${p.member_id}-`)), { key, tile: p.tile, color: p.color, name: p.name }])
    window.setTimeout(() => setPings((list) => list.filter((x) => x.key !== key)), PING_MS)
  }), [subscribe, set.id, map?.location.id])
  const [pingError, setPingError] = useState('')
  // A ping's notice (top right of the screen, for everyone who sees the map): clicking it zooms the map to the tile
  const goToPing = (tile: Tile) => {
    if (!map) return
    const [x, y] = tileCenter(map.grid, tile[0], tile[1])
    moveView(innerFor({ k: Math.max(inner.k, 2.5), cx: x / map.size[0], cy: y / map.size[1] }, place, map.size))
  }
  useEffect(() => {
    if (!pingArmed) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPingArmed(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pingArmed])
  const sendPing = (tile: Tile) => {
    const sagaId = editor?.sagaId ?? saga?.sagaId
    if (!sagaId || !map || !inGrid(map.grid, tile)) return
    setPingArmed(false)
    api.ping(sagaId, set.id, tile).catch((e: Error) => { setPingError(e.message); window.setTimeout(() => setPingError(''), 2500) })
  }
  // Alt+click pings straight away: the tile under the pointer
  const tileUnder = (e: ReactPointerEvent): Tile | null => {
    const world = body.current?.querySelector('.map-world')
    if (!world || !map) return null
    const rect = world.getBoundingClientRect()
    return tileAt(map.grid, ((e.clientX - rect.left) / rect.width) * map.size[0], ((e.clientY - rect.top) / rect.height) * map.size[1])
  }

  const canPan = inner.k > 1 && !(playing && tool !== 'select' && tool !== 'move')
  const startPan = (e: ReactPointerEvent) => {
    if (canPing && e.altKey && e.button === 0) {
      const tile = tileUnder(e)
      if (tile) { e.stopPropagation(); sendPing(tile) }
      return
    }
    if (!canPan || e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pan.current = { x: e.clientX, y: e.clientY, view: inner }
  }
  const movePan = (e: ReactPointerEvent) => {
    const p = pan.current
    const el = body.current
    if (!p || !el) return
    const sx = el.getBoundingClientRect().width / el.clientWidth || 1
    moveView(clampInner({ ...p.view, x: p.view.x + (e.clientX - p.x) / sx, y: p.view.y + (e.clientY - p.y) / sx }, el.clientWidth, el.clientHeight))
  }
  const zoomBy = (factor: number) => {
    const el = body.current
    if (el) moveView(zoomInner(inner, factor, el.clientWidth / 2, el.clientHeight / 2, el.clientWidth, el.clientHeight))
  }
  const fog = !map ? null : map.fog.states !== undefined
    ? (map.fog.states ? fogFromString(map.fog.states) : null)
    : painting ? fogTool.fog : fogFor(map, defaultFogGroups(map))

  const clickLink = (link: MapLink) => {
    if (admin && link.kind === 'location' && content.locations?.some((l) => l.id === link.resource_id)) {
      void command('location.show', { location_id: link.resource_id })
      return
    }
    if (admin || content.interactive) setViewing({ id: link.resource_id, kind: link.kind, setId: set.id })
  }

  // Highlight: the DM keeps the tiles while it's off (players get them only when on)
  const savedHighlight: Tile[] = (admin ? content.config?.highlight : map?.highlight) ?? []
  const highlightOn = admin ? content.config?.highlight_on !== false : true
  const [highlightBrush, setHighlightBrush] = useState(1)
  const [highlightHover, setHighlightHover] = useState<Tile[]>([])
  const highlightMode = useRef<'add' | 'remove'>('add')
  const highlighting = playing && tool === 'highlight' && Boolean(map)
  // A stroke starting on a highlighted tile removes, else adds (brush size); saved when released
  const onHighlight = highlighting && map ? {
    onTile: (phase: 'down' | 'move' | 'up', tile: Tile, _p: unknown, e: { buttons: number }) => {
      if (phase === 'up') {
        if (highlightDraft) void command('highlight', { tiles: highlightDraft.length ? highlightDraft : null })
        setHighlightDraft(null)
        return
      }
      const tiles = inGrid(map.grid, tile) ? brushTiles(map.grid, tile, highlightBrush) : []
      if (phase === 'move' && !e.buttons) {
        setHighlightHover(tiles)
      } else if (phase === 'down' && tiles.length) {
        highlightMode.current = savedHighlight.some((t) => tileKey(t) === tileKey(tile)) ? 'remove' : 'add'
        setHighlightDraft(paintRegion(savedHighlight, tiles, highlightMode.current))
      } else if (phase === 'move' && highlightDraft) {
        setHighlightDraft(paintRegion(highlightDraft, tiles, highlightMode.current))
      }
    },
  } : {}
  // Grab attention: every view of this Set takes the DM's zoom and centre
  const grabAttention = () => editor && map && void editor.run(() => api.grabAttention(editor.sagaId, set.id, null, { view: viewOf(inner, place, map.size) }))
  // Tokens: the DM drags them in Play with ✥ Move; Select opens a token's menu
  // While dragging, the others see where it would land (the live Stage only); the drop's end goes once it's saved
  const live = Boolean(editor?.stage.is_live)
  const dragTile = (token: MapToken, tile: Tile | null) => {
    if (editor && live) void api.tokenDrag(editor.sagaId, set.id, token.id, tile).catch(() => undefined)
  }
  const moveToken = (token: MapToken, tile: Tile) => void run('tokens.move', { id: token.id, tile }).then(() => {
    if (editor && live) void api.tokenDrag(editor.sagaId, set.id, token.id, null, true).catch(() => undefined)
  })
  const pickToken = (token: MapToken, at: { x: number; y: number }) => setTokenMenu({ token, at })
  // The view centred on a token (closer than now, at least ×2.5)
  const tokenView = (token: MapToken): SharedView | null => {
    if (!map) return null
    const shape = tokenShape(map.grid, token.tile, token.size)
    return { k: Math.max(inner.k, 2.5), cx: shape.cx / map.size[0], cy: shape.cy / map.size[1] }
  }
  const focusToken = (token: MapToken) => {
    const view = tokenView(token)
    if (view && map) moveView(innerFor(view, place, map.size))
  }
  const grabToken = (token: MapToken) => {
    const view = tokenView(token)
    if (editor && view) void editor.run(() => api.grabAttention(editor.sagaId, set.id, null, { view }))
  }
  const playersGroup = saga?.saga.groups.find((g) => g.key === 'players')
  const tokenHidden = (token: MapToken) => !token.visibility || (!token.visibility.groups.length && !token.visibility.members.length && !token.visibility.owner)
  const setTokenHidden = (token: MapToken, hide: boolean) => void run('tokens.save', {
    token: { id: token.id, visibility: hide ? { groups: [], members: [] } : { groups: playersGroup ? [playersGroup.id] : [], members: [] } },
  })
  const tokens = map ? [...(map.tokens ?? [])].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')) : []

  const shownMap = map && admin ? { ...map, highlight: highlightOn ? (highlightDraft ?? savedHighlight) : null } : map
  // Off: the DM still sees (and paints) the kept tiles, outlined
  const highlightPreview = highlighting ? [...(highlightOn ? [] : (highlightDraft ?? savedHighlight)), ...(highlightDraft ? [] : highlightHover)] : []

  return (
    <div className={`map-set mode-${mode}`}>
      {admin && mode !== 'view' && (
        <Toolbar id="main">
          {/* The shown location: a picker, this map's locations on top, every other one below */}
          <button className="small map-pick" title="Players see this location: pick another" onClick={() => setPickingMap(true)}>
            <span className="scene-tab-dot" />{content.locations!.find((l) => l.id === content.current)?.name ?? 'Pick a location…'} ▾
          </button>
          {map && map.layers.length > 1 && (
            <select className="small map-layer-select" aria-label="Layer" title="The layer players see" value={map.layer}
              onChange={(e) => void command('layer.show', { layer_id: e.target.value })}>
              {[...map.layers].reverse().map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          {playing && tokens.length > 0 && (
            <>
              <span className="toolbar-sep" />
              {/* A token to look at: the DM's view only (Grab attention brings the players along) */}
              <select className="small" aria-label="Focus on a token" title="Focus your view on a token (only yours)" value=""
                onChange={(e) => { const t = tokens.find((x) => x.id === e.target.value); if (t) focusToken(t) }}>
                <option value="">Token…</option>
                {tokens.map((t) => <option key={t.id} value={t.id}>{t.name ?? 'Unnamed token'}</option>)}
              </select>
            </>
          )}
          <ResourcePicker open={pickingMap} title="Show a location" kinds={['location']} multiple={false}
            favorites={content.locations!.map((l) => l.id)} favoritesLabel="On this map" othersLabel="Other locations"
            onPick={([id]) => id !== undefined && showLocation(id)} onClose={() => setPickingMap(false)} />
        </Toolbar>
      )}
      {playing && map && (
        <Toolbar id="tools">
          {/* Looking and pointing */}
          {TOOL_GROUPS[0].map(([key, label, hint]) => (
            <button key={key} className={`small ${tool === key ? 'primary' : ''}`} title={hint} onClick={() => { setTool(key); setTokenMenu(null) }}>{label}</button>
          ))}
          <button className={`small ${tool === 'highlight' ? 'primary' : ''}`} title="Light up tiles or a region; everything else darkens"
            onClick={() => { setTool('highlight'); setTokenMenu(null) }}>✦ Highlight</button>
          <button className="small" disabled={!editor?.stage.is_live}
            title={editor?.stage.is_live ? 'Every view of this map takes your zoom and centre' : 'Make this Stage live first'}
            onClick={grabAttention}>◎ Grab attention</button>
          <span className="toolbar-sep" />
          {/* The fog's brushes */}
          {TOOL_GROUPS[1].map(([key, label, hint]) => (
            <button key={key} className={`small ${tool === key ? 'primary' : ''}`} disabled={!map.fog.enabled}
              title={!map.fog.enabled ? 'Turn the fog on (Full editor → Fog)' : hint} onClick={() => { setTool(key); setTokenMenu(null) }}>{label}</button>
          ))}
          <span className="toolbar-sep" />
          <button className="small ghost" onClick={() => setEditing(true)}>⋯ Full editor</button>
          {painting && (
            <label className="inline-slider">Brush
              <input type="range" min={1} max={8} value={fogTool.brush} onChange={(e) => fogTool.setBrush(Number(e.target.value))} aria-label="Brush size" />
            </label>
          )}
          {tool === 'highlight' && (
            <>
              <label className="inline-slider">Brush
                <input type="range" min={1} max={8} value={highlightBrush} onChange={(e) => setHighlightBrush(Number(e.target.value))} aria-label="Highlight brush size" />
              </label>
              {(map.regions?.length ?? 0) > 0 && (
                <select className="small" aria-label="Highlight a region" value=""
                  onChange={(e) => {
                    const region = map.regions.find((r) => r.id === e.target.value)
                    if (region?.tiles.length) void command('highlight', { tiles: region.tiles, on: true })
                  }}>
                  <option value="">Region…</option>
                  {map.regions.filter((r) => r.tiles.length).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              {savedHighlight.length > 0 && (
                <>
                  <button className={`small ${highlightOn ? 'primary' : ''}`} aria-pressed={highlightOn}
                    title={highlightOn ? 'Everyone sees the highlight. Click to hide it (the tiles are kept)' : 'Hidden: only you see these tiles. Click to show them again'}
                    onClick={() => void command('highlight', { on: !highlightOn })}>{highlightOn ? '◉ On' : '○ Off'}</button>
                  <button className="small ghost" onClick={() => void command('highlight', { tiles: null })}>Clear</button>
                </>
              )}
            </>
          )}
        </Toolbar>
      )}
      <div ref={body} className={`map-set-body ${canPan ? 'pannable' : ''}`} style={{ height: place.box.h, top: 0 }} data-wheel
        data-interactive={canPan ? true : undefined} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={() => { pan.current = null }}>
        {!map && <div className="panel-empty">{mode === 'build' ? 'Add a location from the side panel.' : ''}</div>}
        {shownMap && (
          <div className="map-set-zoom" style={{ transform: `translate(${inner.x}px, ${inner.y}px) scale(${inner.k})` }}>
          <div className="map-set-map" style={{ left: place.x, top: place.y, width: shownMap.size[0] * place.s, height: shownMap.size[1] * place.s }}>
            <MapView
              map={shownMap}
              fog={fog}
              fitted
              zoom={scale * inner.k}
              lineZoom={inner.k}
              display={mode === 'build' ? 'flat' : content.fog.display}
              fogLook={content.fog}
              showGrid={content.show_grid}
              gridOnlySeen={mode !== 'build'}
              seeThrough={admin ? 0.45 : 0}
              onLinkClick={(admin && mode !== 'build') || (!admin && content.interactive) ? clickLink : undefined}
              {...(painting ? fogTool.mapProps : {})}
              {...onHighlight}
              {...(pingArmed ? { onTile: (phase: string, tile: Tile) => phase === 'down' && sendPing(tile) } : {})}
              overlay={{
                ...(painting ? fogTool.mapProps.overlay : highlighting ? { preview: { tiles: highlightPreview, tone: 'select' as const } } : {}),
                tokens: {
                  ...(playing && tool === 'select' ? { onPick: pickToken, picked: tokenMenu?.token.id }
                    : playing && tool === 'move' ? { onMove: moveToken, onDragTile: dragTile, onPick: (map?.layers.length ?? 0) > 1 ? pickToken : undefined, picked: tokenMenu?.token.id }
                    : {}),
                  remote: remoteDrags,
                },
                pings,
              }}
            >
              <ScaleLegend map={shownMap} />
            </MapView>
          </div>
          </div>
        )}
      </div>
      {shownMap && (
        <Toolbar id="zoom">
          <button className="small" aria-label="Zoom out" disabled={inner.k <= 1} onClick={() => zoomBy(1 / 1.4)}>−</button>
          {inner.k > 1 && <button className="small" onClick={() => moveView(INNER_FIT)} title="The whole map">Fit</button>}
          <button className="small" aria-label="Zoom in" disabled={inner.k >= MAX_INNER} onClick={() => zoomBy(1.4)}>＋</button>
          {canPing && (
            <button className={`small ${pingArmed ? 'primary' : ''}`} aria-pressed={pingArmed} onClick={() => setPingArmed(!pingArmed)}
              title={pingArmed ? 'Click a tile to ping it (Esc: cancel)' : 'Ping a tile: everyone sees it in your colour (or Alt+click a tile)'}>
              📍 {pingArmed ? 'Click a tile' : 'Ping'}
            </button>
          )}
          {pingError && <span className="small error-inline">{pingError}</span>}
        </Toolbar>
      )}
      {pings.length > 0 && createPortal(
        <div className="ping-notices" aria-live="polite">
          {pings.map((p) => (
            <button key={p.key} className="ping-notice" style={{ borderColor: p.color }} onClick={() => goToPing(p.tile)} title="Show me where">
              <span className="dice-dot" style={{ background: p.color }} />
              <strong>{p.name}</strong> pinged {map?.location.name ? <>on {map.location.name}</> : 'the map'}
              <span className="muted small">· show me</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
      <div className="portal-guard" onPointerDown={(e) => e.stopPropagation()}>
        {saga && <ResourceView target={viewing} onClose={() => setViewing(null)} />}
        {tokenMenu && map && editor && (() => {
          const token = map.tokens?.find((t) => t.id === tokenMenu.token.id) ?? tokenMenu.token
          const close = () => setTokenMenu(null)
          const hidden = tokenHidden(token)
          return (
            <Popover anchor={{ left: tokenMenu.at.x, top: tokenMenu.at.y, width: 0, height: 0 }} onClose={close}>
              <div className="menu">
                <div className="menu-title">{token.name ?? 'Unnamed token'}{hidden && <span className="muted small"> · hidden from players</span>}</div>
                {tool === 'move' ? (
                  <>
                    <span className="menu-note muted small">Drag it to move it on this layer, or move it to:</span>
                    {[...map.layers].reverse().filter((l) => l.id !== map.layer).map((l) => (
                      <button key={l.id} className="menu-item" onClick={() => { void run('tokens.layer', { id: token.id, to: l.id }); close() }}>
                        <span className="menu-icon">⇅</span>{l.name}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    {token.kind === 'character' && token.ref && saga && (
                      <button className="menu-item" onClick={() => { setSheetOf(token.ref!); close() }}>
                        <span className="menu-icon">❏</span>Open sheet
                      </button>
                    )}
                    <button className="menu-item" onClick={() => { focusToken(token); close() }}>
                      <span className="menu-icon">⌖</span>Focus on it <span className="muted small">(your view)</span>
                    </button>
                    <button className="menu-item" disabled={!editor.stage.is_live || hidden}
                      title={!editor.stage.is_live ? 'Make this Stage live first' : hidden ? 'Show it to players first' : 'Every view of this map zooms to it'}
                      onClick={() => { grabToken(token); close() }}>
                      <span className="menu-icon">◎</span>Grab attention
                    </button>
                    <button className="menu-item" onClick={() => { setTokenHidden(token, !hidden); close() }}>
                      <span className="menu-icon">{hidden ? '👁' : '⦸'}</span>{hidden ? 'Show to players' : 'Hide from players'}
                    </button>
                  </>
                )}
              </div>
            </Popover>
          )
        })()}
        {saga && sheetOf !== null && (
          <CharacterSheetModal sagaId={saga.sagaId} resourceId={sheetOf} setId={set.id} actorId={null} refreshKey="" initialMode="informative"
            onClose={() => setSheetOf(null)} />
        )}
        {editor && map && (
          <Modal open={editing} wide title={`${map.location.name ?? 'Map'}: map tools`} onClose={() => setEditing(false)} className="map-editor-modal"
            actions={<FullscreenButton />}>
            {editing && <MapEditor sagaId={editor.sagaId} locationId={map.location.id} tools={['fog', 'grid', 'layers', 'background', 'tokens', 'links', 'labels', 'paths', 'regions', 'pictures']} initial="tokens" layer={map.layer} />}
          </Modal>
        )}
      </div>
    </div>
  )
}
