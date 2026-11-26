import type { MapGrid, MoveCost } from '../api/types'
import { findRoute, routeCost, type Tile } from './geometry'
import { routeLabel } from '../stage/sets/maps/MapSetView'

const square = { type: 'square', size: 50, cols: 6, rows: 4, x: 0, y: 0, unit_size: 5, unit: 'ft' } as unknown as MapGrid
const hex = { ...square, type: 'hex' } as MapGrid

describe('Planned moves (plan 59)', () => {
  it('find the cheapest route, around blocked tiles and through cheaper ones', () => {
    expect(findRoute(square, [0, 0], [3, 0], {})).toEqual([[1, 0], [2, 0], [3, 0]])
    expect(findRoute(square, [0, 0], [1, 1], {})).toEqual([[1, 1]]) // a diagonal is one step
    const wall: Record<string, MoveCost> = { '1,0': 'x', '1,1': 'x', '1,2': 'x' }
    const around = findRoute(square, [0, 0], [2, 0], wall)!
    expect(around[around.length - 1]).toEqual([2, 0])
    expect(around.some((t) => t[0] === 1 && t[1] === 3)).toBe(true) // under the wall
    expect(findRoute(square, [0, 0], [1, 0], wall)).toBeNull() // a blocked tile isn't a place to go
    // Harder tiles cost more: a longer way round when it counts less
    const mud: Record<string, MoveCost> = { '1,0': 3 }
    expect(findRoute(square, [0, 0], [2, 0], mud)).toEqual([[1, 1], [2, 0]]) // round the mud: counts 2, not 4
    expect(routeCost(mud, [[1, 0], [2, 0]])).toBe(4)
    expect(routeCost(wall, [[1, 0] as Tile])).toBeNull()
  })

  it('go only through tiles the mover knows, on hexes too', () => {
    const route = findRoute(hex, [0, 0], [3, 0], {})!
    expect(route).toHaveLength(3)
    expect(findRoute(square, [0, 0], [3, 0], {}, (t) => t[1] === 0 && t[0] < 2)).toBeNull()
  })

  it('say what a move counts, in the map units', () => {
    expect(routeLabel({ grid: square, moves: {} }, [[1, 0], [2, 0]])).toBe('2 tiles · 10 ft')
    expect(routeLabel({ grid: square, moves: { '2,0': 2 } }, [[1, 0], [2, 0]])).toBe('2 tiles, counts 3 · 15 ft')
  })
})
