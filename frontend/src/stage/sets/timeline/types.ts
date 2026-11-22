import type { Calendar, Era, EventView } from '../../../api/types'

export interface TimelineConfig {
  /** Whose knowledge it shows (member groups; none: the DM's, everything). */
  groups: number[]
  from: number | null
  to: number | null
  /** Event types shown (none: all). */
  types: string[]
  /** Events start expanded. */
  expanded: boolean
}

/** What the server renders for a Timeline Set (backend set_types/timeline.py). */
export interface TimelineContent {
  events: EventView[]
  eras: Era[]
  calendar: Calendar
  today: number
  from: number | null
  to: number | null
  expanded: boolean
  /** The event types in the template's order (colours), with their description variable. */
  types: { key: string; name: string; text: string | null }[]
  /** The DM's only. */
  config?: TimelineConfig
  groups?: { id: number; name: string; key: string | null }[]
}
