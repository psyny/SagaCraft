/**
 * The Items and Documents tabs: every resource of the kind this member may see, as cards (icon, name, its
 * category, tags). Search by name, filter by category (the Saga template's types) and by the DM's tags.
 * The DM makes new ones (an item picks its type). Both are filed in folders (sidebar, ?folder=: Folders.tsx).
 * See docs/concepts/rulesets.md.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import type { Resource } from '../../api/types'
import { DRAG_TYPE, FolderLayout, useFolders } from './Folders'
import Modal from '../../components/Modal'
import ResourceIcon from '../../components/ResourceIcon'
import CharacterForm from '../CharacterForm'
import { useSaga } from '../SagaContext'

const TEXT: Record<string, { title: string; one: string; blurb: string; empty: string; none: string }> = {
  item: { title: 'Items', one: 'item', blurb: 'Weapons, armor, potions, keys, treasure: each with its type\'s variables.',
    empty: 'No items yet: make the first ones, then put them in inventories or on maps.', none: 'No items shared with you yet.' },
  document: { title: 'Documents', one: 'document', blurb: 'Letters, books, handouts, maps on paper: pages of text or pictures.',
    empty: 'No documents yet: write a letter, upload a handout.', none: 'No documents shared with you yet.' },
}

/** Resources matching a search, a category and every picked tag. */
export function filterResources(list: Resource[], query: string, type: string | null, tags: string[]): Resource[] {
  const q = query.trim().toLowerCase()
  return list.filter((r) => (!q || (r.name || '').toLowerCase().includes(q))
    && (!type || r.type === type)
    && tags.every((t) => (r.tags || []).some((x) => x.toLowerCase() === t.toLowerCase())))
}

export default function ResourceList({ kind }: { kind: 'item' | 'document' }) {
  const { sagaId, isAdmin, ruleset } = useSaga()
  const navigate = useNavigate()
  const text = TEXT[kind]
  const types = ruleset.kinds[kind]?.types || {}
  const [list, setList] = useState<Resource[] | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const folderState = useFolders(kind)
  const { pick } = folderState

  const load = useCallback(() => {
    api.resources(sagaId, kind).then(setList).catch((e: Error) => setError(e.message))
  }, [sagaId, kind])
  useEffect(() => {
    load()
    api.tags(sagaId, kind).then(setTags).catch(() => undefined)
  }, [load, sagaId, kind])

  const matching = useMemo(() => filterResources(list || [], query, type, picked), [list, query, type, picked])
  const path = kind === 'item' ? 'items' : 'lore/documents'
  if (!Object.keys(types).length) return <div className="page-message">This Saga's template has no {text.title.toLowerCase()}.</div>

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{text.title}</h1>
          <p className="muted small">{text.blurb}</p>
        </div>
        {isAdmin && <button className="primary" onClick={() => setCreating(true)}>＋ New {text.one}</button>}
      </header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <div className="list-filters">
        <input placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${text.title.toLowerCase()}`} />
        {Object.keys(types).length > 1 && (
          <div className="chips">
            {Object.entries(types).map(([key, t]) => (
              <button key={key} type="button" className={`chip ${type === key ? 'on' : ''}`} onClick={() => setType(type === key ? null : key)}>{t.plural || t.name}</button>
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div className="chips">
            {tags.map((t) => {
              const on = picked.includes(t)
              return <button key={t} type="button" className={`chip ${on ? 'on' : ''}`} onClick={() => setPicked(on ? picked.filter((x) => x !== t) : [...picked, t])}>#{t}</button>
            })}
          </div>
        )}
      </div>
      {list && list.length === 0 && <p className="muted">{isAdmin ? text.empty : text.none}</p>}
      {list && list.length > 0 && matching.length === 0 && <p className="muted">Nothing matches.</p>}
      <FolderLayout kind={kind} folders={folderState} matching={matching} total={list?.length ?? 0} cards={cards} onChanged={load}
        onError={setError} emptyHint={`Empty: drag ${text.title.toLowerCase()} here, or make a new one.`} />
      <Modal open={creating} full={kind === 'item'} title={`New ${text.one}`} onClose={() => setCreating(false)}>
        {creating && (
          <CharacterForm kind={kind} tabbed={kind === 'item'} typeKey={type ?? undefined} folderId={typeof pick === 'number' ? pick : null} onDone={(made) => {
            setCreating(false)
            if (made) navigate(`/s/${sagaId}/${path}/${made.id}`)
          }} />
        )}
      </Modal>
    </div>
  )

  function cards(items: Resource[]) {
    return (
      <div className="location-grid">
        {items.map((r) => (
          <button key={r.id} className="location-card" onClick={() => navigate(`/s/${sagaId}/${path}/${r.id}`)}
            draggable={isAdmin} onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, JSON.stringify([r.id]))
              e.dataTransfer.effectAllowed = 'move'
            }}>
            <ResourceIcon resource={r} className="location-icon round" />
            <span className="location-card-body">
              <strong>{r.name ?? '???'}</strong>
              <span className="muted small">{types[r.type]?.name ?? r.type}
                {kind === 'document' && Array.isArray(r.attributes.pages) ? ` · ${(r.attributes.pages as unknown[]).length} pages` : ''}</span>
              {r.tags && r.tags.length > 0 && <span className="chips small">{r.tags.map((t) => <span key={t} className="chip">{t}</span>)}</span>}
            </span>
          </button>
        ))}
      </div>
    )
  }
}
