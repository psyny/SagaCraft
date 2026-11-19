/**
 * Pure helpers for the picture editor: crop geometry and colour adjustments.
 *
 * The live preview uses a CSS filter; the exported pixels use the same formulas as the CSS Filter
 * Effects spec (brightness, contrast, saturate, hue-rotate, applied in that order, clamped after each
 * step), so what you see is what gets uploaded.
 */

export interface Crop {
  /** All as fractions (0..1) of the oriented image. */
  x: number
  y: number
  w: number
  h: number
}

export interface Adjustments {
  brightness: number // 1 = unchanged
  contrast: number // 1 = unchanged
  saturation: number // 1 = unchanged, 0 = greyscale
  hue: number // degrees, 0 = unchanged
}

export const NO_ADJUSTMENTS: Adjustments = { brightness: 1, contrast: 1, saturation: 1, hue: 0 }
export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 }
export const MIN_CROP = 0.04

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const isDefault = (a: Adjustments) =>
  a.brightness === 1 && a.contrast === 1 && a.saturation === 1 && a.hue === 0

export function cssFilter(a: Adjustments): string {
  if (isDefault(a)) return 'none'
  return `brightness(${a.brightness}) contrast(${a.contrast}) saturate(${a.saturation}) hue-rotate(${a.hue}deg)`
}

type Matrix = [number, number, number, number, number, number, number, number, number]

function saturateMatrix(s: number): Matrix {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ]
}

function hueMatrix(degrees: number): Matrix {
  const a = (degrees * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ]
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Apply adjustments in place to RGBA pixel data (alpha untouched). */
export function applyAdjustments(data: Uint8ClampedArray, a: Adjustments): void {
  if (isDefault(a)) return
  const b = a.brightness
  const c = a.contrast
  const offset = 255 * (0.5 - 0.5 * c)
  const sat = a.saturation !== 1 ? saturateMatrix(a.saturation) : null
  const hue = a.hue !== 0 ? hueMatrix(a.hue) : null
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]
    let g = data[i + 1]
    let bl = data[i + 2]
    if (b !== 1) {
      r = clamp255(r * b); g = clamp255(g * b); bl = clamp255(bl * b)
    }
    if (c !== 1) {
      r = clamp255(r * c + offset); g = clamp255(g * c + offset); bl = clamp255(bl * c + offset)
    }
    for (const m of [sat, hue]) {
      if (!m) continue
      const nr = m[0] * r + m[1] * g + m[2] * bl
      const ng = m[3] * r + m[4] * g + m[5] * bl
      const nb = m[6] * r + m[7] * g + m[8] * bl
      r = clamp255(nr); g = clamp255(ng); bl = clamp255(nb)
    }
    data[i] = r
    data[i + 1] = g
    data[i + 2] = bl
  }
}

// ---------------------------------------------------------------------------
// Crop geometry. `ratio` is width/height in pixels; W and H are the oriented image's pixel size.
// ---------------------------------------------------------------------------

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** The largest crop with this ratio, centred. */
export function cropForRatio(ratio: number | null, W: number, H: number): Crop {
  if (!ratio) return { ...FULL_CROP }
  if (W / H > ratio) {
    const w = (H * ratio) / W
    return { x: (1 - w) / 2, y: 0, w, h: 1 }
  }
  const h = W / (ratio * H)
  return { x: 0, y: (1 - h) / 2, w: 1, h }
}

export function moveCrop(c: Crop, dx: number, dy: number): Crop {
  return { ...c, x: clamp01(Math.min(c.x + dx, 1 - c.w)), y: clamp01(Math.min(c.y + dy, 1 - c.h)) }
}

export function resizeCrop(c: Crop, handle: Handle, dx: number, dy: number, ratio: number | null, W: number, H: number): Crop {
  let left = c.x
  let top = c.y
  let right = c.x + c.w
  let bottom = c.y + c.h
  if (handle.includes('w')) left = clamp01(Math.min(left + dx, right - MIN_CROP))
  if (handle.includes('e')) right = clamp01(Math.max(right + dx, left + MIN_CROP))
  if (handle.includes('n')) top = clamp01(Math.min(top + dy, bottom - MIN_CROP))
  if (handle.includes('s')) bottom = clamp01(Math.max(bottom + dy, top + MIN_CROP))

  if (ratio) {
    // Width drives the height; keep the opposite corner fixed
    let w = right - left
    let h = (w * W) / (ratio * H)
    const maxH = handle.includes('n') ? bottom : 1 - top
    if (h > maxH) {
      h = maxH
      w = (h * ratio * H) / W
      if (handle.includes('w')) left = right - w
      else right = left + w
    }
    if (handle.includes('n')) top = bottom - h
    else bottom = top + h
  }
  return { x: left, y: top, w: right - left, h: bottom - top }
}

/** Pixel size of the crop, scaled down to fit maxPx on the longest side. */
export function outputSize(c: Crop, W: number, H: number, maxPx: number): { width: number; height: number } {
  const sw = Math.max(1, Math.round(c.w * W))
  const sh = Math.max(1, Math.round(c.h * H))
  const scale = Math.min(1, maxPx / Math.max(sw, sh))
  return { width: Math.max(1, Math.round(sw * scale)), height: Math.max(1, Math.round(sh * scale)) }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
