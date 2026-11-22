import { describe, expect, it } from 'vitest'
import { forServer } from '../saga/efx/EnvironmentsPage'
import { intensityAt, seeded } from './variation'

const rain = { id: 'abc123', intensity: [30, 50] as [number, number], vary: 60 }

describe('EFX intensity over time', () => {
  it('is steady in the middle of its range without variation', () => {
    expect(intensityAt({ ...rain, vary: 0 }, 1234)).toBeCloseTo(0.4)
    expect(intensityAt({ ...rain, intensity: [70, 70] }, 99)).toBeCloseTo(0.7)
  })
  it('stays inside its range, eases to a new value each period, the same on every screen', () => {
    const values = Array.from({ length: 400 }, (_, i) => intensityAt(rain, 1_700_000_000 + i * 7))
    for (const v of values) { expect(v).toBeGreaterThanOrEqual(0.3 - 1e-9); expect(v).toBeLessThanOrEqual(0.5 + 1e-9) }
    expect(new Set(values.map((v) => v.toFixed(3))).size).toBeGreaterThan(10) // it does change
    expect(intensityAt(rain, 1_700_000_123)).toBe(intensityAt({ ...rain }, 1_700_000_123)) // same id, same time
    // Holds after the change (the last 60% of a period)
    const start = Math.ceil(1_700_000_000 / 60) * 60
    expect(intensityAt(rain, start + 30)).toBeCloseTo(intensityAt(rain, start + 55))
    // No jumps: a second apart, close
    expect(Math.abs(intensityAt(rain, start + 10) - intensityAt(rain, start + 11))).toBeLessThan(0.05)
  })
  it('seeds per effect', () => {
    expect(seeded('a', 1)).not.toBe(seeded('b', 1))
    expect(seeded('a', 1)).toBe(seeded('a', 1))
  })
  it('sends pictures by id only (their URLs are for drawing)', () => {
    const layer = { effects: [{ id: 'x', kind: 'image', params: { file: 4, file_url: '/api/files/4?s=1', fit: 'cover' }, intensity: [50, 50] as [number, number], vary: 0 }] }
    expect(forServer(layer).effects[0].params).toEqual({ file: 4, fit: 'cover' })
  })
})
