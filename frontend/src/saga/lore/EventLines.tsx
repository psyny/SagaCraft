/** What happened in an event, one line each: resource sub-events ("Old Bridge — discovered") and relationships. */
import { Link } from 'react-router-dom'
import type { EventView } from '../../api/types'
import { useSaga } from '../SagaContext'
import { readFrom, resourcePath } from './relationships'

export default function EventLines({ event }: { event: EventView }) {
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

/** The event's description: its type's first rich text variable. */
export function eventDescription(event: EventView, typeAttrs: { key: string; type: string }[] | undefined): string {
  const key = typeAttrs?.find((a) => a.type === 'rich_text')?.key
  const value = key ? event.attributes[key] : undefined
  return typeof value === 'string' ? value : ''
}
