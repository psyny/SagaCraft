import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSaga } from './SagaContext'
import SectionBar from './SectionTabs'

/** Where the Stage tab's close button goes back to (this tab's last other page). */
export const lastPageKey = (sagaId: number) => `sagacraft.lastPage.${sagaId}`

export default function SagaLayout() {
  const { sagaId, saga, isAdmin, live, attention, status } = useSaga()
  const navigate = useNavigate()
  const location = useLocation()
  const base = `/s/${sagaId}`
  const onStageTab = location.pathname === base || location.pathname === `${base}/`

  // The Stage tab takes the whole window; its close button returns to the last page
  useEffect(() => {
    if (!onStageTab) sessionStorage.setItem(lastPageKey(sagaId), location.pathname + location.search)
  }, [onStageTab, location.pathname, location.search, sagaId])

  // Grab attention brings players to the Stage tab (the DM stays where they are)
  const lastNonce = useRef(0)
  useEffect(() => {
    if (!attention || attention.nonce === lastNonce.current) return
    lastNonce.current = attention.nonce
    if (!isAdmin && !onStageTab) navigate(base)
  }, [attention, isAdmin, onStageTab, navigate, base])

  return (
    <div className={`saga-shell ${onStageTab ? 'stage-only' : ''}`}>
      {!onStageTab && <header className="saga-header">
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
          <NavLink to={`${base}/lore`} className="tab" title="Documents, events and the timeline, relationships">Lore</NavLink>
          {isAdmin && <NavLink to={`${base}/efx`} className="tab" title="Environment effects: skies, landscapes, weather for your Stages">EFX</NavLink>}
          <NavLink to={`${base}/saga`} className="tab" title={isAdmin ? 'How the Saga is set up: members, template, display templates; your account' : 'Your account: name, password, colour'}>Saga</NavLink>
        </nav>
        <span className={`conn conn-${status}`} title={status === 'online' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Offline, reconnecting…'} />
      </header>}
      {!onStageTab && <SectionBar />}
      <main className="saga-main">
        <Outlet />
      </main>
    </div>
  )
}
