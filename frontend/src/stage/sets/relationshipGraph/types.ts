import type { GraphData } from '../../../api/types'
import type { Point } from '../../../saga/lore/graph/layout'

export interface RelationshipGraphConfig {
  groups: number[]
  mode: 'all' | 'characters' | 'around' | 'set'
  ids: number[]
  hops: number
  kinds: string[]
  references: boolean
  at: number | null
  labels: boolean
  positions: Record<string, Point>
}

/** What the server renders for a relationship graph Set (backend set_types/relationship_graph.py). */
export interface RelationshipGraphContent {
  graph: GraphData
  labels: boolean
  positions: Record<string, Point>
  at: number | null
  /** The DM's only. */
  config?: RelationshipGraphConfig
  groups?: { id: number; name: string; key: string | null }[]
}
