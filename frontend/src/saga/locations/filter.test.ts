import type { Resource } from '../../api/types'
import { pickerSections } from '../../components/ResourcePicker'
import { snapPosition } from '../../maps/tools/PicturesTool'
import { descendants, filterLocations } from './filter'

const place = (id: number, name: string, parent: number | null, tags: string[] = [], kind = 'location'): Resource => ({
  id, kind, type: kind, name, attributes: { name, parent }, editable: [], tags, created_at: null, updated_at: null,
})
const list = [
  place(1, 'Aerth', null, ['World']),
  place(2, 'Riverton', 1, ['town', 'river']),
  place(3, 'The Prancing Goat', 2, ['inn']),
  place(4, 'Bogwater', 1, ['town']),
]

describe('locations list', () => {
  it('searches by name, keeps the top level only, and needs every picked tag', () => {
    expect(filterLocations(list, { query: 'river', topOnly: false, tags: [] }, 'parent').map((r) => r.id)).toEqual([2])
    expect(filterLocations(list, { query: '', topOnly: true, tags: [] }, 'parent').map((r) => r.id)).toEqual([1])
    expect(filterLocations(list, { query: '', topOnly: false, tags: ['Town'] }, 'parent').map((r) => r.id)).toEqual([2, 4])
    expect(filterLocations(list, { query: '', topOnly: false, tags: ['town', 'river'] }, 'parent').map((r) => r.id)).toEqual([2])
  })
  it('finds every place inside a location, all levels down', () => {
    expect(descendants(list, 1, 'parent').sort()).toEqual([2, 3, 4])
    expect(descendants(list, 3, 'parent')).toEqual([])
  })
})

describe('resource picker', () => {
  it('puts favorites first, searches names and tags, filters by kind', () => {
    const all = [...list, place(9, 'Thorin', null, ['dwarf'], 'character')]
    const { favorites, others } = pickerSections(all, '', null, [3], [1])
    expect(favorites.map((r) => r.id)).toEqual([3])
    expect(others.map((r) => r.id)).toEqual([2, 4, 9])
    expect(pickerSections(all, 'dwarf', null, [], []).others.map((r) => r.id)).toEqual([9])
    expect(pickerSections(all, '', 'character', [3], []).favorites).toEqual([])
  })
})

describe('placing map pictures', () => {
  const grid = { type: 'square' as const, size: 50, x: 0, y: 0, cols: 4, rows: 4, auto: false, unit_size: 5, unit: 'ft', color: '#fff', opacity: 1, mode: 'color' as const, line: 1 }
  it('snaps to the other pictures edges when close, or to the grid', () => {
    const other = { x: 0, y: 0, w: 200, h: 100 }
    expect(snapPosition({ x: 206, y: 3, w: 200, h: 100 }, [other], grid, 'edges', 12)).toEqual({ x: 200, y: 0 })
    expect(snapPosition({ x: 260, y: 40, w: 200, h: 100 }, [other], grid, 'edges', 12)).toEqual({ x: 260, y: 40 })
    expect(snapPosition({ x: 73, y: 26, w: 10, h: 10 }, [], grid, 'grid', 12)).toEqual({ x: 50, y: 50 })
    expect(snapPosition({ x: 73, y: 26, w: 10, h: 10 }, [other], grid, 'none', 12)).toEqual({ x: 73, y: 26 })
  })
})
