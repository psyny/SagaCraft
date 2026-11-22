/**
 * An in-world date: day, month (the Saga's calendar) and year. With `optional`, "Always" stands for no date
 * (relationships that never started or never end). "Today" picks today in the story.
 */
import type { Calendar } from '../../api/types'
import { useSaga } from '../SagaContext'
import { clampDate, daysIn, splitDate } from './dates'

interface Props {
  value: number | null
  onChange: (value: number | null) => void
  optional?: boolean
  /** The word for no date. */
  emptyLabel?: string
  disabled?: boolean
  label?: string
  calendar?: Calendar
}

export default function DateInput({ value, onChange, optional = false, emptyLabel = 'Always', disabled, label, calendar }: Props) {
  const { saga } = useSaga()
  const cal = calendar ?? saga.calendar
  const today = saga.story_date
  const set = value ?? today
  const { year, month, day } = splitDate(set)
  const change = (y: number, m: number, d: number) => onChange(clampDate(cal, y, m, d))
  return (
    <div className="date-input" role="group" aria-label={label}>
      {label && <span className="field-label">{label}</span>}
      <div className="date-input-row">
        {optional && (
          <label className="check small">
            <input type="checkbox" checked={value === null} disabled={disabled} onChange={(e) => onChange(e.target.checked ? null : today)} />
            {emptyLabel}
          </label>
        )}
        {value !== null && (
          <>
            <select aria-label="Day" value={day} disabled={disabled} onChange={(e) => change(year, month, Number(e.target.value))}>
              {Array.from({ length: daysIn(cal, year, month) }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
            <select aria-label="Month" value={month} disabled={disabled} onChange={(e) => change(year, Number(e.target.value), day)}>
              {cal.months.map((m, i) => <option key={i} value={i + 1}>{m.name}</option>)}
            </select>
            <input aria-label="Year" type="number" className="date-year" value={year} disabled={disabled}
              onChange={(e) => e.target.value !== '' && change(Math.trunc(Number(e.target.value)), month, day)} />
            {cal.year_label && <span className="muted small">{cal.year_label}</span>}
            {!disabled && value !== today && <button type="button" className="small ghost" onClick={() => onChange(today)} title="Today in the story">Today</button>}
          </>
        )}
      </div>
    </div>
  )
}
