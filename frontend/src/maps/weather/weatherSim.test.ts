import type { EfxEffect } from '../../api/types'
import { MAP_WEATHER_KINDS, MapWeatherSim } from './weatherSim'

/** A 2D context that records what's drawn (jsdom has none). */
function fakeContext() {
  const calls: { name: string; args: number[] }[] = []
  const record = (name: string) => (...args: unknown[]) => { calls.push({ name, args: args.filter((a): a is number => typeof a === 'number') }) }
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key]
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop: () => undefined })
      return record(key)
    },
    set(target, key: string, value) { target[key] = value; return true },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

const effect = (kind: string, params: Record<string, unknown>): EfxEffect =>
  ({ id: `${kind}-test`, kind, params, intensity: [70, 70], vary: 0 }) as EfxEffect

describe('the weather over a map (plan 49): it falls onto the map', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext().ctx as never)
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('rain lands on the ground in view and splashes there', () => {
    const sim = new MapWeatherSim([effect('weather', { kind: 'rain', wind: 20 })])
    const { ctx, calls } = fakeContext()
    const view = { x: -200, y: -100, s: 2, w: 800, h: 600 }
    for (let i = 0; i < 60; i++) sim.frame(ctx, view, 100 + i / 30, 1 / 30, true)
    calls.length = 0
    sim.frame(ctx, view, 102, 1 / 30, true)
    const splashes = calls.filter((c) => c.name === 'ellipse')
    expect(splashes.length).toBeGreaterThan(10)
    for (const { args: [x, y] } of splashes) {
      expect(x).toBeGreaterThan(-200); expect(x).toBeLessThan(1000)
      expect(y).toBeGreaterThan(-100); expect(y).toBeLessThan(700)
    }
    expect(calls.filter((c) => c.name === 'lineTo').length).toBeGreaterThan(100) // the streaks
  })

  it('a map opened in the snow already has snow on the ground; still maps draw it without moving it', () => {
    const { ctx, calls } = fakeContext()
    const view = { x: 0, y: 0, s: 1, w: 800, h: 600 }
    const warm = new MapWeatherSim([effect('weather', { kind: 'snow' })], true)
    warm.frame(ctx, view, 50, 0, false)
    const warmImages = calls.filter((c) => c.name === 'drawImage').length
    calls.length = 0
    const cold = new MapWeatherSim([effect('weather', { kind: 'snow' })])
    cold.frame(ctx, view, 50, 0, false)
    expect(warmImages).toBeGreaterThan(calls.filter((c) => c.name === 'drawImage').length * 1.5) // the settled flakes
    // still: the same flakes drawn the same way again
    calls.length = 0
    cold.frame(ctx, view, 50, 0, false)
    const first = JSON.stringify(calls)
    calls.length = 0
    cold.frame(ctx, view, 50, 0, false)
    expect(JSON.stringify(calls)).toBe(first)
  })

  it('draws weather and fog on the map; other effects stay screen effects', () => {
    expect([...MAP_WEATHER_KINDS].sort()).toEqual(['fog', 'weather'])
    expect(new MapWeatherSim([effect('vignette', { size: 50 })]).empty).toBe(true)
    const { ctx, calls } = fakeContext()
    new MapWeatherSim([effect('fog', { speed: 10 })]).frame(ctx, { x: 0, y: 0, s: 1, w: 800, h: 600 }, 10, 1 / 30, true)
    expect(calls.filter((c) => c.name === 'drawImage').length).toBeGreaterThan(4) // its banks
  })
})
