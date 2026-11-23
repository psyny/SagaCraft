/**
 * Relationship graph Set: the graph the DM chose (whose knowledge, which query), drawn the same for everyone. In
 * Build the DM drags nodes into place (saved for every screen); players can pan and zoom. See
 * set_types/relationship_graph.py.
 */
import { useState } from 'react'
import { api } from '../../../api'
import Modal from '../../../components/Modal'
import { formatDate } from '../../../saga/lore/dates'
import RelationshipGraph, { type Selection } from '../../../saga/lore/graph/RelationshipGraph'
import { useCalendar } from '../../../saga/SagaContext'
import Toolbar from '../../Toolbar'
import type { SetViewProps } from '../../types'
import RelationshipGraphInspector from './RelationshipGraphInspector'
import type { RelationshipGraphContent } from './types'

export default function RelationshipGraphView({ set, mode, editor }: SetViewProps) {
  const calendar = useCalendar()
  const content = set.content as RelationshipGraphContent
  const [selected, setSelected] = useState<Selection>(null)
  // The DM, in Play: what the graph shows, picked in a window (the Stage stays)
  const [choosing, setChoosing] = useState(false)
  return (
    <div className="rel-graph-set">
      {editor && mode === 'play' && (
        <Toolbar id="main">
          <button className="small" onClick={() => setChoosing(true)}>◎ What it shows…</button>
        </Toolbar>
      )}
      {editor && choosing && (
        <Modal open wide title={`${set.name}: what it shows`} onClose={() => setChoosing(false)}>
          <RelationshipGraphInspector set={set} editor={editor} selectedActorId={null} onSelectActor={() => undefined} />
        </Modal>
      )}
      <RelationshipGraph data={content.graph} placed={content.positions} labels={content.labels} selected={selected} onSelect={setSelected}
        onPlace={mode === 'build' && editor ? (id, point) => void editor.run(() => api.setCommand(editor.sagaId, set.id, 'nodes.place', { positions: { [id]: point } })) : undefined} />
      {content.at !== null && calendar && <span className="rel-graph-at">As of {formatDate(calendar, content.at)}</span>}
    </div>
  )
}
