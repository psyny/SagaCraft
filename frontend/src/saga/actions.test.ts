import { describe, expect, it } from 'vitest'
import type { ActionDef } from '../api/types'
import { appliesTo, describeAction, placeKind } from './actions'

const names: Record<string, string> = { 'character:hp': 'HP', 'character:hit_dice': 'Hit dice', 'group:rations': 'Rations' }
const nameOf = (kind: string, key: string) => names[`${kind}:${key}`] ?? key
const actionName = (key: string) => ({ long_rest: 'Long rest' } as Record<string, string>)[key] ?? key

const action = (over: Partial<ActionDef>): ActionDef => ({
  key: 'a', name: 'A', description: '', on: 'character', types: [], who: 'owner', costs: [], changes: [], triggers: [], ...over,
})

describe('actions', () => {
  it('knows the kind of each place', () => {
    expect(placeKind('character', 'self')).toBe('character')
    expect(placeKind('character', 'group')).toBe('group')
    expect(placeKind('item', 'character')).toBe('character')
    expect(placeKind('group', 'group_characters')).toBe('character')
  })

  it('describes costs, changes and triggers in words', () => {
    const short = action({ costs: [{ source: 'self', variable: 'hit_dice', amount: 1, consume: true, required: true }],
      changes: [{ target: 'self', variable: 'hp', op: 'add', amount: 5 }] })
    expect(describeAction(short, nameOf, actionName)).toEqual(['Spends 1 Hit dice', '+5 HP'])
    const party = action({ on: 'group', costs: [{ source: 'self', variable: 'rations', amount: 1, consume: true, required: true }],
      triggers: [{ target: 'group_characters', action: 'long_rest', skip_costs: true, skip_changes: false, skip_triggers: false }] })
    expect(describeAction(party, nameOf, actionName)).toEqual(['Spends 1 Rations', 'Then Long rest (each of its characters), without its costs'])
    const check = action({ costs: [{ source: 'group', variable: 'rations', amount: 2, consume: false, required: true }],
      changes: [{ target: 'self', variable: 'hp', op: 'add', amount: 'max' }] })
    expect(describeAction(check, nameOf, actionName)).toEqual(['Needs 2 Rations (its party)', 'HP back to its max'])
    const lose = action({ changes: [{ target: 'self', variable: 'hp', op: 'remove', amount: { formula: '1d6' } },
      { target: 'self', variable: 'hit_dice', op: 'set', amount: 0 }, { target: 'self', variable: 'hp', op: 'set', amount: 'max' }] })
    expect(describeAction(lose, nameOf, actionName)).toEqual(['−(1d6) HP', 'Hit dice set to 0', 'HP set to its max'])
  })

  it('applies to its kind and types', () => {
    expect(appliesTo(action({ types: [] }), 'character', 'pc')).toBe(true)
    expect(appliesTo(action({ types: ['npc'] }), 'character', 'pc')).toBe(false)
    expect(appliesTo(action({ on: 'item' }), 'character', 'pc')).toBe(false)
  })
})
