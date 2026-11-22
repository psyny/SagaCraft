import { useEffect, useRef, useState } from 'react'
import { getToken, wsUrl } from '../api/client'

export type SocketStatus = 'connecting' | 'online' | 'offline'

/**
 * One WebSocket per open Saga. Reconnects with backoff; the server sends the live Stage on every
 * (re)connect, so a reconnecting player always catches up (NFR-4).
 */
export function useSagaSocket(sagaId: number, onMessage: (message: { type: string; [key: string]: unknown }) => void) {
  return useSocket(`/api/sagas/${sagaId}/ws`, () => `?token=${encodeURIComponent(getToken() || '')}`, onMessage)
}

/** The live link's screen: the live Stage of the Saga whose live link this is (no sign-in). */
export function useLiveSocket(token: string, onMessage: (message: { type: string; [key: string]: unknown }) => void) {
  return useSocket(`/api/live/${encodeURIComponent(token)}/ws`, () => '', onMessage)
}

/** A socket to `path` that reconnects with backoff. Codes 4401 (not a member) and 4404 (no such link) don't retry. */
function useSocket(path: string, query: () => string, onMessage: (message: { type: string; [key: string]: unknown }) => void) {
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const handler = useRef(onMessage)
  handler.current = onMessage

  useEffect(() => {
    let socket: WebSocket | null = null
    let retry = 0
    let closed = false
    let pingTimer: number | undefined
    let retryTimer: number | undefined

    const connect = () => {
      setStatus('connecting')
      socket = new WebSocket(wsUrl(`${path}${query()}`))
      socket.onopen = () => {
        retry = 0
        setStatus('online')
        pingTimer = window.setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send('ping'), 25000)
      }
      socket.onmessage = (event) => {
        try {
          handler.current(JSON.parse(event.data))
        } catch {
          /* ignore malformed messages */
        }
      }
      socket.onclose = (event) => {
        window.clearInterval(pingTimer)
        if (closed) return
        setStatus('offline')
        if (event.code === 4401 || event.code === 4404) return // not a member (or signed out), or the link is gone: don't retry
        retry += 1
        retryTimer = window.setTimeout(connect, Math.min(10000, 500 * 2 ** Math.min(retry, 5)))
      }
    }

    connect()
    return () => {
      closed = true
      window.clearInterval(pingTimer)
      window.clearTimeout(retryTimer)
      socket?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  return status
}
