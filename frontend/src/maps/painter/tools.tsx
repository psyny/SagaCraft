/**
 * The map painter's tools on the map tools bar (plans 47, 48; the map editor only), one per layer, bottom to top:
 * - Terrain (grounds, water) and Scenery (forests, mountains, settlements): category ▾, type ▾ | brush size, brush
 *   shape ▾ (Scenery: density ▾, plan 56: how many of its sprites a tile, 1% to 100% of its category's most, the same
 *   scale for every type of a category; its hint: about how many a tile, the type's named densities: Village, Town,
 *   City; a type starts at its own) | Paint, Erase, Pick | the type's three colours, ↺ (the type's own). Drag on the
 *   map: the stroke shows at once and is saved when released.
 * - Boundaries (walls, fences, cliffs, hedges; plan 50): on the edges between tiles. category ▾, type ▾ | Paint, Erase,
 *   Pick, Turn (cliffs: the high ground on the other side) | colours, ↺. A stroke takes the edges it passes over: across
 *   the line between two tiles, that edge; along the grid's lines, a continuous wall. The edge under the pointer shows.
 *   (Roads open gates in them, rivers fall over them.)
 * - Effects (fireflies, mist, smoke, embers, leaves, bubbles...): a brush like Scenery's.
 * - Routes (roads and rivers): category ▾, type ▾ | Paint, Erase, Pick | Width ▾ (plan 56: 5% to 100%, 100% four times
 *   the type's own, 25% its own; routes of two widths meet smoothly; a route drawn into another leaves it as it is) |
 *   Flow ▾ (rivers) | colours,
 *   ↺. The link between
 *   two centres under the pointer shows: a click adds it (or, erasing, parts it); a drag goes on from tile to tile,
 *   each step joining (or parting) two tiles; a click on a tile's centre while erasing clears it. A river's flow
 *   (plan 52): Surrounding (as the rivers it joins; direction A when it joins none), Direction A (toward the south or
 *   east), Direction B (toward the north or west); painting over one sets its flow again.
 * - Features: ☰ (the layer's features: select, eye, rename, delete) and ＋ (click tiles to place them; Esc stops); the
 *   selected one: Move, size, another look, its colours; otherwise what the next one will be. A click on a feature's
 *   tile picks it.
 * Pick (the eyedropper) takes a tile's type and colours (and density, width), then Paint again. What can be painted (types, colours' roles
 * and defaults) comes from the map's style (painter/pack.ts).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { LocationMap, MapGrid, PaintKind, PaintLayer, PaintPack, PaintType } from '../../api/types'
import { brushTiles, edgeEnds, edgeNear, edgesAlong, inGrid, linkNear, tileCenter, type Edge, type Point, type Tile } from '../geometry'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import { BrushIcon, EraserIcon, MoveIcon, PipetteIcon, ReverseIcon } from '../toolbar/icons'
import { ColorTool, MenuTool, Sep, SliderTool, ToolButton, TrayTool, type EntityKind } from '../toolbar/widgets'
import { boundaryAt, edgeSlot, emptyPaint, rleDecode, stepsBetween, withConnections, withEdges, withTiles, withTurned, type PaintEntry, type RiverFlow } from './data'
import { typeOf } from './pack'
import { onPaintersBuilding, paintersBuilding } from './renderer'
import { mostPerTile, ownPerTile, sided } from './sprites'

type Colors = [string, string, string]

/** Picking a type: its category, the type in it, its colours (reset to the type's own when it changes). */
function useTypePick(pack: PaintPack | null, kinds: PaintKind[], layer: PaintLayer) {
  const types = pack?.types.filter((t) => kinds.includes(t.kind)) ?? []
  const categories = (pack?.categories ?? []).filter((c) => c.layer === layer && types.some((t) => t.category === c.key))
  const [category, setCategory] = useState<string | null>(null)
  const [typeKey, setTypeKey] = useState<string | null>(null)
  const [colors, setColors] = useState<Colors | null>(null)
  const cat = category ?? categories[0]?.key ?? ''
  const inCat = types.filter((t) => t.category === cat)
  const type = inCat.find((t) => t.key === typeKey) ?? inCat[0] ?? null
  const shown: Colors = colors ?? (type?.colors ?? ['#888888', '#444444', '#cccccc'])
  const pickType = (key: string) => { setTypeKey(key); setColors(null) }
  /** The eyedropper: this type in these colours (the type's own: no change of colours kept). */
  const take = (key: string, taken: string[]) => {
    const t = types.find((x) => x.key === key)
    if (!t) return false
    setCategory(t.category)
    setTypeKey(key)
    const own = t.colors.every((c, i) => c.toLowerCase() === (taken[i] ?? '').toLowerCase())
    setColors(own ? null : ([...taken] as Colors))
    return true
  }
  const head = pack && type ? (
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
      <ToolButton icon={<ReverseIcon />} label="The type's own colours" title={colors ? "Back to the type's own colours" : "These are the type's own colours"}
        disabled={!colors} onClick={() => setColors(null)} />
    </>
  )
  const entry: PaintEntry | null = type ? { type: type.key, colors: shown } : null
  return { type, colors: shown, entry, head, colorTools, take }
}

type Mode = 'paint' | 'erase' | 'pick'

/** Paint, Erase, Pick (the eyedropper: a click on a tile takes its type and colours, then Paint again). */
function ModeTools({ mode, setMode, paintTitle, eraseTitle, pickTitle = 'Pick: click a tile to paint with what is there' }: {
  mode: string; setMode: (m: Mode) => void; paintTitle?: string; eraseTitle?: string; pickTitle?: string }) {
  return (
    <>
      <ToolButton icon={<BrushIcon />} label="Paint" text="Paint" title={paintTitle} on={mode === 'paint'} onClick={() => setMode('paint')} />
      <ToolButton icon={<EraserIcon />} label="Erase" text="Erase" title={eraseTitle} on={mode === 'erase'} onClick={() => setMode('erase')} />
      <ToolButton icon={<PipetteIcon />} label="Pick" text="Pick" title={pickTitle} on={mode === 'pick'}
        onClick={() => setMode(mode === 'pick' ? 'paint' : 'pick')} />
    </>
  )
}

type EntryChannel = 'tiles' | 'scenery' | 'effects' | 'road_kinds' | 'river_kinds'

/** A tile's palette entry in a channel (null: nothing there). */
function entryAt(map: LocationMap, channel: EntryChannel, tile: Tile) {
  const paint = map.paint
  if (!paint) return null
  const { cols, rows } = map.grid
  const index = rleDecode(paint[channel] ?? '', cols * rows)[tile[1] * cols + tile[0]]
  return index ? paint.palette[index - 1] ?? null : null
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

interface ToolProps { map: LocationMap | null; run: MapCommand; setMap: (m: LocationMap) => void; active: boolean; pack: PaintPack | null }

/** The Density tray's hint (plan 56): the type's name for that density (`n` sprites a tile), about how many a tile. */
export function densityHint(type: PaintType | null, n: number): string {
  if (!type) return ''
  const named = (type.art.densities ?? []).filter(([from]) => from <= n + 1e-6).pop()?.[1]
  const many = n >= 1.5 ? `about ${Math.round(n)} a tile` : n >= 0.75 ? 'about one a tile' : n > 0 ? `about one every ${Math.round(1 / n)} tiles` : 'none'
  return named ? `${named} · ${many}` : many
}

// -- Terrain, Scenery and Effects: brushes ---------------------------------------------------------------------------

const BRUSHES = {
  terrain: { channel: 'tiles', kind: 'terrain', command: 'paint.tiles' },
  scenery: { channel: 'scenery', kind: 'scenery', command: 'paint.scenery' },
  effects: { channel: 'effects', kind: 'effect', command: 'paint.effects' },
} as const

function useBrushTool({ map, run, setMap, active, pack, layer }: ToolProps & { layer: keyof typeof BRUSHES }) {
  const { channel, kind, command } = BRUSHES[layer]
  const pick = useTypePick(pack, [kind], layer)
  const [size, setSize] = useState(2)
  // Scenery's density (plan 56): sprites a tile, chosen for a type (another type starts at its own)
  const [chosen, setChosen] = useState<{ type: string; perTile: number } | null>(null)
  const dense = layer === 'scenery'
  const hex = map?.grid.type === 'hex'
  const most = pick.type ? mostPerTile(pack, pick.type) : 100
  const perTile = chosen && chosen.type === pick.type?.key ? chosen.perTile : null
  const shownPerTile = perTile ?? (pick.type ? Math.min(most, Math.max(most / 100, ownPerTile(pick.type, hex))) : most / 4)
  const entry: PaintEntry | null = pick.entry && (dense && perTile !== null ? { ...pick.entry, per_tile: perTile } : pick.entry)
  const [shape, setShape] = useState<'round' | 'square'>('round')
  const [mode, setMode] = useState<Mode>('paint')
  const erase = mode === 'erase'
  const [hover, setHover] = useState<Tile[]>([])
  const stroke = useRef<{ base: LocationMap; tiles: Map<string, Tile> } | null>(null)

  const onTile: MapViewProps['onTile'] = (phase, tile, _point, event) => {
    if (!map || noGrid(map) || !entry) return
    if (mode === 'pick') {
      if (phase === 'move' && !event.buttons) setHover(inGrid(map.grid, tile) ? [tile] : [])
      if (phase !== 'down' || !inGrid(map.grid, tile)) return
      const found = entryAt(map, channel, tile)
      if (found && pick.take(found.type, found.colors)) {
        setMode('paint')
        if (dense) setChosen(found.per_tile !== undefined ? { type: found.type, perTile: found.per_tile } : null)
      }
      return
    }
    const tiles = inGrid(map.grid, tile) ? brushOf(map.grid, tile, size, shape) : []
    if (phase === 'move' && !event.buttons) { setHover(tiles); return }
    if (phase === 'down') stroke.current = { base: map, tiles: new Map() }
    const s = stroke.current
    if (!s) return
    if (phase !== 'up') {
      let grew = false
      for (const t of tiles) if (!s.tiles.has(`${t[0]},${t[1]}`)) { s.tiles.set(`${t[0]},${t[1]}`, t); grew = true }
      if (grew) setMap({ ...s.base, paint: withTiles(s.base.paint ?? emptyPaint(), s.base.grid, erase ? null : entry, [...s.tiles.values()], channel) })
      return
    }
    stroke.current = null
    const painted = [...s.tiles.values()]
    if (painted.length) {
      void run(command, { type: erase ? null : entry.type, colors: pick.colors, tiles: painted, ...(!erase && entry.per_tile !== undefined ? { per_tile: entry.per_tile } : {}) })
    }
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
      {dense && pick.type && (
        <SliderTool label="Density" value={Math.max(1, Math.round((shownPerTile / most) * 100))} min={1} max={100}
          onSave={(v) => setChosen({ type: pick.type!.key, perTile: Math.round((v * most) / 10) / 10 })}
          hint={(v) => densityHint(pick.type, (v * most) / 100)}
          title={`How many of its pictures stand on each tile: 100% is ${most} a tile for every type of this category`} />
      )}
      <Sep />
      <ModeTools mode={mode} setMode={setMode} />
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

export const useTerrainTool = (props: ToolProps) => useBrushTool({ ...props, layer: 'terrain' })
export const useSceneryTool = (props: ToolProps) => useBrushTool({ ...props, layer: 'scenery' })
/** Environmental effects (fireflies, mist, embers, leaves...): painted on tiles like scenery. */
export const useEffectsTool = (props: ToolProps) => useBrushTool({ ...props, layer: 'effects' })

// -- Boundaries: on the edges between tiles ---------------------------------------------------------------------------

type EdgeMode = Mode | 'turn'

/** Boundaries (walls, cliffs, hedges; plan 50): a stroke takes the edges it passes over (across the line between two
 *  tiles, or along the grid's lines); Turn puts cliffs' high ground on their other side. */
export function useBoundariesTool({ map, run, setMap, active, pack }: ToolProps) {
  const pick = useTypePick(pack, ['boundary'], 'boundaries')
  const [chosen, setMode] = useState<EdgeMode>('paint')
  const turns = sided(pick.type?.art.look)
  const mode: EdgeMode = chosen === 'turn' && !turns ? 'paint' : chosen // (Turn is cliffs' and slopes')
  const [hover, setHover] = useState<Edge | null>(null)
  const stroke = useRef<{ base: LocationMap; edges: Map<string, Edge>; last: Point } | null>(null)

  const onTile: MapViewProps['onTile'] = (phase, _tile, point, event) => {
    if (!map || noGrid(map) || !pick.entry) return
    const grid = map.grid
    const near = edgeNear(grid, point)
    const at = near && edgeSlot(grid, near) ? near : null
    if (phase === 'move' && !event.buttons) { setHover(at); return }
    if (mode === 'pick') {
      if (phase !== 'down' || !at || !map.paint) return
      const found = boundaryAt(map.paint, grid, at)
      if (found && pick.take(found.type, found.colors)) setMode('paint')
      return
    }
    if (phase === 'down') stroke.current = { base: map, edges: new Map(), last: point }
    const s = stroke.current
    if (!s) return
    if (phase !== 'up') {
      let grew = false
      for (const e of edgesAlong(grid, s.last, point)) {
        const slot = edgeSlot(grid, e)
        if (slot && !s.edges.has(`${slot[0]}:${slot[1]}`)) { s.edges.set(`${slot[0]}:${slot[1]}`, e); grew = true }
      }
      s.last = point
      setHover(at)
      if (grew) {
        const base = s.base.paint ?? emptyPaint()
        const edges = [...s.edges.values()]
        setMap({ ...s.base, paint: mode === 'turn' ? withTurned(base, grid, edges) : withEdges(base, grid, mode === 'erase' ? null : pick.entry, edges) })
      }
      return
    }
    stroke.current = null
    const edges = [...s.edges.values()]
    if (!edges.length) return
    if (mode === 'turn') void run('paint.boundaries.turn', { edges })
    else void run('paint.boundaries', { type: mode === 'erase' ? null : pick.entry.type, colors: pick.colors, edges })
  }

  const row = noGrid(map) ? <span className="map-tool-hint">Boundaries stand between tiles: pick a grid first (Grid tab)</span> : (
    <>
      <PainterBuilding />
      {pick.head}
      <Sep />
      <ModeTools mode={mode} setMode={setMode} paintTitle="Drag across the line between two tiles, or along the grid's lines for a long wall"
        eraseTitle="Drag over boundaries to take them away" pickTitle="Pick: click a boundary to paint with it" />
      {turns && (
        <ToolButton icon={<ReverseIcon />} label="Turn" text="Turn" title="Turn: drag over cliffs and slopes to put their high ground on the other side"
          on={mode === 'turn'} onClick={() => setMode(mode === 'turn' ? 'paint' : 'turn')} />
      )}
      <Sep />
      {pick.colorTools}
    </>
  )

  const ends = hover && map ? edgeEnds(map.grid, hover[0], hover[1], hover[2]) : null
  const mapProps: Partial<MapViewProps> = active && map && !noGrid(map) ? {
    onTile, overlay: { preview: { tiles: [], edges: ends ? [ends] : [], tone: mode === 'erase' ? 'unknown' : 'select' } },
  } : {}
  return { row, mapProps, armed: active, escape: () => false }
}

// -- Routes: roads and rivers -----------------------------------------------------------------------------------------

export function useRoutesTool({ map, run, setMap, active, pack }: ToolProps) {
  const pick = useTypePick(pack, ['road', 'river'], 'routes')
  const [mode, setMode] = useState<Mode>('paint')
  const erase = mode === 'erase'
  const [hover, setHover] = useState<{ tiles: Tile[]; link: [Point, Point] | null }>({ tiles: [], link: null })
  const [flow, setFlow] = useState<RiverFlow>('join')
  const [width, setWidth] = useState(1) // plan 56: times the type's own (the tray shows it as 25%; 100% is 4 times)
  const stroke = useRef<{ base: LocationMap; steps: Tile[] } | null>(null)
  const channel: 'road' | 'river' = pick.type?.kind === 'river' ? 'river' : 'road'
  const entry: PaintEntry | null = pick.entry && { ...pick.entry, width }

  const onTile: MapViewProps['onTile'] = (phase, tile, point, event) => {
    if (!map || noGrid(map) || !entry) return
    // under the pointer: the link between two tiles' centres, or (near a centre) the tile
    const link = linkNear(map.grid, point)
    setHover(link ? { tiles: [], link: [tileCenter(map.grid, ...link[0]), tileCenter(map.grid, ...link[1])] }
      : { tiles: inGrid(map.grid, tile) ? [tile] : [], link: null })
    if (phase === 'move' && !event.buttons) return
    if (mode === 'pick') {
      if (phase !== 'down' || !inGrid(map.grid, tile)) return
      // the tile's road or river (the kind being painted first)
      const road = entryAt(map, 'road_kinds', tile), river = entryAt(map, 'river_kinds', tile)
      const found = channel === 'river' ? river ?? road : road ?? river
      if (found && pick.take(found.type, found.colors)) { setMode('paint'); setWidth(found.width ?? 1) }
      return
    }
    if (phase === 'down') {
      // on a link: that link (a click is enough); near a tile's centre: a stroke from it
      const steps: Tile[] = link ? [link[0], link[1]] : inGrid(map.grid, tile) ? [tile] : []
      if (!steps.length) return
      stroke.current = { base: map, steps }
      if (erase || steps.length > 1) setMap({ ...map, paint: withConnections(map.paint ?? emptyPaint(), map.grid, channel, erase ? null : entry, steps, erase, flow) })
      return
    }
    const s = stroke.current
    if (!s) return
    const last = s.steps[s.steps.length - 1]
    if (phase === 'move' && inGrid(map.grid, tile) && (tile[0] !== last[0] || tile[1] !== last[1])) {
      s.steps.push(...stepsBetween(map.grid, last, tile, (t) => tileCenter(map.grid, t[0], t[1])).filter((t) => inGrid(map.grid, t)))
      setMap({ ...s.base, paint: withConnections(s.base.paint ?? emptyPaint(), s.base.grid, channel, entry, s.steps, erase, flow) })
      return
    }
    if (phase === 'up') {
      stroke.current = null
      if (s.steps.length > 1 || erase) {
        void run('paint.connect', { channel, type: erase ? null : entry.type, colors: pick.colors, tiles: s.steps, erase,
          ...(channel === 'river' ? { flow } : {}), ...(erase ? {} : { width }) })
      }
    }
  }

  const row = noGrid(map) ? <span className="map-tool-hint">Routes join tiles: pick a grid first (Grid tab)</span> : (
    <>
      <PainterBuilding />
      {pick.head}
      <Sep />
      <ModeTools mode={mode} setMode={setMode} paintTitle="Click the line between two tiles, or drag from tile to tile"
        eraseTitle="Click a link or drag along it to part tiles; click a tile's centre to clear it" />
      <SliderTool label="Width" value={Math.round(width * 25)} min={5} max={100} onSave={(v) => setWidth(v / 25)}
        hint="25% is the type's own. Routes of two widths meet smoothly." />
      {channel === 'river' && (
        <MenuTool label="Flow" value={flow} onChange={setFlow}
          options={[['join', 'Surrounding'], ['a', 'Direction A (south, east)'], ['b', 'Direction B (north, west)']] as const} />
      )}
      <Sep />
      {pick.colorTools}
    </>
  )

  const mapProps: Partial<MapViewProps> = active && map && !noGrid(map) ? {
    onTile, overlay: { preview: { tiles: hover.tiles, edges: hover.link ? [hover.link] : [], tone: erase ? 'unknown' : 'select' } },
  } : {}
  return { row, mapProps, armed: active, escape: () => false }
}

// -- Features -------------------------------------------------------------------------------------------------------

export function useFeaturesTool({ map, run, active, pack }: Omit<ToolProps, 'setMap'>) {
  const pick = useTypePick(pack, ['feature'], 'features')
  const [size, setSize] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)
  const [moving, setMoving] = useState(false)
  const features = map?.paint?.features ?? []
  const feature = features.find((f) => f.id === selected) ?? null
  const newSize = size ?? pick.type?.size ?? 1
  const select = (id: string | null) => { setSelected(id); setMoving(false); setPlacing(false) }
  const save = (changes: Record<string, unknown>, id = selected) => run('paint.features.save', { feature: { ...(id ? { id } : {}), ...changes } })

  const onTile: MapViewProps['onTile'] = (phase, tile) => {
    if (phase !== 'down' || !map || !inGrid(map.grid, tile)) return
    if (placing && pick.type) {
      void save({ type: pick.type.key, tile, size: newSize, colors: pick.colors }, null).then((next) => {
        const made = next?.paint?.features[next.paint.features.length - 1]
        if (made) setSelected(made.id)
      })
      return
    }
    if (moving && feature) { setMoving(false); void save({ tile }); return }
    // A click picks the feature on that tile (the nearest one covering it)
    const [x, y] = tileCenter(map.grid, tile[0], tile[1])
    let best: string | null = null
    let bd = Infinity
    for (const f of features) {
      const [fx, fy] = tileCenter(map.grid, f.tile[0], f.tile[1])
      const d = Math.hypot(x - fx, y - fy)
      if (d <= f.size * map.grid.size * 0.5 + 1 && d < bd) { bd = d; best = f.id }
    }
    select(best)
  }

  const nameOf = (key: string) => typeOf(pack, key)?.name
  const kind: EntityKind = {
    noun: 'feature',
    items: features.map((f) => ({ id: f.id, name: f.name || nameOf(f.type) || 'Feature', hidden: Boolean(f.hidden),
      renamable: true, note: nameOf(f.type), mark: <span className="color-dot" style={{ background: f.colors[0] }} /> })),
    selected,
    select,
    add: () => { setSelected(null); setMoving(false); setPlacing(!placing) },
    adding: placing,
    setHidden: (id, hidden) => void save({ hidden }, id),
    rename: (id, name) => void save({ name }, id),
    remove: (id) => { if (id === selected) select(null); void run('paint.features.delete', { id }) },
    empty: 'Towers, windmills, portals, birds, clouds... ＋ then click tiles to place them.',
  }

  const sizes = [1, 2, 3, 4].map((n) => [String(n), n === 1 ? '1 tile' : `${n} tiles`] as const)
  const featureType = feature ? typeOf(pack, feature.type) : null
  const row = noGrid(map) ? <span className="map-tool-hint">Features sit on tiles: pick a grid first (Grid tab)</span> : feature ? (
    <>
      <ToolButton icon={<MoveIcon />} label="Move" text={moving ? 'Click a tile' : 'Move'} on={moving} onClick={() => setMoving(!moving)} />
      <MenuTool label="Size" value={String(feature.size)} options={sizes} onChange={(v) => void save({ size: Number(v) })} />
      <ToolButton icon={<ReverseIcon />} label="Another look" text="Another look" title="The same feature, drawn another way"
        onClick={() => void save({ variant: feature.variant + 1 })} />
      <Sep />
      {(featureType?.roles ?? ['A', 'B', 'C']).map((role, i) => (
        <ColorTool key={`${feature.id}-${i}`} label={role} value={feature.colors[i]} onChange={(c) => {
          const next = [...feature.colors] as Colors
          next[i] = c
          void save({ colors: next })
        }} />
      ))}
      <ToolButton icon={<ReverseIcon />} label="The type's own colours" disabled={!featureType || featureType.colors.every((c, i) => c === feature.colors[i])}
        onClick={() => featureType && void save({ colors: featureType.colors })} />
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
    onTile, overlay: { selectedTile: feature?.tile ?? null },
  } : {}
  return {
    kind, row, mapProps, armed: placing || moving,
    escape: () => { if (moving) setMoving(false); else if (placing) setPlacing(false); else if (selected) select(null); else return false; return true },
  }
}
