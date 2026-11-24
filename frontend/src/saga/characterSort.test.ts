import type { Resource } from '../api/types'
import { sortCharacters, sortOptions } from './CharactersPage'

const r = (id: number, name: string, level: number | null, created: string): Resource => ({
  id, kind: 'character', type: 'npc', name, attributes: level === null ? {} : { level }, editable: [], created_at: created, updated_at: null,
})
const list = [r(1, 'Bruna', 3, '2026-01-02'), r(2, 'Ana', 5, '2026-01-01'), r(3, 'Caio', null, '2026-01-03')]

describe('Characters sorting', () => {
  it('offers name, every number, counter and calculated variable, and date created (plan 38: none hard-coded)', () => {
    const options = sortOptions([
      { key: 'level', name: 'Level', type: 'number' },
      { key: 'hp', name: 'HP', type: 'counter' },
      { key: 'carried', name: 'Weight carried', type: 'calculated' },
      { key: 'notes', name: 'Notes', type: 'text' },
    ])
    expect(options).toEqual([['name', 'Name'], ['level', 'Level'], ['hp', 'HP'], ['carried', 'Weight carried'], ['created', 'Date created']])
  })

  it('sorts by a counter\'s current value', () => {
    const hurt = [r(1, 'Bruna', 1, '2026-01-02'), r(2, 'Ana', 1, '2026-01-01')]
    hurt[0].attributes.hp = { current: 2, max: 10 }
    hurt[1].attributes.hp = { current: 9, max: 10 }
    expect(sortCharacters(hurt, 'hp').map((c) => c.name)).toEqual(['Ana', 'Bruna'])
  })

  it('sorts by name, by level (high first, missing last) and newest first', () => {
    expect(sortCharacters(list, 'name').map((c) => c.name)).toEqual(['Ana', 'Bruna', 'Caio'])
    expect(sortCharacters(list, 'level').map((c) => c.name)).toEqual(['Ana', 'Bruna', 'Caio'])
    expect(sortCharacters(list, 'created').map((c) => c.name)).toEqual(['Caio', 'Bruna', 'Ana'])
  })
})
