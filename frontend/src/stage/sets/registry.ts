/** Registry of Set type UIs. Register new types here (and in backend/sagacraft/set_types/__init__.py). */
import { TITLE_H } from '../constants'
import type { SetTypeUI } from '../types'
import CreaturePanelInspector from './creaturePanel/CreaturePanelInspector'
import CreaturePanelView from './creaturePanel/CreaturePanelView'
import { computeLayout } from './creaturePanel/layout'
import { PanelPlayMenu } from './creaturePanel/PlayMenus'
import type { CreaturePanelContent } from './creaturePanel/types'

const creaturePanel: SetTypeUI = {
  key: 'creature_panel',
  name: 'Creature panel',
  View: CreaturePanelView,
  Inspector: CreaturePanelInspector,
  PlayMenu: PanelPlayMenu,
  actorRect: (set, actorId) => {
    const content = set.content as CreaturePanelContent
    return computeLayout(content.cards, content.shape, set.width, set.height - TITLE_H).get(actorId) || null
  },
}

export const SET_TYPE_UIS: Record<string, SetTypeUI> = { [creaturePanel.key]: creaturePanel }
