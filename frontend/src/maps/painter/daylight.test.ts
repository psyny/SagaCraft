import { daylight, hourName } from './daylight'

describe("the hour's light (plan 48)", () => {
  it('is as painted by day, golden at dusk, dark blue but readable at night (the lights on)', () => {
    expect(daylight(12)).toEqual({ tint: [1, 1, 1], night: 0 })
    const dusk = daylight(18)
    expect(dusk.tint[0]).toBeGreaterThan(dusk.tint[2]) // warm
    const night = daylight(23)
    expect(night.night).toBe(1)
    expect(night.tint[2]).toBeGreaterThan(night.tint[0]) // cool
    expect(Math.min(...night.tint)).toBeGreaterThan(0.3) // dimmed, never black
    expect(daylight(24)).toEqual(daylight(0))
    expect(hourName(18.5)).toBe('Dusk, 18:30')
    expect(hourName(2)).toBe('Night, 2:00')
  })
})
