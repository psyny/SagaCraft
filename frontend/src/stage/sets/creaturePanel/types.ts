import type { DisplayStyle, DisplayOn } from '../../../api/types'

export interface CardAttribute {
  key: string
  label: string
  type: 'counter' | 'number'
  /** Players: their view. DM: the DM view. */
  style: DisplayStyle
  display_on: DisplayOn
  /** DM only: how players see it. */
  player_style?: DisplayStyle
  player_display_on?: DisplayOn
  current?: number
  max?: number
  level?: number
  levels?: number
  value?: number | null
}

/** How one value shows in one view (players' or DM's). */
export interface AttributeView {
  style: DisplayStyle
  display_on: DisplayOn
}

export interface CardAttributeConfig {
  key: string
  player: AttributeView
  dm: AttributeView
}

export type CardStyle = 'face' | 'full' | 'none'

export interface CardViewConfig {
  name: string | null
  hide_name: boolean
  /** DM view only: the card is left out of the DM's Play view (still listed in Build). */
  hidden?: boolean
}

export interface CardConfig {
  card_style: CardStyle | null
  player: CardViewConfig
  dm: CardViewConfig
  attributes: CardAttributeConfig[]
}

export interface Card {
  id: number
  resource_id: number
  order: number
  position: { x?: number; y?: number }
  /** The name in this viewer's view (null: hidden name). */
  name: string | null
  type: string
  /** Resolved card style (the card's own, or the panel's). */
  style: CardStyle
  picture: { url: string; face: { x: number; y: number; size: number } | null } | null
  attributes: CardAttribute[]
  defeated: boolean
  // admin only
  /** Hidden from the players. */
  hidden?: boolean
  /** Hidden from the DM's own view. */
  dm_hidden?: boolean
  real_name?: string
  player_name?: string | null
  config?: CardConfig
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
