import { describe, expect, it } from 'vitest'
import type { Calendar, EventView } from '../../../api/types'
import { formatEventDate, joinDate } from '../dates'
import { filterEvents, inRange } from '../TimelinePage'
import { clampView, dateOfDay, dayNumber, firstView, placeBoxes, rangeOf, stackMarks, ticksFor, BOX_W, DOT_R, type Mark } from './scale'

const moons: Calendar = { preset: 'twelve_moons', name: 'Twelve Moons', real: false, year_label: 'AR',
  months: Array.from({ length: 12 }, (_, i) => ({ name: `M${i + 1}`, days: 30 })) }
const real: Calendar = { preset: 'gregorian', name: 'Gregorian', real: true, year_label: '',
  months: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].map((days, i) => ({ name: `R${i + 1}`, days })) }

describe('the horizontal timeline', () => {
  it('puts dates on a line of days, in any calendar, negative years and leap days too', () => {
    expect(dayNumber(moons, joinDate(1, 1, 1)) - dayNumber(moons, joinDate(0, 12, 30))).toBe(1)
    expect(dayNumber(moons, joinDate(300, 2, 1)) - dayNumber(moons, joinDate(300, 1, 1))).toBe(30)
    expect(dayNumber(real, joinDate(2024, 3, 1)) - dayNumber(real, joinDate(2024, 2, 28))).toBe(2) // 29 Feb
    expect(dayNumber(real, joinDate(2023, 3, 1)) - dayNumber(real, joinDate(2023, 2, 28))).toBe(1)
    expect(dayNumber(real, joinDate(2001, 1, 1)) - dayNumber(real, joinDate(2000, 1, 1))).toBe(366)
    for (const [cal, date] of [[moons, joinDate(-12, 7, 3)], [real, joinDate(1900, 12, 31)], [real, joinDate(-4, 2, 29)]] as const) {
      expect(dateOfDay(cal, dayNumber(cal, date))).toBe(date)
    }
  })

  it('ticks every few days, months or years, as the zoom allows', () => {
    const from = dayNumber(moons, joinDate(300, 1, 1))
    const days = ticksFor(moons, from, from + 29, 40)
    expect(days[0]).toMatchObject({ label: '1 M1', major: true })
    expect(days.length).toBeGreaterThan(5)
    const months = ticksFor(moons, from, from + 360, 4) // 120 px a month
    expect(months.map((t) => t.label).slice(0, 3)).toEqual(['M1 300', 'M2', 'M3'])
    const years = ticksFor(moons, from, from + 360 * 50, 0.02) // 7 px a year: every 25
    expect(years.map((t) => t.label)).toEqual(['300', '325', '350'])
    expect(years.every((t) => t.day >= from)).toBe(true)
  })

  it('piles up what would touch: periods first, circles over them', () => {
    const marks: Mark[] = [
      { id: 1, x0: 100, x1: 100, span: false },
      { id: 2, x0: 105, x1: 105, span: false }, // touches 1
      { id: 3, x0: 300, x1: 300, span: false }, // alone
      { id: 4, x0: 60, x1: 200, span: true }, // under 1 and 2
      { id: 5, x0: 150, x1: 260, span: true }, // overlaps 4
    ]
    const lanes = stackMarks(marks)
    expect([lanes.get(4), lanes.get(5)]).toEqual([0, 1])
    expect(lanes.get(1)).toBe(1) // over the period under it (the other one doesn't reach it)
    expect(lanes.get(2)).toBe(2) // over 1
    expect(lanes.get(3)).toBe(0)
    expect(stackMarks([{ id: 1, x0: 0, x1: 0, span: false }, { id: 2, x0: 2 * DOT_R + 20, x1: 0, span: false }]).get(2)).toBe(0)
  })

  it('fits expanded boxes: right of the line, else left, else a row higher; a period\'s box covers it', () => {
    const boxes = placeBoxes([
      { id: 1, x0: 100, x1: 100, span: false },
      { id: 2, x0: 150, x1: 150, span: false }, // its right is taken by 1's box: goes left? taken too: row 1
      { id: 3, x0: 700, x1: 700, span: false },
      { id: 4, x0: 1000, x1: 1600, span: true },
    ])
    const at = (id: number) => boxes.find((b) => b.id === id)!
    expect(at(1)).toMatchObject({ row: 0, side: 'right', left: 100 })
    expect(at(2).row).toBe(1)
    expect(at(3)).toMatchObject({ row: 0, side: 'right' })
    expect(at(4)).toMatchObject({ row: 0, left: 1000, width: 600 })
    expect(placeBoxes([{ id: 1, x0: 400, x1: 400, span: false }, { id: 2, x0: 400 + BOX_W + 30, x1: 0, span: false },
      { id: 3, x0: 400 + BOX_W + 20, x1: 0, span: false }]).find((b) => b.id === 2)).toMatchObject({ row: 1 }) // 3 came first
  })

  it('keeps boxes inside the view: left of the line near the right edge, slid in when neither side fits', () => {
    expect(placeBoxes([{ id: 1, x0: 900, x1: 900, span: false }], 1000)[0]).toMatchObject({ side: 'left', left: 900 - BOX_W })
    expect(placeBoxes([{ id: 1, x0: 100, x1: 100, span: false }], 200)[0].left).toBe(0)
    expect(placeBoxes([{ id: 1, x0: -300, x1: 600, span: true }], 1000)[0]).toMatchObject({ left: 0, width: 600 })
  })

  it('starts around today and the events nearest it', () => {
    const v = firstView([0, 1000, 2000, 3000, 4000, 5000, 9000, 9050, 9100, 9200], 9150, [0, 10000], 1000)
    expect(v.start).toBeGreaterThan(500) // the 8 nearest (2000 on) with some room: the oldest are left out
    expect(firstView([0, 9100], 9150, [0, 10000], 1000).start).toBe(0) // few events: all of them
    expect(v.start + 1000 / v.ppd).toBeGreaterThan(9200)
  })

  it('covers what is shown with a margin, or exactly the dates asked for; never zooms out past it', () => {
    expect(rangeOf([100, 200], null, null)).toEqual([85, 216])
    expect(rangeOf([100, 200], 50, 400)).toEqual([50, 401])
    expect(clampView({ start: -500, ppd: 0.001 }, [0, 1000], 500)).toEqual({ start: 0, ppd: 0.5 })
    expect(clampView({ start: 990, ppd: 1 }, [0, 1000], 500)).toEqual({ start: 500, ppd: 1 })
  })

  it('filters by dates: a period counts when any of it is inside', () => {
    expect(inRange(10, 20, 15, null)).toBe(true)
    expect(inRange(10, 20, 21, null)).toBe(false)
    expect(inRange(10, null, 500, 600)).toBe(true) // still going
    const ev = (id: number, date: number, end: number | null) => ({ id, date, end, name: `E${id}`, type: 'event', attributes: {},
      sub_events: [], relationships: [], created_by: 1 }) as unknown as EventView
    const list = [ev(1, 100, null), ev(2, 50, 150), ev(3, 300, null)]
    const f = { query: '', type: null, resourceId: null, creator: 'all' as const }
    expect(filterEvents(list, { ...f, from: 120, to: 400 }, () => 'admin').map((e) => e.id)).toEqual([2, 3])
  })

  it('writes a period once: the year at the end when it is the same', () => {
    expect(formatEventDate(moons, joinDate(300, 2, 10), joinDate(300, 4, 1))).toBe('10 M2 – 1 M4 300 AR')
    expect(formatEventDate(moons, joinDate(299, 12, 1), joinDate(300, 1, 5))).toBe('1 M12 299 AR – 5 M1 300 AR')
    expect(formatEventDate(moons, joinDate(300, 2, 10), null)).toBe('10 M2 300 AR')
  })
})
