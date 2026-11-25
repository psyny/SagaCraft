/**
 * A location's page. The DM: the map with every tool (Details, Pictures, Grid, Fog, Links, Paths). Players: the
 * map as they may see it (their fog, the resources they may see on tiles they know: a click opens them), the
 * description and the places inside.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { Resource } from '../../api/types'
import FullscreenButton from '../../components/FullscreenButton'
import ResourceIcon from '../../components/ResourceIcon'
import ResourceView, { type ResourceTarget } from '../../components/ResourceView'
import MapEditor, { MapViewer } from '../../maps/MapEditor'
import CharacterForm from '../CharacterForm'
import { useSaga } from '../SagaContext'
import { parentOf } from './filter'
import { KIND, useLocationRules } from './LocationsPage'
import { RelationshipsButton } from '../lore/RelationshipsPanel'
import { FolderSelect } from '../lore/Folders'

function SubLocations({ list, onNew }: { list: Resource[]; onNew?: () => void }) {
  const { sagaId } = useSaga()
  return (
    <div className="field">
      <span className="field-label">Places inside <span className="muted">{list.length}</span></span>
      <div className="sub-locations">
        {list.map((r) => (
          <Link key={r.id} to={`/s/${sagaId}/locations/${r.id}`} className="sub-location"><ResourceIcon resource={r} />{r.name}</Link>
        ))}
        {onNew && <button type="button" className="small" onClick={onNew}>＋ New place inside</button>}
      </div>
    </div>
  )
}

export default function LocationPage() {
  const { sagaId, isAdmin } = useSaga()
  const { locationId } = useParams()
  const id = Number(locationId)
  const navigate = useNavigate()
  const { types, typeKey, parentKey } = useLocationRules()
  const [resource, setResource] = useState<Resource | null>(null)
  const [all, setAll] = useState<Resource[]>([])
  const [view, setView] = useState<ResourceTarget | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api.resource(sagaId, id).then(setResource).catch((e: Error) => setError(e.message))
    api.resources(sagaId, KIND).then(setAll).catch(() => undefined)
  }, [sagaId, id])
  useEffect(load, [load])

  if (!resource) return <div className="page-message">{error || 'Loading…'}</div>
  const inside = all.filter((r) => parentOf(r, parentKey) === id)
  const parent = all.find((r) => r.id === parentOf(resource, parentKey))

  const newInside = async () => {
    if (!typeKey || !parentKey) return
    const made = await api.createResource(sagaId, {
      kind: KIND, type: typeKey, attributes: { name: `New place in ${resource.name}`, [parentKey]: id }, visibility: resource.visibility,
    })
    navigate(`/s/${sagaId}/locations/${made.id}`)
  }

  const header = (
    <header className="location-header">
      <Link to={parent ? `/s/${sagaId}/locations/${parent.id}` : `/s/${sagaId}/locations`} className="muted small">
        ← {parent ? parent.name : 'Locations'}
      </Link>
      <h1><ResourceIcon resource={resource} className="title-icon round" /> {resource.name}</h1>
      <span className="spacer" />
      <RelationshipsButton subject={{ id: resource.id, name: resource.name, kind: 'location' }} />
      <FolderSelect kind="location" resource={resource} onFiled={(r) => { setResource(r); load() }} onError={setError} />
      <FullscreenButton />
    </header>
  )

  if (isAdmin) {
    return (
      <div className="page page-full location-page">
        {header}
        <MapEditor
          key={id}
          sagaId={sagaId}
          locationId={id}
          tabs={['details', 'grid', 'fog', 'background', 'layers']}
          favorites={inside.map((r) => r.id)}
          onOpenLink={(l) => setView({ id: l.resource_id, kind: l.kind })}
          details={
            <div className="tool-panel">
              <CharacterForm key={resource.id} resource={resource} kind={KIND} onDone={(saved) => {
                if (!saved) navigate(`/s/${sagaId}/locations`)
                else load()
              }} />
              <SubLocations list={inside} onNew={() => void newInside()} />
            </div>
          }
        />
        <ResourceView target={view} onClose={() => setView(null)} />
      </div>
    )
  }

  // The ruleset's long text (a description), whatever its key
  const textKey = types[resource.type]?.attributes.find((a) => a.type === 'rich_text')?.key
  const description = textKey ? (resource.attributes[textKey] as string | undefined) : undefined
  return (
    <div className="page page-full location-page">
      {header}
      <div className="location-read">
        <div className="location-read-map"><MapViewer sagaId={sagaId} locationId={id} onLinkClick={(l) => setView({ id: l.resource_id, kind: l.kind })} /></div>
        <aside className="location-read-side">
          {resource.tags && resource.tags.length > 0 && <div className="chips">{resource.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>}
          {description && <p className="sheet-text">{description}</p>}
          {inside.length > 0 && <SubLocations list={inside} />}
        </aside>
      </div>
      <ResourceView target={view} onClose={() => setView(null)} />
    </div>
  )
}
