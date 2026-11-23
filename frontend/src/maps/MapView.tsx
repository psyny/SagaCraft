/**
 * A location's map on screen: the renderer, the overlay, and the pointer. Two ways to sit on a page:
 * - pannable (the location page, the resource view): its own pan (drag; right/middle drag or Space+drag while a
 *   tool is on) and zoom (wheel, buttons),
 * - fitted (map Sets): the whole map fits the box; the Stage zooms.
 * Tools get tile events (down, move, up) with the tile and the point in map px.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { LocationMap, MapLink } from '../api/types'
import { tileAt, type Point, type Tile } from './geometry'
import MapOverlay from './MapOverlay'
import MapRenderer, { type MapSource } from './MapRenderer'
import type { FogDisplay, FogLook } from './shader'

export type TilePhase = 'down' | 'move' | 'up'

export interface MapViewProps {
  map: LocationMap
  /** What to draw: per tile 0/1/2, or null (no fog). */
  fog: Uint8Array | null
  display?: FogDisplay
  fogLook?: FogLook
  seeThrough?: number
  showGrid?: boolean
  /** Grid lines only on known and visible tiles (map Sets). */
  gridOnlySeen?: boolean
  /** Fit the box with no pan of its own (Sets); `zoom` is the Stage's zoom (for the canvas resolution). */
  fitted?: boolean
  zoom?: number
  /** Fitted maps: how far they're zoomed in from fitted (a map Set's own zoom): the grid's lines grow with it. */
  lineZoom?: number
  /** A tool wants tile events (painting, picking tiles). */
  onTile?: (phase: TilePhase, tile: Tile, point: Point, event: PointerEvent) => void
  /** Pictures tool: raw pointer events in map px (drag pictures). */
  onPoint?: (phase: TilePhase, point: Point, event: PointerEvent) => void
  onLinkClick?: (link: MapLink) => void
  overlay?: Omit<Parameters<typeof MapOverlay>[0], 'map' | 'onLinkClick'>
  /** Shown over the map (HTML), e.g. a scale legend. */
  children?: ReactNode
}

interface View {
  x: number
  y: number
  s: number
}

/** The map's source for the renderer: the DM's pictures, or the players' composed picture. */
export const sourceOf = (map: LocationMap): MapSource =>
  map.images ? { images: map.images } : map.image ? { url: map.image.url } : null

export function fitScale(box: { w: number; h: number }, size: [number, number]): number {
  return Math.min(box.w / size[0], box.h / size[1])
}

export default function MapView(props: MapViewProps) {
  const { map, fog, display = 'flat', fogLook, seeThrough, showGrid = true, gridOnlySeen = false, fitted = false, zoom = 1,
    lineZoom, onTile, onPoint, onLinkClick, overlay, children } = props
  const [w, h] = map.size
  const box = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View | null>(null)
  const drag = useRef<{ kind: 'pan' | 'tool'; x: number; y: number; view: View } | null>(null)
  const space = useRef(false)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(el)
    return () => observer?.disconnect()
  }, [])

  const fit = useCallback((): View => {
    const s = size.w && size.h ? fitScale(size, map.size) : 1
    return { s, x: (size.w - w * s) / 2, y: (size.h - h * s) / 2 }
  }, [size, map.size, w, h])

  // Fit on first layout, when the map's size changes, and always when fitted
  const sizeKey = `${w}x${h}`
  const fittedKey = useRef('')
  useEffect(() => {
    if (!size.w) return
    if (fitted || fittedKey.current !== sizeKey) {
      fittedKey.current = sizeKey
      setView(fit())
    }
  }, [fitted, fit, sizeKey, size.w])

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = true }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // Wheel zoom around the pointer (pannable maps only)
  useEffect(() => {
    const el = box.current
    if (!el || fitted) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      setView((v) => {
        if (!v) return v
        const s = Math.max(0.05, Math.min(8, v.s * Math.exp(-e.deltaY * 0.0015)))
        return { s, x: px - ((px - v.x) * s) / v.s, y: py - ((py - v.y) * s) / v.s }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [fitted])

  const toMap = (e: PointerEvent): Point => {
    const rect = world.current!.getBoundingClientRect()
    return [((e.clientX - rect.left) / rect.width) * w, ((e.clientY - rect.top) / rect.height) * h]
  }
  const tool = Boolean(onTile || onPoint)
  const emit = (phase: TilePhase, e: PointerEvent) => {
    const point = toMap(e)
    onPoint?.(phase, point, e)
    onTile?.(phase, tileAt(map.grid, point[0], point[1]), point, e)
  }

  const onPointerDown = (e: PointerEvent) => {
    const panning = !fitted && (!tool || e.button !== 0 || space.current)
    if (!panning && !tool) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { kind: panning ? 'pan' : 'tool', x: e.clientX, y: e.clientY, view: view ?? fit() }
    if (!panning) emit('down', e)
  }
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d) {
      if (tool && !e.buttons) emit('move', e) // hover: brush preview
      return
    }
    if (d.kind === 'pan') setView({ ...d.view, x: d.view.x + e.clientX - d.x, y: d.view.y + e.clientY - d.y })
    else emit('move', e)
  }
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (d?.kind === 'tool') emit('up', e)
  }

  const v = view ?? fit()
  const zoomBy = (factor: number) => setView((cur) => {
    const c = cur ?? fit()
    const s = Math.max(0.05, Math.min(8, c.s * factor))
    return { s, x: size.w / 2 - ((size.w / 2 - c.x) * s) / c.s, y: size.h / 2 - ((size.h / 2 - c.y) * s) / c.s }
  })

  return (
    <div
      ref={box}
      className={`map-view ${fitted ? 'fitted' : 'pannable'} ${tool ? 'with-tool' : ''}`}
      data-interactive={tool || !fitted ? true : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null }}
      onContextMenu={(e) => tool && e.preventDefault()}
    >
      <div ref={world} className="map-world" style={{ width: w, height: h, transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})` }}>
        <MapRenderer width={w} height={h} quality={v.s * zoom} source={sourceOf(map)} grid={map.grid} showGrid={showGrid}
          fog={fog} display={display} fogLook={fogLook} seeThrough={seeThrough} gridOnlySeen={gridOnlySeen} background={map.background}
          lineZoom={fitted ? lineZoom ?? 1 : v.s / Math.max(0.0001, fit().s)} />
        <MapOverlay map={map} onLinkClick={onLinkClick} {...overlay} />
      </div>
      {children}
      {!fitted && (
        <div className="map-zoom" data-interactive onPointerDown={(e) => e.stopPropagation()}>
          <button className="small" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>−</button>
          <button className="small" onClick={() => setView(fit())}>Fit</button>
          <button className="small" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>＋</button>
        </div>
      )}
    </div>
  )
}

/** "1 tile = 5 ft" in a corner (when the grid has a physical size). */
export function ScaleLegend({ map }: { map: LocationMap }) {
  if (map.grid.type === 'none' || !map.grid.unit_size) return null
  return <div className="map-scale">1 tile = {map.grid.unit_size} {map.grid.unit}</div>
}
