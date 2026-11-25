import type { MapImage } from '../../api/types'
import { imageBox } from '../geometry'
import { normalAngle, resizeFromCorner } from './PicturesTool'

const picture = (changes: Partial<MapImage> = {}): MapImage => ({ id: 'img1', file_id: 1, x: 0, y: 0, w: 100, h: 50, scale: 1, ...changes })

/** Where a corner of the picture is on the map (its own frame turned around its middle). */
function cornerAt(i: MapImage, n: number): [number, number] {
  const hw = (i.w * i.scale) / 2, hh = (i.h * i.scale) / 2
  const [lx, ly] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]][n]
  const cx = i.x + hw, cy = i.y + hh
  const a = ((i.rotation ?? 0) * Math.PI) / 180
  return [cx + lx * Math.cos(a) - ly * Math.sin(a), cy + lx * Math.sin(a) + ly * Math.cos(a)]
}

describe('map pictures', () => {
  it('keep angles between -180 and 180', () => {
    expect([normalAngle(450), normalAngle(-190), normalAngle(90), normalAngle(0)]).toEqual([90, 170, 90, 0])
  })
  it('resize from a corner: the opposite corner stays, the shape too', () => {
    const big = resizeFromCorner(picture(), 2, [200, 100]) // bottom right dragged out
    expect([big.scale, big.x, big.y]).toEqual([2, 0, 0])
    const small = resizeFromCorner(picture(), 0, [50, 25]) // top left dragged in: the bottom right stays at (100, 50)
    expect(small.scale).toBeCloseTo(0.5)
    expect(cornerAt(small, 2).map(Math.round)).toEqual([100, 50])
    // Turned a quarter: still the opposite corner that stays
    const turned = picture({ rotation: 90 })
    const fixed = cornerAt(turned, 2)
    const grown = resizeFromCorner(turned, 0, [150, -100])
    expect(grown.scale).toBeGreaterThan(1)
    cornerAt(grown, 2).forEach((v, n) => expect(Math.abs(v - fixed[n])).toBeLessThanOrEqual(1)) // x and y are whole px
    expect(resizeFromCorner(picture(), 2, [-500, -500]).scale).toBe(0.05) // never inside out
  })
  it('cover their turned box on the map', () => {
    expect(imageBox(picture())).toEqual([0, 0, 100, 50])
    expect(imageBox(picture({ rotation: 90 })).map(Math.round)).toEqual([25, -25, 75, 75])
  })
})
