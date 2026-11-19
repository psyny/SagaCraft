import {
  applyAdjustments,
  cropForRatio,
  cssFilter,
  moveCrop,
  NO_ADJUSTMENTS,
  outputSize,
  resizeCrop,
} from './imageMath'

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

describe('crop geometry', () => {
  it('fits the largest crop of a ratio in the middle', () => {
    const c = cropForRatio(1, 2000, 1000) // square in a wide image
    expect(c).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 })
    const p = cropForRatio(3 / 4, 1000, 2000) // portrait in a tall image: width-bound
    expect(p.w).toBe(1)
    expect(close((p.w * 1000) / (p.h * 2000), 3 / 4)).toBe(true)
  })

  it('keeps the crop inside the image when moving', () => {
    expect(moveCrop({ x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, 0.5, -1)).toEqual({ x: 0.6, y: 0, w: 0.4, h: 0.4 })
  })

  it('resizes freely from an edge', () => {
    const c = resizeCrop({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'e', 0.1, 0, null, 1000, 1000)
    expect(c.x).toBeCloseTo(0.2)
    expect(c.w).toBeCloseTo(0.6)
    expect(c.h).toBeCloseTo(0.5)
  })

  it('keeps the ratio and the opposite corner when resizing a corner', () => {
    const c = resizeCrop({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, 'nw', -0.1, -0.3, 1, 1000, 1000)
    expect(c.x + c.w).toBeCloseTo(0.6)
    expect(c.y + c.h).toBeCloseTo(0.6)
    expect(c.w).toBeCloseTo(c.h)
  })

  it('never leaves the image with a locked ratio', () => {
    const c = resizeCrop({ x: 0.1, y: 0.5, w: 0.3, h: 0.3 }, 'se', 0.8, 0, 1, 1000, 1000)
    expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9)
    expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9)
    expect(c.w).toBeCloseTo(c.h)
  })

  it('computes the output size within the pixel limit', () => {
    expect(outputSize({ x: 0, y: 0, w: 1, h: 0.5 }, 4000, 3000, 1024)).toEqual({ width: 1024, height: 384 })
    expect(outputSize({ x: 0, y: 0, w: 0.1, h: 0.1 }, 4000, 3000, 1024)).toEqual({ width: 400, height: 300 })
  })
})

describe('colour adjustments', () => {
  it('does nothing by default', () => {
    const data = new Uint8ClampedArray([10, 120, 250, 255])
    applyAdjustments(data, NO_ADJUSTMENTS)
    expect([...data]).toEqual([10, 120, 250, 255])
    expect(cssFilter(NO_ADJUSTMENTS)).toBe('none')
  })

  it('turns pixels grey with zero saturation and keeps alpha', () => {
    const data = new Uint8ClampedArray([200, 40, 40, 128])
    applyAdjustments(data, { ...NO_ADJUSTMENTS, saturation: 0 })
    expect(data[0]).toBe(data[1])
    expect(data[1]).toBe(data[2])
    expect(data[3]).toBe(128)
  })

  it('brightens and clamps', () => {
    const data = new Uint8ClampedArray([100, 200, 250, 255])
    applyAdjustments(data, { ...NO_ADJUSTMENTS, brightness: 1.5 })
    expect([...data]).toEqual([150, 255, 255, 255])
  })

  it('a full hue turn changes nothing', () => {
    const data = new Uint8ClampedArray([200, 40, 90, 255])
    applyAdjustments(data, { ...NO_ADJUSTMENTS, hue: 360 })
    expect([...data].map((v, i) => Math.abs(v - [200, 40, 90, 255][i]) <= 1)).toEqual([true, true, true, true])
  })

  it('builds the matching CSS filter', () => {
    expect(cssFilter({ brightness: 1.2, contrast: 0.9, saturation: 1.5, hue: 30 })).toBe(
      'brightness(1.2) contrast(0.9) saturate(1.5) hue-rotate(30deg)',
    )
  })
})
