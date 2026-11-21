/**
 * The Items and Documents tabs: every resource of the kind this member may see, as cards (icon, name, its
 * category, tags). Search by name, filter by category (the Saga template's types) and by the DM's tags.
 * The DM makes new ones (an item picks its category). Documents are filed in folders (sidebar, ?folder=). See
 * docs/concepts/rulesets.md.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import type { Resource, ResourceFolder } from '../../api/types'
import Folders, { DRAG_TYPE, groupByFolder, inFolder, parseFolderPick, type FolderPick } from './Folders'
import Modal from '../../components/Modal'
import ResourceIcon from '../../components/ResourceIcon'
import CharacterForm from '../CharacterForm'
import { useSaga } from '../SagaContext'

const TEXT: Record<string, { title: string; one: string; blurb: string; empty: string; none: string }> = {
  item: { title: 'Items', one: 'item', blurb: 'Weapons, armor, potions, keys, treasure: each with its category\'s variables.',
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
  const foldered = kind === 'document'
  const [folderList, setFolders] = useState<ResourceFolder[] | null>(null)
  const folders = folderList || []
  const [params, setParams] = useSearchParams()
  const asked = foldered ? parseFolderPick(params.get('folder')) : 'all'
  // A folder that's gone (deleted, or not shared with this member) shows all
  const pick: FolderPick = typeof asked === 'number' && folderList && !folderList.some((f) => f.id === asked) ? 'all' : asked
  const setPick = (next: FolderPick) => setParams(next === 'all' ? {} : { folder: String(next) }, { replace: true })

  const load = useCallback(() => {
    api.resources(sagaId, kind).then(setList).catch((e: Error) => setError(e.message))
    if (foldered) api.folders(sagaId, kind).then(setFolders).catch(() => undefined)
  }, [sagaId, kind, foldered])
  useEffect(() => {
    load()
    api.tags(sagaId, kind).then(setTags).catch(() => undefined)
  }, [load, sagaId, kind])

  const matching = useMemo(() => filterResources(list || [], query, type, picked), [list, query, type, picked])
  const shown = matching.filter((r) => inFolder(r, pick))
  const path = kind === 'item' ? 'items' : 'documents'
  const act = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      load()
    }
  }
  const folderName = (id: number | null | undefined) => folders.find((f) => f.id === id)?.name
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
      {foldered ? (
        <div className="folder-layout">
          <Folders folders={folders} total={matching.length} unfiled={matching.filter((r) => !r.folder_id).length}
            pick={pick} onPick={setPick} isAdmin={isAdmin}
            onCreate={(name) => act(async () => setPick((await api.createFolder(sagaId, name, kind)).id))}
            onRename={(f, name) => void act(() => api.renameFolder(sagaId, f.id, name))}
            onDelete={(f) => window.confirm(`Delete the folder "${f.name}"?${f.count ? ` Its ${f.count} document${f.count === 1 ? '' : 's'} stay, out of any folder.` : ''}`)
              && void act(() => api.deleteFolder(sagaId, f.id))}
            onFile={(folderId, ids) => void act(() => api.fileResources(sagaId, folderId, ids))} />
          <div className="folder-main">
            {pick === 'all' && folders.length > 0
              ? groupByFolder(shown, folders).map((g) => (
                <section key={g.folder?.id ?? 'none'} className="folder-section">
                  <h3 className="folder-heading">{g.folder ? g.folder.name : 'Not in a folder'} <span className="muted small">{g.list.length}</span></h3>
                  {cards(g.list)}
                </section>
              ))
              : <>{typeof pick === 'number' && <h3 className="folder-heading">{folderName(pick)}</h3>}{cards(shown)}
                {list && list.length > 0 && shown.length === 0 && matching.length > 0 && <p className="muted">{isAdmin ? 'Empty: drag documents here, or make a new one.' : 'Nothing here.'}</p>}</>}
          </div>
        </div>
      ) : cards(shown)}
      <Modal open={creating} title={`New ${text.one}`} onClose={() => setCreating(false)}>
        {creating && (
          <CharacterForm kind={kind} typeKey={type ?? undefined} folderId={typeof pick === 'number' ? pick : null} onDone={(made) => {
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
            draggable={foldered && isAdmin} onDragStart={(e) => {
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
