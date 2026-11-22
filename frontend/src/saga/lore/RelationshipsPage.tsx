/**
 * Lore → Relationships: the graph (or a list) of the relationships this member reads. Query: everyone's
 * connections between characters, everything, around resources (N hops), or within a chosen set; whose knowledge
 * (member groups: the DM's truth, a party's theories); kinds, who added them, references, and the moment in the
 * story (shared with the timeline). Select a node or an edge for details; drag a node's "+" onto another to link
 * them; double click a node to open its page. See docs/concepts/relationships.md ("Graph viewer").
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import type { GraphData, GraphQuery, Relationship, Resource } from '../../api/types'
import Modal from '../../components/Modal'
import ResourcePicker from '../../components/ResourcePicker'
import Segmented from '../../components/Segmented'
import { useSaga } from '../SagaContext'
import DateInput from './DateInput'
import { formatDate, formatSpan } from './dates'
import RelationshipGraph, { KIND_COLORS, type Selection } from './graph/RelationshipGraph'
import { useMoment } from './moment'
import RelationshipForm from './RelationshipForm'
import { CreatorMark, RevealMenu } from './RelationshipsPanel'
import { groupLabel, KIND_NAMES, readableGroups, resourcePath, sagaKinds, writableGroups } from './relationships'

type Mode = GraphQuery['mode']

export default function RelationshipsPage() {
  const { sagaId, saga, isAdmin, ruleset } = useSaga()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const around = Number(params.get('around')) || null
  const [mode, setMode] = useState<Mode>(around ? 'around' : 'characters')
  const [ids, setIds] = useState<number[]>(around ? [around] : [])
  const [names, setNames] = useState<Record<number, string>>({})
  const [hops, setHops] = useState(1)
  const groupsReadable = readableGroups(saga)
  const [groups, setGroups] = useState<number[]>(() => isAdmin
    ? groupsReadable.filter((g) => g.key === 'admins').map((g) => g.id) : groupsReadable.map((g) => g.id))
  const [kinds, setKinds] = useState<string[]>([])
  const [creator, setCreator] = useState<'all' | 'admins' | 'players'>('all')
  const [references, setReferences] = useState(false)
  const [labels, setLabels] = useState(true)
  const [moment, setMoment] = useMoment(sagaId)
  const [view, setView] = useState<'graph' | 'list'>('graph')
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [selected, setSelected] = useState<Selection>(null)
  const [detail, setDetail] = useState<Relationship | null>(null)
  const [linking, setLinking] = useState<{ from: number; to: number } | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Relationship | null>(null)
  const [picking, setPicking] = useState(false)
  const [list, setList] = useState<Relationship[] | null>(null)
  const [error, setError] = useState('')
  const canWrite = writableGroups(saga).length > 0

  useEffect(() => {
    if (around) { setMode('around'); setIds([around]); setParams({}, { replace: true }) }
  }, [around, setParams])
  useEffect(() => {
    const missing = ids.filter((i) => !names[i])
    if (missing.length) Promise.all(missing.map((i) => api.resource(sagaId, i).catch(() => null)))
      .then((rs) => setNames((n) => ({ ...n, ...Object.fromEntries(rs.filter((r): r is Resource => r !== null).map((r) => [r.id, r.name])) })))
  }, [ids, names, sagaId])

  const query: GraphQuery = useMemo(() => ({
    mode, ids, hops, groups, kinds, creator: creator === 'all' ? null : creator, at: moment, references,
  }), [mode, ids, hops, groups, kinds, creator, moment, references])
  const load = useCallback(() => {
    if ((mode === 'around' || mode === 'set') && ids.length === 0) return setGraph({ nodes: [], edges: [] })
    api.relationshipGraph(sagaId, query).then(setGraph).catch((e: Error) => setError(e.message))
    if (view === 'list') api.relationships(sagaId).then(setList).catch(() => setList([]))
  }, [sagaId, query, mode, ids, view])
  useEffect(load, [load])

  const selectedEdge = selected && 'edge' in selected ? graph?.edges.find((e) => e.id === selected.edge) : undefined
  const selectedNode = selected && 'node' in selected ? graph?.nodes.find((n) => n.id === selected.node) : undefined
  useEffect(() => {
    if (selectedEdge?.relationship_id) api.relationship(sagaId, selectedEdge.relationship_id).then(setDetail).catch(() => setDetail(null))
    else setDetail(null)
  }, [selectedEdge?.relationship_id, sagaId])

  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x])
  const listShown = (list || []).filter((r) => groups.includes(r.group_id)
    && (moment === null || ((r.start === null || r.start <= moment) && (r.end === null || moment <= r.end)))
    && (creator === 'all' || (creator === 'admins') === (r.created_by.role === 'admin')))

  return (
    <div className="page page-full relationships-page">
      <header className="location-header">
        <h1>Relationships</h1>
        <span className="spacer" />
        <Segmented value={view} options={[['graph', 'Graph'], ['list', 'List']]} onChange={setView} />
        {canWrite && <button className="primary small" onClick={() => setAdding(true)}>＋ Relationship</button>}
      </header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <div className="rel-layout">
        <aside className="rel-query tool-panel">
          <div className="field">
            <span className="field-label">Show</span>
            <div className="chips">
              {([['characters', 'Characters'], ['all', 'Everything'], ['around', 'Around…'], ['set', 'Among…']] as const).map(([m, label]) => (
                <button key={m} className={`chip ${mode === m ? 'on' : ''}`} onClick={() => { setMode(m); if ((m === 'around' || m === 'set') && !ids.length) setPicking(true) }}>{label}</button>
              ))}
            </div>
            {(mode === 'around' || mode === 'set') && (
              <>
                <div className="chips">
                  {ids.map((i) => <button key={i} className="chip on" onClick={() => setIds(ids.filter((x) => x !== i))}>{names[i] ?? '…'} ✕</button>)}
                  <button className="chip" onClick={() => setPicking(true)}>＋</button>
                </div>
                <label className="inline-slider">{mode === 'around' ? 'Reach' : 'Plus neighbours'}
                  <select value={hops} onChange={(e) => setHops(Number(e.target.value))} aria-label="Hops">
                    {[0, 1, 2, 3].map((h) => <option key={h} value={h}>{h === 0 ? 'only them' : `${h} step${h > 1 ? 's' : ''}`}</option>)}
                  </select>
                </label>
              </>
            )}
          </div>
          {groupsReadable.length > 1 && (
            <div className="field">
              <span className="field-label">Whose knowledge</span>
              <div className="chips">
                {groupsReadable.map((g) => (
                  <button key={g.id} className={`chip ${groups.includes(g.id) ? 'on' : ''}`} onClick={() => setGroups(toggle(groups, g.id))}>
                    {g.key === 'admins' ? 'The truth (DM)' : g.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="field">
            <span className="field-label">Kinds</span>
            <div className="chips">
              {sagaKinds(ruleset).map((k) => (
                <button key={k} className={`chip ${kinds.includes(k) ? 'on' : ''}`} onClick={() => setKinds(toggle(kinds, k))}>
                  <span className="kind-dot" style={{ background: KIND_COLORS[k] }} /> {KIND_NAMES[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Added by</span>
            <Segmented value={creator} options={[['all', 'Anyone'], ['admins', 'The DM'], ['players', 'Players']]} onChange={setCreator} />
          </div>
          <div className="field">
            <span className="field-label">Moment in the story</span>
            <DateInput value={moment} optional emptyLabel="Any time" onChange={setMoment} />
          </div>
          <label className="check small"><input type="checkbox" checked={references} onChange={(e) => setReferences(e.target.checked)} /> Template links too</label>
          <label className="check small"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Labels</label>
        </aside>
        <section className="rel-main">
          {view === 'graph' ? (
            graph && <RelationshipGraph data={graph} labels={labels} selected={selected} onSelect={setSelected}
              onConnect={canWrite ? (from, to) => setLinking({ from, to }) : undefined}
              onOpen={(n) => { const path = resourcePath(sagaId, n.kind, n.resource_id); if (path) navigate(path) }} />
          ) : (
            <table className="table rel-table">
              <thead><tr><th>From</th><th>Relationship</th><th>To</th><th>When</th><th>Known by</th><th /></tr></thead>
              <tbody>
                {listShown.map((r) => (
                  <tr key={r.id}>
                    <td>{r.from.name ?? '???'}</td><td className="rel-verb">{r.type.label}</td><td>{r.to.name ?? '???'}</td>
                    <td className="muted small">{formatSpan(saga.calendar, r.start, r.end) || 'always'}</td>
                    <td className="small">{groupLabel(saga, r.group_id, r.group_name)} <CreatorMark rel={r} /></td>
                    <td>{r.editable && <button className="small ghost" onClick={() => setEditing(r)}>✎</button>}</td>
                  </tr>
                ))}
                {listShown.length === 0 && <tr><td colSpan={6} className="muted">No relationships here.</td></tr>}
              </tbody>
            </table>
          )}
        </section>
        <aside className="rel-detail tool-panel">
          {detail ? (
            <>
              <strong>{detail.from.name ?? '???'} <span className="rel-verb">{detail.type.label}</span> {detail.to.name ?? '???'}</strong>
              {detail.type.directed && detail.type.inverse && <span className="muted small">{detail.to.name ?? '???'} {detail.type.inverse} {detail.from.name ?? '???'}</span>}
              <span className="small">{formatSpan(saga.calendar, detail.start, detail.end) || 'Always'}</span>
              {detail.note && <p className="small">“{detail.note}”</p>}
              <span className="small">Known by {groupLabel(saga, detail.group_id, detail.group_name)} <CreatorMark rel={detail} /></span>
              {detail.event_id && <Link className="small" to={`/s/${sagaId}/lore/events/${detail.event_id}`}>The event →</Link>}
              <div className="button-row">
                {detail.editable && <button className="small" onClick={() => setEditing(detail)}>✎ Edit</button>}
                {detail.editable && <button className="small ghost danger" onClick={() => window.confirm('Delete this relationship?')
                  && void api.deleteRelationship(sagaId, detail.id).then(() => { setSelected(null); load() })}>Delete</button>}
                {isAdmin && <RevealMenu rel={detail} onDone={load} />}
              </div>
            </>
          ) : selectedNode ? (
            <>
              <strong>{selectedNode.name ?? 'Someone unknown'}</strong>
              {selectedNode.kind && <span className="muted small">{KIND_NAMES[selectedNode.kind]}</span>}
              {selectedNode.resource_id && (
                <div className="button-row">
                  <button className="small" onClick={() => { setMode('around'); setIds([selectedNode.resource_id!]); setNames((n) => ({ ...n, [selectedNode.resource_id!]: selectedNode.name ?? '' })) }}>Around them</button>
                  {(() => { const path = selectedNode.kind !== 'character' && resourcePath(sagaId, selectedNode.kind, selectedNode.resource_id); return path ? <Link className="small" to={path}>Open →</Link> : null })()}
                </div>
              )}
              {canWrite && selectedNode.resource_id && <span className="muted small">Drag its ＋ onto another to link them.</span>}
            </>
          ) : (
            <p className="muted small">Pick a node or a link. Double click a node to open it.
              {moment !== null && <> Showing what was true on {formatDate(saga.calendar, moment)}.</>}</p>
          )}
        </aside>
      </div>
      <ResourcePicker open={picking} title={mode === 'set' ? 'Among these' : 'Around'} kinds={sagaKinds(ruleset)} exclude={ids}
        onPick={(picked, rs) => { setIds([...ids, ...picked]); setNames((n) => ({ ...n, ...Object.fromEntries(rs.map((r) => [r.id, r.name])) })) }}
        onClose={() => setPicking(false)} />
      <Modal open={adding || linking !== null} title="New relationship" onClose={() => { setAdding(false); setLinking(null) }}>
        {(adding || linking) && (
          <RelationshipForm
            from={linking ? { id: linking.from, name: graph?.nodes.find((n) => n.resource_id === linking.from)?.name ?? '?', kind: graph?.nodes.find((n) => n.resource_id === linking.from)?.kind ?? null } : undefined}
            to={linking ? { id: linking.to, name: graph?.nodes.find((n) => n.resource_id === linking.to)?.name ?? '?', kind: graph?.nodes.find((n) => n.resource_id === linking.to)?.kind ?? null } : undefined}
            onDone={(made) => { setAdding(false); setLinking(null); if (made) load() }} />
        )}
      </Modal>
      <Modal open={editing !== null} title="Relationship" onClose={() => setEditing(null)}>
        {editing && <RelationshipForm existing={editing} onDone={(saved) => { setEditing(null); if (saved) { load(); if (detail?.id === saved.id) setDetail(saved) } }} />}
      </Modal>
    </div>
  )
}
