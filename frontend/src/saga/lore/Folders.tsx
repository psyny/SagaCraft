/**
 * Folders (one level, no sub-folders) for documents, items and locations: the sidebar of their lists. Everyone picks
 * a folder to see only what's in it; the DM makes folders, files resources by dragging their cards onto a folder (or
 * onto "Not in a folder"), and sets each folder up with its ⚙: its name, and **who can see** what's in it (Inherit:
 * each resource keeps its own; anything else overrides theirs). A folder shows for players when it's shown to them or
 * holds something they see (the server decides). See docs/concepts/rulesets.md ("Folders").
 */
import { useCallback, useEffect, useState, type DragEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import type { Resource, ResourceFolder, Visibility } from '../../api/types'
import EyeIcon from '../../components/EyeIcon'
import Modal from '../../components/Modal'
import VisibilityPicker from '../../components/VisibilityPicker'
import { useSaga } from '../SagaContext'

/** Which resources show: all, one folder's, or those in no folder. */
export type FolderPick = 'all' | 'none' | number

/** The drag payload of resource cards (their ids). */
export const DRAG_TYPE = 'application/x-sagacraft-resources'

export function parseFolderPick(raw: string | null): FolderPick {
  if (raw === 'none') return 'none'
  const id = Number(raw)
  return raw && Number.isInteger(id) && id > 0 ? id : 'all'
}

export function inFolder(resource: Resource, pick: FolderPick): boolean {
  if (pick === 'all') return true
  if (pick === 'none') return !resource.folder_id
  return resource.folder_id === pick
}

/** "All" shows the resources grouped: each folder in order, then those in no folder. Empty groups are left out. */
export function groupByFolder(list: Resource[], folders: ResourceFolder[]): { folder: ResourceFolder | null; list: Resource[] }[] {
  const known = new Set(folders.map((f) => f.id))
  const groups = folders.map((folder) => ({ folder: folder as ResourceFolder | null, list: list.filter((r) => r.folder_id === folder.id) }))
  groups.push({ folder: null, list: list.filter((r) => !r.folder_id || !known.has(r.folder_id)) })
  return groups.filter((g) => g.list.length > 0)
}

/** The words for a kind's folders ("All items", "drag items here"). */
export const FOLDER_WORDS: Record<string, { all: string; plural: string }> = {
  document: { all: 'All documents', plural: 'documents' },
  item: { all: 'All items', plural: 'items' },
  location: { all: 'All locations', plural: 'locations' },
}

interface Props {
  kind: string
  folders: ResourceFolder[]
  /** Counts of the resources this member sees: all and in no folder. */
  total: number
  unfiled: number
  pick: FolderPick
  onPick: (pick: FolderPick) => void
  isAdmin: boolean
  onCreate: (name: string) => Promise<boolean>
  onSettings: (folder: ResourceFolder) => void
  /** Resources dropped on a folder (null: out of folders). */
  onFile: (folderId: number | null, ids: number[]) => void
}

export default function Folders({ kind, folders, total, unfiled, pick, onPick, isAdmin, onCreate, onSettings, onFile }: Props) {
  const [adding, setAdding] = useState(false)
  const [over, setOver] = useState<FolderPick | null>(null)
  const words = FOLDER_WORDS[kind] ?? { all: 'All', plural: 'resources' }

  const dropProps = (target: number | null) => isAdmin ? {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setOver(target ?? 'none')
    },
    onDragLeave: () => setOver(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setOver(null)
      try {
        const ids = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as number[]
        if (Array.isArray(ids) && ids.length) onFile(target, ids)
      } catch { /* not ours */ }
    },
  } : {}

  const row = (key: FolderPick, label: string, count: number, extra?: ReactNode, mark?: ReactNode) => (
    <div key={String(key)} className={`folder-row ${pick === key ? 'on' : ''} ${over === key ? 'drop' : ''}`}
      {...(key === 'all' ? {} : dropProps(key === 'none' ? null : key))}>
      <button className="folder-name" onClick={() => onPick(key)} aria-pressed={pick === key}>
        <span className="folder-glyph" aria-hidden>{key === 'all' ? '▤' : key === 'none' ? '·' : '▸'}</span>
        <span className="folder-label">{label}</span>
        {mark}
        <span className="muted small">{count}</span>
      </button>
      {extra}
    </div>
  )

  return (
    <nav className="folders" aria-label="Folders">
      {row('all', words.all, total)}
      {folders.map((f) => row(f.id, f.name, f.count, isAdmin ? (
        <span className="folder-actions">
          <button className="small ghost" title="Folder settings: name, who can see" aria-label={`Settings of ${f.name}`} onClick={() => onSettings(f)}>⚙</button>
        </span>
      ) : undefined, isAdmin && f.visibility ? (
        <span className="folder-decides" title="This folder decides who sees what's in it"><EyeIcon open /></span>
      ) : undefined))}
      {folders.length > 0 && row('none', 'Not in a folder', unfiled)}
      {isAdmin && (adding ? (
        <form className="folder-row" onSubmit={(e) => {
          e.preventDefault()
          const input = (e.currentTarget.elements.namedItem('name') as HTMLInputElement)
          void onCreate(input.value).then((ok) => ok && setAdding(false))
        }}>
          <input name="name" autoFocus placeholder="Folder name" aria-label="New folder name" maxLength={80}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} onBlur={(e) => !e.target.value.trim() && setAdding(false)} />
        </form>
      ) : <button className="small ghost folder-add" onClick={() => setAdding(true)}>＋ New folder</button>)}
      {isAdmin && folders.length > 0 && <p className="muted small folder-hint">Drag {words.plural} onto a folder to file them.</p>}
    </nav>
  )
}

/** A folder's ⚙ (the DM): its name, who can see what's in it, and deleting it. */
export function FolderSettings({ folder, kind, onClose, onChanged }: { folder: ResourceFolder | null; kind: string; onClose: () => void; onChanged: () => void }) {
  const { sagaId, saga } = useSaga()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [visibility, setVisibility] = useState<Visibility | null>(null)
  useEffect(() => {
    setName(folder?.name ?? '')
    setVisibility(folder?.visibility ?? null)
    setError('')
  }, [folder])
  const words = FOLDER_WORDS[kind] ?? { plural: 'resources' }
  const act = async (action: () => Promise<unknown>, close = false) => {
    setError('')
    try {
      await action()
      onChanged()
      if (close) onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Modal open={folder !== null} title={folder ? `Folder: ${folder.name}` : 'Folder'} onClose={onClose}>
      {folder && (
        <div className="form">
          {error && <div className="error">{error}</div>}
          <label>Name
            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name.trim() !== folder.name && void act(() => api.renameFolder(sagaId, folder.id, name.trim()))}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          </label>
          <div className="field">
            <span className="field-label">Who can see what's in it</span>
            <VisibilityPicker title={`Who can see what's in ${folder.name}`} value={visibility} groups={saga.groups} members={saga.members} owner
              onInherit={() => { setVisibility(null); void act(() => api.setFolderVisibility(sagaId, folder.id, null)) }}
              onChange={(v) => { setVisibility(v); void act(() => api.setFolderVisibility(sagaId, folder.id, v)) }} />
            <span className="muted small">
              {visibility === null
                ? `Inherit: each of its ${words.plural} keeps its own who can see.`
                : `This decides for every one of its ${words.plural}, whatever their own setting (kept for when they leave the folder). "Owner": each one's owners.`}
            </span>
          </div>
          <div className="button-row">
            <button className="ghost danger" onClick={() => window.confirm(`Delete the folder "${folder.name}"?${folder.count ? ` Its ${folder.count} ${words.plural} stay, out of any folder, with their own who can see.` : ''}`)
              && void act(() => api.deleteFolder(sagaId, folder.id), true)}>Delete the folder</button>
            <span className="spacer" />
            <button className="primary" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/**
 * A list with its folders: the sidebar and the resources (all grouped by folder, one folder's, or those in no
 * folder; ?folder= in the address). `cards` draws resources; they're draggable onto folders for the DM.
 */
export function useFolders(kind: string) {
  const { sagaId } = useSaga()
  const [list, setList] = useState<ResourceFolder[] | null>(null)
  const [params, setParams] = useSearchParams()
  const asked = parseFolderPick(params.get('folder'))
  // A folder that's gone (deleted, or not shared with this member) shows all
  const pick: FolderPick = typeof asked === 'number' && list && !list.some((f) => f.id === asked) ? 'all' : asked
  const setPick = (next: FolderPick) => setParams(next === 'all' ? {} : { folder: String(next) }, { replace: true })
  const reload = useCallback(() => {
    api.folders(sagaId, kind).then(setList).catch(() => undefined)
  }, [sagaId, kind])
  useEffect(reload, [reload])
  return { folders: list || [], loaded: list !== null, pick, setPick, reload }
}

export function FolderLayout({ kind, matching, total, cards, onChanged, onError, emptyHint, folders: state }: {
  kind: string
  /** Resources matching the list's filters (folders count and show these). */
  matching: Resource[]
  /** How many there are, before filters (to tell "nothing yet" from "nothing here"). */
  total: number
  cards: (items: Resource[]) => ReactNode
  /** Something moved or a folder changed: reload the list. */
  onChanged: () => void
  onError: (message: string) => void
  emptyHint: string
  folders: ReturnType<typeof useFolders>
}) {
  const { sagaId, isAdmin } = useSaga()
  const { folders, pick, setPick, reload } = state
  const [settings, setSettings] = useState<ResourceFolder | null>(null)
  const shown = matching.filter((r) => inFolder(r, pick))
  const act = async (action: () => Promise<unknown>) => {
    try {
      await action()
      return true
    } catch (e) {
      onError((e as Error).message)
      return false
    } finally {
      reload()
      onChanged()
    }
  }
  const folderName = (id: number) => folders.find((f) => f.id === id)?.name
  return (
    <div className="folder-layout">
      <Folders kind={kind} folders={folders} total={matching.length} unfiled={matching.filter((r) => !r.folder_id).length}
        pick={pick} onPick={setPick} isAdmin={isAdmin}
        onCreate={(name) => act(async () => setPick((await api.createFolder(sagaId, name, kind)).id))}
        onSettings={setSettings}
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
            {total > 0 && shown.length === 0 && matching.length > 0 && <p className="muted">{isAdmin ? emptyHint : 'Nothing here.'}</p>}</>}
      </div>
      <FolderSettings folder={settings} kind={kind} onClose={() => setSettings(null)} onChanged={() => { reload(); onChanged() }} />
    </div>
  )
}

/** A resource page's folder (the DM): file it in a folder, or take it out. */
export function FolderSelect({ kind, resource, onFiled, onError }: { kind: string; resource: Resource; onFiled: (r: Resource) => void; onError: (m: string) => void }) {
  const { sagaId, isAdmin } = useSaga()
  const [folders, setFolders] = useState<ResourceFolder[]>([])
  useEffect(() => {
    if (isAdmin) api.folders(sagaId, kind).then(setFolders).catch(() => undefined)
  }, [isAdmin, sagaId, kind])
  if (!isAdmin) return null
  const decides = folders.find((f) => f.id === resource.folder_id)?.visibility
  return (
    <label className="inline-field small" title={decides ? 'The folder it\'s filed in (it decides who sees it)' : 'The folder it\'s filed in'}>
      <span className="muted">Folder</span>
      <select value={resource.folder_id ?? 0} aria-label="Folder"
        onChange={(e) => void api.updateResource(sagaId, resource.id, { folder_id: Number(e.target.value) }).then(onFiled).catch((err: Error) => onError(err.message))}>
        <option value={0}>Not in a folder</option>
        {folders.map((f) => <option key={f.id} value={f.id}>{f.name}{f.visibility ? ' 👁' : ''}</option>)}
      </select>
    </label>
  )
}
