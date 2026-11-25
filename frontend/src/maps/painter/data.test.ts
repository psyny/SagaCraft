import type { MapGrid } from '../../api/types'
import { emptyPaint, LOOKS, paintTextures, PATTERNS, rleDecode, rleEncode, stepsBetween, withConnections, withTiles } from './data'
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
  it("makes the GPU textures: per tile channels, the palette by columns with each type's art (plan 48)", () => {
    let paint = withConnections(withTiles(emptyPaint(), SQUARE, GRASS, [[0, 0]]), SQUARE, 'road', ROAD, [[0, 0], [1, 0]], false)
    paint = withTiles(paint, SQUARE, PINE, [[1, 0]], 'scenery')
    expect(values(paint.scenery).slice(0, 3)).toEqual([0, 3, 0])
    const t = paintTextures(paint, SQUARE, TEST_PACK)
    expect([t.tiles[0], t.tiles[1], t.kinds[0], t.kinds[4 + 3]]).toEqual([1, 1, 2, 3]) // terrain 1, road E, road entry 2; scenery 3
    const at = (row: number, col: number) => [...t.palette.slice((row * 256 + col) * 4, (row * 256 + col) * 4 + 4)]
    expect(at(0, 1)[0]).toBe(1) // entry 1 is a ground...
    expect(at(1, 1).slice(0, 3)).toEqual([0xcd, 0xc9, 0x8d]) // ...its first colour...
    expect(at(4, 1).slice(0, 2)).toEqual([PATTERNS.strokes, 1]) // ...its first pattern: strokes in its second colour
    expect([at(0, 2)[0], at(4, 2)[0]]).toEqual([3, LOOKS.dirt]) // entry 2: a road, its look
    expect(at(0, 3)[0]).toBe(5) // entry 3: scenery
  })
})
