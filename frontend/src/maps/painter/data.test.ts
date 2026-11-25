import type { MapGrid } from '../../api/types'
import { boundaryAt, edgeSlot, emptyPaint, LOOKS, ownEdges, paintTextures, PATTERNS, riverFalls, rleDecode, rleEncode, stepsBetween, withConnections, withEdges, withTiles, withTurned } from './data'
import { TEST_PACK } from './testPack'

const SQUARE: MapGrid = { type: 'square', size: 100, x: 0, y: 0, cols: 6, rows: 4, auto: false, unit_size: 5, unit: 'ft', color: '#fff', opacity: 0.5, mode: 'contrast', line: 0.5 }
const HEX: MapGrid = { ...SQUARE, type: 'hex' }
const PINE = { type: 'trees.pine', colors: ['#56744a', '#2c4230', '#a7b27c'] as [string, string, string] }
const GRASS = { type: 'ground.grass', colors: ['#cdc98d', '#8f9a58', '#e6dfb0'] as [string, string, string] }
const ROAD = { type: 'road.dirt', colors: ['#c8a676', '#6b4e2e', '#9c7a4e'] as [string, string, string] }
const values = (text: string, n = 24) => [...rleDecode(text, n)]

describe('map painting data (plan 47)', () => {
  it('decodes and encodes runs exactly as the server does', () => {
    // domain/map_paint.rle_encode's own output
    expect(rleEncode([0, 0, 7, 7, 7, 0, 1])).toBe('AQACBwAAAAE=')
    expect(values('AQACBwAAAAE=', 7)).toEqual([0, 0, 7, 7, 7, 0, 1])
    const big = [...new Array(20000).fill(3), ...new Array(20000).fill(5)]
    expect(rleEncode(big)).toBe('n5wBA5+cAQU=')
    expect([...rleDecode('n5wBA5+cAQU=', 40000)].slice(19998, 20002)).toEqual([3, 3, 5, 5])
    expect(rleEncode(new Array(500).fill(0))).toBe('')
    expect(values('', 3)).toEqual([0, 0, 0])
  })
  it('paints and erases terrain, sharing the palette', () => {
    let paint = withTiles(emptyPaint(), SQUARE, PINE, [[0, 0], [1, 0], [9, 9]])
    paint = withTiles(paint, SQUARE, PINE, [[2, 0]])
    expect(paint.palette).toHaveLength(1)
    expect(values(paint.tiles).slice(0, 4)).toEqual([1, 1, 1, 0])
    paint = withTiles(paint, SQUARE, null, [[1, 0]])
    expect(values(paint.tiles).slice(0, 4)).toEqual([1, 0, 1, 0])
  })
  it('joins tiles both ways (square and hex), erases, follows a fast stroke', () => {
    let paint = withConnections(emptyPaint(), SQUARE, 'road', ROAD, [[0, 0], [1, 1], [2, 1]], false)
    const roads = values(paint.roads)
    expect([roads[0], roads[7], roads[8]]).toEqual([1 << 1, (1 << 5) | 1, 1 << 4]) // as the server's test
    paint = withConnections(paint, SQUARE, 'road', null, [[1, 1]], true)
    expect(values(paint.roads).every((v) => !v)).toBe(true)
    const river = withConnections(emptyPaint(), SQUARE, 'river', ROAD, [[0, 3], [1, 3], [2, 3]], false)
    expect(values(river.river_out).slice(18, 21)).toEqual([1, 1, 0])
    const hex = withConnections(emptyPaint(), HEX, 'road', ROAD, [[1, 0], [1, 1], [2, 2]], false)
    expect([values(hex.roads)[1], values(hex.roads)[7], values(hex.roads)[14]]).toEqual([1 << 1, (1 << 4) | (1 << 1), 1 << 4])
    const centre = ([c, r]: [number, number]): [number, number] => [c * 100 + 50, r * 100 + 50]
    expect(stepsBetween(SQUARE, [0, 0], [3, 0], centre)).toEqual([[1, 0], [2, 0], [3, 0]])
  })
  it('keeps boundaries on edges (plan 50): one per edge, either side gives it, diagonals and the map\'s edge have none', () => {
    const SQ = SQUARE
    const WALL = { type: 'wall.stone', colors: ['#a9a397', '#5f5a52', '#c9c3b6'] as [string, string, string] }
    expect(ownEdges(SQ)).toEqual([0, 2])
    expect(edgeSlot(SQ, [1, 0, 4])).toEqual([0, 0, false]) // (1,0)'s west edge: (0,0)'s east
    expect(edgeSlot(SQ, [0, 1, 6])).toEqual([0, 1, false]) // (0,1)'s north: (0,0)'s south
    expect(edgeSlot(SQ, [0, 0, 1])).toBeNull() // a diagonal
    expect(edgeSlot(SQ, [0, 0, 4])).toBeNull() // off the grid
    let paint = withEdges(emptyPaint(), SQ, WALL, [[0, 0, 0], [1, 0, 4], [0, 1, 6]])
    expect([...rleDecode(paint.bounds_0, 4)]).toEqual([1, 0, 0, 0])
    expect([...rleDecode(paint.bounds_1, 4)]).toEqual([1, 0, 0, 0])
    expect(boundaryAt(paint, SQ, [1, 0, 4])?.type).toBe('wall.stone')
    paint = withTurned(paint, SQ, [[0, 0, 2], [0, 1, 6]]) // each edge once a stroke
    expect([...rleDecode(paint.bound_sides, 4)]).toEqual([2, 0, 0, 0])
    paint = withEdges(paint, SQ, null, [[0, 0, 2]])
    expect(paint.bounds_1).toBe('')
    expect(paint.bound_sides).toBe('') // its side went with it
    // hexes: east, south-east, south-west
    const HX = HEX
    expect(ownEdges(HX)).toEqual([0, 1, 2])
    expect(edgeSlot(HX, [1, 1, 4])).toEqual([1, 1, false]) // an odd row's north-west: the tile above's south-east
  })

  it('lets rivers flow either way (plan 52: a, b, as the rivers they join), and marks where they fall over a boundary', () => {
    const RIVER = { type: 'river.river', colors: ['#86b8cc', '#3f6f86', '#e2f2f7'] as [string, string, string] }
    const WALL = { type: 'wall.castle', colors: ['#c9c1b2', '#55607a', '#b23a3a'] as [string, string, string] }
    const FENCE = { type: 'wall.fence', colors: ['#a07a4c', '#5c4128', '#c9a878'] as [string, string, string] }
    let paint = withConnections(emptyPaint(), SQUARE, 'river', RIVER, [[0, 0], [1, 0], [2, 0]], false, 'b')
    expect(values(paint.river_out).slice(0, 3)).toEqual([0, 16, 16]) // direction B: toward the west
    // surrounding: drawn up to it from below, it flows on from the river it joins
    const joined = withConnections(withConnections(emptyPaint(), SQUARE, 'river', RIVER, [[1, 0], [2, 0]], false, 'a'), SQUARE, 'river', RIVER, [[2, 2], [2, 1], [2, 0]], false)
    expect(values(joined.river_out)[2] & 4).toBe(4)
    expect(values(joined.river_out)[8] & 4).toBe(4)
    paint = withEdges(paint, SQUARE, WALL, [[0, 0, 0]])
    paint = withEdges(paint, SQUARE, FENCE, [[1, 0, 0]])
    // over the wall it falls (both tiles of the edge); through the fence it doesn't
    expect([...riverFalls(paint, SQUARE, TEST_PACK)].slice(0, 3)).toEqual([1, 16, 0])
    expect([...paintTextures(paint, SQUARE, TEST_PACK).kinds].filter((_, i) => i % 4 === 3).slice(0, 3)).toEqual([1, 16, 0]) // the shader's
  })

  it("makes the GPU textures: per tile channels, the palette by columns with each type's art (plan 48)", () => {
    let paint = withConnections(withTiles(emptyPaint(), SQUARE, GRASS, [[0, 0]]), SQUARE, 'road', ROAD, [[0, 0], [1, 0]], false)
    paint = withTiles(paint, SQUARE, PINE, [[1, 0]], 'scenery')
    expect(values(paint.scenery).slice(0, 3)).toEqual([0, 3, 0])
    const t = paintTextures(paint, SQUARE, TEST_PACK)
    expect([t.tiles[0], t.tiles[1], t.kinds[0], t.kinds[4 + 3]]).toEqual([1, 1, 2, 0]) // terrain 1, road E, road entry 2; no river falls (scenery is the sprites')
    const at = (row: number, col: number) => [...t.palette.slice((row * 256 + col) * 4, (row * 256 + col) * 4 + 4)]
    expect(at(0, 1)[0]).toBe(1) // entry 1 is a ground...
    expect(at(1, 1).slice(0, 3)).toEqual([0xcd, 0xc9, 0x8d]) // ...its first colour...
    expect(at(4, 1).slice(0, 2)).toEqual([PATTERNS.strokes, 1]) // ...its first pattern: strokes in its second colour
    expect([at(0, 2)[0], at(4, 2)[0]]).toEqual([3, LOOKS.dirt]) // entry 2: a road, its look
    expect(at(0, 3)[0]).toBe(5) // entry 3: scenery
  })
})
