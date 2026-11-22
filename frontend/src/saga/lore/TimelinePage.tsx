/**
 * Lore → Events, as a **timeline** (horizontal: timeline/TimelineView.tsx) or a **list** (EventList.tsx: one plain row
 * per event, oldest or newest first). Filters on top, for both: search, event type, a
 * resource involved, who made it, and the dates (from, to; an era's chip picks its period). The moment slider sets
 * a point in the story: later events dim, and the Relationships graph can show what was true then. The DM adds
 * events and eras, and moves today. Clicking an event (the list, an expanded box) opens it in full.
 * See docs/concepts/events.md.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import type { Era, EventView, Timeline } from '../../api/types'
import ColorPicker from '../../components/ColorPicker'
import Modal from '../../components/Modal'
import ResourcePicker from '../../components/ResourcePicker'
import Segmented from '../../components/Segmented'
import VisibilityPicker from '../../components/VisibilityPicker'
import CharacterForm from '../CharacterForm'
import { useSaga } from '../SagaContext'
import DateInput from './DateInput'
import { formatDate } from './dates'
import EventList, { eventListRows, type ListOrder } from './EventList'
import EventModal from './EventModal'
import { useMoment } from './moment'
import { sagaKinds } from './relationships'
import TimelineView, { typeColor } from './timeline/TimelineView'

type ViewMode = 'timeline' | 'list'
const VIEW_KEY = 'sagacraft.eventsView'
const ORDER_KEY = 'sagacraft.eventsOrder'

/** Pure: the eras running at a date. */
export function erasAt(eras: Era[], date: number): Era[] {
  return eras.filter((e) => e.start <= date && (e.end === null || date <= e.end))
}

/** Pure: something from start to end (null: still going) touches the dates from..to (null: no limit). */
export const inRange = (start: number, end: number | null, from: number | null, to: number | null) =>
  (to === null || start <= to) && (from === null || end === null || end >= from)

/** Pure: events matching the filters (a period counts when any of it is in the dates). */
export function filterEvents(events: EventView[], f: {
  query: string; type: string | null; resourceId: number | null; creator: 'all' | 'dm' | 'players'; from?: number | null; to?: number | null
}, roleOf: (memberId: number | null) => string | undefined): EventView[] {
  const q = f.query.trim().toLowerCase()
  const from = f.from ?? null, to = f.to ?? null
  return events.filter((e) => (!q || (e.name || '').toLowerCase().includes(q))
    && (e.date === null || inRange(e.date, e.end ?? e.date, from, to))
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

export default function TimelinePage() {
  const { sagaId, saga, isAdmin, ruleset, refreshSaga } = useSaga()
  const navigate = useNavigate()
  const [data, setData] = useState<Timeline | null>(null)
  const [error, setError] = useState('')
  const [mode, setModeState] = useState<ViewMode>(() => (localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'timeline'))
  const setMode = (m: ViewMode) => { setModeState(m); localStorage.setItem(VIEW_KEY, m) }
  const [order, setOrderState] = useState<ListOrder>(() => (localStorage.getItem(ORDER_KEY) === 'newest' ? 'newest' : 'oldest'))
  const setOrder = (o: ListOrder) => { setOrderState(o); localStorage.setItem(ORDER_KEY, o) }
  const [query, setQuery] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [resource, setResource] = useState<{ id: number; name: string } | null>(null)
  const [creator, setCreator] = useState<'all' | 'dm' | 'players'>('all')
  const [from, setFrom] = useState<number | null>(null)
  const [to, setTo] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [era, setEra] = useState<Era | 'new' | null>(null)
  const [opened, setOpened] = useState<EventView | null>(null)
  const [editingToday, setEditingToday] = useState(false)
  const [moment, setMoment] = useMoment(sagaId)
  const cal = saga.calendar
  const types = ruleset.kinds.event?.types || {}
  const typeKeys = Object.keys(types)

  const load = useCallback(() => {
    api.timeline(sagaId).then(setData).catch((e: Error) => setError(e.message))
  }, [sagaId])
  useEffect(load, [load])

  const roleOf = (id: number | null) => saga.members.find((m) => m.id === id)?.role
  const events = useMemo(() => filterEvents(data?.events || [], { query, type, resourceId: resource?.id ?? null, creator, from, to }, roleOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, query, type, resource, creator, from, to, saga.members])
  const allEras = data?.eras || []
  const eras = useMemo(() => allEras.filter((e) => inRange(e.start, e.end, from, to)), [allEras, from, to])
  const today = saga.story_date
  const todayShown = inRange(today, today, from, to)
  const rows = useMemo(() => eventListRows(events, allEras, order), [events, allEras, order])
  // The moment slider steps through the dates there are (events, eras, today)
  const dates = useMemo(() => [...new Set([
    ...events.flatMap((e) => (e.date === null ? [] : [e.date])),
    ...eras.flatMap((e) => (e.end === null ? [e.start] : [e.start, e.end])),
    ...(todayShown ? [today] : []),
  ])].sort((a, b) => a - b), [events, eras, today, todayShown])
  const momentIndex = moment === null ? dates.length : Math.max(0, dates.findIndex((d) => d >= moment))
  const pickedEra = allEras.find((e) => from === e.start && to === e.end && e.end !== null) ?? allEras.find((e) => from === e.start && e.end === null && to === null)
  const pickEra = (e: Era) => {
    if (pickedEra?.id === e.id) { setFrom(null); setTo(null) } else { setFrom(e.start); setTo(e.end) }
  }
  const filtered = Boolean(query || type || resource || creator !== 'all' || from !== null || to !== null)

  if (!ruleset.kinds.event) return <div className="page-message">This Saga's template has no events.</div>

  return (
    <div className="page timeline-page">
      <header className="page-header">
        <h1>Events</h1>
        {isAdmin && (
          <div className="button-row">
            <button onClick={() => setEra('new')}>＋ Era</button>
            <button className="primary" onClick={() => setCreating(true)}>＋ Event</button>
          </div>
        )}
      </header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}

      <section className="events-filters">
        <div className="events-filters-row">
          <Segmented<ViewMode> value={mode} options={[['timeline', '⟷ Timeline'], ['list', '☰ List']]} onChange={setMode} />
          <input placeholder="Search events" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search events" />
          <button type="button" className={`chip ${resource ? 'on' : ''}`} onClick={() => (resource ? setResource(null) : setPicking(true))}>
            {resource ? `Involving ${resource.name} ✕` : 'Involving…'}
          </button>
          <Segmented value={creator} options={[['all', 'Anyone'], ['dm', 'The DM'], ['players', 'Players']]} onChange={setCreator} />
          {filtered && (
            <button className="small ghost" onClick={() => { setQuery(''); setType(null); setResource(null); setCreator('all'); setFrom(null); setTo(null) }}>Clear filters</button>
          )}
        </div>
        {typeKeys.length > 1 && (
          <div className="chips" role="group" aria-label="Event types">
            {typeKeys.map((key) => (
              <button key={key} type="button" className={`chip ${type === key ? 'on' : ''}`} onClick={() => setType(type === key ? null : key)}>
                <span className="type-swatch" style={{ background: typeColor(typeKeys, key) }} />{types[key].plural || types[key].name}
              </button>
            ))}
          </div>
        )}
        <div className="events-filters-row events-dates">
          <DateInput label="From" value={from} optional emptyLabel="The beginning" onChange={setFrom} />
          <DateInput label="To" value={to} optional emptyLabel="The end" onChange={(v) => setTo(v !== null && from !== null && v < from ? from : v)} />
          {allEras.length > 0 && (
            <div className="field">
              <span className="field-label">Eras</span>
              <div className="chips">
                {allEras.map((e) => (
                  <button key={e.id} className={`chip era-chip ${pickedEra?.id === e.id ? 'on' : ''}`} style={{ borderColor: e.color }} onClick={() => pickEra(e)}
                    title={`Show ${formatDate(cal, e.start)} – ${e.end === null ? 'now' : formatDate(cal, e.end)}${e.note ? ` · ${e.note}` : ''}`}>
                    <span className="era-swatch" style={{ background: e.color }} />{e.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="timeline-today">
        <span className="muted small">Today in the story</span>
        {editingToday && isAdmin ? (
          <DateInput value={today} onChange={(v) => v !== null && void api.setStoryDate(sagaId, v).then(refreshSaga).catch((e: Error) => setError(e.message))} />
        ) : <strong>{formatDate(cal, today)}</strong>}
        {isAdmin && <button className="small ghost" onClick={() => setEditingToday(!editingToday)}>{editingToday ? 'Done' : 'Change'}</button>}
        {dates.length > 1 && (
          <div className="moment-bar">
            <span className="muted small">Moment in the story</span>
            <input type="range" min={0} max={dates.length} value={momentIndex} aria-label="Moment in the story"
              onChange={(e) => { const i = Number(e.target.value); setMoment(i >= dates.length ? null : dates[i]) }} />
            <strong className="small">{moment === null ? 'Everything' : formatDate(cal, moment)}</strong>
            {moment !== null && <Link className="small" to={`/s/${sagaId}/lore/relationships`}>Relationships then →</Link>}
          </div>
        )}
      </div>

      {data && events.length === 0 && eras.length === 0 && (
        <p className="muted">{filtered ? 'No events match these filters.' : isAdmin ? 'No events yet. Add one, or give a relationship a start date: it lands here.' : 'No events shared with you yet.'}</p>
      )}

      {data && mode === 'timeline' && (events.length > 0 || eras.length > 0) && (
        <TimelineView calendar={cal} events={events} eras={eras} today={today} moment={moment} from={from} to={to} types={typeKeys}
          typeAttrs={(t) => types[t]?.attributes} onOpen={setOpened} onEra={isAdmin ? setEra : undefined} />
      )}

      {data && mode === 'list' && rows.length > 0 && (
        <>
          <div className="event-list-bar">
            <Segmented<ListOrder> value={order} options={[['oldest', 'Oldest first'], ['newest', 'Newest first']]} onChange={setOrder} />
            <span className="muted small">{rows.length} {rows.length === 1 ? 'event' : 'events'}</span>
          </div>
          <EventList calendar={cal} rows={rows} moment={moment} types={typeKeys} typeName={(t) => types[t]?.name}
            typeAttrs={(t) => types[t]?.attributes} onOpen={setOpened} />
        </>
      )}

      <EventModal event={opened} onClose={() => setOpened(null)} />
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
