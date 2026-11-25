/**
 * The map painter's sprites (plan 48): scenery and features as pictures standing on the map, made on the CPU from the
 * painting (deterministic: the same painting always makes the same sprites) and drawn by the sprite pass, nearest last.
 *
 * - Scenery: each type's art layers scatter sprites on a jittered grid in world space (spacing, heights in tiles; odd
 *   rows shifted: no lattice shows), kept where their wobbled base lies on a tile of their own type (so tiles of one
 *   type join into one forest or city, its edges organic); a layer marked `clear` (a church, a keep) keeps the next
 *   layers' sprites off its foot. Walled types (castles, keeps, ruins) get towers at the corners of their outline (the
 *   ground pass draws the wall) and gates where a road crosses it.
 * - Features: their variant's parts at the tile's centre (sizes in the feature's height), spinning, swaying, flapping,
 *   drifting or flying; overhead ones (birds, clouds) over everything.
 * Sprites are SVGs (the style's `sprites`): their viewBox gives their shape, `data-anchor` where they stand.
 */
import type { MapGrid, MapPaint, PaintPack, PaintType } from '../../api/types'
import { inGrid, tileAt, tileCenter, tilePolygon } from '../geometry'
import { directions, rleDecode } from './data'
import { typeOf } from './pack'

export interface Sprite {
  name: string
  colors: [string, string, string]
  /** Raster height of its picture (px). */
  px: number
  /** Where its anchor stands (map px), its size (map px), its anchor in its box (0..1 from the top left). */
  x: number
  y: number
  w: number
  h: number
  ax: number
  ay: number
  flip: boolean
  /** Sway (trees), its phase (radians), spin (turns a second, around the anchor). */
  sway: number
  phase: number
  spin: number
  /** 0 still, 1 drifting back and forth, 2 flying around; how far (map px); how fast (radians a second). */
  motion: 0 | 1 | 2
  amount: number
  speed: number
  /** Flapping: frames a second (> 0 the first frame, < 0 the second; 0 none). */
  blink: number
  /** Draw order: lower first. */
  depth: number
  /** A glow (a firefly: no picture, only at night). */
  glow?: boolean
}

export interface SpriteShape { w: number; h: number; ax: number; ay: number; night: boolean }

const shapes = new Map<string, SpriteShape | null>()

/** A sprite's shape from its SVG: its viewBox's size, its anchor (default: bottom middle), whether it has night parts. */
export function spriteShape(svg: string | undefined): SpriteShape | null {
  if (!svg) return null
  const known = shapes.get(svg)
  if (known !== undefined) return known
  const box = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg)
  const anchor = /data-anchor="\s*([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg)
  const shape = box ? { w: Number(box[1]), h: Number(box[2]), ax: anchor ? Number(anchor[1]) : 0.5, ay: anchor ? Number(anchor[2]) : 1,
    night: /class="night"/.test(svg) } : null
  shapes.set(svg, shape)
  return shape
}

// -- deterministic randomness (the same painting, the same sprites) --------------------------------------------------

/** A number in [0, 1) from two integers and a seed. */
export function rand(a: number, b: number, seed: number): number {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(seed | 0, 1274126177)
  x = Math.imul(x ^ (x >>> 13), 1103515245)
  x ^= x >>> 16
  x = Math.imul(x, 2246822519)
  x ^= x >>> 13
  return (x >>> 0) / 4294967296
}

/** A seed from a text (a type's key: its sprites don't move when the palette changes). */
export function seedOf(text: string): number {
  let x = 2166136261
  for (let i = 0; i < text.length; i += 1) x = Math.imul(x ^ text.charCodeAt(i), 16777619)
  return x | 0
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = rand(ix, iy, seed), b = rand(ix + 1, iy, seed), c = rand(ix, iy + 1, seed), d = rand(ix + 1, iy + 1, seed)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

/** A point's wobble (map px): organic edges for scenery, about a quarter of a tile. */
function wobble(x: number, y: number, size: number): [number, number] {
  const a = size * 0.6, b = size * 0.17
  return [(noise(x / a, y / a, 11) - 0.5) * size * 0.45 + (noise(x / b, y / b, 13) - 0.5) * size * 0.14,
    (noise(x / a, y / a, 17) - 0.5) * size * 0.45 + (noise(x / b, y / b, 19) - 0.5) * size * 0.14]
}

// -- scenery -----------------------------------------------------------------------------------------------------

function sceneryOf(paint: MapPaint, grid: MapGrid, pack: PaintPack, out: Sprite[]) {
  const n = grid.cols * grid.rows
  const scenery = rleDecode(paint.scenery ?? '', n)
  const tilesOf = new Map<number, [number, number][]>()
  for (let i = 0; i < n; i += 1) {
    const e = scenery[i]
    if (!e) continue
    const list = tilesOf.get(e) ?? []
    list.push([i % grid.cols, Math.floor(i / grid.cols)])
    tilesOf.set(e, list)
  }
  if (!tilesOf.size) return
  const roads = rleDecode(paint.roads ?? '', n)
  const size = grid.size
  for (const [entry, tiles] of tilesOf) {
    const paletteEntry = paint.palette[entry - 1]
    const type = paletteEntry && typeOf(pack, paletteEntry.type)
    if (!type || type.kind !== 'scenery') continue
    const colors = paletteEntry.colors
    const seed = seedOf(type.key)
    // the region's box (map px)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [c, r] of tiles) {
      const [cx, cy] = tileCenter(grid, c, r)
      x0 = Math.min(x0, cx - size); y0 = Math.min(y0, cy - size); x1 = Math.max(x1, cx + size); y1 = Math.max(y1, cy + size)
    }
    const footprints: [number, number, number][] = []
    // Walled types: their sprites stand inside the wall (no wobble: walls follow the tiles' own edges)
    const walls = type.art.walls
    const inside = walls ? insideWalls(grid, scenery, entry, (walls.inset + walls.width) * size) : null
    ;(type.art.layers ?? []).forEach((layer, li) => {
      const [sx, sy] = Array.isArray(layer.spacing) ? layer.spacing : [layer.spacing, layer.spacing]
      const spx = Math.max(0.05, sx) * size, spy = Math.max(0.05, sy) * size
      const jitter = layer.jitter ?? 0.8
      const s = seed + li * 7919
      for (let cy = Math.floor(y0 / spy) - 1; cy <= Math.ceil(y1 / spy) + 1; cy += 1) {
        const shift = cy & 1 ? 0.5 : 0
        for (let cx = Math.floor(x0 / spx) - 1; cx <= Math.ceil(x1 / spx) + 1; cx += 1) {
          if (rand(cx, cy, s) > layer.keep) continue
          const x = (cx + shift + 0.5 + (rand(cx, cy, s + 1) - 0.5) * jitter) * spx
          const y = (cy + 0.5 + (rand(cx, cy, s + 2) - 0.5) * jitter) * spy
          const [wx, wy] = inside ? [0, 0] : wobble(x, y, size)
          const tile = tileAt(grid, x + wx, y + wy)
          if (!inGrid(grid, tile) || scenery[tile[1] * grid.cols + tile[0]] !== entry) continue
          if (inside && !inside(tile, x, y)) continue
          const h = (layer.height[0] + (layer.height[1] - layer.height[0]) * rand(cx, cy, s + 3)) * size
          if (layer.clear) footprints.push([x, y - h * 0.25, h * 0.5])
          else if (footprints.some(([fx, fy, fr]) => (x - fx) ** 2 + (y - fy) ** 2 < fr * fr)) continue
          const name = layer.sprites[Math.floor(rand(cx, cy, s + 4) * layer.sprites.length) % layer.sprites.length]
          const shape = spriteShape(pack.sprites[name])
          if (!shape) continue
          out.push({ name, colors, px: pack.style.sprite_px, x, y, w: h * shape.w / shape.h, h, ax: shape.ax, ay: shape.ay,
            flip: rand(cx, cy, s + 5) > 0.5, sway: layer.sway ?? 0, phase: rand(cx, cy, s + 6) * 6.283, spin: 0,
            motion: 0, amount: 0, speed: 0, blink: 0, depth: y })
        }
      }
    })
    if (type.art.walls) wallsOf(grid, scenery, roads, entry, tiles, type, colors, pack, out)
    // Fireflies (shown at night): glows wandering over the region
    const flies = type.art.night?.fireflies ?? 0
    if (flies > 0) {
      const sp = 0.3 * size
      const s = seed + 104729
      for (let cy = Math.floor(y0 / sp); cy <= Math.ceil(y1 / sp); cy += 1) {
        for (let cx = Math.floor(x0 / sp); cx <= Math.ceil(x1 / sp); cx += 1) {
          if (rand(cx, cy, s) > flies) continue
          const x = (cx + rand(cx, cy, s + 1)) * sp, y = (cy + rand(cx, cy, s + 2)) * sp
          const tile = tileAt(grid, x, y)
          if (!inGrid(grid, tile) || scenery[tile[1] * grid.cols + tile[0]] !== entry) continue
          const r = size * (0.035 + 0.02 * rand(cx, cy, s + 3))
          out.push({ name: '', colors, px: 0, x, y: y - size * 0.12, w: r, h: r, ax: 0.5, ay: 0.5, flip: false, sway: 0,
            phase: rand(cx, cy, s + 4) * 6.283, spin: 0, motion: 2, amount: size * 0.06, speed: 0.3 + 0.4 * rand(cx, cy, s + 5),
            blink: 0, depth: y + size * 0.2, glow: true })
        }
      }
    }
  }
}

/** Is a point of a walled type's tile at least `margin` inside its walls? (its edges toward other tiles) */
function insideWalls(grid: MapGrid, scenery: Uint8Array, entry: number, margin: number) {
  const edges = new Map<number, [number, number, number, number][]>() // per tile: a point on each outer edge, its inward normal
  return (tile: [number, number], x: number, y: number) => {
    const i = tile[1] * grid.cols + tile[0]
    let list = edges.get(i)
    if (!list) {
      list = []
      const poly = tilePolygon(grid, tile[0], tile[1])
      const [cx, cy] = tileCenter(grid, tile[0], tile[1])
      poly.forEach((a, k) => {
        const b = poly[(k + 1) % poly.length]
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
        const nb = tileAt(grid, mx + (mx - cx) * 0.2, my + (my - cy) * 0.2)
        if (inGrid(grid, nb) && scenery[nb[1] * grid.cols + nb[0]] === entry) return
        const len = Math.hypot(cx - mx, cy - my) || 1
        list!.push([mx, my, (cx - mx) / len, (cy - my) / len])
      })
      edges.set(i, list)
    }
    return list.every(([mx, my, nx, ny]) => (x - mx) * nx + (y - my) * ny >= margin)
  }
}

/** Towers at the corners of a walled type's outline, gates where a road crosses it (the wall: the ground pass). */
function wallsOf(grid: MapGrid, scenery: Uint8Array, roads: Uint8Array, entry: number, tiles: [number, number][], type: PaintType,
  colors: [string, string, string], pack: PaintPack, out: Sprite[]) {
  const walls = type.art.walls!
  const size = grid.size
  const inset = walls.inset * size
  const corners = new Map<string, { x: number; y: number; normals: [number, number][] }>()
  const seed = seedOf(type.key + ':walls')
  const place = (name: string | undefined, x: number, y: number, height: number, depth: number) => {
    const shape = name ? spriteShape(pack.sprites[name]) : null
    if (!name || !shape) return
    const h = height * size
    out.push({ name, colors, px: pack.style.sprite_px, x, y, w: h * shape.w / shape.h, h, ax: shape.ax, ay: shape.ay, flip: false,
      sway: 0, phase: 0, spin: 0, motion: 0, amount: 0, speed: 0, blink: 0, depth })
  }
  for (const [c, r] of tiles) {
    const poly = tilePolygon(grid, c, r)
    const [cx, cy] = tileCenter(grid, c, r)
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length]
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
      const nb = tileAt(grid, mx + (mx - cx) * 0.2, my + (my - cy) * 0.2)
      if (inGrid(grid, nb) && scenery[nb[1] * grid.cols + nb[0]] === entry) return
      const len = Math.hypot(cx - mx, cy - my) || 1
      const n: [number, number] = [(cx - mx) / len, (cy - my) / len] // inward
      const d = directions(grid, r).findIndex(([dc, dr]) => c + dc === nb[0] && r + dr === nb[1])
      if (d >= 0 && roads[r * grid.cols + c] & (1 << d)) {
        place(walls.gate, mx + n[0] * inset, my + n[1] * inset, walls.gate_height ?? 0.3, my + n[1] * inset)
      }
      for (const v of [a, b]) {
        const key = `${Math.round(v[0] * 10)},${Math.round(v[1] * 10)}`
        const corner = corners.get(key) ?? { x: v[0], y: v[1], normals: [] }
        corner.normals.push(n)
        corners.set(key, corner)
      }
    })
  }
  for (const corner of corners.values()) {
    if (corner.normals.length < 2) continue
    const [n1, n2] = corner.normals
    const dot = n1[0] * n2[0] + n1[1] * n2[1]
    if (dot > 0.1) continue // the outline goes on straight (or bends a little): no tower
    if (walls.gaps && rand(Math.round(corner.x), Math.round(corner.y), seed) < walls.gaps) continue
    const k = inset / Math.max(0.2, 1 + dot)
    const x = corner.x + (n1[0] + n2[0]) * k, y = corner.y + (n1[1] + n2[1]) * k
    place(walls.tower, x, y, walls.tower_height ?? 0.3, y)
  }
}

// -- features ----------------------------------------------------------------------------------------------------

function featuresOf(paint: MapPaint, grid: MapGrid, pack: PaintPack, out: Sprite[]) {
  const size = grid.size
  for (const f of paint.features ?? []) {
    const type = typeOf(pack, f.type)
    const variants = type?.art.variants
    if (!type || type.kind !== 'feature' || !variants?.length) continue
    const parts = variants[((f.variant % variants.length) + variants.length) % variants.length]
    const [cx, cy] = tileCenter(grid, f.tile[0], f.tile[1])
    const H = (type.art.height ?? 0.5) * f.size * size
    const seed = seedOf(f.id)
    parts.forEach((part, pi) => {
      const count = Math.max(1, Math.min(12, part.count ?? 1))
      for (let k = 0; k < count; k += 1) {
        const frames = part.frames?.length ? part.frames.slice(0, 2) : [part.sprite]
        frames.forEach((name, fi) => {
          const shape = spriteShape(pack.sprites[name])
          if (!shape) return
          const h = (part.size ?? 1) * H
          const at = part.at ?? [0, 0]
          const jitter = count > 1 ? [(rand(k, 1, seed) - 0.5) * H * 4, (rand(k, 2, seed) - 0.5) * H * 3] : [0, 0]
          const x = cx + at[0] * H + jitter[0], y = cy + at[1] * H + jitter[1]
          const phase = rand(k, 3, seed) * 6.283
          const motion: 0 | 1 | 2 = part.fly ? 2 : part.drift ? 1 : 0
          const amount = part.fly ? part.fly * size * f.size * (0.7 + 0.6 * rand(k, 4, seed)) : part.drift ? size * f.size * 0.35 : 0
          const speed = part.fly ? 0.35 + 0.3 * rand(k, 5, seed) : part.drift ? (part.drift * size) / Math.max(1, amount) : 0
          const fps = part.frames?.length ? (part.fps ?? 3) : 0
          out.push({ name, colors: f.colors, px: pack.style.feature_px, x, y, w: h * shape.w / shape.h, h, ax: shape.ax, ay: shape.ay,
            flip: false, sway: part.sway ?? 0, phase, spin: part.spin ?? 0, motion, amount, speed, blink: fi === 0 ? fps : -fps,
            depth: type.art.overhead ? 1e9 + y + pi : cy + pi * 0.01 })
        })
      }
    })
  }
}

/** Every sprite of a painting, in draw order (back to front; overhead ones last). */
export function paintSprites(paint: MapPaint | null, grid: MapGrid, pack: PaintPack | null): Sprite[] {
  if (!paint || !pack || grid.type === 'none') return []
  const out: Sprite[] = []
  sceneryOf(paint, grid, pack, out)
  featuresOf(paint, grid, pack, out)
  return out.sort((a, b) => a.depth - b.depth || a.x - b.x)
}
