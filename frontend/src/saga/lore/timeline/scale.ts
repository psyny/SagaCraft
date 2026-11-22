/**
 * The horizontal timeline's pure parts: in-world dates on a straight line of days (any calendar), the ticks for a
 * zoom level, markers piled up where they'd touch, and the boxes of expanded events fitted around each other.
 * See docs/concepts/events.md ("Timeline").
 */
import type { Calendar } from '../../../api/types'
import { daysIn, formatYear, joinDate, splitDate } from '../dates'

// -- days ---------------------------------------------------------------------------------

const yearLength = (cal: Calendar) => cal.months.reduce((n, m) => n + m.days, 0) || 360

/** Days before this year's first day (0 at year 0); the real calendar counts its leap years. */
function yearStart(cal: Calendar, year: number): number {
  if (!cal.real) return yearLength(cal) * year
  const y = year - 1
  return 365 * year + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)
}

/** A date as a day number: one step per day, whatever the calendar (negative years too). */
export function dayNumber(cal: Calendar, date: number): number {
  const { year, month, day } = splitDate(date)
  let n = yearStart(cal, year)
  for (let m = 1; m < month; m++) n += daysIn(cal, year, m)
  return n + day - 1
}

export function yearOfDay(cal: Calendar, n: number): number {
  let y = Math.floor(n / (cal.real ? 365.2425 : yearLength(cal)))
  while (yearStart(cal, y) > n) y--
  while (yearStart(cal, y + 1) <= n) y++
  return y
}

/** The date of a day number. */
export function dateOfDay(cal: Calendar, n: number): number {
  const year = yearOfDay(cal, Math.floor(n))
  let rest = Math.floor(n) - yearStart(cal, year)
  for (let month = 1; month <= cal.months.length; month++) {
    const len = daysIn(cal, year, month)
    if (rest < len) return joinDate(year, month, rest + 1)
    rest -= len
  }
  return joinDate(year, cal.months.length || 1, 1)
}

// -- ticks ----------------------------------------------------------------------------------

export interface Tick { day: number; label: string; major: boolean }

/** Room a tick needs, so labels don't touch. */
export const TICK_GAP = 96

/**
 * Ticks for the days from..to at this zoom: every few days, months or years, the first step whose ticks sit at
 * least TICK_GAP px apart. Major ticks start a month (day ticks), a year (month ticks) or a round number of years.
 */
export function ticksFor(cal: Calendar, from: number, to: number, pxPerDay: number): Tick[] {
  const year = yearLength(cal)
  const month = year / Math.max(1, cal.months.length)
  const fits = (days: number) => days * pxPerDay >= TICK_GAP
  const out: Tick[] = []
  const y0 = yearOfDay(cal, from), y1 = yearOfDay(cal, to)
  const dayStep = [1, 2, 5, 10, 15].find((s) => fits(s) && s < month)
  if (dayStep) {
    for (let d = Math.ceil(from); d <= to && out.length < 500; d++) {
      const { year: y, month: m, day } = splitDate(dateOfDay(cal, d))
      if ((day - 1) % dayStep !== 0) continue
      // Too close to the next month's first day: leave it out
      if (day > 1 && daysIn(cal, y, m) - day + 1 < dayStep / 2) continue
      out.push({ day: d, label: `${day} ${cal.months[m - 1]?.name ?? m}`, major: day === 1 })
    }
    return out
  }
  const monthStep = [1, 2, 3, 4, 6].find((s) => fits(s * month) && s < cal.months.length && cal.months.length % s === 0)
  if (monthStep) {
    for (let y = y0; y <= y1; y++) {
      for (let m = 1; m <= cal.months.length; m += monthStep) {
        const d = dayNumber(cal, joinDate(y, m, 1))
        if (d < from || d > to) continue
        out.push({ day: d, label: m === 1 ? `${cal.months[0].name} ${y}` : cal.months[m - 1].name, major: m === 1 })
      }
    }
    return out
  }
  const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000]
  const step = steps.find((s) => fits(s * year)) ?? steps[steps.length - 1]
  for (let y = Math.ceil(y0 / step) * step; y <= y1 && out.length < 500; y += step) {
    const d = yearStart(cal, y)
    if (d < from) continue
    out.push({ day: d, label: step === 1 ? formatYear(cal, y) : String(y), major: y % (step * 5) === 0 })
  }
  return out
}

// -- markers --------------------------------------------------------------------------------

export interface Mark { id: number; x0: number; x1: number; span: boolean }

/** Radius of an event's circle, px. */
export const DOT_R = 9
/** Room kept between neighbours, px. */
export const MARK_GAP = 4

/**
 * Lanes (0 on the line, then up) so nothing touches: periods first (overlapping ones stack), then circles, each
 * in the lowest free lane: circles pile up over each other and over the periods under them.
 */
export function stackMarks(marks: Mark[]): Map<number, number> {
  const lanes: [number, number][][] = []
  const lane = new Map<number, number>()
  const place = (id: number, a: number, b: number) => {
    let l = 0
    while (lanes[l]?.some(([p, q]) => a < q && p < b)) l++
    ;(lanes[l] ||= []).push([a, b])
    lane.set(id, l)
  }
  const spans = marks.filter((m) => m.span).sort((a, b) => a.x0 - b.x0 || a.id - b.id)
  for (const m of spans) place(m.id, m.x0 - MARK_GAP, Math.max(m.x1, m.x0 + 2 * DOT_R) + MARK_GAP)
  const dots = marks.filter((m) => !m.span).sort((a, b) => a.x0 - b.x0 || a.id - b.id)
  for (const m of dots) place(m.id, m.x0 - DOT_R - MARK_GAP, m.x0 + DOT_R + MARK_GAP)
  return lane
}

// -- expanded boxes -------------------------------------------------------------------------

export interface BoxPlace { id: number; row: number; left: number; width: number; side: 'right' | 'left' }

export const BOX_W = 230
const BOX_GAP = 10

/**
 * Where the boxes of expanded events go: rows from the markers up; each box to the right of its line (a period's
 * box covers what's shown of the period, at least BOX_W wide) or, when that's taken or past the view's edge, to
 * its left; else a row higher. Boxes stay inside the view (0..width) when they can.
 */
export function placeBoxes(marks: Mark[], viewWidth = Infinity): BoxPlace[] {
  const rows: [number, number][][] = []
  const out: BoxPlace[] = []
  const free = (row: number, a: number, b: number) => !rows[row]?.some(([p, q]) => a < q + BOX_GAP && p < b + BOX_GAP)
  const inside = (left: number, width: number) => left >= 0 && left + width <= viewWidth
  for (const m of [...marks].sort((a, b) => a.x0 - b.x0 || a.id - b.id)) {
    let options: [number, number, BoxPlace['side']][]
    if (m.span) {
      const left = Math.max(m.x0, 0)
      const width = Math.max(BOX_W, Math.min(m.x1, viewWidth) - left)
      options = [[Math.min(left, Math.max(0, viewWidth - width)), width, 'right']]
    } else {
      const both: [number, number, BoxPlace['side']][] = [[m.x0, BOX_W, 'right'], [m.x0 - BOX_W, BOX_W, 'left']]
      options = both.filter(([l, w]) => inside(l, w))
      // Neither side fits in the view (a narrow one): slide the box in, still over its line
      if (!options.length) options = [[Math.max(0, Math.min(m.x0 - BOX_W / 2, viewWidth - BOX_W)), BOX_W, 'right']]
    }
    for (let row = 0; ; row++) {
      const fit = options.find(([left, width]) => free(row, left, left + width))
      if (fit) {
        ;(rows[row] ||= []).push([fit[0], fit[0] + fit[1]])
        out.push({ id: m.id, row, left: fit[0], width: fit[1], side: fit[2] })
        break
      }
    }
  }
  return out
}

// -- view -------------------------------------------------------------------------------------

export interface View { start: number; ppd: number }

/** Keep the view inside the range, never zoomed out past it. */
export function clampView(v: View, range: [number, number], width: number, maxPpd = 80): View {
  const span = Math.max(1, range[1] - range[0])
  const ppd = Math.min(maxPpd, Math.max(width / span, v.ppd))
  const shown = width / ppd
  return { ppd, start: Math.min(range[1] - shown, Math.max(range[0], v.start)) }
}

/** Zoom by a factor around a point of the view (px from its left). */
export function zoomView(v: View, factor: number, px: number, range: [number, number], width: number): View {
  const day = v.start + px / v.ppd
  const ppd = v.ppd * factor
  return clampView({ ppd, start: day - px / ppd }, range, width)
}

/**
 * The first view: around today, wide enough for the events nearest to it (up to 8), with some room; at least a
 * season, at most everything.
 */
export function firstView(days: number[], today: number, range: [number, number], width: number): View {
  const near = [...days].sort((a, b) => Math.abs(a - today) - Math.abs(b - today) || a - b).slice(0, 8)
  const lo = Math.min(today, ...near), hi = Math.max(today, ...near) + 1
  const shown = Math.min(range[1] - range[0], Math.max(90, (hi - lo) * 1.3))
  return clampView({ start: (lo + hi) / 2 - shown / 2, ppd: width / shown }, range, width)
}

/** The days the timeline covers: everything shown, with a margin (or exactly the range asked for). */
export function rangeOf(days: number[], from: number | null, to: number | null): [number, number] {
  if (from !== null && to !== null) return [from, Math.max(to + 1, from + 1)]
  const list = days.length ? days : [0]
  let lo = from ?? Math.min(...list), hi = to !== null ? to + 1 : Math.max(...list) + 1
  const pad = Math.max(15, (hi - lo) * 0.06)
  if (from === null) lo -= pad
  if (to === null) hi += pad
  return [lo, hi]
}
