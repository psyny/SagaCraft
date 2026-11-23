import type { AttributeDef, Ruleset } from '../api/types'
import { applyLevels, archetypeLabel, archetypeVariables, describeByLevel, grantedValue, levelChanges, levelSteps, stepAt, valueAt } from './archetypes'
import { modeAttributes, systemElements } from './templates/modes'

const variable = (key: string, level: number, type = 'counter'): AttributeDef => ({
  key, name: key, type, view: ['admins'], edit: ['admins'], required: false, default: null, many: false, controllers: false, of: null,
  options: [], archetype: 'warrior', level,
})
const ruleset = {
  key: 'x', name: 'X', version: '1', kinds: { character: { types: { pc: { name: 'PC', attributes: [], stage_display: {} } } } },
  archetype_categories: [{ key: 'race', name: 'Race' }, { key: 'class', name: 'Class' }],
  archetypes: [
    { key: 'human', name: 'Human', category: 'race', description: '', max_level: 1, variables: [] },
    { key: 'warrior', name: 'Warrior', category: 'class', description: '', max_level: 5, variables: [variable('grit', 1), variable('rage', 2)] },
  ],
} as unknown as Ruleset

describe('archetypes', () => {
  it("give a character each archetype's variables up to its level", () => {
    const at1 = archetypeVariables(ruleset, [{ key: 'warrior', level: 1 }, { key: 'gone', level: 1 }])
    expect(at1.map((g) => g.variables.map((v) => v.key))).toEqual([['grit']]) // an unknown archetype is skipped
    expect(archetypeVariables(ruleset, [{ key: 'warrior', level: 2 }])[0].variables.map((v) => v.key)).toEqual(['grit', 'rage'])
  })
  it('read "Warrior 4" (a level only when it has more than one) and show by category in display templates', () => {
    expect(archetypeLabel(ruleset.archetypes![1], 4)).toBe('Warrior 4')
    expect(archetypeLabel(ruleset.archetypes![0], 1)).toBe('Human')
    expect(systemElements(ruleset).map(([k]) => k)).toEqual(['@name', '@category', '@group', '@archetypes', '@archetypes:race', '@archetypes:class'])
    expect(systemElements(ruleset, 'item').map(([k]) => k)).toEqual(['@name', '@category', '@group'])
    expect(modeAttributes(ruleset, 'face').map((a) => a.key)).toEqual(['grit', 'rage']) // their variables are offered too
  })

  describe('changing by level', () => {
    // A fighter's superiority dice: come at level 3 (4 dice), 5 at level 7, 6 at level 15; a bonus 1, 2 from level 5.
    const dice = { ...variable('dice', 3), default: { current: 4, max: 4 }, by_level: [{ level: 7, value: 5 }, { level: 15, value: 6 }] }
    const bonus = { ...variable('bonus', 1, 'number'), default: 1, by_level: [{ level: 5, value: 2 }] }
    const fighter = {
      ...ruleset,
      archetypes: [{ key: 'fighter', name: 'Fighter', category: 'class', description: '', max_level: 20, variables: [bonus, dice] }],
    } as unknown as Ruleset

    it('read the value in force at a level (a counter: its max), nothing before it comes', () => {
      expect([2, 3, 6, 7, 14, 15, 20].map((l) => valueAt(dice, l))).toEqual([undefined, 4, 4, 5, 5, 6, 6])
      expect(grantedValue(dice, 15)).toEqual({ current: 6, max: 6 })
      expect(grantedValue(bonus, 9)).toBe(2)
    })
    it('show the steps, and which one is in force', () => {
      expect(describeByLevel(dice)).toBe('3: 4 · 7: 5 · 15: 6')
      const steps = levelSteps(dice)
      expect([2, 3, 10, 15].map((l) => stepAt(steps, l))).toEqual([-1, 0, 1, 2])
    })
    it('apply a level change: crossed changes set the new value, a counter keeps what was spent', () => {
      const at3 = applyLevels(fighter, [], [{ key: 'fighter', level: 3 }], {})
      expect(at3).toEqual({ bonus: 1, dice: { current: 4, max: 4 } })
      const spent = { bonus: 9, dice: { current: 1, max: 4 } } // a manual bonus, three dice spent
      expect(applyLevels(fighter, [{ key: 'fighter', level: 3 }], [{ key: 'fighter', level: 4 }], spent)).toEqual(spent) // nothing crossed
      expect(applyLevels(fighter, [{ key: 'fighter', level: 3 }], [{ key: 'fighter', level: 7 }], spent))
        .toEqual({ bonus: 2, dice: { current: 2, max: 5 } })
      expect(applyLevels(fighter, [{ key: 'fighter', level: 15 }], [{ key: 'fighter', level: 4 }], { bonus: 2, dice: { current: 0, max: 6 } }))
        .toEqual({ bonus: 1, dice: { current: 0, max: 4 } }) // down again: clamped at 0
    })
    it('list what Save will change', () => {
      const values = { bonus: 1, dice: { current: 4, max: 4 } }
      expect(levelChanges(fighter, [{ key: 'fighter', level: 3 }], [{ key: 'fighter', level: 7 }], values)
        .map((c) => [c.variable, c.from, c.to])).toEqual([['bonus', 1, 2], ['dice', { current: 4, max: 4 }, { current: 5, max: 5 }]])
    })
  })
})
