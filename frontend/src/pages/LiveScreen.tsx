/**
 * The live link's screen (/live/<token>): the Saga's live Stage, full screen, as a viewer sees it, for a TV, a tablet
 * or a second screen. No sign-in and nothing else of the app: the Stage follows the DM in real time; when the DM turns
 * the link off or makes a new one, the screen says so. See services/live_link.py.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import type { AttentionMessage, Calendar, MapMessage, StageView } from '../api/types'
import FullscreenButton from '../components/FullscreenButton'
import { PingContext, usePingHub } from '../realtime/pings'
import { useLiveSocket } from '../realtime/useSagaSocket'
import { CalendarContext } from '../saga/SagaContext'
import StageCanvas from '../stage/StageCanvas'

export default function LiveScreen() {
  const { token = '' } = useParams()
  const [saga, setSaga] = useState<{ name: string; calendar: Calendar } | null>(null)
  const [stage, setStage] = useState<StageView | null>(null)
  const [closed, setClosed] = useState(false)
  const [attention, setAttention] = useState<(AttentionMessage & { nonce: number }) | null>(null)

  useEffect(() => {
    api.liveScreen(token).then((r) => { setSaga(r.saga); setStage(r.stage) }).catch(() => setClosed(true))
  }, [token])
  const pings = usePingHub()
  const status = useLiveSocket(token, (message) => {
    if (message.type === 'ping' || message.type === 'token_drag') pings.emit(message as unknown as MapMessage)
    if (message.type === 'live_stage') setStage((message.stage as StageView | null) ?? null)
    if (message.type === 'live_closed') setClosed(true)
    if (message.type === 'attention') setAttention({ ...(message as unknown as AttentionMessage), nonce: Date.now() })
  })
  useEffect(() => {
    document.title = saga ? `${saga.name}: live` : 'SagaCraft: live'
  }, [saga])

  if (closed) {
    return (
      <div className="stage-waiting">
        <div className="waiting-glyph">✦</div>
        <p>This live link doesn't work any more.</p>
        <p className="muted">The DM turned it off or made a new one: ask them for the new link.</p>
      </div>
    )
  }
  const corner = (
    <div className="stage-corner">
      <span className={`conn conn-${status}`} title={status === 'online' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Offline, reconnecting…'} />
      <FullscreenButton />
    </div>
  )
  if (!stage) {
    return (
      <div className="stage-waiting">
        {corner}
        <motion.div className="waiting-glyph" animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 3, repeat: Infinity }}>✦</motion.div>
        <p>{saga ? saga.name : 'The stage is dark.'}</p>
        <p className="muted">When the DM shows something, it appears here.</p>
      </div>
    )
  }
  return (
    <PingContext.Provider value={pings.subscribe}>
    <CalendarContext.Provider value={saga?.calendar ?? null}>
      <div className="stage-tab live-screen">
        <AnimatePresence mode="wait">
          <motion.div key={stage.id} className="stage-fill" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            <StageCanvas stage={stage} mode="view" attention={attention} />
          </motion.div>
        </AnimatePresence>
        {stage.layout !== 'interface' && <div className="stage-caption">{stage.name}</div>}
        {corner}
      </div>
    </CalendarContext.Provider>
    </PingContext.Provider>
  )
}
