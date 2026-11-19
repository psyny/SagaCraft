import { motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { Counter, ImageValue, Resource } from '../api/types'
import Modal from '../components/Modal'
import Picture from '../components/Picture'
import { Bar } from '../stage/sets/creaturePanel/AttributeDisplays'
import { parseValueInput } from '../stage/sets/creaturePanel/layout'
import CharacterForm from './CharacterForm'
import { useSaga } from './SagaContext'

export default function CharactersPage() {
  const { sagaId, ruleset, isAdmin, saga } = useSaga()
  const [characters, setCharacters] = useState<Resource[]>([])
  const [editing, setEditing] = useState<Resource | 'new' | null>(null)
  const [quick, setQuick] = useState<{ id: number; text: string } | null>(null)
  const types = ruleset.kinds.character?.types || {}

  const load = useCallback(() => api.resources(sagaId, 'character').then(setCharacters), [sagaId])
  useEffect(() => {
    void load()
  }, [load])

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
  const sorted = [...characters].sort((a, b) => Number(mine(b)) - Number(mine(a)) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name))

  return (
    <div className="page">
      <header className="page-header">
        <h1>Characters</h1>
        {isAdmin && <button className="primary" onClick={() => setEditing('new')}>＋ New character</button>}
      </header>
      {characters.length === 0 && <p className="muted">{isAdmin ? 'No characters yet: create the party and their foes.' : 'Nothing to see yet.'}</p>}
      <div className="character-grid">
        {sorted.map((r) => {
          const portrait = r.attributes.portrait as ImageValue | undefined
          const key = counterKey(r)
          const counter = key ? (r.attributes[key] as Counter) : null
          const canQuick = key && r.editable.includes(key)
          return (
            <motion.div layout key={r.id} className={`character-tile ${mine(r) ? 'mine' : ''}`} onClick={() => setEditing(r)}>
              <Picture url={portrait?.url} mode="face" face={portrait?.face} className="tile-pic" />
              <div className="tile-body">
                <div className="tile-name">{r.name}</div>
                <div className="muted small">{types[r.type]?.name || r.type}{mine(r) ? ' · yours' : ''}</div>
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
