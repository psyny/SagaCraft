/** Registry of Set type UIs. Register new types here (and in backend/sagacraft/set_types/__init__.py). */
import { TITLE_H } from '../constants'
import type { SetTypeUI } from '../types'
import ActorsSceneInspector from './actorsScene/ActorsSceneInspector'
import ActorsSceneView from './actorsScene/ActorsSceneView'
import { computeLayout, tabLayout } from './actorsScene/layout'
import { ScenePlayMenu } from './actorsScene/PlayMenus'
import { tabView, type ActorsSceneContent } from './actorsScene/types'
import MapSetInspector, { MapSetPlayMenu } from './maps/MapSetInspector'
import MapSetView, { tilesRect } from './maps/MapSetView'
import RelationshipGraphInspector from './relationshipGraph/RelationshipGraphInspector'
import RelationshipGraphView from './relationshipGraph/RelationshipGraphView'

const actorsScene: SetTypeUI = {
  key: 'actors_scene',
  name: 'Actors Scene',
  View: ActorsSceneView,
  Inspector: ActorsSceneInspector,
  PlayMenu: ScenePlayMenu,
  toolbars: [
    { key: 'main', name: 'Scene', hint: 'the ⚙ settings and the tabs; Build: + Add creatures', place: { anchor: 'top-left', outside: true } },
    { key: 'turns', name: 'Turns', hint: 'the turn controls, when the tab has them', place: { anchor: 'bottom', outside: true } },
  ],
  // Grab attention: where the card is in the active tab (the DM's cards sit where the players' do)
  actorRect: (set, actorId) => {
    const { tab, cards } = tabView(set.content as ActorsSceneContent, null)
    const layout = tabLayout(tab)
    return computeLayout(cards, tab.shape, set.width, set.height - TITLE_H, layout.gap, layout.options).get(actorId) ?? null
  },
}

/** World map and Local map: a location's map (see stage/sets/maps). */
const mapSet = (key: string, name: string): SetTypeUI => ({
  key, name, View: MapSetView, Inspector: MapSetInspector, PlayMenu: MapSetPlayMenu, targetRect: tilesRect,
  toolbars: [
    { key: 'main', name: 'Map', hint: 'the ⚙ settings and the locations', place: { anchor: 'top-left', outside: true } },
    { key: 'tools', name: 'Map tools', hint: 'point, fog brushes, highlight, the full editor', place: { anchor: 'left', vertical: true, outside: true } },
    { key: 'zoom', name: 'Zoom', hint: 'everyone: − Fit ＋', place: { anchor: 'bottom-right' } },
  ],
})
const worldMap = mapSet('world_map', 'World map')
const localMap = mapSet('local_map', 'Local map')

/** Relationship graph: whose knowledge and which query the DM picks (see stage/sets/relationshipGraph). */
const relationshipGraph: SetTypeUI = {
  key: 'relationship_graph', name: 'Relationship graph', View: RelationshipGraphView, Inspector: RelationshipGraphInspector,
}

export const SET_TYPE_UIS: Record<string, SetTypeUI> = {
  [actorsScene.key]: actorsScene, [worldMap.key]: worldMap, [localMap.key]: localMap, [relationshipGraph.key]: relationshipGraph,
}
