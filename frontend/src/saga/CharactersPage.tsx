import { motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Counter, ImageValue, Resource } from '../api/types'
import Modal from '../components/Modal'
import Picture from '../components/Picture'
import Segmented from '../components/Segmented'
import { Bar } from '../stage/sets/actorsScene/AttributeDisplays'
import { parseValueInput } from '../stage/sets/actorsScene/layout'
import CategoriesManager from './CategoriesManager'
import CharacterForm from './CharacterForm'
import { useSaga } from './SagaContext'
import CharacterSheetModal from './sheet/CharacterSheet'

const SORT_KEY = 'sagacraft.characterSort'

/** Sort keys: name and date created always, plus the ruleset's sortable numbers (e.g. level). */
export function sortOptions(attributes: { key: string; name: string; type: string; sortable?: boolean }[]): [string, string][] {
  const numbers = attributes.filter((a) => a.sortable && a.type === 'number')
  return [['name', 'Name'], ...numbers.map((a) => [a.key, a.name] as [string, string]), ['created', 'Date created']]
}

/** Characters in a sort order: names A→Z, numbers high→low, newest first; ties by name. */
export function sortCharacters(list: Resource[], key: string): Resource[] {
  const byName = (a: Resource, b: Resource) => a.name.localeCompare(b.name)
  return [...list].sort((a, b) => {
    if (key === 'name') return byName(a, b)
    if (key === 'created') return (b.created_at || '').localeCompare(a.created_at || '') || byName(a, b)
    const value = (r: Resource) => (typeof r.attributes[key] === 'number' ? (r.attributes[key] as number) : -Infinity)
    return value(b) - value(a) || byName(a, b)
  })
}

/**
 * The Saga's characters, one section per category (DnD Lite: Players, DM characters, NPCs).
 * Clicking a character opens its sheet; "Edit" in the sheet opens the form.
 */
export default function CharactersPage() {
  const { sagaId, ruleset, isAdmin, saga, categories, refreshSaga } = useSaga()
  const navigate = useNavigate()
  const [characters, setCharacters] = useState<Resource[]>([])
  const [editing, setEditing] = useState<Resource | { categoryId: number } | null>(null)
  const [managing, setManaging] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)
  const [quick, setQuick] = useState<{ id: number; text: string } | null>(null)
  const [sort, setSortState] = useState(() => localStorage.getItem(SORT_KEY) || 'name')
  const types = ruleset.kinds.character?.types || {}

  const load = useCallback(() => api.resources(sagaId, 'character').then(setCharacters), [sagaId])
  useEffect(() => {
    void load()
  }, [load])

  const allAttributes = Object.values(types).flatMap((t) => t.attributes)
  const sorts = sortOptions(allAttributes.filter((a, i) => allAttributes.findIndex((b) => b.key === a.key) === i))
  const sortKey = sorts.some(([k]) => k === sort) ? sort : 'name'
  const setSort = (key: string) => {
    localStorage.setItem(SORT_KEY, key)
    setSortState(key)
  }

  const counterKey = (r: Resource) =>
    types[r.type]?.attributes.find((a) => a.type === 'counter' && r.attributes[a.key] !== undefined)?.key

  const applyQuick = async (r: Resource) => {
    const key = counterKey(r)
    const counter = key ? (r.attributes[key] as Counter) : null
    const value = quick && counter ? parseValueInput(quick.text, counter.current) : null
    setQuick(null)
    if (!key || value === null) return
    const updated = await api.changeCounter(sagaId, r.id, key, { current: value })
    setCharacters((list) => list.map((c) => (c.id === r.id ? updated : c)))
  }

  const mine = (r: Resource) => ((r.attributes.controllers as number[]) || []).includes(saga.me.member_id)
  const known = new Set(categories.map((c) => c.id))
  const sections = [
    ...categories.map((c) => ({ key: String(c.id), categoryId: c.id as number | null, title: c.plural || c.name, filter: (r: Resource) => r.category_id === c.id })),
    { key: 'other', categoryId: null, title: 'Other', filter: (r: Resource) => !known.has(r.category_id ?? -1) },
  ]
    .map((section) => {
      const list = sortCharacters(characters.filter(section.filter), sortKey)
      // Your own characters first, in the chosen order
      return { ...section, list: [...list.filter(mine), ...list.filter((c) => !mine(c))] }
    })
    .filter((s) => s.list.length > 0 || (isAdmin && s.categoryId !== null))

  const canEdit = (r: Resource) => isAdmin || r.editable.length > 0

  return (
    <div className="page">
      <header className="page-header">
        <h1>Characters</h1>
        {isAdmin && (
          <div className="button-row">
            <button onClick={() => setManaging(true)}>Categories</button>
            <button onClick={() => navigate(`/s/${sagaId}/characters/templates`)}>Display templates</button>
            <button className="primary" onClick={() => setEditing({ categoryId: categories[0]?.id })}>＋ New character</button>
          </div>
        )}
      </header>
      {characters.length > 0 && (
        <div className="list-toolbar">
          <span className="field-label">Sort</span>
          <Segmented value={sortKey} options={sorts} onChange={setSort} />
        </div>
      )}
      {characters.length === 0 && <p className="muted">{isAdmin ? 'No characters yet: create the party and their foes.' : 'Nothing to see yet.'}</p>}

      {characters.length > 0 && sections.map((section) => (
        <section key={section.key} className="character-section">
          <h2>
            {section.title} <span className="muted small">{section.list.length}</span>
            {isAdmin && section.categoryId !== null && (
              <button className="small ghost" onClick={() => setEditing({ categoryId: section.categoryId! })}>＋</button>
            )}
          </h2>
          {section.list.length === 0 && <p className="muted small">None yet.</p>}
          <div className="character-grid">
            {section.list.map((r) => {
              const portrait = r.attributes.portrait as ImageValue | undefined
              const key = counterKey(r)
              const counter = key ? (r.attributes[key] as Counter) : null
              const canQuick = key && r.editable.includes(key)
              const level = typeof r.attributes.level === 'number' ? r.attributes.level : null
              return (
                <motion.div layout key={r.id} className={`character-tile ${mine(r) ? 'mine' : ''}`} onClick={() => setViewing(r.id)}>
                  <Picture url={portrait?.url} mode="face" face={portrait?.face} className="tile-pic" />
                  <div className="tile-body">
                    <div className="tile-name">{r.name ?? '???'}</div>
                    <div className="muted small">
                      {categories.find((c) => c.id === r.category_id)?.name || types[r.type]?.name || r.type}
                      {level !== null ? ` · level ${level}` : ''}{mine(r) ? ' · yours' : ''}{isAdmin && r.instanceable ? ' · instanceable' : ''}
                    </div>
                    {counter && (
                      <div className="tile-hp" onClick={(e) => {
                        if (!canQuick) return
                        e.stopPropagation()
                        setQuick({ id: r.id, text: '' })
                      }}>
                        {quick?.id === r.id ? (
                          <input className="quick-input" autoFocus placeholder="-7, +3 or 15" value={quick.text}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setQuick({ id: r.id, text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void applyQuick(r)
                              if (e.key === 'Escape') setQuick(null)
                            }}
                            onBlur={() => setQuick(null)} />
                        ) : (
                          <Bar current={counter.current} max={counter.max} />
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </section>
      ))}

      <CharacterSheetModal
        sagaId={sagaId}
        resourceId={viewing}
        refreshKey={JSON.stringify(characters.find((c) => c.id === viewing)?.updated_at ?? '')}
        onClose={() => setViewing(null)}
        onEdit={(() => {
          const r = characters.find((c) => c.id === viewing)
          return r && canEdit(r) ? () => { setViewing(null); setEditing(r) } : undefined
        })()}
      />

      <Modal open={editing !== null} title={editing && 'id' in editing ? editing.name : 'New character'} onClose={() => setEditing(null)}>
        {editing !== null && (
          <CharacterForm
            key={'id' in editing ? editing.id : `new-${editing.categoryId}`}
            kind="character"
            resource={'id' in editing ? editing : undefined}
            categoryId={'id' in editing ? undefined : editing.categoryId}
            onDone={() => {
              setEditing(null)
              void load()
              if (isAdmin) void refreshSaga() // category counts
            }}
          />
        )}
      </Modal>

      <Modal open={managing} title="Categories" onClose={() => setManaging(false)}>
        {managing && <CategoriesManager />}
      </Modal>
    </div>
  )
}
