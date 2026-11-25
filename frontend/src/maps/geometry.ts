/**
 * Grid geometry for location maps: mirrors backend/sagacraft/domain/maps.py (square tiles; pointy-top hexes in
 * odd-row offset, a hex's size is its width), plus what only the screen needs: the tile under the pointer,
 * brushes, rectangles and path drawing. All in map px.
 */
import type { MapGrid, MapPath } from '../api/types'

export type Tile = [number, number]
export type Point = [number, number]

const SQRT3 = Math.sqrt(3)

export const hexRadius = (grid: MapGrid) => grid.size / SQRT3
export const inGrid = (grid: MapGrid, [c, r]: Tile) => c >= 0 && r >= 0 && c < grid.cols && r < grid.rows
export const tileIndex = (grid: MapGrid, [c, r]: Tile) => r * grid.cols + c
export const tileKey = ([c, r]: Tile) => `${c},${r}`

export function tileCenter(grid: MapGrid, c: number, r: number): Point {
  if (grid.type === 'hex') {
    const radius = hexRadius(grid)
    return [grid.x + grid.size * (c + 0.5 + (r % 2 ? 0.5 : 0)), grid.y + radius + r * 1.5 * radius]
  }
  return [grid.x + grid.size * (c + 0.5), grid.y + grid.size * (r + 0.5)]
}

export function tilePolygon(grid: MapGrid, c: number, r: number): Point[] {
  const [cx, cy] = tileCenter(grid, c, r)
  if (grid.type === 'hex') {
    const radius = hexRadius(grid)
    return Array.from({ length: 6 }, (_, i) => {
      const a = ((60 * i - 30) * Math.PI) / 180
      return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)] as Point
    })
  }
  const h = grid.size / 2
  return [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]]
}

export function gridExtent(grid: MapGrid): [number, number] {
  if (grid.type === 'hex') {
    const radius = hexRadius(grid)
    return [grid.size * grid.cols + (grid.rows > 1 ? grid.size / 2 : 0), 2 * radius + 1.5 * radius * (grid.rows - 1)]
  }
  return [grid.size * grid.cols, grid.size * grid.rows]
}

/**
 * How many tiles apart two tiles are (plan 39): square, the most of the column and row steps (a diagonal counts one,
 * as moving does in D&D 5e); hex (pointy-top, odd rows shifted right), the hex steps between them.
 */
export function tileDistance(grid: Pick<MapGrid, 'type'>, [c1, r1]: Tile, [c2, r2]: Tile): number {
  if (grid.type !== 'hex') return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2))
  const cube = (c: number, r: number) => {
    const x = c - (r - (r & 1)) / 2
    return [x, r, -x - r]
  }
  const [a, b] = [cube(c1, r1), cube(c2, r2)]
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
}

/** "Distance moved" in the map's units: tiles × the grid's distance per tile (15 ft), else tiles. */
export function distanceLabel(grid: Pick<MapGrid, 'unit_size' | 'unit'>, tiles: number): string {
  if (grid.unit_size) {
    const value = Math.round(tiles * grid.unit_size * 100) / 100
    return `${value}${grid.unit ? ` ${grid.unit}` : ''}`
  }
  return `${tiles} ${tiles === 1 ? 'tile' : 'tiles'}`
}

/** The tiles touching one (square: eight, corners included; hex: six), on the grid. Mirrors maps.neighbours. */
export function neighbours(grid: MapGrid, c: number, r: number): Tile[] {
  const shift = r % 2
  const around: Tile[] = grid.type === 'hex'
    ? [[-1, 0], [1, 0], [shift - 1, -1], [shift, -1], [shift - 1, 1], [shift, 1]]
    : [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
  return around.map(([dc, dr]) => [c + dc, r + dr] as Tile).filter((t) => inGrid(grid, t))
}

/**
 * The fog as the shader reads it, one byte per tile: 0 unknown, 51 unknown but touching a known or visible tile
 * (the edge ring, where the immersive fog's soft edge is drawn), 127 known, 255 visible.
 */
export function fogBytes(fog: Uint8Array, grid: MapGrid): Uint8Array {
  const bytes = new Uint8Array(fog.length)
  for (let i = 0; i < fog.length; i += 1) bytes[i] = fog[i] === 2 ? 255 : fog[i] === 1 ? 127 : 0
  for (let i = 0; i < fog.length; i += 1) {
    if (!fog[i]) continue
    for (const [c, r] of neighbours(grid, i % grid.cols, Math.floor(i / grid.cols))) {
      const j = r * grid.cols + c
      if (!bytes[j]) bytes[j] = 51
    }
  }
  return bytes
}

/** The tile under a point (may be outside the grid: check inGrid). */
export function tileAt(grid: MapGrid, x: number, y: number): Tile {
  if (grid.type === 'hex') {
    const radius = hexRadius(grid)
    const px = x - (grid.x + grid.size / 2)
    const py = y - (grid.y + radius)
    // pixel -> axial -> cube rounding -> odd-r offset
    const q = ((SQRT3 / 3) * px - py / 3) / radius
    const rr = ((2 / 3) * py) / radius
    let cx = Math.round(q)
    let cz = Math.round(rr)
    const cy = Math.round(-q - rr)
    const dx = Math.abs(cx - q)
    const dy = Math.abs(cy - (-q - rr))
    const dz = Math.abs(cz - rr)
    if (dx > dy && dx > dz) cx = -cy - cz
    else if (dy <= dz) cz = -cx - cy
    return [cx + (cz - (cz & 1)) / 2 || 0, cz || 0] // no -0
  }
  return [Math.floor((x - grid.x) / grid.size), Math.floor((y - grid.y) / grid.size)]
}

/** Tiles of a round brush: `radius` 1 is one tile, 2 adds its neighbours, and so on. */
export function brushTiles(grid: MapGrid, center: Tile, radius: number): Tile[] {
  const [cx, cy] = tileCenter(grid, center[0], center[1])
  const reach = (radius - 1) * grid.size * 1.02
  const tiles: Tile[] = []
  for (let r = center[1] - radius; r <= center[1] + radius; r += 1) {
    for (let c = center[0] - radius; c <= center[0] + radius; c += 1) {
      if (!inGrid(grid, [c, r])) continue
      const [x, y] = tileCenter(grid, c, r)
      if (Math.hypot(x - cx, y - cy) <= reach + 0.01) tiles.push([c, r])
    }
  }
  return tiles
}

/** Tiles whose centres are inside the box between two tiles' centres. */
export function rectTiles(grid: MapGrid, a: Tile, b: Tile): Tile[] {
  const [ax, ay] = tileCenter(grid, a[0], a[1])
  const [bx, by] = tileCenter(grid, b[0], b[1])
  const [x0, x1, y0, y1] = [Math.min(ax, bx), Math.max(ax, bx), Math.min(ay, by), Math.max(ay, by)]
  const tiles: Tile[] = []
  for (let r = Math.max(0, Math.min(a[1], b[1]) - 1); r <= Math.min(grid.rows - 1, Math.max(a[1], b[1]) + 1); r += 1) {
    for (let c = Math.max(0, Math.min(a[0], b[0]) - 1); c <= Math.min(grid.cols - 1, Math.max(a[0], b[0]) + 1); c += 1) {
      const [x, y] = tileCenter(grid, c, r)
      if (x >= x0 - 0.01 && x <= x1 + 0.01 && y >= y0 - 0.01 && y <= y1 + 0.01) tiles.push([c, r])
    }
  }
  return tiles
}

/** Bounding box of some tiles: [x, y, w, h]. */
export function tilesBox(grid: MapGrid, tiles: Tile[]): [number, number, number, number] {
  const points = tiles.flatMap(([c, r]) => tilePolygon(grid, c, r))
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y]
}

const fmt = (n: number) => Math.round(n * 10) / 10
const pt = ([x, y]: Point) => `${fmt(x)} ${fmt(y)}`

/** A cubic Bézier piece: two control points and its end (it starts where the previous one ended). */
export type Curve = [Point, Point, Point]

/**
 * A path's line as cubic pieces. Poly: straight from tile centre to tile centre. Spline: through the middle of
 * each edge it crosses, leaving and entering perpendicular to the edge (the direction from one tile to the
 * next), so the line curves inside each tile; it starts and ends at the first and last tiles' centres.
 */
export function pathCurves(grid: MapGrid, path: Pick<MapPath, 'tiles' | 'render'>): { start: Point; curves: Curve[] } | null {
  const centers = path.tiles.map(([c, r]) => tileCenter(grid, c, r))
  if (!centers.length) return null
  if (centers.length === 1) return { start: centers[0], curves: [] }
  if (path.render === 'poly') {
    return { start: centers[0], curves: centers.slice(1).map((b, i) => [centers[i], b, b] as Curve) }
  }
  const unit = (a: Point, b: Point): Point => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]
  }
  const edges = centers.slice(1).map((c, i) => ({
    at: [(centers[i][0] + c[0]) / 2, (centers[i][1] + c[1]) / 2] as Point,
    dir: unit(centers[i], c),
  }))
  const step = (a: Point, da: Point, b: Point, db: Point): Curve => {
    const k = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.45
    return [[a[0] + da[0] * k, a[1] + da[1] * k], [b[0] - db[0] * k, b[1] - db[1] * k], b]
  }
  const curves = [step(centers[0], edges[0].dir, edges[0].at, edges[0].dir)]
  for (let i = 1; i < edges.length; i += 1) curves.push(step(edges[i - 1].at, edges[i - 1].dir, edges[i].at, edges[i].dir))
  const last = edges[edges.length - 1]
  curves.push(step(last.at, last.dir, centers[centers.length - 1], last.dir))
  return { start: centers[0], curves }
}

const curvesD = (start: Point, curves: Curve[]) =>
  [`M ${pt(start)}`, ...curves.map(([a, b, c]) => `C ${pt(a)}, ${pt(b)}, ${pt(c)}`)].join(' ')

/** A path's SVG `d` (one tile: a dot). */
export function pathD(grid: MapGrid, path: Pick<MapPath, 'tiles' | 'render'>): string {
  const line = pathCurves(grid, path)
  if (!line) return ''
  if (!line.curves.length) return `M ${pt(line.start)} L ${pt(line.start)}`
  if (path.render === 'poly') return `M ${[line.start, ...line.curves.map((c) => c[2])].map(pt).join(' L ')}`
  return curvesD(line.start, line.curves)
}

const bezier = (p0: Point, [p1, p2, p3]: Curve, t: number): Point => {
  const u = 1 - t
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]
}

/** A point on a line with its direction (radians). */
export interface Along { at: Point; angle: number }

/**
 * How far along a partly shown path is drawn, in tiles from the first tile's centre (0 to tiles - 1); null: all of it.
 * Players get it from the server (`cut`, with only the tiles it needs); the DM's screen works it out from `shown`.
 * Same rules as the server's domain/maps.py (`path_cut`, `cut_piece`).
 */
export function pathCut(path: Pick<MapPath, 'tiles' | 'shown' | 'cut'>): number | null {
  if (path.cut != null) return path.cut
  const shown = path.shown ?? 100
  return shown >= 100 || path.tiles.length < 2 ? null : (shown / 100) * (path.tiles.length - 1)
}

/** The piece of the line a cut falls in, and how far into it (0..1). Poly: piece i joins tile i to i + 1. Spline: the
 * first and last pieces are half a tile (centre to edge), the others edge to edge. */
export function cutPiece(cut: number, n: number, render: 'poly' | 'spline'): [number, number] {
  if (render === 'poly') {
    const i = Math.min(Math.floor(cut), n - 2)
    return [i, Math.min(1, cut - i)]
  }
  if (cut < 0.5) return [0, cut / 0.5]
  if (cut >= n - 1.5) return [n - 1, Math.min(1, (cut - (n - 1.5)) / 0.5)]
  const k = Math.floor(cut - 0.5)
  return [k + 1, cut - 0.5 - k]
}

/**
 * Points along a path: one every `spacing` (the first half a spacing in, none closer than `margin` to the
 * end), and its two ends with the direction the line has there (for heads, tails and arrows along the way).
 */
export function pathSamples(grid: MapGrid, path: Pick<MapPath, 'tiles' | 'render'>, spacing: number, margin = 0, cut: number | null = null):
  { along: Along[]; start: Along | null; end: Along | null; length: number; points: Point[] } {
  const line = pathCurves(grid, path)
  if (!line || !line.curves.length) return { along: [], start: null, end: null, length: 0, points: [] }
  // The line as a polyline, finely
  let points: Point[] = [line.start]
  let from = line.start
  for (const curve of line.curves) {
    for (let i = 1; i <= 16; i += 1) points.push(bezier(from, curve, i / 16))
    from = curve[2]
  }
  let lengths = [0]
  for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]))
  // Partly shown: the line stops at the cut (the head goes there), the rest isn't drawn
  if (cut !== null) {
    const [piece, t] = cutPiece(cut, path.tiles.length, path.render)
    const a = piece * 16, b = Math.min(points.length - 1, (piece + 1) * 16)
    const stop = lengths[a] + (lengths[b] - lengths[a]) * t
    let j = 1
    while (j < points.length - 1 && lengths[j] < stop) j += 1
    const k = (stop - lengths[j - 1]) / ((lengths[j] - lengths[j - 1]) || 1)
    const p = points[j - 1], q = points[j]
    const end: Point = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]
    if (stop <= 0) {
      // Nothing shown yet: the ends sit at the start, pointing the way it goes
      const angle = Math.atan2(points[1][1] - points[0][1], points[1][0] - points[0][0])
      return { along: [], start: { at: points[0], angle }, end: { at: points[0], angle }, length: 0, points: [points[0]] }
    }
    points = [...points.slice(0, j), end]
    lengths = [...lengths.slice(0, j), stop]
  }
  const length = lengths[lengths.length - 1]
  const along: Along[] = []
  let i = 1
  for (let d = spacing / 2; spacing > 0 && d <= length - margin; d += spacing) {
    while (i < points.length - 1 && lengths[i] < d) i += 1
    const t = (d - lengths[i - 1]) / ((lengths[i] - lengths[i - 1]) || 1)
    const a = points[i - 1], b = points[i]
    along.push({ at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], angle: Math.atan2(b[1] - a[1], b[0] - a[0]) })
  }
  // Ends: the direction over the last bit of line (skipping repeated points)
  const endAngle = (fromEnd: boolean) => {
    const idx = fromEnd ? points.length - 1 : 0
    const step = fromEnd ? -1 : 1
    let j = idx + step
    while (j > 0 && j < points.length - 1 && Math.hypot(points[j][0] - points[idx][0], points[j][1] - points[idx][1]) < 0.5) j += step
    const [a, b] = fromEnd ? [points[j], points[idx]] : [points[idx], points[j]]
    return Math.atan2(b[1] - a[1], b[0] - a[0])
  }
  return {
    along,
    start: { at: points[0], angle: endAngle(false) },
    end: { at: points[points.length - 1], angle: endAngle(true) },
    length,
    points,
  }
}

/**
 * The outline of some tiles: the tile edges between tiles in the set and tiles out of it (or off the grid),
 * chained into closed loops (outer borders and holes). Works for square and hex grids: the tile across an
 * edge is the one just past the edge's middle; vertices are matched on the grid's lattice (half tiles), so
 * neighbouring tiles' corners meet exactly.
 */
export function tilesOutline(grid: MapGrid, tiles: Tile[]): Point[][] {
  if (grid.type === 'none' || !tiles.length) return []
  const set = new Set(tiles.filter((t) => inGrid(grid, t)).map(tileKey))
  const ux = grid.size / 2
  const uy = grid.type === 'hex' ? hexRadius(grid) / 2 : grid.size / 2
  const vkey = ([x, y]: Point) => `${Math.round((x - grid.x) / ux)},${Math.round((y - grid.y) / uy)}`
  // Directed boundary edges, all going the same way round their tile (clockwise on screen)
  const out = new Map<string, { from: Point; to: Point; used: boolean }[]>()
  for (const key of set) {
    const [c, r] = key.split(',').map(Number)
    const [cx, cy] = tileCenter(grid, c, r)
    const poly = tilePolygon(grid, c, r)
    poly.forEach((from, i) => {
      const to = poly[(i + 1) % poly.length]
      const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2
      const across = tileAt(grid, mx + (mx - cx) * 0.2, my + (my - cy) * 0.2)
      if (set.has(tileKey(across)) && inGrid(grid, across)) return
      const k = vkey(from)
      out.set(k, [...(out.get(k) || []), { from, to, used: false }])
    })
  }
  const loops: Point[][] = []
  for (const edges of out.values()) {
    for (const first of edges) {
      if (first.used) continue
      const loop: Point[] = []
      let edge: { from: Point; to: Point; used: boolean } | undefined = first
      while (edge && !edge.used) {
        edge.used = true
        loop.push(edge.from)
        edge = out.get(vkey(edge.to))?.find((e) => !e.used)
      }
      if (loop.length >= 3) loops.push(loop)
    }
  }
  return loops
}

/**
 * Loops as an SVG `d`. Poly: along the tile edges. Spline: a smooth closed curve through the middle of each
 * edge (Catmull-Rom): straight runs stay straight, corners round off, a hex border's zigzag smooths out.
 */
export function outlineD(loops: Point[][], render: 'poly' | 'spline'): string {
  return loops.map((loop) => {
    if (render === 'poly') return `M ${loop.map(pt).join(' L ')} Z`
    const mids = loop.map((p, i) => {
      const q = loop[(i + 1) % loop.length]
      return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as Point
    })
    const n = mids.length
    const parts = [`M ${pt(mids[0])}`]
    for (let i = 0; i < n; i += 1) {
      const p0 = mids[(i - 1 + n) % n], p1 = mids[i], p2 = mids[(i + 1) % n], p3 = mids[(i + 2) % n]
      const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
      const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
      parts.push(`C ${pt(c1)}, ${pt(c2)}, ${pt(p2)}`)
    }
    return `${parts.join(' ')} Z`
  }).join(' ')
}

/** Where a set of tiles' name goes: the tile centre nearest the tiles' average (always on one of them). */
export function labelPoint(grid: MapGrid, tiles: Tile[]): Point | null {
  if (!tiles.length) return null
  const centers = tiles.map(([c, r]) => tileCenter(grid, c, r))
  const mx = centers.reduce((s, p) => s + p[0], 0) / centers.length
  const my = centers.reduce((s, p) => s + p[1], 0) / centers.length
  return centers.reduce((best, p) => (Math.hypot(p[0] - mx, p[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? p : best))
}

/** Fog states as numbers (0 unknown, 1 known, 2 visible), per tile, best over some layers. */
export function mergeFog(layers: (string | undefined)[], count: number): Uint8Array {
  const result = new Uint8Array(count)
  for (const layer of layers) {
    if (!layer) continue
    for (let i = 0; i < count; i += 1) {
      const v = layer.charCodeAt(i) - 48
      if (v > result[i]) result[i] = v
    }
  }
  return result
}

export const fogFromString = (states: string): Uint8Array => mergeFog([states], states.length)

type Placed = { x: number; y: number; w: number; h: number; scale: number; rotation?: number }

/** The box a picture covers on the map (left, top, right, bottom), turned as it's drawn (domain/maps.image_box). */
export function imageBox(i: Placed): [number, number, number, number] {
  const w = i.w * i.scale, h = i.h * i.scale
  const cx = i.x + w / 2, cy = i.y + h / 2
  const a = ((i.rotation ?? 0) * Math.PI) / 180
  const hw = (Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * h) / 2
  const hh = (Math.abs(Math.sin(a)) * w + Math.abs(Math.cos(a)) * h) / 2
  return [cx - hw, cy - hh, cx + hw, cy + hh]
}

/** The map's size from its pictures and grid (players get it from the server). */
export function worldSize(images: Placed[], grid: MapGrid): [number, number] {
  let right = Math.max(0, ...images.map((i) => imageBox(i)[2]))
  let bottom = Math.max(0, ...images.map((i) => imageBox(i)[3]))
  if (grid.type !== 'none') {
    const [w, h] = gridExtent(grid)
    right = Math.max(right, grid.x + w)
    bottom = Math.max(bottom, grid.y + h)
  }
  return [Math.max(256, Math.ceil(right)), Math.max(256, Math.ceil(bottom))]
}
