/**
 * The Panels Set in Build (plan 60): the tool (select, draw a rectangle, draw a line) and the selected shape, per Set,
 * shared by its view (drawing on the Stage), its main toolbar and its side panel.
 */
import { useSyncExternalStore } from 'react'

export type PanelTool = 'select' | 'rect' | 'line'
const tools = new Map<number, PanelTool>()
const selected = new Map<number, number | null>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export function setPanelTool(setId: number, tool: PanelTool): void { tools.set(setId, tool); notify() }
export function selectShape(setId: number, id: number | null): void { selected.set(setId, id); notify() }
export const usePanelTool = (setId: number): PanelTool => useSyncExternalStore(subscribe, () => tools.get(setId) ?? 'select', () => 'select')
export const useSelectedShape = (setId: number): number | null => useSyncExternalStore(subscribe, () => selected.get(setId) ?? null, () => null)
