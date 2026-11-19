import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { AttentionMessage, Ruleset, SagaOverview, StageView } from '../api/types'
import { useSagaSocket, type SocketStatus } from '../realtime/useSagaSocket'

type StageListener = (stageIds: number[]) => void

interface SagaState {
  sagaId: number
  saga: SagaOverview
  ruleset: Ruleset
  isAdmin: boolean
  live: StageView | null
  attention: (AttentionMessage & { nonce: number }) | null
  status: SocketStatus
  refreshSaga: () => Promise<void>
  onStageUpdated: (listener: StageListener) => () => void
  /** Lets the DM apply an updated live Stage right away (before the socket echo). */
  setLive: (stage: StageView | null) => void
}

const SagaContext = createContext<SagaState | null>(null)

export function SagaProvider({ sagaId, children }: { sagaId: number; children: ReactNode }) {
  const [saga, setSaga] = useState<SagaOverview | null>(null)
  const [ruleset, setRuleset] = useState<Ruleset | null>(null)
  const [live, setLive] = useState<StageView | null>(null)
  const [attention, setAttention] = useState<SagaState['attention']>(null)
  const [error, setError] = useState('')
  const listeners = useRef(new Set<StageListener>())

  const refreshSaga = useCallback(async () => {
    setSaga(await api.saga(sagaId))
  }, [sagaId])

  useEffect(() => {
    setSaga(null)
    Promise.all([api.saga(sagaId), api.ruleset(sagaId)])
      .then(([overview, rules]) => {
        setSaga(overview)
        setRuleset(rules)
      })
      .catch((e: Error) => setError(e.message))
  }, [sagaId])

  const status = useSagaSocket(sagaId, (message) => {
    if (message.type === 'live_stage') setLive((message.stage as StageView | null) ?? null)
    if (message.type === 'saga_updated') void refreshSaga()
    if (message.type === 'stage_updated') listeners.current.forEach((l) => l(message.stage_ids as number[]))
    if (message.type === 'attention') setAttention({ ...(message as unknown as AttentionMessage), nonce: Date.now() })
  })

  const onStageUpdated = useCallback((listener: StageListener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  if (error) return <div className="page-message">{error}</div>
  if (!saga || !ruleset) return <div className="page-message">Opening the saga…</div>

  return (
    <SagaContext.Provider
      value={{
        sagaId,
        saga,
        ruleset,
        isAdmin: saga.me.role === 'admin',
        live,
        attention,
        status,
        refreshSaga,
        onStageUpdated,
        setLive,
      }}
    >
      {children}
    </SagaContext.Provider>
  )
}

export function useSaga(): SagaState {
  const value = useContext(SagaContext)
  if (!value) throw new Error('useSaga outside SagaProvider')
  return value
}
