/** Relationship helpers shared by the Lore tab, resource pages and the graph Set. See docs/concepts/relationships.md. */
import type { Group, Relationship, RelationshipType, Ruleset, SagaOverview } from '../../api/types'

export const LORE_KINDS = ['character', 'location', 'item', 'document', 'event'] as const

/** The resource kinds this Saga's template has. */
export function sagaKinds(ruleset: Ruleset): string[] {
  return LORE_KINDS.filter((k) => ruleset.kinds[k])
}

export const KIND_NAMES: Record<string, string> = {
  character: 'Character', location: 'Location', item: 'Item', document: 'Document', event: 'Event',
}

/** Where a resource's page is (characters have no page of their own: the graph around them). */
export function resourcePath(sagaId: number, kind: string | null, id: number | null): string | null {
  if (!kind || !id) return null
  const base = `/s/${sagaId}`
  switch (kind) {
    case 'location': return `${base}/locations/${id}`
    case 'item': return `${base}/items/${id}`
    case 'document': return `${base}/lore/documents/${id}`
    case 'event': return `${base}/lore/events/${id}`
    case 'character': return `${base}/lore/relationships?around=${id}`
    default: return null
  }
}

/** How a relationship reads from one of its resources: "killed → Bram", or "killed by ← Aldric". */
export function readFrom(rel: Relationship, resourceId: number): { verb: string; other: Relationship['from']; forward: boolean } {
  const forward = rel.from.id === resourceId
  const verb = forward || !rel.type.directed ? rel.type.label : rel.type.inverse || `${rel.type.label} (by)`
  return { verb, other: forward ? rel.to : rel.from, forward }
}

/** The member groups this member may add relationships to (the DM: all; players: their own; viewers: none). */
export function writableGroups(saga: SagaOverview): Group[] {
  if (saga.me.role === 'admin') return saga.groups
  if (saga.me.role !== 'player') return []
  return saga.groups.filter((g) => saga.me.group_ids.includes(g.id))
}

/** The member groups whose relationships this member reads. */
export function readableGroups(saga: SagaOverview): Group[] {
  return saga.me.role === 'admin' ? saga.groups : saga.groups.filter((g) => saga.me.group_ids.includes(g.id))
}

const recentKey = (sagaId: number) => `sagacraft.relTypes.${sagaId}`
const groupKey = (sagaId: number) => `sagacraft.relGroup.${sagaId}`

export function recentTypes(sagaId: number): string[] {
  try {
    return JSON.parse(localStorage.getItem(recentKey(sagaId)) || '[]') as string[]
  } catch {
    return []
  }
}

export function rememberType(sagaId: number, ref: string) {
  localStorage.setItem(recentKey(sagaId), JSON.stringify([ref, ...recentTypes(sagaId).filter((r) => r !== ref)].slice(0, 12)))
}

/** The group a new relationship goes in: the last one used, else the DM's truth (admins) or the players'. */
export function defaultGroup(sagaId: number, saga: SagaOverview): number | null {
  const groups = writableGroups(saga)
  const last = Number(localStorage.getItem(groupKey(sagaId)))
  if (groups.some((g) => g.id === last)) return last
  const preferred = saga.me.role === 'admin' ? groups.find((g) => g.key === 'admins') : groups.find((g) => g.key === 'players')
  return (preferred ?? groups[0])?.id ?? null
}

export function rememberGroup(sagaId: number, groupId: number) {
  localStorage.setItem(groupKey(sagaId), String(groupId))
}

/**
 * Type suggestions for what's typed: recent first, then those usually linking these kinds, then the rest; only
 * predefined ones and the group's own.
 */
export function suggestTypes(types: RelationshipType[], query: string, groupId: number | null, recent: string[],
  fromKind?: string | null, toKind?: string | null): RelationshipType[] {
  const q = query.trim().toLowerCase()
  const usable = types.filter((t) => t.predefined || t.group_id === groupId)
  const match = usable.filter((t) => !q || t.label.toLowerCase().includes(q) || t.inverse.toLowerCase().includes(q))
  const score = (t: RelationshipType) => {
    const r = recent.indexOf(t.ref)
    if (r >= 0) return r
    const fits = (!fromKind || !t.from_kinds.length || t.from_kinds.includes(fromKind))
      && (!toKind || !t.to_kinds.length || t.to_kinds.includes(toKind))
    const starts = q && t.label.toLowerCase().startsWith(q) ? 0 : 1
    return 100 + (fits ? 0 : 50) + starts * 10
  }
  return [...match].sort((a, b) => score(a) - score(b) || a.label.localeCompare(b.label))
}

/** A member group as "who knows it": the DM's own reads "The DM". */
export function groupLabel(saga: SagaOverview, groupId: number, fallback?: string | null): string {
  const group = saga.groups.find((g) => g.id === groupId)
  return group?.key === 'admins' ? 'The DM' : group?.name ?? fallback ?? 'A group'
}
