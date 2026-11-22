/** Foreground: weather, as particles over the Stage (they never catch clicks): rain, storm (rain, gusts and
 *  lightning), snow, hail, sandstorm (with a haze), leaves, wind, embers, dark motes, fireflies. The intensity is
 *  how much of it there is (and how often lightning strikes); wind pushes it sideways; size scales it; chaos adds
 *  gusts and swirls; length sets how long streaks are (rain, hail, wind, embers, sand). Fog is its own effect. */
import { hexA, rng } from '../random'
import { num, str, type Effect, type EffectFactory } from './types'

interface P { x: number; y: number; vx: number; vy: number; s: number; rot: number; vr: number; phase: number; c: number; life: number }

interface Kind {
  /** Particles on a 1600×900 screen at full intensity. */
  density: number
  spawn: (p: P, first: boolean) => void
  draw: (ctx: CanvasRenderingContext2D, list: P[], seconds: number, k: number) => void
  /** Moves a particle; false: it's gone (spawn again). */
  move?: (p: P, dt: number, seconds: number) => boolean
  /** Draw with 'lighter' (glows). */
  glow?: boolean
}

const LEAVES = ['#c1502e', '#d98a2b', '#a8432a', '#e3b23c', '#7d5a2c']
const EMBERS = ['#ffb347', '#ff7a1a', '#ffd27a', '#ff5a1f']
/** Their hot cores: brighter than their glow. */
const EMBER_CORES = ['#ffe6a8', '#ffb877', '#fff2c8', '#ff9a63']

export const weather: EffectFactory = ({ canvas, params, seed }) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const random = rng(seed.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 3))
  const kindKey = str(params.kind, 'rain')
  const wind = num(params.wind, 15) / 100
  const size = num(params.size, 100) / 100
  const color = str(params.color, '#cfd8ea')
  const chaos = num(params.chaos, 30) / 100
  const length = num(params.length, 50) / 100
  const streak = 0.006 + 0.036 * length // seconds of motion a streak shows
  let w = 1, h = 1
  const span = () => Math.abs(wind) * h * 0.6 + 40 // rain leans: start further out on the windward side
  const anywhere = (p: P) => { p.x = -span() + random() * (w + 2 * span()); p.y = random() * h }
  const fromTop = (p: P, first: boolean) => { p.x = -span() + random() * (w + 2 * span()); p.y = first ? random() * h : -20 - random() * 60 }

  const streaks = (lenFactor: number, alpha: number, width: number): Kind['draw'] => (c, list) => {
    c.strokeStyle = hexA(color, alpha)
    c.lineWidth = width * size
    c.lineCap = 'round'
    c.beginPath()
    for (const p of list) { c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * lenFactor, p.y - p.vy * lenFactor) }
    c.stroke()
  }
  const fall = (p: P, dt: number) => { p.x += p.vx * dt; p.y += p.vy * dt; return p.y < h + 30 }

  // Lightning (storms): a flash and a bolt now and then
  let flash = 0, bolt: [number, number][] = [], nextStrike = 0
  const strike = (seconds: number, k: number) => {
    if (seconds < nextStrike) return
    nextStrike = seconds + 2 + random() * (14 - 11 * k)
    flash = 1
    let x = w * (0.15 + random() * 0.7), y = 0
    bolt = [[x, y]]
    while (y < h * (0.45 + random() * 0.3)) { x += (random() - 0.5) * 60; y += 20 + random() * 40; bolt.push([x, y]) }
  }

  const KINDS: Record<string, Kind> = {
    rain: {
      density: 900, spawn: (p, first) => { fromTop(p, first); p.vy = (950 + random() * 450) * (0.85 + 0.15 * size); p.vx = wind * 420 + (random() - 0.5) * chaos * 260 },
      move: fall, draw: streaks(streak, 0.38, 1.1),
    },
    storm: {
      density: 1300, spawn: (p, first) => { fromTop(p, first); p.vy = (1200 + random() * 500); p.vx = wind * 650 + (wind >= 0 ? 120 : -120) + (random() - 0.5) * chaos * 360 },
      move: fall, draw: streaks(streak * 0.9, 0.42, 1.2),
    },
    snow: {
      density: 520, spawn: (p, first) => { fromTop(p, first); p.vy = (28 + random() * 60) * (0.6 + 0.4 * size); p.s = (1 + random() * 2.6) * size; p.phase = random() * 6.3 },
      move: (p, dt, t) => { p.x += (wind * 70 + Math.sin(t * (0.9 + chaos) + p.phase) * 22 * (0.5 + 2 * chaos)) * dt; p.y += p.vy * dt; return p.y < h + 10 },
      draw: (c, list) => { c.fillStyle = hexA(color, 0.85); c.beginPath(); for (const p of list) { c.moveTo(p.x + p.s, p.y); c.arc(p.x, p.y, p.s, 0, 6.29) } c.fill() },
    },
    hail: {
      density: 480, spawn: (p, first) => { fromTop(p, first); p.vy = 700 + random() * 300; p.vx = wind * 200 + (random() - 0.5) * chaos * 240; p.s = (1.2 + random() * 1.5) * size },
      move: fall,
      draw: (c, list) => { c.fillStyle = hexA(color, 0.9); c.beginPath(); for (const p of list) { c.moveTo(p.x + p.s, p.y); c.arc(p.x, p.y, p.s, 0, 6.29) } c.fill(); streaks(streak * 0.5, 0.25, 1)(c, list, 0, 0) },
    },
    sandstorm: {
      density: 1500, spawn: (p, first) => { anywhere(p); if (!first) p.x = (wind >= 0 ? -10 : w + 10); p.vx = (wind >= 0 ? 1 : -1) * (280 + random() * 420) * (0.4 + Math.abs(wind)); p.vy = (random() - 0.5) * 40 * (1 + 3 * chaos); p.s = (0.6 + random() * 1.4) * size },
      move: (p, dt) => { p.x += p.vx * dt; p.y += p.vy * dt; return p.x > -20 && p.x < w + 20 },
      draw: (c, list, _t, k) => {
        c.fillStyle = hexA(color, 0.08 + 0.22 * k); c.fillRect(0, 0, w, h) // the haze
        c.fillStyle = hexA(color, 0.6); c.beginPath(); for (const p of list) c.rect(p.x, p.y, p.s * 2.2 * (0.5 + 3 * length), p.s * 0.8); c.fill()
      },
    },
    leaves: {
      density: 70, spawn: (p, first) => { fromTop(p, first); p.vy = 35 + random() * 55; p.s = (5 + random() * 5) * size; p.rot = random() * 6.3; p.vr = (random() - 0.5) * 4; p.phase = random() * 6.3; p.c = Math.floor(random() * LEAVES.length) },
      move: (p, dt, t) => { p.x += (wind * 140 + Math.sin(t * 1.3 + p.phase) * 40 * (0.5 + 2 * chaos)) * dt; p.y += p.vy * dt; p.rot += p.vr * (0.5 + 2 * chaos) * dt; return p.y < h + 20 && p.x > -60 && p.x < w + 60 },
      draw: (c, list) => {
        for (const p of list) {
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(1, 0.45 + 0.4 * Math.abs(Math.sin(p.rot * 1.7)))
          c.fillStyle = LEAVES[p.c]; c.beginPath(); c.ellipse(0, 0, p.s, p.s * 0.5, 0, 0, 6.29); c.fill(); c.restore()
        }
      },
    },
    wind: {
      density: 38, spawn: (p, first) => { anywhere(p); if (!first) p.x = wind >= 0 ? -300 : w + 300; p.vx = (wind >= 0 ? 1 : -1) * (500 + random() * 500); p.s = (80 + random() * 160) * size * (0.3 + 1.7 * length); p.phase = random() * 6.3 },
      move: (p, dt) => { p.x += p.vx * dt; return p.x > -400 && p.x < w + 400 },
      draw: (c, list, t) => {
        c.strokeStyle = hexA(color, 0.16); c.lineWidth = 1.2; c.beginPath()
        for (const p of list) { const bend = Math.sin(t * 2 + p.phase) * 10 * (1 + 4 * chaos); c.moveTo(p.x, p.y); c.quadraticCurveTo(p.x - Math.sign(p.vx) * p.s / 2, p.y + bend, p.x - Math.sign(p.vx) * p.s, p.y) }
        c.stroke()
      },
    },
    embers: {
      // Short bright strokes along their motion, rising, pushed by the wind and tossed by gusts (chaos)
      density: 170, glow: true,
      spawn: (p, first) => {
        p.x = -span() + random() * (w + 2 * span()); p.y = first ? random() * h : h + 10
        p.rot = (50 + random() * 120) * (0.7 + 0.3 * size) // its own rising speed
        p.vx = wind * 140; p.vy = -p.rot
        p.s = (0.8 + random() * 0.9) * size; p.phase = random() * 6.3; p.c = Math.floor(random() * EMBERS.length)
        p.life = 0.35 + random() * 0.65 // how far up it gets (of the height)
      },
      move: (p, dt, t) => {
        const gust = Math.sin(t * 1.7 + p.y * 0.013 + p.phase) * Math.cos(t * 0.9 + p.x * 0.007 + p.phase * 0.5)
        p.vx += ((wind * 160 - p.vx) * 1.2 + gust * chaos * 900 + (random() - 0.5) * chaos * 1500) * dt
        p.vy += ((-p.rot - p.vy) * 1.0 + (random() - 0.5) * chaos * 900) * dt
        p.x += p.vx * dt; p.y += p.vy * dt
        return p.y > h * (1 - p.life) - 10 && p.x > -span() - 20 && p.x < w + span() + 20
      },
      draw: (c, list, t) => {
        const trail = 0.015 + 0.06 * length
        c.lineCap = 'round'
        for (const p of list) {
          const top = h * (1 - p.life)
          const fade = Math.max(0, Math.min(1, (p.y - top) / (h * 0.18)))
          const a = fade * (0.7 + 0.3 * Math.sin(t * 13 + p.phase))
          if (a <= 0.02) continue
          const tx = p.x - p.vx * trail, ty = p.y - p.vy * trail
          c.strokeStyle = hexA(EMBERS[p.c], 0.22 * a); c.lineWidth = p.s * 3.2
          c.beginPath(); c.moveTo(tx, ty); c.lineTo(p.x, p.y); c.stroke()
          c.strokeStyle = hexA(EMBER_CORES[p.c], 0.95 * a); c.lineWidth = p.s
          c.beginPath(); c.moveTo(tx, ty); c.lineTo(p.x, p.y); c.stroke()
        }
      },
    },
    ash: {
      density: 90, spawn: (p, first) => { anywhere(p); if (!first) p.y = -10; p.vx = wind * 30 + (random() - 0.5) * 10; p.vy = 8 + random() * 22; p.s = (2 + random() * 5) * size; p.phase = random() * 6.3 },
      move: (p, dt, t) => { p.x += (p.vx + Math.sin(t * 0.7 + p.phase) * 6 * (1 + 4 * chaos)) * dt; p.y += p.vy * dt; return p.y < h + 10 },
      draw: (c, list) => { c.fillStyle = 'rgba(8, 6, 10, 0.55)'; c.beginPath(); for (const p of list) { c.moveTo(p.x + p.s, p.y); c.arc(p.x, p.y, p.s, 0, 6.29) } c.fill() },
    },
    fireflies: {
      density: 46, glow: true,
      spawn: (p) => { p.x = random() * w; p.y = h * (0.3 + random() * 0.7); p.phase = random() * 6.3; p.s = (1.4 + random() * 1.4) * size; p.vx = 0; p.vy = 0 },
      move: (p, dt, t) => { const wander = 0.6 + 2 * chaos; p.x += Math.sin(t * 0.5 + p.phase * 3) * 22 * wander * dt + wind * 10 * dt; p.y += Math.cos(t * 0.6 + p.phase * 2) * 16 * wander * dt; return p.x > -20 && p.x < w + 20 },
      draw: (c, list, t) => {
        for (const p of list) {
          const a = Math.max(0, Math.sin(t * 1.4 + p.phase)) ** 2
          const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * 6)
          g.addColorStop(0, hexA(color, a)); g.addColorStop(0.3, hexA(color, a * 0.35)); g.addColorStop(1, hexA(color, 0))
          c.fillStyle = g; c.fillRect(p.x - p.s * 6, p.y - p.s * 6, p.s * 12, p.s * 12)
        }
      },
    },
  }
  const kind = KINDS[kindKey] ?? KINDS.rain
  const list: P[] = []
  const blank = (): P => ({ x: 0, y: 0, vx: 0, vy: 0, s: size, rot: 0, vr: 0, phase: 0, c: 0, life: 1 })
  const scale = Math.min(1.5, window.devicePixelRatio || 1)

  const effect: Effect = {
    scale,
    resize(width, height) { w = width; h = height; list.length = 0 },
    frame(seconds, k, dt) {
      const want = Math.round(kind.density * k * Math.max(0.25, (w * h) / (1600 * 900)))
      // Grow gently (no sudden wall of rain), shrink at once
      for (let i = 0; list.length < want && i < Math.max(4, want / 30); i++) { const p = blank(); kind.spawn(p, list.length === 0 || random() < 0.5); list.push(p) }
      if (list.length > want) list.length = want
      for (const p of list) if (!(kind.move ?? fall)(p, dt, seconds)) kind.spawn(p, false)
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (kind.glow) ctx.globalCompositeOperation = 'lighter'
      kind.draw(ctx, list, seconds, k)
      ctx.globalCompositeOperation = 'source-over'
      if (kindKey === 'storm') {
        strike(seconds, k)
        if (flash > 0.01) {
          ctx.fillStyle = `rgba(220, 230, 255, ${0.35 * flash * (0.6 + 0.4 * Math.sin(seconds * 60))})`
          ctx.fillRect(0, 0, w, h)
          if (flash > 0.55 && bolt.length) {
            ctx.strokeStyle = `rgba(240, 245, 255, ${flash})`; ctx.lineWidth = 2.2; ctx.shadowColor = '#cfe0ff'; ctx.shadowBlur = 18
            ctx.beginPath(); bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke()
            ctx.shadowBlur = 0
          }
          flash *= Math.pow(0.02, dt) // gone in about a second
        }
      }
    },
    dispose() { list.length = 0 },
  }
  return effect
}
