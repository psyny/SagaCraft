import type { DocumentPage, Sheet } from '../../../api/types'
import type { Card } from '../actorsScene/types'

export type DeskLayout = 'auto' | 'free' | 'focus'
export type CharacterMode = 'face' | 'full' | 'none' | 'immersive' | 'informative'

/** A piece's place in Free layout: fractions of the Set (w: of its width), its angle and stacking. */
export interface PiecePlace { x?: number; y?: number; w?: number; rot?: number; z?: number }

interface Base {
  id: number
  position: PiecePlace
  caption: string
  /** DM only: shown to players (else only the DM sees it, faded). */
  shown?: boolean
  resource_id?: number
  template_id?: number | null
}

export type Piece =
  | (Base & { kind: 'character'; mode: CharacterMode; card?: Card; sheet?: Sheet })
  | (Base & { kind: 'item'; sheet: Sheet; tier: ItemTier | null; icon: { url: string } | null })
  | (Base & { kind: 'document'; title: string | null; page: number; count: number; current: DocumentPage | null })
  | (Base & { kind: 'image'; url: string; ratio: number })

/** An item's first choice variable (DnD Lite: rarity) and its place among the options. */
export interface ItemTier { key: string; label: string; name: string; index: number; of: number }

/** What the server renders for a Desktop Set (backend set_types/desktop.py). */
export interface DesktopContent {
  layout: DeskLayout
  gap: number
  /** The desk's panel opacity, % (0: see-through). */
  background?: number
  pieces: Piece[]
  /** Focus layout: the piece in the middle (null: none, e.g. the DM's is hidden from this viewer). */
  focus_id?: number | null
  /** DM only. */
  config?: { layout: DeskLayout; gap: number }
  templates?: { character: { id: number; name: string }[]; item: { id: number; name: string }[] }
}
