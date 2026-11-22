/**
 * Timeline Set: the Saga's timeline on a Stage (the knowledge the DM picked, the dates and types asked for). Players
 * pan and zoom it; clicking an event shows or hides its box (there's no page to open on a Stage). See
 * set_types/timeline.py and saga/lore/timeline/TimelineView.tsx.
 */
import TimelineView from '../../../saga/lore/timeline/TimelineView'
import type { SetViewProps } from '../../types'
import type { TimelineContent } from './types'

export default function TimelineSetView({ set }: SetViewProps) {
  const content = set.content as TimelineContent
  const types = (content.types || []).map((t) => t.key)
  const textOf = (type: string) => {
    const key = content.types?.find((t) => t.key === type)?.text
    return key ? [{ key, type: 'rich_text' }] : undefined
  }
  if (!content.events.length && !content.eras.length) {
    return <div className="timeline-set empty"><p className="muted">No events to show yet.</p></div>
  }
  return (
    <div className="timeline-set" data-wheel>
      <TimelineView calendar={content.calendar} events={content.events} eras={content.eras} today={content.today} moment={null}
        from={content.from} to={content.to} types={types} typeAttrs={textOf} startExpanded={content.expanded} />
    </div>
  )
}
