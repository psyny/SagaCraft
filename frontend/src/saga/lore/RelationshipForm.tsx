/**
 * Add (or edit) a relationship in seconds: type (recent first; typing a new label makes the group's own type) →
 * the other resource (search; the DM can make a missing one by name) → done. Group, dates and note are optional:
 * the last group used, "always" for both dates. From an event, it starts at that event. See
 * docs/concepts/relationships.md ("Creating relationships").
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../../api'
import type { Endpoint, Relationship, RelationshipBody, RelationshipType } from '../../api/types'
import ResourcePicker from '../../components/ResourcePicker'
import { useSaga } from '../SagaContext'
import DateInput from './DateInput'
import { formatDate } from './dates'
import { defaultGroup, KIND_NAMES, recentTypes, rememberGroup, rememberType, sagaKinds, suggestTypes, writableGroups } from './relationships'

type End = { id: number; name: string; kind: string | null }

interface Props {
  /** The resource it starts from (fixed), e.g. the page it's added on. */
  from?: End
  /** The other end, already known (dragging node to node). */
  to?: End
  /** Starts at this event (its relationship sub-event): no dates to pick. */
  event?: { id: number; date: number | null; name: string }
  existing?: Relationship
  onDone: (rel: Relationship | null) => void
}

const endOf = (e: Endpoint): End | undefined => (e.id ? { id: e.id, name: e.name ?? '???', kind: e.kind } : undefined)

export default function RelationshipForm({ from: fixedFrom, to: givenTo, event, existing, onDone }: Props) {
  const { sagaId, saga, ruleset, isAdmin, categories } = useSaga()
  const groups = writableGroups(saga)
  const [types, setTypes] = useState<RelationshipType[]>([])
  const [from, setFrom] = useState<End | undefined>(fixedFrom ?? (existing ? endOf(existing.from) : undefined))
  const [to, setTo] = useState<End | undefined>(givenTo ?? (existing ? endOf(existing.to) : undefined))
  const [groupId, setGroupId] = useState<number | null>(existing?.group_id ?? defaultGroup(sagaId, saga))
  const [typeRef, setTypeRef] = useState<string | null>(existing?.type.ref ?? null)
  const [query, setQuery] = useState(existing?.type.label ?? '')
  const [newType, setNewType] = useState({ directed: true, inverse: '' })
  const [start, setStart] = useState<number | null>(existing?.start ?? null)
  const [end, setEnd] = useState<number | null>(existing?.end ?? null)
  const [note, setNote] = useState(existing?.note ?? '')
  const [more, setMore] = useState(Boolean(existing && (existing.start !== null || existing.end !== null || existing.note)))
  const [picking, setPicking] = useState<'from' | 'to' | null>(null)
  const [making, setMaking] = useState<{ name: string; kind: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.relationshipTypes(sagaId).then(setTypes).catch(() => setTypes([])) }, [sagaId])
  const suggestions = useMemo(() => suggestTypes(types, typeRef ? '' : query, groupId, recentTypes(sagaId), from?.kind, to?.kind),
    [types, query, typeRef, groupId, sagaId, from?.kind, to?.kind])
  const picked = types.find((t) => t.ref === typeRef)
  const exact = types.find((t) => (t.predefined || t.group_id === groupId) && t.label.toLowerCase() === query.trim().toLowerCase())
  const kinds = sagaKinds(ruleset)

  if (!groups.length) return <p className="muted">Viewers only read relationships.</p>

  const makeResource = async () => {
    if (!making?.name.trim()) return
    try {
      const kind = making.kind
      const typeKeys = Object.keys(ruleset.kinds[kind]?.types || {})
      const made = await api.createResource(sagaId, {
        kind, ...(kind === 'character' ? { category_id: categories.find((c) => !c.player)?.id ?? categories[0]?.id } : { type: typeKeys[0] }),
        attributes: { name: making.name.trim() },
      })
      setTo({ id: made.id, name: made.name, kind: made.kind })
      setMaking(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!from || !to) return setError('Pick both resources')
    const label = query.trim()
    const type: RelationshipBody['type'] = typeRef ?? exact?.ref ?? (label ? { label, directed: newType.directed, inverse: newType.inverse } : undefined)
    if (!type || groupId === null) return setError('Pick a type')
    const body: RelationshipBody = { group_id: groupId, from_id: from.id, to_id: to.id, type, note }
    if (event) body.event_id = event.id
    else { body.start = start; body.end = end }
    setBusy(true)
    try {
      const saved = existing
        ? await api.updateRelationship(sagaId, existing.id, existing.event_id && !event && start === existing.start
          ? { ...body, start: undefined } : body) // an unchanged start keeps its event
        : await api.createRelationship(sagaId, body)
      rememberType(sagaId, saved.type.ref)
      rememberGroup(sagaId, groupId)
      onDone(saved)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const endButton = (side: 'from' | 'to', value: End | undefined, fixed: boolean) => (
    <button type="button" className={`rel-end ${value ? 'set' : ''}`} disabled={fixed} onClick={() => setPicking(side)}>
      {value ? value.name : side === 'from' ? 'Pick who or what…' : 'Pick the other…'}
      {value?.kind && <span className="muted small"> · {KIND_NAMES[value.kind] ?? value.kind}</span>}
    </button>
  )

  return (
    <form className="rel-form" onSubmit={(e) => void submit(e)}>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <div className="rel-sentence">
        {endButton('from', from, Boolean(fixedFrom))}
        <div className="rel-type">
          <input autoFocus={!existing} placeholder="type (killed, ally of…)" aria-label="Relationship type" value={typeRef ? picked?.label ?? query : query}
            onChange={(e) => { setTypeRef(null); setQuery(e.target.value) }} />
          {!typeRef && (
            <div className="rel-type-options">
              {suggestions.slice(0, 8).map((t) => (
                <button key={t.ref} type="button" className="chip" onClick={() => { setTypeRef(t.ref); setQuery(t.label) }}
                  title={t.directed && t.inverse ? `${t.label} / ${t.inverse}` : t.label}>
                  {t.label}{!t.predefined && <span className="muted"> ·</span>}
                </button>
              ))}
            </div>
          )}
          {!typeRef && query.trim() && !exact && (
            <div className="rel-new-type">
              <span className="muted small">New type “{query.trim()}” for this group:</span>
              <label className="check small"><input type="checkbox" checked={newType.directed} onChange={(e) => setNewType({ ...newType, directed: e.target.checked })} /> One way</label>
              {newType.directed && <input className="small" placeholder="read back (e.g. framed by)" value={newType.inverse} aria-label="Read back"
                onChange={(e) => setNewType({ ...newType, inverse: e.target.value })} />}
            </div>
          )}
        </div>
        {endButton('to', to, Boolean(givenTo && !existing))}
      </div>
      {isAdmin && !to && (making ? (
        <div className="rel-make">
          <input autoFocus placeholder="Name" value={making.name} onChange={(e) => setMaking({ ...making, name: e.target.value })} aria-label="New resource name"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void makeResource() } }} />
          <select value={making.kind} onChange={(e) => setMaking({ ...making, kind: e.target.value })} aria-label="Kind">
            {kinds.map((k) => <option key={k} value={k}>{KIND_NAMES[k]}</option>)}
          </select>
          <button type="button" className="small" onClick={() => void makeResource()}>Make</button>
          <button type="button" className="small ghost" onClick={() => setMaking(null)}>✕</button>
        </div>
      ) : <button type="button" className="small ghost rel-make-open" onClick={() => setMaking({ name: '', kind: 'character' })}>Not there yet? Make it…</button>)}
      <div className="rel-form-row">
        {groups.length > 1 && (
          <label className="inline-field">
            <span className="muted small">Known by</span>
            <select value={groupId ?? ''} onChange={(e) => { setGroupId(Number(e.target.value)); setTypeRef(types.find((t) => t.ref === typeRef)?.predefined ? typeRef : null) }} aria-label="Group">
              {groups.map((g) => <option key={g.id} value={g.id}>{g.key === 'admins' ? 'The DM (the truth)' : g.name}</option>)}
            </select>
          </label>
        )}
        {event ? <span className="muted small">Starts at {event.name} ({formatDate(saga.calendar, event.date)})</span>
          : <button type="button" className="small ghost" onClick={() => setMore(!more)}>{more ? '▾' : '▸'} Dates and note</button>}
      </div>
      {more && !event && (
        <div className="rel-more">
          <DateInput label="Since" value={start} optional onChange={setStart} />
          <DateInput label="Until" value={end} optional onChange={setEnd} />
          {start !== null && !existing?.event_id && <span className="muted small">A start date puts it on the timeline (an event at that date).</span>}
        </div>
      )}
      {(more || event) && <label>Note<input value={note} maxLength={300} placeholder="with a poisoned dagger" onChange={(e) => setNote(e.target.value)} /></label>}
      <div className="button-row">
        <button type="submit" className="primary" disabled={busy || !from || !to || (!typeRef && !query.trim())}>{existing ? 'Save' : 'Add'}</button>
        <button type="button" className="ghost" onClick={() => onDone(null)}>Cancel</button>
      </div>
      <ResourcePicker open={picking !== null} title={picking === 'from' ? 'From' : 'To'} kinds={kinds} multiple={false}
        exclude={[from?.id, to?.id].filter((x): x is number => typeof x === 'number')}
        onPick={(_, [r]) => r && (picking === 'from' ? setFrom : setTo)({ id: r.id, name: r.name, kind: r.kind })}
        onClose={() => setPicking(null)} />
    </form>
  )
}
