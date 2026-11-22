/**
 * Colour theory for the app (pure): conversions, perceived lightness, WCAG contrast, and picks that stay readable on a
 * given colour: black or white ink, a complementary colour pushed until it reads well. Dice use it for their numbers;
 * anything drawn in a player's colour can.
 */
export type RGB = [number, number, number]
export type HSL = [number, number, number] // hue 0..360, saturation and lightness 0..1

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6)
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const rgbToHex = ([r, g, b]: RGB) =>
  `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`

export function rgbToHsl([r, g, b]: RGB): HSL {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return [h * 60, s, l]
}

export function hslToRgb([h, s, l]: HSL): RGB {
  const hue = ((h % 360) + 360) % 360 / 360
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  return [channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255]
}

/** WCAG relative luminance (0 black .. 1 white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 (none) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** Black or white: whichever reads better on this colour. */
export const bestInk = (on: string) => (contrast(on, '#000000') >= contrast(on, '#ffffff') ? '#000000' : '#ffffff')

/** Mix two colours (t: 0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [hexToRgb(a), hexToRgb(b)]
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB)
}

/** Lighten (amount > 0) or darken (< 0), keeping the hue. */
export function shade(hex: string, amount: number): string {
  return amount >= 0 ? mix(hex, '#ffffff', amount) : mix(hex, '#000000', -amount)
}

/** The complementary hue (opposite on the colour wheel), same saturation and lightness. */
export function complement(hex: string): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex))
  return rgbToHex(hslToRgb([h + 180, s, l]))
}

/** The complementary hue, vivid and mid-light: something that glows against this colour (e.g. on black). */
export function vividComplement(hex: string): string {
  const [h, s] = rgbToHsl(hexToRgb(hex))
  return rgbToHex(hslToRgb([h + 180, Math.max(0.75, s), 0.58]))
}

/** This colour, darkened or lightened (away from the background) just enough to reach `target` contrast on it. */
export function inkOn(color: string, background: string, target = 3): string {
  if (contrast(color, background) >= target) return color
  const darker = luminance(background) > 0.35
  for (let step = 1; step <= 20; step++) {
    const candidate = shade(color, darker ? -step * 0.05 : step * 0.05)
    if (contrast(candidate, background) >= target) return candidate
  }
  return bestInk(background)
}

/**
 * A complementary colour that reads well on `on`: the opposite hue, vivid, its lightness pushed away from the
 * background's until the contrast reaches `target` (WCAG AA for text: 4.5); black or white if no hue can.
 */
export function readableComplement(on: string, target = 4.5): string {
  const [h, s] = rgbToHsl(hexToRgb(on))
  const hue = h + 180
  const sat = Math.max(0.65, s)
  const dark = luminance(on) > 0.35 // a light colour gets a dark complement, and the other way round
  for (let step = 0; step <= 20; step++) {
    const l = dark ? 0.45 - step * 0.02 : 0.55 + step * 0.02
    const candidate = rgbToHex(hslToRgb([hue, sat, Math.max(0, Math.min(1, l))]))
    if (contrast(candidate, on) >= target) return candidate
  }
  return bestInk(on)
}
