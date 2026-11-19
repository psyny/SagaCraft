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
/** Where a value shows: on the card, in the tray under the card on hover, or nowhere. */
export type DisplayOn = 'card' | 'hover' | 'hidden'

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
}

export interface TypeDef {
  name: string
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
  updated_at: string | null
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
