import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { ActionNotice, AttentionMessage, Calendar, CharacterType, MapMessage, Ruleset, SagaOverview, StageView } from '../api/types'
import { PingContext, usePingHub } from '../realtime/pings'
import { useSagaSocket, type SocketStatus } from '../realtime/useSagaSocket'
import ActionNotices, { type ShownNotice } from './ActionNotices'
import { characterTypes as typesOf } from './characterTypes'

type StageListener = (stageIds: number[]) => void
type LocationListener = (locationId: number) => void

interface SagaState {
  sagaId: number
  saga: SagaOverview
  ruleset: Ruleset
  /** The Saga's character types (the Characters tab's sections; plan 40: what categories were), in order. */
  characterTypes: CharacterType[]
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

export const SagaContext = createContext<SagaState | null>(null)

export function SagaProvider({ sagaId, children }: { sagaId: number; children: ReactNode }) {
  const [saga, setSaga] = useState<SagaOverview | null>(null)
  const [ruleset, setRuleset] = useState<Ruleset | null>(null)
  const [live, setLive] = useState<StageView | null>(null)
  const [attention, setAttention] = useState<SagaState['attention']>(null)
  const [error, setError] = useState('')
  const listeners = useRef(new Set<StageListener>())
  const locationListeners = useRef(new Set<LocationListener>())

  // The Saga changed (its members, template...): everything the pages read from it again, the template's rules too
  // (new variables, types, actions, archetypes show in forms and sheets without reloading the page)
  const refreshSaga = useCallback(async () => {
    const [overview, rules] = await Promise.all([api.saga(sagaId), api.ruleset(sagaId)])
    setSaga(overview)
    setRuleset(rules)
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
  const characterTypes = useMemo(() => (ruleset ? typesOf(ruleset) : []), [ruleset])

  // Actions someone else ran (the DM: every one; everyone: those that tell everyone)
  const [notices, setNotices] = useState<ShownNotice[]>([])
  const noticeId = useRef(0)
  const dismissNotice = useCallback((id: number) => setNotices((list) => list.filter((n) => n.id !== id)), [])
  const pings = usePingHub()
  const status = useSagaSocket(sagaId, (message) => {
    if (message.type === 'ping' || message.type === 'token_drag') pings.emit(message as unknown as MapMessage)
    if (message.type === 'live_stage') setLive((message.stage as StageView | null) ?? null)
    if (message.type === 'saga_updated') void refreshSaga()
    if (message.type === 'stage_updated') listeners.current.forEach((l) => l(message.stage_ids as number[]))
    if (message.type === 'attention') setAttention({ ...(message as unknown as AttentionMessage), nonce: Date.now() })
    if (message.type === 'location_updated') locationListeners.current.forEach((l) => l(message.id as number))
    if (message.type === 'action_notice') setNotices((list) => [...list.slice(-4), { ...(message as unknown as ActionNotice), id: ++noticeId.current }])
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
  if (!saga || !ruleset) return <div className="page-message">Opening the saga…</div>

  return (
    <SagaContext.Provider
      value={{
        sagaId,
        saga,
        ruleset,
        characterTypes,
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
      <PingContext.Provider value={pings.subscribe}>{children}</PingContext.Provider>
      <ActionNotices notices={notices} onDismiss={dismissNotice} />
    </SagaContext.Provider>
  )
}

/** The Saga's calendar where there's no Saga context (the live link's screen: pages/LiveScreen.tsx). */
export const CalendarContext = createContext<Calendar | null>(null)

/** The calendar dates are read with: the Saga's, else the live screen's. */
export function useCalendar(): Calendar | null {
  const saga = useContext(SagaContext)
  const live = useContext(CalendarContext)
  return saga?.saga.calendar ?? live
}

/** The Saga, when inside one (Set views also render in tests and previews, outside a Saga, and on the live link's
 * screen, where they only show). */
export function useOptionalSaga(): SagaState | null {
  return useContext(SagaContext)
}

export function useSaga(): SagaState {
  const value = useContext(SagaContext)
  if (!value) throw new Error('useSaga outside SagaProvider')
  return value
}
