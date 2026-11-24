/**
 * Groups of characters (DM): the player parties, then the other groups (each planned encounter). Favorites first.
 * Each card shows its creatures (instanceable ones have a count: each becomes an instance on a Stage) and its values;
 * Edit opens the group's editor: its name, colour (its cards' turn highlight), Player party, Active, Favorite, and the
 * Saga template's group variables. See docs/concepts/characters.md.
 */
import { motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { AttributeDef, CharacterGroup, Counter, ImageValue, Resource } from '../api/types'
import ColorPicker from '../components/ColorPicker'
import Modal from '../components/Modal'
import Picture from '../components/Picture'
import ActionsPanel from './ActionsPanel'
import { AttributeField } from './CharacterForm'
import { useSaga } from './SagaContext'

type Members = CharacterGroup['members']

function MemberPicker({ group, characters, onSave }: { group: CharacterGroup; characters: Resource[]; onSave: (members: Members) => void }) {
  const { characterTypes } = useSaga()
  const [members, setMembers] = useState<Members>(group.members)
  const has = (id: number) => members.some((m) => m.resource_id === id)
  const toggle = (id: number) => setMembers(has(id) ? members.filter((m) => m.resource_id !== id) : [...members, { resource_id: id, count: 1 }])
  const sections = characterTypes.map((t) => ({ type: t, list: characters.filter((r) => r.type === t.key) })).filter((s) => s.list.length)
  return (
    <>
      {characters.length === 0 && <p className="muted">No characters yet. Create them in the Characters tab.</p>}
      {sections.map(({ type, list }) => (
        <section key={type.key}>
          <h4>{type.plural}</h4>
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

/** Pure: a group's values for its variables, the variables' defaults where it has none. */
export function groupValues(group: Pick<CharacterGroup, 'attributes'>, variables: AttributeDef[]): Record<string, unknown> {
  return Object.fromEntries(variables.map((v) => [v.key, group.attributes?.[v.key] ?? v.default ?? null]))
}

/** A value, short, for the card. */
function shown(attr: AttributeDef, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (attr.type === 'counter') { const c = value as Counter; return `${c.current} / ${c.max}` }
  if (attr.type === 'boolean') return value ? 'Yes' : 'No'
  if (attr.type === 'rich_text') return String(value).length > 60 ? `${String(value).slice(0, 60)}…` : String(value)
  return typeof value === 'object' ? null : String(value)
}

/** The group's editor: the system variables (name, colour, Player party, Active, Favorite), the template's, and
 * the template's actions on groups. */
function GroupEditor({ group, variables, error, onSave, onRan, onClose }: {
  group: CharacterGroup
  variables: AttributeDef[]
  /** Why the last save failed (the server's check). */
  error: string
  onSave: (changes: Partial<CharacterGroup>) => Promise<boolean>
  /** An action ran: its values (and its characters') changed. */
  onRan: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState({
    name: group.name, color: group.color, player_party: group.player_party, active: group.active, favorite: group.favorite,
  })
  const [values, setValues] = useState(() => groupValues(group, variables))
  // Only the values changed here are saved: an action may have changed the others meanwhile
  const [touched, setTouched] = useState<Set<string>>(new Set())
  useEffect(() => {
    setValues((current) => ({ ...groupValues(group, variables), ...Object.fromEntries([...touched].map((k) => [k, current[k]])) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.attributes])
  const [saving, setSaving] = useState(false)
  const set = (changes: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...changes }))
  const save = async () => {
    setSaving(true)
    const attributes = Object.fromEntries([...touched].map((k) => [k, values[k]]))
    const ok = await onSave({ ...draft, name: draft.name.trim() || group.name, ...(touched.size ? { attributes } : {}) })
    setSaving(false)
    if (ok) onClose()
  }
  return (
    <div className="form group-editor">
      <section>
        <h3>Group</h3>
        <label>Name<input value={draft.name} autoFocus onChange={(e) => set({ name: e.target.value })} /></label>
        <div className="field">
          <span className="field-label">Color <span className="muted small">(its cards' turn highlight, "group" coloured values)</span></span>
          <ColorPicker label="Group color" value={draft.color} onChange={(color) => set({ color })} />
        </div>
        <label className="check"><input type="checkbox" checked={draft.player_party} onChange={(e) => set({ player_party: e.target.checked })} />
          Player party <span className="muted small">(the players' party)</span></label>
        <label className="check"><input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
          Active <span className="muted small">(active player parties come preselected when adding creatures to a scene)</span></label>
        <label className="check"><input type="checkbox" checked={draft.favorite} onChange={(e) => set({ favorite: e.target.checked })} />
          Favorite <span className="muted small">(first in the lists)</span></label>
      </section>
      <section>
        <h3>Variables</h3>
        {variables.length === 0 && <p className="muted small">No group variables yet: add them in Saga → Template → Groups.</p>}
        {variables.map((attr) => (
          <AttributeField key={attr.key} attr={attr} kind="group" value={values[attr.key]} disabled={false}
            onChange={(v) => { setValues((current) => ({ ...current, [attr.key]: v })); setTouched((t) => new Set(t).add(attr.key)) }}
            onMain={() => undefined} />
        ))}
      </section>
      <section>
        <h3>Actions</h3>
        <ActionsPanel groupId={group.id} onRan={onRan} />
      </section>
      {error && <div className="error">{error}</div>}
      <div className="button-row end">
        <button className="ghost" onClick={onClose}>Cancel</button>
        <button className="primary" disabled={saving} onClick={() => void save()}>Save</button>
      </div>
    </div>
  )
}

function GroupCard({ group, characters, variables, hasActions, error, onChange, onRan, onDelete }: {
  group: CharacterGroup
  characters: Resource[]
  variables: AttributeDef[]
  /** The template has actions on groups (a party's long rest). */
  hasActions: boolean
  error: string
  onChange: (changes: Partial<CharacterGroup>) => Promise<boolean>
  onRan: () => void
  onDelete: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState(false)
  const [acting, setActing] = useState(false)
  const byId = new Map(characters.map((r) => [r.id, r]))
  const setCount = (resourceId: number, count: number) =>
    onChange({ members: group.members.map((m) => (m.resource_id === resourceId ? { ...m, count } : m)) })
  const remove = (resourceId: number) => onChange({ members: group.members.filter((m) => m.resource_id !== resourceId) })
  const total = group.members.reduce((n, m) => n + m.count, 0)
  const values = groupValues(group, variables)
  const filled = variables.map((v) => [v, shown(v, values[v.key])] as const).filter(([, text]) => text !== null)

  return (
    <motion.div layout className={`group-card ${group.favorite ? 'favorite' : ''} ${group.active ? 'active' : ''}`}
      style={{ borderLeftColor: group.color }}>
      <header className="group-card-head">
        <span className="color-dot big" style={{ background: group.color }} />
        {group.favorite && <span className="star-toggle on" title="Favorite" aria-label="Favorite">★</span>}
        <h3>{group.name}</h3>
        {group.active && <span className="chip on small" title="Active: preselected when adding creatures to a scene">Active</span>}
        <span className="muted small">{total} {total === 1 ? 'creature' : 'creatures'}</span>
      </header>
      {filled.length > 0 && (
        <dl className="group-values">
          {filled.map(([v, text]) => (
            <div key={v.key}><dt>{v.name}</dt><dd>{text}</dd></div>
          ))}
        </dl>
      )}
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
        <button className="small" onClick={() => setEditing(true)}>✎ Edit</button>
        {hasActions && <button className="small" onClick={() => setActing(true)} title="Run an action on the group (a long rest)">⚡ Actions</button>}
        <span className="spacer" />
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
      <Modal open={editing} title={group.name} onClose={() => setEditing(false)}>
        {editing && <GroupEditor group={group} variables={variables} error={error} onSave={onChange} onRan={onRan} onClose={() => setEditing(false)} />}
      </Modal>
      <Modal open={acting} title={`${group.name}: actions`} onClose={() => setActing(false)}>
        {acting && <ActionsPanel groupId={group.id} onRan={onRan} />}
      </Modal>
    </motion.div>
  )
}

export default function GroupsPage() {
  const { sagaId, isAdmin, ruleset } = useSaga()
  const variables = ruleset.group_attributes ?? []
  const hasActions = (ruleset.actions ?? []).some((a) => a.on === 'group')
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

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setError('')
    try {
      await action()
      setGroups(await api.characterGroups(sagaId)) // the server keeps favorites first
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Groups</h1>
        <button className="primary" onClick={() => void run(() => api.createCharacterGroup(sagaId, { name: 'New group' }))}>＋ New group</button>
      </header>
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
                variables={variables}
                hasActions={hasActions}
                error={error}
                onChange={(changes) => run(() => api.updateCharacterGroup(sagaId, g.id, changes))}
                onRan={() => void load().catch(() => undefined)}
                onDelete={() => void run(() => api.deleteCharacterGroup(sagaId, g.id))}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
