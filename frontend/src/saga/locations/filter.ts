/** Locations list: search by name, top level only, tags (all picked tags must be there). Pure. */
import type { Resource } from '../../api/types'

export interface LocationFilter {
  query: string
  topOnly: boolean
  tags: string[]
}

/** The key of the "part of" attribute (the ruleset's parent attribute). */
export const parentOf = (resource: Resource, parentKey: string | null): number | null =>
  parentKey ? ((resource.attributes[parentKey] as number | null | undefined) ?? null) : null

export function filterLocations(list: Resource[], filter: LocationFilter, parentKey: string | null): Resource[] {
  const q = filter.query.trim().toLowerCase()
  const wanted = filter.tags.map((t) => t.toLowerCase())
  return list.filter((r) => {
    if (q && !(r.name || '').toLowerCase().includes(q)) return false
    if (filter.topOnly && parentOf(r, parentKey) !== null) return false
    const tags = (r.tags || []).map((t) => t.toLowerCase())
    return wanted.every((t) => tags.includes(t))
  })
}

/** Ids of a location's sub-locations, all levels down. */
export function descendants(list: Resource[], id: number, parentKey: string | null): number[] {
  const out: number[] = []
  const walk = (parent: number) => {
    for (const r of list) {
      if (parentOf(r, parentKey) === parent && !out.includes(r.id)) {
        out.push(r.id)
        walk(r.id)
      }
    }
  }
  walk(id)
  return out
}
