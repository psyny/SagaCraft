/** Display modes, their regions and what can show in each: mirrors backend/sagacraft/domain/display.py. */
import type {
  AttributeDef, BarShape, DiscreteIcon, DisplayModeKey, DisplayStyle, ElementColor, NumberColor, Region, Ruleset,
  TemplateConfig, TemplateElement, ViewKey, ViewRegions,
} from '../../api/types'

export const CARD_MODES = ['face', 'full', 'none'] as const
export const SHEET_MODES = ['immersive', 'informative'] as const

export const MODE_LABELS: Record<DisplayModeKey, string> = {
  face: 'Face', full: 'Full', none: 'None', immersive: 'Immersive', informative: 'Informative', token: 'Token',
}

const CARD_REGIONS: Region[] = ['top', 'bottom', 'hover_left', 'hover_right', 'hover_bottom']
export const REGIONS: Record<DisplayModeKey, Region[]> = {
  face: CARD_REGIONS,
  full: CARD_REGIONS,
  none: CARD_REGIONS,
  immersive: ['top_left', 'top_center', 'top_right', 'bottom_center', 'bottom_panel', 'hover_left', 'hover_right'],
  informative: ['header', 'body'],
  token: ['token', 'hover_top', 'hover_left', 'hover_right', 'hover_bottom'],
}

export const REGION_LABELS: Record<Region, string> = {
  top: 'Top', bottom: 'Bottom', hover_left: 'Hover left', hover_right: 'Hover right', hover_bottom: 'Hover bottom',
  top_left: 'Top left', top_center: 'Top center', top_right: 'Top right', bottom_center: 'Bottom center',
  bottom_panel: 'Bottom panel', header: 'Header', body: 'Page body', token: 'On the token', hover_top: 'Hover top',
}

export const REGION_HINTS: Partial<Record<Region, string>> = {
  top: 'The band on top of the card (one element).',
  bottom: 'The card itself.',
  hover_left: 'A tray on the left, while the pointer is on it.',
  hover_right: 'A tray on the right, while the pointer is on it.',
  hover_bottom: 'A tray under it, while the pointer is on it.',
  top_center: 'The title (one element).',
  bottom_center: 'Above the bottom panel, centred.',
  bottom_panel: 'The lower half, in two columns.',
  header: 'Next to the face, bigger.',
  body: 'The rest; more than fits a page adds pages.',
  token: 'On the token itself (a bar under it, a number on it).',
  hover_top: 'Above the token, while the pointer is on it.',
}

/** How many elements a region holds (others: any number). */
export const REGION_LIMITS: Partial<Record<Region, number>> = { top: 1, top_left: 1, top_center: 1, top_right: 1, header: 4 }

export const SYSTEM_ELEMENTS: [string, string][] = [['@name', 'Name'], ['@category', 'Category'], ['@group', 'Group']]

export const STYLE_LABELS: Record<DisplayStyle, string> = { bar: 'Bar', number: 'Number', discrete: 'Discrete', text: 'Text' }
export const BAR_SHAPES: [BarShape, string][] = [['rounded', 'Rounded'], ['flat', 'Flat']]
export const ICONS: [DiscreteIcon, string][] = [['balls', '● Balls'], ['hearts', '♥ Hearts'], ['diamonds', '◆ Diamonds'], ['squares', '■ Squares']]
/** Player: the token colour (its player's; several players: white; none: black). */
export const COLORS: [ElementColor, string][] = [['theme', 'Theme'], ['group', 'Group'], ['template', 'Template'], ['player', 'Player']]
export const NUMBER_COLORS: [NumberColor, string][] = [['contrast', 'Contrast'], ['theme', 'Theme'], ['black', 'Black'], ['white', 'White']]

export const ELEMENT_DEFAULTS: Omit<TemplateElement, 'key' | 'style'> = {
  bar: 'rounded', gradient: false, icon: 'balls', color: 'theme', number_color: 'theme', show_label: true,
}

/** Colors offered for groups and templates (any color can be typed too). */
export const PALETTE = ['#6cc9e0', '#e2604f', '#52c06e', '#e2b742', '#b48cf2', '#f08cc0', '#f0a35e', '#8fa3b8']

export const isCardMode = (mode: DisplayModeKey) => (CARD_MODES as readonly string[]).includes(mode)
/** Cards and the token show counters and numbers only. */
export const isSmallMode = (mode: DisplayModeKey) => isCardMode(mode) || mode === 'token'

/** Can this value show in this mode? Cards: counters and numbers; sheets: all but the name and the picture. */
export function applies(mode: DisplayModeKey, attr: AttributeDef): boolean {
  if (isSmallMode(mode)) return attr.type === 'counter' || attr.type === 'number'
  return attr.type !== 'image' && attr.key !== 'name'
}

/** The value styles an element can take. */
export function stylesFor(attr: AttributeDef | undefined): DisplayStyle[] {
  if (!attr) return ['text']
  if (attr.type === 'counter') return ['bar', 'number', 'discrete']
  if (attr.type === 'number') return ['number']
  return ['text']
}

/** The values a kind can show in a mode, across its types, in ruleset order. */
export function modeAttributes(ruleset: Ruleset, mode: DisplayModeKey, kind = 'character'): AttributeDef[] {
  const seen = new Map<string, AttributeDef>()
  for (const type of Object.values(ruleset.kinds[kind]?.types || {})) {
    for (const attr of type.attributes) if (applies(mode, attr) && !seen.has(attr.key)) seen.set(attr.key, attr)
  }
  return [...seen.values()]
}

/** One view's regions in a template (every region of the mode, possibly empty). */
export function viewRegions(config: TemplateConfig, mode: DisplayModeKey, view: ViewKey): Record<Region, TemplateElement[]> {
  // A mode a template was made before (the token): the server's default, the name on top
  const stored: ViewRegions = config.modes?.[mode]?.[view]
    ?? (mode === 'token' && !config.modes?.token ? { hover_top: [{ key: '@name', style: 'text', ...ELEMENT_DEFAULTS }] } : {})
  return Object.fromEntries(REGIONS[mode].map((r) => [r, stored[r] ?? []])) as Record<Region, TemplateElement[]>
}

export const newElement = (key: string, attr?: AttributeDef): TemplateElement => ({ key, style: stylesFor(attr)[0], ...ELEMENT_DEFAULTS })

/** Black or white, whichever reads better on a color. */
export function contrastOn(color: string): string {
  const hex = color.replace('#', '')
  if (hex.length !== 6) return '#fff'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.55 ? '#111' : '#fff'
}
