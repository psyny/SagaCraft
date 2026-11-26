/**
 * The map painter's sprites (plan 48): scenery and features as pictures standing on the map, made on the CPU from the
 * painting (deterministic: the same painting always makes the same sprites) and drawn by the sprite pass, nearest last.
 *
 * - Scenery: each type's art layers scatter sprites on a jittered grid in world space (spacing, heights in tiles; odd
 *   rows shifted: no lattice shows), kept where their wobbled base lies on a tile of their own type (so tiles of one
 *   type join into one forest or city, its edges organic); a layer marked `clear` (a church, a keep) keeps the next
 *   layers' sprites off its foot; a type with an `inset` (castles) keeps them that far inside its outer edges. Painted
 *   at a density (plan 56: sprites a tile, `layersAt`), some layers only within a range of densities.
 * - Effects (plan 49): like scenery (their sprite layers: glowing mushrooms), plus **particles** scattered the same way
 *   (glows, puffs of mist and smoke, sparks, leaves, bubbles, motes), each moving its way in the sprite shader; they
 *   stand in the same depth order as everything (mist between the trees).
 * - Boundaries (plans 49, 50): each edge between two tiles with a boundary is a box (the edge, a thickness, a height)
 *   the sprite shader draws standing up; cliffs hang their face below their edge, toward their low side. A road
 *   through an edge opens it (a gate sprite where the type has one). Corner sprites (towers) where a boundary ends,
 *   turns or meets another.
 * - Waterfalls (plan 50): a river crossing an edge with a boundary falls there; the fall is the river's (its look and
 *   colours: water, lava), the same over any boundary, drawn in front of it: down a cliff's face, from a wall's top to
 *   its foot, or white water across the river where the drop isn't seen; mist (lava: sparks) rising at its foot. Types
 *   marked `"falls": false` (fences, hedges) open a gap for the river instead.
 * - Features: their variant's parts at the tile's centre (sizes in the feature's height), spinning, swaying, flapping,
 *   drifting or flying; overhead ones (birds, clouds) over everything.
 * Sprites are SVGs (the style's `sprites`): their viewBox gives their shape, `data-anchor` where they stand.
 */
import type { MapGrid, MapPaint, PaintFlame, PaintPack, PaintSceneryLayer, PaintType } from '../../api/types'
import { edgeEnds, inGrid, tileAt, tileCenter, tilePolygon } from '../geometry'
import { BOUND_CHANNELS, directions, ownEdges, rleDecode } from './data'
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
  /** Its foot fades into the ground over this part of its height (organic scenery, noisy). */
  fade?: number
  /** A glow (a firefly: no picture, only at night). */
  glow?: boolean
  /** A box (a boundary's piece, plan 49): from (x, y) to (qx, qy) on the ground, `thick` and `h` map px; its look, its
   *  palette entry (colours), how broken (gaps), cliff: the outward side, toward its low ground (outX, outY; its face
   *  only if toward us); slopes (plan 51): how far their foot reaches out (`run`, map px), and their corners: a cone at
   *  (x, y) between two outward sides (`cone`: x1, y1, x2, y2). */
  box?: { qx: number; qy: number; thick: number; look: number; entry: number; gaps: number; cliff: boolean; outX: number; outY: number;
    run?: number; cone?: [number, number, number, number] }
  /** A river's waterfall (plan 50): (x, y) where it crosses its boundary's edge, `h` how far it falls; along the edge
   *  (dx, dy), half its width (map px); 0 down a cliff's face (or a slope: a cascade), 1 from a wall's top to its foot,
   *  2 seen from the side (white water across the river); from its lip to its foot on the screen (wx, wy); the river's
   *  palette entry; lava; down a slope. */
  fall?: { dx: number; dy: number; half: number; mode: number; wx: number; wy: number; entry: number; lava: boolean; slope: boolean }
  /** A particle (an effect's, plan 49): drawn by the sprite shader (its shape), `lift` map px over (x, y), w × h; its
   *  palette entry and colour row (1..3), how it moves (`amount`, `speed`, `phase` above), lights itself, night only. */
  particle?: { shape: number; motion: number; lift: number; opacity: number; entry: number; row: number; glow: boolean; night: boolean;
    twinkle: number; spin: number }
}

/** The sprite shader's numbers for particles' shapes and motions (painter/spriteShader.ts). */
export const PARTICLE_SHAPES: Record<string, number> = { glow: 1, puff: 2, spark: 3, leaf: 4, bubble: 5, mote: 6, flame: 7 }

/** A fire on a sprite standing at (x, y), `h` tall (plan 53): a flame (the shader's: flickering when animated, lighting
 *  itself) and sparks rising from it, just in front of the sprite. Its colour: the palette entry's row (0: a plain fire
 *  orange, features). */
function flameOn(flame: PaintFlame, x: number, y: number, h: number, depth: number, entry: number, row: number, seed: number, out: Sprite[]) {
  const [ax, ay] = flame.at ?? [0, 0]
  const fx = x + ax * h, fy = y + ay * h, size = flame.size * h
  const particle = (shape: number, motion: number, w: number, lift: number, amount: number, speed: number, k: number) => out.push({
    name: '', colors: ['#000000', '#000000', '#000000'], px: 0, x: fx, y: fy, w: w * 0.8, h: w, ax: 0.5, ay: 0.5, flip: false, sway: 0,
    phase: rand(seed, k, 61) * 6.283, spin: 0, motion: 0, amount, speed, blink: 0, depth: depth + 0.001 + k * 0.0001,
    particle: { shape, motion, lift, opacity: 1, entry, row, glow: true, night: false, twinkle: 0, spin: 0 } })
  particle(PARTICLE_SHAPES.flame, PARTICLE_MOTIONS.still, size, size * 0.5, 0, 0, 0)
  for (let k = 1; k <= Math.min(6, flame.sparks ?? 0); k += 1) {
    particle(PARTICLE_SHAPES.spark, PARTICLE_MOTIONS.rise, size * 0.12, size * 0.6, size * 1.4, 0.45 + 0.3 * rand(seed, k, 67), k)
  }
}
export const PARTICLE_MOTIONS: Record<string, number> = { still: 0, wander: 1, rise: 2, fall: 3, drift: 4, pulse: 5 }

/** The sprite shader's numbers for boundary looks (painter/spriteShader.ts). */
export const BOUNDARY_LOOKS: Record<string, number> = { fence: 1, palisade: 2, stone: 3, brick: 4, castle: 5, hedge: 6, cliff: 7, barrier: 8, slope: 9 }

/** Boundaries with a high side (cliffs, slopes: the tool's Turn). */
export const sided = (look: string | undefined) => look === 'cliff' || look === 'slope'

export interface SpriteShape { w: number; h: number; ax: number; ay: number; night: boolean; glow: boolean }

const shapes = new Map<string, SpriteShape | null>()

/** A sprite's shape from its SVG: its viewBox's size, its anchor (default: bottom middle), whether it has night parts
 *  (lit at night) or natural glows (plan 53: glowing at every hour). */
export function spriteShape(svg: string | undefined): SpriteShape | null {
  if (!svg) return null
  const known = shapes.get(svg)
  if (known !== undefined) return known
  const box = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg)
  const anchor = /data-anchor="\s*([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg)
  const shape = box ? { w: Number(box[1]), h: Number(box[2]), ax: anchor ? Number(anchor[1]) : 0.5, ay: anchor ? Number(anchor[2]) : 1,
    night: /class="night"/.test(svg), glow: /class="glow"/.test(svg) } : null
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

const spacingOf = (layer: PaintSceneryLayer): [number, number] => {
  const [sx, sy] = Array.isArray(layer.spacing) ? layer.spacing : [layer.spacing, layer.spacing]
  return [Math.max(0.05, sx), Math.max(0.05, sy)]
}
/** A layer's own count on a square tile (its places kept over its spacing's area). */
const ownCount = (layer: PaintSceneryLayer) => { const [sx, sy] = spacingOf(layer); return layer.keep / (sx * sy) }
/** A tile's area in its size squared. */
const tileArea = (hex: boolean) => (hex ? Math.sqrt(3) / 2 : 1)

/** How many sprites a scenery type stands on a tile at its own density (plan 56: its art's `per_tile`, else its
 *  layers'); map_paint.own_per_tile. */
export const ownPerTile = (type: PaintType, hex: boolean) =>
  (type.art.per_tile ?? (type.art.layers ?? []).reduce((n, layer) => n + ownCount(layer), 0)) * tileArea(hex)

/** The most sprites a tile for a scenery type: its category's `per_tile` (the Density tray's 100%). */
export const mostPerTile = (pack: PaintPack | null, type: PaintType) =>
  pack?.categories.find((c) => c.key === type.category && c.layer === type.layer)?.per_tile ?? 100

/** A scenery type's layers at a density (plan 56: `perTile` sprites a tile): those that show at it (their `density`
 *  range), each with its spacing (tiles) and the share of its places kept, together making that many. Fewer than their
 *  own: fewer places kept (the same places, never moved); more: a finer grid (packed). */
export function layersAt(type: PaintType, perTile: number, hex: boolean) {
  const shown = (type.art.layers ?? []).map((layer, index) => ({ layer, index })).filter(({ layer }) => {
    const [from, to] = layer.density ?? [0]
    return perTile >= from && (to === undefined || perTile < to)
  })
  const own = shown.reduce((n, { layer }) => n + ownCount(layer), 0) * tileArea(hex)
  const m = own > 0 ? perTile / own : 0
  const finer = Math.sqrt(Math.max(1, m))
  return shown.map(({ layer, index }) => {
    const [sx, sy] = spacingOf(layer)
    return { layer, index, sx: Math.max(0.05, sx / finer), sy: Math.max(0.05, sy / finer), keep: layer.keep * Math.min(1, m) }
  })
}

function sceneryOf(paint: MapPaint, grid: MapGrid, pack: PaintPack, out: Sprite[], channel: 'scenery' | 'effects' = 'scenery') {
  const n = grid.cols * grid.rows
  const kind = channel === 'scenery' ? 'scenery' : 'effect'
  const scenery = rleDecode(paint[channel] ?? '', n)
  const tilesOf = new Map<number, [number, number][]>()
  for (let i = 0; i < n; i += 1) {
    const e = scenery[i]
    if (!e) continue
    const list = tilesOf.get(e) ?? []
    list.push([i % grid.cols, Math.floor(i / grid.cols)])
    tilesOf.set(e, list)
  }
  if (!tilesOf.size) return
  const size = grid.size
  for (const [entry, tiles] of tilesOf) {
    const paletteEntry = paint.palette[entry - 1]
    const type = paletteEntry && typeOf(pack, paletteEntry.type)
    if (!type || type.kind !== kind) continue
    const colors = paletteEntry.colors
    const seed = seedOf(type.key)
    const own = ownPerTile(type, grid.type === 'hex')
    const perTile = kind === 'scenery' ? paletteEntry.per_tile ?? own : own
    // the region's box (map px)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [c, r] of tiles) {
      const [cx, cy] = tileCenter(grid, c, r)
      x0 = Math.min(x0, cx - size); y0 = Math.min(y0, cy - size); x1 = Math.max(x1, cx + size); y1 = Math.max(y1, cy + size)
    }
    const footprints: [number, number, number][] = []
    // Types with an inset (castles): their sprites stand that far inside the outer edges (no wobble: walls there)
    const inside = type.art.inset ? insideWalls(grid, scenery, entry, type.art.inset * size) : null
    for (const at of layersAt(type, perTile, grid.type === 'hex')) {
      const { layer, index: li } = at
      const spx = at.sx * size, spy = at.sy * size
      const jitter = layer.jitter ?? 0.8
      const s = seed + li * 7919
      for (let cy = Math.floor(y0 / spy) - 1; cy <= Math.ceil(y1 / spy) + 1; cy += 1) {
        const shift = cy & 1 ? 0.5 : 0
        for (let cx = Math.floor(x0 / spx) - 1; cx <= Math.ceil(x1 / spx) + 1; cx += 1) {
          if (rand(cx, cy, s) > at.keep) continue
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
            flip: (pack.style.mirror_sprites ?? true) && rand(cx, cy, s + 5) > 0.5, sway: layer.sway ?? 0, phase: rand(cx, cy, s + 6) * 6.283, spin: 0,
            motion: 0, amount: 0, speed: 0, blink: 0, depth: y, ...(layer.fade ? { fade: layer.fade } : {}) })
          if (layer.flame) flameOn(layer.flame, x, y, h, y, entry, 3, cx * 7919 + cy, out)
        }
      }
    }
    // Fireflies (shown at night): glows wandering over the region
    const flies = Math.min(1, (type.art.night?.fireflies ?? 0) * (own > 0 ? perTile / own : 1))
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
    // Particles (effects): scattered like scenery (organic edges), drawn and moved by the sprite shader
    ;(type.art.particles ?? []).forEach((p, pi) => {
      const sp = size / Math.sqrt(Math.max(0.1, Math.min(40, p.density)))
      const s = seed + 15485863 + pi * 104723
      const row = { a: 1, b: 2, c: 3 }[p.color ?? 'a'] ?? 1
      for (let cy = Math.floor(y0 / sp); cy <= Math.ceil(y1 / sp); cy += 1) {
        for (let cx = Math.floor(x0 / sp); cx <= Math.ceil(x1 / sp); cx += 1) {
          const x = (cx + rand(cx, cy, s)) * sp, y = (cy + rand(cx, cy, s + 1)) * sp
          const [wx, wy] = wobble(x, y, size)
          const tile = tileAt(grid, x + wx, y + wy)
          if (!inGrid(grid, tile) || scenery[tile[1] * grid.cols + tile[0]] !== entry) continue
          const h = (p.size[0] + (p.size[1] - p.size[0]) * rand(cx, cy, s + 2)) * size
          // (a flame stands on its point: lifted by half its height)
          const lift = (p.shape === 'flame' ? h / 2 : 0) + (p.lift ? (p.lift[0] + (p.lift[1] - p.lift[0]) * rand(cx, cy, s + 3)) * size : 0)
          out.push({ name: '', colors, px: 0, x, y, w: h * (p.stretch ?? 1), h, ax: 0.5, ay: 0.5, flip: false, sway: 0,
            phase: rand(cx, cy, s + 4) * 6.283, spin: 0, motion: 0, amount: (p.amount ?? 0) * size,
            speed: (p.speed ?? 0.3) * (0.75 + 0.5 * rand(cx, cy, s + 5)), blink: 0, depth: y,
            particle: { shape: PARTICLE_SHAPES[p.shape] ?? 1, motion: PARTICLE_MOTIONS[p.motion ?? 'still'] ?? 0, lift, opacity: p.opacity ?? 1,
              entry, row, glow: Boolean(p.glow), night: Boolean(p.night), twinkle: p.twinkle ?? 0, spin: p.spin ?? 0 } })
        }
      }
    })
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

// -- boundaries --------------------------------------------------------------------------------------------------

function boundariesOf(paint: MapPaint, grid: MapGrid, pack: PaintPack, out: Sprite[]) {
  const n = grid.cols * grid.rows
  const own = ownEdges(grid)
  const channels = own.map((_, k) => rleDecode(paint[BOUND_CHANNELS[k]] ?? '', n))
  if (!channels.some((ch) => ch.some(Boolean))) return
  const sides = rleDecode(paint.bound_sides ?? '', n)
  const roads = rleDecode(paint.roads ?? '', n)
  const rivers = rleDecode(paint.rivers ?? '', n)
  const riverKinds = rleDecode(paint.river_kinds ?? '', n)
  const size = grid.size
  // where edges meet: the boundaries there (towers where one ends, turns or meets others)
  const vertices = new Map<string, { x: number; y: number; entries: number[]; dirs: [number, number][]; outs: [number, number][] }>()
  const place = (name: string | undefined, colors: [string, string, string], x: number, y: number, height: number, depth: number) => {
    const shape = name ? spriteShape(pack.sprites[name]) : null
    if (!name || !shape) return
    const h = height * size
    out.push({ name, colors, px: pack.style.sprite_px, x, y, w: h * shape.w / shape.h, h, ax: shape.ax, ay: shape.ay, flip: false,
      sway: 0, phase: 0, spin: 0, motion: 0, amount: 0, speed: 0, blink: 0, depth })
  }
  for (let i = 0; i < n; i += 1) {
    const c = i % grid.cols, r = Math.floor(i / grid.cols)
    own.forEach((d, k) => {
      const entry = channels[k][i]
      if (!entry) return
      const pe = paint.palette[entry - 1]
      const type = pe && typeOf(pack, pe.type)
      const [dc, dr] = directions(grid, r)[d]
      const ends = edgeEnds(grid, c, r, d)
      if (!type || type.kind !== 'boundary' || !ends || !inGrid(grid, [c + dc, r + dr])) return
      const [a, b] = ends
      const art = type.art
      const look = BOUNDARY_LOOKS[art.look ?? ''] ?? 3
      const cliff = sided(art.look)
      const slope = art.look === 'slope'
      const H = (art.height ?? 0.1) * size, T = (art.thickness ?? 0.03) * size, run = slope ? (art.run ?? 0.2) * size : 0
      // its high side: this tile, or (its bit) the neighbour; outward: toward the low side
      const [hx, hy] = sides[i] & (1 << k) ? tileCenter(grid, c + dc, r + dr) : tileCenter(grid, c, r)
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
      const len = Math.hypot(mx - hx, my - hy) || 1
      const outX = (mx - hx) / len, outY = (my - hy) / len
      const road = Boolean(roads[i] & (1 << d))
      const river = Boolean(rivers[i] & (1 << d))
      const falls = river && !road && art.falls !== false
      // cliffs hang their face below their edge (toward us); walls stand on it
      const dy = cliff ? H : 0
      const piece = (x0: number, y0: number, x1: number, y1: number) => {
        if (Math.hypot(x1 - x0, y1 - y0) < 0.5) return
        // (one seed per boundary: its stones and gaps run on from edge to edge; a cliff's face is behind what stands
        // below its edge)
        out.push({ name: '', colors: pe.colors, px: 0, x: x0, y: y0 + dy, w: 0, h: H, ax: 0, ay: 0, flip: false, sway: 0, phase: (entry * 0.618) % 1 * 6.28,
          spin: 0, motion: 0, amount: 0, speed: 0, blink: 0, depth: Math.max(y0, y1) + 0.01,
          box: { qx: x1, qy: y1 + dy, thick: Math.max(T, 1), look, entry, gaps: art.gaps ?? 0, cliff, outX, outY, ...(slope ? { run } : {}) } })
      }
      if (!road && !(river && !falls)) piece(a[0], a[1], b[0], b[1])
      else {
        // an opening in the middle: a gate (roads), the river passing through (fences, hedges)
        const l = Math.hypot(b[0] - a[0], b[1] - a[1])
        const half = Math.min(0.13 * size, l * 0.35)
        const ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l
        piece(a[0], a[1], mx - ux * half, my - uy * half)
        piece(mx + ux * half, my + uy * half, b[0], b[1])
        if (road && art.gate) place(art.gate.sprite, pe.colors, mx, my + dy, art.gate.height, my + dy + 0.02)
      }
      if (falls) waterfallOf(paint, grid, pack, out, { a, b, H, cliff, run, out: [outX, outY], riverEntry: riverKinds[i], seed: i * 7 + k })
      for (const [v, w] of [[a, b], [b, a]]) {
        const key = `${Math.round(v[0] * 10)},${Math.round(v[1] * 10)}`
        const vertex = vertices.get(key) ?? { x: v[0], y: v[1], entries: [], dirs: [], outs: [] }
        const l = Math.hypot(w[0] - v[0], w[1] - v[1]) || 1
        vertex.entries.push(entry)
        vertex.dirs.push([(w[0] - v[0]) / l, (w[1] - v[1]) / l])
        vertex.outs.push([outX, outY])
        vertices.set(key, vertex)
      }
    })
  }
  // slopes' corners: a cone where two slopes turn outward (their faces part there) or where one ends
  for (const v of vertices.values()) {
    const slopes = v.entries.map((e, i) => [e, i] as const).filter(([e]) => typeOf(pack, paint.palette[e - 1]?.type ?? '')?.art.look === 'slope')
    if (!slopes.length || slopes.length > 2 || v.entries.length > slopes.length) continue
    const [e0, i0] = slopes[0]
    const pe = paint.palette[e0 - 1]
    const art = typeOf(pack, pe.type)!.art
    const n1 = v.outs[i0]
    // one: its end, rounded (from its outward side to beyond its end); two: between their outward sides
    const n2: [number, number] = slopes.length === 1 ? [-v.dirs[i0][0], -v.dirs[i0][1]] : v.outs[slopes[1][1]]
    if (slopes.length === 2) {
      const [a1, a2] = [v.dirs[i0], v.dirs[slopes[1][1]]]
      // convex: each one's outward side points away from the other edge
      if (n1[0] * a2[0] + n1[1] * a2[1] > -0.05 || n2[0] * a1[0] + n2[1] * a1[1] > -0.05) continue
    }
    const H = (art.height ?? 0.1) * size
    out.push({ name: '', colors: pe.colors, px: 0, x: v.x, y: v.y + H, w: 0, h: H, ax: 0, ay: 0, flip: false, sway: 0, phase: (e0 * 0.618) % 1 * 6.28,
      spin: 0, motion: 0, amount: 0, speed: 0, blink: 0, depth: v.y + 0.012,
      box: { qx: v.x, qy: v.y + H, thick: Math.max((art.thickness ?? 0.03) * size, 1), look: BOUNDARY_LOOKS.slope, entry: e0, gaps: 0, cliff: true,
        outX: n1[0], outY: n1[1], run: (art.run ?? 0.2) * size, cone: [n1[0], n1[1], n2[0], n2[1]] } })
  }
  // towers (corner sprites) where a boundary ends, turns (not along a hex grid's zigzag) or meets others
  for (const v of vertices.values()) {
    const [d1, d2] = v.dirs
    if (v.dirs.length === 2 && d1[0] * d2[0] + d1[1] * d2[1] < -0.3) continue
    const entry = v.entries.find((e) => typeOf(pack, paint.palette[e - 1]?.type ?? '')?.art.corner)
    if (!entry) continue
    const pe = paint.palette[entry - 1]
    const art = typeOf(pack, pe.type)!.art
    if (art.gaps && rand(Math.round(v.x), Math.round(v.y), 31) < art.gaps) continue
    place(art.corner!.sprite, pe.colors, v.x, v.y, art.corner!.height, v.y + 0.03)
  }
}

/** A river's waterfall where it crosses a boundary (the edge a to b; the boundary's height; a cliff or slope (how far
 *  a slope reaches out), its outward side): the river's look and colours, in front of the boundary; mist (lava:
 *  sparks) at its foot. */
function waterfallOf(paint: MapPaint, grid: MapGrid, pack: PaintPack, out: Sprite[],
  { a, b, H, cliff, run, out: [ox, oy], riverEntry, seed }: { a: [number, number]; b: [number, number]; H: number; cliff: boolean; run: number;
    out: [number, number]; riverEntry: number; seed: number }) {
  const pe = paint.palette[riverEntry - 1]
  const type = pe && typeOf(pack, pe.type)
  if (!type || type.kind !== 'river') return
  const size = grid.size
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  let dx = (b[0] - a[0]) / l, dy = (b[1] - a[1]) / l
  if (dx < 0) { dx = -dx; dy = -dy }
  const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2
  // as wide as the river and a little more (it wobbles; the fall spreads over its lip)
  const half = (type.art.width ?? 0.04) * (pe.width ?? 1) * size * 1.25 + (type.art.wobble ?? 0) * 0.035 * size
  const across = Math.abs(dx) > 0.02
  // from its lip to its foot on the screen: down a cliff's face (H), down a slope (its run out, H down), a wall's height
  const [wx, wy] = run > 0 ? [ox * run, H + oy * run] : [0, H]
  const seen = run > 0 ? (oy > -0.05 || wy < 0) && Math.abs(dx * wy - dy * wx) > 0.5 : across && (!cliff || oy > 0.1)
  const mode = !seen ? 2 : cliff ? 0 : 1
  const lava = type.art.look === 'lava'
  const depth = Math.max(a[1], b[1]) + 0.02
  out.push({ name: '', colors: pe.colors, px: 0, x, y, w: 0, h: mode === 2 ? 0 : H, ax: 0, ay: 0, flip: false, sway: 0,
    phase: rand(seed, 3, 41) * 97, spin: 0, motion: 0, amount: 0, speed: 0, blink: 0, depth,
    fall: { dx, dy, half, mode, wx: mode === 2 ? 0 : wx, wy: mode === 2 ? 0 : wy, entry: riverEntry, lava, slope: run > 0 } })
  // at its foot, mist rising (lava: sparks)
  const foot = mode === 0 ? y + Math.max(0, wy) : y
  const count = mode === 2 ? 2 : 3
  for (let k = 0; k < count; k += 1) {
    const j = rand(seed, k, 43) - 0.5
    const r = lava ? size * 0.018 : half * (mode === 2 ? 1.1 : 1.5) * (0.8 + 0.4 * rand(seed, k, 47))
    out.push({ name: '', colors: pe.colors, px: 0, x: x + (mode === 0 ? wx : 0) + j * half * 2.2, y: foot + half * 0.3, w: r, h: r, ax: 0.5, ay: 0.5, flip: false, sway: 0,
      phase: rand(seed, k, 53) * 6.283, spin: 0, motion: 0, amount: lava ? size * 0.22 : size * 0.12 + H * 0.35,
      speed: lava ? 0.4 : 0.22 + 0.1 * rand(seed, k, 59), blink: 0, depth: depth + 0.01 + k * 0.001,
      particle: { shape: lava ? PARTICLE_SHAPES.spark : PARTICLE_SHAPES.puff, motion: PARTICLE_MOTIONS.rise, lift: 0,
        opacity: lava ? 0.9 : mode === 2 ? 0.35 : 0.45, entry: riverEntry, row: 3, glow: lava, night: false, twinkle: 0, spin: 0 } })
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
          if (part.flame && fi === 0) flameOn(part.flame, x, y, h, cy + pi * 0.01, 0, 3, seed + k, out)
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
  sceneryOf(paint, grid, pack, out, 'effects')
  boundariesOf(paint, grid, pack, out)
  featuresOf(paint, grid, pack, out)
  return out.sort((a, b) => a.depth - b.depth || a.x - b.x)
}
