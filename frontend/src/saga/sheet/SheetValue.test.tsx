import { render } from '@testing-library/react'
import type { DisplayValue } from '../../api/types'
import { percentOf } from '../../stage/sets/actorsScene/AttributeDisplays'
import { ValueBody } from './SheetValue'

const hp = (over: Partial<DisplayValue>): DisplayValue => ({ key: 'hp', label: 'HP', type: 'counter', style: 'bar', region: 'bottom', ...over })
const draw = (value: DisplayValue) => render(<ValueBody value={value} />).container

describe('Value styles (plan 57)', () => {
  it('a bar writes its numbers, a percentage or nothing, and fills from the min', () => {
    expect(draw(hp({ current: 23, max: 31 })).querySelector('.bar-text')?.textContent).toBe('23 / 31')
    expect(draw(hp({ current: 23, max: 31, percent: 74, value_shown: 'percent' })).querySelector('.bar-text')?.textContent).toBe('74%')
    expect(draw(hp({ current: 23, max: 31, value_shown: 'none' })).querySelector('.bar-text')).toBeNull()
    // Players who get only the percentage: the bar fills from it
    const players = draw(hp({ percent: 40, value_shown: 'percent' }))
    expect(players.querySelector('.bar-text')?.textContent).toBe('40%')
    expect((players.querySelector('.bar-fill') as HTMLElement).style.width).toBe('40%')
    expect(draw(hp({ percent: 40, value_shown: 'none' })).querySelector('.bar-fill')).not.toBeNull()
    expect((draw(hp({ current: 10, max: 30, min: -10 })).querySelector('.bar-fill') as HTMLElement).style.width).toBe('50%')
  })

  it('a bar takes its shape', () => {
    for (const shape of ['round', 'rounded', 'flat'] as const) {
      expect(draw(hp({ current: 1, max: 2, bar: shape })).querySelector('.bar')?.classList.contains(`bar-${shape}`)).toBe(true)
    }
  })

  it("a counter's number: current / max, a percentage or nothing", () => {
    expect(draw(hp({ style: 'number', current: 23, max: 31 })).textContent).toBe('23 / 31')
    expect(draw(hp({ style: 'number', percent: 74, value_shown: 'percent' })).textContent).toBe('74%')
    expect(draw(hp({ style: 'number', current: 23, max: 31, value_shown: 'none' })).textContent).toBe('')
  })

  it('discrete: its number of icons, their spacing and shape', () => {
    const icons = draw(hp({ style: 'discrete', level: 7, levels: 10, icon: 'stars', icon_gap: 0 }))
    expect(icons.querySelectorAll('.ball')).toHaveLength(10)
    expect(icons.querySelectorAll('.ball.filled')).toHaveLength(7)
    expect((icons.querySelector('.balls') as HTMLElement).style.columnGap).toMatch(/^0(px)?$/)
    const bars = draw(hp({ style: 'discrete', level: 1, levels: 3, icon: 'bars', icon_gap: 12 }))
    expect(bars.querySelector('.icons-bars .ball')?.getAttribute('viewBox')).toBe('0 0 8 16') // half as wide as tall
    expect((bars.querySelector('.balls') as HTMLElement).style.columnGap).toBe('12px')
  })

  it('percentages read as the server makes them', () => {
    expect([percentOf(31, 31), percentOf(0, 31), percentOf(23, 31), percentOf(1, 300), percentOf(299, 300), percentOf(0, 30, -10)]).toEqual([100, 0, 74, 1, 99, 25])
  })
})
