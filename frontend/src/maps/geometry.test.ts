import type { MapGrid } from '../api/types'
import { brushTiles, cutPiece, fogBytes, gridExtent, labelPoint, neighbours, mergeFog, outlineD, pathCut, pathD, pathSamples, rectTiles, tileAt, tileCenter, tilePolygon, tilesBox, tilesOutline, worldSize, type Tile } from './geometry'

const grid = (over: Partial<MapGrid> = {}): MapGrid => ({
  type: 'square', size: 50, x: 10, y: 20, cols: 8, rows: 6, auto: false, unit_size: 5, unit: 'ft',
  color: '#ffffff', opacity: 0.4, mode: 'color', line: 1, ...over,
})

describe('square grid', () => {
  it('finds the tile under a point and its centre', () => {
    const g = grid()
    expect(tileAt(g, 10, 20)).toEqual([0, 0])
    expect(tileAt(g, 59, 69)).toEqual([0, 0])
    expect(tileAt(g, 60, 70)).toEqual([1, 1])
    expect(tileCenter(g, 2, 1)).toEqual([135, 95])
    expect(gridExtent(g)).toEqual([400, 300])
  })
})

describe('hex grid (pointy-top, odd rows shifted)', () => {
  const g = grid({ type: 'hex', size: 60, x: 0, y: 0, cols: 10, rows: 10 })
  it('round-trips every tile centre (and points near it)', () => {
    for (let r = 0; r < 6; r += 1) {
      for (let c = 0; c < 6; c += 1) {
        const [x, y] = tileCenter(g, c, r)
        expect(tileAt(g, x, y)).toEqual([c, r])
        expect(tileAt(g, x + 12, y - 9)).toEqual([c, r])
      }
    }
  })
  it('shifts odd rows by half a tile and has six corners', () => {
    expect(tileCenter(g, 0, 1)[0] - tileCenter(g, 0, 0)[0]).toBeCloseTo(30)
    expect(tilePolygon(g, 2, 3)).toHaveLength(6)
  })
})

describe('brushes and rectangles', () => {
  it('a brush of 1 is one tile; 2 adds the neighbours (8 on squares, 6 on hexes)', () => {
    expect(brushTiles(grid(), [3, 3], 1)).toEqual([[3, 3]])
    expect(brushTiles(grid(), [3, 3], 2)).toHaveLength(5) // round: the 4 sides (corners are farther)
    expect(brushTiles(grid({ type: 'hex', cols: 10, rows: 10 }), [4, 4], 2)).toHaveLength(7)
    expect(brushTiles(grid(), [0, 0], 3).every(([c, r]) => c >= 0 && r >= 0)).toBe(true)
  })
  it('a rectangle takes the tiles between two corners', () => {
    expect(rectTiles(grid(), [1, 1], [3, 2])).toHaveLength(6)
    expect(tilesBox(grid(), [[0, 0], [1, 1]])).toEqual([10, 20, 100, 100])
  })
})

describe('paths', () => {
  const g = grid({ x: 0, y: 0 })
  it('poly goes from centre to centre', () => {
    expect(pathD(g, { tiles: [[0, 0], [1, 0], [1, 1]], render: 'poly' })).toBe('M 25 25 L 75 25 L 75 75')
  })
  it('spline crosses each edge in its middle, perpendicular to it', () => {
    const d = pathD(g, { tiles: [[0, 0], [1, 0], [1, 1]], render: 'spline' })
    expect(d.startsWith('M 25 25 C')).toBe(true)
    // It reaches the middle of the edge between (0,0) and (1,0), then of (1,0)-(1,1), and ends at the last centre
    expect(d).toContain(', 50 25 C')
    expect(d).toContain(', 75 50 C')
    expect(d.endsWith('75 75')).toBe(true)
    // Leaving the first edge it goes right (perpendicular to that vertical edge): the next control point has y = 25
    expect(d).toMatch(/, 50 25 C 6\d(\.\d)? 25,/)
  })
  it('one tile is a dot; no tiles is nothing', () => {
    expect(pathD(g, { tiles: [[0, 0]], render: 'spline' })).toBe('M 25 25 L 25 25')
    expect(pathD(g, { tiles: [], render: 'poly' })).toBe('')
  })
})

describe('fog and size', () => {
  it('takes the best state over several layers', () => {
    expect([...mergeFog(['0120', '1100', undefined], 4)]).toEqual([1, 1, 2, 0])
  })
  it('covers the pictures and the grid, at least 256 px', () => {
    expect(worldSize([{ x: 0, y: 0, w: 1000, h: 500, scale: 0.5 }], grid({ type: 'none' }))).toEqual([500, 256])
    expect(worldSize([], grid())).toEqual([410, 320])
  })
})

describe('outlines of tiles (regions, highlight)', () => {
  it('follows the edges between tiles in and out, on squares', () => {
    const g = grid({ x: 0, y: 0 })
    const [loop] = tilesOutline(g, [[0, 0], [1, 0]])
    expect(loop).toHaveLength(6)
    const xs = loop.map((p) => p[0])
    const ys = loop.map((p) => p[1])
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, 100, 0, 50])
  })
  it('finds holes as their own loops', () => {
    const ring: Tile[] = []
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) if (c !== 1 || r !== 1) ring.push([c, r])
    const loops = tilesOutline(grid(), ring)
    expect(loops.map((l) => l.length).sort()).toEqual([12, 4])
    // even-odd fill: the hole stays out
    expect(outlineD(loops, 'poly').match(/Z/g)).toHaveLength(2)
  })
  it('works on hexes (neighbours across each of the six edges)', () => {
    const g = grid({ type: 'hex', size: 60, x: 0, y: 0, cols: 6, rows: 6 })
    expect(tilesOutline(g, [[2, 2]])[0]).toHaveLength(6)
    expect(tilesOutline(g, [[2, 2], [3, 2]])[0]).toHaveLength(10) // side by side
    expect(tilesOutline(g, [[2, 2], [2, 3]])[0]).toHaveLength(10) // odd row below, shifted right
    expect(tilesOutline(g, [[2, 2], [3, 2], [2, 3]])[0]).toHaveLength(12) // three around a corner
    expect(tilesOutline(g, [[0, 0], [4, 4]])).toHaveLength(2)
  })
  it('splines are closed curves through the edges\' middles', () => {
    const d = outlineD(tilesOutline(grid({ x: 0, y: 0 }), [[0, 0]]), 'spline')
    expect(d.startsWith('M 25 0 C')).toBe(true)
    expect(d.match(/C/g)).toHaveLength(4)
    expect(d.endsWith('Z')).toBe(true)
  })
  it('puts a name on one of the tiles', () => {
    const g = grid({ x: 0, y: 0 })
    const tiles: Tile[] = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] // an L: its average is off the tiles
    const p = labelPoint(g, tiles)!
    expect(tiles.some(([c, r]) => tileCenter(g, c, r).join() === p.join())).toBe(true)
  })
})

describe('points along paths (arrows, heads and tails)', () => {
  it('spaces points evenly and keeps the ends\' directions', () => {
    const g = grid({ x: 0, y: 0 })
    const { along, start, end, length } = pathSamples(g, { tiles: [[0, 0], [1, 0], [2, 0]], render: 'poly' }, 20, 5)
    expect(length).toBeCloseTo(100)
    expect(along.map((a) => Math.round(a.at[0]))).toEqual([35, 55, 75, 95, 115])
    expect(start!.angle).toBeCloseTo(0)
    expect(end!.at).toEqual([125, 25])
    const down = pathSamples(g, { tiles: [[0, 0], [0, 1]], render: 'spline' }, 20)
    expect(down.end!.angle).toBeCloseTo(Math.PI / 2)
  })
  it('has no points for a one-tile path', () => {
    expect(pathSamples(grid(), { tiles: [[1, 1]], render: 'spline' }, 10).along).toEqual([])
  })
  it('stops a partly shown path at its cut, the head there; the same cut on the tiles players get', () => {
    const g = grid({ x: 0, y: 0 })
    const row: [number, number][] = [[0, 0], [1, 0], [2, 0]]
    expect(pathCut({ tiles: row, shown: 100 })).toBeNull()
    expect(pathCut({ tiles: row })).toBeNull()
    expect(pathCut({ tiles: row, shown: 75 })).toBeCloseTo(1.5)
    expect(pathCut({ tiles: row.slice(0, 2), cut: 0.4 })).toBe(0.4) // players: the server's cut
    for (const render of ['poly', 'spline'] as const) {
      const half = pathSamples(g, { tiles: row, render }, 20, 0, 1.5)
      expect(half.end!.at[0]).toBeCloseTo(100)
      expect(half.end!.angle).toBeCloseTo(0)
      expect(half.length).toBeCloseTo(75)
      expect(Math.max(...half.points.map((p) => p[0]))).toBeCloseTo(100)
      expect(pathSamples(g, { tiles: row, render }, 20, 0, 1).end!.at[0]).toBeCloseTo(75)
      // What players get (the tiles up to the cut's piece) ends at the same place
      const full = pathSamples(g, { tiles: row, render }, 20, 0, 0.4).end!.at[0]
      expect(pathSamples(g, { tiles: row.slice(0, 2), render }, 20, 0, 0.4).end!.at[0]).toBeCloseTo(full)
      expect(full).toBeCloseTo(45)
    }
    const none = pathSamples(g, { tiles: row, render: 'spline' }, 20, 0, 0)
    expect([none.length, none.end!.at, none.end!.angle]).toEqual([0, [25, 25], 0])
    expect(cutPiece(2.4, 6, 'spline')).toEqual([2, expect.closeTo(0.9, 5)])
    expect(cutPiece(5, 6, 'poly')).toEqual([4, 1])
  })
})

describe('the fog edge ring', () => {
  it('finds neighbours like the server (squares with corners, hexes by row parity)', () => {
    const sq = grid({ cols: 4, rows: 3 })
    expect(neighbours(sq, 0, 0)).toHaveLength(3)
    expect(neighbours(sq, 1, 1)).toHaveLength(8)
    const hx = grid({ type: 'hex', cols: 4, rows: 3 })
    expect(neighbours(hx, 1, 1).map(String).sort()).toEqual(['0,1', '1,0', '1,2', '2,0', '2,1', '2,2'])
    expect(neighbours(hx, 1, 2).map(String).sort()).toEqual(['0,1', '0,2', '1,1', '2,2'])
  })
  it('marks unknown tiles touching known or visible ones', () => {
    const g = grid({ cols: 4, rows: 1 })
    expect([...fogBytes(new Uint8Array([2, 0, 0, 1]), g)]).toEqual([255, 51, 51, 127])
    expect([...fogBytes(new Uint8Array([0, 0, 0, 0]), g)]).toEqual([0, 0, 0, 0])
  })
})

describe('distance moved (plan 39)', () => {
  it('counts tiles: square diagonals as one; hex steps', async () => {
    const { tileDistance } = await import('./geometry')
    expect(tileDistance({ type: 'square' }, [1, 1], [4, 3])).toBe(3)
    expect(tileDistance({ type: 'square' }, [2, 2], [2, 2])).toBe(0)
    // Pointy-top hexes, odd rows shifted right: (0,0) → (1,1) is one step; (0,0) → (0,2) two
    expect(tileDistance({ type: 'hex' }, [0, 0], [0, 1])).toBe(1)
    expect(tileDistance({ type: 'hex' }, [0, 0], [1, 1])).toBe(2)
    expect(tileDistance({ type: 'hex' }, [1, 1], [1, 0])).toBe(1)
    expect(tileDistance({ type: 'hex' }, [0, 0], [0, 2])).toBe(2)
    expect(tileDistance({ type: 'hex' }, [0, 0], [3, 0])).toBe(3)
  })

  it('says it in the map\'s units (tiles × the distance per tile), else in tiles', async () => {
    const { distanceLabel } = await import('./geometry')
    expect(distanceLabel({ unit_size: 5, unit: 'ft' }, 3)).toBe('15 ft')
    expect(distanceLabel({ unit_size: 1.5, unit: 'm' }, 3)).toBe('4.5 m')
    expect(distanceLabel({ unit_size: 0, unit: '' }, 1)).toBe('1 tile')
    expect(distanceLabel({ unit_size: 0, unit: '' }, 4)).toBe('4 tiles')
  })
})
