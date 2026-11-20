import type { CardMode, DisplayValue } from '../../../api/types'

/** One value on a card, as the server rendered it for the viewer. */
export type CardAttribute = DisplayValue

export type CardStyle = CardMode

export interface Card {
  id: number
  resource_id: number
  order: number
  position: { x?: number; y?: number }
  /** The name in this viewer's view (null: hidden name). */
  name: string | null
  type: string
  /** The panel's card style. */
  style: CardStyle
  picture: { url: string; face: { x: number; y: number; size: number } | null } | null
  attributes: CardAttribute[]
  defeated: boolean
  // admin only
  /** Hidden from the players. */
  hidden?: boolean
  real_name?: string
  player_name?: string | null
  /** The display template this card follows. */
  template?: { id: number | null; name: string }
  sort_value?: number | null
}

export type Shape = 'grid' | 'row' | 'column' | 'circle' | 'free'
export type Order = 'manual' | 'initiative'

export interface PanelConfig {
  shape: Shape
  order: Order
  card_style: CardStyle
  highlight_actor_id: number | null
  spotlight: boolean
  sort_key: string
  spacing: number
  /** Template per character type, when not the type's default. */
  templates: Record<string, number>
}

export interface CreaturePanelContent {
  shape: Shape
  order: Order
  card_style: CardStyle
  /** Space between cards, in Stage pixels (and how much bigger the circle is). */
  spacing?: number
  highlight_actor_id: number | null
  spotlight: boolean
  cards: Card[]
  config?: PanelConfig
}
