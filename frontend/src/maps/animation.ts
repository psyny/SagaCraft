/**
 * Animated maps (plan 49): each user's choice on each of their devices (User page), not a map's setting: a weaker device
 * draws maps still (painted maps' water, trees, sails, fireflies; the weather over maps).
 */
import { useSyncExternalStore } from 'react'

const KEY = 'sagacraft.animateMaps'
const listeners = new Set<() => void>()

/** Are maps animated on this device? (default: yes) */
export function animateMaps(): boolean {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}

export function setAnimateMaps(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* private mode: for this page only */ }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) listener() }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage) }
}

export function useAnimateMaps(): boolean {
  return useSyncExternalStore(subscribe, animateMaps, () => true)
}
