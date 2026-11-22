/**
 * Saga → Settings (the DM): the **live link**, a web address showing the live Stage, as a viewer, to anyone who has
 * it (a TV, a tablet, a second screen at the table), with no sign-in and nothing else of the app. Off by default;
 * "New link" makes a new address (screens on the old one stop). See services/live_link.py.
 */
import { useState } from 'react'
import { api } from '../api'
import Segmented from '../components/Segmented'
import { useSaga } from './SagaContext'

/** Pure: the live screen's full address for a token. */
export const liveUrl = (token: string, origin = window.location.origin) => `${origin}/live/${token}`

export default function SagaSettingsPage() {
  const { sagaId, saga, isAdmin, refreshSaga } = useSaga()
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  if (!isAdmin) return <div className="page-message">Only the Saga's admins change its settings.</div>
  const token = saga.live_token ?? null
  const run = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
      await refreshSaga()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const copy = async () => {
    if (!token) return
    try {
      await navigator.clipboard.writeText(liveUrl(token))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Copying was refused: select the address and copy it.')
    }
  }
  return (
    <div className="page settings-page">
      <header className="page-header"><h1>Settings</h1></header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      <section className="settings-card">
        <h2>Live link</h2>
        <p className="muted">A web address that shows the live Stage, as a viewer sees it, to anyone who opens it: no sign-in,
          and nothing else of the Saga. Handy for a TV, a tablet or a second screen at the table.</p>
        <Segmented<'off' | 'on'> value={token ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]}
          onChange={(v) => void run(() => api.setLiveLink(sagaId, v === 'on'))} />
        {token && (
          <>
            <div className="live-link-row">
              <input readOnly value={liveUrl(token)} aria-label="Live link" onFocus={(e) => e.target.select()} />
              <button className="primary" onClick={() => void copy()}>{copied ? 'Copied ✓' : 'Copy'}</button>
              <a className="button-link" href={liveUrl(token)} target="_blank" rel="noreferrer">Open ↗</a>
            </div>
            <div className="button-row">
              <button onClick={() => window.confirm('Make a new link? Screens on the current one stop and need the new address.')
                && void run(() => api.newLiveLink(sagaId))}>New link</button>
              <span className="muted small">Anyone with the address can watch: share it like a key. A new link (or Off) cuts off the old one.</span>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
