import { d100Faces, dieMesh, dot, faceLabel, polyhedron, type Vec } from './geometry'
import { landing, qmul, rotate, simulate } from './physics'

describe('dice shapes', () => {
  it.each([4, 6, 8, 10, 12, 20])('d%i: one face per value, flat, facing out; opposite faces add up', (sides) => {
    const p = polyhedron(sides)
    expect(p.faces.map((f) => f.value).sort((a, b) => a - b)).toEqual(Array.from({ length: sides }, (_, i) => i + 1))
    for (const f of p.faces) {
      const vs = f.verts.map((i) => p.vertices[i])
      const c = vs.reduce((s, v) => [s[0] + v[0] / vs.length, s[1] + v[1] / vs.length, s[2] + v[2] / vs.length] as Vec, [0, 0, 0] as Vec)
      expect(dot(f.normal, c)).toBeGreaterThan(0) // outward
      const d = dot(vs[0], f.normal)
      for (const v of vs) expect(dot(v, f.normal)).toBeCloseTo(d, 5) // flat
      const opposite = p.faces.find((g) => dot(g.normal, f.normal) < -0.999)
      if (sides !== 4) expect(opposite && opposite.value + f.value).toBe(sides + 1)
    }
  })
  it('makes a mesh with rounded edges and an atlas cell per face (and one plain)', () => {
    const m = dieMesh(20, { chamfer: 0.1 })
    expect(m.positions.length).toBe(m.normals.length)
    expect(m.uvs.length / 2).toBe(m.positions.length / 3)
    expect(m.cells).toBe(21)
    expect(m.inradius).toBeGreaterThan(0.7)
    expect(dieMesh(6, { chamfer: 0 }).positions.length).toBe(6 * 2 * 9) // sharp: just the faces
  })
  it('labels a d100 as two d10s', () => {
    expect(d100Faces(100)).toEqual([10, 10])
    expect(d100Faces(47)).toEqual([4, 7])
    expect([faceLabel(100, 10, 'tens'), faceLabel(100, 4, 'tens'), faceLabel(100, 10, 'units')]).toEqual(['00', '40', '0'])
  })
})

describe('the throw', () => {
  const dice = [0, 1, 2].map((i) => ({ x: -2 + i * 2, z: 4, rest: 0.8, reach: 1 }))
  it('is the same on every screen, stays in the box and comes to rest', () => {
    const a = simulate(dice, 16, 10, 42)
    expect(simulate(dice, 16, 10, 42)).toEqual(a)
    expect(simulate(dice, 16, 10, 43)).not.toEqual(a)
    for (const f of a) for (const p of f.p) {
      expect(Math.abs(p[0])).toBeLessThanOrEqual(8)
      expect(Math.abs(p[2])).toBeLessThanOrEqual(5)
      expect(p[1]).toBeGreaterThanOrEqual(0.8 - 1e-9)
    }
    expect(a.length).toBeLessThan(360) // rested before the end
  })
  it('lands a die on any face', () => {
    const frames = simulate(dice, 16, 10, 7)
    const last = frames[frames.length - 1].q[0]
    for (const f of polyhedron(20).faces) {
      const up = rotate(qmul(last, landing(last, f.normal)), f.normal)
      expect(up[1]).toBeCloseTo(1, 5)
    }
  })
})
