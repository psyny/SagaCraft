import type { Resource } from '../api/types'
import { sortCharacters, sortOptions } from './CharactersPage'

const r = (id: number, name: string, level: number | null, created: string): Resource => ({
  id, kind: 'character', type: 'npc', name, attributes: level === null ? {} : { level }, editable: [], created_at: created, updated_at: null,
})
const list = [r(1, 'Bruna', 3, '2026-01-02'), r(2, 'Ana', 5, '2026-01-01'), r(3, 'Caio', null, '2026-01-03')]

describe('Characters sorting', () => {
  it('offers name, the sortable numbers and date created', () => {
    const options = sortOptions([
      { key: 'level', name: 'Level', type: 'number', sortable: true },
      { key: 'hp', name: 'HP', type: 'counter', sortable: true },
      { key: 'notes', name: 'Notes', type: 'text' },
    ])
    expect(options).toEqual([['name', 'Name'], ['level', 'Level'], ['created', 'Date created']])
  })

  it('sorts by name, by level (high first, missing last) and newest first', () => {
    expect(sortCharacters(list, 'name').map((c) => c.name)).toEqual(['Ana', 'Bruna', 'Caio'])
    expect(sortCharacters(list, 'level').map((c) => c.name)).toEqual(['Ana', 'Bruna', 'Caio'])
    expect(sortCharacters(list, 'created').map((c) => c.name)).toEqual(['Caio', 'Bruna', 'Ana'])
  })
})
