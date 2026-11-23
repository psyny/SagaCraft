/**
 * Timeline Set: the Saga's timeline on a Stage (the knowledge the DM picked, the dates and types asked for). Players
 * pan and zoom it; clicking an event shows or hides its box (there's no page to open on a Stage). See
 * set_types/timeline.py and saga/lore/timeline/TimelineView.tsx.
 */
import { useState } from 'react'
import Modal from '../../../components/Modal'
import TimelineView from '../../../saga/lore/timeline/TimelineView'
import Toolbar from '../../Toolbar'
import type { SetViewProps } from '../../types'
import TimelineInspector from './TimelineInspector'
import type { TimelineContent } from './types'

export default function TimelineSetView({ set, mode, editor }: SetViewProps) {
  const content = set.content as TimelineContent
  // The DM, in Play: what the timeline shows, picked in a window (the Stage stays)
  const [choosing, setChoosing] = useState(false)
  const choose = editor && mode === 'play' && (
    <>
      <Toolbar id="main"><button className="small" onClick={() => setChoosing(true)}>◎ What it shows…</button></Toolbar>
      {choosing && (
        <Modal open wide title={`${set.name}: what it shows`} onClose={() => setChoosing(false)}>
          <TimelineInspector set={set} editor={editor} selectedActorId={null} onSelectActor={() => undefined} />
        </Modal>
      )}
    </>
  )
  const types = (content.types || []).map((t) => t.key)
  const textOf = (type: string) => {
    const key = content.types?.find((t) => t.key === type)?.text
    return key ? [{ key, type: 'rich_text' }] : undefined
  }
  if (!content.events.length && !content.eras.length) {
    return <div className="timeline-set empty">{choose}<p className="muted">No events to show yet.</p></div>
  }
  return (
    <div className="timeline-set" data-wheel>
      {choose}
      <TimelineView calendar={content.calendar} events={content.events} eras={content.eras} today={content.today} moment={null}
        from={content.from} to={content.to} types={types} typeAttrs={textOf} startExpanded={content.expanded} />
    </div>
  )
}
