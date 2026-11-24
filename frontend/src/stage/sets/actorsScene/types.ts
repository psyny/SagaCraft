import type { CardMode, DisplayValue, Sheet, SheetMode } from '../../../api/types'

/** One value on a card, as the server rendered it for the viewer. */
export type CardAttribute = DisplayValue

/** A card style: a card mode, or a sheet mode (the sheet drawn in the card). */
export type CardStyle = CardMode | SheetMode

/** What changes with a card's style. */
export interface CardLook { style: CardStyle; picture: Card['picture']; attributes: CardAttribute[]; sheet?: Sheet }

export interface Card {
  /** The actor id: one card in the scene (the same in every tab). */
  id: number
  resource_id: number
  /** An instance's number ("Goblin 2"); null for the character itself. */
  instance?: number | null
  /** The active tab's free position (players); the DM reads `tabs`. */
  position: { x?: number; y?: number }
  /** The name in this viewer's view (null: hidden name). */
  name: string | null
  type: string
  category_id?: number | null
  /** Boundary layout: player characters on the left. */
  side?: 'player' | 'other'
  /** The scene's default card style. */
  style: CardStyle
  /** A sheet style: the sheet drawn in the card. */
  sheet?: Sheet
  /**
   * The card in the other styles it's drawn in (card styles are the tab's; the card comes in the active tab's): the
   * DM's other tabs' styles, and a turn bar's evidence style for its current creature.
   */
  looks?: Partial<Record<CardStyle, CardLook>>
  picture: { url: string; face: { x: number; y: number; size: number } | null } | null
  /** Its frame's colour (its player's; several: white; none: black). */
  frame?: string
  attributes: CardAttribute[]
  defeated: boolean
  /** Its group's color (current-turn highlight, "group" colored values); null: the theme's. */
  color?: string | null
  // admin only
  /** The group its color comes from: the one it was added with, else the character's first. */
  group?: { id: number; name: string } | null
  /** Hidden from players in the active tab (the DM reads `tabs` for other tabs). */
  hidden?: boolean
  /** Per tab: shown or hidden there, its free position there (every tab has every card). */
  tabs?: Record<string, { shown: boolean; position: { x?: number; y?: number } }>
  real_name?: string
  player_name?: string | null
  /** The display template this card follows. */
  template?: { id: number | null; name: string }
  instanceable?: boolean
  /** Its character is inactive (resting, retired): players don't get it; the DM sees it only in Build. */
  inactive?: boolean
  /** Values the order can follow (e.g. initiative), for the order tray. */
  sort_values?: Record<string, number>
}

export type Shape = 'grid' | 'row' | 'column' | 'circle' | 'bar' | 'boundary' | 'free'
export type Flow = 'static' | 'rotate'
export type TurnAction = 'start' | 'next' | 'previous' | 'end'

export interface Turn {
  actor_id: number | null
  round: number
}

/** A tab as the server rendered it for the viewer (players: only the active one). */
export interface SceneTab {
  id: number
  name: string
  shape: Shape
  flow: Flow
  /** Boundary: each card's random shift, up to this many px on x and on y (0: tidy). */
  scatter: number
  /** Boundary: % of the width, in the middle, with no cards. */
  neutral: number
  /** Space between cards (grid, row, turn bar: horizontal). */
  spacing: number
  /** Vertical space between cards (grid; turn bar: between the bar and the drawn card). */
  spacing_y: number
  /** Top margin: the scene's top to the first cards. */
  margin_top: number
  /** Sides margin: the edges to the cards (layouts that start from an edge). */
  margin_sides: number
  /** The cards' size, % of a card. */
  card_size: number
  /** Turn bar: the current card's size, % of a card (at most what fits). */
  current_size: number
  /** How its cards are drawn (cards and sheets). */
  card_style: CardStyle
  /** The card in evidence (the turn bar's current creature). */
  evidence_card_style: CardStyle
  /** 'custom' or a sortable value's key. */
  order_by: string
  turn: Turn
  highlight_actor_id: number | null
  spotlight: boolean
  /** The scene's cards in this tab's order (already rotated when the flow rotates). Players: only shown ones. */
  card_ids: number[]
  // admin only
  order?: number[]
  /** The tab's cards in order, not rotated: who goes first. */
  sequence?: number[]
  turn_controls?: boolean
}

export interface ActorsSceneContent {
  active_tab: number
  /** The active tab. */
  tab: SceneTab
  /** Players: the active tab's shown cards. DM: every card of the scene. */
  cards: Card[]
  // admin only
  tabs?: SceneTab[]
  /** Values the order can follow: [key, name]. */
  sort_keys?: [string, string][]
  /** The value turns usually follow (the Saga template's, e.g. initiative). */
  turn_order?: string | null
  config?: SceneConfig
}

export interface SceneConfig {
  /** Template per category id, when not the category's default. */
  templates: Record<string, number>
  active_tab: number
}

/** A card as it is in one tab. */
export interface TabCard extends Card {
  hidden?: boolean
}

export const FLOW_SHAPES: Shape[] = ['grid', 'row', 'column', 'circle']

/**
 * One tab of the scene, ready to draw: the tab and its cards in order, with that tab's shown/hidden state and
 * free positions. `tabId` null: the active tab (players always get the active one).
 */
export function tabView(content: ActorsSceneContent, tabId: number | null): { tab: SceneTab; cards: TabCard[] } {
  const tab = (tabId !== null && content.tabs?.find((t) => t.id === tabId)) || content.tab
  const byId = new Map(content.cards.map((c) => [c.id, c]))
  const cards = tab.card_ids.flatMap((id) => {
    const card = byId.get(id)
    if (!card) return []
    const inTab = card.tabs?.[String(tab.id)]
    const drawn = inStyle(card, tab.card_style)
    return [inTab ? { ...drawn, hidden: !inTab.shown, position: inTab.position || {} } : drawn]
  })
  return { tab, cards }
}

/** A card in a style: its own when it's drawn that way, else that look, if it came (else as it is). */
export function inStyle<T extends Card>(card: T, style: CardStyle | undefined): T {
  if (!style || card.style === style) return card
  const look = card.looks?.[style]
  return look ? { ...card, ...look } : card
}
