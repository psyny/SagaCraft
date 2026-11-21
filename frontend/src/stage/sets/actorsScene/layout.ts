/** Card placement inside an Actors Scene tab. Pure and deterministic (every screen places cards the same). */
import type { Card, CardStyle, Shape } from './types'

/** Cards are always compact: a fixed width; the height follows the card style and how many values it shows. */
export const CARD_W = 150
export const PADDING = 16
/** Default space between cards; each panel can change it (its spacing setting). */
export const GAP = 14
const NAME_H = 30 // the top band
const ATTR_H = 40 // one value: label row + display row
/** Pictures show in the card ratio (5:7: full cards, immersive sheets) or as the face crop (1:1). */
export const CARD_RATIO = 5 / 7
const FACE_PIC_H = CARD_W // face style: the face crop, square (the top band sits over its top)
const FULL_PIC_H = Math.round(CARD_W / CARD_RATIO) // full style: the whole picture, in the card ratio

export interface Rect {
  x: number
  y: number
  /** Size on screen (already scaled). */
  w: number
  h: number
  /** Cards drawn smaller or bigger (turn bar). Default 1. */
  scale?: number
}

export interface LayoutOptions {
  /** The creature whose turn it is (turn bar: drawn to the centre). */
  currentId?: number | null
  /** Boundary: each card's stable random shift, up to this many px on x and on y. */
  scatter?: number
  /** Distance from the top to the first cards. Default PADDING. */
  top?: number
  /** Vertical space between cards (grid; turn bar: between the bar and the drawn card). Default: the gap. */
  gapY?: number
  /** Boundary: % of the width, in the middle, with no cards. */
  neutral?: number
}

/** A tab's layout settings, ready for computeLayout. */
export function tabLayout(tab: { spacing: number; spacing_y?: number; top?: number; scatter?: number | boolean; neutral?: number; turn: { actor_id: number | null } }) {
  return {
    gap: tab.spacing,
    options: {
      currentId: tab.turn.actor_id,
      gapY: tab.spacing_y ?? tab.spacing,
      top: tab.top ?? PADDING,
      scatter: typeof tab.scatter === 'number' ? tab.scatter : 0,
      neutral: tab.neutral ?? 0,
    } satisfies LayoutOptions,
  }
}

/** Turn bar: the bar's cards are at most this big; the drawn card at most this. */
const BAR_MAX_SCALE = 0.62
const BAR_MIN_SCALE = 0.25
const DRAWN_MAX_SCALE = 1.7

/** Values shown on the card itself (its bottom region), for the current viewer. */
export const cardAttributes = (card: Card) => card.attributes.filter((a) => a.region === 'bottom')
/** The element in the card's top band (usually the name). */
export const topAttribute = (card: Card) => card.attributes.find((a) => a.region === 'top')
/** Values shown in a tray beside or under the card, on hover. */
export const hoverAttributes = (card: Card, side: 'left' | 'right' | 'bottom' = 'bottom') =>
  card.attributes.filter((a) => a.region === `hover_${side}`)

export function cardHeight(style: CardStyle, rows: number, top = true): number {
  const values = rows * ATTR_H + (rows ? 10 : 0)
  const band = top ? NAME_H : 0
  if (style === 'face') return FACE_PIC_H + Math.max(values, 8)
  if (style === 'full') return Math.max(FULL_PIC_H, band + values + 90)
  return Math.max(76, band + values + 8)
}

export const cardSize = (card: Card) => ({ w: CARD_W, h: cardHeight(card.style, cardAttributes(card).length, Boolean(topAttribute(card))) })

export function columns(width: number, gap = GAP): number {
  return Math.max(1, Math.floor((width - 2 * PADDING + gap) / (CARD_W + gap)))
}

/** Grid rects: rows as tall as their tallest card. `fromRight`: rows fill from the right edge leftwards. */
function gridRects(heights: number[], width: number, gap: number, gapY = gap, top = PADDING, fromRight = false): Rect[] {
  const cols = columns(width, gap)
  const rects: Rect[] = []
  let y = top
  for (let start = 0; start < heights.length; start += cols) {
    const row = heights.slice(start, start + cols)
    row.forEach((h, i) => {
      const offset = PADDING + i * (CARD_W + gap)
      rects.push({ x: fromRight ? width - offset - CARD_W : offset, y, w: CARD_W, h })
    })
    y += Math.max(...row) + gapY
  }
  return rects
}

/** Card rects on a circle: the smallest circle where cards are at least `gap` apart (more spacing, bigger circle). */
function circleRects(heights: number[], width: number, height: number, gap: number, top = PADDING): Rect[] {
  const count = heights.length
  const w = CARD_W
  const h = Math.max(...heights)
  const at = (cx: number, cy: number, i: number, radius: number): Rect => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count
    return { x: cx + radius * Math.cos(angle) - w / 2, y: cy + radius * Math.sin(angle) - heights[i] / 2, w, h: heights[i] }
  }
  const middle = top + (height - top - PADDING) / 2 // the middle of the room below `top`
  if (count === 1) return [{ x: Math.max(PADDING, width / 2 - w / 2), y: Math.max(top, middle - h / 2), w, h: heights[0] }]
  const place = (radius: number): Rect[] => {
    const cx = Math.max(width / 2, radius + w / 2 + PADDING)
    const cy = Math.max(middle, radius + h / 2 + top)
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

/**
 * Turn bar: every card in order in a bar at the top (smaller); the current one leaves its place in the bar
 * (the slot stays empty) and shows scaled up in the centre of the space below.
 */
function barRects(cards: Card[], heights: number[], width: number, height: number, gap: number, currentId?: number | null,
  gapY = gap, top = PADDING): Rect[] {
  const n = cards.length
  const fit = (width - 2 * PADDING + gap) / (n * (CARD_W + gap))
  const scale = Math.max(BAR_MIN_SCALE, Math.min(BAR_MAX_SCALE, fit))
  const step = (CARD_W + gap) * scale
  const total = n * step - gap * scale
  const left = Math.max(PADDING, (width - total) / 2)
  const barH = Math.max(...heights) * scale
  return cards.map((card, i) => {
    if (card.id === currentId) {
      const below = top + barH + gapY
      const room = Math.max(80, height - below - PADDING)
      const big = Math.max(0.6, Math.min(DRAWN_MAX_SCALE, room / heights[i], (width - 2 * PADDING) / CARD_W))
      return { x: width / 2 - (CARD_W * big) / 2, y: below + Math.max(0, (room - heights[i] * big) / 2), w: CARD_W * big, h: heights[i] * big, scale: big }
    }
    return { x: left + i * step, y: top, w: CARD_W * scale, h: heights[i] * scale, scale }
  })
}

/** A small, stable shift per card (boundary scatter), up to `reach` px each way. */
export function scatterOffset(id: number, reach: number): { dx: number; dy: number } {
  let hash = 2166136261
  for (const ch of `scatter:${id}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0
  const unit = (bits: number) => ((bits & 0xffff) / 0xffff) * 2 - 1
  return { dx: Math.round(unit(hash) * reach), dy: Math.round(unit(hash >>> 16) * reach) }
}

/**
 * Boundary: player characters on the left, from the top left corner growing right then down; the others on the
 * right, from the top right corner growing left then down. `neutral` (% of the width) stays empty in the middle.
 * `scatter`: each card's stable random shift, up to that many px on x and on y.
 */
function boundaryRects(cards: Card[], heights: number[], width: number, gap: number, gapY: number, top: number,
  neutral: number, scatter: number): Rect[] {
  const side = Math.max(CARD_W + 2 * PADDING, (width * (1 - Math.min(80, Math.max(0, neutral)) / 100)) / 2)
  const sides = { player: [] as number[], other: [] as number[] }
  cards.forEach((c, i) => sides[c.side === 'player' ? 'player' : 'other'].push(i))
  const rects: Rect[] = new Array(cards.length)
  ;(['player', 'other'] as const).forEach((which) => {
    const indexes = sides[which]
    const right = which === 'other'
    const placed = gridRects(indexes.map((i) => heights[i]), side, gap, gapY, top, right)
    indexes.forEach((cardIndex, k) => {
      const rect = { ...placed[k], x: placed[k].x + (right ? width - side : 0) }
      if (scatter > 0) {
        const { dx, dy } = scatterOffset(cards[cardIndex].id, scatter)
        rect.x = Math.max(0, rect.x + dx)
        rect.y = Math.max(0, rect.y + dy)
      }
      rects[cardIndex] = rect
    })
  })
  return rects
}

/** Rects per card id. Cards come already ordered by the server (and rotated, when the tab's flow rotates). */
export function computeLayout(cards: Card[], shape: Shape, width: number, height: number, gap = GAP, options: LayoutOptions = {}): Map<number, Rect> {
  const heights = cards.map((c) => cardSize(c).h)
  const top = options.top ?? PADDING
  const gapY = options.gapY ?? gap
  let rects: Rect[]
  if (!cards.length) {
    rects = []
  } else if (shape === 'bar') {
    rects = barRects(cards, heights, width, height, gap, options.currentId, gapY, top)
  } else if (shape === 'boundary') {
    rects = boundaryRects(cards, heights, width, gap, gap, top, options.neutral ?? 0, options.scatter ?? 0)
  } else if (shape === 'row') {
    rects = heights.map((h, i) => ({ x: PADDING + i * (CARD_W + gap), y: top, w: CARD_W, h }))
  } else if (shape === 'column') {
    let y = top
    rects = heights.map((h) => {
      const rect = { x: PADDING, y, w: CARD_W, h }
      y += h + gap
      return rect
    })
  } else if (shape === 'circle') {
    rects = circleRects(heights, width, height, gap, top)
  } else {
    // Free: cards not placed yet start where the grid would put them
    rects = gridRects(heights, width, gap, gapY, top)
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
