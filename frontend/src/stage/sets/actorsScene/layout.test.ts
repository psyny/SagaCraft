import { CARD_H, CARD_W, cardSize, columns, computeLayout, moveItem, nearestSlot, parseValueInput, quickSteps, scatterOffset, tabLayout } from './layout'
import type { Card, CardAttribute, CardStyle } from './types'

const hp: CardAttribute = { key: 'hp', label: 'HP', type: 'counter', style: 'bar', region: 'bottom', current: 5, max: 10 }
const card = (id: number, opts: { position?: Card['position']; style?: CardStyle; attrs?: number; side?: Card['side'] } = {}): Card => ({
  id, resource_id: id, position: opts.position ?? {}, name: `C${id}`, type: 'npc', style: opts.style ?? 'face',
  side: opts.side ?? 'other', picture: null, defeated: false, attributes: Array.from({ length: opts.attrs ?? 1 }, (_, i) => ({ ...hp, key: `a${i}` })),
})
const cards = (n: number) => Array.from({ length: n }, (_, i) => card(i + 1))
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('card sizes', () => {
  it('are one size in the card ratio, whatever the style and the values shown', () => {
    expect(CARD_H).toBe(Math.round(CARD_W * 7 / 5))
    for (const style of ['face', 'full', 'none', 'immersive', 'informative'] as const)
      for (const attrs of [0, 1, 6]) expect(cardSize(card(1, { style, attrs }))).toEqual({ w: CARD_W, h: CARD_H })
  })

  it('follow the tab\'s card size', () => {
    const rects = computeLayout(cards(2), 'row', 900, 400, 14, { size: 1.5, sides: 0 })
    expect(rects.get(1)).toMatchObject({ x: 0, w: CARD_W * 1.5, h: CARD_H * 1.5, scale: 1.5 })
    expect(rects.get(2)!.x).toBe(CARD_W * 1.5 + 14)
  })
})

describe('turn bar', () => {
  it('puts every card in a bar on top and draws the current one, bigger, to the centre', () => {
    const rects = computeLayout(cards(4), 'bar', 1000, 520, 14, { currentId: 3 })
    const bar = [1, 2, 4].map((id) => rects.get(id)!)
    expect(new Set(bar.map((r) => r.y)).size).toBe(1)
    bar.forEach((r) => expect(r.scale).toBeLessThan(1))
    const drawn = rects.get(3)!
    expect(drawn.scale).toBeGreaterThan(1)
    expect(drawn.scale).toBeLessThanOrEqual(1.7) // its current turn card size (the default), if it fits
    expect(drawn.y).toBeGreaterThan(bar[0].y + bar[0].h)
    expect(Math.round(drawn.x + drawn.w / 2)).toBe(500)
    // Its place in the bar stays empty: the next card keeps its slot
    expect(rects.get(4)!.x - rects.get(2)!.x).toBeCloseTo(2 * (rects.get(2)!.x - rects.get(1)!.x))
  })

  it('draws the current card at its own size, never bigger than the room below the bar', () => {
    const small = computeLayout(cards(3), 'bar', 1200, 1400, 14, { currentId: 2, currentSize: 0.8 }).get(2)!
    expect(small.scale).toBeCloseTo(0.8)
    const huge = computeLayout(cards(3), 'bar', 1200, 500, 14, { currentId: 2, currentSize: 3 }).get(2)!
    expect(huge.y + huge.h).toBeLessThanOrEqual(500)
  })

  it('shrinks the bar to fit many cards', () => {
    const rects = [...computeLayout(cards(14), 'bar', 900, 520, 14).values()]
    expect(Math.max(...rects.map((r) => r.x + r.w))).toBeLessThanOrEqual(900)
  })
})

describe('boundary', () => {
  it('puts player characters on the left half and the others on the right', () => {
    const list = [card(1, { side: 'player' }), card(2), card(3, { side: 'player' }), card(4)]
    const rects = computeLayout(list, 'boundary', 1000, 500)
    expect(rects.get(1)!.x + CARD_W).toBeLessThanOrEqual(500)
    expect(rects.get(3)!.x + CARD_W).toBeLessThanOrEqual(500)
    expect(rects.get(2)!.x).toBeGreaterThanOrEqual(500)
    expect(rects.get(4)!.x).toBeGreaterThanOrEqual(500)
  })

  it('left side grows from the top left to the right; right side from the top right to the left', () => {
    const list = [card(1, { side: 'player' }), card(2, { side: 'player' }), card(3), card(4)]
    const rects = computeLayout(list, 'boundary', 1200, 500)
    expect(rects.get(1)!.x).toBe(50) // the sides margin
    expect(rects.get(2)!.x).toBeGreaterThan(rects.get(1)!.x)
    expect(rects.get(3)!.x + CARD_W).toBe(1200 - 50) // the first "other" card: the sides margin from the right edge
    expect(rects.get(4)!.x).toBeLessThan(rects.get(3)!.x)
    expect(rects.get(3)!.y).toBe(rects.get(1)!.y)
  })

  it('the neutral zone keeps the middle empty', () => {
    const many = [...Array.from({ length: 6 }, (_, i) => card(i + 1, { side: 'player' })), ...Array.from({ length: 6 }, (_, i) => card(i + 11))]
    const rects = computeLayout(many, 'boundary', 1200, 900, 14, { neutral: 40 }) // 40%: 480px in the middle
    for (const [id, r] of rects) {
      if (id < 10) expect(r.x + r.w).toBeLessThanOrEqual(360)
      else expect(r.x).toBeGreaterThanOrEqual(840)
    }
  })

  it('scatter shifts each card its own way, -that to +that many px on x and y, the same every time', () => {
    const list = [card(1, { side: 'player' }), card(2), card(3), card(4, { side: 'player' })]
    const tidy = computeLayout(list, 'boundary', 1000, 500, 14, { top: 40 })
    const scattered = computeLayout(list, 'boundary', 1000, 500, 14, { scatter: 30, top: 40 })
    expect(scattered).toEqual(computeLayout(list, 'boundary', 1000, 500, 14, { scatter: 30, top: 40 }))
    for (const [id, r] of scattered) {
      const before = tidy.get(id)!
      expect(Math.abs(r.x - before.x)).toBeLessThanOrEqual(30)
      expect(Math.abs(r.y - before.y)).toBeLessThanOrEqual(30)
    }
    expect(scatterOffset(7, 20)).toEqual(scatterOffset(7, 20))
    // Both ways: some cards move left or up, others right or down
    const shifts = Array.from({ length: 40 }, (_, i) => scatterOffset(i + 1, 30))
    for (const axis of ['dx', 'dy'] as const) {
      const values = shifts.map((o) => o[axis])
      expect(Math.min(...values)).toBeLessThan(0)
      expect(Math.max(...values)).toBeGreaterThan(0)
      expect(values.every((v) => v >= -30 && v <= 30)).toBe(true)
    }
  })

  it('scatter keeps cards on the scene when the margins are smaller than it', () => {
    const list = Array.from({ length: 12 }, (_, i) => card(i + 1, { side: i % 2 ? 'other' : 'player' }))
    const scattered = computeLayout(list, 'boundary', 1000, 800, 14, { scatter: 80, top: 0, sides: 0 })
    for (const r of scattered.values()) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(1000)
      expect(r.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('scatter differs from card to card, even for neighbouring ids (the bug: they all moved alike)', () => {
    const shifts = Array.from({ length: 12 }, (_, i) => scatterOffset(100 + i, 60))
    expect(new Set(shifts.map((o) => o.dx)).size).toBeGreaterThan(6)
    expect(new Set(shifts.map((o) => o.dy)).size).toBeGreaterThan(6)
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
    expect(spread(shifts.map((o) => o.dx))).toBeGreaterThan(25)
    expect(spread(shifts.map((o) => o.dy))).toBeGreaterThan(25)
  })
})

describe('layout settings', () => {
  it('the top margin moves the first cards down, in every layout', () => {
    for (const shape of ['grid', 'row', 'column', 'bar', 'boundary', 'free'] as const) {
      const rects = [...computeLayout(cards(3), shape, 1000, 600, 14, { top: 90 }).values()]
      expect(Math.min(...rects.map((r) => r.y))).toBe(90)
    }
    const low = [...computeLayout(cards(4), 'circle', 1000, 900, 14, { top: 200 }).values()]
    const high = [...computeLayout(cards(4), 'circle', 1000, 900, 14, { top: 16 }).values()]
    expect(Math.min(...low.map((r) => r.y))).toBeGreaterThan(Math.min(...high.map((r) => r.y)))
  })

  it('grid and turn bar take a vertical space of their own', () => {
    const cols = columns(900, 10)
    const grid = computeLayout(cards(cols + 1), 'grid', 900, 600, 10, { gapY: 70 })
    expect(grid.get(2)!.x - grid.get(1)!.x).toBe(CARD_W + 10)
    expect(grid.get(cols + 1)!.y - grid.get(1)!.y).toBe(CARD_H + 70)
    const near = computeLayout(cards(3), 'bar', 1000, 800, 14, { currentId: 2, gapY: 0 }).get(2)!
    const far = computeLayout(cards(3), 'bar', 1000, 800, 14, { currentId: 2, gapY: 120 }).get(2)!
    expect(far.y).toBeGreaterThan(near.y)
  })

  it('the sides margin keeps cards off the edges where layouts start from one', () => {
    for (const shape of ['grid', 'row', 'column', 'free'] as const) {
      const rects = [...computeLayout(cards(3), shape, 1000, 600, 14, { sides: 80 }).values()]
      expect(Math.min(...rects.map((r) => r.x))).toBe(80)
    }
    expect(columns(1000, 14, 80)).toBe(Math.floor((1000 - 160 + 14) / (CARD_W + 14)))
  })

  it('reads a tab\'s settings (older yes/no scatter counts as none)', () => {
    const tab = { spacing: 20, spacing_y: 30, margin_top: 60, margin_sides: 40, scatter: true, neutral: 10, card_size: 120, current_size: 200, turn: { actor_id: 3 } }
    expect(tabLayout(tab)).toEqual({ gap: 20, options: { currentId: 3, gapY: 30, top: 60, sides: 40, scatter: 0, neutral: 10, size: 1.2, currentSize: 2 } })
  })
})

describe('scene shapes', () => {
  it('grid rows are one card tall, from the top margin', () => {
    const cols = columns(900)
    const list = cards(cols + 1)
    list[1] = card(2, { attrs: 3 })
    const rects = computeLayout(list, 'grid', 900, 400)
    expect(rects.get(cols + 1)!.y).toBe(50 + CARD_H + 14)
    expect(rects.get(1)!.w).toBe(CARD_W)
  })

  it('spacing sets the gap between cards and grows the circle', () => {
    const row = computeLayout(cards(2), 'row', 900, 400, 40)
    expect(row.get(2)!.x - row.get(1)!.x).toBe(CARD_W + 40)
    const radius = (gap: number) => {
      const r = [...computeLayout(cards(4), 'circle', 900, 420, gap).values()]
      return Math.hypot(r[0].x - r[2].x, r[0].y - r[2].y)
    }
    expect(radius(80)).toBeGreaterThan(radius(14))
  })

  it('row and column line cards up without overlapping', () => {
    const mixed = [card(1, { style: 'full' }), card(2, { style: 'none' }), card(3, { attrs: 2 })]
    const row = [...computeLayout(mixed, 'row', 900, 400).values()]
    expect(new Set(row.map((r) => r.y)).size).toBe(1)
    const column = [...computeLayout(mixed, 'column', 900, 400).values()]
    expect(new Set(column.map((r) => r.x)).size).toBe(1)
    expect(overlaps(column[0], column[1]) || overlaps(column[1], column[2])).toBe(false)
  })

  it('circle cards never overlap, even when many', () => {
    for (const n of [2, 3, 6, 12]) {
      const rects = [...computeLayout(cards(n), 'circle', 900, 420).values()]
      for (let i = 0; i < rects.length; i += 1)
        for (let j = i + 1; j < rects.length; j += 1) expect(overlaps(rects[i], rects[j])).toBe(false)
      rects.forEach((r) => {
        expect(r.x).toBeGreaterThanOrEqual(0)
        expect(r.y).toBeGreaterThanOrEqual(0)
      })
    }
  })

  it('free uses saved positions, grid slots otherwise', () => {
    const rects = computeLayout([card(1, { position: { x: 300, y: 40 } }), card(2)], 'free', 900, 400)
    expect(rects.get(1)).toMatchObject({ x: 300, y: 40, w: CARD_W })
    expect(rects.get(2)!.x).toBe(50 + CARD_W + 14)
  })

  it('finds the nearest slot to reorder', () => {
    const slots = [...computeLayout(cards(4), 'row', 900, 400).values()]
    expect(nearestSlot(slots, slots[2].x + 10, slots[2].y + 10)).toBe(2)
    expect(nearestSlot(slots, 99999, 0)).toBe(3)
  })

  it('moves items', () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4])
  })
})

describe('quick value steps', () => {
  it('follows one order of magnitude below the scale', () => {
    expect(quickSteps(230)).toEqual({ big: 10, small: 1 })
    expect(quickSteps(3300)).toEqual({ big: 100, small: 1 })
    expect(quickSteps(12, 230)).toEqual({ big: 10, small: 1 })
  })

  it('is friendly for small and very large values', () => {
    expect(quickSteps(3)).toEqual({ big: null, small: 1 })
    expect(quickSteps(7)).toEqual({ big: 2, small: 1 })
    expect(quickSteps(31)).toEqual({ big: 5, small: 1 })
    expect(quickSteps(45000)).toEqual({ big: 1000, small: 100 })
  })

  it('parses typed values', () => {
    expect(parseValueInput('15', 20)).toBe(15)
    expect(parseValueInput('-7', 20)).toBe(13)
    expect(parseValueInput('+3', 20)).toBe(23)
    expect(parseValueInput('abc', 20)).toBeNull()
  })
})
