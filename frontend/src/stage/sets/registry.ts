/** Registry of Set type UIs. Register new types here (and in backend/sagacraft/set_types/__init__.py). */
import { TITLE_H } from '../constants'
import type { SetTypeUI } from '../types'
import ActorsSceneInspector from './actorsScene/ActorsSceneInspector'
import ActorsSceneView, { BAR_H, hasStrip, STRIP_H } from './actorsScene/ActorsSceneView'
import { computeLayout, tabLayout } from './actorsScene/layout'
import { ScenePlayMenu } from './actorsScene/PlayMenus'
import { tabView, type ActorsSceneContent } from './actorsScene/types'

const actorsScene: SetTypeUI = {
  key: 'actors_scene',
  name: 'Actors Scene',
  View: ActorsSceneView,
  Inspector: ActorsSceneInspector,
  PlayMenu: ScenePlayMenu,
  // Grab attention: where the card is in the active tab (what players see), on this screen (the DM's: Play view)
  actorRect: (set, actorId) => {
    const content = set.content as ActorsSceneContent
    const { tab, cards } = tabView(content, null)
    const strip = hasStrip(content) ? STRIP_H + (tab.turn_controls ? BAR_H : 0) : 0
    const layout = tabLayout(tab)
    const rect = computeLayout(cards, tab.shape, set.width, set.height - TITLE_H - strip, layout.gap, layout.options).get(actorId)
    return rect ? { ...rect, y: rect.y + strip } : null
  },
}

export const SET_TYPE_UIS: Record<string, SetTypeUI> = { [actorsScene.key]: actorsScene }
