/**
 * "The moment in the story" the Lore views share (the timeline's slider, the relationship graph): a date, or null
 * for everything. Kept per Saga in this browser.
 */
import { useCallback, useEffect, useState } from 'react'

const key = (sagaId: number) => `sagacraft.moment.${sagaId}`
const EVENT = 'sagacraft-moment'

export function readMoment(sagaId: number): number | null {
  const raw = localStorage.getItem(key(sagaId))
  return raw === null || raw === '' || Number.isNaN(Number(raw)) ? null : Number(raw)
}

export function useMoment(sagaId: number): [number | null, (value: number | null) => void] {
  const [value, setValue] = useState<number | null>(() => readMoment(sagaId))
  useEffect(() => {
    const sync = () => setValue(readMoment(sagaId))
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [sagaId])
  const set = useCallback((next: number | null) => {
    if (next === null) localStorage.removeItem(key(sagaId))
    else localStorage.setItem(key(sagaId), String(next))
    window.dispatchEvent(new Event(EVENT))
  }, [sagaId])
  return [value, set]
}
