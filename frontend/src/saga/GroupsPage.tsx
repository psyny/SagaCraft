/**
 * Groups of characters (DM): the player parties, then the other groups (each planned encounter). Favorites first.
 * Each card shows every parameter and toggles in one click, and its color (its cards' turn highlight); instanceable
 * characters have a count (each becomes an instance on a Stage). See docs/concepts/characters.md.
 */
import { motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { CharacterGroup, ImageValue, Resource } from '../api/types'
import ColorPicker from '../components/ColorPicker'
import Modal from '../components/Modal'
import Picture from '../components/Picture'
import Popover, { anchorOf, type Anchor } from '../components/Popover'
import { useSaga } from './SagaContext'
import { CharacterSections } from './SectionTabs'

type Members = CharacterGroup['members']

function MemberPicker({ group, characters, onSave }: { group: CharacterGroup; characters: Resource[]; onSave: (members: Members) => void }) {
  const { categories } = useSaga()
  const [members, setMembers] = useState<Members>(group.members)
  const has = (id: number) => members.some((m) => m.resource_id === id)
  const toggle = (id: number) => setMembers(has(id) ? members.filter((m) => m.resource_id !== id) : [...members, { resource_id: id, count: 1 }])
  const sections = categories.map((c) => ({ category: c, list: characters.filter((r) => r.category_id === c.id) })).filter((s) => s.list.length)
  return (
    <>
      {characters.length === 0 && <p className="muted">No characters yet. Create them in the Characters tab.</p>}
      {sections.map(({ category, list }) => (
        <section key={category.id}>
          <h4>{category.plural}</h4>
          <div className="pick-grid">
            {list.map((c) => {
              const portrait = c.attributes.portrait as ImageValue | undefined
              return (
                <button key={c.id} type="button" className={`pick ${has(c.id) ? 'on' : ''}`} onClick={() => toggle(c.id)}>
                  <Picture url={portrait?.url} mode="face" face={portrait?.face} className="mini-pic" />
                  <span>{c.name}</span>
                  <span className="muted small">{c.instanceable ? 'instanceable' : ''}</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
      <div className="button-row end">
        <button className="primary" onClick={() => onSave(members)}>Save</button>
      </div>
    </>
  )
}

function GroupCard({ group, characters, onChange, onDelete }: {
  group: CharacterGroup
  characters: Resource[]
  onChange: (changes: Partial<CharacterGroup>) => Promise<void>
  onDelete: () => void
}) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [coloring, setColoring] = useState<Anchor | null>(null)
  const byId = new Map(characters.map((r) => [r.id, r]))
  const setCount = (resourceId: number, count: number) =>
    onChange({ members: group.members.map((m) => (m.resource_id === resourceId ? { ...m, count } : m)) })
  const remove = (resourceId: number) => onChange({ members: group.members.filter((m) => m.resource_id !== resourceId) })
  const total = group.members.reduce((n, m) => n + m.count, 0)

  return (
    <motion.div layout className={`group-card ${group.favorite ? 'favorite' : ''} ${group.active ? 'active' : ''}`}
      style={{ borderLeftColor: group.color }}>
      <header className="group-card-head">
        <button className="color-dot big" style={{ background: group.color }} aria-label={`Color of ${group.name}`} title="Color (its cards' turn highlight)"
          onClick={(e) => setColoring(anchorOf(e.currentTarget))} />
        {coloring && (
          <Popover anchor={coloring} onClose={() => setColoring(null)}>
            <ColorPicker label="Group color" value={group.color} onChange={(color) => { setColoring(null); void onChange({ color }) }} />
          </Popover>
        )}
        <button className={`star-toggle ${group.favorite ? 'on' : ''}`} aria-label={group.favorite ? 'Unfavorite' : 'Favorite'} title="Favorite"
          onClick={() => void onChange({ favorite: !group.favorite })}>★</button>
        {renaming !== null ? (
          <input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)}
            onBlur={() => {
              if (renaming.trim() && renaming !== group.name) void onChange({ name: renaming })
              setRenaming(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        ) : (
          <h3 onClick={() => setRenaming(group.name)} title="Click to rename">{group.name}</h3>
        )}
        <span className="muted small">{total} {total === 1 ? 'creature' : 'creatures'}</span>
      </header>
      <div className="group-flags">
        <button className={`chip ${group.player_party ? 'on' : ''}`} onClick={() => void onChange({ player_party: !group.player_party })}
          title="This group is the players' party">Player party</button>
        <button className={`chip ${group.active ? 'on' : ''}`} onClick={() => void onChange({ active: !group.active })}
          title="Active player parties come preselected when adding creatures to a scene">Active</button>
      </div>
      <div className="group-members">
        {group.members.length === 0 && <p className="muted small">No creatures yet.</p>}
        {group.members.map((m) => {
          const r = byId.get(m.resource_id)
          const portrait = r?.attributes.portrait as ImageValue | undefined
          return (
            <div key={m.resource_id} className="group-member">
              <Picture url={portrait?.url} mode="face" face={portrait?.face} className="mini-pic" />
              <span className="group-member-name">{r?.name ?? '?'}</span>
              {r?.instanceable && (
                <span className="stepper">
                  <button className="small" aria-label={`Fewer ${r.name}`} disabled={m.count <= 1} onClick={() => void setCount(m.resource_id, m.count - 1)}>−</button>
                  <span>×{m.count}</span>
                  <button className="small" aria-label={`More ${r.name}`} onClick={() => void setCount(m.resource_id, m.count + 1)}>＋</button>
                </span>
              )}
              <button className="small ghost" aria-label={`Remove ${r?.name ?? ''}`} onClick={() => void remove(m.resource_id)}>✕</button>
            </div>
          )
        })}
      </div>
      <footer className="button-row">
        <button className="small" onClick={() => setPicking(true)}>＋ Add creatures</button>
        <button className="small ghost danger" onClick={() => window.confirm(`Delete the group "${group.name}"? Its characters stay.`) && onDelete()}>Delete</button>
      </footer>
      <Modal open={picking} wide title={`Creatures in ${group.name}`} onClose={() => setPicking(false)}>
        {picking && (
          <MemberPicker group={group} characters={characters} onSave={(members) => {
            setPicking(false)
            void onChange({ members })
          }} />
        )}
      </Modal>
    </motion.div>
  )
}

export default function GroupsPage() {
  const { sagaId, isAdmin } = useSaga()
  const [groups, setGroups] = useState<CharacterGroup[] | null>(null)
  const [characters, setCharacters] = useState<Resource[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [list, chars] = await Promise.all([api.characterGroups(sagaId), api.resources(sagaId, 'character')])
    setGroups(list)
    setCharacters(chars)
  }, [sagaId])
  useEffect(() => {
    if (isAdmin) load().catch((e: Error) => setError(e.message))
  }, [isAdmin, load])

  if (!isAdmin) return <div className="page-message">Only the Saga's admins manage groups.</div>

  const run = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
      setGroups(await api.characterGroups(sagaId)) // the server keeps favorites first
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Characters</h1>
        <button className="primary" onClick={() => void run(() => api.createCharacterGroup(sagaId, { name: 'New group' }))}>＋ New group</button>
      </header>
      <CharacterSections />
      <p className="muted small section-blurb">The party and your encounters. Put a whole group on a scene in one click.</p>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      {groups?.length === 0 && <p className="muted">No groups yet: make one for the party and one per encounter you plan.</p>}
      {groups && groups.length > 0 && ([
        ['Player parties', groups.filter((g) => g.player_party), 'Mark a group as a player party to see it here.'],
        ['Other groups', groups.filter((g) => !g.player_party), 'Encounters, courts, crews: anyone who goes together.'],
      ] as const).map(([title, list, empty]) => (
        <section key={title} className="page-section">
          <h2>{title}</h2>
          {list.length === 0 && <p className="muted small">{empty}</p>}
          <div className="group-grid">
            {list.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                characters={characters}
                onChange={(changes) => run(() => api.updateCharacterGroup(sagaId, g.id, changes))}
                onDelete={() => void run(() => api.deleteCharacterGroup(sagaId, g.id))}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
