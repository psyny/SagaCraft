import { CARD_W, cardHeight, columns, computeLayout, moveItem, nearestSlot, parseValueInput, quickSteps } from './layout'
import type { Card, CardAttribute, CardStyle } from './types'

const hp: CardAttribute = { key: 'hp', label: 'HP', type: 'counter', style: 'bar', display_on: 'card', current: 5, max: 10 }
const card = (id: number, opts: { position?: Card['position']; style?: CardStyle; attrs?: number } = {}): Card => ({
  id, resource_id: id, order: id, position: opts.position ?? {}, name: `C${id}`, type: 'npc', style: opts.style ?? 'face',
  picture: null, defeated: false, attributes: Array.from({ length: opts.attrs ?? 1 }, (_, i) => ({ ...hp, key: `a${i}` })),
})
const cards = (n: number) => Array.from({ length: n }, (_, i) => card(i + 1))
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('card sizes', () => {
  it('grow with the values shown, per style', () => {
    expect(cardHeight('face', 2)).toBeGreaterThan(cardHeight('face', 1))
    expect(cardHeight('none', 1)).toBeLessThan(cardHeight('face', 1))
    expect(cardHeight('full', 1)).toBeGreaterThanOrEqual(cardHeight('face', 1))
  })

  it('count only the values shown on the card (not hidden ones, not the hover tray)', () => {
    const shown = card(1, { attrs: 3 })
    const mixed = {
      ...shown,
      attributes: [shown.attributes[0], { ...shown.attributes[1], display_on: 'hidden' as const }, { ...shown.attributes[2], display_on: 'hover' as const }],
    }
    const rects = computeLayout([mixed], 'grid', 900, 400)
    expect(rects.get(1)!.h).toBe(cardHeight('face', 1))
  })
})

describe('creature panel shapes', () => {
  it('grid rows are as tall as their tallest card', () => {
    const cols = columns(900)
    const list = cards(cols + 1)
    list[1] = card(2, { attrs: 3 })
    const rects = computeLayout(list, 'grid', 900, 400)
    expect(rects.get(cols + 1)!.y).toBe(16 + cardHeight('face', 3) + 14)
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
    expect(rects.get(2)!.x).toBe(16 + CARD_W + 14)
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
