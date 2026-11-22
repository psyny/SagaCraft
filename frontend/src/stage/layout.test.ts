import type { StageSetView } from '../api/types'
import { clampInner, zoomInner } from './sets/maps/MapSetView'
import { faceBox } from '../components/SvgPicture'
import { dragScreen, screenRect } from './layout'
import { moveLayer } from './StageSets'

describe('interface layout', () => {
  it('places Sets from their anchor, size and offset (same as the server)', () => {
    expect(screenRect({ anchor: 'bottom', width: 50, height: 30, x: 0, y: 0 }, 1000, 800)).toEqual({ x: 250, y: 560, w: 500, h: 240 })
    expect(screenRect({ anchor: 'top-left', width: 100, height: 100, x: 0, y: 0 }, 1000, 800)).toEqual({ x: 0, y: 0, w: 1000, h: 800 })
    expect(screenRect({ anchor: 'right', width: 50, height: 100, x: -10, y: 0 }, 1000, 800)).toEqual({ x: 400, y: 0, w: 500, h: 800 })
  })
  it('turns drags into % of the screen', () => {
    const base = { anchor: 'top-left' as const, width: 40, height: 40, x: 0, y: 0 }
    expect(dragScreen(base, 'move', 100, -80, 1000, 800)).toMatchObject({ x: 10, y: -10 })
    expect(dragScreen(base, 'resize', 100, 80, 1000, 800)).toMatchObject({ width: 50, height: 50 })
    expect(dragScreen({ ...base, anchor: 'center' }, 'resize', 100, 0, 1000, 800)).toMatchObject({ width: 60 })
    expect(dragScreen(base, 'resize', 5000, 0, 1000, 800).width).toBe(100)
  })
})

describe('layers', () => {
  const sets = [{ id: 1, layer: 1 }, { id: 2, layer: 2 }, { id: 3, layer: 3 }] as StageSetView[]
  it('moves a Set up or down a layer (bottom to top order)', () => {
    expect(moveLayer(sets, 1, 1)).toEqual([2, 1, 3])
    expect(moveLayer(sets, 3, 1)).toEqual([1, 2, 3])
    expect(moveLayer(sets, 3, -1)).toEqual([1, 3, 2])
  })
})

describe('the map Set\'s own zoom', () => {
  it('zooms around a point and keeps the map over the box', () => {
    const v = zoomInner({ k: 1, x: 0, y: 0 }, 2, 100, 50, 400, 200)
    expect(v).toEqual({ k: 2, x: -100, y: -50 })
    expect(clampInner({ k: 2, x: 50, y: -999 }, 400, 200)).toEqual({ k: 2, x: 0, y: -200 })
    expect(zoomInner(v, 0.1, 0, 0, 400, 200)).toEqual({ k: 1, x: 0, y: 0 })
  })
})

describe('faces in SVG', () => {
  it('fits the face crop into the circle', () => {
    // a 0.5-wide face centred at (0.5, 0.25) of a 2:1 tall picture, into r = 10 at (0, 0)
    expect(faceBox({ x: 0.5, y: 0.25, size: 0.5 }, 2, 0, 0, 10)).toEqual({ x: -20, y: -20, width: 40, height: 80 })
  })
})
