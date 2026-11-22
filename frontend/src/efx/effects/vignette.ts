/** Foreground: darkness closing in from the edges (any colour). The intensity is how dark; size, how far in. */
import { hexA } from '../random'
import { num, str, type Effect, type EffectFactory } from './types'

export const vignette: EffectFactory = ({ canvas, params }) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const color = str(params.color, '#000000'), size = num(params.size, 50) / 100
  let w = 1, h = 1, drawn = -1
  const effect: Effect = {
    scale: 0.5,
    resize(width, height) { w = width; h = height; drawn = -1 },
    frame(_s, k) {
      if (Math.abs(k - drawn) < 0.004) return
      drawn = k
      const sc = effect.scale
      ctx.setTransform(sc, 0, 0, sc, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const r = Math.hypot(w, h) / 2
      const g = ctx.createRadialGradient(w / 2, h / 2, r * (0.75 - 0.55 * size), w / 2, h / 2, r)
      g.addColorStop(0, hexA(color, 0)); g.addColorStop(1, hexA(color, Math.min(1, k * 1.1)))
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    },
    dispose() {},
  }
  return effect
}
