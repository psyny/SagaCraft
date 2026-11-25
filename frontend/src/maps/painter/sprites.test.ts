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

  it("stand boundaries on their area's edges: towers where the outline turns, gates where a road goes through", () => {
    const WALL = { type: 'wall.castle', colors: ['#c9c1b2', '#55607a', '#b23a3a'] as [string, string, string] }
    let paint: MapPaint = withTiles(emptyPaint(), GRID, CASTLE, block(2, 1, 2, 2), 'scenery')
    paint = withTiles(paint, GRID, WALL, block(2, 1, 2, 2), 'bounds')
    paint = withConnections(paint, GRID, 'road', { type: 'road.dirt', colors: ['#c8a676', '#6b4e2e', '#9c7a4e'] }, [[3, 2], [4, 2], [5, 2]], false)
    const sprites = paintSprites(paint, GRID, TEST_PACK)
    const towers = sprites.filter((s) => s.name === 'castle-tower')
    expect(towers.map((t) => [Math.round(t.x), Math.round(t.y)]).sort()).toEqual([[200, 100], [200, 300], [400, 100], [400, 300]])
    const gates = sprites.filter((s) => s.name === 'castle-gate')
    expect(gates.map((g) => [Math.round(g.x), Math.round(g.y)])).toEqual([[400, 250]]) // on the east wall, (3,2)'s middle
    // the outline's 8 edges, the one with the road in two pieces (the gate between them)
    const walls = sprites.filter((s) => s.box)
    expect(walls.length).toBe(9)
    for (const w of walls) {
      expect(w.box!.look).toBe(5) // castle
      expect(w.h).toBeCloseTo(18)
      expect([w.x, w.box!.qx].every((x) => x >= 200 && x <= 400)).toBe(true)
      expect([w.y, w.box!.qy].every((y) => y >= 100 && y <= 300)).toBe(true)
    }
    const east = walls.filter((w) => w.x === 400 && w.box!.qx === 400)
    expect(east.map((w) => [w.y, w.box!.qy].map(Math.round).sort((x, y) => x - y)).sort((x, y) => x[0] - y[0])).toEqual([[100, 200], [200, 237], [263, 300]])
    // its buildings stand inside (the castle's inset; no wobble), a keep clearing the small ones off its foot
    const inside = sprites.filter((s) => !s.box && !s.name.startsWith('castle-'))
    expect(inside.filter((s) => s.name === 'keep-1').length).toBeGreaterThanOrEqual(2)
    for (const s of inside) {
      expect(s.x).toBeGreaterThan(212); expect(s.x).toBeLessThan(388)
      expect(s.y).toBeGreaterThan(112); expect(s.y).toBeLessThan(288)
    }
    // nothing along the map's own edge; two boundaries side by side: one piece between them
    const CLIFF = { type: 'cliff.low', colors: ['#a89c88', '#5e554a', '#9aa868'] as [string, string, string] }
    const edge = withTiles(withTiles(emptyPaint(), GRID, CLIFF, [[0, 5]], 'bounds'), GRID, WALL, [[1, 5]], 'bounds')
    const pieces = paintSprites(edge, GRID, TEST_PACK).filter((s) => s.box)
    expect(pieces.length).toBe(4) // the cliff's top and right (shared with the wall: the first tile's), the wall's top and right; none on the map's edge
  })

  it('hang cliffs below their edge and let rivers fall down them', () => {
    const CLIFF = { type: 'cliff.low', colors: ['#a89c88', '#5e554a', '#9aa868'] as [string, string, string] }
    let paint = withTiles(emptyPaint(), GRID, CLIFF, block(2, 1, 2, 2), 'bounds')
    paint = withConnections(paint, GRID, 'river', { type: 'river.river', colors: ['#86b8cc', '#3f6f86', '#e2f2f7'] }, [[2, 2], [2, 3]], false)
    const pieces = paintSprites(paint, GRID, TEST_PACK).filter((s) => s.box)
    for (const p of pieces) expect(p.box!.cliff).toBe(true)
    const south = pieces.filter((p) => p.box!.outY > 0.5)
    expect(south.every((p) => Math.round(p.y) === 312)).toBe(true) // the face hangs H (0.12 of a tile) below the edge
    const falls = pieces.filter((p) => p.box!.look === 9)
    expect(falls.length).toBe(1)
    expect(paint.palette[falls[0].box!.entry - 1].type).toBe('river.river')
    expect(Math.round((falls[0].x + falls[0].box!.qx) / 2)).toBe(250) // (2,2)'s south edge, its middle
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
