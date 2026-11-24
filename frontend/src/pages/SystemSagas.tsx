/**
 * System administration → Sagas (plan 43): the Sagas, 5 at a time, found by name, shown or not by whether they're on,
 * ordered by last login (default), name, newest or oldest. A Saga opens its own page (/system/sagas/:id: its numbers,
 * on or off, delete). ＋ New saga opens a window: name, Saga template (or a file), its DM (an existing account or a
 * new one) and the DM's display name there.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { SagaTemplateDoc, SystemSagaRow } from '../api/types'
import Modal from '../components/Modal'
import { timeAgo } from '../components/timeAgo'
import { AccountChoice, accountReady, NO_ACCOUNT, type AccountValue } from '../saga/AddMember'

const PAGE = 5
const ORDERS: [string, string][] = [['last_login', 'Last login'], ['name', 'Name'], ['newest', 'Newest'], ['oldest', 'Oldest']]
const STATUSES: [string, string][] = [['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']]

export default function SystemSagas({ canCreate, rulesets, onCreated }: {
  canCreate: boolean
  rulesets: { key: string; name: string }[]
  onCreated: () => void
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState('last_login')
  const [status, setStatus] = useState('all')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<{ total: number; sagas: SystemSagaRow[] } | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const load = () => api.allSagas({ q: query.trim(), order, status, offset, limit: PAGE }).then(setPage).catch((e: Error) => setError(e.message))
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 250 : 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, order, status, offset])
  // A new search, order or filter starts at the first page
  const refine = (change: () => void) => { change(); setOffset(0) }

  const total = page?.total ?? 0
  return (
    <section className="panel system-sagas">
      <div className="system-toolbar">
        <input value={query} placeholder="Find a Saga by name" aria-label="Find a Saga by name" onChange={(e) => refine(() => setQuery(e.target.value))} />
        <label className="inline-label">Order
          <select value={order} onChange={(e) => refine(() => setOrder(e.target.value))}>
            {ORDERS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <div className="segmented" role="tablist" aria-label="Which Sagas">
          {STATUSES.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={status === k} className={status === k ? 'on' : ''} onClick={() => refine(() => setStatus(k))}>{label}</button>
          ))}
        </div>
        <span className="spacer" />
        {canCreate && <button className="primary" onClick={() => setCreating(true)}>＋ New saga</button>}
      </div>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <div className="system-saga-list">
        {page?.sagas.map((s) => (
          <button key={s.id} type="button" className={`system-saga-row ${s.is_archived ? 'off' : ''}`} onClick={() => navigate(`/system/sagas/${s.id}`)}>
            <span className="system-saga-name">
              <strong>{s.name}</strong>
              {s.is_archived && <span className="role-badge off">Inactive</span>}
            </span>
            <span className="muted small">{s.admins.length ? `DM ${s.admins.join(', ')}` : 'No DM'} · {s.member_count} member{s.member_count === 1 ? '' : 's'} · {s.ruleset_key}</span>
            <span className="system-saga-seen small" title={s.last_login ? new Date(s.last_login).toLocaleString() : 'No one has opened it yet'}>
              Last login <strong>{timeAgo(s.last_login)}</strong>
            </span>
          </button>
        ))}
        {page && !page.sagas.length && <p className="muted">No Saga found.</p>}
      </div>
      {total > PAGE && (
        <div className="pager">
          <button className="small" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>‹ Previous</button>
          <span className="muted small">{offset + 1}–{Math.min(total, offset + PAGE)} of {total}</span>
          <button className="small" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Next ›</button>
        </div>
      )}
      {creating && <NewSaga rulesets={rulesets} onClose={() => setCreating(false)}
        onCreated={(id) => { setCreating(false); onCreated(); navigate(`/system/sagas/${id}`) }} />}
    </section>
  )
}

function NewSaga({ rulesets, onClose, onCreated }: {
  rulesets: { key: string; name: string }[]
  onClose: () => void
  onCreated: (id: number) => void
}) {
  const [name, setName] = useState('')
  const [rulesetKey, setRulesetKey] = useState('dnd_lite')
  const [dmName, setDmName] = useState('')
  // Its first DM: an existing account or a new one, as a DM adding a member (plan 42)
  const [dm, setDm] = useState<AccountValue>(NO_ACCOUNT)
  // A Saga template file (exported from another Saga's Template page) instead of a built-in template
  const [templateFile, setTemplateFile] = useState<{ name: string; doc: SagaTemplateDoc } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pickTemplateFile = async (file: File | undefined) => {
    if (!file) return setTemplateFile(null)
    try {
      setTemplateFile({ name: file.name, doc: JSON.parse(await file.text()) as SagaTemplateDoc })
    } catch {
      setError('That file is not a Saga template (JSON).')
    }
  }
  const create = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const made = await api.createSaga({
        name: name.trim(), ruleset_key: rulesetKey, admin_display_name: dmName.trim(), admin_account: dm.account,
        admin_login: dm.login.trim(), admin_password: dm.account === 'new' ? dm.password : null, template: templateFile?.doc ?? null,
      })
      onCreated(made.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open title="New saga" onClose={onClose}>
      <form className="form" onSubmit={(e) => void create(e)}>
        {error && <div className="error">{error}</div>}
        <label>Name<input value={name} autoFocus onChange={(e) => setName(e.target.value)} /></label>
        <div className="grid-2">
          <label>Saga template
            <select value={templateFile ? '' : rulesetKey} disabled={Boolean(templateFile)} onChange={(e) => setRulesetKey(e.target.value)}>
              {templateFile && <option value="">{templateFile.doc.name || templateFile.name} (file)</option>}
              {rulesets.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          </label>
          <label>Or a template file
            <input type="file" accept="application/json,.json" onChange={(e) => void pickTemplateFile(e.target.files?.[0])} />
          </label>
        </div>
        <h4>Its DM</h4>
        <AccountChoice value={dm} onChange={setDm} search={api.searchLogins}
          existingHint="Someone with an account on this server: find it by its login."
          newHint="Creates the DM's account (this login and password)." />
        <label>The DM's display name in the Saga
          <input value={dmName} placeholder={dm.login.trim() || 'Their login, until set'} onChange={(e) => setDmName(e.target.value)} />
        </label>
        <div className="button-row">
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !name.trim() || !accountReady(dm)}>Create saga</button>
        </div>
      </form>
    </Modal>
  )
}
