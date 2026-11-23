/**
 * Pick resources (characters, items, locations...) in a modal: the kinds allowed, favorites on top (e.g. a
 * location's sub-locations), a search by name and kind chips. Used wherever resources are linked.
 */
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Resource } from '../api/types'
import { useSaga } from '../saga/SagaContext'
import Modal from './Modal'
import ResourceIcon from './ResourceIcon'

interface Props {
  open: boolean
  title: string
  /** Resource kinds offered, e.g. ['character', 'item', 'location']. */
  kinds: string[]
  /** Shown first, under "Suggested" (or `favoritesLabel`). */
  favorites?: number[]
  favoritesLabel?: string
  othersLabel?: string
  /** Not offered (e.g. the location itself). */
  exclude?: number[]
  /** Pick several (a "Link" button) or one (picked on click). */
  multiple?: boolean
  onPick: (ids: number[], resources: Resource[]) => void
  onClose: () => void
}

/** Pure: the resources shown for a search, favorites first. */
export function pickerSections(resources: Resource[], query: string, kind: string | null, favorites: number[], exclude: number[]) {
  const q = query.trim().toLowerCase()
  const list = resources.filter((r) => !exclude.includes(r.id) && (!kind || r.kind === kind)
    && (!q || (r.name || '').toLowerCase().includes(q) || (r.tags || []).some((t) => t.toLowerCase().includes(q))))
  const fav = new Set(favorites)
  return { favorites: list.filter((r) => fav.has(r.id)), others: list.filter((r) => !fav.has(r.id)) }
}

export default function ResourcePicker({ open, title, kinds, favorites = [], favoritesLabel = 'Suggested', othersLabel = 'Everything else', exclude = [], multiple = true, onPick, onClose }: Props) {
  const { sagaId, ruleset } = useSaga()
  const [resources, setResources] = useState<Resource[]>([])
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<string | null>(null)
  const [picked, setPicked] = useState<number[]>([])

  useEffect(() => {
    if (!open) return
    setPicked([])
    setQuery('')
    Promise.all(kinds.map((k) => api.resources(sagaId, k))).then((lists) => setResources(lists.flat())).catch(() => setResources([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sagaId, kinds.join(',')])

  const sections = useMemo(() => pickerSections(resources, query, kind, favorites, exclude), [resources, query, kind, favorites, exclude])
  const kindName = (k: string) => ruleset.kinds[k] ? Object.values(ruleset.kinds[k].types)[0]?.plural || k : k
  const toggle = (r: Resource) => {
    if (!multiple) {
      onPick([r.id], [r])
      onClose()
      return
    }
    setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))
  }
  const row = (r: Resource) => (
    <button key={r.id} type="button" className={`pick resource-pick ${picked.includes(r.id) ? 'on' : ''}`} onClick={() => toggle(r)}>
      <ResourceIcon resource={r} />
      <span>{r.name || '???'}</span>
      <span className="muted small">{ruleset.kinds[r.kind]?.types[r.type]?.name ?? r.kind}</span>
    </button>
  )

  return (
    <Modal open={open} wide title={title} onClose={onClose}>
      {open && (
        <div className="resource-picker">
          <div className="picker-search">
            <input autoFocus placeholder="Search by name or tag" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
            {kinds.length > 1 && (
              <div className="chips">
                <button type="button" className={`chip ${kind === null ? 'on' : ''}`} onClick={() => setKind(null)}>All</button>
                {kinds.map((k) => (
                  <button key={k} type="button" className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{kindName(k)}</button>
                ))}
              </div>
            )}
          </div>
          {sections.favorites.length > 0 && (
            <section>
              <h4>{favoritesLabel}</h4>
              <div className="pick-grid">{sections.favorites.map(row)}</div>
            </section>
          )}
          <section>
            {sections.favorites.length > 0 && <h4>{othersLabel}</h4>}
            {sections.others.length === 0 && !sections.favorites.length && <p className="muted">Nothing found.</p>}
            <div className="pick-grid">{sections.others.map(row)}</div>
          </section>
          {multiple && (
            <div className="button-row end">
              <button className="primary" disabled={!picked.length} onClick={() => {
                onPick(picked, resources.filter((r) => picked.includes(r.id)))
                onClose()
              }}>Link {picked.length || ''}</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
