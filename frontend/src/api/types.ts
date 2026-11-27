export type Role = 'admin' | 'player' | 'viewer'

export interface SagaRef {
  id: number
  name: string
  role: Role
  member_id: number
  /** My name in that Saga (plan 42: names are each Saga's). */
  display_name: string
  /** A Stage is live there: entering it lands on the Stage, else on the Saga tab (plan 44). */
  live: boolean
}

export interface Me {
  id: number
  /** Lowercase: logins aren't case sensitive. An account has no name of its own (each Saga's: SagaRef). */
  login: string
  system_admin: { is_root: boolean; permissions: string[] } | null
  sagas: SagaRef[]
}

/** A Saga in System → Sagas (plan 43). */
export interface SystemSagaRow {
  id: number
  name: string
  ruleset_key: string
  /** Turned off: its members can't open it. */
  is_archived: boolean
  admins: string[]
  member_count: number
  /** The last time one of its members opened it. */
  last_login: string | null
  created_at: string | null
}

/** One Saga's page in System administration: its numbers, files and members (never its content). */
export interface SystemSagaDetail extends SystemSagaRow {
  template: string
  counts: {
    player_characters: number; npcs: number; items: number; documents: number; events: number; locations: number
    maps: number; relationships: number; stages: number; dms: number; players: number; viewers: number
  }
  files: { category: string; label: string; count: number; size: number }[]
  files_size: number
  members: { id: number; user_id: number; login: string; display_name: string; role: Role; last_login: string | null; account_active: boolean }[]
}

/** An account, as System → Users shows it (plan 42). */
export interface Account {
  id: number
  login: string
  is_active: boolean
  last_login: string | null
  /** Its system admin permissions (root: all), or null. */
  system_admin: { is_root: boolean; permissions: string[] } | null
  created_at: string | null
  sagas: { id: number; name: string; role: Role; display_name: string; is_archived: boolean }[]
}

export interface Member {
  id: number
  user_id: number
  /** Their name in this Saga. */
  display_name: string
  role: Role
  login?: string
  /** Their colour (token borders, pings): their own, else one from the palette. */
  color: string
}

export interface Group {
  id: number
  key: 'admins' | 'players' | 'viewers' | null
  name: string
  is_default: boolean
  member_ids: number[]
}

/** The Saga's settings (plan 37). action_dice: an action's dice are thrown on the live Stage's dice roller. */
export interface SagaSettings { action_dice: boolean }

export interface SagaOverview {
  id: number
  name: string
  ruleset_key: string
  live_stage_id: number | null
  /** Admins only: the live link's secret (null: off). See pages/LiveScreen.tsx. */
  live_token?: string | null
  /** Admins only: the Saga's settings (Saga → Settings). */
  settings?: SagaSettings
  me: { member_id: number; role: Role; group_ids: number[]; color: string | null; die_style: string
    /** Dice on this member's screen: no animations; plain dice instead of styles (Saga → User). */
    dice_still: boolean; dice_simple: boolean }
  members: Member[]
  groups: Group[]
  /** The in-world calendar every date is read with, and today in the story. */
  calendar: Calendar
  story_date: number
}

/** An in-world calendar: months with their days (the real one adds leap years). See saga/lore/dates.ts. */
export interface Calendar {
  preset: string | null
  name: string
  real: boolean
  year_label: string
  months: { name: string; days: number }[]
}

export interface CalendarView {
  calendar: Calendar
  story_date: number
  presets: { key: string; name: string; real: boolean }[]
}

export interface Visibility {
  groups: number[]
  members: number[]
  /** Resources and folders: their owners see it (or edit: a character's who can edit). */
  owner?: boolean
}

/** A ruleset's default for players: a style, or hidden. */
export type DisplayMode = 'bar' | 'number' | 'discrete' | 'hidden'
/** Value style: how a value is drawn. Counters: bar, number, discrete; numbers: number; the rest: text. */
export type DisplayStyle = 'bar' | 'number' | 'discrete' | 'text'

export type CardMode = 'face' | 'full' | 'none'
export type SheetMode = 'immersive' | 'informative'
export type TokenMode = 'token'
export type DisplayModeKey = CardMode | SheetMode | TokenMode
export type ViewKey = 'player' | 'dm'

/** Where an element shows. Cards: top (1), bottom, hover trays. Immersive: top (1 each), bottom center, bottom
 * panel, hover sides. Informative: header (at most 4), body (paged). */
export type CardRegion = 'top' | 'bottom' | 'hover_left' | 'hover_right' | 'hover_bottom'
export type ImmersiveRegion = 'top_left' | 'top_center' | 'top_right' | 'bottom_center' | 'bottom_panel' | 'hover_left' | 'hover_right'
export type InformativeRegion = 'header' | 'body'
/** A token on maps: values on it, and in trays around it while the pointer is on it. */
export type TokenRegion = 'token' | 'hover_over' | 'hover_left' | 'hover_right' | 'hover_top' | 'hover_bottom'
export type Region = CardRegion | ImmersiveRegion | InformativeRegion | TokenRegion

/** round: a pill; rounded: rounded corners; flat: square corners (plan 57: the first two were "rounded" and "flat"). */
export type BarShape = 'round' | 'rounded' | 'flat'
export type DiscreteIcon = 'balls' | 'hearts' | 'diamonds' | 'squares' | 'stars' | 'bars'
/** What a bar, or a counter's number, writes: nothing, "23 / 31", "74%". */
export type ValueShown = 'none' | 'current_max' | 'percent'
/** Where discrete icons go (plan 57): even shares, or each point moved a little per character (soft: not the half). */
export type IconLogic = 'precise' | 'full_variant' | 'soft_variant'
/** theme: the app's colors; group: the card's group; template: the template's. */
export type ElementColor = 'theme' | 'group' | 'template' | 'player'
/** Numbers on bars and in number style. contrast: black or white against the color behind. */
export type NumberColor = 'contrast' | 'theme' | 'black' | 'white'

/** One element of a region: a value (attribute key) or a system element (@name, @category, @group). */
export interface TemplateElement {
  key: string
  style: DisplayStyle
  bar: BarShape
  gradient: boolean
  value_shown: ValueShown
  icon: DiscreteIcon
  /** Discrete: how many icons (1-10), the px between them (0-50), where they go, hidden while full. */
  icons: number
  icon_gap: number
  logic: IconLogic
  hide_full: boolean
  color: ElementColor
  number_color: NumberColor
  show_label: boolean
}

export type ViewRegions = Partial<Record<Region, TemplateElement[]>>

/** A template (version 3): its color and, per display mode and view, each region's list. */
export interface TemplateConfig {
  version: 2 | 3
  color: string
  /** The token's border (characters): gradient (default), simple, chip (plan 59: `visual.token.style` instead). */
  token_style?: TokenStyle
  modes: Partial<Record<DisplayModeKey, Partial<Record<ViewKey, ViewRegions>>>>
  /** Plan 59: each mode's border (the same in both views). */
  visual?: Partial<Record<DisplayModeKey, Partial<VisualSettings>>>
}

/** Plan 59: a border's style; framed ones are drawn as a layer (components/borders/Border.tsx). */
export type BorderStyle = 'flat' | 'gradient' | 'chip' | 'neon' | 'electric' | 'hud' | 'lightframe' | 'mayan' | 'noble' | 'roses' | 'vines'
export type BorderWidth = 's' | 'm' | 'l' | 'xl'
/** A mode's border settings: its style, its colour (the owner's, the group's or `custom`) and width. */
export interface VisualSettings { style: BorderStyle; color: 'owner' | 'group' | 'custom'; custom: string; width: BorderWidth }
/** A border as drawn (the server resolves the colour). */
export interface Border { style: BorderStyle; color: string; width: BorderWidth }

export interface DisplayTemplate {
  id: number
  kind: string
  name: string
  config: TemplateConfig
  /** Categories (ids) this template is the default for. */
  default_for: string[]
  created_at: string | null
}

export interface DisplayTemplates {
  templates: DisplayTemplate[]
  /** The default per kind and type: {character: {pc: 3, npc: 4}, item: {weapon: 9}} (plan 40: types took over
   * the character categories). */
  defaults: Record<string, Record<string, number>>
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
  value_shown?: ValueShown
  icon?: DiscreteIcon
  icon_gap?: number
  /** The color to use (group's or template's); null: the theme's. */
  color?: string | null
  number_color?: NumberColor
  show_label?: boolean
  /** DM only: how players see it ('hidden' region: they don't). */
  player_style?: DisplayStyle | null
  player_region?: Region | 'hidden'
  current?: number
  max?: number
  /** A counter's min (plan 40; absent: 0). */
  min?: number
  /** Bars and counters' numbers: 0-100 from min to max (players get only this when the numbers aren't shown). */
  percent?: number
  level?: number
  levels?: number
  /** Numbers, text, yes/no; references come as a list of names; system elements: their text. */
  value?: unknown
  /** Client side (plan 58): whether this viewer may click it to change it (absent: counters and numbers, where the
   *  caller lets values be clicked). */
  changeable?: boolean
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
  /** Its frame's colour: its player's (several: white; none: black). */
  frame?: string
  /** Plan 59: each sheet mode's border. */
  borders?: Partial<Record<SheetMode, Border>>
  /** The character's group color (null: theme). */
  color?: string | null
  /** An instance's number (its own values). */
  instance?: number | null
  immersive: DisplayValue[]
  informative: DisplayValue[]
  // admin only
  real_name?: string
  player_name?: string | null
  /** Numbers and counters this viewer may change from the sheet (plan 58). */
  editable?: string[]
}

export interface SheetPreview {
  cards: Record<ViewKey, Record<CardMode, unknown>>
  sheet: Record<ViewKey, Sheet>
  /** Characters: their token, as this template draws it. */
  token?: Record<ViewKey, TokenLook & { name: string | null; icon: { url: string; face: { x: number; y: number; size: number } | null } | null }>
}

/** How a character's token is drawn: its template's border style, its frame colour, the values on and around it. */
export interface TokenLook { style: TokenStyle; color: string; values: DisplayValue[]; border?: Border }

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
  /** An optional date: when an event ends (a period on the timeline). */
  ends?: boolean
  /** Calculated variables: how the server works the value out (never typed). */
  calc?: Calc | null
  /** A character variable an archetype gives, from this level of it on. */
  archetype?: string
  level?: number
  /** ... changing at these levels (only those): a counter's max, another variable's value. */
  by_level?: LevelChange[]
}

/** An archetype variable's change at a level: its value from then on (a counter: its max). */
export interface LevelChange { level: number; value: unknown }

/** Archetypes (plan 33): races, classes, talents... each in a category, adding character variables level by level. */
export interface ArchetypeCategory { key: string; name: string }
export interface ArchetypeDef {
  key: string
  name: string
  category: string
  description: string
  max_level: number
  variables: AttributeDef[]
}
/** A character's archetype, at a level. */
export interface PickedArchetype { key: string; level: number }

/** A calculated variable's calculation: over a list (a character's inventory or groups, an item's owner, a group's
 * characters), or a formula of the thing's own numbers. */
export type Calc =
  | { op: 'sum' | 'count' | 'min' | 'max' | 'avg'; of: 'inventory' | 'groups' | 'owner' | 'characters'; variable?: string; times?: string }
  | { op: 'formula'; formula: string }

/** Where an action's costs come from and its changes go (by what it's on). */
export type ActionPlace = 'self' | 'character' | 'group' | 'group_characters'
/** An amount: fixed (a number), "max" (a change adding to or setting a counter: to its maximum) or a formula of the
 *  thing's numbers, dice rolled when the action runs ("level d20 + int"). */
export type ActionFormula = { formula: string }
export interface ActionCost { source: ActionPlace; variable: string; amount: number | ActionFormula; consume: boolean; required: boolean }
/** What a change does to its value (plan 37): adds (a counter never passes its maximum), removes (never below 0), sets. */
export type ChangeOp = 'add' | 'remove' | 'set'
export interface ActionChange { target: ActionPlace; variable: string; op: ChangeOp; amount: number | 'max' | ActionFormula }
export interface ActionTrigger { target: ActionPlace; action: string; skip_costs: boolean; skip_changes: boolean; skip_triggers: boolean }

/** A Saga template's action (a short rest, a party's long rest): costs, changes, the actions it triggers. */
export interface ActionDef {
  key: string
  name: string
  description: string
  on: 'character' | 'item' | 'group'
  /** Only these types (characters, items); empty: all. */
  types: string[]
  who: 'owner' | 'group' | 'players' | 'admins'
  /** Who is told it ran (plan 34): who ran it (the DM always is), only the DM (a secret: the player isn't told), everyone. */
  notify?: 'user' | 'dm' | 'all'
  costs: ActionCost[]
  changes: ActionChange[]
  triggers: ActionTrigger[]
}

/** An action as a character, item or group lists it: and whether this member may run it. */
export interface ActionOffer extends Omit<ActionDef, 'types'> { can: boolean }

export interface ResourceActions {
  actions: ActionOffer[]
  /** A character's party and its actions (those this member may run; the DM: all). */
  party: { id: number; name: string; actions: ActionOffer[] } | null
}

/** What running an action changed (only what this member may see). */
export interface ActionResult {
  action: string
  changes: { kind: string; id: number; name: string; key: string; variable: string; before: number; after: number }[]
  /** Formulas worked out (the ones this member may see): their dice and value. */
  rolls?: { thing: string; formula: string; rolls: { count: number; sides: number; results: number[] }[]; value: number }[]
  /** Only the DM is told (the action's notify): a player who ran it isn't told the result. */
  secret?: boolean
}

/** Someone else ran an action (plan 34): what this member may see of it. */
export interface ActionNotice extends Omit<ActionResult, 'secret'> {
  type: 'action_notice'
  /** Who ran it (their name). */
  by: string
  /** What it ran on, as this member sees it (null: something they don't see). */
  on: string | null
}

/** What a member runs actions on from the Stage's Action control, each with the actions they may run on it. */
export interface ActionActor { id: number; name: string; actions: { key: string; name: string; description: string }[] }
export type ActionActors = Record<'character' | 'item' | 'group', ActionActor[]>

export interface TypeDef {
  name: string
  /** List section title, e.g. "NPCs". */
  plural?: string
  attributes: AttributeDef[]
  stage_display: Record<string, DisplayMode>
  /** What can happen to a resource of this type in an event ("born", "discovered"). */
  sub_events?: string[]
  /** Character types (plan 40): player characters; new ones instanceable. */
  player?: boolean
  instanceable?: boolean
}

export interface Ruleset {
  key: string
  name: string
  version: string
  kinds: Record<string, { types: Record<string, TypeDef> }>
  /** Variables every group of characters has (the Saga template's). */
  group_attributes?: AttributeDef[]
  /** The Saga template's actions. */
  actions?: ActionDef[]
  /** Archetypes and their categories (plan 33). */
  archetype_categories?: ArchetypeCategory[]
  archetypes?: ArchetypeDef[]
  /** The Saga template's name, and the value turns are ordered by (e.g. initiative). */
  saga_template?: { name: string; turn_order: string | null }
}

/** A character type (plan 40: what a category was): the Characters page's sections, in the template's order. */
export interface CharacterType {
  key: string
  name: string
  plural: string
  /** Player characters (never instanceable; the players' side of the boundary layout). */
  player: boolean
  /** New characters of the type are instanceable. */
  instanceable: boolean
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
  /** Its values of the template's group variables (by key). */
  attributes?: Record<string, unknown>
  created_at: string | null
}

export interface Counter {
  current: number
  max: number
  /** How low it goes (plan 40; absent: 0). The current value stays between min and max. */
  min?: number
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
  /** Documents, items, locations: the folder it's filed in (one level). */
  folder_id?: number | null
  /** The DM's tags (any kind). */
  tags?: string[]
  /** Admins only: instances on Sets, and the character's groups. */
  instanceable?: boolean
  group_ids?: number[]
  visibility?: Visibility
  /** Characters: inactive ones stay off Actor Sets and their groups. */
  active?: boolean
  /** Characters: their archetypes, each at a level (more variables; the DM's to change). */
  archetypes?: PickedArchetype[]
  /** Its players in control (not the DM): who they share it with (all players, some players). */
  sharing?: Visibility
  /** Admins only: its folder's who can see, when the folder overrides the resource's (null: it inherits). */
  folder_visibility?: Visibility | null
  /** Admins only: shown to anyone besides the DM (its folder's choice counted). */
  shared?: boolean
  /** Admins only, kinds without Players in control: its owners (members). */
  owners?: number[]
  /** Admins only, characters: who can edit what the Saga template opens to "its players". */
  editors?: Visibility
  /** Admins and its players in control: how its name and token show. */
  presentation?: Presentation
  created_at?: string | null
  updated_at: string | null
}

/** A folder the DM files documents, items or locations in (one level). Members see it when it's shown to them or
 * holds something they see. */
export interface ResourceFolder {
  id: number
  kind: string
  name: string
  /** How many of its resources this member sees. */
  count: number
  /** Admins only: who sees what's in it; null: each resource keeps its own (inherit). */
  visibility?: Visibility | null
}

/** How non-admins see a resource's name: an alias ("Hooded figure"), or no name at all. */
export interface Presentation {
  alias: string | null
  hide_name: boolean
}

export type TokenStyle = 'gradient' | 'simple' | 'chip'

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
  /** Interface layout: where it sits on the screen (% of the screen). */
  screen?: SetScreen
  /** Where its toolbars sit: what the DM changed from the Set type's defaults (stage/toolbars.ts). */
  toolbars?: Record<string, Partial<ToolbarPlace>>
  /** No background, border or title bar for players (Sets over a background image). */
  transparent?: boolean
  /** Put away (the DM's eye): drawn for no one; players aren't sent it. */
  off?: boolean
  hidden?: boolean
  visibility?: Visibility
  content: C
}

export interface StageView {
  id: number
  name: string
  is_live: boolean
  /** canvas: a world to pan and zoom; interface: Sets fixed to the screen. */
  layout?: StageLayout
  /** EFX: its environment (the DM's; what its EFX Sets show). */
  environment_id?: number | null
  sets: StageSetView[]
  /** Its own controls (plan 33): EFX (the DM's), Actions (the DM and players) and Stages (the DM's: make any Stage
   *  live); players get `actions` only. */
  controls?: { efx?: boolean; actions: boolean; stages?: boolean }
  /** Paused by the DM (plan 58): while live, players and viewers can't act on it. */
  paused?: boolean
  /** The DM's EFX control (when it's on and the Stage has an EFX layer): the environments to switch to. */
  efx?: { current: number | null; environments: { id: number; name: string }[] }
}

// -- EFX (environment effects): see docs/concepts/efx.md and backend domain/efx.py --------------------------------

export type EfxLayerKey = 'far' | 'near' | 'fore'

export interface EfxParamSpec {
  key: string
  label: string
  type: 'number' | 'color' | 'choice' | 'bool' | 'image'
  min?: number
  max?: number
  step?: number
  options?: [string, string][]
  default: unknown
}

/** One effect of a layer: its kind, settings, intensity range (0..100) and how often it varies (s; 0: steady). */
export interface EfxEffect {
  id: string
  kind: string
  /** An uploaded picture's setting has its id; `<key>_url` is its signed URL. */
  params: Record<string, unknown>
  intensity: [number, number]
  vary: number
}

export interface EfxLayer { effects: EfxEffect[] }

export interface Environment {
  id: number
  name: string
  /** A Stage's environment, or a map weather (plan 48: only its foreground, drawn over a map). */
  kind: 'stage' | 'weather'
  far: EfxLayer
  near: EfxLayer
  fore: EfxLayer
}

export interface EfxCatalog {
  layers: Record<EfxLayerKey, string[]>
  layer_names: Record<EfxLayerKey, string>
  effects: Record<string, { name: string; intensity: string | null; params: EfxParamSpec[] }>
  max_effects: number
  max_vary: number
  examples: { key: string; name: string }[]
  /** Map weathers to start from (plan 48). */
  weather_examples: { key: string; name: string }[]
}

export type StageLayout = 'canvas' | 'interface'
export type ScreenAnchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right'

/** A Set's place in the interface layout: anchored, sized and offset in % of the screen. */
export interface SetScreen {
  anchor: ScreenAnchor
  width: number
  height: number
  x: number
  y: number
}

export type ToolbarAnchor = Exclude<ScreenAnchor, 'center'>
export type ToolbarSize = 'small' | 'medium' | 'large'

/** Where a Set's toolbar sits: on a canvas Stage from the Set's anchor (inside it or outside), on an interface
 *  Stage from the screen's; x and y are px away from the anchor. */
export interface ToolbarPlace {
  anchor: ToolbarAnchor
  vertical: boolean
  x: number
  y: number
  size: ToolbarSize
  hidden: boolean
  outside: boolean
}

/** A picture's face crop: centre and size as fractions of the picture's width. */
export interface Face { x: number; y: number; size: number }

export interface AttentionMessage {
  type: 'attention'
  stage_id: number
  set_id: number
  actor_id: number | null
  /** A Set type's own target (map tiles: {location_id, tiles}). */
  target?: Record<string, unknown>
}

export type UploadCategory = 'character' | 'icon' | 'item' | 'document' | 'map' | 'efx' | 'token' | 'desk'

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
  /** Plan 59: solid lines, dots where they meet, or crosshairs (each side's ends); a glow around them (px; 0: none). */
  style?: GridStyle
  glow?: number
  glow_color?: string
  glow_opacity?: number
}

export type GridStyle = 'solid' | 'dot' | 'crosshair'

export interface MapImage {
  id: string
  file_id: number
  x: number
  y: number
  w: number
  h: number
  scale: number
  /** Turned around its middle, degrees clockwise (-180 to 180), after it's mirrored. */
  rotation?: number
  flip_x?: boolean
  flip_y?: boolean
  /** Only the DM sees it (players' composed picture leaves it out). */
  hidden?: boolean
  name?: string
  url?: string
}

export interface MapLink {
  tile: [number, number]
  resource_id: number
  kind: string
  name: string | null
  icon: { url: string; face: { x: number; y: number; size: number } | null } | null
  /** Characters: their token as their display template draws it. */
  token?: TokenLook
  /** DM only: players don't get it (the eye in the Links tool). */
  hidden?: boolean
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
  /** How much of it is drawn, from its start, 0-100 (progress on a route; DM only: players get `cut`). */
  shown?: number
  /** Players, when partly shown: how far along it's drawn, in tiles (they only get the tiles up to there). */
  cut?: number
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
/** The map painter's settings (plan 47; the whole map's). */
export interface PainterSettings {
  /** The look: a style's key (plan 48: map_painter/styles/<style>; storybook for now) */
  style: string
  kind: 'world' | 'local'
  animated: boolean
}

/** A layer's painting as this viewer gets it (domain/map_paint.py, plan 48): per tile RLE channels (terrain, scenery,
 *  boundaries on edges, effects, roads and rivers), a palette (types in their colours), features. */
export interface MapPaint {
  /** Types in their colours; scenery at a density (plan 56: `per_tile`, sprites a tile; none: the type's own), roads
   *  and rivers at a width (times the type's own; 1 left out). */
  palette: { type: string; colors: [string, string, string]; per_tile?: number; width?: number }[]
  tiles: string
  scenery: string
  /** Boundaries (plan 50: on the edges between tiles): per tile the boundary's entry + 1 on each of its own edges
   *  (square grids east, south; hex east, south-east, south-west: painter/data.ts `ownEdges`). */
  bounds_0: string
  bounds_1: string
  bounds_2: string
  /** Per tile, a bit per own edge: the neighbour's side is the high one (cliffs). */
  bound_sides: string
  /** Environmental effects (plan 49): per tile its effect's entry + 1. */
  effects: string
  roads: string
  road_kinds: string
  rivers: string
  river_kinds: string
  river_out: string
  features: PaintFeature[]
}

/** A feature on a tile (a tower, a windmill, birds...): its size in tiles, its look among the type's. */
export interface PaintFeature {
  id: string
  type: string
  tile: [number, number]
  size: number
  variant: number
  colors: [string, string, string]
  /** DM only. */
  name?: string
  hidden?: boolean
}

export type PaintKind = 'terrain' | 'road' | 'river' | 'boundary' | 'scenery' | 'effect' | 'feature'
export type PaintLayer = 'terrain' | 'routes' | 'boundaries' | 'scenery' | 'effects' | 'features'

/** An environmental effect's particles (plan 49): scattered over its tiles (`density` a tile), each `size` tiles tall
 *  (`stretch` times as wide), `lift` tiles over the ground, in colour a, b or c; moving (`motion`: wander around, rise
 *  and fade, fall to the ground, drift sideways, pulse) `amount` tiles, `speed` times a second; `night` only at night;
 *  `glow` lights itself; `twinkle` 0..1 blinking; `spin` turns a second (leaves). */
export interface PaintParticle {
  shape: 'glow' | 'puff' | 'spark' | 'leaf' | 'bubble' | 'mote' | 'flame'
  color?: 'a' | 'b' | 'c'
  density: number
  size: [number, number]
  stretch?: number
  lift?: [number, number]
  motion?: 'still' | 'wander' | 'rise' | 'fall' | 'drift' | 'pulse'
  amount?: number
  speed?: number
  night?: boolean
  glow?: boolean
  opacity?: number
  twinkle?: number
  spin?: number
}

/** A sprite's place in a feature's look: where (feature heights from its anchor), how big, how it moves. */
export interface PaintPart {
  sprite: string
  at?: [number, number]
  size?: number
  spin?: number
  sway?: number
  frames?: string[]
  fps?: number
  fly?: number
  drift?: number
  count?: number
  /** A fire on it (plan 53): see PaintFlame. */
  flame?: PaintFlame
}

/** A fire on a sprite (plan 53: a bonfire's, a camp's): an animated flame drawn by the shader, lighting itself, where
 *  `at` says (the sprite's heights from its anchor; up is negative), `size` of its height tall, `sparks` rising. */
export interface PaintFlame {
  at?: [number, number]
  size: number
  sparks?: number
}

/** A scenery type's sprites, scattered on a jittered grid (spacing and heights in tiles). */
export interface PaintSceneryLayer {
  sprites: string[]
  spacing: number | [number, number]
  height: [number, number]
  keep: number
  jitter?: number
  sway?: number
  clear?: boolean
  /** Organic sprites (mountains, hills, trees): their foot fades into the ground over this part of their height, its
   *  edge noisy (plan 49). */
  fade?: number
  /** A fire on each of its sprites (plan 53: bonfires). */
  flame?: PaintFlame
  /** The densities it shows at (plan 56, sprites a tile): from (and below the second, when given). */
  density?: [number] | [number, number]
}

/** How a type is drawn in a style (its JSON's `art`; see docs/concepts/map-painter-art.md). */
export interface PaintArt {
  // terrain
  patches?: number
  patterns?: { kind: string; color: 'a' | 'b' | 'c'; scale: number; density: number; size: number; strength: number }[]
  fluid?: boolean
  /** A liquid's look: ocean (waves with the wind), lake (calm ripples), lava. */
  liquid?: 'ocean' | 'lake' | 'lava'
  depth?: number
  waves?: number
  // routes
  look?: string
  width?: number
  wobble?: number
  // boundaries (plan 49): look, height and thickness (tiles), gaps (ruined), sprites at the corners and gates; rivers
  // fall over it (plan 50; false: they pass through a gap)
  thickness?: number
  gaps?: number
  falls?: boolean
  /** Slopes (plan 51): how far their foot reaches out from their edge (tiles). */
  run?: number
  corner?: { sprite: string; height: number }
  gate?: { sprite: string; height: number }
  // scenery
  layers?: PaintSceneryLayer[]
  /** Named densities (plan 56, sprites a tile): each name from its density on (Village, Town, City), the Density tray's
   *  hint. */
  densities?: [number, string][]
  /** How many sprites a tile at its own density (plan 56; default: its layers' own counts). */
  per_tile?: number
  /** Its sprites stay this far (tiles) inside the painted area's outer edges (castles: inside their walls). */
  inset?: number
  night?: { fireflies?: number }
  // effects (and scenery layers)
  particles?: PaintParticle[]
  // features
  height?: number
  overhead?: boolean
  variants?: PaintPart[][]
}

export interface PaintType {
  key: string
  kind: PaintKind
  layer: PaintLayer
  category: string
  name: string
  roles: [string, string, string]
  colors: [string, string, string]
  size?: number
  art: PaintArt
}

export type PaintMaterials = Partial<Record<
  'ground' | 'terrain_edges' | 'routes' | 'boundaries' | 'water' | 'lava' | 'river' | 'waterfall' | 'flame' | 'particles' | 'light_road' | 'barrier',
  { look: string; params?: Record<string, number> }
>>

/** A map painting style (GET /map-painter/{style}): its settings, categories, types and their art, its SVG sprites. */
export interface PaintPack {
  style: { key: string; name: string; ink: string; light: string; paper_grain: number; sprite_px: number; feature_px: number; mirror_sprites?: boolean; materials?: PaintMaterials }
  /** Scenery categories' `per_tile`: the most sprites a tile (plan 56: the Density tray's 100%; default 100). */
  categories: { key: string; name: string; layer: PaintLayer; per_tile?: number }[]
  types: PaintType[]
  sprites: Record<string, string>
  version: string
}

export interface LocationMap {
  location: { id: number; name: string | null }
  version: number
  /** Map px. */
  size: [number, number]
  grid: MapGrid
  highlight?: [number, number][] | null
  /** Where no picture covers the map (#rrggbb). */
  background: string
  /** The map's layers, bottom first, and the one this is (its pictures, with those showing through; its things). */
  layers: MapLayer[]
  layer: string
  links: MapLink[]
  paths: MapPath[]
  regions: MapRegion[]
  labels?: MapLabel[]
  /** Mobile tokens the viewer sees (maps/MapTokens.tsx). */
  tokens?: MapToken[]
  /** What tiles cost to move into (plan 59; the shown layer's; players: tiles they know): "c,r" → 2, 3, or "x" blocked;
   *  any other tile costs 1. */
  moves?: Record<string, MoveCost>
  // DM: the pictures, every fog layer (per member group), the groups to paint for
  images?: MapImage[]
  fog: { enabled: boolean; layers?: Record<string, string>; states?: string | null }
  groups?: { id: number; key: string | null; name: string }[]
  // players: one composed picture for their fog
  image?: { url: string } | null
  /** The map painter (plan 47): the whole map's settings, and the layer's painting (with those showing through). */
  painter?: PainterSettings
  paint?: MapPaint | null
  /** The hour and the weather over the map (plan 48). */
  ambience?: MapAmbience
}

/** A map's daytime and weather (plan 48). */
export interface MapAmbience {
  /** 0..24. */
  hour: number
  /** One of the Saga's map weathers (EFX), with its effects (null: none). */
  weather: { id: number; name: string; fore: EfxLayer } | null
}

/** A map's layer: a floor, the cave under the forest... (its pictures, tokens, links, paths, regions, labels). */
export interface MapLayer {
  id: string
  name: string
  /** Where it has no picture, the layers under it show. */
  see_through: boolean
}

export type MapTokenKind = 'character' | 'item' | 'group' | 'custom'

/** A mobile token on a tile: drawn for this viewer (a character or item they can't see: no name, no icon). */
export interface MapToken {
  id: string
  kind: MapTokenKind
  tile: [number, number]
  /** How many tiles it covers (1 to 10). */
  size: number
  name: string | null
  icon: { url: string; face: { x: number; y: number; size: number } | null } | null
  /** Its border: its player's colour (several: white; none: black), a group's colour. */
  color: string
  style: TokenStyle
  /** Plan 59: its border (style, colour, width), as its display template draws it. */
  border?: Border
  /** Characters: the values their template places on and around the token. */
  values?: DisplayValue[]
  /** Players and viewers, on a map Set of the live Stage (plan 58): whether they may drag it now. */
  movable?: boolean
  /** The DM: its resource; others: a character they can see (its sheet). */
  ref?: number | null
  // DM only
  visibility?: Visibility
  file_id?: number | null
  /** Who moves it besides the DM, and when (plan 58). */
  move_by?: TokenMoveBy
  move_when?: TokenMoveWhen
}

/** Who moves a token besides the DM (plan 58): nobody, every player, its players (a character's, an item's owners),
 * everyone who sees it (viewers too); and when: always, or on its character's turn. */
export type TokenMoveBy = 'dm' | 'players' | 'owners' | 'anyone'
export type TokenMoveWhen = 'always' | 'turn'

/** A ping: a member pointing at a tile of a map Set (live, a few seconds). */
export interface PingMessage {
  type: 'ping'
  stage_id: number
  set_id: number
  location_id: number
  tile: [number, number]
  member_id: number
  name: string
  color: string
}

/** The DM dragging a token on a map Set (plan 39): where it would land (null: the drag ended, or it's hidden from
 * you there), and where it was. Nothing is saved: the drop moves it. */
export interface TokenDragMessage {
  type: 'token_drag'
  stage_id: number
  set_id: number
  location_id: number
  token: string
  tile: [number, number] | null
  origin: [number, number] | null
  member_id: number
  /** The end of a drag that moved it (the map follows): else put back, a cancel, or hidden from you there. */
  dropped: boolean
}

/** A move being planned (plan 59): its route from the token (null: no plan any more, or hidden from you). */
export interface TokenRouteMessage {
  type: 'token_route'
  stage_id: number
  set_id: number
  location_id: number
  token: string
  origin: [number, number] | null
  path: [number, number][] | null
  member_id: number
  /** The move was made (not planned any more): the token goes along the route. */
  moved?: boolean
}

/** What a tile costs to move into besides the usual 1 (plan 59): 2, 3, or "x" (blocked). */
export type MoveCost = 2 | 3 | 'x'

/** What map Sets hear live: pings, token drags and planned moves. */
export type MapMessage = PingMessage | TokenDragMessage | TokenRouteMessage

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
  ends?: boolean
  options?: string[]
  sortable?: boolean
  calc?: Calc | null
  category?: string
  of?: { type?: string; kind?: string }
  /** An archetype's variable: the level it comes at, and its changes at later levels. */
  level?: number
  by_level?: LevelChange[]
}

/** An archetype as a Saga template document holds it (its variables edited with kind "archetype"). */
export interface TemplateArchetype { key: string; name: string; category: string; description: string; max_level: number; variables: TemplateVariable[] }

export interface TemplateType {
  name: string
  plural?: string
  attributes?: TemplateVariable[]
  overrides?: Record<string, { view?: string[]; edit?: string[] }>
  stage_display?: Record<string, string>
  sub_events?: string[]
  /** Character types (plan 40): player characters; new ones instanceable. */
  player?: boolean
  instanceable?: boolean
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
  /** Variables every group of characters has (edited with kind "group"). */
  group_attributes?: TemplateVariable[]
  /** Rules: actions on characters, items and groups (Template › Actions). */
  actions?: ActionDef[]
  /** Archetypes (Template › Archetypes): their categories, and the archetypes with their variables by level. */
  archetype_categories?: ArchetypeCategory[]
  archetypes?: TemplateArchetype[]
  starting?: {
    groups?: StartingGroup[]
    turn_order?: string | null
    actors_tabs?: StartingTab[]
    /** The Dice roller Sets' roll types (stage/sets/dice/types.ts: RollType); none: d4 to d100. */
    dice_rolls?: import('../stage/sets/dice/types').RollType[]
  }
  display_templates?: unknown[]
  fog_presets?: unknown[]
  /** In files only (plan 41): the Saga's EFX environments and Stages (their Sets' settings). */
  environments?: unknown[]
  stages?: unknown[]
}

export interface SagaTemplateView {
  template: SagaTemplateDoc
  /** The Saga has its own copy (every Saga since plan 41; before, a Saga read the built-in one until changed). */
  own_copy: boolean
  /** Resources per kind and type. */
  usage: Record<string, Record<string, number>>
  /** Characters per archetype. */
  archetype_usage?: Record<string, number>
  kinds: string[]
  new_types: string[]
  display_templates: number
  fog_presets: number
  /** What else goes with an export (plan 41). */
  environments?: number
  stages?: number
  groups?: number
}

/** A document's page: a text (title and text) or a picture (and its title). */
export interface DocumentPage {
  id: string
  kind: 'text' | 'image'
  title: string
  text?: string
  image?: ImageValue
}

// -- Lore: relationships, events, eras ------------------------------------------------------

/** A relationship type: predefined (ref is its key) or a member group's own (ref "c12"). */
export interface RelationshipType {
  ref: string
  id: number | null
  group_id: number | null
  label: string
  inverse: string
  directed: boolean
  from_kinds: string[]
  to_kinds: string[]
  predefined: boolean
}

/** One end of a relationship, as this member sees it (hidden: a resource they can't see). */
export interface Endpoint {
  id: number | null
  hidden: boolean
  kind: string | null
  type: string | null
  name: string | null
  icon: string | null
  /** The icon is the picture's face crop (no icon of its own). */
  face?: Face | null
}

export interface Relationship {
  id: number
  group_id: number
  group_name: string | null
  from: Endpoint
  to: Endpoint
  type: RelationshipType
  note: string
  /** Dates (null: always). */
  start: number | null
  end: number | null
  /** The event it started at (its relationship sub-event), if this member sees it. */
  event_id: number | null
  created_by: { member_id: number | null; role: 'admin' | 'player' }
  created_at: string | null
  editable: boolean
  /** Admins: the relationship it was revealed from; whether its event was made for it. */
  source_id?: number | null
  owns_event?: boolean
}

export interface RelationshipBody {
  group_id?: number
  from_id?: number
  to_id?: number
  /** A type's ref, or a new type. */
  type?: string | { label: string; inverse?: string; directed?: boolean }
  note?: string
  start?: number | null
  end?: number | null
  event_id?: number | null
}

export interface GraphNode {
  id: string
  resource_id: number | null
  kind: string | null
  type: string | null
  name: string | null
  icon: string | null
  face?: Face | null
  hidden: boolean
  /** One of the resources the query started from. */
  start: boolean
  /** The location map: the node's cluster (its parent place's node id). */
  group?: string | null
}

export interface GraphEdge {
  id: string
  relationship_id: number | null
  from: string
  to: string
  label: string
  inverse: string
  directed: boolean
  /** A ruleset reference (a location's parent, an inventory), not a relationship. */
  reference: boolean
  group_id: number | null
  created_role: 'admin' | 'player' | null
  note: string
  start: number | null
  end: number | null
  type_ref: string | null
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  groups?: number[]
}

export interface GraphQuery {
  mode: 'all' | 'characters' | 'around' | 'set'
  ids?: number[]
  hops?: number
  groups?: number[]
  kinds?: string[]
  types?: string[]
  creator?: 'admins' | 'players' | number | null
  at?: number | null
  references?: boolean
}

/** A resource sub-event: what happened to one resource in an event. */
export interface SubEvent {
  id: number
  resource: Endpoint
  what: string
  note: string
  position: number
}

/** An event as the timeline and its page show it. */
export interface EventView extends Resource {
  date: number | null
  /** When it ends, if it's a period (never before its date). */
  end: number | null
  created_by: number | null
  sub_events: SubEvent[]
  relationships: Relationship[]
}

export interface Era {
  id: number
  name: string
  start: number
  end: number | null
  color: string
  note: string
  visibility?: Visibility
}

export interface Timeline {
  events: EventView[]
  eras: Era[]
}

export type LabelPin = 'pin' | 'dot' | 'star' | 'flag' | 'diamond' | 'none'

/** A marker on a location's map: a pin and a text (beside or above it), maybe shown only on click. */
export interface MapLabel {
  id: string
  text: string
  /** Map px. */
  point: [number, number]
  pin: LabelPin
  side: 'above' | 'left' | 'right'
  size: 'small' | 'medium' | 'large'
  color: string
  on_click: boolean
  visibility?: Visibility
}
