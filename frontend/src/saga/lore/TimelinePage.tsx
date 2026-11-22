/**
 * Lore → Events: the timeline. Events in date order under year headings, with what happened in each (resource
 * sub-events and relationships), eras as coloured bands down the side, and "today in the story". Filters: search,
 * event type, a resource involved, who made it. The moment slider sets a point in the story: later events dim,
 * and the Relationships graph can show what was true then. The DM adds events and eras, and moves today.
 * See docs/concepts/events.md.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import type { Era, EventView, Timeline } from '../../api/types'
import ColorPicker from '../../components/ColorPicker'
import Modal from '../../components/Modal'
import ResourceIcon from '../../components/ResourceIcon'
import ResourcePicker from '../../components/ResourcePicker'
import Segmented from '../../components/Segmented'
import VisibilityPicker from '../../components/VisibilityPicker'
import CharacterForm from '../CharacterForm'
import { useSaga } from '../SagaContext'
import { LoreSections } from '../SectionTabs'
import DateInput from './DateInput'
import { formatDate, formatYear, splitDate } from './dates'
import { useMoment } from './moment'
import { readFrom, resourcePath, sagaKinds } from './relationships'

type Row =
  | { kind: 'year'; key: string; date: number; year: number }
  | { kind: 'event'; key: string; date: number; event: EventView }
  | { kind: 'era'; key: string; date: number; era: Era; edge: 'start' | 'end' }
  | { kind: 'today'; key: string; date: number }

/** Pure: the rows of the timeline, in date order, with a heading when the year changes. */
export function timelineRows(events: EventView[], eras: Era[], today: number | null): Row[] {
  const items: Row[] = []
  for (const e of events) if (e.date !== null) items.push({ kind: 'event', key: `e${e.id}`, date: e.date, event: e })
  for (const era of eras) {
    items.push({ kind: 'era', key: `s${era.id}`, date: era.start, era, edge: 'start' })
    if (era.end !== null) items.push({ kind: 'era', key: `x${era.id}`, date: era.end, era, edge: 'end' })
  }
  if (today !== null) items.push({ kind: 'today', key: 'today', date: today })
  // On the same day: an era begins, then today, then events, then an era ends
  const rank = (r: Row) => (r.kind === 'era' ? (r.edge === 'start' ? 0 : 3) : r.kind === 'today' ? 1 : 2)
  items.sort((a, b) => a.date - b.date || rank(a) - rank(b))
  const rows: Row[] = []
  let year: number | null = null
  for (const item of items) {
    const y = splitDate(item.date).year
    if (y !== year) {
      rows.push({ kind: 'year', key: `y${y}`, date: item.date, year: y })
      year = y
    }
    rows.push(item)
  }
  return rows
}

/** Pure: the eras running at a date. */
export function erasAt(eras: Era[], date: number): Era[] {
  return eras.filter((e) => e.start <= date && (e.end === null || date <= e.end))
}

/** Pure: events matching the filters. */
export function filterEvents(events: EventView[], f: { query: string; type: string | null; resourceId: number | null; creator: 'all' | 'dm' | 'players' },
  roleOf: (memberId: number | null) => string | undefined): EventView[] {
  const q = f.query.trim().toLowerCase()
  return events.filter((e) => (!q || (e.name || '').toLowerCase().includes(q))
    && (!f.type || e.type === f.type)
    && (!f.resourceId || e.sub_events.some((s) => s.resource.id === f.resourceId)
      || e.relationships.some((r) => r.from.id === f.resourceId || r.to.id === f.resourceId)
      || ((e.attributes.involved as number[] | undefined) || []).includes(f.resourceId))
    && (f.creator === 'all' || (f.creator === 'dm' ? roleOf(e.created_by) === 'admin' : roleOf(e.created_by) !== 'admin')))
}

function EraEditor({ era, onDone }: { era: Era | null; onDone: (changed: boolean) => void }) {
  const { sagaId, saga } = useSaga()
  const [draft, setDraft] = useState<Partial<Era>>(era ?? { name: '', start: saga.story_date, end: null, color: '#b08a3e', note: '', visibility: { groups: [], members: [] } })
  const [error, setError] = useState('')
  const save = async () => {
    try {
      if (era) await api.updateEra(sagaId, era.id, draft)
      else await api.createEra(sagaId, draft)
      onDone(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="era-editor">
      {error && <div className="error">{error}</div>}
      <label>Name<input autoFocus value={draft.name ?? ''} placeholder="The Long War" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <DateInput label="Starts" value={draft.start ?? saga.story_date} onChange={(v) => setDraft({ ...draft, start: v ?? saga.story_date })} />
      <DateInput label="Ends" value={draft.end ?? null} optional emptyLabel="Still going" onChange={(v) => setDraft({ ...draft, end: v })} />
      <div className="field"><span className="field-label">Colour</span><ColorPicker label="Era colour" value={draft.color ?? '#b08a3e'} onChange={(c) => setDraft({ ...draft, color: c })} /></div>
      <label>Note<input value={draft.note ?? ''} maxLength={300} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
      <div className="field"><span className="field-label">Who sees it</span>
        <VisibilityPicker value={draft.visibility ?? { groups: [], members: [] }} groups={saga.groups} members={saga.members} onChange={(v) => setDraft({ ...draft, visibility: v })} />
      </div>
      <div className="button-row">
        <button className="primary" onClick={() => void save()}>Save</button>
        <button className="ghost" onClick={() => onDone(false)}>Cancel</button>
        <span className="spacer" />
        {era && <button className="ghost danger" onClick={() => window.confirm(`Delete the era "${era.name}"?`) && void api.deleteEra(sagaId, era.id).then(() => onDone(true))}>Delete</button>}
      </div>
    </div>
  )
}

export function EventLines({ event }: { event: EventView }) {
  const { sagaId } = useSaga()
  if (!event.sub_events.length && !event.relationships.length) return null
  return (
    <ul className="event-lines">
      {event.sub_events.map((s) => {
        const path = resourcePath(sagaId, s.resource.kind, s.resource.id)
        return <li key={`s${s.id}`}>{path ? <Link to={path}>{s.resource.name}</Link> : <span>{s.resource.name ?? '???'}</span>} <span className="muted">— {s.what}</span></li>
      })}
      {event.relationships.map((r) => {
        const { verb } = readFrom(r, r.from.id ?? -1)
        return <li key={`r${r.id}`}><span>{r.from.name ?? '???'}</span> <span className="rel-verb">{verb}</span> <span>{r.to.name ?? '???'}</span></li>
      })}
    </ul>
  )
}

export default function TimelinePage() {
  const { sagaId, saga, isAdmin, ruleset, refreshSaga } = useSaga()
  const navigate = useNavigate()
  const [data, setData] = useState<Timeline | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [resource, setResource] = useState<{ id: number; name: string } | null>(null)
  const [creator, setCreator] = useState<'all' | 'dm' | 'players'>('all')
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [era, setEra] = useState<Era | 'new' | null>(null)
  const [editingToday, setEditingToday] = useState(false)
  const [moment, setMoment] = useMoment(sagaId)
  const cal = saga.calendar
  const types = ruleset.kinds.event?.types || {}

  const load = useCallback(() => {
    api.timeline(sagaId).then(setData).catch((e: Error) => setError(e.message))
  }, [sagaId])
  useEffect(load, [load])

  const roleOf = (id: number | null) => saga.members.find((m) => m.id === id)?.role
  const events = useMemo(() => filterEvents(data?.events || [], { query, type, resourceId: resource?.id ?? null, creator }, roleOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, query, type, resource, creator, saga.members])
  const rows = useMemo(() => timelineRows(events, data?.eras || [], saga.story_date), [events, data, saga.story_date])
  const eras = data?.eras || []
  const lanes = eras.length
  const dates = useMemo(() => [...new Set(rows.filter((r) => r.kind !== 'year').map((r) => r.date))].sort((a, b) => a - b), [rows])
  const momentIndex = moment === null ? dates.length : Math.max(0, dates.findIndex((d) => d >= moment))

  if (!ruleset.kinds.event) return <div className="page-message">This Saga's template has no events.</div>

  return (
    <div className="page timeline-page">
      <header className="page-header">
        <h1>Lore</h1>
        {isAdmin && (
          <div className="button-row">
            <button onClick={() => setEra('new')}>＋ Era</button>
            <button className="primary" onClick={() => setCreating(true)}>＋ Event</button>
          </div>
        )}
      </header>
      <LoreSections />
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <div className="timeline-today">
        <span className="muted small">Today in the story</span>
        {editingToday && isAdmin ? (
          <DateInput value={saga.story_date} onChange={(v) => v !== null && void api.setStoryDate(sagaId, v).then(refreshSaga).catch((e: Error) => setError(e.message))} />
        ) : <strong>{formatDate(cal, saga.story_date)}</strong>}
        {isAdmin && <button className="small ghost" onClick={() => setEditingToday(!editingToday)}>{editingToday ? 'Done' : 'Change'}</button>}
        <span className="spacer" />
        {eras.map((e) => (
          <button key={e.id} className="chip era-chip" style={{ borderColor: e.color }} onClick={() => isAdmin && setEra(e)}
            title={`${formatDate(cal, e.start)} – ${e.end === null ? 'still going' : formatDate(cal, e.end)}${e.note ? `: ${e.note}` : ''}`}>
            <span className="era-swatch" style={{ background: e.color }} />{e.name}
          </button>
        ))}
      </div>
      <div className="list-filters">
        <input placeholder="Search events" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search events" />
        {Object.keys(types).length > 1 && (
          <div className="chips">
            {Object.entries(types).map(([key, t]) => (
              <button key={key} type="button" className={`chip ${type === key ? 'on' : ''}`} onClick={() => setType(type === key ? null : key)}>{t.plural || t.name}</button>
            ))}
          </div>
        )}
        <div className="chips">
          <button type="button" className={`chip ${resource ? 'on' : ''}`} onClick={() => (resource ? setResource(null) : setPicking(true))}>
            {resource ? `Involving ${resource.name} ✕` : 'Involving…'}
          </button>
          <Segmented value={creator} options={[['all', 'Anyone'], ['dm', 'The DM'], ['players', 'Players']]} onChange={setCreator} />
        </div>
      </div>
      {dates.length > 1 && (
        <div className="moment-bar">
          <span className="muted small">Moment in the story</span>
          <input type="range" min={0} max={dates.length} value={momentIndex} aria-label="Moment in the story"
            onChange={(e) => { const i = Number(e.target.value); setMoment(i >= dates.length ? null : dates[i]) }} />
          <strong className="small">{moment === null ? 'Everything' : formatDate(cal, moment)}</strong>
          {moment !== null && <Link className="small" to={`/s/${sagaId}/lore/relationships`}>Relationships then →</Link>}
        </div>
      )}
      {data && events.length === 0 && eras.length === 0 && (
        <p className="muted">{isAdmin ? 'No events yet. Add one, or give a relationship a start date: it lands here.' : 'No events shared with you yet.'}</p>
      )}
      <ol className="timeline" style={{ ['--lanes' as string]: lanes }}>
        {rows.map((row) => {
          const later = moment !== null && row.date > moment
          const lanesHere = eras.map((e) => erasAt([e], row.date).length > 0 && row.kind !== 'year')
          const rail = lanes > 0 && (
            <span className="tl-rail" aria-hidden>
              {eras.map((e, i) => <span key={e.id} className={`tl-lane ${lanesHere[i] ? 'on' : ''}`} style={{ background: lanesHere[i] ? e.color : undefined }} />)}
            </span>
          )
          if (row.kind === 'year') return <li key={row.key} className="tl-year">{rail}<h3>{formatYear(cal, row.year)}</h3></li>
          if (row.kind === 'today') return <li key={row.key} className="tl-today">{rail}<span className="tl-date">{formatDate(cal, row.date)}</span><span className="tl-today-mark">◉ Today in the story</span></li>
          if (row.kind === 'era') {
            return (
              <li key={row.key} className={`tl-era ${later ? 'later' : ''}`}>{rail}
                <span className="tl-date">{formatDate(cal, row.date)}</span>
                <button className="tl-era-mark" style={{ color: row.era.color }} onClick={() => isAdmin && setEra(row.era)}>
                  {row.edge === 'start' ? '▼' : '▲'} {row.era.name} {row.edge === 'start' ? 'begins' : 'ends'}
                </button>
              </li>
            )
          }
          const e = row.event
          return (
            <li key={row.key} className={`tl-event ${later ? 'later' : ''}`}>{rail}
              <span className="tl-date">{formatDate(cal, row.date)}</span>
              <button className="tl-card" onClick={() => navigate(`/s/${sagaId}/lore/events/${e.id}`)}>
                <span className="tl-card-head">
                  <ResourceIcon resource={e} className="tl-icon round" />
                  <strong>{e.name ?? '???'}</strong>
                  <span className="muted small">{types[e.type]?.name}</span>
                </span>
                <EventLines event={e} />
              </button>
            </li>
          )
        })}
      </ol>
      <ResourcePicker open={picking} title="Events involving" kinds={sagaKinds(ruleset).filter((k) => k !== 'event')} multiple={false}
        onPick={(_, [r]) => r && setResource({ id: r.id, name: r.name })} onClose={() => setPicking(false)} />
      <Modal open={creating} title="New event" onClose={() => setCreating(false)}>
        {creating && <CharacterForm kind="event" typeKey={type ?? undefined} onDone={(made) => { setCreating(false); if (made) navigate(`/s/${sagaId}/lore/events/${made.id}`) }} />}
      </Modal>
      <Modal open={era !== null} title={era === 'new' ? 'New era' : 'Era'} onClose={() => setEra(null)}>
        {era !== null && <EraEditor era={era === 'new' ? null : era} onDone={(changed) => { setEra(null); if (changed) load() }} />}
      </Modal>
    </div>
  )
}
