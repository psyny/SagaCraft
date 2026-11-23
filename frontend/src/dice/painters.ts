/**
 * Painting helpers for the dice styles (dice/styles.ts): smooth noise, per-pixel fills (marble veins, granite
 * speckles, agate bands), roots, runes along a face's edges, gears, a wizard's seal, scrimshaw.
 * Everything is deterministic (a seed in, the same picture out), so every screen paints the same dice.
 */
import { hexToRgb, type RGB } from '../color/theory'

export type Pt = readonly [number, number]

/** Smooth value noise in 0..1 for a seed; `fbm` adds octaves. */
export function noise2(seed: number) {
  const hash = (ix: number, iy: number) => {
    let v = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)
    v = Math.imul(v ^ (v >>> 13), 1274126177)
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296
  }
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const value = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = smooth(x - ix), fy = smooth(y - iy)
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
  }
  const fbm = (x: number, y: number, octaves = 4) => {
    let sum = 0, amp = 0.5, f = 1, norm = 0
    for (let o = 0; o < octaves; o++) { sum += value(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2 }
    return sum / norm
  }
  return { value, fbm }
}

/** Fill a cell pixel by pixel: `at(u, v)` (0..1 across the cell) gives the colour (and alpha 0..1). */
export function paintPixels(g: CanvasRenderingContext2D, x: number, y: number, s: number, at: (u: number, v: number) => [number, number, number, number?]) {
  const x0 = Math.floor(x), y0 = Math.floor(y), w = Math.ceil(x + s) - x0, h = Math.ceil(y + s) - y0
  const img = g.getImageData(x0, y0, w, h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const [r, gg, b, a = 1] = at((x0 + i - x) / s, (y0 + j - y) / s)
      const k = (j * w + i) * 4
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = a * 255
    }
  }
  g.putImageData(img, x0, y0)
}

export const lerp = (a: RGB, b: RGB, t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
export const rgb = (hex: string): RGB => hexToRgb(hex)
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
export const smoothstep = (a: number, b: number, t: number) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k) }

/** Marble: a base with soft veins (dark) and fainter light ones, turbulent like real stone. */
export function marble(g: CanvasRenderingContext2D, x: number, y: number, s: number, seed: number, base: string, vein: string, light: string) {
  const n = noise2(seed)
  const B = rgb(base), V = rgb(vein), L = rgb(light)
  const angle = (seed % 7) * 0.4
  const ca = Math.cos(angle), sa = Math.sin(angle)
  paintPixels(g, x, y, s, (u, v) => {
    const t = n.fbm(u * 3, v * 3, 5) * 7
    const along = (u * ca + v * sa) * 6
    const d = Math.abs(Math.sin(along + t))
    const d2 = Math.abs(Math.sin(along * 1.7 + t * 1.3 + 2))
    let col = lerp(B, L, (n.fbm(u * 2 + 9, v * 2, 3) - 0.4) * 0.6)
    col = lerp(col, V, smoothstep(0.16, 0, d) * 0.85)
    col = lerp(col, L, smoothstep(0.08, 0, d2) * 0.5)
    return col
  })
}

/** Speckled stone (granite): fine noise, flecks of the given colours, small pits darker. */
export function speckled(g: CanvasRenderingContext2D, x: number, y: number, s: number, seed: number, base: string,
  flecks: { color: string; share: number; size: number }[], grain = 0.18) {
  const n = noise2(seed)
  const B = rgb(base)
  const F = flecks.map((f) => ({ ...f, rgb: rgb(f.color), noise: noise2(seed + f.color.length * 31 + Math.round(f.share * 1000)) }))
  paintPixels(g, x, y, s, (u, v) => {
    const shade = 1 + (n.fbm(u * 40, v * 40, 2) - 0.5) * grain * 2
    let col: [number, number, number] = [B[0] * shade, B[1] * shade, B[2] * shade]
    for (const f of F) {
      const k = f.noise.value(u * f.size, v * f.size)
      if (k > 1 - f.share) col = lerp(col, f.rgb, smoothstep(1 - f.share, 1 - f.share * 0.6, k))
    }
    return col
  })
}

/** Agate: concentric bands around a wandering centre, alternating the colours given. */
export function agate(g: CanvasRenderingContext2D, x: number, y: number, s: number, seed: number, bands: string[]) {
  const n = noise2(seed)
  const C = bands.map(rgb)
  const cx = 0.3 + (seed % 5) * 0.1, cy = 0.35 + (seed % 3) * 0.12
  paintPixels(g, x, y, s, (u, v) => {
    const warp = (n.fbm(u * 2.5, v * 2.5, 4) - 0.5) * 0.35
    const d = Math.hypot(u - cx + warp, (v - cy) * 1.3 - warp) * 9
    const i = Math.floor(d) % C.length
    const f = d - Math.floor(d)
    return lerp(C[i], C[(i + 1) % C.length], smoothstep(0.75, 1, f))
  })
}

/** Roots: branching, tapering lines from the cell's edges inwards. */
export function roots(g: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number, color: string, width = 0.03) {
  g.save()
  g.strokeStyle = color
  g.lineCap = 'round'
  const branch = (px: number, py: number, a: number, w: number, depth: number) => {
    let cx = px, cy = py, ang = a
    const steps = 5 + Math.floor(rnd() * 4)
    for (let k = 0; k < steps; k++) {
      const len = s * (0.03 + rnd() * 0.04)
      ang += (rnd() - 0.5) * 0.7
      const nx = cx + Math.cos(ang) * len, ny = cy + Math.sin(ang) * len
      g.lineWidth = Math.max(0.6, w * (1 - k / (steps + 1)))
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(nx, ny); g.stroke()
      cx = nx; cy = ny
      if (depth > 0 && rnd() < 0.35) branch(cx, cy, ang + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), w * 0.6, depth - 1)
    }
  }
  for (let k = 0; k < 5; k++) {
    const side = Math.floor(rnd() * 4)
    const t = rnd()
    const [px, py, a] = side === 0 ? [x + t * s, y, Math.PI / 2] : side === 1 ? [x + s, y + t * s, Math.PI]
      : side === 2 ? [x + t * s, y + s, -Math.PI / 2] : [x, y + t * s, 0]
    branch(px, py, a + (rnd() - 0.5) * 0.6, s * width, 3)
  }
  g.restore()
}

/** Runes written along a face's edges, just inside them (each glyph a stave and a few branches). */
export function edgeRunes(g: CanvasRenderingContext2D, outline: Pt[], center: Pt, rnd: () => number, color: string, s: number) {
  g.save()
  g.strokeStyle = color
  g.lineWidth = Math.max(1, s * 0.006)
  g.lineCap = 'round'
  const h = s * 0.045
  for (let e = 0; e < outline.length; e++) {
    const p = outline[e], q = outline[(e + 1) % outline.length]
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    const angle = Math.atan2(q[1] - p[1], q[0] - p[0])
    const step = h * 0.9
    for (let t = 0.14; t < 0.86; t += step / len) {
      // A point just inside the edge, the glyph's foot on a line parallel to it
      let gx = p[0] + (q[0] - p[0]) * t, gy = p[1] + (q[1] - p[1]) * t
      gx += (center[0] - gx) * 0.1; gy += (center[1] - gy) * 0.1
      g.save()
      g.translate(gx, gy)
      g.rotate(angle)
      // Readable from inside the face: the glyph rises towards the centre
      const side = ((center[0] - gx) * -Math.sin(angle) + (center[1] - gy) * Math.cos(angle)) > 0 ? 1 : -1
      g.scale(1, side)
      g.beginPath()
      g.moveTo(0, 0); g.lineTo(0, h) // the stave
      const kind = Math.floor(rnd() * 6)
      if (kind === 0) { g.moveTo(0, h); g.lineTo(h * 0.4, h * 0.65) }
      if (kind === 1) { g.moveTo(0, h * 0.8); g.lineTo(h * 0.35, h * 0.45); g.lineTo(0, h * 0.15) }
      if (kind === 2) { g.moveTo(-h * 0.3, h * 0.7); g.lineTo(h * 0.3, h * 0.3) }
      if (kind === 3) { g.moveTo(0, h); g.lineTo(h * 0.35, h * 0.7); g.moveTo(0, h * 0.6); g.lineTo(h * 0.35, h * 0.3) }
      if (kind === 4) { g.moveTo(-h * 0.3, h); g.lineTo(0, h * 0.6); g.lineTo(h * 0.3, h) }
      if (kind === 5) { g.moveTo(0, h * 0.5); g.lineTo(h * 0.3, h * 0.8); g.moveTo(0, h * 0.5); g.lineTo(-h * 0.3, h * 0.8) }
      g.stroke()
      g.restore()
    }
  }
  g.restore()
}

/** A gear: a toothed ring with an axle hole. */
export function gear(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, teeth: number, color: string, turn: number, fill?: string) {
  g.save()
  g.beginPath()
  for (let k = 0; k < teeth * 2; k++) {
    const a0 = turn + (k / (teeth * 2)) * Math.PI * 2, a1 = turn + ((k + 1) / (teeth * 2)) * Math.PI * 2
    const rr = k % 2 ? r : r * 1.18
    g.lineTo(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr)
    g.lineTo(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr)
  }
  g.closePath()
  if (fill) { g.fillStyle = fill; g.fill() }
  g.strokeStyle = color
  g.lineWidth = Math.max(1, r * 0.09)
  g.stroke()
  g.beginPath(); g.arc(cx, cy, r * 0.32, 0, Math.PI * 2); g.stroke()
  for (let k = 0; k < 4; k++) {
    const a = turn + (k * Math.PI) / 2
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.32, cy + Math.sin(a) * r * 0.32); g.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); g.stroke()
  }
  g.restore()
}

/** A wizard's seal on a face, in from its edges (never on them): a double frame along the edges, a circle inscribed in
 *  it (touching the frame at each edge's middle, a notch there), a second circle inside with marks between the two
 *  (small circles, triangles, ticks), and in each corner a seal (a ringed dot in a triangle) tied to the corner.
 *  `outline` is the face's polygon (atlas px) around `center`; sizes follow the face (its inradius), so every die's
 *  seal looks the same. */
export function arcaneSeal(g: CanvasRenderingContext2D, outline: Pt[], center: Pt, color: string, blur = 0) {
  const [cx, cy] = center
  const n = outline.length
  const at = (k: number) => outline.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as Pt)
  // The face's inradius (from the centre to its nearest edge)
  const inr = Math.min(...outline.map(([px, py], i) => {
    const [qx, qy] = outline[(i + 1) % n]
    return Math.abs((qx - px) * (py - cy) - (px - cx) * (qy - py)) / Math.hypot(qx - px, qy - py)
  }))
  const bold = Math.max(2.2, inr * 0.05), thin = Math.max(1.4, inr * 0.028)
  g.save()
  g.strokeStyle = color
  g.fillStyle = color
  g.lineCap = 'round'
  g.lineJoin = 'round'
  if (blur) { g.shadowColor = color; g.shadowBlur = blur * inr }
  const poly = (pts: Pt[], width: number) => {
    g.lineWidth = width
    g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke()
  }
  const circle = (x: number, y: number, r: number, width: number, fill = false) => {
    g.lineWidth = width
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2)
    if (fill) g.fill(); else g.stroke()
  }
  const triangle = (x: number, y: number, r: number, angle: number, width: number) => {
    g.lineWidth = width
    g.beginPath()
    for (let k = 0; k < 3; k++) {
      const a = angle + (k * Math.PI * 2) / 3
      k ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    }
    g.closePath(); g.stroke()
  }
  // The frame: two lines along the edges, just inside them
  const outer = at(0.93), inner = at(0.87)
  poly(outer, bold)
  poly(inner, thin)
  // The circle inscribed in the frame (touching it at each edge's middle), a second inside, marks between the two
  const r1 = inr * 0.87, r2 = inr * 0.75
  circle(cx, cy, r1, bold)
  circle(cx, cy, r2, thin)
  const marks = n * 4
  for (let k = 0; k < marks; k++) {
    const a = (k / marks) * Math.PI * 2 + Math.PI / marks
    const rm = (r1 + r2) / 2, mx = cx + Math.cos(a) * rm, my = cy + Math.sin(a) * rm
    const kind = k % 4
    if (kind === 0) circle(mx, my, (r1 - r2) * 0.28, thin * 0.8)
    else if (kind === 2) triangle(mx, my, (r1 - r2) * 0.34, a, thin * 0.8)
    else {
      g.lineWidth = thin * 0.8
      g.beginPath()
      g.moveTo(cx + Math.cos(a) * (r2 + (r1 - r2) * 0.2), cy + Math.sin(a) * (r2 + (r1 - r2) * 0.2))
      g.lineTo(cx + Math.cos(a) * (r1 - (r1 - r2) * 0.2), cy + Math.sin(a) * (r1 - (r1 - r2) * 0.2))
      g.stroke()
    }
  }
  // A notch where the circle touches each edge: a small diamond across the frame
  for (let i = 0; i < n; i++) {
    const [px, py] = inner[i], [qx, qy] = inner[(i + 1) % n]
    const mx = (px + qx) / 2, my = (py + qy) / 2
    const d = Math.hypot(mx - cx, my - cy), ux = (mx - cx) / d, uy = (my - cy) / d
    const w = inr * 0.045, h = inr * 0.07
    g.lineWidth = thin
    g.beginPath()
    g.moveTo(mx - ux * h, my - uy * h); g.lineTo(mx - uy * w, my + ux * w)
    g.lineTo(mx + ux * h, my + uy * h); g.lineTo(mx + uy * w, my - ux * w)
    g.closePath(); g.stroke()
  }
  // Corner seals: in the space between the circle and the corner, a ringed dot in a triangle, tied to the corner
  for (let i = 0; i < n; i++) {
    const [vx, vy] = inner[i]
    const dv = Math.hypot(vx - cx, vy - cy)
    const room = dv - r1
    if (room < inr * 0.12) continue
    const ux = (vx - cx) / dv, uy = (vy - cy) / dv
    const sr = Math.min(inr * 0.17, room * 0.3)
    const sx = cx + ux * (r1 + room * 0.45), sy = cy + uy * (r1 + room * 0.45)
    triangle(sx, sy, sr * 1.25, Math.atan2(uy, ux), thin)
    circle(sx, sy, sr * 0.5, thin * 0.8)
    circle(sx, sy, sr * 0.16, 0, true)
    g.lineWidth = thin * 0.8
    g.beginPath(); g.moveTo(sx + ux * sr * 1.25, sy + uy * sr * 1.25); g.lineTo(vx, vy); g.stroke()
  }
  g.restore()
}

/** Scrimshaw: fine etched waves and a vine near a face's edges. */
export function scrimshaw(g: CanvasRenderingContext2D, x: number, y: number, s: number, rnd: () => number, color: string) {
  g.save()
  g.strokeStyle = color
  g.lineWidth = Math.max(1, s * 0.006)
  g.globalAlpha = 0.85
  for (let k = 0; k < 3; k++) {
    const y0 = y + s * (0.12 + k * 0.03)
    g.beginPath()
    for (let i = 0; i <= 24; i++) {
      const px = x + s * (0.1 + 0.8 * (i / 24))
      const py = y0 + Math.sin(i * 0.9 + k) * s * 0.012
      i ? g.lineTo(px, py) : g.moveTo(px, py)
    }
    g.stroke()
  }
  // A curling vine along the bottom
  g.beginPath()
  const yb = y + s * 0.84
  for (let i = 0; i <= 30; i++) {
    const px = x + s * (0.12 + 0.76 * (i / 30))
    const py = yb + Math.sin(i * 0.6) * s * 0.03
    i ? g.lineTo(px, py) : g.moveTo(px, py)
  }
  g.stroke()
  for (let i = 0; i < 6; i++) {
    const px = x + s * (0.18 + i * 0.12), py = yb + (i % 2 ? 1 : -1) * s * 0.035
    g.beginPath(); g.arc(px, py, s * (0.012 + rnd() * 0.008), 0, Math.PI * 2); g.stroke()
  }
  g.restore()
}
