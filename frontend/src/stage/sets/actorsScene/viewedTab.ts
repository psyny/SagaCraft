/**
 * Which tab the DM is building, per scene (Build view only: the tab strip and the side panel share it).
 * Building another tab never changes what players see; in the Play view the strip switches the active tab.
 */
import { useSyncExternalStore } from 'react'

const viewed = new Map<number, number>()
const listeners = new Set<() => void>()

export function setViewedTab(setId: number, tabId: number): void {
  viewed.set(setId, tabId)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The tab being built, or null (then the active tab is shown). */
export function useViewedTab(setId: number): number | null {
  return useSyncExternalStore(subscribe, () => viewed.get(setId) ?? null, () => null)
}

// "Add creatures" for a scene: opened from popups and the side panel, drawn by the scene's view (which stays
// mounted when the popup that opened it closes).
const adding = new Set<number>()

export function openAddCreatures(setId: number, open = true): void {
  if (open) adding.add(setId)
  else adding.delete(setId)
  listeners.forEach((l) => l())
}

export function useAddCreatures(setId: number): boolean {
  return useSyncExternalStore(subscribe, () => adding.has(setId), () => false)
}
