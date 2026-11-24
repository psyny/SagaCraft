/**
 * Picking someone's account (plan 42), two ways said plainly: an **existing account** (looked up by login, 2 letters
 * or more) or a **new account** (a login and password they'll sign in with). Used by Saga → Members, "Add someone"
 * (the DM: with a role and a display name in this Saga), and System → New saga (its first DM).
 * Logins aren't case sensitive; names are each Saga's.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import type { Role } from '../api/types'

export const ROLES: [Role, string][] = [['admin', 'Admin (DM)'], ['player', 'Player'], ['viewer', 'Viewer']]

export interface AccountValue {
  account: 'existing' | 'new'
  /** Existing: the login picked ('' until one is); new: the login typed. */
  login: string
  /** New accounts only. */
  password: string
}

export const NO_ACCOUNT: AccountValue = { account: 'existing', login: '', password: '' }

/** Whether the choice is complete: an account picked, or a new login (2+) and password (6+). */
export function accountReady(value: AccountValue): boolean {
  return value.account === 'existing' ? value.login !== '' : value.login.trim().length >= 2 && value.password.length >= 6
}

/** The two ways and their fields. Remount it (a new `key`) to clear the lookup. */
export function AccountChoice({ value, onChange, search, existingHint, newHint }: {
  value: AccountValue
  onChange: (value: AccountValue) => void
  /** Logins with what was typed (2 letters or more). */
  search: (query: string) => Promise<{ user_id: number; login: string }[]>
  existingHint: string
  newHint: string
}) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ user_id: number; login: string }[]>([])
  const picked = value.account === 'existing' && value.login ? value.login : null

  // Looked up as they type (after a short pause)
  useEffect(() => {
    if (value.account !== 'existing' || picked || query.trim().length < 2) {
      setFound([])
      return
    }
    const timer = window.setTimeout(() => {
      search(query.trim()).then(setFound).catch(() => setFound([]))
    }, 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.account, query, picked])

  const switchTo = (account: AccountValue['account']) => {
    setQuery('')
    onChange({ account, login: '', password: '' })
  }

  return (
    <>
      <div className="segmented" role="tablist" aria-label="Which account">
        <button type="button" role="tab" aria-selected={value.account === 'existing'} className={value.account === 'existing' ? 'on' : ''}
          onClick={() => switchTo('existing')}>Existing account</button>
        <button type="button" role="tab" aria-selected={value.account === 'new'} className={value.account === 'new' ? 'on' : ''}
          onClick={() => switchTo('new')}>New account</button>
      </div>
      {value.account === 'existing' ? (
        <>
          <p className="muted small">{existingHint}</p>
          {picked ? (
            <div className="add-member-picked">
              <span>Picked <strong>{picked}</strong></span>
              <button type="button" className="small ghost" aria-label="Pick another" onClick={() => { setQuery(''); onChange({ ...value, login: '' }) }}>✕</button>
            </div>
          ) : (
            <label>Login
              <input value={query} autoCapitalize="off" autoComplete="off" placeholder="Type 2 letters or more"
                onChange={(e) => setQuery(e.target.value)} aria-label="Find an account by login" />
            </label>
          )}
          {!picked && query.trim().length >= 2 && (
            <div className="add-member-results" role="listbox" aria-label="Accounts found">
              {found.length ? found.map((a) => (
                <button type="button" role="option" aria-selected={false} key={a.user_id} onClick={() => { setFound([]); onChange({ ...value, login: a.login }) }}>{a.login}</button>
              )) : <span className="muted small">No account found.</span>}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="muted small">{newHint} Logins aren't case sensitive.</p>
          <div className="grid-2">
            <label>Login<input value={value.login} autoCapitalize="off" autoComplete="off" onChange={(e) => onChange({ ...value, login: e.target.value })} /></label>
            <label>Password<input type="password" autoComplete="new-password" placeholder="6 characters or more" value={value.password}
              onChange={(e) => onChange({ ...value, password: e.target.value })} /></label>
          </div>
        </>
      )}
    </>
  )
}

/** Saga → Members, "Add someone" (the DM). */
export default function AddMember({ sagaId, onAdd }: {
  sagaId: number
  /** Sends the change; true when it went through (the form clears). */
  onAdd: (body: Parameters<typeof api.addMember>[1]) => Promise<boolean>
}) {
  const [value, setValue] = useState<AccountValue>(NO_ACCOUNT)
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('player')
  const [round, setRound] = useState(0)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!accountReady(value)) return
    const ok = await onAdd(value.account === 'existing'
      ? { account: 'existing', login: value.login, display_name: name.trim(), role }
      : { account: 'new', login: value.login.trim(), password: value.password, display_name: name.trim(), role })
    if (ok) {
      setValue({ account: value.account, login: '', password: '' }); setName(''); setRound((n) => n + 1)
    }
  }

  const existing = value.account === 'existing'
  return (
    <form className="form add-member" onSubmit={(e) => void submit(e)}>
      <h3>Add someone</h3>
      <AccountChoice key={round} value={value} onChange={setValue} search={(q) => api.searchAccounts(sagaId, q)}
        existingHint="Someone who already has an account on this server: find it by its login (those already in this Saga aren't listed)."
        newHint="Creates an account they sign in with (this login and password), and adds it to this Saga." />
      <div className="grid-2">
        <label>Display name in this Saga
          <input value={name} maxLength={120} placeholder={value.login.trim() || 'Their login, until set'} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>Role
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>
      <button className="primary" disabled={!accountReady(value)}>
        {existing ? (value.login ? `Add ${value.login} to this Saga` : 'Add to this Saga') : 'Create the account and add it'}
      </button>
    </form>
  )
}
