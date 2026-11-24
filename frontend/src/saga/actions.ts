/**
 * The Saga template's actions, in words: where their costs come from and their gains go, who runs them, and a
 * short summary of what one does ("Spends 1 Hit dice · +5 HP"). Pure: the panels and the Template page use it.
 * See docs/implementation/30-actions-and-calculated-variables.md.
 */
import type { ActionDef, ActionFormula, ActionPlace, ActionResult, Ruleset } from '../api/types'

export type ActionOn = ActionDef['on']

/** Where values come from or go, by what the action is on (the server checks the same). */
export const PLACES: Record<ActionOn, ActionPlace[]> = {
  character: ['self', 'group'],
  item: ['self', 'character', 'group'],
  group: ['self', 'group_characters'],
}

/** The kind of thing a place is. */
export function placeKind(on: ActionOn, place: ActionPlace): ActionOn {
  if (place === 'self') return on
  return place === 'group' ? 'group' : 'character'
}

/** A place, in the editor's pickers. */
export const PLACE_LABELS: Record<ActionOn, Partial<Record<ActionPlace, string>>> = {
  character: { self: 'The character', group: 'Its party' },
  item: { self: 'The item', character: 'Its owner', group: "Its owner's party" },
  group: { self: 'The group', group_characters: 'Each of its characters' },
}

/** A place, after a value in a summary ("+5 HP (its party)"). */
const WHERE: Record<ActionPlace, string> = { self: '', character: ' (its owner)', group: ' (its party)', group_characters: ' (each of its characters)' }

export const WHO_LABELS: Record<ActionDef['who'], string> = {
  owner: 'Its players',
  group: "Its party's players",
  players: 'Any player',
  admins: 'Only the DM',
}

export const WHO_HINTS: Record<ActionDef['who'], string> = {
  owner: "A character's players in control (an item: its owner's; a group: its characters')",
  group: "The players of every character in its party (a group: its characters')",
  players: 'Every player of the Saga',
  admins: 'The DM only (the DM can always run an action)',
}

export const NOTIFY_LABELS: Record<NonNullable<ActionDef['notify']>, string> = {
  user: 'Who ran it',
  dm: 'Only the DM',
  all: 'Everyone',
}

export const NOTIFY_HINTS: Record<NonNullable<ActionDef['notify']>, string> = {
  user: 'Whoever runs it sees the result; the DM is told too',
  dm: "A secret: only the DM is told the result (a player who runs it isn't)",
  all: 'Everyone in the Saga is told, each seeing only what they may see',
}

export const ON_LABELS: Record<ActionOn, string> = { character: 'Characters', item: 'Items', group: 'Groups' }

type Described = Pick<ActionDef, 'on' | 'costs' | 'gains' | 'triggers'>

const number = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100))
const amount = (a: number | ActionFormula) => (typeof a === 'number' ? number(a) : `(${a.formula})`)
export const isFormula = (a: unknown): a is ActionFormula => typeof a === 'object' && a !== null && 'formula' in a

/** A formula's dice, as typed: "2d6", "level d20", "d20" (the server rolls them). */
export const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100]

/** A worked-out formula, in words: "level d20 + 1: 4 + 17 + 9 … = 31". */
export function describeRoll(roll: NonNullable<ActionResult['rolls']>[number]): string {
  const dice = roll.rolls.map((r) => `${r.count}d${r.sides} (${r.results.join(' + ') || '—'})`).join(', ')
  return `${roll.formula}${dice ? `: ${dice}` : ''} = ${roll.value}`
}

/** What an action does, one line per cost, gain and trigger. `nameOf` names a variable of a kind; `actionName` an
 * action (a trigger's). */
export function describeAction(action: Described, nameOf: (kind: ActionOn, key: string) => string,
  actionName: (key: string) => string): string[] {
  const lines: string[] = []
  for (const cost of action.costs) {
    const name = nameOf(placeKind(action.on, cost.source), cost.variable)
    const verb = !cost.consume ? 'Needs' : cost.required ? 'Spends' : 'Spends up to'
    lines.push(`${verb} ${amount(cost.amount)} ${name}${WHERE[cost.source]}`)
  }
  for (const gain of action.gains) {
    const name = nameOf(placeKind(action.on, gain.target), gain.variable)
    lines.push(gain.amount === 'max' ? `${name} back to its max${WHERE[gain.target]}` : `+${amount(gain.amount)} ${name}${WHERE[gain.target]}`)
  }
  for (const trigger of action.triggers) {
    const skipped = [trigger.skip_costs && 'costs', trigger.skip_gains && 'gains', trigger.skip_triggers && 'what it triggers'].filter(Boolean)
    lines.push(`Then ${actionName(trigger.action)}${WHERE[trigger.target]}${skipped.length ? `, without its ${skipped.join(' and ')}` : ''}`)
  }
  return lines
}

/** A ruleset's names for describeAction: a kind's variables (every type's) and the group variables; its actions. */
export function rulesetNames(ruleset: Ruleset) {
  const names = new Map<string, string>()
  for (const kind of ['character', 'item'] as const) {
    for (const type of Object.values(ruleset.kinds[kind]?.types || {})) {
      for (const a of type.attributes) if (!names.has(`${kind}:${a.key}`)) names.set(`${kind}:${a.key}`, a.name)
    }
  }
  for (const a of ruleset.group_attributes || []) names.set(`group:${a.key}`, a.name)
  const actions = new Map((ruleset.actions || []).map((a) => [a.key, a.name]))
  return {
    nameOf: (kind: ActionOn, key: string) => names.get(`${kind}:${key}`) ?? key,
    actionName: (key: string) => actions.get(key) ?? key,
  }
}

/** Does this action apply to a character or item of this type? */
export function appliesTo(action: Pick<ActionDef, 'on' | 'types'>, kind: string, type: string | null): boolean {
  return action.on === kind && (!action.types.length || (type !== null && action.types.includes(type)))
}
