/**
 * The weather over a map (plan 49): it falls **onto the map**, not across the screen. Every drop, flake or leaf has a
 * ground point on the map (map px) and a height over it; it's drawn the way the painter draws things standing up (a
 * height goes up the screen) with a little perspective (the higher, the nearer the eye: further from the view's middle
 * and bigger), so it moves with the map when it pans or zooms, and it falls toward the ground. Where it lands it leaves
 * a mark: rain splashes, hail bounces, snow and ash settle and melt away, leaves lie down, embers spark. Fog banks drift
 * over the ground. Storms strike lightning onto a ground point.
 *
 * Sizes and amounts are the screen's (the same at any zoom); only where things land is the map's. Shapes are drawn
 * once (ash and embers as irregular flakes, snowflakes, leaves, fog banks) and stamped. The EFX map weather's
 * `weather` and `fog` effects are drawn here; its other effects (a vignette...) stay screen effects (EfxLayerView).
 */
import type { EfxEffect } from '../../api/types'
import { hexA, rng } from '../../efx/random'
import { intensityAt } from '../../efx/variation'

/** Map px to the box's px: box = map * s + (x, y); the box's size. */
export interface WeatherView { x: number; y: number; s: number; w: number; h: number }

/** The effect kinds drawn on the map (the others are screen effects). */
export const MAP_WEATHER_KINDS = new Set(['weather', 'fog'])

interface Drop { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; rot: number; spin: number; phase: number; c: number; age: number; life: number }
/** A mark on the ground: what a landing leaves. */
interface Mark { x: number; y: number; age: number; life: number; size: number; kind: MarkKind; rot: number; c: number; z: number; vz: number }
type MarkKind = 'splash' | 'droplet' | 'flake' | 'ash' | 'leaf' | 'bounce' | 'spark' | 'dust' | 'glow'

const LEAVES = ['#c1502e', '#d98a2b', '#a8432a', '#e3b23c', '#7d5a2c']
const MAX_MARKS = 1600

// -- shapes, drawn once ---------------------------------------------------------------------------------------

type Shape = HTMLCanvasElement
const shapes = new Map<string, Shape[]>()

function draw(key: string, count: number, size: number, paint: (c: CanvasRenderingContext2D, s: number, i: number, r: () => number) => void): Shape[] {
  const known = shapes.get(key)
  if (known) return known
  const r = rng(key.length * 7919 + 17)
  const out = Array.from({ length: count }, (_, i) => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = size
    const c = cv.getContext('2d')
    if (c) paint(c, size, i, r)
    return cv
  })
  shapes.set(key, out)
  return out
}

/** An irregular flake (ash, embers): 6 to 8 corners at random distances. */
function flakePath(c: CanvasRenderingContext2D, s: number, r: () => number) {
  const n = 6 + Math.floor(r() * 3)
  c.beginPath()
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.5
    const d = s * (0.22 + r() * 0.24)
    const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d * (0.6 + r() * 0.4)
    if (k) c.lineTo(x, y)
    else c.moveTo(x, y)
  }
  c.closePath()
}

const ashShapes = () => draw('ash', 6, 32, (c, s, i, r) => {
  flakePath(c, s, r)
  const g = c.createLinearGradient(0, 0, s, s)
  const tone = 70 + i * 9
  g.addColorStop(0, `rgb(${tone + 30}, ${tone + 26}, ${tone + 22})`)
  g.addColorStop(1, `rgb(${tone - 20}, ${tone - 22}, ${tone - 24})`)
  c.fillStyle = g
  c.fill()
  c.strokeStyle = 'rgba(40, 36, 34, 0.5)'
  c.lineWidth = 1
  c.stroke()
})

/** Embers: a flake burning at its edges (drawn with 'lighter'), and its glow. */
const emberShapes = () => draw('ember', 6, 40, (c, s, _i, r) => {
  c.shadowColor = 'rgba(255, 120, 30, 0.9)'
  c.shadowBlur = s * 0.18
  flakePath(c, s, r)
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.42)
  g.addColorStop(0, '#fff2c8')
  g.addColorStop(0.35, '#ffb347')
  g.addColorStop(0.75, '#ff6a1a')
  g.addColorStop(1, '#a8300f')
  c.fillStyle = g
  c.fill()
})

const snowShapes = () => draw('snow', 3, 32, (c, s, i) => {
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = g
  c.fillRect(0, 0, s, s)
  if (i === 0) return
  // a crystal's arms
  c.strokeStyle = 'rgba(255,255,255,0.8)'
  c.lineWidth = s * 0.05
  c.lineCap = 'round'
  c.beginPath()
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + i
    c.moveTo(s / 2, s / 2)
    c.lineTo(s / 2 + Math.cos(a) * s * 0.42, s / 2 + Math.sin(a) * s * 0.42)
  }
  c.stroke()
})

const leafShapes = () => draw('leaf', LEAVES.length, 32, (c, s, i) => {
  c.translate(s / 2, s / 2)
  c.beginPath()
  c.moveTo(-s * 0.42, 0)
  c.quadraticCurveTo(-s * 0.05, -s * 0.3, s * 0.4, 0)
  c.quadraticCurveTo(-s * 0.05, s * 0.3, -s * 0.42, 0)
  c.fillStyle = LEAVES[i]
  c.fill()
  c.strokeStyle = 'rgba(60, 30, 10, 0.55)'
  c.lineWidth = s * 0.035
  c.beginPath()
  c.moveTo(-s * 0.46, 0)
  c.lineTo(s * 0.36, 0)
  c.stroke()
})

const glowShape = () => draw('glow', 1, 32, (c, s) => {
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = g
  c.fillRect(0, 0, s, s)
})[0]

/** Fog banks: soft, ragged clouds (white: tinted when drawn). */
const fogShapes = () => draw('fog', 3, 256, (c, s, _i, r) => {
  for (let k = 0; k < 18; k++) {
    const x = s * (0.15 + r() * 0.7), y = s * (0.35 + r() * 0.3), rad = s * (0.06 + r() * 0.16)
    const g = c.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, 'rgba(255,255,255,0.4)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g
    c.fillRect(0, 0, s, s)
  }
})

/** A shape in another colour (snow, fog): cached per colour. */
const tinted = new Map<string, Shape>()
function tint(shape: Shape, color: string, key: string): Shape {
  const k = `${key}|${color}`
  const known = tinted.get(k)
  if (known) return known
  const cv = document.createElement('canvas')
  cv.width = shape.width
  cv.height = shape.height
  const c = cv.getContext('2d')
  if (c) {
    c.drawImage(shape, 0, 0)
    c.globalCompositeOperation = 'source-in'
    c.fillStyle = color
    c.fillRect(0, 0, cv.width, cv.height)
  }
  tinted.set(k, cv)
  return cv
}

// -- the weather -----------------------------------------------------------------------------------------------

interface Frame {
  ctx: CanvasRenderingContext2D
  view: WeatherView
  /** The view in map px: its left, top, width, height; its middle; the eye's distance (perspective). */
  left: number; top: number; mw: number; mh: number; cx: number; cy: number; depth: number
  seconds: number
  dt: number
}

/** A point at height z over the map point (x, y), in the box: x, y, and how much nearer (bigger) it is. */
function project(f: Frame, x: number, y: number, z: number): [number, number, number] {
  const k = 1 + z / f.depth
  const px = f.cx + (x - f.cx) * k
  const py = f.cy + (y - z * 0.75 - f.cy) * k
  return [px * f.view.s + f.view.x, py * f.view.s + f.view.y, k]
}

interface Layer {
  frame(f: Frame, advance: boolean): void
  /** As if it had been falling for a while (a map opened in the rain: no slow start). */
  warm?(f: Frame): void
}

/** How a kind of weather falls and lands. */
interface Kind {
  /** Drops on a 1600 × 900 view at full amount. */
  density: number
  /** Seconds to fall (a range), and from how high (of the view's height). */
  fall: [number, number]
  height: number
  /** How far the wind carries it, per height fallen. */
  drift: number
  /** Drawn with 'lighter' (glows). */
  glow?: boolean
  /** Low over the ground, blown along (sand, wind) rather than falling. */
  blown?: boolean
  /** Rises from the ground (fireflies wander). */
  wander?: boolean
}

const KINDS: Record<string, Kind> = {
  rain: { density: 900, fall: [0.45, 0.6], height: 0.45, drift: 0.35 },
  storm: { density: 1000, fall: [0.38, 0.5], height: 0.5, drift: 0.55 },
  snow: { density: 480, fall: [6, 10], height: 0.42, drift: 0.6 },
  hail: { density: 380, fall: [0.5, 0.7], height: 0.45, drift: 0.2 },
  sandstorm: { density: 900, fall: [1, 1], height: 0.08, drift: 0, blown: true },
  wind: { density: 40, fall: [1, 1], height: 0.1, drift: 0, blown: true },
  leaves: { density: 70, fall: [5, 8], height: 0.4, drift: 0.9 },
  embers: { density: 220, fall: [6, 9], height: 0.4, drift: 0.5, glow: true },
  ash: { density: 220, fall: [7, 11], height: 0.42, drift: 0.5 },
  fireflies: { density: 46, fall: [1, 1], height: 0.06, drift: 0, glow: true, wander: true },
}

function weatherLayer(effect: EfxEffect): Layer {
  const p = effect.params
  const key = String(p.kind ?? 'rain')
  const kind = KINDS[key] ?? KINDS.rain
  const wind = Number(p.wind ?? 15) / 100
  const size = Number(p.size ?? 100) / 100
  const chaos = Number(p.chaos ?? 30) / 100
  const length = Number(p.length ?? 50) / 100
  const color = String(p.color ?? '#cfd8ea')
  const random = rng(effect.id.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 7))
  const drops: Drop[] = []
  const marks: Mark[] = []
  let flash = 0, bolt: [number, number][] = [], nextStrike = 2

  const blank = (): Drop => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, rot: 0, spin: 0, phase: 0, c: 0, age: 0, life: 1 })
  /** A new drop over the view (first: anywhere in its fall). */
  const spawn = (d: Drop, f: Frame, first: boolean) => {
    const H = f.mh * kind.height
    d.age = 0
    d.phase = random() * 6.283
    d.c = Math.floor(random() * 6)
    d.rot = random() * 6.283
    d.spin = (random() - 0.5) * 4 * (0.4 + chaos)
    d.size = (0.6 + random() * 0.8) * size
    if (kind.blown) {
      // low over the ground, from the windward side
      const dir = wind >= 0 ? 1 : -1
      d.vx = dir * f.mw * (0.25 + random() * 0.35) * (0.4 + Math.abs(wind))
      d.vy = (random() - 0.5) * f.mh * 0.02 * (1 + 3 * chaos)
      d.x = first ? f.left + random() * f.mw : dir > 0 ? f.left - f.mw * 0.1 : f.left + f.mw * 1.1
      d.y = f.top + random() * f.mh
      d.z = random() * H
      d.vz = 0
      d.life = 99
      return
    }
    if (kind.wander) {
      d.x = f.left + random() * f.mw
      d.y = f.top + random() * f.mh
      d.z = H * (0.2 + random())
      d.vx = d.vy = d.vz = 0
      d.life = 99
      return
    }
    const t = kind.fall[0] + random() * (kind.fall[1] - kind.fall[0])
    d.vz = H / t
    d.vx = wind * kind.drift * d.vz + (random() - 0.5) * chaos * d.vz * 0.25
    d.vy = Math.abs(wind) * kind.drift * d.vz * 0.15
    // where it lands: anywhere over the view (a margin for the wind)
    const gx = f.left - f.mw * 0.1 + random() * f.mw * 1.2, gy = f.top - f.mh * 0.05 + random() * f.mh * 1.15
    const z = first ? random() * H : H * (0.9 + random() * 0.2)
    const ft = z / d.vz
    d.x = gx - d.vx * ft
    d.y = gy - d.vy * ft
    d.z = z
    d.life = 99
  }

  const land = (d: Drop) => {
    const mark = (kindOf: MarkKind, life: number, extra: Partial<Mark> = {}) => {
      if (marks.length < MAX_MARKS) marks.push({ x: d.x, y: d.y, age: 0, life, size: d.size, kind: kindOf, rot: d.rot, c: d.c, z: 0, vz: 0, ...extra })
    }
    if (key === 'rain' || key === 'storm') {
      mark('splash', 0.3)
      if (random() < 0.5) mark('droplet', 0.35, { rot: random() * 6.283, vz: 1 })
    } else if (key === 'hail') {
      mark('bounce', 0.5, { vz: 1 })
      mark('splash', 0.2, { size: d.size * 0.6 })
    } else if (key === 'snow') {
      mark('flake', 5 + random() * 5)
    } else if (key === 'ash') {
      mark('ash', 4 + random() * 4)
    } else if (key === 'leaves') {
      mark('leaf', 5 + random() * 4)
    } else if (key === 'embers') {
      mark('glow', 0.7)
      mark('ash', 2.5 + random() * 2)
      if (random() < 0.5) mark('spark', 0.5, { rot: random() * 6.283 })
    }
  }

  const move = (d: Drop, f: Frame) => {
    const dt = f.dt
    d.age += dt
    d.rot += d.spin * dt
    if (kind.blown) {
      d.x += d.vx * dt
      d.y += d.vy * dt
      if (random() < dt * 0.02 && key === 'sandstorm' && marks.length < MAX_MARKS) {
        marks.push({ x: d.x, y: d.y, age: 0, life: 1.6, size: d.size, kind: 'dust', rot: 0, c: 0, z: 0, vz: 0 })
      }
      return d.x > f.left - f.mw * 0.15 && d.x < f.left + f.mw * 1.15
    }
    if (kind.wander) {
      const w = 0.6 + 2 * chaos
      d.x += Math.sin(f.seconds * 0.5 + d.phase * 3) * f.mw * 0.012 * w * dt + wind * f.mw * 0.005 * dt
      d.y += Math.cos(f.seconds * 0.6 + d.phase * 2) * f.mh * 0.012 * w * dt
      return true
    }
    // falling: snow, ash, leaves and embers sway and flutter
    let sway = 0
    if (key === 'snow' || key === 'ash' || key === 'leaves' || key === 'embers') {
      sway = Math.sin(f.seconds * (0.9 + chaos) + d.phase) * f.mw * 0.01 * (0.5 + 2 * chaos)
    }
    d.x += (d.vx + sway) * dt
    d.y += d.vy * dt
    d.z -= d.vz * dt
    if (d.z <= 0) {
      d.z = 0
      land(d)
      return false
    }
    return true
  }

  const strike = (f: Frame, k: number) => {
    if (f.seconds < nextStrike) return
    nextStrike = f.seconds + 2 + random() * (14 - 11 * k)
    flash = 1
    // onto the map: a ground point in view, the bolt from the top of the screen down to it
    const gx = f.left + f.mw * (0.15 + random() * 0.7), gy = f.top + f.mh * (0.3 + random() * 0.6)
    const [ex, ey] = project(f, gx, gy, 0)
    let x = ex + (random() - 0.5) * f.view.w * 0.2, y = -10
    bolt = [[x, y]]
    const steps = 9 + Math.floor(random() * 5)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      x = x + (ex - x) / (steps - i + 1) + (i < steps ? (random() - 0.5) * 50 : 0)
      y = -10 + (ey + 10) * t
      bolt.push([x, y])
    }
    marks.push({ x: gx, y: gy, age: 0, life: 1.2, size: 3, kind: 'glow', rot: 0, c: 0, z: 0, vz: 0 })
  }

  /** Under what falls slowly, its shadow on the ground: it sharpens as it nears it (it falls onto the map). */
  const drawShadows = (f: Frame) => {
    if (kind.blown || kind.wander || key === 'rain' || key === 'storm' || key === 'hail' || key === 'embers') return
    const c = f.ctx
    const H = f.mh * kind.height
    c.fillStyle = 'rgba(20, 16, 12, 1)'
    for (const d of drops) {
      const near = 1 - Math.min(1, d.z / H)
      if (near < 0.15) continue
      const [x, y] = project(f, d.x, d.y, 0)
      const r = (key === 'leaves' ? 5 : 3.5) * (0.7 + 0.6 * d.size) * (1.6 - near * 0.6)
      c.globalAlpha = 0.16 * near * near
      c.beginPath()
      c.ellipse(x, y, r, r * 0.45, 0, 0, 6.283)
      c.fill()
    }
    c.globalAlpha = 1
  }

  const drawDrops = (f: Frame, k: number) => {
    const c = f.ctx
    if (key === 'rain' || key === 'storm' || key === 'hail') {
      // streaks toward their ground point
      const tail = (0.016 + 0.035 * length) * (key === 'hail' ? 0.5 : 1)
      c.lineCap = 'round'
      c.beginPath()
      for (const d of drops) {
        const [x1, y1] = project(f, d.x, d.y, d.z)
        const [x0, y0] = project(f, d.x - d.vx * tail, d.y - d.vy * tail, d.z + d.vz * tail)
        c.moveTo(x0, y0)
        c.lineTo(x1, y1)
      }
      // a dark edge under the light streak: it reads on light maps and dark ones
      c.strokeStyle = 'rgba(30, 40, 60, 0.22)'
      c.lineWidth = 2.4 * Math.max(0.7, size)
      c.stroke()
      c.strokeStyle = hexA(color, key === 'storm' ? 0.75 : 0.7)
      c.lineWidth = (key === 'hail' ? 1 : 1.2) * Math.max(0.7, size)
      c.stroke()
      if (key === 'hail') {
        c.fillStyle = hexA(color, 0.95)
        c.beginPath()
        for (const d of drops) {
          const [x, y, s] = project(f, d.x, d.y, d.z)
          const r = 1.6 * d.size * s
          c.moveTo(x + r, y)
          c.arc(x, y, r, 0, 6.283)
        }
        c.fill()
      }
      return
    }
    if (key === 'snow') {
      const list = snowShapes().map((s, i) => tint(s, color, `snow${i}`))
      c.globalAlpha = 0.95
      for (const d of drops) {
        const [x, y, s] = project(f, d.x, d.y, d.z)
        const r = (3.2 + 3.6 * d.size) * s
        c.drawImage(list[d.c % list.length], x - r, y - r, r * 2, r * 2)
      }
      c.globalAlpha = 1
      return
    }
    if (key === 'ash' || key === 'embers' || key === 'leaves') {
      const list = key === 'ash' ? ashShapes() : key === 'embers' ? emberShapes() : leafShapes()
      for (const d of drops) {
        const [x, y, s] = project(f, d.x, d.y, d.z)
        const r = (key === 'leaves' ? 8 : key === 'embers' ? 6 : 6.5) * (0.7 + 0.6 * d.size) * s
        if (key === 'embers') {
          const g = tint(glowShape(), '#ff8a2a', 'emberglow')
          c.globalAlpha = 0.35
          c.drawImage(g, x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4)
          c.globalAlpha = 1
        }
        c.save()
        c.translate(x, y)
        c.rotate(d.rot)
        c.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(d.rot * 1.3 + d.phase))) // it flutters
        if (key === 'embers') c.globalAlpha = 0.55 + 0.45 * Math.sin(f.seconds * 11 + d.phase * 5) ** 2
        c.drawImage(list[d.c % list.length], -r, -r, r * 2, r * 2)
        c.restore()
      }
      return
    }
    if (key === 'sandstorm') {
      c.fillStyle = hexA(color, 0.06 + 0.2 * k)
      c.fillRect(0, 0, f.view.w, f.view.h) // the haze
      c.strokeStyle = hexA(color, 0.6)
      c.lineWidth = 1.2 * size
      c.lineCap = 'round'
      c.beginPath()
      const tail = 0.01 + 0.05 * length
      for (const d of drops) {
        const [x1, y1] = project(f, d.x, d.y, d.z)
        const [x0, y0] = project(f, d.x - d.vx * tail, d.y - d.vy * tail, d.z)
        c.moveTo(x0, y0)
        c.lineTo(x1, y1)
      }
      c.stroke()
      return
    }
    if (key === 'wind') {
      c.strokeStyle = hexA(color, 0.18)
      c.lineWidth = 1.2
      c.beginPath()
      for (const d of drops) {
        const len = f.mw * (0.05 + 0.1 * length) * d.size
        const bend = Math.sin(f.seconds * 2 + d.phase) * f.mh * 0.01 * (1 + 4 * chaos)
        const [x0, y0] = project(f, d.x, d.y, d.z)
        const [xm, ym] = project(f, d.x - Math.sign(d.vx) * len / 2, d.y + bend, d.z)
        const [x1, y1] = project(f, d.x - Math.sign(d.vx) * len, d.y, d.z)
        c.moveTo(x0, y0)
        c.quadraticCurveTo(xm, ym, x1, y1)
      }
      c.stroke()
      return
    }
    if (key === 'fireflies') {
      const g = tint(glowShape(), color, 'glow')
      for (const d of drops) {
        const a = Math.max(0, Math.sin(f.seconds * 1.4 + d.phase)) ** 2
        if (a < 0.02) continue
        const [x, y, s] = project(f, d.x, d.y, d.z)
        const r = 9 * d.size * s
        c.globalAlpha = a
        c.drawImage(g, x - r, y - r, r * 2, r * 2)
      }
      c.globalAlpha = 1
    }
  }

  const drawMarks = (f: Frame) => {
    const c = f.ctx
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i]
      m.age += f.dt
      if (m.age >= m.life) marks.splice(i, 1)
    }
    for (const m of marks) {
      const t = m.age / m.life
      const [x, y] = project(f, m.x, m.y, 0)
      if (m.kind === 'splash') {
        // a ring on the ground, flattened (the ground is seen from above, at an angle)
        const r = (2.5 + 6 * t) * (0.7 + 0.6 * m.size)
        c.beginPath()
        c.ellipse(x, y, r, r * 0.42, 0, 0, 6.283)
        c.strokeStyle = `rgba(30, 40, 60, ${0.25 * (1 - t)})`
        c.lineWidth = 2
        c.stroke()
        c.strokeStyle = hexA(color, 0.8 * (1 - t))
        c.lineWidth = 1
        c.stroke()
      } else if (m.kind === 'droplet' || m.kind === 'spark') {
        // a droplet thrown up and out
        const out = 6 * t * (0.7 + 0.6 * m.size)
        const up = 9 * t * (1 - t) * 2
        c.fillStyle = m.kind === 'spark' ? hexA('#ffd27a', 1 - t) : hexA(color, 0.7 * (1 - t))
        c.fillRect(x + Math.cos(m.rot) * out - 0.8, y + Math.sin(m.rot) * out * 0.4 - up - 0.8, 1.6, 1.6)
      } else if (m.kind === 'bounce') {
        const up = 14 * (t * (1 - t)) * 4 * (0.6 + 0.4 * m.size)
        c.fillStyle = hexA(color, 0.9 * (1 - t * t))
        c.beginPath()
        c.arc(x, y - up, 1.5 * m.size, 0, 6.283)
        c.fill()
      } else if (m.kind === 'flake') {
        // settled snow melts away
        const list = snowShapes()
        const r = (2.6 + 2.4 * m.size)
        c.globalAlpha = 0.95 * (1 - t) ** 0.5
        c.drawImage(tint(list[0], color, 'snow0'), x - r, y - r * 0.6, r * 2, r * 1.2)
        c.globalAlpha = 1
      } else if (m.kind === 'ash' || m.kind === 'leaf') {
        const list = m.kind === 'ash' ? ashShapes() : leafShapes()
        const r = (m.kind === 'leaf' ? 7.5 : 5) * (0.7 + 0.6 * m.size)
        c.save()
        c.translate(x, y)
        c.scale(1, 0.5) // lying on the ground
        c.rotate(m.rot)
        c.globalAlpha = 0.9 * Math.min(1, (1 - t) * 3)
        c.drawImage(list[m.c % list.length], -r, -r, r * 2, r * 2)
        c.restore()
      } else if (m.kind === 'dust') {
        const r = (6 + 18 * t) * m.size
        c.fillStyle = hexA(color, 0.18 * (1 - t))
        c.beginPath()
        c.ellipse(x, y - r * 0.3, r, r * 0.5, 0, 0, 6.283)
        c.fill()
      } else if (m.kind === 'glow') {
        const g = tint(glowShape(), key === 'storm' ? '#dfe8ff' : '#ff9a3a', key === 'storm' ? 'bolt' : 'emberglow')
        const r = (key === 'storm' ? 60 : 8) * (1 - t * 0.5)
        c.globalCompositeOperation = 'lighter'
        c.globalAlpha = (1 - t) * (key === 'storm' ? 0.9 : 0.6)
        c.drawImage(g, x - r, y - r * 0.55, r * 2, r * 1.1)
        c.globalAlpha = 1
        c.globalCompositeOperation = 'source-over'
      }
    }
  }

  const wanted = (f: Frame) =>
    Math.round(kind.density * intensityAt(effect, f.seconds) * Math.min(2.5, Math.max(0.2, (f.view.w * f.view.h) / (1600 * 900))))

  return {
    warm(f) {
      const want = wanted(f)
      while (drops.length < want) { const d = blank(); spawn(d, f, true); drops.push(d) }
      // what fell before lies on the ground, at every age
      const settle: MarkKind | null = key === 'snow' ? 'flake' : key === 'ash' ? 'ash' : key === 'leaves' ? 'leaf' : null
      if (!settle) return
      const life = settle === 'flake' ? 7.5 : settle === 'ash' ? 6 : 6.5
      const count = Math.min(MAX_MARKS, want * life / ((kind.fall[0] + kind.fall[1]) / 2))
      for (let i = 0; i < count; i++) {
        marks.push({ x: f.left + random() * f.mw, y: f.top + random() * f.mh, age: random() * life, life, size: (0.6 + random() * 0.8) * size,
          kind: settle, rot: random() * 6.283, c: Math.floor(random() * 6), z: 0, vz: 0 })
      }
    },
    frame(f, advance) {
      const k = intensityAt(effect, f.seconds)
      const want = wanted(f)
      if (advance) {
        for (let i = 0; drops.length < want && i < Math.max(4, want / 25); i++) {
          const d = blank()
          spawn(d, f, true)
          drops.push(d)
        }
        if (drops.length > want) drops.length = want
        for (const d of drops) if (!move(d, f)) spawn(d, f, false)
      } else if (!drops.length) {
        for (let i = 0; i < want; i++) { const d = blank(); spawn(d, f, true); drops.push(d) }
      }
      const c = f.ctx
      drawShadows(f)
      if (kind.glow) c.globalCompositeOperation = 'lighter'
      drawDrops(f, k)
      c.globalCompositeOperation = 'source-over'
      if (advance || marks.length) drawMarks(advance ? f : { ...f, dt: 0 })
      if (key === 'storm' && advance) {
        strike(f, k)
        if (flash > 0.01) {
          c.fillStyle = `rgba(220, 230, 255, ${0.3 * flash * (0.6 + 0.4 * Math.sin(f.seconds * 60))})`
          c.fillRect(0, 0, f.view.w, f.view.h)
          if (flash > 0.5 && bolt.length) {
            c.strokeStyle = `rgba(240, 245, 255, ${flash})`
            c.lineWidth = 2.2
            c.shadowColor = '#cfe0ff'
            c.shadowBlur = 18
            c.beginPath()
            bolt.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
            c.stroke()
            c.shadowBlur = 0
          }
          flash *= Math.pow(0.02, f.dt)
        }
      }
    },
  }
}

/** Fog: banks drifting over the ground, in the map. */
function fogLayer(effect: EfxEffect): Layer {
  const p = effect.params
  const speed = Number(p.speed ?? 25) / 100
  const size = Number(p.size ?? 50) / 100
  const opacity = Number(p.opacity ?? 65) / 100
  const ground = Number(p.ground ?? 40) / 100
  const color = String(p.color ?? '#d9dee8')
  const random = rng(effect.id.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 11))
  const banks: { x: number; y: number; w: number; c: number; phase: number }[] = []
  return {
    frame(f, advance) {
      const k = intensityAt(effect, f.seconds)
      const want = Math.round(4 + 12 * k)
      const place = (b: { x: number; y: number; w: number }, first: boolean) => {
        b.w = f.mw * (0.18 + 0.35 * size) * (0.7 + random() * 0.6)
        b.y = f.top + random() * f.mh * 1.1
        b.x = first ? f.left - b.w / 2 + random() * (f.mw + b.w) : speed >= 0 ? f.left - b.w / 2 : f.left + f.mw + b.w / 2
      }
      while (banks.length < want) {
        const b = { x: 0, y: 0, w: 0, c: Math.floor(random() * 3), phase: random() * 6.283 }
        place(b, true)
        banks.push(b)
      }
      if (banks.length > want) banks.length = want
      const list = fogShapes().map((s, i) => tint(s, color, `fog${i}`))
      const c = f.ctx
      for (const b of banks) {
        if (advance) b.x += speed * f.mw * 0.03 * f.dt
        // off the view (it panned, or drifted away): somewhere in view again
        if (b.x - b.w > f.left + f.mw * 1.2 || b.x + b.w < f.left - f.mw * 0.2 || b.y < f.top - f.mh * 0.3 || b.y > f.top + f.mh * 1.4) place(b, !advance)
        const [x, y] = project(f, b.x, b.y, 0)
        const w = b.w * f.view.s
        const h = w * (0.55 - 0.35 * ground)
        c.globalAlpha = Math.min(1, opacity * (0.55 + 0.45 * k) * (0.85 + 0.15 * Math.sin(f.seconds * 0.2 + b.phase)))
        c.drawImage(list[b.c], x - w / 2, y - h * 0.65, w, h)
      }
      c.globalAlpha = 1
    },
  }
}

/** A map's weather: its `weather` and `fog` effects, in order. */
export class MapWeatherSim {
  private layers: Layer[]
  private toWarm: boolean

  /** `warm`: it starts as if it had been going for a while (a map opened in the rain); otherwise it sets in gently (the
   *  DM changed the weather). */
  constructor(effects: EfxEffect[], warm = false) {
    this.layers = effects.filter((e) => MAP_WEATHER_KINDS.has(e.kind)).map((e) => (e.kind === 'fog' ? fogLayer(e) : weatherLayer(e)))
    this.toWarm = warm
  }

  get empty() { return !this.layers.length }

  /** Draws a frame into the box's context (its transform: box px); `advance`: time goes on (animated maps). */
  frame(ctx: CanvasRenderingContext2D, view: WeatherView, seconds: number, dt: number, advance: boolean) {
    const s = Math.max(0.0001, view.s)
    const mw = view.w / s, mh = view.h / s
    const left = -view.x / s, top = -view.y / s
    const f: Frame = { ctx, view, left, top, mw, mh, cx: left + mw / 2, cy: top + mh / 2, depth: Math.max(mw, mh) * 1.6,
      seconds, dt: Math.min(0.1, dt) }
    if (this.toWarm) {
      this.toWarm = false
      for (const layer of this.layers) layer.warm?.(f)
    }
    ctx.clearRect(0, 0, view.w, view.h)
    for (const layer of this.layers) layer.frame(f, advance)
  }
}
