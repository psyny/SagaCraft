/**
 * A painting's data for the GPU (plans 47, 48): the RLE channels decoded (domain/map_paint.py: base64 runs, each the
 * run's length - 1 in 7-bit groups then the value) into two per-tile textures and the palette (and the editor's
 * previews of strokes, below; plan 50: boundaries on the edges between tiles):
 * - tiles (RGBA per tile): terrain palette index + 1, road connections, river connections, river out bits,
 * - kinds (RGBA per tile): road palette index + 1, river palette index + 1, a per-tile random byte, the directions in
 *   which its river falls over a boundary (plan 51: the river doesn't wobble there, its waterfall on its centre),
 * - palette (256 × PALETTE_ROWS, RGBA), entry i in column i + 1: row 0 what it is (R: 1 terrain, 2 water, 3 road,
 *   4 river, 5 scenery; G: terrain's patches), rows 1-3 its colours, rows 4-7 its art's numbers for the shader
 *   (terrain: two patterns, each kind, colour, scale, density | size, strength; water: depth, waves; routes: look, width
 *   (the type's times the entry's, plan 56; in 0.4 of a tile), wobble). The sprite pass reads boundaries' and effects'
 *   colours from it too. See `encodeArt`.
 */
import type { MapGrid, MapPaint, PaintPack, PaintType } from '../../api/types'
import type { Edge } from '../geometry'
import { typeOf } from './pack'

/** Decodes a channel into `count` bytes (missing ones are 0). */
export function rleDecode(text: string, count: number): Uint8Array {
  const out = new Uint8Array(count)
  if (!text) return out
  let raw: string
  try { raw = atob(text) } catch { return out }
  let at = 0
  let i = 0
  while (i < raw.length && at < count) {
    let run = 0
    let shift = 0
    while (i < raw.length && raw.charCodeAt(i) & 0x80) {
      run |= (raw.charCodeAt(i) & 0x7f) << shift
      shift += 7
      i += 1
    }
    if (i + 1 >= raw.length) break
    run |= raw.charCodeAt(i) << shift
    const value = raw.charCodeAt(i + 1)
    const end = Math.min(count, at + run + 1)
    if (value) out.fill(value, at, end)
    at = end
    i += 2
  }
  return out
}

/** Encodes bytes the same way (tests; the editor's local previews). */
export function rleEncode(values: ArrayLike<number>): string {
  let any = false
  const bytes: number[] = []
  for (let i = 0; i < values.length;) {
    const v = values[i]
    if (v) any = true
    let j = i + 1
    while (j < values.length && values[j] === v) j += 1
    let run = j - i - 1
    while (run >= 0x80) { bytes.push((run & 0x7f) | 0x80); run = Math.floor(run / 128) }
    bytes.push(run, v)
    i = j
  }
  return any ? btoa(String.fromCharCode(...bytes)) : ''
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) || 0)

export interface PaintTextures {
  cols: number
  rows: number
  tiles: Uint8Array
  kinds: Uint8Array
  palette: Uint8Array
}

export const PALETTE_ROWS = 8

/** The shader's numbers for patterns and route looks (painter/shader.ts). */
export const PATTERNS: Record<string, number> = { strokes: 1, stipple: 2, cracks: 3, flecks: 4, drifts: 5, sparkle: 6, puddles: 7, reeds: 8, fields: 9, tufts: 10,
  dunes: 11, cobbles: 12, tiles: 13, bricks: 14, lava: 15, ice: 16 }
export const LOOKS: Record<string, number> = { dirt: 1, paved: 2, trail: 3, highway: 4, rail: 5, light: 6, river: 7, lava: 8 }
/** Liquids' looks (painter/shader.ts water()). */
export const LIQUIDS: Record<string, number> = { ocean: 0, lake: 1, lava: 2 }
const ROLES: Record<string, number> = { a: 0, b: 1, c: 2 }

const byte = (v: number | undefined, scale = 1) => Math.max(0, Math.min(255, Math.round(((v ?? 0) / scale) * 255)))

/** The most a route's width can be in the palette (tiles; painter/shader.ts reads it so). */
export const ROUTE_WIDTH_SCALE = 0.4

/** A type's art as the shader reads it: row 0 (what, patches) and rows 4-7 (see the top); `width`: the entry's. */
export function encodeArt(type: PaintType | null, width = 1): { head: number[]; rows: number[][] } {
  const rows = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
  if (!type) return { head: [0, 0, 0, 255], rows }
  const art = type.art
  if (type.kind === 'terrain' && art.fluid) {
    rows[0] = [byte(art.depth ?? 0.85), byte(art.waves ?? 0.3), LIQUIDS[art.liquid ?? 'ocean'] ?? 0, 255]
    return { head: [2, 0, 0, 255], rows }
  }
  if (type.kind === 'terrain') {
    ;(art.patterns ?? []).slice(0, 2).forEach((pat, i) => {
      rows[i * 2] = [PATTERNS[pat.kind] ?? 0, ROLES[pat.color] ?? 1, byte(pat.scale), byte(pat.density)]
      rows[i * 2 + 1] = [byte(pat.size), byte(pat.strength ?? 1), 0, 255]
    })
    return { head: [1, byte(art.patches ?? 0.6), 0, 255], rows }
  }
  if (type.kind === 'road' || type.kind === 'river') {
    rows[0] = [LOOKS[art.look ?? ''] ?? 1, byte((art.width ?? 0.03) * width, ROUTE_WIDTH_SCALE), byte(art.wobble ?? 0), 255]
    return { head: [type.kind === 'road' ? 3 : 4, 0, 0, 255], rows }
  }
  if (type.kind === 'scenery') return { head: [5, 0, 0, 255], rows }
  if (type.kind === 'boundary') return { head: [6, 0, 0, 255], rows }
  if (type.kind === 'effect') return { head: [7, 0, 0, 255], rows }
  return { head: [0, 0, 0, 255], rows }
}

/** The painting as texture bytes for the grid it's on (its types' art from the style's pack). */
export function paintTextures(paint: MapPaint, grid: MapGrid, pack: PaintPack | null): PaintTextures {
  const { cols, rows } = grid
  const n = cols * rows
  const channels = ['tiles', 'roads', 'rivers', 'river_out', 'road_kinds', 'river_kinds'] as const
  const [terrain, roads, rivers, out, roadKinds, riverKinds] = channels.map((c) => rleDecode(paint[c] ?? '', n))
  const falls = riverFalls(paint, grid, pack)
  const tiles = new Uint8Array(n * 4)
  const kinds = new Uint8Array(n * 4)
  for (let i = 0; i < n; i += 1) {
    tiles[i * 4] = terrain[i]
    tiles[i * 4 + 1] = roads[i]
    tiles[i * 4 + 2] = rivers[i]
    tiles[i * 4 + 3] = out[i]
    kinds[i * 4] = roadKinds[i]
    kinds[i * 4 + 1] = riverKinds[i]
    kinds[i * 4 + 2] = (Math.imul(i + 1, 2654435761) >>> 24) & 0xff // a stable random byte per tile (variation)
    kinds[i * 4 + 3] = falls[i]
  }
  const palette = new Uint8Array(256 * PALETTE_ROWS * 4)
  paint.palette.forEach((e, i) => {
    const col = i + 1
    const { head, rows: art } = encodeArt(typeOf(pack, e.type), e.width ?? 1)
    palette.set(head, col * 4)
    art.forEach((row, r) => palette.set(row, ((4 + r) * 256 + col) * 4))
    e.colors.forEach((c, k) => {
      const [r, g, b] = hex(c)
      const at = ((k + 1) * 256 + col) * 4
      palette[at] = r
      palette[at + 1] = g
      palette[at + 2] = b
      palette[at + 3] = 255
    })
  })
  return { cols, rows, tiles, kinds, palette }
}

/** Boundaries' channels (plan 50): per tile, the boundary on each of its own edges. */
export const BOUND_CHANNELS = ['bounds_0', 'bounds_1', 'bounds_2'] as const

/** Is anything painted? */
export const hasPaint = (paint: MapPaint | null | undefined): paint is MapPaint =>
  Boolean(paint && (paint.features?.length || paint.tiles || paint.scenery || BOUND_CHANNELS.some((c) => paint[c]) || paint.effects
    || paint.roads || paint.rivers))

// -- the editor's previews: the same rules as domain/map_paint.py, applied at once while a stroke goes on -----------

/** Directions from a tile (square: E SE S SW W NW N NE; hex, odd rows shifted right: E SE SW W NW NE). */
export function directions(grid: MapGrid, row: number): [number, number][] {
  if (grid.type !== 'hex') return [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
  const s = ((row % 2) + 2) % 2
  return [[1, 0], [s, 1], [s - 1, 1], [-1, 0], [s - 1, -1], [s, -1]]
}

/** A tile's own edges (plan 50: every edge between two tiles is kept on one of them): the directions toward them, square
 *  grids E, S (diagonal neighbours share no edge), hex grids E, SE, SW. Mirrors domain/map_paint.py `own_edges`. */
export const ownEdges = (grid: MapGrid): number[] => (grid.type === 'hex' ? [0, 1, 2] : [0, 2])

/** Where an edge is kept: its tile's index, which of that tile's own edges, whether that tile is the edge's given one
 *  (null: no edge there, off the grid or a square grid's diagonal). Mirrors map_paint.edge_slot. */
export function edgeSlot(grid: MapGrid, [c, r, d]: Edge): [number, number, boolean] | null {
  const dirs = directions(grid, r)
  const on = (cc: number, rr: number) => cc >= 0 && rr >= 0 && cc < grid.cols && rr < grid.rows
  if (d < 0 || d >= dirs.length || !on(c, r)) return null
  const nc = c + dirs[d][0], nr = r + dirs[d][1]
  if (!on(nc, nr)) return null
  const own = ownEdges(grid)
  if (own.includes(d)) return [r * grid.cols + c, own.indexOf(d), true]
  const back = (d + dirs.length / 2) % dirs.length
  return own.includes(back) ? [nr * grid.cols + nc, own.indexOf(back), false] : null
}

/** The boundary on an edge (its palette entry; null: none). */
export function boundaryAt(paint: MapPaint, grid: MapGrid, edge: Edge) {
  const slot = edgeSlot(grid, edge)
  if (!slot) return null
  const index = rleDecode(paint[BOUND_CHANNELS[slot[1]]] ?? '', grid.cols * grid.rows)[slot[0]]
  return index ? paint.palette[index - 1] ?? null : null
}

/** What a palette entry is: a type in its colours, at its density (plan 56: sprites a tile, none: the type's own) or
 *  width (times the type's own, 1 left out). */
export type PaintEntry = { type: string; colors: [string, string, string]; per_tile?: number; width?: number }

/** A width as kept: by hundredths, none when it's the type's own (map_paint._width). */
export const widthOf = (v: number | undefined) => {
  const r = v === undefined ? 1 : Math.round(v * 100) / 100
  return r === 1 ? undefined : r
}

/** A density as kept: sprites a tile, by tenths (map_paint._per_tile). */
export const perTileOf = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 10) / 10)

/** The palette index + 1 of an entry (added to a copy of the palette if new). */
function entryOf(paint: MapPaint, entry: PaintEntry): [MapPaint['palette'], number] {
  const { type, colors } = entry
  const perTile = perTileOf(entry.per_tile), width = widthOf(entry.width)
  const i = paint.palette.findIndex((e) => e.type === type && e.colors.every((c, k) => c.toLowerCase() === colors[k].toLowerCase())
    && e.per_tile === perTile && e.width === width)
  if (i >= 0) return [paint.palette, i + 1]
  return [[...paint.palette, { type, colors, ...(perTile !== undefined ? { per_tile: perTile } : {}), ...(width ? { width } : {}) }],
    paint.palette.length + 1]
}

/** Terrain (or scenery, effects) on tiles (null: erased). */
export function withTiles(paint: MapPaint, grid: MapGrid, entry: PaintEntry | null, tiles: [number, number][],
  channel: 'tiles' | 'scenery' | 'effects' = 'tiles'): MapPaint {
  const n = grid.cols * grid.rows
  const values = rleDecode(paint[channel] ?? '', n)
  let palette = paint.palette
  let index = 0
  if (entry) [palette, index] = entryOf(paint, channel === 'scenery' ? entry : { type: entry.type, colors: entry.colors })
  for (const [c, r] of tiles) if (c >= 0 && r >= 0 && c < grid.cols && r < grid.rows) values[r * grid.cols + c] = index
  return { ...paint, palette, [channel]: rleEncode(values) }
}

/** A boundary on edges (null: erased); one that changes has the edge's first tile as its high side (map_paint.paint_edges). */
export function withEdges(paint: MapPaint, grid: MapGrid, entry: PaintEntry | null, edges: Edge[]): MapPaint {
  const n = grid.cols * grid.rows
  const bounds = BOUND_CHANNELS.map((c) => rleDecode(paint[c] ?? '', n))
  const sides = rleDecode(paint.bound_sides ?? '', n)
  let palette = paint.palette
  let index = 0
  if (entry) [palette, index] = entryOf(paint, { type: entry.type, colors: entry.colors })
  for (const edge of edges) {
    const slot = edgeSlot(grid, edge)
    if (!slot) continue
    const [at, k] = slot
    if (bounds[k][at] !== index) sides[at] &= ~(1 << k)
    bounds[k][at] = index
  }
  return { ...paint, palette, bounds_0: rleEncode(bounds[0]), bounds_1: rleEncode(bounds[1]), bounds_2: rleEncode(bounds[2]),
    bound_sides: rleEncode(sides) }
}

/** Boundaries on these edges turned the other way (each once: a cliff's high side, the other tile). */
export function withTurned(paint: MapPaint, grid: MapGrid, edges: Edge[]): MapPaint {
  const n = grid.cols * grid.rows
  const bounds = BOUND_CHANNELS.map((c) => rleDecode(paint[c] ?? '', n))
  const sides = rleDecode(paint.bound_sides ?? '', n)
  const done = new Set<string>()
  for (const edge of edges) {
    const slot = edgeSlot(grid, edge)
    if (!slot || done.has(`${slot[0]}:${slot[1]}`)) continue
    done.add(`${slot[0]}:${slot[1]}`)
    if (bounds[slot[1]][slot[0]]) sides[slot[0]] ^= 1 << slot[1]
  }
  return { ...paint, bound_sides: rleEncode(sides) }
}

/** Where rivers fall over boundaries (plan 51): per tile, a bit per direction in which its river crosses an edge with a
 *  boundary that rivers fall over (not where a road crosses too), on both tiles of the edge. The sprites' waterfalls
 *  follow the same rule (painter/sprites.ts). */
export function riverFalls(paint: MapPaint, grid: MapGrid, pack: PaintPack | null): Uint8Array {
  const n = grid.cols * grid.rows
  const out = new Uint8Array(n)
  if (!pack || !BOUND_CHANNELS.some((c) => paint[c]) || !paint.rivers) return out
  const rivers = rleDecode(paint.rivers, n)
  const roads = rleDecode(paint.roads ?? '', n)
  const full = directions(grid, 0).length
  ownEdges(grid).forEach((d, k) => {
    const bounds = rleDecode(paint[BOUND_CHANNELS[k]] ?? '', n)
    for (let i = 0; i < n; i += 1) {
      if (!bounds[i] || !(rivers[i] & (1 << d)) || roads[i] & (1 << d)) continue
      const type = typeOf(pack, paint.palette[bounds[i] - 1]?.type ?? '')
      if (!type || type.kind !== 'boundary' || type.art.falls === false) continue
      const c = i % grid.cols, r = Math.floor(i / grid.cols)
      const [dc, dr] = directions(grid, r)[d]
      if (c + dc < 0 || r + dr < 0 || c + dc >= grid.cols || r + dr >= grid.rows) continue
      out[i] |= 1 << d
      out[(r + dr) * grid.cols + c + dc] |= 1 << ((d + full / 2) % full)
    }
  })
  return out
}

/** A river's flow (plan 52): toward the south or east (a), the other way (b), or as the rivers it joins (join). */
export type RiverFlow = 'join' | 'a' | 'b'

/** Joining rivers: which way a new link from tile i to its neighbour j (direction d) flows to go on as the rivers at
 *  its ends do (true: from i to j; null: nothing says). Mirrors map_paint._flows_on. */
function flowsOn(masks: Uint8Array, out: Uint8Array, i: number, j: number, d: number, full: number): boolean | null {
  const back = (d + full / 2) % full
  const others = (t: number, skip: number) => Array.from({ length: full }, (_, k) => k).filter((k) => k !== skip && masks[t] & (1 << k))
  const iIn = others(i, d).some((k) => !(out[i] & (1 << k))), iOut = others(i, d).some((k) => out[i] & (1 << k))
  const jIn = others(j, back).some((k) => !(out[j] & (1 << k))), jOut = others(j, back).some((k) => out[j] & (1 << k))
  const forward = iIn || jOut, backward = jIn || iOut
  return forward === backward ? null : forward
}

/** Roads or rivers along tiles in order (each step to a neighbour joins them, or parts them when erasing; erasing on
 *  one tile alone clears it). A river flows as `flow` says, each step on its own; the stroke's ends on a route going on
 *  elsewhere keep their kind (plan 56; map_paint.connect). */
export function withConnections(paint: MapPaint, grid: MapGrid, channel: 'road' | 'river', entry: PaintEntry | null,
  steps: [number, number][], erase: boolean, flow: RiverFlow = 'join'): MapPaint {
  const n = grid.cols * grid.rows
  const masks = rleDecode(paint[`${channel}s`], n)
  const kinds = rleDecode(paint[`${channel}_kinds`], n)
  const out = channel === 'river' ? rleDecode(paint.river_out, n) : null
  let palette = paint.palette
  let index = 0
  if (!erase && entry) [palette, index] = entryOf(paint, { type: entry.type, colors: entry.colors, width: entry.width })
  const full = directions(grid, 0).length
  const opposite = (d: number) => (d + full / 2) % full
  const cell = ([c, r]: [number, number]) => r * grid.cols + c
  const on = ([c, r]: [number, number]) => c >= 0 && r >= 0 && c < grid.cols && r < grid.rows
  const tiles = steps.filter(on)
  const dirTo = (a: [number, number], b: [number, number]) => directions(grid, a[1]).findIndex(([dc, dr]) => a[0] + dc === b[0] && a[1] + dr === b[1])
  const kept = new Set<number>() // the stroke's ends on a route going on elsewhere keep their kind
  if (!erase && tiles.length > 1) {
    for (const [end, next] of [[tiles[0], tiles[1]], [tiles[tiles.length - 1], tiles[tiles.length - 2]]] as const) {
      const d = dirTo(end, next)
      if (d >= 0 && kinds[cell(end)] && masks[cell(end)] & ~(1 << d)) kept.add(cell(end))
    }
  }
  if (erase && tiles.length === 1) {
    const [c, r] = tiles[0]
    const i = cell(tiles[0])
    directions(grid, r).forEach(([dc, dr], d) => {
      const nb: [number, number] = [c + dc, r + dr]
      if (!(masks[i] & (1 << d)) || !on(nb)) return
      const j = cell(nb)
      masks[j] &= ~(1 << opposite(d))
      if (out) out[j] &= ~(1 << opposite(d))
      if (!masks[j]) kinds[j] = 0
    })
    masks[i] = 0
    kinds[i] = 0
    if (out) out[i] = 0
  }
  for (let k = 0; k + 1 < tiles.length; k += 1) {
    const [a, b] = [tiles[k], tiles[k + 1]]
    const d = dirTo(a, b)
    if (d < 0) continue
    const i = cell(a)
    const j = cell(b)
    if (erase) {
      masks[i] &= ~(1 << d)
      masks[j] &= ~(1 << opposite(d))
      if (out) { out[i] &= ~(1 << d); out[j] &= ~(1 << opposite(d)) }
      if (!masks[i]) kinds[i] = 0
      if (!masks[j]) kinds[j] = 0
    } else {
      masks[i] |= 1 << d
      masks[j] |= 1 << opposite(d)
      if (!kept.has(i)) kinds[i] = index
      if (!kept.has(j)) kinds[j] = index
      if (out) {
        const joined = flow === 'join' ? flowsOn(masks, out, i, j, d, full) : null
        const forward = joined ?? ((d < full / 2) === (flow !== 'b'))
        if (forward) { out[i] |= 1 << d; out[j] &= ~(1 << opposite(d)) }
        else { out[j] |= 1 << opposite(d); out[i] &= ~(1 << d) }
      }
    }
  }
  return { ...paint, palette, [`${channel}s`]: rleEncode(masks), [`${channel}_kinds`]: rleEncode(kinds), ...(out ? { river_out: rleEncode(out) } : {}) }
}

/** The tiles from a to b, each a neighbour of the last (a stroke that skipped tiles while the pointer moved fast). */
export function stepsBetween(grid: MapGrid, a: [number, number], b: [number, number], center: (t: [number, number]) => [number, number]): [number, number][] {
  const out: [number, number][] = []
  let cur = a
  const [bx, by] = center(b)
  for (let guard = 0; guard < 64 && (cur[0] !== b[0] || cur[1] !== b[1]); guard += 1) {
    let best: [number, number] = cur
    let bd = Infinity
    for (const [dc, dr] of directions(grid, cur[1])) {
      const nb: [number, number] = [cur[0] + dc, cur[1] + dr]
      const [x, y] = center(nb)
      const d = Math.hypot(x - bx, y - by)
      if (d < bd) { bd = d; best = nb }
    }
    cur = best
    out.push(cur)
  }
  return out
}

export const emptyPaint = (): MapPaint => ({ palette: [], tiles: '', scenery: '', bounds_0: '', bounds_1: '', bounds_2: '', bound_sides: '',
  effects: '', roads: '', road_kinds: '', rivers: '', river_kinds: '', river_out: '', features: [] })
