/**
 * The light of an hour (plan 48): a world map's daytime. The painter grades its drawing with it (the pictures too, in
 * the map shader), and the night's own lights (lit windows, fires, fireflies over forests, stars on the water) show as
 * it gets dark. Night is dark blue but stays readable: colours are dimmed, never lost.
 * - day 8:30 to 16:00 as painted; dawn (4:30 to 8:30) and dusk (16:00 to 20:00) pass through a golden light;
 * - night (20:00 to 4:30): dimmed, cool, the lights on.
 */
export interface Daylight {
  /** Multiplies the colours (1, 1, 1 at noon). */
  tint: [number, number, number]
  /** 0 by day .. 1 at night: how much the night's lights show. */
  night: number
}

const DAY: [number, number, number] = [1, 1, 1]
const GOLD: [number, number, number] = [1.08, 0.86, 0.66]
const NIGHT: [number, number, number] = [0.34, 0.4, 0.64]

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** The light at this hour (0..24). */
export function daylight(hour: number | null | undefined): Daylight {
  const h = (((hour ?? 12) % 24) + 24) % 24
  // the sun: up from 4:30 to 7:30, down from 16:30 to 19:30
  const sun = h < 12 ? smooth(4.5, 7.5, h) : 1 - smooth(16.5, 19.5, h)
  // golden around 6:30 and 18:00
  const bell = Math.max(Math.exp(-(((h - 6.3) / 1.2) ** 2)), Math.exp(-(((h - 18) / 1.3) ** 2)))
  const golden = bell < 0.01 ? 0 : bell
  const tint = mix(mix(NIGHT, DAY, sun), GOLD, golden * 0.55 * Math.min(1, sun * 2.5))
  return { tint, night: 1 - smooth(0.05, 0.6, sun) }
}

/** How the hour reads (the Daytime tool). */
export function hourName(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const clock = `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
  const part = h < 4.5 || h >= 20 ? 'Night' : h < 8.5 ? 'Dawn' : h < 16 ? 'Day' : 'Dusk'
  return `${part}, ${clock}`
}
