/** The Actors Scene's named commands (UX-6: buttons, shortcuts and later voice/AI send the same). */
import { api } from '../../../api'
import type { StageEditor } from '../../types'
import type { Shape, Flow, TurnAction } from './types'

export interface TabChanges {
  name?: string
  shape?: Shape
  flow?: Flow
  scatter?: number
  neutral?: number
  spacing?: number
  spacing_y?: number
  top?: number
  turn_controls?: boolean
  order_by?: string
}

export function sceneCommands(editor: StageEditor, setId: number) {
  const run = (name: string, args: Record<string, unknown> = {}) =>
    editor.run(() => api.setCommand(editor.sagaId, setId, name, args))
  return {
    switchTab: (tabId: number) => run('tab.switch', { tab_id: tabId }),
    addTab: (name = '') => run('tab.add', { name }),
    renameTab: (tabId: number, name: string) => run('tab.rename', { tab_id: tabId, name }),
    moveTab: (tabId: number, to: number) => run('tab.move', { tab_id: tabId, to }),
    deleteTab: (tabId: number) => run('tab.delete', { tab_id: tabId }),
    setTab: (tabId: number, changes: TabChanges) => run('tab.set', { tab_id: tabId, changes }),
    showCard: (tabId: number, actorId: number, shown: boolean) => run('card.show', { tab_id: tabId, actor_id: actorId, shown }),
    showAll: (tabId: number, shown: boolean) => run('cards.show_all', { tab_id: tabId, shown }),
    placeCard: (tabId: number, actorId: number, x: number, y: number) => run('card.position', { tab_id: tabId, actor_id: actorId, x, y }),
    orderBy: (tabId: number, by: string) => run('order.set', { tab_id: tabId, by }),
    setOrder: (tabId: number, actorIds: number[]) => run('order.set', { tab_id: tabId, actor_ids: actorIds }),
    moveCard: (tabId: number, actorId: number, by: number) => run('order.move', { tab_id: tabId, actor_id: actorId, by }),
    turn: (tabId: number, action: TurnAction) => run('turn', { tab_id: tabId, action }),
    highlight: (tabId: number, actorId: number | null, spotlight = false) => run('highlight', { tab_id: tabId, actor_id: actorId, spotlight }),
  }
}

export type SceneCommands = ReturnType<typeof sceneCommands>
