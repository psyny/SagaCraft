import type { LocationMap, StageSetView } from '../../../api/types'
import { TITLE_H } from '../../constants'
import { mapPlacement, tilesRect } from './MapSetView'
import { DEFAULT_FOG_LOOK } from '../../../maps/shader'
import type { MapSetContent } from './types'

const map: LocationMap = {
  location: { id: 5, name: 'Riverton' }, version: 1, size: [400, 200],
  grid: { type: 'square', size: 50, x: 0, y: 0, cols: 8, rows: 4, auto: false, unit_size: 5, unit: 'ft', color: '#fff', opacity: 0.4, mode: 'color', line: 1 },
  links: [], paths: [], regions: [], fog: { enabled: true, states: '2'.repeat(32) }, image: null,
}
const content: MapSetContent = { simple: false, fog: { ...DEFAULT_FOG_LOOK, display: 'flat' }, show_grid: true, interactive: true, map }
const set = (c: MapSetContent): StageSetView => ({ id: 1, type: 'world_map', name: 'Map', x: 0, y: 0, width: 800, height: 400 + TITLE_H, layer: 1, content: c })

describe('map Sets', () => {
  it('fit the map in the Set, under the DM strips', () => {
    const players = mapPlacement(set(content), 'view')
    expect(players.s).toBe(2) // 800 x 400 (under the title) holds 400 x 200 twice
    expect(players.top).toBe(0)
    const dm = mapPlacement(set({ ...content, locations: [{ actor_id: 9, id: 5, name: 'Riverton' }], current: 5 }), 'play')
    expect(dm.top).toBe(66) // the location strip and the tools
    expect(dm.s).toBeLessThan(2)
  })
  it('turn grab attention on tiles into a box in the Set', () => {
    expect(tilesRect(set(content), { location_id: 5, tiles: [[1, 1], [2, 1]] })).toEqual({ x: 100, y: 100, w: 200, h: 100 })
    expect(tilesRect(set(content), { location_id: 99, tiles: [[1, 1]] })).toBeNull() // another location
  })
})
