import type { ComponentType } from 'react'
import type { StageSetView, StageView, ToolbarPlace } from '../api/types'
import type { Rect } from './sets/actorsScene/layout'

/**
 * How a Stage is shown:
 * - view:  players and viewers (read-only),
 * - play:  the DM using the Stage at the table (looks like the players' view; popups to act),
 * - build: the DM building the Stage (move/resize Sets, click to select, settings in the side panel).
 */
export type StageMode = 'view' | 'play' | 'build'

export interface SetViewProps {
  set: StageSetView
  mode: StageMode
  /** Present for the DM (play and build): lets the view change the Set. */
  editor?: StageEditor
  selectedActorId: number | null
  onSelectActor: (actorId: number | null) => void
  /** Actor currently pointed at by grab attention (pulses), and a target of the type's own (a map's view). */
  attention: { actorId: number | null; nonce: number; target?: Record<string, unknown> } | null
}

export interface SetInspectorProps {
  set: StageSetView
  editor: StageEditor
  /** null: the Set itself is selected; otherwise only that actor's settings are shown. */
  selectedActorId: number | null
  onSelectActor: (actorId: number | null) => void
}

export interface SetMenuProps {
  set: StageSetView
  editor: StageEditor
  close: () => void
}

export interface StageEditor {
  sagaId: number
  stage: StageView
  /** Apply the Stage returned by a mutation. */
  apply: (stage: StageView) => void
  /** Run a mutation; errors show in the editor. */
  run: (action: () => Promise<StageView | unknown>) => Promise<void>
  /** Open the Build view with this Set/actor selected (from a Play popup). */
  openSettings?: (setId: number, actorId: number | null) => void
}

/** A toolbar a Set type puts its controls in (its view fills it with <Toolbar id={key}>; see stage/Toolbar.tsx). */
export interface ToolbarDef {
  key: string
  /** Shown in Build's "Controls" list. */
  name: string
  /** What it holds, e.g. "tabs, + Add creatures". */
  hint?: string
  /** Where it sits until the DM moves it. */
  place: Partial<ToolbarPlace>
}

/** The frontend half of the Set type contract (backend: set_types/base.py). */
export interface SetTypeUI {
  key: string
  name: string
  View: ComponentType<SetViewProps>
  /** Build view: settings of the Set, or of one of its actors. */
  Inspector?: ComponentType<SetInspectorProps>
  /** Play view: popup menu of the ⚙ in the Set's main toolbar (without one, the ⚙ opens Build on the Set). */
  PlayMenu?: ComponentType<SetMenuProps>
  /** Its toolbars besides the main one (or "main" itself, to name it and say where it sits). */
  toolbars?: ToolbarDef[]
  /** Never catches clicks (only its title, in Build): what's under it stays usable (an EFX layer). */
  passThrough?: boolean | ((set: StageSetView) => boolean)
  /** Its content fills the whole box, under the title (an EFX layer covering the screen). */
  fullBleed?: boolean
  /** Rect of an actor inside the Set's content area (for grab attention). */
  actorRect?: (set: StageSetView, actorId: number) => Rect | null
  /** Rect of a target of the type's own inside the content area (grab attention on map tiles). */
  targetRect?: (set: StageSetView, target: Record<string, unknown>) => Rect | null
}
