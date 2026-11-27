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
import EfxInspector from './efx/EfxInspector'
import DesktopInspector from './desktop/DesktopInspector'
import DiceInspector from './dice/DiceInspector'
import DiceSetView from './dice/DiceSetView'
import DesktopView from './desktop/DesktopView'
import TimelineInspector from './timeline/TimelineInspector'
import TimelineSetView from './timeline/TimelineSetView'
import { EfxLayerSetView } from './efx/EfxSetViews'
import PanelsInspector from './panels/PanelsInspector'
import PanelsView from './panels/PanelsView'
import { ActorsSceneIcon, DesktopIcon, DiceIcon, GraphIcon, MapIcon, PanelsIcon, TimelineIcon } from '../SetIcons'

const actorsScene: SetTypeUI = {
  key: 'actors_scene',
  name: 'Actors Scene',
  icon: ActorsSceneIcon,
  View: ActorsSceneView,
  Inspector: ActorsSceneInspector,
  PlayMenu: ScenePlayMenu,
  toolbars: [
    { key: 'main', name: 'Scene', hint: 'the tabs; Build: + Add creatures', place: { anchor: 'top-left', outside: true } },
    { key: 'turns', name: 'Turns', hint: 'the turn controls, when the tab has them', place: { anchor: 'bottom', outside: true } },
  ],
  // Grab attention: where the card is in the active tab (the DM's cards sit where the players' do)
  actorRect: (set, actorId) => {
    const { tab, cards } = tabView(set.content as ActorsSceneContent, null)
    const layout = tabLayout(tab)
    return computeLayout(cards, tab.shape, set.width, set.height - TITLE_H, layout.gap, layout.options).get(actorId) ?? null
  },
}

/** The Map: a location's map (see stage/sets/maps). (Its key is world_map: the Local map was merged into it.) */
const mapSet = (key: string, name: string): SetTypeUI => ({
  key, name, icon: MapIcon, View: MapSetView, Inspector: MapSetInspector, PlayMenu: MapSetPlayMenu, targetRect: tilesRect,
  // The map tools are in the Set bar (its menu row and tool row, plan 45): nothing on the Stage to fold away
  foldable: false,
  playerMenu: true,
  toolbars: [
    { key: 'main', name: 'Map', hint: 'the full editor, the shown location and layer, grab attention, the map tools', place: { anchor: 'top-left', outside: true } },
    { key: 'zoom', name: 'Zoom', hint: 'everyone: − Fit ＋, and Ping (players and the DM)', place: { anchor: 'bottom-right' } },
  ],
})
const worldMap = mapSet('world_map', 'Map')

/** Relationship graph: whose knowledge and which query the DM picks (see stage/sets/relationshipGraph). */
const relationshipGraph: SetTypeUI = {
  key: 'relationship_graph', name: 'Relationship graph', icon: GraphIcon, View: RelationshipGraphView, Inspector: RelationshipGraphInspector,
}

/** Timeline: the Saga's timeline, the knowledge the DM picks (see stage/sets/timeline). */
const timeline: SetTypeUI = {
  key: 'timeline', name: 'Timeline', icon: TimelineIcon, View: TimelineSetView, Inspector: TimelineInspector,
}

/** Desktop: pieces the DM lays out for the players (see stage/sets/desktop). */
const desktop: SetTypeUI = {
  key: 'desktop', name: 'Desktop', icon: DesktopIcon, View: DesktopView, Inspector: DesktopInspector,
  toolbars: [{ key: 'main', name: 'Desk', hint: '＋ Character / Item / Document / Picture, Auto or Free', place: { anchor: 'top-left', outside: true } }],
  // The desk's panel: as opaque as the DM set it, once something is on it; an empty desk is invisible and lets
  // clicks through (in Build its dashed outline and title stay, to find it)
  background: (set) => {
    const c = set.content as { background?: number; pieces?: unknown[] } | null
    if (!c?.pieces?.length) return 0
    return typeof c.background === 'number' ? c.background / 100 : null
  },
  passThrough: (set) => !(set.content as { pieces?: unknown[] } | null)?.pieces?.length,
}

/** Dice roller: roll types, a shared tray, 3D rolls (see stage/sets/dice and dice/). */
const dice: SetTypeUI = {
  key: 'dice', name: 'Dice roller', icon: DiceIcon, View: DiceSetView, Inspector: DiceInspector,
  // Clicks go through to what's under it unless dice are waiting in the tray (rolled dice still catch their own
  // clicks: dice/DiceScene.tsx); its toolbars always work
  passThrough: (set) => !(set.content as { tray?: unknown[] } | null)?.tray?.length,
  toolbars: [
    { key: 'tray', name: 'Tray', hint: 'the roll types, Roll, Clear, and the results (a row per roll)', place: { anchor: 'bottom-left' } },
  ],
}

/** Panels (plan 60): rectangles and lines to frame the Stage; drawn in Build, only shown or hidden live. */
const panels: SetTypeUI = {
  key: 'panels', name: 'Panels', icon: PanelsIcon, View: PanelsView, Inspector: PanelsInspector, passThroughLive: true, foldable: false,
  toolbars: [{ key: 'main', name: 'Panels', hint: 'Build: Select, ＋ Rectangle, ＋ Line; the picked shape forward, back, delete', place: { anchor: 'top-left', outside: true } }],
}

/** EFX layers (far, near, fore): the Stage environment's layer; let clicks through, fill their box. Their eye is
 *  on the Stage's EFX control (their own toolbar starts hidden, so full-screen layers don't stack toolbars). */
const efxLayer = (key: string, name: string): SetTypeUI => ({
  key, name, View: EfxLayerSetView, Inspector: EfxInspector, passThrough: true, fullBleed: true,
  toolbars: [{ key: 'main', name: 'Main', hint: "the eye (also on the Stage's EFX control)", place: { hidden: true } }],
})
export const SET_TYPE_UIS: Record<string, SetTypeUI> = {
  [actorsScene.key]: actorsScene, [worldMap.key]: worldMap, [relationshipGraph.key]: relationshipGraph,
  [timeline.key]: timeline,
  [desktop.key]: desktop,
  [dice.key]: dice,
  [panels.key]: panels,
  efx_far: efxLayer('efx_far', 'EFX - Far background'), efx_near: efxLayer('efx_near', 'EFX - Near background'),
  efx_fore: efxLayer('efx_fore', 'EFX - Foreground'),
}
