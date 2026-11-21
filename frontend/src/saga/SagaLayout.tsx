import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSaga } from './SagaContext'

export default function SagaLayout() {
  const { sagaId, saga, isAdmin, live, attention, status } = useSaga()
  const navigate = useNavigate()
  const location = useLocation()
  const base = `/s/${sagaId}`
  const onStageTab = location.pathname === base || location.pathname === `${base}/`

  // Grab attention brings players to the Stage tab (the DM stays where they are)
  const lastNonce = useRef(0)
  useEffect(() => {
    if (!attention || attention.nonce === lastNonce.current) return
    lastNonce.current = attention.nonce
    if (!isAdmin && !onStageTab) navigate(base)
  }, [attention, isAdmin, onStageTab, navigate, base])

  return (
    <div className="saga-shell">
      <header className="saga-header">
        <Link to="/" className="brand small" title="All sagas">SagaCraft</Link>
        <span className="saga-title">{saga.name}</span>
        <nav className="tabs">
          <NavLink to={base} end className="tab">
            Stage {live && <span className="live-dot" title="Live" />}
          </NavLink>
          {isAdmin && <NavLink to={`${base}/stages`} className="tab">Stages</NavLink>}
          <NavLink to={`${base}/characters`} className="tab">Characters</NavLink>
          <NavLink to={`${base}/locations`} className="tab">Locations</NavLink>
          <NavLink to={`${base}/items`} className="tab">Items</NavLink>
          <NavLink to={`${base}/documents`} className="tab">Documents</NavLink>
          {isAdmin && <NavLink to={`${base}/saga`} className="tab" title="How the Saga is set up: members, template, display templates">Saga</NavLink>}
        </nav>
        <span className={`conn conn-${status}`} title={status === 'online' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Offline, reconnecting…'} />
      </header>
      <main className="saga-main">
        <Outlet />
      </main>
    </div>
  )
}
