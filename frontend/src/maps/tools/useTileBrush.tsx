/**
 * Painting tiles with a brush or a rectangle (fog, regions): the stroke shows at once and is handed over when
 * the pointer is released. Keys [ and ] change the brush size.
 */
import { useEffect, useRef, useState } from 'react'
import type { LocationMap } from '../../api/types'
import Segmented from '../../components/Segmented'
import { brushTiles, inGrid, rectTiles, tileKey, type Tile } from '../geometry'
import type { MapViewProps } from '../MapView'

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

  const controls = (
    <>
      <div className="field">
        <span className="field-label">Shape</span>
        <Segmented value={shape} options={[['brush', 'Brush'], ['rect', 'Rectangle']]} onChange={setShape} />
      </div>
      {shape === 'brush' && (
        <label className="slider">
          <span className="slider-head">Brush size <span className="muted">{brush} ([ ])</span></span>
          <input type="range" min={1} max={8} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
        </label>
      )}
    </>
  )

  return { stroke, hover: stroke.size ? [] : hover, onTile, brush, setBrush, shape, setShape, controls }
}
