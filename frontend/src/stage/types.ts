import type { ComponentType } from 'react'
import type { StageSetView, StageView } from '../api/types'
import type { Rect } from './sets/creaturePanel/layout'

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
  /** Actor currently pointed at by grab attention (pulses). */
  attention: { actorId: number | null; nonce: number } | null
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

/** The frontend half of the Set type contract (backend: set_types/base.py). */
export interface SetTypeUI {
  key: string
  name: string
  View: ComponentType<SetViewProps>
  /** Build view: settings of the Set, or of one of its actors. */
  Inspector?: ComponentType<SetInspectorProps>
  /** Play view: popup menu when the DM clicks the Set's title. */
  PlayMenu?: ComponentType<SetMenuProps>
  /** Rect of an actor inside the Set's content area (for grab attention). */
  actorRect?: (set: StageSetView, actorId: number) => Rect | null
}
