/**
 * An item's page: its sheet (the item display template's informative mode: what this member may see) and, for
 * the DM, its form (its type's variables, pictures, tags, who sees it, its relationships), open at once.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { Resource, Sheet } from '../../api/types'
import Modal from '../../components/Modal'
import ResourceIcon from '../../components/ResourceIcon'
import CharacterForm from '../CharacterForm'
import { RelationshipsButton } from './RelationshipsPanel'
import { FolderSelect } from './Folders'
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
  // The DM comes to edit it: the editor opens at once (closing it shows the item as players see it)
  const [editing, setEditing] = useState(isAdmin)

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
        <span className="spacer" />
        <RelationshipsButton subject={{ id: resource.id, name: resource.name, kind: 'item' }} />
        <FolderSelect kind="item" resource={resource} onFiled={(r) => { setResource(r); load() }} onError={setError} />
        {isAdmin && <button className="primary" onClick={() => setEditing(true)}>✎ Edit</button>}
      </header>
      <div>
        <section className="item-sheet">
          {sheet ? <div className="sheet-preview mode-informative"><SheetView sheet={sheet} mode="informative" open /></div>
            : <p className="muted">Loading…</p>}
          {isAdmin && <p className="muted small">What you see here is the item's display template (Saga → Template → Items → <Link to={`/s/${sagaId}/saga/template?tab=item&sub=displays`}>Display templates</Link>).</p>}
        </section>
      </div>
      <Modal open={editing} full title={resource.name} onClose={() => setEditing(false)}>
        {editing && (
          <CharacterForm key={resource.updated_at ?? resource.id} resource={resource} kind="item" tabbed onDone={(saved) => {
            setEditing(false)
            if (!saved) navigate(`/s/${sagaId}/items`)
            else load()
          }} />
        )}
      </Modal>
    </div>
  )
}
