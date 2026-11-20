export type Role = 'admin' | 'player' | 'viewer'

export interface SagaRef {
  id: number
  name: string
  role: Role
  member_id: number
}

export interface Me {
  id: number
  login: string
  display_name: string
  system_admin: { is_root: boolean; permissions: string[] } | null
  sagas: SagaRef[]
}

export interface Member {
  id: number
  user_id: number
  display_name: string
  role: Role
  login?: string
}

export interface Group {
  id: number
  key: 'admins' | 'players' | 'viewers' | null
  name: string
  is_default: boolean
  member_ids: number[]
}

export interface SagaOverview {
  id: number
  name: string
  ruleset_key: string
  live_stage_id: number | null
  me: { member_id: number; role: Role; group_ids: number[] }
  members: Member[]
  groups: Group[]
}

export interface Visibility {
  groups: number[]
  members: number[]
}

/** A ruleset's default for players: a style, or hidden. */
export type DisplayMode = 'bar' | 'number' | 'discrete' | 'hidden'
/** How a value is drawn on a creature card. */
export type DisplayStyle = 'bar' | 'number' | 'discrete'
/**
 * Where a value shows. Cards: on the card, in the tray under it on hover, or nowhere.
 * Sheets: immersive "shown"; informative "highlight" (next to the picture) or "body".
 */
export type DisplayOn = 'card' | 'hover' | 'hidden' | 'shown' | 'highlight' | 'body'

export type CardMode = 'face' | 'full' | 'none'
export type SheetMode = 'immersive' | 'informative'
export type DisplayModeKey = CardMode | SheetMode
export type ViewKey = 'player' | 'dm'

/** How one value shows in one display mode, for one view. */
export interface ValueView {
  style: DisplayStyle
  display_on: DisplayOn
}

/** A template: per display mode, per value key, the players' and the DM's view. */
export interface TemplateConfig {
  modes: Partial<Record<DisplayModeKey, Record<string, Partial<Record<ViewKey, ValueView>>>>>
}

export interface DisplayTemplate {
  id: number
  kind: string
  name: string
  config: TemplateConfig
  /** Types this template is the default for (e.g. ["npc"]). */
  default_for: string[]
  created_at: string | null
}

export interface DisplayTemplates {
  templates: DisplayTemplate[]
  /** Default template per kind and type: {character: {pc: 3, npc: 4}} */
  defaults: Record<string, Record<string, number>>
  limits: { max_highlight: number }
}

/** One value as rendered for the viewer by the server (cards, sheets). */
export interface DisplayValue {
  key: string
  label: string
  type: string
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
  /** Numbers, text, yes/no; references come as a list of names. */
  value?: unknown
}

export interface Sheet {
  resource_id: number
  /** The name this viewer sees (null: hidden). */
  name: string | null
  type: string
  type_name: string
  picture: { url: string; face: { x: number; y: number; size: number } | null } | null
  template: { id: number | null; name: string }
  immersive: DisplayValue[]
  informative: { highlight: DisplayValue[]; body: DisplayValue[] }
  // admin only
  real_name?: string
  player_name?: string | null
}

export interface SheetPreview {
  cards: Record<ViewKey, Record<CardMode, unknown>>
  sheet: Record<ViewKey, Sheet>
}

export interface AttributeDef {
  key: string
  name: string
  type: string
  view: string[]
  edit: string[]
  required: boolean
  default: unknown
  many: boolean
  controllers: boolean
  of: { type: string; kind?: string } | null
  options: string[]
  /** Offered as a sort option in lists (e.g. Level). */
  sortable?: boolean
}

export interface TypeDef {
  name: string
  /** List section title, e.g. "NPCs". */
  plural?: string
  attributes: AttributeDef[]
  stage_display: Record<string, DisplayMode>
}

export interface Ruleset {
  key: string
  name: string
  version: string
  kinds: Record<string, { types: Record<string, TypeDef> }>
}

export interface Counter {
  current: number
  max: number
}

export interface ImageValue {
  file_id: number
  url?: string
  face: { x: number; y: number; size: number }
}

export interface Resource {
  id: number
  kind: string
  type: string
  name: string
  attributes: Record<string, unknown>
  editable: string[]
  visibility?: Visibility
  /** Admins only: the name players see. */
  presentation?: Presentation
  created_at?: string | null
  updated_at: string | null
}

/** How non-admins see a resource's name: an alias ("Hooded figure"), or no name at all. */
export interface Presentation {
  alias: string | null
  hide_name: boolean
}

export interface StageSummary {
  id: number
  name: string
  is_live: boolean
  set_count: number
}

export interface StageSetView<C = unknown> {
  id: number
  type: string
  name: string
  x: number
  y: number
  width: number
  height: number
  layer: number
  /** No background, border or title bar for players (Sets over a background image). */
  transparent?: boolean
  hidden?: boolean
  visibility?: Visibility
  content: C
}

export interface StageView {
  id: number
  name: string
  is_live: boolean
  sets: StageSetView[]
}

export interface AttentionMessage {
  type: 'attention'
  stage_id: number
  set_id: number
  actor_id: number | null
}

export type UploadCategory = 'character' | 'item' | 'document' | 'map'

export interface UploadLimits {
  ceiling_mb: number
  categories: Record<UploadCategory, { label: string; max_mb: number; max_px: number }>
}

export interface UploadedFile {
  id: number
  url: string
  content_type: string
  size: number
  width: number
  height: number
  category: UploadCategory
}

export interface SetTypeInfo {
  key: string
  name: string
  uses_actors: boolean
  actor_kinds: string[]
  default_config: Record<string, unknown>
}
