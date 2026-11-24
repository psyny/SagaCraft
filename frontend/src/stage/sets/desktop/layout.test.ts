import { autoLayout, FOCUS, focusLayout, freeBox, tierColor, toPlace } from './layout'

describe('the desk', () => {
  it('packs pieces in rows at one scale that fits the desk, keeping their shapes', () => {
    const sizes = [{ w: 100, h: 140 }, { w: 100, h: 140 }, { w: 200, h: 100 }]
    const boxes = autoLayout(sizes, 800, 400, 10)
    expect(boxes).toHaveLength(3)
    for (const [i, b] of boxes.entries()) {
      expect(b.w / b.h).toBeCloseTo(sizes[i].w / sizes[i].h)
      expect(b.x).toBeGreaterThanOrEqual(10 - 1e-6)
      expect(b.x + b.w).toBeLessThanOrEqual(790 + 1e-6)
      expect(b.y + b.h).toBeLessThanOrEqual(390 + 1e-6)
    }
    // As big as fits, but no piece taller than 40% of the desk: a first piece doesn't fill the whole desk
    expect(Math.max(...boxes.map((b) => b.h))).toBeCloseTo(160, 0)
    expect(autoLayout([{ w: 100, h: 140 }], 800, 400, 10)[0].h).toBeCloseTo(160, 0)
    // When the width runs out first, it still fits (one row from edge to edge)
    const wide = autoLayout([{ w: 400, h: 50 }], 800, 400, 10)
    const right = Math.max(...wide.map((b) => b.x + b.w)), left = Math.min(...wide.map((b) => b.x))
    expect(right - left).toBeGreaterThan(780 * 0.98)
    expect(autoLayout([], 800, 400, 10)).toEqual([])
  })
  it('keeps a free place (fractions of the desk) and falls back to Auto without one', () => {
    const fallback = { x: 1, y: 2, w: 3, h: 4, rot: 0, z: 0 }
    expect(freeBox({}, { w: 100, h: 200 }, 1000, 500, fallback)).toBe(fallback)
    const box = freeBox({ x: 0.1, y: 0.2, w: 0.3, rot: 15, z: 4 }, { w: 100, h: 200 }, 1000, 500, fallback)
    expect(box).toEqual({ x: 100, y: 100, w: 300, h: 600, rot: 15, z: 4 })
    expect(toPlace(box, 1000, 500)).toEqual({ x: 0.1, y: 0.2, w: 0.3, rot: 15 })
  })
  it('colours an item\'s tier by its place among the options', () => {
    expect(tierColor(null)).toBe('#9b92a4')
    expect(tierColor({ index: 0, of: 5 })).toBe('#9b92a4')
    expect(tierColor({ index: 4, of: 5 })).toBe('#e0b25a')
    expect(tierColor({ index: 1, of: 3 })).toBe('#6fa8e0')
  })
})

describe('the desk in focus', () => {
  const card = { w: 150, h: 210 }, page = { w: 420, h: 560 }, wide = { w: 400, h: 100 }

  it('draws one piece as big as fits between the top margin and the row, the others in a 100 px row 50 px up', () => {
    const { boxes } = focusLayout([card, page, wide], 1, 1600, 1000)
    const row = [boxes[0], boxes[2]]
    for (const b of row) {
      expect(b.h).toBeCloseTo(FOCUS.row)
      expect(b.y + b.h).toBeCloseTo(1000 - FOCUS.margin)
    }
    expect(boxes[2].w).toBeCloseTo(400) // its own shape: 100 tall, 400 wide
    const f = boxes[1]
    expect(FOCUS.margin).toBe(50)
    expect(f.y).toBeCloseTo(FOCUS.margin) // 50 from the top
    expect(f.y + f.h).toBeCloseTo(1000 - FOCUS.margin - FOCUS.row - FOCUS.margin) // and 50 above the row
    expect(f.w / f.h).toBeCloseTo(420 / 560)
    expect(f.x + f.w / 2).toBeCloseTo(800) // centred
    expect(f.z).toBeGreaterThan(Math.max(boxes[0].z, boxes[2].z))
  })

  it('keeps the focused piece\'s place in the row empty, the row centred, 50 px apart at most', () => {
    const { boxes } = focusLayout([card, card, card], 1, 1600, 1000)
    const w = FOCUS.row * (150 / 210)
    expect(boxes[2].x - (boxes[0].x + w)).toBeCloseTo(w + 2 * FOCUS.gap) // the middle one's slot between them
    expect(boxes[0].x + (boxes[2].x + w - boxes[0].x) / 2).toBeCloseTo(800)
  })

  it('narrows the space to fit more pieces, down to overlapping', () => {
    const many = Array.from({ length: 30 }, () => card)
    const { boxes } = focusLayout(many, null, 1000, 1000, true)
    const w = boxes[0].w
    const step = boxes[1].x - boxes[0].x
    expect(step).toBeLessThan(w) // they overlap
    expect(step).toBeGreaterThan(0)
    const last = boxes[29].x + boxes[29].w
    expect(boxes[0].x).toBeGreaterThan(FOCUS.sides + FOCUS.arrow) // room for the arrows
    expect(last).toBeLessThan(1000 - FOCUS.sides - FOCUS.arrow)
  })

  it('puts previous and next at the row\'s ends, for the DM', () => {
    const { boxes, arrows } = focusLayout([card, card, card], 1, 1600, 1000, true) // the middle one in focus
    expect(arrows!.prev.x + arrows!.size).toBeLessThanOrEqual(boxes[0].x)
    expect(arrows!.next.x).toBeGreaterThanOrEqual(boxes[2].x + boxes[2].w)
    expect(arrows!.prev.y + arrows!.size / 2).toBeCloseTo(boxes[0].y + boxes[0].h / 2)
    expect(focusLayout([card], 0, 1600, 1000).arrows).toBeNull()
  })

  it('shrinks the margins and the row on a short desk: the piece in focus keeps half of it', () => {
    const { boxes } = focusLayout([page, card], 0, 1000, 400)
    expect(boxes[1].h).toBeLessThan(FOCUS.row)
    expect(boxes[0].h).toBeGreaterThanOrEqual(200 - 1e-6)
    expect(boxes[1].y + boxes[1].h).toBeLessThanOrEqual(400)
  })
})
