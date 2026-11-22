/**
 * Where a Set's toolbars sit (backend domain/stage_layout.py: clean_toolbars). Every Set has a main toolbar (the
 * ⚙ that opens its settings in Play); its type adds others (the Actors Scene's turn controls, a map's tools...).
 * A place: an anchor (a corner or an edge's middle), horizontal or vertical, a distance in px from the anchor,
 * a size, shown or hidden; on a canvas Stage, inside the Set or outside it (above or below for top and bottom
 * anchors and corners, beside it for left and right). Toolbars at the same anchor stack, the first nearest the edge.
 */
import type { CSSProperties } from 'react'
import type { StageSetView, ToolbarAnchor, ToolbarPlace } from '../api/types'
import type { SetTypeUI, ToolbarDef } from './types'

export const DEFAULT_PLACE: ToolbarPlace = { anchor: 'top-left', vertical: false, x: 0, y: 0, size: 'medium', hidden: false, outside: false }

/** The 3×3 picker, without the centre (a toolbar belongs on an edge). */
export const TOOLBAR_ANCHORS: (ToolbarAnchor | null)[] = ['top-left', 'top', 'top-right', 'left', null, 'right', 'bottom-left', 'bottom', 'bottom-right']

export const MAIN_TOOLBAR: ToolbarDef = { key: 'main', name: 'Main', hint: 'the ⚙ settings', place: {} }

/** A Set type's toolbars, the main one first (the type's own main, if it names one). */
export function toolbarsOf(ui: SetTypeUI | undefined): ToolbarDef[] {
  const own = ui?.toolbars ?? []
  const main = own.find((t) => t.key === 'main')
  return [main ? { ...MAIN_TOOLBAR, ...main } : MAIN_TOOLBAR, ...own.filter((t) => t.key !== 'main')]
}

/** A toolbar's place: the default, the type's default, what the DM changed. */
export const placeOf = (def: ToolbarDef, set: Pick<StageSetView, 'toolbars'>): ToolbarPlace =>
  ({ ...DEFAULT_PLACE, ...def.place, ...set.toolbars?.[def.key] })

/** 0 against the left/top edge, 1 the right/bottom, 0.5 an edge's middle. */
export const FRACTIONS: Record<ToolbarAnchor, [number, number]> = {
  'top-left': [0, 0], top: [0.5, 0], 'top-right': [1, 0], left: [0, 0.5], right: [1, 0.5],
  'bottom-left': [0, 1], bottom: [0.5, 1], 'bottom-right': [1, 1],
}

/** A sensible direction for an anchor: down the sides, across the top and bottom. */
export const verticalFor = (anchor: ToolbarAnchor) => anchor === 'left' || anchor === 'right'

/** The stack a toolbar goes in. Outside only means something on a canvas Stage. */
export const stackKey = (place: ToolbarPlace, canvas: boolean) => `${canvas && place.outside ? 'out-' : ''}${place.anchor}`

/**
 * The distance from the anchor, as margins away from the edge the toolbar is against (so the toolbars stacked
 * after it move along); on an edge's middle, a shift along that edge. Outside the Set, the edge is the Set's own
 * from the outside: above it for top anchors, below for bottom ones, beside it for left and right.
 */
export function dockStyle(place: ToolbarPlace, outside: boolean): CSSProperties {
  const [fx, fy] = FRACTIONS[place.anchor] ?? [0, 0]
  const style: CSSProperties = {}
  const shift = (axis: 'left' | 'top', v: number) => { style.position = 'relative'; style[axis] = v }
  if (outside && fy === 0.5) { // beside the Set
    if (fx === 0) style.marginRight = place.x
    else style.marginLeft = place.x
    shift('top', place.y)
    return style
  }
  if (fx === 0) style.marginLeft = place.x
  else if (fx === 1) style.marginRight = place.x
  else shift('left', place.x)
  if (fy === 0.5) shift('top', place.y)
  else if ((fy === 0) !== outside) style.marginTop = place.y
  else style.marginBottom = place.y
  return style
}
