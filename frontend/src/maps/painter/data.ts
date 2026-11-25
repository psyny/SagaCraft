/**
 * A painting's data for the GPU (plans 47, 48): the RLE channels decoded (domain/map_paint.py: base64 runs, each the
 * run's length - 1 in 7-bit groups then the value) into two per-tile textures and the palette:
 * - tiles (RGBA per tile): terrain palette index + 1, road connections, river connections, river out bits,
 * - kinds (RGBA per tile): road palette index + 1, river palette index + 1, a per-tile random byte, scenery index + 1,
 * - palette (256 × PALETTE_ROWS, RGBA), entry i in column i + 1: row 0 what it is (R: 1 terrain, 2 water, 3 road,
 *   4 river, 5 scenery; G: terrain's patches), rows 1-3 its colours, rows 4-7 its art's numbers for the shader
 *   (terrain: two patterns, each kind, colour, scale, density | size, strength; water: depth, waves; routes: look, width,
 *   wobble; scenery: walls, inset, width, gaps). See `encodeArt`.
 */
import type { MapGrid, MapPaint, PaintPack, PaintType } from '../../api/types'
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
  dunes: 11, cobbles: 12, tiles: 13, bricks: 14, lava: 15 }
export const LOOKS: Record<string, number> = { dirt: 1, paved: 2, trail: 3, highway: 4, rail: 5, light: 6, river: 7, lava: 8 }
/** Liquids' looks (painter/shader.ts water()). */
export const LIQUIDS: Record<string, number> = { ocean: 0, lake: 1, lava: 2 }
const ROLES: Record<string, number> = { a: 0, b: 1, c: 2 }

const byte = (v: number | undefined, scale = 1) => Math.max(0, Math.min(255, Math.round(((v ?? 0) / scale) * 255)))

/** A type's art as the shader reads it: row 0 (what, patches) and rows 4-7 (see the top). */
export function encodeArt(type: PaintType | null): { head: number[]; rows: number[][] } {
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
    rows[0] = [LOOKS[art.look ?? ''] ?? 1, byte(art.width ?? 0.03, 0.2), byte(art.wobble ?? 0), 255]
    return { head: [type.kind === 'road' ? 3 : 4, 0, 0, 255], rows }
  }
  if (type.kind === 'scenery') {
    const w = art.walls
    rows[0] = w ? [255, byte(w.inset, 0.5), byte(w.width, 0.2), byte(w.gaps ?? 0)] : [0, 0, 0, 0]
    return { head: [5, 0, 0, 255], rows }
  }
  return { head: [0, 0, 0, 255], rows }
}

/** The painting as texture bytes for the grid it's on (its types' art from the style's pack). */
export function paintTextures(paint: MapPaint, grid: MapGrid, pack: PaintPack | null): PaintTextures {
  const { cols, rows } = grid
  const n = cols * rows
  const channels = ['tiles', 'roads', 'rivers', 'river_out', 'road_kinds', 'river_kinds', 'scenery'] as const
  const [terrain, roads, rivers, out, roadKinds, riverKinds, scenery] = channels.map((c) => rleDecode(paint[c] ?? '', n))
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
    kinds[i * 4 + 3] = scenery[i]
  }
  const palette = new Uint8Array(256 * PALETTE_ROWS * 4)
  paint.palette.forEach((e, i) => {
    const col = i + 1
    const { head, rows: art } = encodeArt(typeOf(pack, e.type))
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

/** Is anything painted? */
export const hasPaint = (paint: MapPaint | null | undefined): paint is MapPaint =>
  Boolean(paint && (paint.features?.length || paint.tiles || paint.scenery || paint.roads || paint.rivers))

// -- the editor's previews: the same rules as domain/map_paint.py, applied at once while a stroke goes on -----------

/** Directions from a tile (square: E SE S SW W NW N NE; hex, odd rows shifted right: E SE SW W NW NE). */
export function directions(grid: MapGrid, row: number): [number, number][] {
  if (grid.type !== 'hex') return [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
  const s = ((row % 2) + 2) % 2
  return [[1, 0], [s, 1], [s - 1, 1], [-1, 0], [s - 1, -1], [s, -1]]
}

/** The palette index + 1 of a type in these colours (added to a copy of the palette if new). */
function entryOf(paint: MapPaint, type: string, colors: [string, string, string]): [MapPaint['palette'], number] {
  const i = paint.palette.findIndex((e) => e.type === type && e.colors.every((c, k) => c.toLowerCase() === colors[k].toLowerCase()))
  if (i >= 0) return [paint.palette, i + 1]
  return [[...paint.palette, { type, colors }], paint.palette.length + 1]
}

export type PaintEntry = { type: string; colors: [string, string, string] }

/** Terrain (or scenery) on tiles (null: erased). */
export function withTiles(paint: MapPaint, grid: MapGrid, entry: PaintEntry | null, tiles: [number, number][],
  channel: 'tiles' | 'scenery' = 'tiles'): MapPaint {
  const n = grid.cols * grid.rows
  const values = rleDecode(paint[channel] ?? '', n)
  let palette = paint.palette
  let index = 0
  if (entry) [palette, index] = entryOf(paint, entry.type, entry.colors)
  for (const [c, r] of tiles) if (c >= 0 && r >= 0 && c < grid.cols && r < grid.rows) values[r * grid.cols + c] = index
  return { ...paint, palette, [channel]: rleEncode(values) }
}

/** Roads or rivers along tiles in order (each step to a neighbour joins them, or parts them when erasing; erasing on
 *  one tile alone clears it). */
export function withConnections(paint: MapPaint, grid: MapGrid, channel: 'road' | 'river', entry: PaintEntry | null,
  steps: [number, number][], erase: boolean): MapPaint {
  const n = grid.cols * grid.rows
  const masks = rleDecode(paint[`${channel}s`], n)
  const kinds = rleDecode(paint[`${channel}_kinds`], n)
  const out = channel === 'river' ? rleDecode(paint.river_out, n) : null
  let palette = paint.palette
  let index = 0
  if (!erase && entry) [palette, index] = entryOf(paint, entry.type, entry.colors)
  const full = directions(grid, 0).length
  const opposite = (d: number) => (d + full / 2) % full
  const cell = ([c, r]: [number, number]) => r * grid.cols + c
  const on = ([c, r]: [number, number]) => c >= 0 && r >= 0 && c < grid.cols && r < grid.rows
  const tiles = steps.filter(on)
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
    const d = directions(grid, a[1]).findIndex(([dc, dr]) => a[0] + dc === b[0] && a[1] + dr === b[1])
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
      kinds[i] = index
      kinds[j] = index
      if (out) { out[i] |= 1 << d; out[j] &= ~(1 << opposite(d)) }
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

export const emptyPaint = (): MapPaint => ({ palette: [], tiles: '', scenery: '', roads: '', road_kinds: '', rivers: '', river_kinds: '', river_out: '', features: [] })
