import { d100Faces, dieMesh, dot, faceLabel, polyhedron, type Vec } from './geometry'
import { landing, qmul, rotate, simulate } from './physics'

describe('dice shapes', () => {
  it.each([2, 4, 6, 8, 10, 12, 20])('d%i: one face per value, flat, facing out; opposite faces add up', (sides) => {
    const p = polyhedron(sides)
    expect(p.faces.map((f) => f.value).filter(Boolean).sort((a, b) => a - b)).toEqual(Array.from({ length: sides }, (_, i) => i + 1))
    for (const f of p.faces.filter((x) => x.value)) {
      const vs = f.verts.map((i) => p.vertices[i])
      const c = vs.reduce((s, v) => [s[0] + v[0] / vs.length, s[1] + v[1] / vs.length, s[2] + v[2] / vs.length] as Vec, [0, 0, 0] as Vec)
      expect(dot(f.normal, c)).toBeGreaterThan(0) // outward
      const d = dot(vs[0], f.normal)
      for (const v of vs) expect(dot(v, f.normal)).toBeCloseTo(d, 5) // flat
      const opposite = p.faces.find((g) => dot(g.normal, f.normal) < -0.999)
      expect(opposite && opposite.value + f.value).toBe(sides + 1)
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
  it('throws new dice around the ones already resting on the Set (they don\'t move)', () => {
    const before = simulate(dice, 16, 10, 5)
    const resting = before[before.length - 1].p.map((p) => ({ p, reach: 1 }))
    const frames = simulate(dice, 16, 10, 9, resting)
    for (const p of frames[frames.length - 1].p) {
      for (const o of resting) expect(Math.hypot(p[0] - o.p[0], p[1] - o.p[1], p[2] - o.p[2])).toBeGreaterThan(2 - 0.05)
    }
    expect(simulate(dice, 16, 10, 9, resting)).toEqual(frames) // still the same on every screen
  })
  it('lands a die on any face', () => {
    const frames = simulate(dice, 16, 10, 7)
    const last = frames[frames.length - 1].q[0]
    for (const f of polyhedron(20).faces) {
      const up = rotate(qmul(last, landing(last, f.normal)), f.normal)
      expect(up[1]).toBeCloseTo(1, 5)
    }
  })
  it.each([2, 4, 6, 8, 10, 12, 20])('d%i lands each value straight up, flat on the floor (rough ones too)', (sides) => {
    const frames = simulate(dice, 16, 10, 11)
    const last = frames[frames.length - 1].q[1]
    for (const rough of [0, 0.11]) {
      const m = dieMesh(sides, { chamfer: 0.04, rough })
      expect(m.faces.map((f) => f.value).sort((a, b) => a - b)).toEqual(Array.from({ length: sides }, (_, i) => i + 1))
      for (const f of m.faces) {
        expect(rotate(qmul(last, landing(last, f.normal)), f.normal)[1]).toBeCloseTo(1, 5)
        // Turned so its number reads upright (its top to the screen's top, here -z), still face up
        const q = qmul(last, landing(last, f.normal, f.up, [0, 0, -1]))
        expect(rotate(q, f.normal)[1]).toBeCloseTo(1, 5)
        const top = rotate(q, f.up)
        expect(top[2] / Math.hypot(top[0], top[2])).toBeCloseTo(-1, 5)
      }
    }
  })
  it('makes a d4 a crystal and a d2 a coin: they rest flat on a numbered face, the others plain', () => {
    const crystal = polyhedron(4)
    expect(crystal.faces).toHaveLength(12) // 4 long faces, 8 tip faces
    expect(crystal.faces.filter((f) => f.value).every((f) => Math.abs(f.normal[1]) < 1e-6)).toBe(true) // around the long axis
    const coin = polyhedron(2)
    expect(coin.faces.filter((f) => f.value).map((f) => [f.value, Math.round(f.normal[1])])).toEqual(expect.arrayContaining([[1, 1], [2, -1]]))
    for (const sides of [2, 4]) {
      const m = dieMesh(sides, { chamfer: 0.08 })
      expect(m.faces.map((f) => f.value).sort()).toEqual(Array.from({ length: sides }, (_, i) => i + 1))
      expect(m.cells).toBe(sides + 1) // a cell per number, and the plain one
      // It lies on the face opposite its value: as low as that face
      expect(m.inradius).toBeLessThanOrEqual(0.6)
    }
  })
})
