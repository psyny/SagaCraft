import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { StageView } from '../api/types'
import StageCanvas from '../stage/StageCanvas'
import type { StageEditor } from '../stage/types'
import FullscreenButton from '../components/FullscreenButton'
import { lastPageKey } from './SagaLayout'
import { useSaga } from './SagaContext'

/**
 * What the DM is showing right now: always the live Stage, updated in real time, in the whole browser window
 * (no top bar; ✕ goes back to the last page). Players and viewers only watch. The DM gets the Play view: click
 * to change values, arrange, highlight.
 */
export default function StageTab() {
  const { sagaId, live, attention, isAdmin, setLive, status } = useSaga()
  const navigate = useNavigate()
  const [toast, setToast] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!attention || isAdmin) return
    setToast(attention.nonce)
    const timer = window.setTimeout(() => setToast(0), 2600)
    return () => window.clearTimeout(timer)
  }, [attention, isAdmin])

  const editor: StageEditor | undefined = useMemo(() => {
    if (!isAdmin || !live) return undefined
    return {
      sagaId,
      stage: live,
      apply: setLive,
      run: async (action) => {
        setError('')
        try {
          const result = await action()
          if (result && typeof result === 'object' && 'sets' in result && (result as StageView).id === live.id) setLive(result as StageView)
        } catch (e) {
          setError((e as Error).message)
        }
      },
      openSettings: (setId, actorId) =>
        navigate(`/s/${sagaId}/stages?stage=${live.id}&set=${setId}${actorId ? `&card=${actorId}` : ''}`),
    }
  }, [isAdmin, live, sagaId, setLive, navigate])

  const close = () => navigate(sessionStorage.getItem(lastPageKey(sagaId)) || `/s/${sagaId}/${isAdmin ? 'stages' : 'characters'}`)
  const corner = (
    <div className="stage-corner">
      <span className={`conn conn-${status}`} title={status === 'online' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Offline, reconnecting…'} />
      {isAdmin && live && <Link className="small ghost button-link" to={`/s/${sagaId}/stages?stage=${live.id}`} title="Open this Stage in Build view">✎ Build</Link>}
      <FullscreenButton />
      <button className="stage-close" onClick={close} aria-label="Close the stage" title="Back to the app">✕</button>
    </div>
  )

  if (!live) {
    return (
      <div className="stage-waiting">
        {corner}
        <motion.div className="waiting-glyph" animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 3, repeat: Infinity }}>✦</motion.div>
        <p>The stage is dark.</p>
        <p className="muted">{isAdmin ? <>Make a Stage live from <Link to={`/s/${sagaId}/stages`}>Stages</Link>.</> : 'When the DM shows something, it appears here.'}</p>
      </div>
    )
  }

  return (
    <div className="stage-tab">
      <AnimatePresence mode="wait">
        <motion.div key={live.id} className="stage-fill" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
          <StageCanvas stage={live} mode={isAdmin ? 'play' : 'view'} editor={editor} attention={attention} />
        </motion.div>
      </AnimatePresence>
      {live.layout !== 'interface' && <div className="stage-caption">{live.name}</div>}
      {corner}
      {error && <div className="error floating" onClick={() => setError('')}>{error}</div>}
      <AnimatePresence>
        {toast !== 0 && (
          <motion.div className="toast" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}>
            ◎ The DM is pointing here
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
