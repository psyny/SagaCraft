import { useEffect, useRef, useState } from 'react'
import { getToken, wsUrl } from '../api/client'

export type SocketStatus = 'connecting' | 'online' | 'offline'

/**
 * One WebSocket per open Saga. Reconnects with backoff; the server sends the live Stage on every
 * (re)connect, so a reconnecting player always catches up (NFR-4).
 */
export function useSagaSocket(sagaId: number, onMessage: (message: { type: string; [key: string]: unknown }) => void) {
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
      socket = new WebSocket(wsUrl(`/api/sagas/${sagaId}/ws?token=${encodeURIComponent(getToken() || '')}`))
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
        if (event.code === 4401) return // not a member (or signed out): don't retry
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
  }, [sagaId])

  return status
}
