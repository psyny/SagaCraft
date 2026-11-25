import { motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Counter, ImageValue, Resource } from '../api/types'
import Modal from '../components/Modal'
import Picture from '../components/Picture'
import { Bar } from '../stage/sets/actorsScene/AttributeDisplays'
import { parseValueInput } from '../stage/sets/actorsScene/layout'
import CharacterForm from './CharacterForm'
import { useSaga } from './SagaContext'
import CharacterSheetModal from './sheet/CharacterSheet'

const SORT_KEY = 'sagacraft.characterSort'

/** Sort keys: name and date created always, plus every number, counter and calculated variable (plan 38). */
export function sortOptions(attributes: { key: string; name: string; type: string }[]): [string, string][] {
  const numbers = attributes.filter((a) => ['number', 'counter', 'calculated'].includes(a.type))
  return [['name', 'Name'], ...numbers.map((a) => [a.key, a.name] as [string, string]), ['created', 'Date created']]
}

/** A value to sort by: a number, a counter's current value. */
const sortNumber = (raw: unknown): number => {
  const value = raw !== null && typeof raw === 'object' && 'current' in raw ? (raw as { current: unknown }).current : raw
  return typeof value === 'number' ? value : -Infinity
}

/** Characters in a sort order: names A→Z, numbers high→low, newest first; ties by name. */
export function sortCharacters(list: Resource[], key: string): Resource[] {
  const byName = (a: Resource, b: Resource) => a.name.localeCompare(b.name)
  return [...list].sort((a, b) => {
    if (key === 'name') return byName(a, b)
    if (key === 'created') return (b.created_at || '').localeCompare(a.created_at || '') || byName(a, b)
    const value = (r: Resource) => sortNumber(r.attributes[key])
    return (value(b) === value(a) ? 0 : value(b) > value(a) ? 1 : -1) || byName(a, b)
  })
}

/**
 * The Saga's characters, one section per type (DnD Lite: Players, Major NPCs, Minor NPCs).
 * Clicking a character opens its editor when this member may edit it (its sheet is one click away there), else its
 * sheet.
 */
export default function CharactersPage() {
  const { sagaId, ruleset, isAdmin, saga, characterTypes } = useSaga()
  const [characters, setCharacters] = useState<Resource[]>([])
  const [editing, setEditing] = useState<Resource | { typeKey: string } | null>(null)
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
  // One section per character type (plan 40: what the categories were)
  const known = new Set(characterTypes.map((t) => t.key))
  const sections = [
    ...characterTypes.map((t) => ({ key: t.key, typeKey: t.key as string | null, title: t.plural || t.name, filter: (r: Resource) => r.type === t.key })),
    { key: '__other', typeKey: null, title: 'Other', filter: (r: Resource) => !known.has(r.type) },
  ]
    .map((section) => {
      const list = sortCharacters(characters.filter(section.filter), sortKey)
      // Your own characters first, in the chosen order
      return { ...section, list: [...list.filter(mine), ...list.filter((c) => !mine(c))] }
    })
    .filter((s) => s.list.length > 0 || (isAdmin && s.typeKey !== null))

  // The DM; whoever may change a variable; its players (they style its token, share it)
  const canEdit = (r: Resource) => isAdmin || r.editable.length > 0 || r.presentation !== undefined

  return (
    <div className="page">
      <header className="page-header">
        <h1>Characters</h1>
        {isAdmin && (
          <div className="button-row">
            <Link className="button-link" to={`/s/${sagaId}/saga/template?sub=types`} title="Add, rename and set up character types (Saga → Template → Characters → Types)">Types</Link>
            <button className="primary" onClick={() => setEditing({ typeKey: characterTypes[0]?.key ?? '' })}>＋ New character</button>
          </div>
        )}
      </header>
      {characters.length > 0 && (
        <div className="list-toolbar">
          <span className="field-label">Sort</span>
          <select value={sortKey} aria-label="Sort" onChange={(e) => setSort(e.target.value)}>
            {sorts.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </div>
      )}
      {characters.length === 0 && <p className="muted">{isAdmin ? 'No characters yet: create the party and their foes.' : 'Nothing to see yet.'}</p>}

      {characters.length > 0 && sections.map((section) => (
        <section key={section.key} className="character-section">
          <h2>
            {section.title} <span className="muted small">{section.list.length}</span>
            {isAdmin && section.typeKey !== null && (
              <button className="small ghost" onClick={() => setEditing({ typeKey: section.typeKey! })}>＋</button>
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
                <motion.div layout key={r.id} className={`character-tile ${mine(r) ? 'mine' : ''}`} onClick={() => (canEdit(r) ? setEditing(r) : setViewing(r.id))}>
                  <Picture url={portrait?.url} mode="face" face={portrait?.face} className="tile-pic" />
                  <div className="tile-body">
                    <div className="tile-name">{r.name ?? '???'}</div>
                    <div className="muted small">
                      {types[r.type]?.name || r.type}
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

      <Modal open={editing !== null} full title={editing && 'id' in editing ? editing.name : 'New character'} onClose={() => setEditing(null)}
        actions={editing && 'id' in editing ? <button className="small" onClick={() => setViewing(editing.id)} title="Its sheet, as it shows">❏ Sheet</button> : undefined}>
        {editing !== null && (
          <CharacterForm
            tabbed
            key={'id' in editing ? editing.id : `new-${editing.typeKey}`}
            kind="character"
            resource={'id' in editing ? editing : undefined}
            typeKey={'id' in editing ? undefined : editing.typeKey}
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
