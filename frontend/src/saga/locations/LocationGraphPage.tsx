/**
 * Locations → Location map: how the places connect, for finding the way around the world. Each place is a node;
 * a line is a link on a place's map to another place (an arrow when only one map links, plain when both do);
 * a dashed line runs from a place to the one it's part of. Places that are part of the same place share a colour
 * and sit in a soft region of it (regions nest: a town's inside the region's). Click a place to open it.
 * Built per member on the server (what they see on each map). See docs/concepts/locations.md ("Location map").
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import type { GraphData } from '../../api/types'
import RelationshipGraph from '../lore/graph/RelationshipGraph'
import { useSaga } from '../SagaContext'

export default function LocationGraphPage() {
  const { sagaId } = useSaga()
  const navigate = useNavigate()
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api.locationGraph(sagaId).then(setGraph).catch((e: Error) => setError(e.message)) }, [sagaId])
  const links = graph?.edges.filter((e) => !e.reference).length ?? 0
  return (
    <div className="page page-full location-graph-page">
      <header className="location-header">
        <h1>Location map</h1>
        <span className="muted small">
          {graph ? `${graph.nodes.length} places · ${links} ${links === 1 ? 'link' : 'links'}` : ''}
        </span>
        <span className="spacer" />
        <Link className="small" to={`/s/${sagaId}/locations`}>← All places</Link>
      </header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <div className="location-graph">
        {graph && (
          <RelationshipGraph data={graph} clusters labels={false}
            onSelect={(sel) => {
              const node = sel && 'node' in sel ? graph.nodes.find((n) => n.id === sel.node) : null
              if (node?.resource_id) navigate(`/s/${sagaId}/locations/${node.resource_id}`)
            }} />
        )}
      </div>
      <p className="location-graph-legend muted small">
        <span><span className="legend-line" /> a link on a map (→ only that map links)</span>
        <span><span className="legend-line dashed" /> part of</span>
        <span><span className="legend-region" /> places in the same place: one colour, one region</span>
        <span>Click a place to open it.</span>
      </p>
    </div>
  )
}
