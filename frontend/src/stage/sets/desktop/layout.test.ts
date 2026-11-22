import { autoLayout, freeBox, tierColor, toPlace } from './layout'

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
    // it uses the space: here the width runs out first (one row from edge to edge)
    const right = Math.max(...boxes.map((b) => b.x + b.w)), left = Math.min(...boxes.map((b) => b.x))
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
