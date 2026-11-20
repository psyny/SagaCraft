/** Display modes and what can show in each: mirrors backend/sagacraft/domain/display.py. */
import type { AttributeDef, DisplayModeKey, DisplayOn, Ruleset, TemplateConfig, ValueView, ViewKey } from '../../api/types'

export const CARD_MODES = ['face', 'full', 'none'] as const
export const SHEET_MODES = ['immersive', 'informative'] as const

export const MODE_LABELS: Record<DisplayModeKey, string> = {
  face: 'Face', full: 'Full', none: 'None', immersive: 'Immersive', informative: 'Informative',
}

export const PLACES: Record<DisplayModeKey, [DisplayOn, string][]> = {
  face: [['card', 'Card'], ['hover', 'Hover'], ['hidden', 'Hidden']],
  full: [['card', 'Card'], ['hover', 'Hover'], ['hidden', 'Hidden']],
  none: [['card', 'Card'], ['hover', 'Hover'], ['hidden', 'Hidden']],
  immersive: [['shown', 'Shown'], ['hidden', 'Hidden']],
  informative: [['highlight', 'Highlight'], ['body', 'Body'], ['hidden', 'Hidden']],
}

export const isCardMode = (mode: DisplayModeKey) => (CARD_MODES as readonly string[]).includes(mode)

/** Can this value show in this mode? Cards: counters and numbers; sheets: all but the name and the picture. */
export function applies(mode: DisplayModeKey, attr: AttributeDef): boolean {
  if (isCardMode(mode)) return attr.type === 'counter' || attr.type === 'number'
  return attr.type !== 'image' && attr.key !== 'name'
}

/** The values a kind can show in a mode, across its types, in ruleset order. */
export function modeAttributes(ruleset: Ruleset, mode: DisplayModeKey, kind = 'character'): AttributeDef[] {
  const seen = new Map<string, AttributeDef>()
  for (const type of Object.values(ruleset.kinds[kind]?.types || {})) {
    for (const attr of type.attributes) if (applies(mode, attr) && !seen.has(attr.key)) seen.set(attr.key, attr)
  }
  return [...seen.values()]
}

const shownPlace = (mode: DisplayModeKey, attr: AttributeDef): DisplayOn => {
  if (isCardMode(mode)) return 'card'
  if (mode === 'immersive') return 'shown'
  return attr.type === 'counter' || attr.type === 'number' ? 'highlight' : 'body'
}

/** How a value shows in a template (with the server's fallbacks: players hidden, DM shown). */
export function currentView(config: TemplateConfig, mode: DisplayModeKey, attr: AttributeDef, view: ViewKey): ValueView {
  const stored = config.modes?.[mode]?.[attr.key]?.[view]
  const style = attr.type === 'counter' ? 'bar' : 'number'
  const result: ValueView = stored ? { ...stored } : { style, display_on: view === 'dm' ? shownPlace(mode, attr) : 'hidden' }
  if (attr.type !== 'counter') result.style = 'number'
  return result
}
