/**
 * The universal resource view: any resource, in a modal, as this member may see it.
 * - character: the character view (its sheet, informative template; an instance's own values from a Stage),
 * - location: its map (their fog; resources on it open here too, with a way back) and its details,
 * - anything else: its picture, description and values.
 * Opened from map links, Actors Scene cards and lists.
 */
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ImageValue, MapLink, Resource } from '../api/types'
import { MapViewer } from '../maps/MapEditor'
import CharacterSheetModal from '../saga/sheet/CharacterSheet'
import { useSaga } from '../saga/SagaContext'
import Modal from './Modal'
import Picture from './Picture'
import ResourceIcon from './ResourceIcon'

export interface ResourceTarget {
  id: number
  kind: string
  /** Opened from a Set (its template choice) or a card (an instance's values). */
  setId?: number | null
  actorId?: number | null
}

function Details({ resource }: { resource: Resource }) {
  const { ruleset } = useSaga()
  const type = ruleset.kinds[resource.kind]?.types[resource.type]
  const shown = (type?.attributes || []).filter((a) => a.key !== 'name' && !a.parent && a.key in resource.attributes)
  return (
    <div className="resource-details">
      {resource.tags && resource.tags.length > 0 && <div className="chips">{resource.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>}
      {shown.map((attr) => {
        const value = resource.attributes[attr.key]
        if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return null
        if (attr.type === 'image') {
          if (attr.category === 'icon') return null
          const pictures = (Array.isArray(value) ? value : [value]) as ImageValue[]
          return (
            <div key={attr.key} className="field">
              <span className="field-label">{attr.name}</span>
              <div className="gallery">{pictures.map((p) => <Picture key={p.file_id} url={p.url} mode="full" className="gallery-pic" />)}</div>
            </div>
          )
        }
        return (
          <div key={attr.key} className="field">
            <span className="field-label">{attr.name}</span>
            <span className="sheet-text">{Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function ResourceView({ target, onClose }: { target: ResourceTarget | null; onClose: () => void }) {
  const { sagaId } = useSaga()
  const [trail, setTrail] = useState<ResourceTarget[]>([])
  const [resource, setResource] = useState<Resource | null>(null)
  const current = trail[trail.length - 1] ?? target
  useEffect(() => setTrail([]), [target?.id, target?.kind])
  useEffect(() => {
    setResource(null)
    if (!current || current.kind === 'character') return
    // A location shown on the live Stage may have no page for them: the map still opens
    api.resource(sagaId, current.id).then(setResource).catch(() => setResource(null))
  }, [sagaId, current?.id, current?.kind])

  if (!current) return null
  const back = trail.length > 0 ? () => setTrail(trail.slice(0, -1)) : null
  const open = (link: MapLink) => setTrail([...trail, { id: link.resource_id, kind: link.kind }])

  if (current.kind === 'character') {
    return (
      <CharacterSheetModal sagaId={sagaId} resourceId={current.id} setId={current.setId} actorId={current.actorId}
        initialMode="informative" onClose={back ?? onClose} />
    )
  }
  return (
    <Modal open wide title={resource?.name ?? '…'} onClose={onClose} className={`resource-view kind-${current.kind}`}
      actions={back ? <button className="small" onClick={back}>← Back</button> : undefined}>
      {current.kind === 'location' ? (
        <div className="location-view">
          <div className="location-view-map"><MapViewer key={current.id} sagaId={sagaId} locationId={current.id} onLinkClick={open} /></div>
          {resource && <Details resource={resource} />}
        </div>
      ) : resource ? (
        <div className="resource-view-body">
          <ResourceIcon resource={resource} className="big-icon round" />
          <Details resource={resource} />
        </div>
      ) : <p className="muted">Loading…</p>}
    </Modal>
  )
}
