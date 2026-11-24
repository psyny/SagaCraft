/**
 * System → Users (plan 42), for system admins who manage accounts: look accounts up by login, create one (in no Saga
 * yet), and open one to change its login, turn it off or on (off: it can't sign in), set a new password, make it a
 * system admin and pick its permissions (with "manage system admins"; only permissions you hold), or delete it (it
 * leaves every Saga). An account's names are each Saga's, listed with its Sagas.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import type { Account } from '../api/types'
import Modal from '../components/Modal'
import { timeAgo } from '../components/timeAgo'

const ROLE_LABEL = { admin: 'DM', player: 'Player', viewer: 'Viewer' } as const

export default function SystemUsers({ myId, mine, permissions, onAdminsChange }: {
  myId: number | undefined
  /** My system permissions. */
  mine: Set<string>
  permissions: { key: string; description: string }[]
  /** System admins changed (the System admins list reloads). */
  onAdminsChange: () => void
}) {
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [form, setForm] = useState({ login: '', password: '' })
  const [openId, setOpenId] = useState<number | null>(null)

  const load = (q = query) => api.accounts(q.trim()).then(setAccounts).catch((e: Error) => setError(e.message))
  useEffect(() => {
    const timer = window.setTimeout(() => void load(query), 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setError(''); setNote('')
    try {
      await action()
      await load()
      if (done) setNote(done)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (await run(() => api.createAccount({ login: form.login.trim(), password: form.password }), `Account ${form.login.trim().toLowerCase()} created.`)) {
      setForm({ login: '', password: '' })
    }
  }

  const open = accounts.find((a) => a.id === openId) ?? null

  return (
    <section className="panel system-users">
      <h2>Users</h2>
      <p className="muted small">Every account on this server. A person has one account (one login, not case sensitive) and is in any number
        of Sagas, with a role and a display name in each.</p>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      {note && <div className="notice" onClick={() => setNote('')}>{note}</div>}
      <input value={query} placeholder="Find by login" aria-label="Find accounts by login" autoCapitalize="off" onChange={(e) => setQuery(e.target.value)} />
      <table className="table">
        <thead><tr><th>Login</th><th>Sagas</th><th>Last login</th><th /></tr></thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id} className={a.is_active ? '' : 'muted'}>
              <td>
                <strong>{a.login}</strong>
                {a.system_admin && <span className="role-badge">{a.system_admin.is_root ? 'Root' : 'System admin'}</span>}
                {!a.is_active && <span className="role-badge off">Off</span>}
              </td>
              <td className="small">{a.sagas.length ? a.sagas.map((s) => `${s.name} (${ROLE_LABEL[s.role]}: ${s.display_name})`).join(' · ') : <span className="muted">None</span>}</td>
              <td className="small muted" title={a.last_login ? new Date(a.last_login).toLocaleString() : undefined}>{timeAgo(a.last_login)}</td>
              <td><button className="small" onClick={() => setOpenId(a.id)}>Edit</button></td>
            </tr>
          ))}
          {!accounts.length && <tr><td colSpan={4} className="muted">No account found.</td></tr>}
        </tbody>
      </table>
      <form className="form" onSubmit={(e) => void create(e)}>
        <h3>New account</h3>
        <p className="muted small">It's in no Saga yet: a DM adds it on Saga → Members, or a new Saga makes it its DM.</p>
        <div className="grid-2">
          <label>Login<input value={form.login} autoCapitalize="off" autoComplete="off" onChange={(e) => setForm({ ...form, login: e.target.value })} /></label>
          <label>Password<input type="password" autoComplete="new-password" placeholder="6 characters or more" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        </div>
        <button className="primary" disabled={form.login.trim().length < 2 || form.password.length < 6}>Create the account</button>
      </form>
      {open && <AccountEditor account={open} myId={myId} mine={mine} permissions={permissions} onClose={() => setOpenId(null)}
        run={(action, done) => run(action, done).then((ok) => { onAdminsChange(); return ok })} />}
    </section>
  )
}

function AccountEditor({ account, myId, mine, permissions, run, onClose }: {
  account: Account
  myId: number | undefined
  mine: Set<string>
  permissions: { key: string; description: string }[]
  run: (action: () => Promise<unknown>, done?: string) => Promise<boolean>
  onClose: () => void
}) {
  const [login, setLogin] = useState(account.login)
  const [password, setPassword] = useState('')
  const root = Boolean(account.system_admin?.is_root)
  const isMe = account.id === myId
  const onlyDm = account.sagas.filter((s) => s.role === 'admin')
  return (
    <Modal open title={`Account: ${account.login}`} onClose={onClose}>
      <div className="form">
        <form className="field-with-button" onSubmit={(e) => { e.preventDefault(); void run(() => api.updateAccountAsAdmin(account.id, { login }), 'Login changed.') }}>
          <label className="grow">Login<input value={login} autoCapitalize="off" onChange={(e) => setLogin(e.target.value)} /></label>
          <button disabled={login.trim().toLowerCase() === account.login || login.trim().length < 2}>Rename</button>
        </form>
        <div>
          <label className="check">
            <input type="checkbox" checked={account.is_active} disabled={isMe || root}
              onChange={(e) => void run(() => api.updateAccountAsAdmin(account.id, { is_active: e.target.checked }), e.target.checked ? 'It can sign in again.' : 'Turned off: it can\'t sign in.')} />
            Can sign in
          </label>
          <p className="muted small">Turned off, it's signed out everywhere and can't sign in; its Sagas keep it.</p>
        </div>
        <form className="field-with-button" onSubmit={(e) => {
          e.preventDefault()
          void run(() => api.updateAccountAsAdmin(account.id, { password }), 'New password set: tell them.').then((ok) => ok && setPassword(''))
        }}>
          <label className="grow">New password<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button disabled={password.length < 6}>Set password</button>
        </form>
        <SystemAdminFields account={account} mine={mine} me={isMe} permissions={permissions} run={run} />
        <div>
          <span className="field-label">Sagas</span>
          {account.sagas.length ? (
            <ul className="tpl-links">
              {account.sagas.map((s) => <li key={s.id}>{s.name}: {ROLE_LABEL[s.role]}, as <strong>{s.display_name}</strong>{s.is_archived ? ' (archived)' : ''}</li>)}
            </ul>
          ) : <p className="muted small">In no Saga.</p>}
        </div>
        <div className="button-row">
          <span className="muted small">{root ? "The root admin's account can't be deleted." : isMe ? "That's your own account." : onlyDm.length ? "If it's the only DM of a Saga, make someone else DM there first." : ''}</span>
          <span className="spacer" />
          <button className="danger" disabled={root || isMe}
            onClick={() => window.confirm(`Delete the account ${account.login}? It leaves every Saga it's in; what it made stays, without its name.`)
              && void run(() => api.deleteAccount(account.id), `Account ${account.login} deleted.`).then((ok) => ok && onClose())}>
            Delete account
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** The account editor's System admin part: make it one (no permissions yet), its permissions (only those you hold
 * change), stop it being one. Needs "manage system admins"; the root admin holds everything and stays. */
function SystemAdminFields({ account, mine, me, permissions, run }: {
  account: Account
  mine: Set<string>
  me: boolean
  permissions: { key: string; description: string }[]
  run: (action: () => Promise<unknown>, done?: string) => Promise<boolean>
}) {
  const admin = account.system_admin
  const can = mine.has('system_admins.manage')
  const toggle = (key: string) => {
    if (!admin) return
    const next = admin.permissions.includes(key) ? admin.permissions.filter((p) => p !== key) : [...admin.permissions, key]
    void run(() => api.updateSystemAdmin(account.id, next), 'Permissions saved.')
  }
  return (
    <div className="system-admin-fields">
      <span className="field-label">System admin</span>
      {!admin ? (
        <div className="button-row">
          <span className="muted small">Not a system admin.</span>
          <span className="spacer" />
          {can && <button className="small" onClick={() => void run(() => api.createSystemAdmin({ login: account.login, password: '', permissions: [] }),
            `${account.login} is a system admin: pick their permissions.`)}>Make system admin</button>}
        </div>
      ) : admin.is_root ? (
        <p className="muted small">The root admin: every permission, always.</p>
      ) : (
        <>
          <div className="chips">
            {permissions.map((p) => (
              <button key={p.key} type="button" title={p.description} className={`chip ${admin.permissions.includes(p.key) ? 'on' : ''}`}
                disabled={!can || !mine.has(p.key)} onClick={() => toggle(p.key)}>{p.key}</button>
            ))}
          </div>
          <div className="button-row">
            <span className="muted small">{can ? 'Only the permissions you hold can change.' : 'Changing them needs "system_admins.manage".'}</span>
            <span className="spacer" />
            {can && !me && <button className="small ghost danger" onClick={() => window.confirm(`${account.login} stops being a system admin?`)
              && void run(() => api.removeSystemAdmin(account.id), `${account.login} is no longer a system admin.`)}>Remove system admin</button>}
          </div>
        </>
      )}
    </div>
  )
}
