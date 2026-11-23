import { describe, expect, it } from 'vitest'
import { pot, viewRect } from './MapRenderer'

const box = (left: number, top: number, w: number, h: number) =>
  ({ left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top, toJSON: () => null }) as DOMRect

describe('the map canvas', () => {
  it('covers the part of the map in view (with a margin), not the whole map', () => {
    // A 4000 px map drawn 4× bigger (16000 screen px), the screen showing a 1000×800 px part of it
    const rect = viewRect(box(-8000, -4000, 16000, 8000), { left: 0, top: 0, right: 1000, bottom: 800 }, 4000, 2000)!
    expect(rect.x).toBeLessThanOrEqual(2000)
    expect(rect.x + rect.w).toBeGreaterThanOrEqual(2250)
    expect(rect.w).toBeLessThan(400) // about the view (250 map px) plus margins: a canvas the screen's size
    // Off screen: nothing to draw
    expect(viewRect(box(2000, 0, 100, 100), { left: 0, top: 0, right: 1000, bottom: 800 }, 100, 100)).toBeNull()
    // Fully in view: all of it
    expect(viewRect(box(0, 0, 500, 250), { left: 0, top: 0, right: 1000, bottom: 800 }, 1000, 500)).toEqual({ x: 0, y: 0, w: 1000, h: 500 })
  })
  it('sizes the picture texture in powers of two (mipmaps), within the limit', () => {
    expect([pot(1000, 4096), pot(1024, 4096), pot(5000, 4096), pot(1, 4096)]).toEqual([1024, 1024, 4096, 1])
  })
})
