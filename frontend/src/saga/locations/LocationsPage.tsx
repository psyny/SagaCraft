/**
 * The Locations tab: every location this member may see (maps: worlds, regions, towns, battlegrounds). Search by
 * name, "Top level only" (not part of another location) and the DM's tags. The DM also has the fog presets here
 * (how map Sets draw the fog). See docs/concepts/locations.md.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import type { Resource } from '../../api/types'
import ResourceIcon from '../../components/ResourceIcon'
import { useSaga } from '../SagaContext'
import { filterLocations, parentOf } from './filter'
import FogPresets from './FogPresets'

export const KIND = 'location'

/** The ruleset's location type and its parent attribute (nothing hard-coded). */
export function useLocationRules() {
  const { ruleset } = useSaga()
  const types = ruleset.kinds[KIND]?.types || {}
  const typeKey = Object.keys(types)[0] ?? null
  const parentKey = typeKey ? types[typeKey].attributes.find((a) => a.parent)?.key ?? null : null
  return { types, typeKey, parentKey }
}

export default function LocationsPage() {
  const { sagaId, isAdmin } = useSaga()
  const navigate = useNavigate()
  const { typeKey, parentKey } = useLocationRules()
  const [list, setList] = useState<Resource[] | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [topOnly, setTopOnly] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState('')
  const [params, setParams] = useSearchParams()
  const section = isAdmin && params.get('section') === 'fog' ? 'fog' : 'places'
  const sections = isAdmin && (
    <div className="tool-tabs section-tabs" role="tablist">
      {([['places', 'Places'], ['fog', 'Fog presets']] as const).map(([key, label]) => (
        <button key={key} role="tab" aria-selected={section === key} className={`tool-tab ${section === key ? 'on' : ''}`}
          onClick={() => setParams(key === 'fog' ? { section: 'fog' } : {})}>{label}</button>
      ))}
    </div>
  )

  useEffect(() => {
    api.resources(sagaId, KIND).then(setList).catch((e: Error) => setError(e.message))
    api.tags(sagaId, KIND).then(setTags).catch(() => undefined)
  }, [sagaId])

  const shown = useMemo(() => filterLocations(list || [], { query, topOnly, tags: picked }, parentKey), [list, query, topOnly, picked, parentKey])
  const byId = new Map((list || []).map((r) => [r.id, r]))
  const children = (id: number) => (list || []).filter((r) => parentOf(r, parentKey) === id).length

  const create = async () => {
    if (!typeKey) return
    try {
      const made = await api.createResource(sagaId, { kind: KIND, type: typeKey, attributes: { name: 'New location' } })
      navigate(`/s/${sagaId}/locations/${made.id}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (section === 'fog') {
    return (
      <div className="page page-full fog-presets-page">
        <header className="location-header"><h1>Locations</h1>{sections}</header>
        <FogPresets />
      </div>
    )
  }
  if (!typeKey) return <div className="page-message">This Saga's ruleset has no locations.</div>
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Locations</h1>
          <p className="muted small">Worlds, regions, towns, dungeons, battlegrounds: each with its map.</p>
        </div>
        {isAdmin && <button className="primary" onClick={() => void create()}>＋ New location</button>}
      </header>
      {sections}
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <div className="list-filters">
        <input placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search locations" />
        <label className="check"><input type="checkbox" checked={topOnly} onChange={(e) => setTopOnly(e.target.checked)} /> Top level only</label>
        {tags.length > 0 && (
          <div className="chips">
            {tags.map((t) => {
              const on = picked.includes(t)
              return <button key={t} type="button" className={`chip ${on ? 'on' : ''}`} onClick={() => setPicked(on ? picked.filter((x) => x !== t) : [...picked, t])}>{t}</button>
            })}
          </div>
        )}
      </div>
      {list && list.length === 0 && <p className="muted">{isAdmin ? 'No locations yet: make the world, then the places in it.' : 'No locations shared with you yet.'}</p>}
      {list && list.length > 0 && shown.length === 0 && <p className="muted">No location matches.</p>}
      <div className="location-grid">
        {shown.map((r) => {
          const parent = byId.get(parentOf(r, parentKey) ?? -1)
          const inside = children(r.id)
          return (
            <button key={r.id} className="location-card" onClick={() => navigate(`/s/${sagaId}/locations/${r.id}`)}>
              <ResourceIcon resource={r} className="location-icon round" />
              <span className="location-card-body">
                <strong>{r.name}</strong>
                <span className="muted small">
                  {parent ? `in ${parent.name}` : 'Top level'}{inside ? ` · ${inside} ${inside === 1 ? 'place' : 'places'} inside` : ''}
                </span>
                {r.tags && r.tags.length > 0 && <span className="chips small">{r.tags.map((t) => <span key={t} className="chip">{t}</span>)}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
