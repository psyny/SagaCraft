/**
 * Add creatures to the scene (every tab has them): groups on top (active player parties first and preselected,
 * then favorites), characters below by category. Adding a group is a one-time shortcut for adding its creatures
 * one by one: instanceable ones come as new instances (as many as the group's count); characters already in the
 * scene are not added twice. "Add and reveal" reveals them in the tab being built (or played) only.
 */
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../api'
import type { CharacterGroup, Resource } from '../../../api/types'
import Picture from '../../../components/Picture'
import { useSaga } from '../../../saga/SagaContext'
import type { StageEditor } from '../../types'
import type { ActorsSceneContent, SceneTab } from './types'

const portraitOf = (r: Resource | undefined) => r?.attributes.portrait as { url?: string; face?: { x: number; y: number; size: number } } | undefined

export default function AddCreatures({ setId, content, tab, editor, onClose }: {
  setId: number
  content: ActorsSceneContent
  tab: SceneTab
  editor: StageEditor
  onClose: () => void
}) {
  const { categories } = useSaga()
  const [characters, setCharacters] = useState<Resource[]>([])
  const [groups, setGroups] = useState<CharacterGroup[]>([])
  const [pickedGroups, setPickedGroups] = useState<number[]>([])
  const [picked, setPicked] = useState<Record<number, number>>({}) // resource id -> how many (instances)
  const [loaded, setLoaded] = useState(false)

  // Characters (not instances) already in the scene: adding them again only reveals them ("Add and reveal")
  const inTab = useMemo(() => new Set(content.cards.filter((c) => !c.instance).map((c) => c.resource_id)), [content.cards])

  useEffect(() => {
    Promise.all([api.resources(editor.sagaId, 'character'), api.characterGroups(editor.sagaId)])
      .then(([list, groupList]) => {
        setCharacters(list)
        const ordered = [...groupList].sort((a, b) => Number(b.player_party && b.active) - Number(a.player_party && a.active))
        setGroups(ordered)
        const byId = new Map(list.map((r) => [r.id, r]))
        // The active player parties come preselected, unless they're all here already
        setPickedGroups(ordered.filter((g) => g.player_party && g.active && g.members.some((m) => !inTab.has(m.resource_id) || byId.get(m.resource_id)?.instanceable)).map((g) => g.id))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.sagaId])

  const byId = new Map(characters.map((r) => [r.id, r]))
  const count = (r: Resource) => picked[r.id] ?? 0
  const toggle = (r: Resource) => setPicked((p) => {
    const next = { ...p }
    if (next[r.id]) delete next[r.id]
    else next[r.id] = 1
    return next
  })
  const bump = (r: Resource, by: number) => setPicked((p) => {
    const value = Math.max(0, Math.min(50, (p[r.id] ?? 0) + by))
    const next = { ...p }
    if (value) next[r.id] = value
    else delete next[r.id]
    return next
  })
  const resourceIds = Object.entries(picked).flatMap(([id, n]) => Array.from({ length: n }, () => Number(id)))
  const total = resourceIds.length + pickedGroups.length

  const add = async (hidden: boolean) => {
    await editor.run(() => api.addActors(editor.sagaId, setId, { resource_ids: resourceIds, group_ids: pickedGroups, tab_id: tab.id, hidden }))
    onClose()
  }

  const sections = categories.map((c) => ({ category: c, list: characters.filter((r) => r.category_id === c.id) }))
    .filter((s) => s.list.length)
  const other = characters.filter((r) => !categories.some((c) => c.id === r.category_id))

  return (
    <div className="add-creatures">
      <p className="muted small">Every tab gets them; “Add and reveal” shows them to players in <strong>{tab.name}</strong>.</p>
      {loaded && characters.length === 0 && <p className="muted">No characters yet. Create them in the Characters tab.</p>}

      {groups.length > 0 && (
        <section>
          <h4>Groups</h4>
          <div className="pick-groups">
            {groups.map((g) => {
              const on = pickedGroups.includes(g.id)
              return (
                <button key={g.id} type="button" className={`pick-group ${on ? 'on' : ''}`}
                  onClick={() => setPickedGroups(on ? pickedGroups.filter((x) => x !== g.id) : [...pickedGroups, g.id])}>
                  <span className="pick-group-name">
                    <span className="color-dot" style={{ background: g.color }} />
                    {g.favorite && <span className="star">★</span>}{g.name}
                    {g.player_party && g.active && <span className="badge">party</span>}
                  </span>
                  <span className="pick-group-faces">
                    {g.members.slice(0, 6).map((m) => {
                      const r = byId.get(m.resource_id)
                      const p = portraitOf(r)
                      return (
                        <span key={m.resource_id} className="face-chip" title={`${r?.name ?? '?'}${m.count > 1 ? ` × ${m.count}` : ''}`}>
                          <Picture url={p?.url} mode="face" face={p?.face} className="micro-pic" />
                          {m.count > 1 && <span className="face-count">×{m.count}</span>}
                        </span>
                      )
                    })}
                    {g.members.length === 0 && <span className="muted small">empty</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {[...sections, ...(other.length ? [{ category: null, list: other }] : [])].map(({ category, list }) => (
        <section key={category?.id ?? 'other'}>
          <h4>{category ? category.plural : 'Other'}</h4>
          <div className="pick-grid">
            {list.map((c) => {
              const p = portraitOf(c)
              const n = count(c)
              return (
                <div key={c.id} className={`pick ${n ? 'on' : ''}`}>
                  <button type="button" className="pick-main" onClick={() => toggle(c)}>
                    <Picture url={p?.url} mode="face" face={p?.face} className="mini-pic" />
                    <span>{c.name}</span>
                    <span className="muted small">
                      {c.instanceable ? 'new instance' : inTab.has(c.id) ? 'already here' : ''}
                    </span>
                  </button>
                  {c.instanceable && n > 0 && (
                    <span className="stepper">
                      <button type="button" className="small" aria-label={`Fewer ${c.name}`} onClick={() => bump(c, -1)}>−</button>
                      <span>×{n}</span>
                      <button type="button" className="small" aria-label={`More ${c.name}`} onClick={() => bump(c, 1)}>＋</button>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <div className="button-row end">
        <button disabled={!total} onClick={() => add(false)}>Add and reveal in “{tab.name}”</button>
        <button className="primary" disabled={!total} onClick={() => add(true)}>Add hidden</button>
      </div>
    </div>
  )
}
