/** Card placement inside a Creature panel. Pure and deterministic. */
import type { Card, CardStyle, Shape } from './types'

/** Cards are always compact: a fixed width; the height follows the card style and how many values it shows. */
export const CARD_W = 150
export const PADDING = 16
/** Default space between cards; each panel can change it (its spacing setting). */
export const GAP = 14
const NAME_H = 30 // the name band
const ATTR_H = 40 // one value: label row + display row
const FACE_PIC_H = 124 // face style: picture area (the name band sits over its top)
const FULL_MIN_H = 214 // full style: enough picture to see behind the bands

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Values shown on the card itself, for the current viewer. */
export const cardAttributes = (card: Card) => card.attributes.filter((a) => a.display_on === 'card')
/** Values shown in the tray under the card, on hover. */
export const hoverAttributes = (card: Card) => card.attributes.filter((a) => a.display_on === 'hover')

export function cardHeight(style: CardStyle, rows: number): number {
  const values = rows * ATTR_H + (rows ? 10 : 0)
  if (style === 'face') return FACE_PIC_H + Math.max(values, 8)
  if (style === 'full') return Math.max(FULL_MIN_H, NAME_H + values + 90)
  return Math.max(76, NAME_H + values + 8)
}

export const cardSize = (card: Card) => ({ w: CARD_W, h: cardHeight(card.style, cardAttributes(card).length) })

export function columns(width: number, gap = GAP): number {
  return Math.max(1, Math.floor((width - 2 * PADDING + gap) / (CARD_W + gap)))
}

/** Grid rects: rows as tall as their tallest card. */
function gridRects(heights: number[], width: number, gap: number): Rect[] {
  const cols = columns(width, gap)
  const rects: Rect[] = []
  let y = PADDING
  for (let start = 0; start < heights.length; start += cols) {
    const row = heights.slice(start, start + cols)
    row.forEach((h, i) => rects.push({ x: PADDING + i * (CARD_W + gap), y, w: CARD_W, h }))
    y += Math.max(...row) + gap
  }
  return rects
}

/** Card rects on a circle: the smallest circle where cards are at least `gap` apart (more spacing, bigger circle). */
function circleRects(heights: number[], width: number, height: number, gap: number): Rect[] {
  const count = heights.length
  const w = CARD_W
  const h = Math.max(...heights)
  const at = (cx: number, cy: number, i: number, radius: number): Rect => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count
    return { x: cx + radius * Math.cos(angle) - w / 2, y: cy + radius * Math.sin(angle) - heights[i] / 2, w, h: heights[i] }
  }
  if (count === 1) return [{ x: Math.max(PADDING, width / 2 - w / 2), y: Math.max(PADDING, height / 2 - h / 2), w, h: heights[0] }]
  const place = (radius: number): Rect[] => {
    const cx = Math.max(width / 2, radius + w / 2 + PADDING)
    const cy = Math.max(height / 2, radius + h / 2 + PADDING)
    return heights.map((_, i) => at(cx, cy, i, radius))
  }
  const apart = (a: Rect, b: Rect) =>
    a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y
  const clear = (rects: Rect[]) => rects.every((a, i) => rects.every((b, j) => j <= i || apart(a, b)))
  // Start where neighbours would touch side by side and grow until every pair is `gap` apart
  let radius = Math.max(1, (w + gap) / (2 * Math.sin(Math.PI / count)))
  let rects = place(radius)
  for (let i = 0; i < 400 && !clear(rects); i += 1) {
    radius *= 1.02
    rects = place(radius)
  }
  return rects
}

/** Rects per card id. Cards come already ordered by the server (manual order or initiative). */
export function computeLayout(cards: Card[], shape: Shape, width: number, height: number, gap = GAP): Map<number, Rect> {
  const heights = cards.map((c) => cardSize(c).h)
  let rects: Rect[]
  if (shape === 'row') {
    rects = heights.map((h, i) => ({ x: PADDING + i * (CARD_W + gap), y: PADDING, w: CARD_W, h }))
  } else if (shape === 'column') {
    let y = PADDING
    rects = heights.map((h) => {
      const rect = { x: PADDING, y, w: CARD_W, h }
      y += h + gap
      return rect
    })
  } else if (shape === 'circle') {
    rects = cards.length ? circleRects(heights, width, height, gap) : []
  } else {
    rects = gridRects(heights, width, gap)
    if (shape === 'free') {
      rects = rects.map((slot, i) => {
        const p = cards[i].position
        return typeof p?.x === 'number' && typeof p?.y === 'number' ? { ...slot, x: p.x, y: p.y } : slot
      })
    }
  }
  return new Map(cards.map((c, i) => [c.id, rects[i]]))
}

/** Index of the slot whose centre is nearest to a point (drag to reorder, in any shape). */
export function nearestSlot(slots: Rect[], x: number, y: number): number {
  let best = 0
  let bestDistance = Infinity
  slots.forEach((r, i) => {
    const d = Math.hypot(r.x + r.w / 2 - x, r.y + r.h / 2 - y)
    if (d < bestDistance) {
      best = i
      bestDistance = d
    }
  })
  return best
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const copy = [...items]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

/**
 * Steps for the DM's quick value buttons (−X −Y OK +Y +X).
 * X is one order of magnitude below the value's scale (the max for counters): HP 230 → 10, 3300 → 100.
 * Y is 1 (up to 9 999; bigger values step by a hundredth of their scale). Small values get friendlier steps.
 */
export function quickSteps(current: number, max?: number | null): { big: number | null; small: number } {
  const scale = Math.max(Math.abs(max ?? 0), Math.abs(current), 1)
  if (scale < 5) return { big: null, small: 1 }
  if (scale < 10) return { big: 2, small: 1 }
  if (scale < 100) return { big: 5, small: 1 }
  const order = 10 ** Math.floor(Math.log10(scale))
  return { big: order / 10, small: scale >= 10000 ? order / 100 : 1 }
}

/**
 * What the DM typed in the value editor: "15" sets the value, "+3" / "-7" are relative to the current value.
 * Returns null when the text isn't a number.
 */
export function parseValueInput(text: string, current: number): number | null {
  const t = text.trim().replace(',', '.')
  const match = /^([+-]?)\s*(\d+(?:\.\d+)?)$/.exec(t)
  if (!match) return null
  const n = Number(match[2])
  if (match[1] === '+') return current + n
  if (match[1] === '-') return current - n
  return n
}
