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
import { EfxControlsView, EfxLayerSetView } from './efx/EfxSetViews'

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

/** The Map: a location's map (see stage/sets/maps). (Its key is world_map: the Local map was merged into it.) */
const mapSet = (key: string, name: string): SetTypeUI => ({
  key, name, View: MapSetView, Inspector: MapSetInspector, PlayMenu: MapSetPlayMenu, targetRect: tilesRect,
  toolbars: [
    { key: 'main', name: 'Map', hint: 'the ⚙ settings and the locations', place: { anchor: 'top-left', outside: true } },
    { key: 'tools', name: 'Map tools', hint: 'point (drag tokens), fog brushes, highlight, grab attention, the full editor', place: { anchor: 'left', vertical: true, outside: true } },
    { key: 'zoom', name: 'Zoom', hint: 'everyone: − Fit ＋, and Ping (players and the DM)', place: { anchor: 'bottom-right' } },
  ],
})
const worldMap = mapSet('world_map', 'Map')

/** Relationship graph: whose knowledge and which query the DM picks (see stage/sets/relationshipGraph). */
const relationshipGraph: SetTypeUI = {
  key: 'relationship_graph', name: 'Relationship graph', View: RelationshipGraphView, Inspector: RelationshipGraphInspector,
}

/** Timeline: the Saga's timeline, the knowledge the DM picks (see stage/sets/timeline). */
const timeline: SetTypeUI = {
  key: 'timeline', name: 'Timeline', View: TimelineSetView, Inspector: TimelineInspector,
  // Outside, so it never covers the timeline's own tools (Expand all, Today, zoom)
  toolbars: [{ key: 'main', name: 'Timeline', hint: 'the eye and the ⚙ settings', place: { anchor: 'top-left', outside: true } }],
}

/** Desktop: pieces the DM lays out for the players (see stage/sets/desktop). */
const desktop: SetTypeUI = {
  key: 'desktop', name: 'Desktop', View: DesktopView, Inspector: DesktopInspector,
  toolbars: [{ key: 'main', name: 'Desk', hint: 'the eye, ⚙, ＋ Character / Item / Document / Picture, Auto or Free', place: { anchor: 'top-left', outside: true } }],
}

/** Dice roller: roll types, a shared tray, 3D rolls (see stage/sets/dice and dice/). */
const dice: SetTypeUI = {
  key: 'dice', name: 'Dice roller', View: DiceSetView, Inspector: DiceInspector,
  // No dice on it (none in the tray, no roll shown): clicks go through to what's under it (its toolbars still work)
  passThrough: (set) => {
    const c = set.content as { tray?: unknown[]; roll?: unknown } | null
    return !c?.tray?.length && !c?.roll
  },
  toolbars: [
    { key: 'main', name: 'Dice roller', hint: 'the eye and the ⚙ settings', place: { anchor: 'top-left', outside: true } },
    { key: 'rolls', name: 'Rolls', hint: 'the roll-type buttons (players and the DM)', place: { anchor: 'top-left' } },
    { key: 'tray', name: 'Tray', hint: 'the dice waiting (who added them) and Roll', place: { anchor: 'bottom-left' } },
    { key: 'results', name: 'Results', hint: 'the last roll, ✕ clears it', place: { anchor: 'bottom-right' } },
  ],
}

/** EFX layers (far, near, fore): the Stage environment's layer; let clicks through, fill their box. Their eye is
 *  on EFX Controls (their own toolbar starts hidden, so full-screen layers don't stack toolbars). */
const efxLayer = (key: string, name: string): SetTypeUI => ({
  key, name, View: EfxLayerSetView, Inspector: EfxInspector, passThrough: true, fullBleed: true,
  toolbars: [{ key: 'main', name: 'Main', hint: 'the eye (also on EFX Controls)', place: { hidden: true } }],
})
const efxControls: SetTypeUI = { key: 'efx_controls', name: 'EFX - Controls', View: EfxControlsView, Inspector: EfxInspector }

export const SET_TYPE_UIS: Record<string, SetTypeUI> = {
  [actorsScene.key]: actorsScene, [worldMap.key]: worldMap, [relationshipGraph.key]: relationshipGraph,
  [timeline.key]: timeline,
  [desktop.key]: desktop,
  [dice.key]: dice,
  efx_far: efxLayer('efx_far', 'EFX - Far background'), efx_near: efxLayer('efx_near', 'EFX - Near background'),
  efx_fore: efxLayer('efx_fore', 'EFX - Foreground'), efx_controls: efxControls,
}
