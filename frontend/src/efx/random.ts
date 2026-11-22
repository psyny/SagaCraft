/** Seeded randomness for the 2D effects (the same landscape for the same settings, on every screen). */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth 1D value noise from a seeded table. */
export function noise1(seed: number, size = 256): (x: number) => number {
  const r = rng(seed)
  const table = Array.from({ length: size }, r)
  return (x: number) => {
    const i = Math.floor(x), f = x - i
    const a = table[((i % size) + size) % size], b = table[(((i + 1) % size) + size) % size]
    const u = f * f * (3 - 2 * f)
    return a + (b - a) * u
  }
}

export const hexA = (hex: string, alpha: number) => {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#ffffff'
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`
}

export const mixHex = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt((/^#[0-9a-f]{6}$/i.test(a) ? a : '#000000').slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt((/^#[0-9a-f]{6}$/i.test(b) ? b : '#000000').slice(i, i + 2), 16))
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}
