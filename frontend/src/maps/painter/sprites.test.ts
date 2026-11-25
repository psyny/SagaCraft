import type { MapGrid, MapPaint } from '../../api/types'
import { emptyPaint, withConnections, withEdges, withTiles, withTurned } from './data'
import { PARTICLE_MOTIONS, PARTICLE_SHAPES, paintSprites, spriteShape } from './sprites'
import { TEST_PACK } from './testPack'

const GRID: MapGrid = { type: 'square', size: 100, x: 0, y: 0, cols: 8, rows: 6, auto: false, unit_size: 5, unit: 'mi', color: '#fff', opacity: 0.5, mode: 'contrast', line: 0.5 }
const PINE = { type: 'trees.pine', colors: ['#5d7c4c', '#2f4632', '#6b4e2e'] as [string, string, string] }
const CASTLE = { type: 'settlement.castle', colors: ['#c9c1b2', '#55607a', '#b23a3a'] as [string, string, string] }
const block = (c0: number, r0: number, w: number, h: number) => Array.from({ length: w * h }, (_, i) => [c0 + (i % w), r0 + Math.floor(i / w)] as [number, number])

describe("the painter's sprites (plan 48)", () => {
  it("read a sprite's shape from its SVG: its box, where it stands, whether it lights up at night", () => {
    expect(spriteShape(TEST_PACK.sprites['pine-1'])).toEqual({ w: 40, h: 64, ax: 0.5, ay: 0.94, night: false, glow: false })
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

  it('stand boundaries on the edges between tiles: towers where they end, turn or meet, gates where a road goes through', () => {
    const WALL = { type: 'wall.castle', colors: ['#c9c1b2', '#55607a', '#b23a3a'] as [string, string, string] }
    let paint: MapPaint = withTiles(emptyPaint(), GRID, CASTLE, block(2, 1, 2, 2), 'scenery')
    // around the castle's four tiles: north, east, south, west (from either side of each edge)
    paint = withEdges(paint, GRID, WALL, [[2, 1, 6], [3, 0, 2], [3, 1, 0], [4, 2, 4], [2, 2, 2], [3, 2, 2], [2, 1, 4], [2, 2, 4]])
    paint = withConnections(paint, GRID, 'road', { type: 'road.dirt', colors: ['#c8a676', '#6b4e2e', '#9c7a4e'] }, [[3, 2], [4, 2], [5, 2]], false)
    const sprites = paintSprites(paint, GRID, TEST_PACK)
    const towers = sprites.filter((s) => s.name === 'castle-tower')
    expect(towers.map((t) => [Math.round(t.x), Math.round(t.y)]).sort()).toEqual([[200, 100], [200, 300], [400, 100], [400, 300]])
    const gates = sprites.filter((s) => s.name === 'castle-gate')
    expect(gates.map((g) => [Math.round(g.x), Math.round(g.y)])).toEqual([[400, 250]]) // on the east wall, (3,2)'s middle
    // its 8 edges, the one with the road in two pieces (the gate between them)
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
    // a lone wall is one line: towers at its ends and where another meets it; none on the map's own edge
    const line = withEdges(emptyPaint(), GRID, WALL, [[0, 4, 2], [1, 4, 2], [2, 4, 2], [1, 4, 0], [0, 0, 4], [7, 5, 2]])
    const lone = paintSprites(line, GRID, TEST_PACK)
    expect(lone.filter((s) => s.box).length).toBe(4)
    expect(lone.filter((s) => s.name === 'castle-tower').map((t) => [Math.round(t.x), Math.round(t.y)]).sort())
      .toEqual([[0, 500], [200, 400], [200, 500], [300, 500]])
  })

  it('hang cliffs below their edge toward their low side; rivers fall over boundaries in their own look', () => {
    const CLIFF = { type: 'cliff.low', colors: ['#a89c88', '#5e554a', '#9aa868'] as [string, string, string] }
    const WALL = { type: 'wall.castle', colors: ['#c9c1b2', '#55607a', '#b23a3a'] as [string, string, string] }
    const FENCE = { type: 'wall.fence', colors: ['#a07a4c', '#5c4128', '#c9a878'] as [string, string, string] }
    const RIVER = { type: 'river.river', colors: ['#86b8cc', '#3f6f86', '#e2f2f7'] as [string, string, string] }
    let paint = withEdges(emptyPaint(), GRID, CLIFF, [[2, 2, 2], [3, 2, 2]])
    paint = withConnections(paint, GRID, 'river', RIVER, [[2, 2], [2, 3]], false)
    let sprites = paintSprites(paint, GRID, TEST_PACK)
    const pieces = sprites.filter((s) => s.box)
    expect(pieces.length).toBe(2) // whole: the fall is in front of the cliff, not a gap in it
    for (const p of pieces) {
      expect(p.box!.cliff).toBe(true)
      expect(p.box!.outY).toBeGreaterThan(0.5) // a new cliff faces us: its high ground is the tile above
      expect(Math.round(p.y)).toBe(312) // the face hangs H (0.12 of a tile) below the edge
    }
    const fall = sprites.find((s) => s.fall)!
    expect(paint.palette[fall.fall!.entry - 1].type).toBe('river.river') // the river's, not the cliff's
    expect([Math.round(fall.x), Math.round(fall.y), fall.fall!.mode, Math.round(fall.h)]).toEqual([250, 300, 0, 12]) // down the face
    expect(fall.depth).toBeGreaterThan(pieces[0].depth)
    expect(sprites.filter((s) => s.particle?.shape === PARTICLE_SHAPES.puff && s.particle.entry === fall.fall!.entry).length).toBe(3) // mist
    // turned (the high ground below): its face looks away, the drop isn't seen: white water
    sprites = paintSprites(withTurned(paint, GRID, [[2, 3, 6]]), GRID, TEST_PACK)
    expect(sprites.find((s) => s.box && Math.min(s.x, s.box.qx) < 260)!.box!.outY).toBeLessThan(-0.5)
    expect(sprites.find((s) => s.fall)!.fall!.mode).toBe(2)
    // over a wall: from its top to its foot; along an edge running up the screen: white water; through a fence: a gap
    paint = withEdges(emptyPaint(), GRID, WALL, [[5, 2, 2], [5, 4, 0]])
    paint = withEdges(paint, GRID, FENCE, [[0, 2, 2]])
    paint = withConnections(paint, GRID, 'river', RIVER, [[5, 2], [5, 3]], false)
    paint = withConnections(paint, GRID, 'river', RIVER, [[5, 4], [6, 4]], false)
    paint = withConnections(paint, GRID, 'river', RIVER, [[0, 2], [0, 3]], false)
    sprites = paintSprites(paint, GRID, TEST_PACK)
    const falls = sprites.filter((s) => s.fall).map((s) => [Math.round(s.x), Math.round(s.y), s.fall!.mode, Math.round(s.h)]).sort()
    expect(falls).toEqual([[550, 300, 1, 18], [600, 450, 2, 0]])
    expect(sprites.filter((s) => s.box && s.box.look === 1).length).toBe(2) // the fence, open for the river
  })

  it('lean slopes out toward their low side (plan 51): cones at their outer corners and ends, cascades down them', () => {
    const SLOPE = { type: 'cliff.slope_medium', colors: ['#a99678', '#655846', '#9aa868'] as [string, string, string] }
    const RIVER = { type: 'river.river', colors: ['#86b8cc', '#3f6f86', '#e2f2f7'] as [string, string, string] }
    // a one-tile mesa: its four sides (north and west turned: the tile is high)
    let paint = withEdges(emptyPaint(), GRID, SLOPE, [[2, 2, 2], [2, 2, 0], [2, 2, 6], [2, 2, 4]])
    paint = withTurned(paint, GRID, [[2, 2, 6], [2, 2, 4]])
    paint = withConnections(paint, GRID, 'river', RIVER, [[2, 2], [2, 3]], false)
    const sprites = paintSprites(paint, GRID, TEST_PACK)
    const sides = sprites.filter((s) => s.box && !s.box.cone)
    expect(sides.length).toBe(4)
    for (const s of sides) {
      expect(s.box!.look).toBe(9)
      expect(s.box!.run).toBeCloseTo(24)
      // outward: away from the tile's centre (250, 250)
      const mid = [(s.x + s.box!.qx) / 2, (s.y + s.box!.qy) / 2 - 16]
      expect((mid[0] - 250) * s.box!.outX + (mid[1] - 250) * s.box!.outY).toBeGreaterThan(0)
    }
    const cones = sprites.filter((s) => s.box?.cone)
    expect(cones.map((c) => [Math.round(c.x), Math.round(c.y - 16)]).sort()).toEqual([[200, 200], [200, 300], [300, 200], [300, 300]])
    // the river down its south side: a cascade, from the edge 16 down and 24 out (toward us)
    const fall = sprites.find((s) => s.fall)!.fall!
    expect([fall.mode, Math.round(fall.wx), Math.round(fall.wy), fall.slope]).toEqual([0, 0, 40, true])
    // a lone slope line: its two ends rounded
    const line = paintSprites(withEdges(emptyPaint(), GRID, SLOPE, [[4, 4, 2], [5, 4, 2]]), GRID, TEST_PACK)
    expect(line.filter((s) => s.box?.cone).length).toBe(2)
  })

  it("scatter effects' particles over their tiles, in the sprites' depth order, each with its shape and motion", () => {
    const FLIES = { type: 'lights.fireflies', colors: ['#e8ff7a', '#9adf4a', '#ffffff'] as [string, string, string] }
    const MIST = { type: 'mists.ground', colors: ['#eef2f6', '#c3ccd6', '#ffffff'] as [string, string, string] }
    let paint = withTiles(emptyPaint(), GRID, PINE, block(2, 2, 3, 2), 'scenery')
    paint = withTiles(paint, GRID, FLIES, block(2, 2, 3, 2), 'effects')
    paint = withTiles(paint, GRID, MIST, [[6, 4]], 'effects')
    const sprites = paintSprites(paint, GRID, TEST_PACK)
    const flies = sprites.filter((s) => s.particle?.shape === PARTICLE_SHAPES.glow)
    const mist = sprites.filter((s) => s.particle?.shape === PARTICLE_SHAPES.puff)
    expect(flies.length).toBeGreaterThan(30) // 6 tiles, about 9 a tile
    expect(mist.length).toBeGreaterThan(3)
    for (const f of flies) {
      expect(f.x).toBeGreaterThan(200 - 40); expect(f.x).toBeLessThan(500 + 40)
      expect(f.particle).toMatchObject({ motion: PARTICLE_MOTIONS.wander, night: true, glow: true, twinkle: 0.8, row: 1 })
      expect(paint.palette[f.particle!.entry - 1].type).toBe('lights.fireflies')
      expect(f.particle!.lift).toBeGreaterThanOrEqual(4); expect(f.particle!.lift).toBeLessThanOrEqual(30)
    }
    for (const m of mist) expect(m.w).toBeCloseTo(m.h * 2.4)
    // with the trees, in one depth order
    expect(sprites.some((s) => s.name === 'pine-1')).toBe(true)
    expect(sprites.map((s) => s.depth)).toEqual([...sprites.map((s) => s.depth)].sort((a, b) => a - b))
    expect(paintSprites(paint, GRID, TEST_PACK)).toEqual(sprites)
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
