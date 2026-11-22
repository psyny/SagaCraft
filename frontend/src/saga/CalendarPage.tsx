/**
 * Saga → Calendar: the in-world calendar every date is read with (the real one, Twelve Moons, or the DM's own
 * months) and today in the story (new events' date). Changing the calendar keeps every date's day, month and
 * year. See docs/concepts/events.md ("Calendars").
 */
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Calendar, CalendarView } from '../api/types'
import DateInput from './lore/DateInput'
import { formatDate } from './lore/dates'
import { useSaga } from './SagaContext'

export default function CalendarPage() {
  const { sagaId, saga, isAdmin, refreshSaga } = useSaga()
  const [view, setView] = useState<CalendarView | null>(null)
  const [draft, setDraft] = useState<Calendar | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => { api.calendar(sagaId).then((v) => { setView(v); setDraft(v.calendar) }).catch((e: Error) => setError(e.message)) }, [sagaId])
  if (!isAdmin) return <div className="page-message">Only the Saga's admins set up the calendar.</div>
  if (!view || !draft) return <div className="page-message">{error || 'Loading…'}</div>

  const save = async (body: Parameters<typeof api.setCalendar>[1]) => {
    setError('')
    try {
      const next = await api.setCalendar(sagaId, body)
      setView(next)
      setDraft(next.calendar)
      setNote('Saved. Every date keeps its day, month and year.')
      await refreshSaga()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const own = !draft.real && draft.preset === null
  const months = draft.months
  const setMonth = (i: number, change: Partial<Calendar['months'][number]>) =>
    setDraft({ ...draft, months: months.map((m, j) => (j === i ? { ...m, ...change } : m)) })
  const move = (i: number, d: number) => {
    const next = [...months]
    const [m] = next.splice(i, 1)
    next.splice(i + d, 0, m)
    setDraft({ ...draft, months: next })
  }
  const changed = JSON.stringify(draft) !== JSON.stringify(view.calendar)

  return (
    <div className="page calendar-page">
      <header className="page-header"><h1>Calendar</h1></header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      {note && <div className="notice" onClick={() => setNote('')}>{note}</div>}
      <div className="columns">
        <section className="panel">
          <h2>Calendar</h2>
          <div className="chips">
            {view.presets.map((p) => (
              <button key={p.key} className={`chip ${draft.preset === p.key ? 'on' : ''}`} onClick={() => void save({ preset: p.key })}>{p.name}</button>
            ))}
            <button className={`chip ${own ? 'on' : ''}`} onClick={() => setDraft({ ...draft, preset: null, real: false, name: own ? draft.name : 'Our calendar' })}>Our own</button>
          </div>
          {own ? (
            <>
              <div className="grid-2">
                <label>Name<input value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
                <label>After the year<input value={draft.year_label} maxLength={12} placeholder="e.g. AR" onChange={(e) => setDraft({ ...draft, year_label: e.target.value })} /></label>
              </div>
              <table className="table calendar-months">
                <thead><tr><th>#</th><th>Month</th><th>Days</th><th /></tr></thead>
                <tbody>
                  {months.map((m, i) => (
                    <tr key={i}>
                      <td className="muted">{i + 1}</td>
                      <td><input value={m.name} maxLength={40} aria-label={`Month ${i + 1} name`} onChange={(e) => setMonth(i, { name: e.target.value })} /></td>
                      <td><input type="number" min={1} max={99} value={m.days} aria-label={`Month ${i + 1} days`} onChange={(e) => setMonth(i, { days: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })} /></td>
                      <td className="button-row">
                        <button className="small ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Earlier">↑</button>
                        <button className="small ghost" disabled={i === months.length - 1} onClick={() => move(i, 1)} aria-label="Later">↓</button>
                        <button className="small ghost danger" disabled={months.length < 2} onClick={() => setDraft({ ...draft, months: months.filter((_, j) => j !== i) })} aria-label="Remove">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="button-row">
                <button className="small" disabled={months.length >= 24} onClick={() => setDraft({ ...draft, months: [...months, { name: `Month ${months.length + 1}`, days: 30 }] })}>＋ Month</button>
                <span className="spacer" />
                <span className="muted small">{months.reduce((n, m) => n + m.days, 0)} days a year</span>
                <button className="primary" disabled={!changed} onClick={() => void save({ name: draft.name, year_label: draft.year_label, months })}>Save calendar</button>
              </div>
            </>
          ) : (
            <p className="muted small">{draft.real ? 'The real calendar, with leap years.' : `${months.length} months: ${months.map((m) => m.name).join(', ')}.`} Pick “Our own” to make one from it.</p>
          )}
        </section>
        <section className="panel">
          <h2>Today in the story</h2>
          <p className="muted small">New events start on this day; the timeline marks it.</p>
          <DateInput value={saga.story_date} calendar={view.calendar} onChange={(v) => v !== null && void api.setStoryDate(sagaId, v).then(refreshSaga).catch((e: Error) => setError(e.message))} />
          <p className="calendar-today">{formatDate(view.calendar, saga.story_date)}</p>
        </section>
      </div>
    </div>
  )
}
