import type { LocationMap, StageSetView } from '../../../api/types'
import { TITLE_H } from '../../constants'
import { anchorFor, initials, snapTile, tokenShape, tokenTiles } from '../../../maps/MapTokens'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import MapSetView, { innerFor, mapPlacement, tilesRect, viewOf } from './MapSetView'
import { DEFAULT_FOG_LOOK } from '../../../maps/shader'
import type { MapSetContent } from './types'

const map: LocationMap = {
  location: { id: 5, name: 'Riverton' }, version: 1, size: [400, 200],
  grid: { type: 'square', size: 50, x: 0, y: 0, cols: 8, rows: 4, auto: false, unit_size: 5, unit: 'ft', color: '#fff', opacity: 0.4, mode: 'color', line: 1 },
  links: [], paths: [], regions: [], fog: { enabled: true, states: '2'.repeat(32) }, image: null,
  background: '#000000', layers: [{ id: 'layer1', name: 'Map', see_through: false }], layer: 'layer1',
}
const content: MapSetContent = { fog: { ...DEFAULT_FOG_LOOK, display: 'flat' }, show_grid: true, interactive: true, map }
vi.mock('../../../maps/MapRenderer', () => ({ default: () => null })) // WebGL isn't in the test DOM

const set = (c: MapSetContent): StageSetView => ({ id: 1, type: 'world_map', name: 'Map', x: 0, y: 0, width: 800, height: 400 + TITLE_H, layer: 1, content: c })

describe('map Sets', () => {
  it("draw with no Saga around (the live link's screen): the DM's tools don't need one", () => {
    const { container } = render(<MapSetView set={set(content)} mode="view" selectedActorId={null} onSelectActor={() => undefined} attention={null} />)
    expect(container.querySelector('.map-set-map')).not.toBeNull()
  })
  it('fit the map in the Set, the same for the DM (the controls float in toolbars)', () => {
    const players = mapPlacement(set(content))
    expect(players.s).toBe(2) // 800 x 400 (under the title) holds 400 x 200 twice
    const dm = mapPlacement(set({ ...content, locations: [{ actor_id: 9, id: 5, name: 'Riverton' }], current: 5 }))
    expect(dm).toEqual(players)
  })
  it('turn grab attention on tiles into a box in the Set', () => {
    expect(tilesRect(set(content), { location_id: 5, tiles: [[1, 1], [2, 1]] })).toEqual({ x: 100, y: 100, w: 200, h: 100 })
    expect(tilesRect(set(content), { location_id: 99, tiles: [[1, 1]] })).toBeNull() // another location
  })
  it("share a view: the DM's zoom and centre land on the same map point in another Set", () => {
    const dm = mapPlacement(set(content))
    const inner = { k: 2, x: -400, y: -200 }
    const shared = viewOf(inner, dm, map.size)
    expect(shared).toEqual({ k: 2, cx: 0.5, cy: 0.5 })
    expect(innerFor(shared, dm, map.size)).toEqual(inner) // back, in the same Set
    // A player's Set of another size: the same point at their centre
    const theirs = mapPlacement({ ...set(content), width: 400, height: 300 + TITLE_H })
    const there = innerFor({ k: 3, cx: 0.25, cy: 0.5 }, theirs, map.size)
    expect(viewOf(there, theirs, map.size).cx).toBeCloseTo(0.25)
    expect(innerFor({ k: 50, cx: 0, cy: 0 }, theirs, map.size).k).toBe(8) // kept in bounds
  })
})

describe('tokens', () => {
  it('snap to the tile they are dropped on, never off the grid', () => {
    expect(snapTile(map.grid, [120, 80])).toEqual([2, 1])
    expect(snapTile(map.grid, [999, 80])).toBeNull()
    expect([initials('Old Mill'), initials('thorin'), initials(null)]).toEqual(['OM', 'T', '?'])
  })
  it('cover n×n tiles on a square grid, and hex clusters of 1, 3, 7, 12, 19 on a hex grid', () => {
    expect(tokenTiles(map.grid, [2, 1], 2)).toEqual([[2, 1], [3, 1], [2, 2], [3, 2]])
    const hex = { ...map.grid, type: 'hex' as const, cols: 20, rows: 20 }
    expect([1, 2, 3, 4, 5].map((n) => tokenTiles(hex, [8, 8], n).length)).toEqual([1, 3, 7, 12, 19])
    // Larger: still a cluster, growing with the size (6: 27, 7: 37...)
    const counts = [6, 7, 8, 9, 10].map((n) => tokenTiles(hex, [8, 8], n).length)
    expect(counts[0]).toBe(27)
    expect(counts[1]).toBe(37)
    expect(counts.every((c, i) => i === 0 || c > counts[i - 1])).toBe(true)
    // size 2 on hex: the tile and its east and south-east neighbours (they touch each other)
    expect(tokenTiles(hex, [8, 8], 2).map(String).sort()).toEqual(['8,8', '8,9', '9,8'])
    // a larger square token: a rounded square over its tiles; dropped, it centres on the pointer
    const sq = tokenShape(map.grid, [1, 1], 2)
    expect(sq.d).toBeTruthy()
    // Every size keeps a size-1 token's border width (drawn inside the shape, so it stays on its tiles)
    for (const g of [map.grid, hex]) {
      const one = tokenShape(g, [8, 8], 1).ring
      expect(one).toBeGreaterThan(0)
      expect([2, 3, 4, 5].map((n) => tokenShape(g, [8, 8], n).ring)).toEqual([one, one, one, one])
    }
    expect(sq.cx).toBeCloseTo(100)
    expect(anchorFor(map.grid, [100, 100], 2)).toEqual([1, 1])
  })
})
