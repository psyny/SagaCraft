import { paintRegion } from './RegionsTool'

describe('painting a region', () => {
  it('adds new tiles once, and removes', () => {
    const tiles: [number, number][] = [[0, 0], [1, 0]]
    expect(paintRegion(tiles, [[1, 0], [2, 0], [2, 0]], 'add')).toEqual([[0, 0], [1, 0], [2, 0]])
    expect(paintRegion(tiles, [[0, 0], [5, 5]], 'remove')).toEqual([[1, 0]])
  })
})
