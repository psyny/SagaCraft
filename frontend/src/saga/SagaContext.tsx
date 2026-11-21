import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { AttentionMessage, Category, Ruleset, SagaOverview, StageView } from '../api/types'
import { useSagaSocket, type SocketStatus } from '../realtime/useSagaSocket'

type StageListener = (stageIds: number[]) => void
type LocationListener = (locationId: number) => void

interface SagaState {
  sagaId: number
  saga: SagaOverview
  ruleset: Ruleset
  /** The Saga's character categories (the Characters tab's sections), in order. */
  categories: Category[]
  isAdmin: boolean
  live: StageView | null
  attention: (AttentionMessage & { nonce: number }) | null
  status: SocketStatus
  refreshSaga: () => Promise<void>
  onStageUpdated: (listener: StageListener) => () => void
  /** A location's map changed: refetch it (filtered for this member). */
  onLocationUpdated: (listener: LocationListener) => () => void
  /** Lets the DM apply an updated live Stage right away (before the socket echo). */
  setLive: (stage: StageView | null) => void
}

const SagaContext = createContext<SagaState | null>(null)

export function SagaProvider({ sagaId, children }: { sagaId: number; children: ReactNode }) {
  const [saga, setSaga] = useState<SagaOverview | null>(null)
  const [ruleset, setRuleset] = useState<Ruleset | null>(null)
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [live, setLive] = useState<StageView | null>(null)
  const [attention, setAttention] = useState<SagaState['attention']>(null)
  const [error, setError] = useState('')
  const listeners = useRef(new Set<StageListener>())
  const locationListeners = useRef(new Set<LocationListener>())

  const refreshSaga = useCallback(async () => {
    const [overview, list] = await Promise.all([api.saga(sagaId), api.categories(sagaId)])
    setSaga(overview)
    setCategories(list)
  }, [sagaId])

  useEffect(() => {
    setSaga(null)
    Promise.all([api.saga(sagaId), api.ruleset(sagaId), api.categories(sagaId)])
      .then(([overview, rules, list]) => {
        setSaga(overview)
        setRuleset(rules)
        setCategories(list)
      })
      .catch((e: Error) => setError(e.message))
  }, [sagaId])

  const status = useSagaSocket(sagaId, (message) => {
    if (message.type === 'live_stage') setLive((message.stage as StageView | null) ?? null)
    if (message.type === 'saga_updated') void refreshSaga()
    if (message.type === 'stage_updated') listeners.current.forEach((l) => l(message.stage_ids as number[]))
    if (message.type === 'attention') setAttention({ ...(message as unknown as AttentionMessage), nonce: Date.now() })
    if (message.type === 'location_updated') locationListeners.current.forEach((l) => l(message.id as number))
  })

  const onStageUpdated = useCallback((listener: StageListener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  const onLocationUpdated = useCallback((listener: LocationListener) => {
    locationListeners.current.add(listener)
    return () => {
      locationListeners.current.delete(listener)
    }
  }, [])

  if (error) return <div className="page-message">{error}</div>
  if (!saga || !ruleset || !categories) return <div className="page-message">Opening the saga…</div>

  return (
    <SagaContext.Provider
      value={{
        sagaId,
        saga,
        ruleset,
        categories,
        isAdmin: saga.me.role === 'admin',
        live,
        attention,
        status,
        refreshSaga,
        onStageUpdated,
        onLocationUpdated,
        setLive,
      }}
    >
      {children}
    </SagaContext.Provider>
  )
}

/** The Saga, when inside one (Set views also render in tests and previews, outside a Saga). */
export function useOptionalSaga(): SagaState | null {
  return useContext(SagaContext)
}

export function useSaga(): SagaState {
  const value = useContext(SagaContext)
  if (!value) throw new Error('useSaga outside SagaProvider')
  return value
}
