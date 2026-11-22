/**
 * An effect's intensity over time: steady (vary 0: the middle of its range), or every `vary` seconds it eases to a
 * new value inside the range. The values follow the clock (seeded by the effect's id), so every screen showing the
 * Stage sees the same rain at the same time.
 */
import type { EfxEffect } from '../api/types'

/** A stable pseudo-random number in [0, 1) for a string and a step. */
export function seeded(text: string, step: number): number {
  let h = 2166136261 ^ Math.imul(step | 0, 2654435761)
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (x: number) => x * x * (3 - 2 * x)

/** 0..1 at this time (seconds). Each change takes the first 40% of its period, then holds. */
export function intensityAt(effect: Pick<EfxEffect, 'id' | 'intensity' | 'vary'>, seconds: number): number {
  const [lo, hi] = effect.intensity
  if (!effect.vary || hi <= lo) return (lo + hi) / 200
  const at = (k: number) => lo + (hi - lo) * seeded(effect.id, k)
  const pos = seconds / effect.vary
  const k = Math.floor(pos)
  const f = Math.min(1, (pos - k) / 0.4)
  return (at(k - 1) + (at(k) - at(k - 1)) * smooth(f)) / 100
}
