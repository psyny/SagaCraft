/**
 * In-world dates: one integer, year * 10000 + month * 100 + day (months and days from 1), read with the Saga's
 * calendar. Sorting the numbers sorts the dates, whatever the calendar. Same rules as backend domain/calendar.py.
 */
import type { Calendar } from '../../api/types'

export function splitDate(key: number): { year: number; month: number; day: number } {
  const year = Math.floor(key / 10000)
  const rest = key - year * 10000
  return { year, month: Math.floor(rest / 100), day: rest % 100 }
}

export function joinDate(year: number, month: number, day: number): number {
  return year * 10000 + month * 100 + day
}

export const isLeap = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

export function daysIn(calendar: Calendar, year: number, month: number): number {
  const m = calendar.months[month - 1]
  if (!m) return 30
  return calendar.real && month === 2 && isLeap(year) ? 29 : m.days
}

/** "3 Frostmoon 300" (with the calendar's year label: "300 AR"); null reads "always". */
export function formatDate(calendar: Calendar, key: number | null | undefined, empty = 'always'): string {
  if (key === null || key === undefined) return empty
  const { year, month, day } = splitDate(key)
  const name = calendar.months[month - 1]?.name ?? `Month ${month}`
  return `${day} ${name} ${year}${calendar.year_label ? ` ${calendar.year_label}` : ''}`
}

/** "Year 300" / "300 AR": headings of the timeline. */
export function formatYear(calendar: Calendar, year: number): string {
  return calendar.year_label ? `${year} ${calendar.year_label}` : `Year ${year}`
}

/** The same date moved into this calendar (a day past a shorter month becomes its last day). */
export function clampDate(calendar: Calendar, year: number, month: number, day: number): number {
  const m = Math.max(1, Math.min(calendar.months.length, month))
  return joinDate(year, m, Math.max(1, Math.min(daysIn(calendar, year, m), day)))
}

/** "From … to …", "since …", "until …", or "" (always). */
export function formatSpan(calendar: Calendar, start: number | null, end: number | null): string {
  if (start === null && end === null) return ''
  if (end === null) return `since ${formatDate(calendar, start)}`
  if (start === null) return `until ${formatDate(calendar, end)}`
  return `${formatDate(calendar, start)} – ${formatDate(calendar, end)}`
}
