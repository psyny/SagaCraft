/**
 * A resource's relationships, read from its side ("killed → Bram", "child of ← Aldric"), with who knows each
 * (its group), dates, note and the creator's mark; add one in a few clicks. The DM reveals one to a group.
 * Shown on resource pages (the Relationships button) and the Lore tab.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import type { Relationship } from '../../api/types'
import Modal from '../../components/Modal'
import { useSaga } from '../SagaContext'
import { formatSpan } from './dates'
import RelationshipForm from './RelationshipForm'
import { groupLabel, readFrom, resourcePath, writableGroups } from './relationships'

type Subject = { id: number; name: string; kind: string }

/** A small mark for who added it: the DM (◆) or a player (●, with their name). */
export function CreatorMark({ rel }: { rel: Relationship }) {
  const { saga } = useSaga()
  const who = saga.members.find((m) => m.id === rel.created_by.member_id)?.display_name
  return rel.created_by.role === 'admin'
    ? <span className="creator-mark dm" title={`Added by the DM${who ? ` (${who})` : ''}`}>◆</span>
    : <span className="creator-mark player" title={`Added by ${who ?? 'a player'}`}>● {who}</span>
}

export function RevealMenu({ rel, onDone }: { rel: Relationship; onDone: () => void }) {
  const { sagaId, saga } = useSaga()
  const targets = saga.groups.filter((g) => g.id !== rel.group_id && g.key !== 'admins')
  if (!targets.length) return null
  return (
    <select className="small" value="" aria-label="Reveal to" title="Reveal: copy it into a group (what they now know)"
      onChange={(e) => e.target.value && void api.revealRelationship(sagaId, rel.id, Number(e.target.value)).then(onDone)}>
      <option value="">Reveal to…</option>
      {targets.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
    </select>
  )
}

export default function RelationshipsPanel({ subject }: { subject: Subject }) {
  const { sagaId, saga, isAdmin } = useSaga()
  const [list, setList] = useState<Relationship[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Relationship | null>(null)
  const [error, setError] = useState('')
  const canWrite = writableGroups(saga).length > 0
  const groupCount = new Set((list || []).map((r) => r.group_id)).size

  const load = useCallback(() => {
    api.relationships(sagaId, { resource_id: subject.id }).then(setList).catch((e: Error) => setError(e.message))
  }, [sagaId, subject.id])
  useEffect(load, [load])

  const remove = (rel: Relationship) => window.confirm('Delete this relationship?')
    && void api.deleteRelationship(sagaId, rel.id).then(load).catch((e: Error) => setError(e.message))

  return (
    <div className="rel-panel">
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      {list && list.length === 0 && !adding && <p className="muted small">No relationships yet.</p>}
      <ul className="rel-list">
        {(list || []).map((rel) => {
          const { verb, other } = readFrom(rel, subject.id)
          const path = resourcePath(sagaId, other.kind, other.id)
          const span = formatSpan(saga.calendar, rel.start, rel.end)
          return (
            <li key={rel.id} className="rel-row">
              <span className="rel-verb">{verb}</span>
              {path ? <Link to={path}>{other.name}</Link> : <span className={other.hidden ? 'muted' : ''}>{other.name ?? 'someone unknown'}</span>}
              {span && <span className="muted small">{span}</span>}
              {rel.note && <span className="muted small rel-note">“{rel.note}”</span>}
              <span className="spacer" />
              {(isAdmin || groupCount > 1) && <span className="chip small" title="Who knows it">{groupLabel(saga, rel.group_id, rel.group_name)}</span>}
              <CreatorMark rel={rel} />
              {isAdmin && <RevealMenu rel={rel} onDone={load} />}
              {rel.editable && <button className="small ghost" onClick={() => setEditing(rel)} aria-label="Edit">✎</button>}
              {rel.editable && <button className="small ghost danger" onClick={() => remove(rel)} aria-label="Delete">✕</button>}
            </li>
          )
        })}
      </ul>
      {canWrite && (adding
        ? <RelationshipForm from={{ id: subject.id, name: subject.name, kind: subject.kind }} onDone={(made) => { setAdding(false); if (made) load() }} />
        : <button className="small" onClick={() => setAdding(true)}>＋ Relationship</button>)}
      <Modal open={editing !== null} title="Relationship" onClose={() => setEditing(null)}>
        {editing && <RelationshipForm existing={editing} onDone={(saved) => { setEditing(null); if (saved) load() }} />}
      </Modal>
    </div>
  )
}

/** A header button opening the resource's relationships. */
export function RelationshipsButton({ subject }: { subject: Subject }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="small" onClick={() => setOpen(true)} title="Who and what it's linked to">⟷ Relationships</button>
      <Modal open={open} title={`${subject.name}: relationships`} onClose={() => setOpen(false)}>
        {open && <RelationshipsPanel subject={subject} />}
      </Modal>
    </>
  )
}
