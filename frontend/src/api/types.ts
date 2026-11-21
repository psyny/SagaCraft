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
/** Value style: how a value is drawn. Counters: bar, number, discrete; numbers: number; the rest: text. */
export type DisplayStyle = 'bar' | 'number' | 'discrete' | 'text'

export type CardMode = 'face' | 'full' | 'none'
export type SheetMode = 'immersive' | 'informative'
export type DisplayModeKey = CardMode | SheetMode
export type ViewKey = 'player' | 'dm'

/** Where an element shows. Cards: top (1), bottom, hover trays. Immersive: top (1 each), bottom center, bottom
 * panel, hover sides. Informative: header (at most 4), body (paged). */
export type CardRegion = 'top' | 'bottom' | 'hover_left' | 'hover_right' | 'hover_bottom'
export type ImmersiveRegion = 'top_left' | 'top_center' | 'top_right' | 'bottom_center' | 'bottom_panel' | 'hover_left' | 'hover_right'
export type InformativeRegion = 'header' | 'body'
export type Region = CardRegion | ImmersiveRegion | InformativeRegion

export type BarShape = 'rounded' | 'flat'
export type DiscreteIcon = 'balls' | 'hearts' | 'diamonds' | 'squares'
/** theme: the app's colors; group: the card's group; template: the template's. */
export type ElementColor = 'theme' | 'group' | 'template'
/** Numbers on bars and in number style. contrast: black or white against the color behind. */
export type NumberColor = 'contrast' | 'theme' | 'black' | 'white'

/** One element of a region: a value (attribute key) or a system element (@name, @category, @group). */
export interface TemplateElement {
  key: string
  style: DisplayStyle
  bar: BarShape
  gradient: boolean
  icon: DiscreteIcon
  color: ElementColor
  number_color: NumberColor
  show_label: boolean
}

export type ViewRegions = Partial<Record<Region, TemplateElement[]>>

/** A template (version 2): its color and, per display mode and view, each region's list. */
export interface TemplateConfig {
  version: 2
  color: string
  modes: Partial<Record<DisplayModeKey, Partial<Record<ViewKey, ViewRegions>>>>
}

export interface DisplayTemplate {
  id: number
  kind: string
  name: string
  config: TemplateConfig
  /** Categories (ids) this template is the default for. */
  default_for: number[]
  created_at: string | null
}

export interface DisplayTemplates {
  templates: DisplayTemplate[]
  /** Built-in default per kind and type: {character: {pc: 3, npc: 4}}; categories' own: {categories: {"7": 5}} */
  defaults: Record<string, Record<string, number>>
  /** The template each category uses by default (its own, else its type's). */
  category_defaults: Record<string, number | null>
  limits: { max_header: number; region_limits: Record<string, number> }
}

/** One element as rendered for the viewer by the server (cards, sheets), with its view style. */
export interface DisplayValue {
  key: string
  label: string
  /** The attribute's type, or 'system' (name, category, group). */
  type: string
  region: Region
  style: DisplayStyle
  bar?: BarShape
  gradient?: boolean
  icon?: DiscreteIcon
  /** The color to use (group's or template's); null: the theme's. */
  color?: string | null
  number_color?: NumberColor
  show_label?: boolean
  /** DM only: how players see it ('hidden' region: they don't). */
  player_style?: DisplayStyle | null
  player_region?: Region | 'hidden'
  current?: number
  max?: number
  level?: number
  levels?: number
  /** Numbers, text, yes/no; references come as a list of names; system elements: their text. */
  value?: unknown
}

export interface Sheet {
  resource_id: number
  /** The name this viewer sees (null: hidden). */
  name: string | null
  type: string
  type_name: string
  category_name?: string
  picture: { url: string; face: { x: number; y: number; size: number } | null } | null
  template: { id: number | null; name: string }
  /** The character's group color (null: theme). */
  color?: string | null
  /** An instance's number (its own values). */
  instance?: number | null
  immersive: DisplayValue[]
  informative: DisplayValue[]
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
  /** Images: the upload category (sizes, how many in a gallery). */
  category?: UploadCategory | null
  /** A resource_ref to the same kind: the hierarchy (a Location's "part of"). */
  parent?: boolean
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
  /** The Saga template's name, and the value turns are ordered by (e.g. initiative). */
  saga_template?: { name: string; turn_order: string | null }
}

/** How a Saga organizes its characters (Player, DM, NPC...). Based on a ruleset type. */
export interface Category {
  id: number
  key: string | null
  name: string
  plural: string
  type: string
  /** Player characters (never instanceable; the left side of the boundary layout). */
  player: boolean
  /** Default of "instanceable" for new characters. */
  instanceable: boolean
  sort_order: number
  /** Admins: how many characters use it. */
  count?: number
}

/** A group of characters: the party, an encounter. DM only. */
export interface CharacterGroup {
  id: number
  name: string
  player_party: boolean
  active: boolean
  favorite: boolean
  /** Its cards' color (current-turn highlight, "group" colored values). */
  color: string
  sort_order: number
  /** Instanceable characters have a count (each becomes an instance on a Set). */
  members: { resource_id: number; count: number }[]
  created_at: string | null
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
  category_id?: number | null
  /** Documents: the folder it's filed in (one level). */
  folder_id?: number | null
  /** The DM's tags (any kind). */
  tags?: string[]
  /** Admins only: instances on Sets, and the character's groups. */
  instanceable?: boolean
  group_ids?: number[]
  visibility?: Visibility
  /** Admins only: the name players see. */
  presentation?: Presentation
  created_at?: string | null
  updated_at: string | null
}

/** A folder the DM files documents in (one level). Members see it only when it holds something they see. */
export interface ResourceFolder {
  id: number
  kind: string
  name: string
  /** How many of its resources this member sees. */
  count: number
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
  /** A Set type's own target (map tiles: {location_id, tiles}). */
  target?: Record<string, unknown>
}

export type UploadCategory = 'character' | 'icon' | 'item' | 'document' | 'map'

export interface UploadLimits {
  ceiling_mb: number
  /** max_count: pictures of the category per resource (a gallery, a location's map). */
  categories: Record<UploadCategory, { label: string; max_mb: number; max_px: number; max_count: number }>
}

// -- locations' maps ------------------------------------------------------------

export type GridType = 'none' | 'square' | 'hex'
export type GridMode = 'color' | 'contrast' | 'inverse'
/** Fog of war per tile: 0 unknown, 1 known, 2 visible. */
export type FogState = '0' | '1' | '2'

export interface MapGrid {
  type: GridType
  /** Square: side; hex (pointy-top): width. In map px. */
  size: number
  x: number
  y: number
  cols: number
  rows: number
  /** Columns and rows follow the pictures. */
  auto: boolean
  unit_size: number
  unit: string
  color: string
  opacity: number
  mode: GridMode
  line: number
}

export interface MapImage {
  id: string
  file_id: number
  x: number
  y: number
  w: number
  h: number
  scale: number
  url?: string
}

export interface MapLink {
  tile: [number, number]
  resource_id: number
  kind: string
  name: string | null
  icon: { url: string; face: { x: number; y: number; size: number } | null } | null
}

export type PathBody = 'solid' | 'dashed' | 'dotted' | 'arrows' | 'arrowheads'
export type PathEnd = 'none' | 'arrow' | 'circle'

export interface MapPath {
  id: string
  name: string
  tiles: [number, number][]
  color: string
  width: number
  body: PathBody
  head: PathEnd
  tail: PathEnd
  render: 'poly' | 'spline'
  /** DM only. */
  visibility?: Visibility
}

export type RegionShow = 'fill' | 'border' | 'both'
export type RegionLine = 'solid' | 'dashed' | 'dotted'

/** A named set of tiles (a kingdom, a forest, a district): its tiles filled, outlined, or both. */
export interface MapRegion {
  id: string
  name: string
  tiles: [number, number][]
  show: RegionShow
  /** The border's colour. */
  color: string
  fill: string
  opacity: number
  width: number
  line: RegionLine
  render: 'poly' | 'spline'
  /** Its name shows on the map. */
  label: boolean
  /** DM only. */
  visibility?: Visibility
}

/** A location's map as the server rendered it for this viewer. */
export interface LocationMap {
  location: { id: number; name: string | null }
  version: number
  /** Map px. */
  size: [number, number]
  grid: MapGrid
  highlight?: [number, number][] | null
  links: MapLink[]
  paths: MapPath[]
  regions: MapRegion[]
  // DM: the pictures, every fog layer (per member group), the groups to paint for
  images?: MapImage[]
  fog: { enabled: boolean; layers?: Record<string, string>; states?: string | null }
  groups?: { id: number; key: string | null; name: string }[]
  // players: one composed picture for their fog
  image?: { url: string } | null
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

/** How map Sets draw the fog of war, built by the DM on the Locations page. */
export interface FogPreset {
  id: number
  name: string
  look: import('../maps/shader').FogLook
}

/** A variable (ruleset attribute) as a Saga template document holds it. */
export interface TemplateVariable {
  key: string
  name: string
  type: string
  view?: string[]
  edit?: string[]
  required?: boolean
  default?: unknown
  many?: boolean
  controllers?: boolean
  parent?: boolean
  options?: string[]
  sortable?: boolean
  category?: string
  of?: { type?: string; kind?: string }
}

export interface TemplateType {
  name: string
  plural?: string
  attributes?: TemplateVariable[]
  overrides?: Record<string, { view?: string[]; edit?: string[] }>
  stage_display?: Record<string, string>
}

export interface StartingGroup { name: string; color: string; player_party: boolean; active: boolean; favorite: boolean }
export interface StartingTab { name: string; layout: string; turns: boolean }

/** A Saga template: what a Saga is built on (exported and imported as a JSON file). */
export interface SagaTemplateDoc {
  format?: string
  format_version?: number
  key?: string
  name: string
  version?: string
  description?: string
  kinds: Record<string, { attributes?: TemplateVariable[]; types: Record<string, TemplateType> }>
  starting?: {
    categories?: { key: string; name: string; plural: string; type: string; player: boolean; instanceable: boolean }[]
    groups?: StartingGroup[]
    turn_order?: string | null
    actors_tabs?: StartingTab[]
  }
  display_templates?: unknown[]
  fog_presets?: unknown[]
}

export interface SagaTemplateView {
  template: SagaTemplateDoc
  /** The Saga has its own copy (else it reads the built-in one). */
  own_copy: boolean
  /** Resources per kind and type. */
  usage: Record<string, Record<string, number>>
  kinds: string[]
  new_types: string[]
  categories: { id: number; name: string; type: string }[]
  display_templates: number
  fog_presets: number
}

/** A document's page: a text (title and text) or a picture (and its title). */
export interface DocumentPage {
  id: string
  kind: 'text' | 'image'
  title: string
  text?: string
  image?: ImageValue
}
