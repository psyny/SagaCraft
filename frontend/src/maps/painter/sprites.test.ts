import type { MapGrid, MapPaint } from '../../api/types'
import { emptyPaint, withConnections, withTiles } from './data'
import { paintSprites, spriteShape } from './sprites'
import { TEST_PACK } from './testPack'

const GRID: MapGrid = { type: 'square', size: 100, x: 0, y: 0, cols: 8, rows: 6, auto: false, unit_size: 5, unit: 'mi', color: '#fff', opacity: 0.5, mode: 'contrast', line: 0.5 }
const PINE = { type: 'trees.pine', colors: ['#5d7c4c', '#2f4632', '#6b4e2e'] as [string, string, string] }
const CASTLE = { type: 'settlement.castle', colors: ['#c9c1b2', '#55607a', '#b23a3a'] as [string, string, string] }
const block = (c0: number, r0: number, w: number, h: number) => Array.from({ length: w * h }, (_, i) => [c0 + (i % w), r0 + Math.floor(i / w)] as [number, number])

describe("the painter's sprites (plan 48)", () => {
  it("read a sprite's shape from its SVG: its box, where it stands, whether it lights up at night", () => {
    expect(spriteShape(TEST_PACK.sprites['pine-1'])).toEqual({ w: 40, h: 64, ax: 0.5, ay: 0.94, night: false })
    expect(spriteShape(TEST_PACK.sprites['keep-1'])?.night).toBe(true)
    expect(spriteShape('<svg></svg>')).toBeNull()
  })

  it('scatter scenery over its tiles only, the same every time, nearest drawn last', () => {
    const paint = withTiles(emptyPaint(), GRID, PINE, block(2, 2, 3, 2), 'scenery')
    const sprites = paintSprites(paint, GRID, TEST_PACK)
    expect(sprites.length).toBeGreaterThan(30) // 6 tiles, about 16 a tile
    for (const s of sprites) {
      expect(s.name).toBe('pine-1')
      // within a third of a tile of the forest (its edges are organic)
      expect(s.x).toBeGreaterThan(200 - 40); expect(s.x).toBeLessThan(500 + 40)
      expect(s.y).toBeGreaterThan(200 - 40); expect(s.y).toBeLessThan(400 + 40)
    }
    expect(sprites.map((s) => s.depth)).toEqual([...sprites.map((s) => s.depth)].sort((a, b) => a - b))
    expect(paintSprites(paint, GRID, TEST_PACK)).toEqual(sprites)
    // another type painted elsewhere first (the palette's order changes): the trees stay where they were
    const other = withTiles(withTiles(emptyPaint(), GRID, CASTLE, [[7, 5]], 'scenery'), GRID, PINE, block(2, 2, 3, 2), 'scenery')
    expect(paintSprites(other, GRID, TEST_PACK).filter((s) => s.name === 'pine-1' && s.y < 450)).toEqual(sprites)
  })

  it("give castles towers at their outline's corners and gates where a road goes through", () => {
    let paint: MapPaint = withTiles(emptyPaint(), GRID, CASTLE, block(2, 1, 2, 2), 'scenery')
    paint = withConnections(paint, GRID, 'road', { type: 'road.dirt', colors: ['#c8a676', '#6b4e2e', '#9c7a4e'] }, [[3, 2], [4, 2], [5, 2]], false)
    const sprites = paintSprites(paint, GRID, TEST_PACK)
    const towers = sprites.filter((s) => s.name === 'castle-tower')
    expect(towers.map((t) => [Math.round(t.x), Math.round(t.y)]).sort()).toEqual([[212, 112], [212, 288], [388, 112], [388, 288]])
    const gates = sprites.filter((s) => s.name === 'castle-gate')
    expect(gates.map((g) => [Math.round(g.x), Math.round(g.y)])).toEqual([[388, 250]]) // on the east wall, (3,2)'s middle
    // its buildings stand inside the walls (no wobble), a keep clearing the small ones off its foot
    const inside = sprites.filter((s) => !s.name.startsWith('castle-'))
    expect(inside.filter((s) => s.name === 'keep-1').length).toBeGreaterThanOrEqual(2)
    for (const s of inside) {
      expect(s.x).toBeGreaterThan(212); expect(s.x).toBeLessThan(388)
      expect(s.y).toBeGreaterThan(112); expect(s.y).toBeLessThan(288)
    }
  })

  it("put features' parts on their tile: sails spin, birds fly and flap over everything", () => {
    const paint: MapPaint = { ...emptyPaint(), features: [
      { id: 'f1', type: 'feature.windmill', tile: [1, 1], size: 1, variant: 0, colors: ['#e6d8b8', '#8a6a4a', '#8a4a3a'] },
      { id: 'f2', type: 'feature.birds', tile: [4, 4], size: 2, variant: 0, colors: ['#2e2a28', '#1a1716', '#c8902a'] },
      { id: 'f3', type: 'feature.nope', tile: [0, 0], size: 1, variant: 0, colors: ['#000000', '#000000', '#000000'] },
    ] }
    const sprites = paintSprites(paint, GRID, TEST_PACK)
    const [body, sails] = sprites.filter((s) => s.name.startsWith('windmill'))
    expect([body.name, body.x, body.y, body.h]).toEqual(['windmill', 150, 150, 60])
    expect([sails.name, sails.spin, sails.y]).toEqual(['windmill-sails', 0.12, 150 - 0.64 * 60])
    const birds = sprites.slice(-4)
    expect(birds.map((b) => b.name).sort()).toEqual(['bird-1', 'bird-1', 'bird-2', 'bird-2'])
    expect(birds.every((b) => b.motion === 2 && b.depth >= 1e9 && b.blink !== 0)).toBe(true)
  })
})
