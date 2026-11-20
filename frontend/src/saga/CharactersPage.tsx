import { motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Counter, ImageValue, Resource } from '../api/types'
import Modal from '../components/Modal'
import Picture from '../components/Picture'
import Segmented from '../components/Segmented'
import { Bar } from '../stage/sets/creaturePanel/AttributeDisplays'
import { parseValueInput } from '../stage/sets/creaturePanel/layout'
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
 * The Saga's characters, one section per character type of the ruleset (DnD Lite: Players, NPCs).
 * Clicking a character opens its sheet; "Edit" in the sheet opens the form.
 */
export default function CharactersPage() {
  const { sagaId, ruleset, isAdmin, saga } = useSaga()
  const navigate = useNavigate()
  const [characters, setCharacters] = useState<Resource[]>([])
  const [editing, setEditing] = useState<Resource | 'new' | null>(null)
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
  const sections = Object.entries(types)
    .map(([key, type]) => {
      const list = sortCharacters(characters.filter((c) => c.type === key), sortKey)
      // Your own characters first, in the chosen order
      return { key, title: type.plural || type.name, list: [...list.filter(mine), ...list.filter((c) => !mine(c))] }
    })
    .filter((s) => s.list.length > 0 || isAdmin)

  const canEdit = (r: Resource) => isAdmin || r.editable.length > 0

  return (
    <div className="page">
      <header className="page-header">
        <h1>Characters</h1>
        {isAdmin && (
          <div className="button-row">
            <button onClick={() => navigate(`/s/${sagaId}/characters/templates`)}>Display templates</button>
            <button className="primary" onClick={() => setEditing('new')}>＋ New character</button>
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
          <h2>{section.title} <span className="muted small">{section.list.length}</span></h2>
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
                      {types[r.type]?.name || r.type}{level !== null ? ` · level ${level}` : ''}{mine(r) ? ' · yours' : ''}
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

      <Modal open={editing !== null} title={editing === 'new' ? 'New character' : editing ? editing.name : ''} onClose={() => setEditing(null)}>
        {editing !== null && (
          <CharacterForm
            key={editing === 'new' ? 'new' : editing.id}
            kind="character"
            resource={editing === 'new' ? undefined : editing}
            onDone={() => {
              setEditing(null)
              void load()
            }}
          />
        )}
      </Modal>
    </div>
  )
}
