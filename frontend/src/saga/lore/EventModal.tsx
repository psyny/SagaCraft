/**
 * An event in full, over the timeline: its dates, type, what happened (description), who and what was involved,
 * its sub-events and relationships; a link to its page (where the DM edits it and adds to it).
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import type { EventView, Resource } from '../../api/types'
import Modal from '../../components/Modal'
import ResourceIcon from '../../components/ResourceIcon'
import { useSaga } from '../SagaContext'
import { formatEventDate } from './dates'
import EventLines, { eventDescription } from './EventLines'
import { resourcePath } from './relationships'

export default function EventModal({ event, onClose }: { event: EventView | null; onClose: () => void }) {
  const { sagaId, saga, ruleset } = useSaga()
  const [full, setFull] = useState<EventView | null>(null)
  const [involved, setInvolved] = useState<Resource[]>([])
  const id = event?.id ?? null
  useEffect(() => {
    setFull(null)
    setInvolved([])
    if (id === null) return
    let live = true
    api.event(sagaId, id).then((e) => {
      if (!live) return
      setFull(e)
      const ids = (e.attributes.involved as number[] | undefined) || []
      Promise.all(ids.map((rid) => api.resource(sagaId, rid).catch(() => null)))
        .then((list) => live && setInvolved(list.filter((r): r is Resource => r !== null)))
    }).catch(() => undefined)
    return () => { live = false }
  }, [sagaId, id])
  const shown = full ?? event
  const type = shown ? ruleset.kinds.event?.types[shown.type] : undefined
  const description = shown ? eventDescription(shown, type?.attributes) : ''
  return (
    <Modal open={event !== null} title={shown?.name ?? '???'} onClose={onClose} className="event-modal">
      {shown && (
        <div className="event-body">
          <div className="event-modal-head">
            <ResourceIcon resource={shown} className="title-icon round" />
            <div>
              <p className="event-date">{formatEventDate(saga.calendar, shown.date, shown.end)}</p>
              <span className="muted small">{type?.name}</span>
            </div>
          </div>
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
          <EventLines event={shown} />
          <div className="button-row">
            <Link className="button-link" to={`/s/${sagaId}/lore/events/${shown.id}`}>Open the event's page →</Link>
          </div>
        </div>
      )}
    </Modal>
  )
}
