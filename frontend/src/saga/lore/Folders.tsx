/**
 * Document folders (one level, no sub-folders): the sidebar of the Documents tab. Everyone picks a folder to
 * see only its documents; the DM makes, renames and deletes folders, and files documents by dragging their cards
 * onto a folder (or onto "Not in a folder"). A folder shows for players only when it holds something they see
 * (the server decides). See docs/concepts/rulesets.md ("Documents").
 */
import { useState, type DragEvent } from 'react'
import type { Resource, ResourceFolder } from '../../api/types'

/** Which documents show: all, one folder's, or those in no folder. */
export type FolderPick = 'all' | 'none' | number

/** The drag payload of document cards (their ids). */
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

/** "All" shows the documents grouped: each folder in order, then those in no folder. Empty groups are left out. */
export function groupByFolder(list: Resource[], folders: ResourceFolder[]): { folder: ResourceFolder | null; list: Resource[] }[] {
  const known = new Set(folders.map((f) => f.id))
  const groups = folders.map((folder) => ({ folder: folder as ResourceFolder | null, list: list.filter((r) => r.folder_id === folder.id) }))
  groups.push({ folder: null, list: list.filter((r) => !r.folder_id || !known.has(r.folder_id)) })
  return groups.filter((g) => g.list.length > 0)
}

interface Props {
  folders: ResourceFolder[]
  /** Counts of the documents this member sees: all and in no folder. */
  total: number
  unfiled: number
  pick: FolderPick
  onPick: (pick: FolderPick) => void
  isAdmin: boolean
  onCreate: (name: string) => Promise<boolean>
  onRename: (folder: ResourceFolder, name: string) => void
  onDelete: (folder: ResourceFolder) => void
  /** Documents dropped on a folder (null: out of folders). */
  onFile: (folderId: number | null, ids: number[]) => void
}

export default function Folders({ folders, total, unfiled, pick, onPick, isAdmin, onCreate, onRename, onDelete, onFile }: Props) {
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [over, setOver] = useState<FolderPick | null>(null)

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

  const row = (key: FolderPick, label: string, count: number, extra?: JSX.Element) => (
    <div key={String(key)} className={`folder-row ${pick === key ? 'on' : ''} ${over === key ? 'drop' : ''}`}
      {...(key === 'all' ? {} : dropProps(key === 'none' ? null : key))}>
      <button className="folder-name" onClick={() => onPick(key)} aria-pressed={pick === key}>
        <span className="folder-glyph" aria-hidden>{key === 'all' ? '▤' : key === 'none' ? '·' : '▸'}</span>
        <span className="folder-label">{label}</span>
        <span className="muted small">{count}</span>
      </button>
      {extra}
    </div>
  )

  return (
    <nav className="folders" aria-label="Folders">
      {row('all', 'All documents', total)}
      {folders.map((f) => renaming === f.id ? (
        <div key={f.id} className="folder-row">
          <input autoFocus defaultValue={f.name} aria-label="Folder name" maxLength={80}
            onBlur={(e) => { setRenaming(null); if (e.target.value.trim() && e.target.value.trim() !== f.name) onRename(f, e.target.value.trim()) }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }} />
        </div>
      ) : row(f.id, f.name, f.count, isAdmin ? (
        <span className="folder-actions">
          <button className="small ghost" title="Rename" aria-label={`Rename ${f.name}`} onClick={() => setRenaming(f.id)}>✎</button>
          <button className="small ghost danger" title="Delete the folder (its documents stay)" aria-label={`Delete ${f.name}`} onClick={() => onDelete(f)}>✕</button>
        </span>
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
      {isAdmin && folders.length > 0 && <p className="muted small folder-hint">Drag documents onto a folder to file them.</p>}
    </nav>
  )
}
