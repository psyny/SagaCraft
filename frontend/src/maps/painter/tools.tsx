/**
 * The map painter's tools on the map tools bar (plan 47; the map editor only):
 * - Terrain: category ▾, type ▾ | brush size, brush shape ▾ | Paint, Erase | the type's three colours. Drag on the map:
 *   the stroke shows at once and is saved when released.
 * - Roads & rivers: category ▾, type ▾ | Paint, Erase | colours. Drag from tile to tile: each step joins (or parts) two
 *   tiles; a click while erasing clears a tile. Rivers flow the way they're drawn.
 * - Landmarks: ☰ (the layer's landmarks: select, eye, rename, delete) and ＋ (click tiles to place them; Esc stops);
 *   the selected one: Move, size, another look, its colours; otherwise what the next one will be (category, type,
 *   size, colours). A click on a landmark's tile picks it.
 * The catalogue (what can be painted, colours' roles and defaults) comes from the server once.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { api } from '../../api'
import type { LocationMap, MapGrid, PaintCatalogue } from '../../api/types'
import { useOptionalSaga } from '../../saga/SagaContext'
import { brushTiles, inGrid, tileCenter, type Tile } from '../geometry'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import { BrushIcon, EraserIcon, MoveIcon, ReverseIcon } from '../toolbar/icons'
import { ColorTool, MenuTool, Sep, ToolButton, TrayTool, type EntityKind } from '../toolbar/widgets'
import { emptyPaint, stepsBetween, withConnections, withTiles, type PaintEntry } from './data'
import { onPaintersBuilding, paintersBuilding } from './renderer'

type CatalogueType = PaintCatalogue['types'][number]
type Kind = CatalogueType['kind']
type Colors = [string, string, string]

let cached: PaintCatalogue | null = null
let loading: Promise<PaintCatalogue> | null = null

/** The painter's catalogue (fetched once per page; only where the painter is: the map editor). */
export function usePaintCatalogue(wanted = true): PaintCatalogue | null {
  const sagaId = useOptionalSaga()?.sagaId
  const [catalogue, setCatalogue] = useState<PaintCatalogue | null>(cached)
  useEffect(() => {
    if (cached || !sagaId || !wanted) return
    loading = loading ?? api.paintCatalogue(sagaId)
    loading.then((c) => { cached = c; setCatalogue(c) }).catch(() => { loading = null })
  }, [sagaId, wanted])
  return catalogue
}

/** Picking a type: its category, the type in it, its colours (reset to the type's own when it changes). */
function useTypePick(catalogue: PaintCatalogue | null, kinds: Kind[]) {
  const types = catalogue?.types.filter((t) => kinds.includes(t.kind)) ?? []
  const categories = (catalogue?.categories ?? []).filter((c) => types.some((t) => t.category === c.key))
  const [category, setCategory] = useState<string | null>(null)
  const [typeKey, setTypeKey] = useState<string | null>(null)
  const [colors, setColors] = useState<Colors | null>(null)
  const cat = category ?? categories[0]?.key ?? ''
  const inCat = types.filter((t) => t.category === cat)
  const type = inCat.find((t) => t.key === typeKey) ?? inCat[0] ?? null
  const shown: Colors = colors ?? (type?.colors ?? ['#888888', '#444444', '#cccccc'])
  const pickType = (key: string) => { setTypeKey(key); setColors(null) }
  const head = catalogue && type ? (
    <>
      {categories.length > 1 && (
        <MenuTool label="Category" value={cat} options={categories.map((c) => [c.key, c.name] as const)}
          onChange={(c) => { setCategory(c); setTypeKey(null); setColors(null) }} />
      )}
      <MenuTool label="Type" value={type.key} options={inCat.map((t) => [t.key, t.name] as const)} onChange={pickType} />
    </>
  ) : <span className="map-tool-hint">Loading…</span>
  const colorTools = type && (
    <>
      {type.roles.map((role, i) => (
        <ColorTool key={`${type.key}-${i}`} label={role} value={shown[i]} onChange={(c) => {
          const next = [...shown] as Colors
          next[i] = c
          setColors(next)
        }} />
      ))}
      {colors && <ToolButton icon={<ReverseIcon />} label="The type's own colours" onClick={() => setColors(null)} />}
    </>
  )
  const entry: PaintEntry | null = type ? { type: type.key, colors: shown, material: type.material } : null
  return { type, colors: shown, entry, head, colorTools }
}

const noGrid = (map: LocationMap | null) => !map || map.grid.type === 'none'

/** While the painter's shaders build (seconds, the first time on Windows): strokes are kept and show when it's ready. */
function PainterBuilding() {
  const building = useSyncExternalStore(onPaintersBuilding, paintersBuilding)
  return building ? <span className="map-tool-hint" role="status">Getting the painter ready…</span> : null
}

/** The tiles a brush covers: round (by distance) or square. */
function brushOf(grid: MapGrid, center: Tile, size: number, shape: 'round' | 'square'): Tile[] {
  if (shape === 'round') return brushTiles(grid, center, size)
  const out: Tile[] = []
  for (let r = center[1] - size + 1; r <= center[1] + size - 1; r += 1) {
    for (let c = center[0] - size + 1; c <= center[0] + size - 1; c += 1) if (inGrid(grid, [c, r])) out.push([c, r])
  }
  return out
}

// -- Terrain ------------------------------------------------------------------------------------------------------

export function useTerrainTool({ map, run, setMap, active, catalogue }: {
  map: LocationMap | null; run: MapCommand; setMap: (m: LocationMap) => void; active: boolean; catalogue: PaintCatalogue | null
}) {
  const pick = useTypePick(catalogue, ['terrain'])
  const [size, setSize] = useState(2)
  const [shape, setShape] = useState<'round' | 'square'>('round')
  const [erase, setErase] = useState(false)
  const [hover, setHover] = useState<Tile[]>([])
  const stroke = useRef<{ base: LocationMap; tiles: Map<string, Tile> } | null>(null)

  const onTile: MapViewProps['onTile'] = (phase, tile, _point, event) => {
    if (!map || noGrid(map) || !pick.entry) return
    const tiles = inGrid(map.grid, tile) ? brushOf(map.grid, tile, size, shape) : []
    if (phase === 'move' && !event.buttons) { setHover(tiles); return }
    if (phase === 'down') stroke.current = { base: map, tiles: new Map() }
    const s = stroke.current
    if (!s) return
    if (phase !== 'up') {
      let grew = false
      for (const t of tiles) if (!s.tiles.has(`${t[0]},${t[1]}`)) { s.tiles.set(`${t[0]},${t[1]}`, t); grew = true }
      if (grew) setMap({ ...s.base, paint: withTiles(s.base.paint ?? emptyPaint(), s.base.grid, erase ? null : pick.entry, [...s.tiles.values()]) })
      return
    }
    stroke.current = null
    const painted = [...s.tiles.values()]
    if (painted.length) void run('paint.tiles', { type: erase ? null : pick.entry.type, colors: pick.colors, tiles: painted })
  }

  const row = noGrid(map) ? <span className="map-tool-hint">Painting is on tiles: pick a grid first (Grid tab)</span> : (
    <>
      <PainterBuilding />
      {pick.head}
      <Sep />
      <TrayTool label="Brush size" button={<><span className="map-tool-label">Size</span><span className="map-tool-text">{size}</span><span className="caret">▾</span></>}>
        {() => (
          <label className="slider tray-slider">
            <span className="slider-head">Brush size <span className="muted">{size} ([ ])</span></span>
            <input type="range" min={1} max={8} value={size} autoFocus aria-label="Brush size" onChange={(e) => setSize(Number(e.target.value))} />
          </label>
        )}
      </TrayTool>
      <MenuTool label="Shape" value={shape} options={[['round', 'Round'], ['square', 'Square']] as const} onChange={setShape} />
      <Sep />
      <ToolButton icon={<BrushIcon />} label="Paint" text="Paint" on={!erase} onClick={() => setErase(false)} />
      <ToolButton icon={<EraserIcon />} label="Erase" text="Erase" on={erase} onClick={() => setErase(true)} />
      <Sep />
      {pick.colorTools}
    </>
  )

  // [ and ] change the brush's size
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      if (e.key === '[') setSize((v) => Math.max(1, v - 1))
      else if (e.key === ']') setSize((v) => Math.min(8, v + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const mapProps: Partial<MapViewProps> = active && map && !noGrid(map) ? {
    onTile, overlay: { preview: { tiles: hover, tone: erase ? 'unknown' : 'select' } },
  } : {}
  return { row, mapProps, armed: active, escape: () => false }
}

// -- Roads and rivers ---------------------------------------------------------------------------------------------

export function useWaysTool({ map, run, setMap, active, catalogue }: {
  map: LocationMap | null; run: MapCommand; setMap: (m: LocationMap) => void; active: boolean; catalogue: PaintCatalogue | null
}) {
  const pick = useTypePick(catalogue, ['road', 'river'])
  const [erase, setErase] = useState(false)
  const [hover, setHover] = useState<Tile[]>([])
  const stroke = useRef<{ base: LocationMap; steps: Tile[] } | null>(null)
  const channel: 'road' | 'river' = pick.type?.kind === 'river' ? 'river' : 'road'

  const onTile: MapViewProps['onTile'] = (phase, tile, _point, event) => {
    if (!map || noGrid(map) || !pick.entry) return
    if (phase === 'move' && !event.buttons) { setHover(inGrid(map.grid, tile) ? [tile] : []); return }
    if (phase === 'down') {
      if (!inGrid(map.grid, tile)) return
      stroke.current = { base: map, steps: [tile] }
      if (erase) setMap({ ...map, paint: withConnections(map.paint ?? emptyPaint(), map.grid, channel, null, [tile], true) })
      return
    }
    const s = stroke.current
    if (!s) return
    const last = s.steps[s.steps.length - 1]
    if (phase === 'move' && inGrid(map.grid, tile) && (tile[0] !== last[0] || tile[1] !== last[1])) {
      s.steps.push(...stepsBetween(map.grid, last, tile, (t) => tileCenter(map.grid, t[0], t[1])).filter((t) => inGrid(map.grid, t)))
      setMap({ ...s.base, paint: withConnections(s.base.paint ?? emptyPaint(), s.base.grid, channel, pick.entry, s.steps, erase) })
      return
    }
    if (phase === 'up') {
      stroke.current = null
      if (s.steps.length > 1 || erase) {
        void run('paint.connect', { channel, type: erase ? null : pick.entry.type, colors: pick.colors, tiles: s.steps, erase })
      }
    }
  }

  const row = noGrid(map) ? <span className="map-tool-hint">Roads and rivers join tiles: pick a grid first (Grid tab)</span> : (
    <>
      <PainterBuilding />
      {pick.head}
      <Sep />
      <ToolButton icon={<BrushIcon />} label="Paint" text="Paint" title="Drag from tile to tile" on={!erase} onClick={() => setErase(false)} />
      <ToolButton icon={<EraserIcon />} label="Erase" text="Erase" title="Drag along it to part tiles; click a tile to clear it" on={erase} onClick={() => setErase(true)} />
      <Sep />
      {pick.colorTools}
    </>
  )

  const mapProps: Partial<MapViewProps> = active && map && !noGrid(map) ? {
    onTile, overlay: { preview: { tiles: hover, tone: erase ? 'unknown' : 'select' } },
  } : {}
  return { row, mapProps, armed: active, escape: () => false }
}

// -- Landmarks ----------------------------------------------------------------------------------------------------

export function useLandmarksTool({ map, run, active, catalogue }: {
  map: LocationMap | null; run: MapCommand; active: boolean; catalogue: PaintCatalogue | null
}) {
  const pick = useTypePick(catalogue, ['object'])
  const [size, setSize] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)
  const [moving, setMoving] = useState(false)
  const objects = map?.paint?.objects ?? []
  const object = objects.find((o) => o.id === selected) ?? null
  const typeOf = (key: string) => catalogue?.types.find((t) => t.key === key)
  const newSize = size ?? pick.type?.size ?? 1
  const select = (id: string | null) => { setSelected(id); setMoving(false); setPlacing(false) }
  const save = (changes: Record<string, unknown>, id = selected) => run('paint.objects.save', { object: { ...(id ? { id } : {}), ...changes } })

  const onTile: MapViewProps['onTile'] = (phase, tile) => {
    if (phase !== 'down' || !map || !inGrid(map.grid, tile)) return
    if (placing && pick.type) {
      void save({ type: pick.type.key, tile, size: newSize, colors: pick.colors }, null).then((next) => {
        const made = next?.paint?.objects[next.paint.objects.length - 1]
        if (made) setSelected(made.id)
      })
      return
    }
    if (moving && object) { setMoving(false); void save({ tile }); return }
    // A click picks the landmark on that tile (the nearest one covering it)
    const [x, y] = tileCenter(map.grid, tile[0], tile[1])
    let best: string | null = null
    let bd = Infinity
    for (const o of objects) {
      const [ox, oy] = tileCenter(map.grid, o.tile[0], o.tile[1])
      const d = Math.hypot(x - ox, y - oy)
      if (d <= o.size * map.grid.size * 0.5 + 1 && d < bd) { bd = d; best = o.id }
    }
    select(best)
  }

  const kind: EntityKind = {
    noun: 'landmark',
    items: objects.map((o) => ({ id: o.id, name: o.name || typeOf(o.type)?.name || 'Landmark', hidden: Boolean((o as { hidden?: boolean }).hidden),
      renamable: true, note: typeOf(o.type)?.name, mark: <span className="color-dot" style={{ background: o.colors[0] }} /> })),
    selected,
    select,
    add: () => { setSelected(null); setMoving(false); setPlacing(!placing) },
    adding: placing,
    setHidden: (id, hidden) => void save({ hidden }, id),
    rename: (id, name) => void save({ name }, id),
    remove: (id) => { if (id === selected) select(null); void run('paint.objects.delete', { id }) },
    empty: 'Castles, villages, mines, ruins... ＋ then click tiles to place them.',
  }

  const sizes = [1, 2, 3, 4].map((n) => [String(n), n === 1 ? '1 tile' : `${n} tiles`] as const)
  const row = noGrid(map) ? <span className="map-tool-hint">Landmarks sit on tiles: pick a grid first (Grid tab)</span> : object ? (
    <>
      <ToolButton icon={<MoveIcon />} label="Move" text={moving ? 'Click a tile' : 'Move'} on={moving} onClick={() => setMoving(!moving)} />
      <MenuTool label="Size" value={String(object.size)} options={sizes} onChange={(v) => void save({ size: Number(v) })} />
      <ToolButton icon={<ReverseIcon />} label="Another look" text="Another look" title="The same landmark, drawn another way"
        onClick={() => void save({ variant: object.variant + 1 })} />
      <Sep />
      {(typeOf(object.type)?.roles ?? ['A', 'B', 'C']).map((role, i) => (
        <ColorTool key={`${object.id}-${i}`} label={role} value={object.colors[i]} onChange={(c) => {
          const next = [...object.colors] as Colors
          next[i] = c
          void save({ colors: next })
        }} />
      ))}
    </>
  ) : (
    <>
      <PainterBuilding />
      {placing && <span className="map-tool-hint">Click tiles to place (Esc: stop)</span>}
      {pick.head}
      <MenuTool label="Size" value={String(newSize)} options={sizes} onChange={(v) => setSize(Number(v))} />
      <Sep />
      {pick.colorTools}
    </>
  )

  const mapProps: Partial<MapViewProps> = active && map && !noGrid(map) ? {
    onTile, overlay: { selectedTile: object?.tile ?? null },
  } : {}
  return {
    kind, row, mapProps, armed: placing || moving,
    escape: () => { if (moving) setMoving(false); else if (placing) setPlacing(false); else if (selected) select(null); else return false; return true },
  }
}
