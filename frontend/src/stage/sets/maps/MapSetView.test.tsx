import type { LocationMap, StageSetView } from '../../../api/types'
import { TITLE_H } from '../../constants'
import { initials, snapTile } from '../../../maps/MapTokens'
import { innerFor, mapPlacement, tilesRect, viewOf } from './MapSetView'
import { DEFAULT_FOG_LOOK } from '../../../maps/shader'
import type { MapSetContent } from './types'

const map: LocationMap = {
  location: { id: 5, name: 'Riverton' }, version: 1, size: [400, 200],
  grid: { type: 'square', size: 50, x: 0, y: 0, cols: 8, rows: 4, auto: false, unit_size: 5, unit: 'ft', color: '#fff', opacity: 0.4, mode: 'color', line: 1 },
  links: [], paths: [], regions: [], fog: { enabled: true, states: '2'.repeat(32) }, image: null,
}
const content: MapSetContent = { fog: { ...DEFAULT_FOG_LOOK, display: 'flat' }, show_grid: true, interactive: true, map }
const set = (c: MapSetContent): StageSetView => ({ id: 1, type: 'world_map', name: 'Map', x: 0, y: 0, width: 800, height: 400 + TITLE_H, layer: 1, content: c })

describe('map Sets', () => {
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
})
