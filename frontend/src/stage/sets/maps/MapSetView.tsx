/**
 * World map and Local map Sets: a location's map on the Stage, fitted to the Set (the Stage zooms).
 * - view (players): their fog in the Set's display (flat, immersive static, immersive animated), resources they
 *   may click (if their role is interactive) open in the resource view,
 * - play (DM): the locations (one click shows another location to everyone), the map tools: point, reveal,
 *   known, hide (brush), highlight tiles or a region (everything else darkens; grab attention on them), the
 *   full editor,
 * - build (DM): the locations; settings in the side panel.
 * Everyone zooms (wheel, buttons) and pans (drag, once zoomed) inside the map. The controls are toolbars the
 * Stage places (stage/Toolbar.tsx): "main" (locations), "tools" and "zoom"; the map always fills the Set.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { api } from '../../../api'
import type { MapLink, StageSetView } from '../../../api/types'
import FullscreenButton from '../../../components/FullscreenButton'
import Modal from '../../../components/Modal'
import ResourceView, { type ResourceTarget } from '../../../components/ResourceView'
import { brushTiles, fogFromString, inGrid, tileKey, tilesBox, type Tile } from '../../../maps/geometry'
import MapEditor from '../../../maps/MapEditor'
import MapView, { fitScale, ScaleLegend } from '../../../maps/MapView'
import { defaultFogGroups, fogFor, useFogTool } from '../../../maps/tools/FogTool'
import { paintRegion } from '../../../maps/tools/RegionsTool'
import type { MapCommand } from '../../../maps/useLocationMap'
import { useOptionalSaga } from '../../../saga/SagaContext'
import { useCanvas } from '../../CanvasContext'
import { TITLE_H } from '../../constants'
import Toolbar from '../../Toolbar'
import type { SetViewProps } from '../../types'
import type { MapSetContent } from './types'

type Tool = 'point' | 'reveal' | 'known' | 'hide' | 'highlight'
const PAINT: Partial<Record<Tool, '2' | '1' | '0'>> = { reveal: '2', known: '1', hide: '0' }

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

export default function MapSetView({ set, mode, editor, attention }: SetViewProps) {
  const content = set.content as MapSetContent
  const map = content.map
  const saga = useOptionalSaga()
  const { scale } = useCanvas()
  const [tool, setTool] = useState<Tool>('point')
  const [editing, setEditing] = useState(false)
  const [viewing, setViewing] = useState<ResourceTarget | null>(null)
  const [highlightDraft, setHighlightDraft] = useState<Tile[] | null>(null)
  const admin = content.locations !== undefined
  const playing = mode === 'play' && Boolean(editor) && admin
  const command = (name: string, args: Record<string, unknown>) => editor && editor.run(() => api.setCommand(editor.sagaId, set.id, name, args))
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
  useEffect(() => setInner(INNER_FIT), [attention?.nonce, map?.location.id])
  useEffect(() => {
    const el = body.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const sx = rect.width / el.clientWidth || 1 // the Stage's zoom
      const px = (e.clientX - rect.left) / sx, py = (e.clientY - rect.top) / sx
      setInner((v) => zoomInner(v, Math.exp(-e.deltaY * 0.0015), px, py, el.clientWidth, el.clientHeight))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  const canPan = inner.k > 1 && !(playing && tool !== 'point')
  const startPan = (e: ReactPointerEvent) => {
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
    setInner(clampInner({ ...p.view, x: p.view.x + (e.clientX - p.x) / sx, y: p.view.y + (e.clientY - p.y) / sx }, el.clientWidth, el.clientHeight))
  }
  const zoomBy = (factor: number) => {
    const el = body.current
    if (el) setInner(zoomInner(inner, factor, el.clientWidth / 2, el.clientHeight / 2, el.clientWidth, el.clientHeight))
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
  const grabHighlight = () => editor && void editor.run(async () => {
    if (!highlightOn) await api.setCommand(editor.sagaId, set.id, 'highlight', { on: true })
    await api.grabAttention(editor.sagaId, set.id, null, { tiles: savedHighlight })
  })

  const shownMap = map && admin ? { ...map, highlight: highlightOn ? (highlightDraft ?? savedHighlight) : null } : map
  // Off: the DM still sees (and paints) the kept tiles, outlined
  const highlightPreview = highlighting ? [...(highlightOn ? [] : (highlightDraft ?? savedHighlight)), ...(highlightDraft ? [] : highlightHover)] : []

  return (
    <div className={`map-set mode-${mode}`}>
      {admin && !content.simple && mode !== 'view' && (
        <Toolbar id="main">
          {content.locations!.length === 0 && <span className="muted small">No locations yet: add them in the side panel.</span>}
          {content.locations!.map((l) => (
            <button key={l.id} className={`scene-tab ${l.id === content.current ? 'on active' : ''}`}
              title={l.id === content.current ? 'Players see this location' : 'Show this location to the players'}
              onClick={() => l.id !== content.current && void command('location.show', { location_id: l.id })}>
              {l.id === content.current && <span className="scene-tab-dot" />}{l.name}
            </button>
          ))}
        </Toolbar>
      )}
      {playing && map && (
        <Toolbar id="tools">
          {([['point', '☝ Point'], ['reveal', '☀ Reveal'], ['known', '◐ Known'], ['hide', '● Hide'], ['highlight', '✦ Highlight']] as [Tool, string][]).map(([key, label]) => (
            <button key={key} className={`small ${tool === key ? 'primary' : ''}`} disabled={Boolean(PAINT[key]) && !map.fog.enabled}
              title={PAINT[key] && !map.fog.enabled ? 'Turn the fog on (Full editor → Fog)' : undefined} onClick={() => setTool(key)}>{label}</button>
          ))}
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
                  <button className="small" disabled={!editor?.stage.is_live} title={editor?.stage.is_live ? 'Every view centres on these tiles' : 'Make this Stage live first'}
                    onClick={grabHighlight}>◎ Grab attention</button>
                  <button className="small ghost" onClick={() => void command('highlight', { tiles: null })}>Clear</button>
                </>
              )}
            </>
          )}
          <button className="small ghost" onClick={() => setEditing(true)}>⋯ Full editor</button>
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
              display={mode === 'build' ? 'flat' : content.fog.display}
              fogLook={content.fog}
              showGrid={content.show_grid}
              gridOnlySeen={mode !== 'build'}
              seeThrough={admin ? 0.45 : 0}
              onLinkClick={(admin && mode !== 'build') || (!admin && content.interactive) ? clickLink : undefined}
              {...(painting ? fogTool.mapProps : {})}
              {...onHighlight}
              overlay={painting ? fogTool.mapProps.overlay : highlighting ? { preview: { tiles: highlightPreview, tone: 'select' } } : undefined}
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
          {inner.k > 1 && <button className="small" onClick={() => setInner(INNER_FIT)} title="The whole map">Fit</button>}
          <button className="small" aria-label="Zoom in" disabled={inner.k >= MAX_INNER} onClick={() => zoomBy(1.4)}>＋</button>
        </Toolbar>
      )}
      <div className="portal-guard" onPointerDown={(e) => e.stopPropagation()}>
        {saga && <ResourceView target={viewing} onClose={() => setViewing(null)} />}
        {editor && map && (
          <Modal open={editing} wide title={`${map.location.name ?? 'Map'}: map tools`} onClose={() => setEditing(false)} className="map-editor-modal"
            actions={<FullscreenButton />}>
            {editing && <MapEditor sagaId={editor.sagaId} locationId={map.location.id} tools={['fog', 'links', 'labels', 'paths', 'regions', 'pictures', 'grid']} />}
          </Modal>
        )}
      </div>
    </div>
  )
}
