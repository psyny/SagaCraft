/** Near background: a landscape in silhouettes, back to front: mountains (two ridges fading into the haze),
 *  hills, buildings (a skyline, a few lit windows), a pine forest swaying in the wind, water shimmering. The
 *  intensity is the wind. "Variation" picks another landscape with the same settings. */
import { hexA, mixHex, noise1, rng } from '../random'
import { num, str, type Effect, type EffectFactory } from './types'

interface Tree { x: number; h: number; w: number; phase: number }

export const landscape: EffectFactory = ({ canvas, params }) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const seed = Math.round(num(params.seed, 7))
  const color = str(params.color, '#151826'), haze = str(params.haze, '#55618a')
  const height = num(params.height, 45) / 100
  const on = (k: string) => Boolean(params[k])
  const back = document.createElement('canvas') // what doesn't move, drawn once per size
  let w = 1, h = 1, trees: Tree[] = [], waterTop = 1
  const scale = Math.min(1.5, window.devicePixelRatio || 1)

  const build = () => {
    back.width = Math.max(1, Math.round(w * scale)); back.height = Math.max(1, Math.round(h * scale))
    const b = back.getContext('2d')!
    b.setTransform(scale, 0, 0, scale, 0, 0)
    b.clearRect(0, 0, w, h)
    const H = h * height
    const water = on('water') ? H * 0.22 : 0
    waterTop = h - water
    const ground = waterTop
    const ridge = (n: (x: number) => number, x: number, freq: number) => {
      let v = 0, amp = 1, f = freq, total = 0
      for (let o = 0; o < 4; o++) { v += amp * Math.pow(1 - Math.abs(2 * n(x * f) - 1), 2); total += amp; amp *= 0.5; f *= 2.1 }
      return v / total
    }
    const fill = (top: (x: number) => number, c: string) => {
      b.fillStyle = c
      b.beginPath(); b.moveTo(0, ground)
      for (let x = 0; x <= w + 6; x += 6) b.lineTo(x, top(x))
      b.lineTo(w, ground); b.closePath(); b.fill()
    }
    if (on('mountains')) {
      const far = noise1(seed * 7 + 1), near = noise1(seed * 7 + 2)
      fill((x) => ground - H * (0.55 + 0.45 * ridge(far, x, 1 / 260)), mixHex(color, haze, 0.72))
      fill((x) => ground - H * (0.3 + 0.5 * ridge(near, x + 500, 1 / 190)), mixHex(color, haze, 0.45))
    }
    if (on('hills')) {
      const n = noise1(seed * 7 + 3)
      fill((x) => ground - H * (0.22 + 0.3 * (0.6 * n(x / 340) + 0.4 * n(x / 120 + 40))), mixHex(color, haze, 0.25))
    }
    if (on('buildings')) {
      const r = rng(seed * 31 + 5)
      let x = -10
      while (x < w) {
        const bw = 18 + r() * 46, bh = H * (0.15 + r() * 0.45)
        const c = mixHex(color, haze, 0.12 + r() * 0.1)
        b.fillStyle = c
        b.fillRect(x, ground - bh, bw, bh)
        if (r() < 0.3) { b.beginPath(); b.moveTo(x - 2, ground - bh); b.lineTo(x + bw / 2, ground - bh - bw * 0.45); b.lineTo(x + bw + 2, ground - bh); b.fill() }
        b.fillStyle = 'rgba(255, 214, 140, 0.55)'
        for (let wy = ground - bh + 8; wy < ground - 8; wy += 11) {
          for (let wx = x + 5; wx < x + bw - 6; wx += 9) if (r() < 0.12) b.fillRect(wx, wy, 3, 4)
        }
        x += bw + r() * 6
      }
    }
    // the forest moves: keep its trees
    trees = []
    if (on('forest')) {
      const r = rng(seed * 13 + 9)
      for (let x = -10; x < w + 10; x += 7 + r() * 9) {
        trees.push({ x, h: H * (0.16 + r() * 0.2), w: 10 + r() * 10, phase: r() * Math.PI * 2 })
      }
    }
  }

  const effect: Effect = {
    scale,
    resize(width, height) { w = width; h = height; build() },
    frame(seconds, k) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(back, 0, 0)
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      if (trees.length) {
        ctx.fillStyle = color
        ctx.beginPath()
        for (const t of trees) {
          const sway = Math.sin(seconds * (0.8 + k * 1.6) + t.phase + t.x * 0.01) * k * t.h * 0.06
          const base = waterTop
          for (let tier = 0; tier < 3; tier++) {
            const y0 = base - t.h * (0.15 + tier * 0.27), y1 = y0 - t.h * 0.45
            const half = t.w * (0.6 - tier * 0.15)
            const s = sway * (0.3 + tier * 0.35)
            ctx.moveTo(t.x - half, y0); ctx.lineTo(t.x + s, y1); ctx.lineTo(t.x + half, y0)
          }
          ctx.rect(t.x - 1.5, base - t.h * 0.15, 3, t.h * 0.15)
        }
        ctx.fill()
      }
      if (waterTop < h) {
        const g = ctx.createLinearGradient(0, waterTop, 0, h)
        g.addColorStop(0, mixHex(color, haze, 0.38)); g.addColorStop(1, color)
        ctx.fillStyle = g
        ctx.fillRect(0, waterTop, w, h - waterTop)
        // glints on the water
        const r = rng(seed * 17 + Math.floor(seconds * (0.6 + k)))
        for (let i = 0; i < 26 + 50 * k; i++) {
          const y = waterTop + 3 + r() * (h - waterTop - 4)
          const len = 10 + r() * 50
          ctx.fillStyle = hexA(haze, 0.12 + 0.3 * r() * (1 - (y - waterTop) / (h - waterTop + 1)))
          ctx.fillRect(r() * w, y, len, 1.2)
        }
      }
    },
    dispose() { trees = [] },
  }
  return effect
}
