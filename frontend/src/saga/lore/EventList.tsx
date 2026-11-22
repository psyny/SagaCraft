/**
 * Lore → Events as a **list**: plain and informative, one row per event (the timeline is the other view). Each row:
 * its date or span, its icon, name and type (the type's colour), the start of what happened, how many resources and
 * relationships it involves, and the eras it falls in. Oldest or newest first; events after the moment are dimmed.
 * Clicking a row opens the whole event. See docs/concepts/events.md ("The list").
 */
import type { Calendar, Era, EventView } from '../../api/types'
import ResourceIcon from '../../components/ResourceIcon'
import { formatEventDate } from './dates'
import { eventDescription } from './EventLines'
import { typeColor } from './timeline/TimelineView'

export type ListOrder = 'oldest' | 'newest'

export interface ListRow {
  event: EventView
  /** The eras it falls in (any of it). */
  eras: Era[]
  /** Resources involved (sub-events and the Involved variable) and relationships. */
  involved: number
  relationships: number
}

/** Pure: the list's rows, in date order (undated last). */
export function eventListRows(events: EventView[], eras: Era[], order: ListOrder): ListRow[] {
  const dated = events.filter((e) => e.date !== null)
  const rows = dated.map((e) => {
    const start = e.date!, end = e.end ?? start
    const ids = new Set<number>([
      ...e.sub_events.map((s) => s.resource.id).filter((id): id is number => typeof id === 'number'),
      ...(((e.attributes.involved as number[] | undefined) || []).filter((id) => typeof id === 'number')),
    ])
    return {
      event: e,
      eras: eras.filter((era) => era.start <= end && (era.end === null || era.end >= start)),
      involved: ids.size,
      relationships: e.relationships.length,
    }
  })
  rows.sort((a, b) => (a.event.date! - b.event.date!) || (a.event.name || '').localeCompare(b.event.name || '') || a.event.id - b.event.id)
  if (order === 'newest') rows.reverse()
  return [...rows, ...events.filter((e) => e.date === null).map((e) => ({ event: e, eras: [], involved: 0, relationships: e.relationships.length }))]
}

/** Pure: the first words of a description, without markup. */
export function excerpt(text: string, max = 140): string {
  const plain = text.replace(/<[^>]*>/g, ' ').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim()
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function EventList({ calendar, rows, moment, types, typeName, typeAttrs, onOpen }: {
  calendar: Calendar
  rows: ListRow[]
  moment: number | null
  types: string[]
  typeName: (type: string) => string | undefined
  typeAttrs: (type: string) => { key: string; type: string }[] | undefined
  onOpen: (event: EventView) => void
}) {
  return (
    <ul className="event-list">
      {rows.map(({ event: e, eras, involved, relationships }) => {
        const later = moment !== null && e.date !== null && e.date > moment
        const text = excerpt(eventDescription(e, typeAttrs(e.type)))
        const counts = [involved ? plural(involved, 'resource', 'resources') : '', relationships ? plural(relationships, 'relationship', 'relationships') : '']
          .filter(Boolean).join(' · ')
        return (
          <li key={e.id}>
            <button className={`event-row ${later ? 'later' : ''}`} onClick={() => onOpen(e)}>
              <span className="event-row-date">{formatEventDate(calendar, e.date, e.end)}</span>
              <span className="event-row-main">
                <span className="event-row-head">
                  <ResourceIcon resource={e} className="event-row-icon round" />
                  <strong>{e.name ?? '???'}</strong>
                  <span className="event-row-type"><span className="type-swatch" style={{ background: typeColor(types, e.type) }} />{typeName(e.type)}</span>
                </span>
                {text && <span className="event-row-text muted">{text}</span>}
                {(counts || eras.length > 0) && (
                  <span className="event-row-meta small">
                    {counts && <span className="muted">{counts}</span>}
                    {eras.map((era) => <span key={era.id} className="event-row-era" style={{ borderColor: era.color }}>{era.name}</span>)}
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
