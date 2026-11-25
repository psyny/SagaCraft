/**
 * Painting tiles with a brush or a rectangle (fog, regions): the stroke shows at once and is handed over when
 * the pointer is released. Keys [ and ] change the brush size.
 */
import { useEffect, useRef, useState } from 'react'
import type { LocationMap } from '../../api/types'
import { brushTiles, inGrid, rectTiles, tileKey, type Tile } from '../geometry'
import type { MapViewProps } from '../MapView'
import { BrushIcon, RectIcon } from '../toolbar/icons'
import { ToolButton, TrayTool } from '../toolbar/widgets'

export interface TileBrushOptions {
  map: LocationMap | null
  /** Keys listen only while the tool is on. */
  active: boolean
  /** Painting is possible (e.g. fog on, a region picked, a grid). */
  enabled: boolean
  /** The tiles of one stroke; the stroke's preview clears when this settles. */
  onStroke: (tiles: Tile[]) => Promise<unknown> | void
}

export function useTileBrush({ map, active, enabled, onStroke }: TileBrushOptions) {
  const [brush, setBrush] = useState(1)
  const [shape, setShape] = useState<'brush' | 'rect'>('brush')
  const [stroke, setStroke] = useState<Map<string, Tile>>(new Map())
  const [hover, setHover] = useState<Tile[]>([])
  const rectStart = useRef<Tile | null>(null)

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      if (e.key === '[') setBrush((b) => Math.max(1, b - 1))
      else if (e.key === ']') setBrush((b) => Math.min(8, b + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const add = (tiles: Tile[]) => setStroke((s) => {
    const next = new Map(s)
    tiles.forEach((t) => next.set(tileKey(t), t))
    return next
  })

  const onTile: MapViewProps['onTile'] = (phase, tile, _point, event) => {
    if (!map || !enabled || map.grid.type === 'none') return
    const tiles = inGrid(map.grid, tile) ? brushTiles(map.grid, tile, shape === 'brush' ? brush : 1) : []
    if (phase === 'move' && !event.buttons) {
      setHover(tiles)
      return
    }
    if (shape === 'rect') {
      if (phase === 'down') rectStart.current = tile
      if (rectStart.current) setStroke(new Map(rectTiles(map.grid, rectStart.current, tile).map((t) => [tileKey(t), t])))
    } else if (phase !== 'up') {
      add(tiles)
    }
    if (phase === 'up') {
      rectStart.current = null
      const painted = [...stroke.values()]
      if (shape === 'brush') tiles.forEach((t) => painted.push(t))
      if (painted.length) void Promise.resolve(onStroke(painted)).finally(() => setStroke(new Map()))
      else setStroke(new Map())
    }
  }

  return { stroke, hover: stroke.size ? [] : hover, onTile, brush, setBrush, shape, setShape }
}

/** The brush's tools on the map tools bar: brush or rectangle, and the brush's size. */
export function BrushTools({ painter, disabled = false }: { painter: ReturnType<typeof useTileBrush>; disabled?: boolean }) {
  const { shape, setShape, brush, setBrush } = painter
  return (
    <>
      <ToolButton icon={<BrushIcon />} label="Brush" title="Brush ([ ] change its size)" on={shape === 'brush'} disabled={disabled} onClick={() => setShape('brush')} />
      <ToolButton icon={<RectIcon />} label="Rectangle" title="Rectangle: drag from corner to corner" on={shape === 'rect'} disabled={disabled} onClick={() => setShape('rect')} />
      {shape === 'brush' && (
        <TrayTool label="Brush size" disabled={disabled} button={<><span className="map-tool-label">Size</span><span className="map-tool-text">{brush}</span><span className="caret">▾</span></>}>
          {() => (
            <label className="slider tray-slider">
              <span className="slider-head">Brush size <span className="muted">{brush} ([ ])</span></span>
              <input type="range" min={1} max={8} value={brush} autoFocus aria-label="Brush size" onChange={(e) => setBrush(Number(e.target.value))} />
            </label>
          )}
        </TrayTool>
      )}
    </>
  )
}
