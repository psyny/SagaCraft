/**
 * An item's page: its sheet (the item display template's informative mode: what this member may see) and, for
 * the DM, its form (its category's variables, pictures, tags, who sees it).
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { Resource, Sheet } from '../../api/types'
import ResourceIcon from '../../components/ResourceIcon'
import CharacterForm from '../CharacterForm'
import { useSaga } from '../SagaContext'
import { SheetView } from '../sheet/CharacterSheet'

export default function ItemPage() {
  const { sagaId, isAdmin, ruleset } = useSaga()
  const { itemId } = useParams()
  const id = Number(itemId)
  const navigate = useNavigate()
  const [resource, setResource] = useState<Resource | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api.resource(sagaId, id).then(setResource).catch((e: Error) => setError(e.message))
    api.sheet(sagaId, id).then(setSheet).catch(() => setSheet(null))
  }, [sagaId, id])
  useEffect(load, [load])

  if (!resource) return <div className="page-message">{error || 'Loading…'}</div>
  const category = ruleset.kinds.item?.types[resource.type]
  return (
    <div className="page item-page">
      <header className="location-header">
        <Link to={`/s/${sagaId}/items`} className="muted small">← Items</Link>
        <h1><ResourceIcon resource={resource} className="title-icon round" /> {resource.name}</h1>
        <span className="muted">{category?.name}</span>
      </header>
      <div className={isAdmin ? 'item-columns' : ''}>
        <section className="item-sheet">
          {sheet ? <div className="sheet-preview mode-informative"><SheetView sheet={sheet} mode="informative" open /></div>
            : <p className="muted">Loading…</p>}
          {isAdmin && <p className="muted small">What you see here is the item's display template (Saga → Display templates → <Link to={`/s/${sagaId}/saga/displays?kind=item`}>item templates</Link>).</p>}
        </section>
        {isAdmin && (
          <section className="item-form">
            <CharacterForm key={resource.updated_at ?? resource.id} resource={resource} kind="item" onDone={(saved) => {
              if (!saved) navigate(`/s/${sagaId}/items`)
              else load()
            }} />
          </section>
        )}
      </div>
    </div>
  )
}
