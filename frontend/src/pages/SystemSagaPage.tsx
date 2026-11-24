/**
 * System administration → one Saga (plan 43, /system/sagas/:sagaId): its numbers (people and their last login,
 * characters, items, documents, events, locations and maps, relationships, Stages), its files' size per upload
 * category, its members; turn it on or off (off: its members can't open it), add a DM (an existing account or a new
 * one), delete it (typing its name). Numbers and names only: never the Saga's content.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import type { SystemSagaDetail } from '../api/types'
import { useAuth } from '../auth'
import { formatBytes } from '../components/imageEditor/imageMath'
import Modal from '../components/Modal'
import { timeAgo } from '../components/timeAgo'
import { AccountChoice, accountReady, NO_ACCOUNT, type AccountValue } from '../saga/AddMember'

const ROLE_LABEL = { admin: 'DM', player: 'Player', viewer: 'Viewer' } as const

export default function SystemSagaPage() {
  const { sagaId } = useParams()
  const id = Number(sagaId)
  const navigate = useNavigate()
  const { me, reload } = useAuth()
  const mine = new Set(me?.system_admin?.permissions || [])
  const [saga, setSaga] = useState<SystemSagaDetail | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [addingDm, setAddingDm] = useState(false)

  useEffect(() => { api.systemSaga(id).then(setSaga).catch((e: Error) => setError(e.message)) }, [id])

  const run = async (action: () => Promise<SystemSagaDetail | void>, done: string) => {
    setError(''); setNote('')
    try {
      const result = await action()
      if (result) setSaga(result)
      setNote(done)
      void reload() // my own Sagas list follows (a Saga turned off, a DM added)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  if (!saga) return <div className="page-message">{error || 'Loading…'}</div>
  const c = saga.counts
  const tiles: [string, number][] = [
    ['Player characters', c.player_characters], ['NPCs', c.npcs], ['Items', c.items], ['Documents', c.documents],
    ['Events', c.events], ['Locations', c.locations], ['Maps', c.maps], ['Relationships', c.relationships], ['Stages', c.stages],
  ]
  return (
    <div className="page system-saga-page">
      <header className="page-header">
        <div className="row">
          <Link to="/system" className="ghost">← System administration</Link>
          <h1>{saga.name}</h1>
          <span className={`role-badge ${saga.is_archived ? 'off' : 'on'}`}>{saga.is_archived ? 'Inactive' : 'Active'}</span>
        </div>
        <div className="row">
          {mine.has('sagas.manage') && (
            <button onClick={() => void run(() => api.setSagaActive(saga.id, saga.is_archived),
              saga.is_archived ? 'Turned on: its members can open it again.' : "Turned off: its members can't open it.")}>
              {saga.is_archived ? 'Turn on' : 'Turn off'}
            </button>
          )}
          {mine.has('sagas.manage') && <button className="danger" onClick={() => setDeleting(true)}>Delete…</button>}
        </div>
      </header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      {note && <div className="notice" onClick={() => setNote('')}>{note}</div>}
      <p className="muted small">
        {saga.is_archived ? "Turned off: its members can't open it, and its live link is off. " : ''}
        Saga template <strong>{saga.template}</strong> · made {saga.created_at ? new Date(saga.created_at).toLocaleDateString() : '?'} ·
        last login <strong>{timeAgo(saga.last_login)}</strong>
      </p>

      <div className="system-saga-grid">
        <section className="panel">
          <h2>People</h2>
          <div className="stat-tiles">
            <div className="stat-tile"><strong>{c.dms}</strong><span>DM{c.dms === 1 ? '' : 's'}</span></div>
            <div className="stat-tile"><strong>{c.players}</strong><span>Player{c.players === 1 ? '' : 's'}</span></div>
            <div className="stat-tile"><strong>{c.viewers}</strong><span>Viewer{c.viewers === 1 ? '' : 's'}</span></div>
          </div>
          <table className="table">
            <thead><tr><th>Name in the Saga</th><th>Login</th><th>Role</th><th>Last login</th></tr></thead>
            <tbody>
              {saga.members.map((m) => (
                <tr key={m.id} className={m.account_active ? '' : 'muted'}>
                  <td>{m.display_name}</td>
                  <td className="muted">{m.login}{!m.account_active && ' (off)'}</td>
                  <td>{ROLE_LABEL[m.role]}</td>
                  <td className="small" title={m.last_login ? new Date(m.last_login).toLocaleString() : undefined}>{timeAgo(m.last_login)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {mine.has('saga_admins.assign') && <button className="small" onClick={() => setAddingDm(true)}>＋ Add a DM</button>}
        </section>

        <section className="panel">
          <h2>What it holds</h2>
          <div className="stat-tiles">
            {tiles.map(([label, n]) => <div key={label} className="stat-tile"><strong>{n}</strong><span>{label}</span></div>)}
          </div>
        </section>

        <section className="panel">
          <h2>Files</h2>
          {saga.files.length ? (
            <table className="table files-table">
              <thead><tr><th>Category</th><th>Files</th><th>Size</th></tr></thead>
              <tbody>
                {saga.files.map((f) => (
                  <tr key={f.category}><td title={f.label}>{f.label.split(' (')[0]}</td><td>{f.count}</td><td>{formatBytes(f.size)}</td></tr>
                ))}
                <tr className="total-row"><td>Total</td><td>{saga.files.reduce((n, f) => n + f.count, 0)}</td><td>{formatBytes(saga.files_size)}</td></tr>
              </tbody>
            </table>
          ) : <p className="muted">No files yet.</p>}
        </section>
      </div>

      {deleting && <DeleteSaga name={saga.name} onClose={() => setDeleting(false)}
        onDelete={(confirm) => run(() => api.deleteSaga(saga.id, confirm), 'Deleted.').then((ok) => { if (ok) navigate('/system') })} />}
      {addingDm && <AddDm onClose={() => setAddingDm(false)}
        onAdd={(value, name) => run(() => api.addSagaDm(saga.id, {
          account: value.account, login: value.login.trim(), password: value.account === 'new' ? value.password : null, display_name: name,
        }), 'DM added.').then((ok) => { if (ok) setAddingDm(false) })} />}
    </div>
  )
}

/** Delete: what goes, and the Saga's name typed to confirm. */
function DeleteSaga({ name, onClose, onDelete }: { name: string; onClose: () => void; onDelete: (confirm: string) => void }) {
  const [typed, setTyped] = useState('')
  return (
    <Modal open title={`Delete ${name}?`} onClose={onClose}>
      <div className="form">
        <p>Everything in it goes, for good: its characters, items, documents, locations and maps, events, relationships,
          Stages, pictures and settings. Its members' accounts stay (and their other Sagas). <strong>This can't be undone.</strong></p>
        <p className="muted small">To turn it off for a while instead, use <em>Turn off</em>.</p>
        <label>Type its name to confirm<input value={typed} placeholder={name} onChange={(e) => setTyped(e.target.value)} autoFocus /></label>
        <div className="button-row">
          <span className="spacer" />
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="danger" disabled={typed.trim() !== name.trim()} onClick={() => onDelete(typed)}>Delete the Saga</button>
        </div>
      </div>
    </Modal>
  )
}

/** A DM for the Saga: an existing account (one already in the Saga becomes its DM) or a new one. */
function AddDm({ onClose, onAdd }: { onClose: () => void; onAdd: (value: AccountValue, name: string) => void }) {
  const [value, setValue] = useState<AccountValue>(NO_ACCOUNT)
  const [name, setName] = useState('')
  return (
    <Modal open title="Add a DM" onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (accountReady(value)) onAdd(value, name.trim()) }}>
        <AccountChoice value={value} onChange={setValue} search={api.searchLogins}
          existingHint="Someone with an account on this server (one already in the Saga becomes its DM)."
          newHint="Creates the DM's account (this login and password)." />
        <label>Display name in the Saga<input value={name} placeholder={value.login.trim() || 'Their login, until set'} onChange={(e) => setName(e.target.value)} /></label>
        <div className="button-row">
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!accountReady(value)}>Add the DM</button>
        </div>
      </form>
    </Modal>
  )
}
