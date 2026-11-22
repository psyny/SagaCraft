/**
 * A document: pages of text or pictures, read one at a time (arrows, the page list, keys ← →). The DM writes
 * them here: add a text or picture page, reorder, delete, edit a page's title and text; and the document's
 * details (title, icon, tags, who sees it), and the folder it's filed in. See docs/concepts/rulesets.md ("Documents").
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { DocumentPage as Page, Resource, ResourceFolder } from '../../api/types'
import ImageUploader from '../../components/imageEditor/ImageUploader'
import Modal from '../../components/Modal'
import ResourceIcon from '../../components/ResourceIcon'
import CharacterForm from '../CharacterForm'
import { RelationshipsButton } from './RelationshipsPanel'
import { useSaga } from '../SagaContext'

/** The document's pages attribute (whatever the template calls it). */
export function pagesKey(attributes: { key: string; type: string }[]): string | null {
  return attributes.find((a) => a.type === 'pages')?.key ?? null
}

const newId = () => `p${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`

/** One page, as read. */
export function PageView({ page, number }: { page: Page; number: number }) {
  return (
    <article className={`doc-page kind-${page.kind}`}>
      {page.title && <h2 className="doc-page-title">{page.title}</h2>}
      {page.kind === 'text'
        ? <div className="doc-text">{page.text || <span className="muted">An empty page.</span>}</div>
        : page.image?.url ? <img className="doc-picture" src={page.image.url} alt={page.title || `Page ${number}`} /> : <p className="muted">No picture.</p>}
    </article>
  )
}

/** The reader: one page at a time. */
export function DocumentReader({ pages, index, onIndex }: { pages: Page[]; index: number; onIndex: (i: number) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      if (e.key === 'ArrowRight') onIndex(Math.min(pages.length - 1, index + 1))
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, pages.length, onIndex])
  if (!pages.length) return <p className="muted doc-empty">No pages yet.</p>
  const page = pages[Math.min(index, pages.length - 1)]
  return (
    <div className="doc-reader">
      <PageView page={page} number={index + 1} />
      <div className="doc-nav">
        <button className="small" disabled={index === 0} onClick={() => onIndex(index - 1)} aria-label="Previous page">←</button>
        <span className="muted small">Page {index + 1} of {pages.length}</span>
        <button className="small" disabled={index >= pages.length - 1} onClick={() => onIndex(index + 1)} aria-label="Next page">→</button>
      </div>
    </div>
  )
}

export default function DocumentPage() {
  const { sagaId, isAdmin, ruleset } = useSaga()
  const { documentId } = useParams()
  const id = Number(documentId)
  const navigate = useNavigate()
  const [resource, setResource] = useState<Resource | null>(null)
  const [index, setIndex] = useState(0)
  const [tab, setTab] = useState<'pages' | 'details'>('pages')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [folders, setFolders] = useState<ResourceFolder[]>([])

  const load = useCallback(() => {
    api.resource(sagaId, id).then(setResource).catch((e: Error) => setError(e.message))
    api.folders(sagaId).then(setFolders).catch(() => undefined)
  }, [sagaId, id])
  useEffect(load, [load])

  if (!resource) return <div className="page-message">{error || 'Loading…'}</div>
  const key = pagesKey(ruleset.kinds.document?.types[resource.type]?.attributes || [])
  const pages = ((key && resource.attributes[key]) as Page[] | undefined) || []
  const editable = isAdmin && key !== null && resource.editable.includes(key)

  const savePages = async (next: Page[], focus?: number) => {
    if (!key) return
    setError('')
    try {
      // Pictures go as files (the server signs their URLs again)
      const body = next.map((p) => (p.kind === 'image' && p.image ? { ...p, image: { file_id: p.image.file_id, face: p.image.face } } : p))
      setResource(await api.updateResource(sagaId, resource.id, { attributes: { [key]: body } }))
      if (focus !== undefined) setIndex(focus)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const page = pages[Math.min(index, Math.max(0, pages.length - 1))]
  const change = (changes: Partial<Page>) => page && void savePages(pages.map((p) => (p.id === page.id ? { ...p, ...changes } : p)))
  const move = (delta: number) => {
    const to = index + delta
    if (!page || to < 0 || to >= pages.length) return
    const next = [...pages]
    next.splice(index, 1)
    next.splice(to, 0, page)
    void savePages(next, to)
  }
  const folder = folders.find((f) => f.id === resource.folder_id)
  const fileIn = async (folderId: number) => {
    setError('')
    try {
      setResource(await api.updateResource(sagaId, resource.id, { folder_id: folderId }))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const add = (made: Page) => void savePages([...pages.slice(0, index + 1), made, ...pages.slice(index + 1)], pages.length ? index + 1 : 0)

  return (
    <div className="page page-full document-page">
      <header className="location-header">
        <Link to={`/s/${sagaId}/lore/documents${folder ? `?folder=${folder.id}` : ''}`} className="muted small">← {folder ? folder.name : 'Documents'}</Link>
        <h1><ResourceIcon resource={resource} className="title-icon round" /> {resource.name}</h1>
        <span className="spacer" />
        <RelationshipsButton subject={{ id: resource.id, name: resource.name, kind: 'document' }} />
        {isAdmin && (
          <label className="inline-field small" title="The folder it's filed in">
            <span className="muted">Folder</span>
            <select value={resource.folder_id ?? 0} onChange={(e) => void fileIn(Number(e.target.value))} aria-label="Folder">
              <option value={0}>Not in a folder</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        )}
        {isAdmin && (
          <div className="tool-tabs section-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'pages'} className={`tool-tab ${tab === 'pages' ? 'on' : ''}`} onClick={() => setTab('pages')}>Pages</button>
            <button role="tab" aria-selected={tab === 'details'} className={`tool-tab ${tab === 'details' ? 'on' : ''}`} onClick={() => setTab('details')}>Details</button>
          </div>
        )}
      </header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      {tab === 'details' && isAdmin ? (
        <div className="doc-details">
          <CharacterForm key={resource.updated_at ?? resource.id} resource={resource} kind="document" onDone={(saved) => {
            if (!saved) navigate(`/s/${sagaId}/lore/documents`)
            else { setResource(saved); setTab('pages') }
          }} />
        </div>
      ) : (
        <div className={`doc-layout ${editable && page ? 'editing' : ''}`}>
          <aside className="doc-pages">
            {pages.map((p, i) => (
              <button key={p.id} className={`path-row ${i === index ? 'on' : ''}`} onClick={() => setIndex(i)}>
                <span className="muted small">{i + 1}</span>
                <span>{p.title || (p.kind === 'image' ? 'Picture' : (p.text || '').slice(0, 30) || 'Text')}</span>
                <span className="muted small">{p.kind === 'image' ? '🖼' : '¶'}</span>
              </button>
            ))}
            {editable && (
              <div className="button-row">
                <button className="small" onClick={() => add({ id: newId(), kind: 'text', title: '', text: '' })}>＋ Text page</button>
                <button className="small" onClick={() => setUploading(true)}>＋ Picture page</button>
              </div>
            )}
          </aside>
          <section className="doc-main">
            <DocumentReader pages={pages} index={Math.min(index, Math.max(0, pages.length - 1))} onIndex={setIndex} />
          </section>
          {editable && page && (
            <aside className="doc-edit tool-panel">
              <strong>Page {index + 1}</strong>
              <label>Title<input key={`${page.id}-t-${page.title}`} defaultValue={page.title} placeholder="(none)"
                onBlur={(e) => e.target.value !== page.title && change({ title: e.target.value })} /></label>
              {page.kind === 'text' ? (
                <label>Text<textarea key={`${page.id}-x`} rows={16} defaultValue={page.text}
                  onBlur={(e) => e.target.value !== page.text && change({ text: e.target.value })} /></label>
              ) : <p className="muted small">A picture page. Replace it by adding another and deleting this one.</p>}
              <div className="button-row">
                <button className="small" disabled={index === 0} onClick={() => move(-1)}>↑ Earlier</button>
                <button className="small" disabled={index >= pages.length - 1} onClick={() => move(1)}>↓ Later</button>
                <span className="spacer" />
                <button className="small ghost danger" onClick={() => window.confirm('Delete this page?')
                  && void savePages(pages.filter((p) => p.id !== page.id), Math.max(0, index - 1))}>Delete page</button>
              </div>
            </aside>
          )}
        </div>
      )}
      <Modal open={uploading} wide title="Picture page" onClose={() => setUploading(false)}>
        {uploading && (
          <ImageUploader sagaId={sagaId} category="document" onCancel={() => setUploading(false)} onUploaded={(file) => {
            setUploading(false)
            add({ id: newId(), kind: 'image', title: '', image: { file_id: file.id, url: file.url, face: { x: 0.5, y: 0.5, size: 1 } } })
          }} />
        )}
      </Modal>
    </div>
  )
}
