/** Card placement inside an Actors Scene tab. Pure and deterministic (every screen places cards the same). */
import type { Card, Shape } from './types'

/**
 * Every card is one size in the card ratio (5:7), whatever it shows (plan 34): more values grow the card's value band
 * over its picture, never the card; what doesn't fit is cut (hover regions hold the rest). The tab's card size
 * scales them all.
 */
export const CARD_W = 150
/** Pictures show in the card ratio (5:7: full cards, immersive sheets) or as the face crop (1:1). */
export const CARD_RATIO = 5 / 7
export const CARD_H = Math.round(CARD_W / CARD_RATIO)
/** Room kept at a centred layout's edges (circle, turn bar) and under the cards. */
export const PADDING = 16
/** Default space between cards; each tab can change it (its spacing setting). */
export const GAP = 14
/** Default top and sides margins (px): the scene's top and edges to the cards. */
export const MARGIN = 50

export interface Rect {
  x: number
  y: number
  /** Size on screen (already scaled). */
  w: number
  h: number
  /** The card drawn at this scale of its size (the card size; the turn bar's own). Default 1. */
  scale?: number
}

export interface LayoutOptions {
  /** The creature whose turn it is (turn bar: drawn to the centre). */
  currentId?: number | null
  /** Boundary: each card's stable random shift, from 0 to this many px on x (towards the middle) and on y (down). */
  scatter?: number
  /** Top margin: from the top to the first cards. Default MARGIN. */
  top?: number
  /** Sides margin: from the edges to the cards (layouts that start from an edge). Default MARGIN. */
  sides?: number
  /** Vertical space between cards (grid; turn bar: between the bar and the drawn card). Default: the gap. */
  gapY?: number
  /** Boundary: % of the width, in the middle, with no cards. */
  neutral?: number
  /** The cards' scale (the tab's card size / 100). Default 1. */
  size?: number
  /** Turn bar: the current card's scale (its current turn card size / 100), at most what fits. Default 1.7. */
  currentSize?: number
}

/** A tab's layout settings, ready for computeLayout. */
export function tabLayout(tab: {
  spacing: number; spacing_y?: number; margin_top?: number; margin_sides?: number; scatter?: number | boolean; neutral?: number
  card_size?: number; current_size?: number; turn: { actor_id: number | null }
}) {
  return {
    gap: tab.spacing,
    options: {
      currentId: tab.turn.actor_id,
      gapY: tab.spacing_y ?? tab.spacing,
      top: tab.margin_top ?? MARGIN,
      sides: tab.margin_sides ?? MARGIN,
      scatter: typeof tab.scatter === 'number' ? tab.scatter : 0,
      neutral: tab.neutral ?? 0,
      size: (tab.card_size ?? 100) / 100,
      currentSize: (tab.current_size ?? 170) / 100,
    } satisfies LayoutOptions,
  }
}

/** Turn bar: the bar's cards are at most this big (times the card size); the drawn card at least this. */
const BAR_MAX_SCALE = 0.62
const BAR_MIN_SCALE = 0.25
const DRAWN_MIN_SCALE = 0.3

/** Values shown on the card itself (its bottom region), for the current viewer. */
export const cardAttributes = (card: Card) => card.attributes.filter((a) => a.region === 'bottom')
/** The element in the card's top band (usually the name). */
export const topAttribute = (card: Card) => card.attributes.find((a) => a.region === 'top')
/** Values shown in a tray beside or under the card, on hover. */
export const hoverAttributes = (card: Card, side: 'left' | 'right' | 'bottom' = 'bottom') =>
  card.attributes.filter((a) => a.region === `hover_${side}`)

/** A card's size before scaling: the same for every card and style. */
export const cardSize = (_card?: Card) => ({ w: CARD_W, h: CARD_H })

export function columns(width: number, gap = GAP, sides = MARGIN, cardW = CARD_W): number {
  return Math.max(1, Math.floor((width - 2 * sides + gap) / (cardW + gap)))
}

/** Grid rects (`count` cards of w × h): rows from the sides margin. `fromRight`: rows fill from the right edge. */
function gridRects(count: number, w: number, h: number, scale: number, width: number, gap: number, gapY: number, top: number,
  sides: number, fromRight = false): Rect[] {
  const cols = columns(width, gap, sides, w)
  return Array.from({ length: count }, (_, i) => {
    const offset = sides + (i % cols) * (w + gap)
    return { x: fromRight ? width - offset - w : offset, y: top + Math.floor(i / cols) * (h + gapY), w, h, scale }
  })
}

/** Card rects on a circle: the smallest circle where cards are at least `gap` apart (more spacing, bigger circle). */
function circleRects(count: number, w: number, h: number, scale: number, width: number, height: number, gap: number, top: number): Rect[] {
  const at = (cx: number, cy: number, i: number, radius: number): Rect => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count
    return { x: cx + radius * Math.cos(angle) - w / 2, y: cy + radius * Math.sin(angle) - h / 2, w, h, scale }
  }
  const middle = top + (height - top - PADDING) / 2 // the middle of the room below the top margin
  if (count === 1) return [{ x: Math.max(PADDING, width / 2 - w / 2), y: Math.max(top, middle - h / 2), w, h, scale }]
  const place = (radius: number): Rect[] => {
    const cx = Math.max(width / 2, radius + w / 2 + PADDING)
    const cy = Math.max(middle, radius + h / 2 + top)
    return Array.from({ length: count }, (_, i) => at(cx, cy, i, radius))
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
 * (the slot stays empty) and shows at its current turn card size in the centre of the space below (smaller if it
 * doesn't fit there).
 */
function barRects(cards: Card[], width: number, height: number, gap: number, currentId: number | null | undefined,
  gapY: number, top: number, size: number, currentSize: number): Rect[] {
  const n = cards.length
  const fit = (width - 2 * PADDING + gap) / (n * (CARD_W + gap))
  const scale = Math.max(BAR_MIN_SCALE, Math.min(BAR_MAX_SCALE * size, fit))
  const step = (CARD_W + gap) * scale
  const total = n * step - gap * scale
  const left = Math.max(PADDING, (width - total) / 2)
  const barH = CARD_H * scale
  return cards.map((card, i) => {
    if (card.id === currentId) {
      const below = top + barH + gapY
      const room = Math.max(80, height - below - PADDING)
      const big = Math.max(DRAWN_MIN_SCALE, Math.min(currentSize, room / CARD_H, (width - 2 * PADDING) / CARD_W))
      return { x: width / 2 - (CARD_W * big) / 2, y: below + Math.max(0, (room - CARD_H * big) / 2), w: CARD_W * big, h: CARD_H * big, scale: big }
    }
    return { x: left + i * step, y: top, w: CARD_W * scale, h: barH, scale }
  })
}

/** A 32-bit integer hash with good mixing (MurmurHash3's finaliser): neighbouring ids land far apart. */
function mix(n: number): number {
  let h = n >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** A card's own stable shift (boundary scatter): from 0 to `reach` px on x and, separately, on y. */
export function scatterOffset(id: number, reach: number): { dx: number; dy: number } {
  const a = mix(id + 0x9e3779b9)
  const b = mix(a ^ 0x5bd1e995)
  return { dx: Math.round((a / 0xffffffff) * reach), dy: Math.round((b / 0xffffffff) * reach) }
}

/**
 * Boundary: player characters on the left, from the top left corner growing right then down; the others on the
 * right, from the top right corner growing left then down. `neutral` (% of the width) stays empty in the middle.
 * `scatter`: each card's own shift, towards the middle and down.
 */
function boundaryRects(cards: Card[], w: number, h: number, scale: number, width: number, gap: number, top: number,
  sides: number, neutral: number, scatter: number): Rect[] {
  const side = Math.max(w + 2 * sides, (width * (1 - Math.min(80, Math.max(0, neutral)) / 100)) / 2)
  const groups = { player: [] as number[], other: [] as number[] }
  cards.forEach((c, i) => groups[c.side === 'player' ? 'player' : 'other'].push(i))
  const rects: Rect[] = new Array(cards.length)
  ;(['player', 'other'] as const).forEach((which) => {
    const indexes = groups[which]
    const right = which === 'other'
    const placed = gridRects(indexes.length, w, h, scale, side, gap, gap, top, sides, right)
    indexes.forEach((cardIndex, k) => {
      const rect = { ...placed[k], x: placed[k].x + (right ? width - side : 0) }
      if (scatter > 0) {
        const { dx, dy } = scatterOffset(cards[cardIndex].id, scatter)
        rect.x += right ? -dx : dx // towards the middle: never off the scene's edge
        rect.y += dy
      }
      rects[cardIndex] = rect
    })
  })
  return rects
}

/** Rects per card id. Cards come already ordered by the server (and rotated, when the tab's flow rotates). */
export function computeLayout(cards: Card[], shape: Shape, width: number, height: number, gap = GAP, options: LayoutOptions = {}): Map<number, Rect> {
  const top = options.top ?? MARGIN
  const sides = options.sides ?? MARGIN
  const gapY = options.gapY ?? gap
  const size = options.size ?? 1
  const w = CARD_W * size
  const h = CARD_H * size
  let rects: Rect[]
  if (!cards.length) {
    rects = []
  } else if (shape === 'bar') {
    rects = barRects(cards, width, height, gap, options.currentId, gapY, top, size, options.currentSize ?? 1.7)
  } else if (shape === 'boundary') {
    rects = boundaryRects(cards, w, h, size, width, gap, top, sides, options.neutral ?? 0, options.scatter ?? 0)
  } else if (shape === 'row') {
    rects = cards.map((_, i) => ({ x: sides + i * (w + gap), y: top, w, h, scale: size }))
  } else if (shape === 'column') {
    rects = cards.map((_, i) => ({ x: sides, y: top + i * (h + gap), w, h, scale: size }))
  } else if (shape === 'circle') {
    rects = circleRects(cards.length, w, h, size, width, height, gap, top)
  } else {
    // Free: cards not placed yet start where the grid would put them
    rects = gridRects(cards.length, w, h, size, width, gap, gapY, top, sides)
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
