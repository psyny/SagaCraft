/**
 * An event's page: its date, what happened, who and what was involved, and its sub-events: what happened to
 * resources ("Old Bridge — discovered": the DM's, suggested from the resource type's list) and the relationships
 * that started there ("Aldric killed Bram": anyone who writes relationships adds them here, in their group). The
 * DM edits the event's details (title, date, type, who sees it). See docs/concepts/events.md.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { EventView, Resource } from '../../api/types'
import ResourceIcon from '../../components/ResourceIcon'
import ResourcePicker from '../../components/ResourcePicker'
import CharacterForm from '../CharacterForm'
import { useSaga } from '../SagaContext'
import { formatDate } from './dates'
import RelationshipForm from './RelationshipForm'
import { CreatorMark, RelationshipsButton } from './RelationshipsPanel'
import { groupLabel, resourcePath, sagaKinds, writableGroups } from './relationships'

function AddSubEvent({ event, onDone }: { event: EventView; onDone: (view: EventView | null) => void }) {
  const { sagaId, ruleset } = useSaga()
  const [resource, setResource] = useState<Resource | null>(null)
  const [what, setWhat] = useState('')
  const [picking, setPicking] = useState(true)
  const [error, setError] = useState('')
  const suggestions = resource ? ruleset.kinds[resource.kind]?.types[resource.type]?.sub_events || [] : []
  const add = async (text: string) => {
    if (!resource || !text.trim()) return
    try {
      onDone(await api.addSubEvent(sagaId, event.id, { resource_id: resource.id, what: text.trim() }))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="sub-event-add">
      {error && <div className="error">{error}</div>}
      <button className="rel-end set" onClick={() => setPicking(true)}>{resource ? resource.name : 'Pick who or what…'}</button>
      {resource && (
        <>
          <div className="chips">
            {suggestions.map((s) => <button key={s} className="chip" onClick={() => void add(s)}>{s}</button>)}
          </div>
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void add(what) }}>
            <input autoFocus placeholder="or say what happened" value={what} maxLength={40} onChange={(e) => setWhat(e.target.value)} aria-label="What happened" />
            <button className="small" disabled={!what.trim()}>Add</button>
          </form>
        </>
      )}
      <button className="small ghost" onClick={() => onDone(null)}>Cancel</button>
      <ResourcePicker open={picking} title="Who or what" kinds={sagaKinds(ruleset)} multiple={false} exclude={[event.id]}
        onPick={(_, [r]) => r && setResource(r)} onClose={() => setPicking(false)} />
    </div>
  )
}

export default function EventPage() {
  const { sagaId, saga, isAdmin, ruleset } = useSaga()
  const { eventId } = useParams()
  const id = Number(eventId)
  const navigate = useNavigate()
  const [event, setEvent] = useState<EventView | null>(null)
  const [tab, setTab] = useState<'event' | 'details'>('event')
  const [adding, setAdding] = useState<'resource' | 'relationship' | null>(null)
  const [error, setError] = useState('')
  const [involved, setInvolved] = useState<Resource[]>([])

  const load = useCallback(() => {
    api.event(sagaId, id).then(setEvent).catch((e: Error) => setError(e.message))
  }, [sagaId, id])
  useEffect(load, [load])
  const involvedIds = (event?.attributes.involved as number[] | undefined) || []
  useEffect(() => {
    if (!involvedIds.length) return setInvolved([])
    Promise.all(involvedIds.map((rid) => api.resource(sagaId, rid).catch(() => null)))
      .then((list) => setInvolved(list.filter((r): r is Resource => r !== null)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sagaId, involvedIds.join(',')])

  if (!event) return <div className="page-message">{error || 'Loading…'}</div>
  const type = ruleset.kinds.event?.types[event.type]
  const description = Object.entries(event.attributes).find(([k]) => type?.attributes.find((a) => a.key === k)?.type === 'rich_text')?.[1] as string | undefined
  const canRelate = writableGroups(saga).length > 0
  const run = (action: () => Promise<EventView>) => void action().then(setEvent).catch((e: Error) => setError(e.message))

  return (
    <div className="page event-page">
      <header className="location-header">
        <Link to={`/s/${sagaId}/lore/events`} className="muted small">← Timeline</Link>
        <h1><ResourceIcon resource={event} className="title-icon round" /> {event.name ?? '???'}</h1>
        <span className="muted">{type?.name}</span>
        <span className="spacer" />
        <RelationshipsButton subject={{ id: event.id, name: event.name ?? '???', kind: 'event' }} />
        {isAdmin && (
          <div className="tool-tabs section-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'event'} className={`tool-tab ${tab === 'event' ? 'on' : ''}`} onClick={() => setTab('event')}>Event</button>
            <button role="tab" aria-selected={tab === 'details'} className={`tool-tab ${tab === 'details' ? 'on' : ''}`} onClick={() => setTab('details')}>Details</button>
          </div>
        )}
      </header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      {tab === 'details' && isAdmin ? (
        <div className="doc-details">
          <CharacterForm key={event.updated_at ?? event.id} resource={event} kind="event" onDone={(saved) => {
            if (!saved) navigate(`/s/${sagaId}/lore/events`)
            else { load(); setTab('event') }
          }} />
        </div>
      ) : (
        <div className="event-body">
          <p className="event-date">{formatDate(saga.calendar, event.date)}</p>
          {description && <div className="event-description">{description}</div>}
          {involved.length > 0 && (
            <div className="field">
              <span className="field-label">Involved</span>
              <div className="chips">
                {involved.map((r) => {
                  const path = resourcePath(sagaId, r.kind, r.id)
                  return path ? <Link key={r.id} className="chip" to={path}><ResourceIcon resource={r} /> {r.name}</Link> : <span key={r.id} className="chip">{r.name}</span>
                })}
              </div>
            </div>
          )}
          <section className="page-section">
            <div className="section-head">
              <h2>What happened</h2>
              <div className="button-row">
                {isAdmin && <button className="small" onClick={() => setAdding('resource')}>＋ To someone or something</button>}
                {canRelate && <button className="small" onClick={() => setAdding('relationship')}>＋ Relationship</button>}
              </div>
            </div>
            {event.sub_events.length === 0 && event.relationships.length === 0 && !adding && (
              <p className="muted small">Nothing yet. {isAdmin ? 'Say what happened to whom: "Old Bridge — discovered", "Aldric killed Bram".' : ''}</p>
            )}
            <ul className="sub-events">
              {event.sub_events.map((s, i) => {
                const path = resourcePath(sagaId, s.resource.kind, s.resource.id)
                return (
                  <li key={`s${s.id}`} className="sub-event">
                    {path ? <Link to={path}>{s.resource.name}</Link> : <span>{s.resource.name ?? '???'}</span>}
                    <span className="muted">—</span>
                    {isAdmin ? (
                      <input className="sub-event-what" key={`${s.id}-${s.what}`} defaultValue={s.what} aria-label="What happened" maxLength={40}
                        onBlur={(e) => e.target.value.trim() && e.target.value !== s.what && run(() => api.updateSubEvent(sagaId, s.id, { what: e.target.value }))} />
                    ) : <span>{s.what}</span>}
                    <span className="spacer" />
                    {isAdmin && (
                      <>
                        <button className="small ghost" disabled={i === 0} onClick={() => run(() => api.updateSubEvent(sagaId, s.id, { move: -1 }))} aria-label="Earlier">↑</button>
                        <button className="small ghost" disabled={i === event.sub_events.length - 1} onClick={() => run(() => api.updateSubEvent(sagaId, s.id, { move: 1 }))} aria-label="Later">↓</button>
                        <button className="small ghost danger" onClick={() => run(() => api.deleteSubEvent(sagaId, s.id))} aria-label="Remove">✕</button>
                      </>
                    )}
                  </li>
                )
              })}
              {event.relationships.map((r) => (
                <li key={`r${r.id}`} className="sub-event">
                  <span>{r.from.name ?? '???'}</span> <span className="rel-verb">{r.type.label}</span> <span>{r.to.name ?? '???'}</span>
                  {r.note && <span className="muted small">“{r.note}”</span>}
                  <span className="spacer" />
                  {(isAdmin || saga.groups.length > 1) && <span className="chip small" title="Who knows it">{groupLabel(saga, r.group_id, r.group_name)}</span>}
                  <CreatorMark rel={r} />
                  {r.editable && <button className="small ghost danger" aria-label="Remove" onClick={() => window.confirm('Delete this relationship?')
                    && void api.deleteRelationship(sagaId, r.id).then(load)}>✕</button>}
                </li>
              ))}
            </ul>
            {adding === 'resource' && <AddSubEvent event={event} onDone={(view) => { setAdding(null); if (view) setEvent(view) }} />}
            {adding === 'relationship' && (
              <RelationshipForm event={{ id: event.id, date: event.date, name: event.name ?? 'this event' }}
                onDone={(made) => { setAdding(null); if (made) load() }} />
            )}
          </section>
        </div>
      )}
    </div>
  )
}
