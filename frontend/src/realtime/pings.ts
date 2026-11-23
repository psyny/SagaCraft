/**
 * Pings arriving live (a member pointing at a map tile): map Sets subscribe here. The Saga's socket
 * (saga/SagaContext.tsx) and the live link's screen (pages/LiveScreen.tsx) feed it. Nothing is stored.
 */
import { createContext, useContext, useRef } from 'react'
import type { PingMessage } from '../api/types'

export type PingListener = (ping: PingMessage) => void
export type PingSubscribe = (listener: PingListener) => () => void

export const PingContext = createContext<PingSubscribe | null>(null)
export const usePings = () => useContext(PingContext)

/** A small hub: `emit` from the socket handler, `subscribe` goes in the context. */
export function usePingHub() {
  const listeners = useRef(new Set<PingListener>())
  const subscribe = useRef<PingSubscribe>((listener) => {
    listeners.current.add(listener)
    return () => { listeners.current.delete(listener) }
  }).current
  const emit = useRef((ping: PingMessage) => listeners.current.forEach((l) => l(ping))).current
  return { subscribe, emit }
}

/** How long a ping shows (ms). */
export const PING_MS = 10000
