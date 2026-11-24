import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { SagaRef } from '../api/types'
import { useAuth } from '../auth'

const ROLE_LABEL = { admin: 'DM', player: 'Player', viewer: 'Viewer' }

/** Where entering a Saga lands (plan 44): its Stage when one is live, else its Saga tab. */
export const sagaEntry = (saga: SagaRef) => (saga.live ? `/s/${saga.id}` : `/s/${saga.id}/saga`)

export default function HomePage() {
  const { me, signOut, reload } = useAuth()
  // Which Sagas are live now (a Stage may have gone live since signing in), before going in
  const [fresh, setFresh] = useState(false)
  useEffect(() => { void reload().finally(() => setFresh(true)) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null
  // One saga and nothing else to do: go straight in
  if (me.sagas.length === 1 && !me.system_admin) {
    return fresh ? <Navigate to={sagaEntry(me.sagas[0])} replace /> : <div className="page-message">Loading…</div>
  }

  return (
    <div className="page narrow">
      <header className="page-header">
        <h1 className="brand">SagaCraft</h1>
        <div className="row">
          <span className="muted">{me.login}</span>
          <button className="ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <h2>Your sagas</h2>
      {me.sagas.length === 0 && <p className="muted">You're not in any saga yet. Ask your DM to add you.</p>}
      <div className="saga-list">
        {me.sagas.map((saga) => (
          <Link key={saga.id} to={sagaEntry(saga)} className="saga-tile">
            <span className="saga-name">{saga.name}</span>
            <span className={`role-badge role-${saga.role}`}>{ROLE_LABEL[saga.role]}</span>
          </Link>
        ))}
      </div>

      {me.system_admin && (
        <>
          <h2>Instance</h2>
          <Link to="/system" className="saga-tile">
            <span className="saga-name">System administration</span>
            <span className="role-badge">{me.system_admin.is_root ? 'Root' : 'Admin'}</span>
          </Link>
        </>
      )}
    </div>
  )
}
