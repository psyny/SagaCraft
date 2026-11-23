/**
 * Dice shapes (pure, no three.js): the polyhedra, each face with its value and outward normal, made into a triangle
 * mesh with chamfered ("a bit rounded") edges and per-face UVs into a number atlas (textures.ts).
 * d2 a coin (1 and 2 on its faces), d4 a crystal (a square prism with pointed ends: 4 numbered long faces), d6 cube,
 * d8 octahedron, d10 pentagonal trapezohedron, d12 dodecahedron, d20 icosahedron; a d100 is two d10s (tens and units).
 * Opposite numbered faces add up to sides + 1. Faces without a number (a coin's rim, a crystal's tips) are value 0, plain.
 * See dice/DiceScene.tsx.
 */
export type Vec = [number, number, number]

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: Vec) => Math.hypot(a[0], a[1], a[2])
export const norm = (a: Vec): Vec => mul(a, 1 / (len(a) || 1))

const PHI = (1 + Math.sqrt(5)) / 2

export interface Polyhedron {
  vertices: Vec[]
  /** Each face: its vertex indexes (counter-clockwise from outside), value (0: no number), outward normal. */
  faces: { verts: number[]; value: number; normal: Vec }[]
}

/** Faces of a convex polyhedron from its vertices and its faces' directions: the vertices on each outermost plane. */
function facesFrom(vertices: Vec[], directions: Vec[]): number[][] {
  return directions.map((dir) => {
    const n = norm(dir)
    const d = Math.max(...vertices.map((v) => dot(v, n)))
    const on = vertices.map((v, i) => [i, dot(v, n)] as const).filter(([, x]) => x > d - 1e-6).map(([i]) => i)
    return orderAround(vertices, on, n)
  })
}

/** Faces of a convex polyhedron from its vertices alone (a small brute-force hull: dice have at most 20 corners). */
function hullFaces(vertices: Vec[]): number[][] {
  const seen: Vec[] = []
  const faces: number[][] = []
  const n = vertices.length
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) {
    let normal = cross(sub(vertices[b], vertices[a]), sub(vertices[c], vertices[a]))
    if (len(normal) < 1e-9) continue
    normal = norm(normal)
    let d = dot(normal, vertices[a])
    if (d < 0) { normal = mul(normal, -1); d = -d }
    if (vertices.some((v) => dot(v, normal) > d + 1e-6)) continue // not an outer plane
    if (seen.some((m) => dot(m, normal) > 1 - 1e-6)) continue
    seen.push(normal)
    const on = vertices.map((v, i) => [i, dot(v, normal)] as const).filter(([, x]) => x > d - 1e-6).map(([i]) => i)
    faces.push(orderAround(vertices, on, normal))
  }
  return faces
}

/** A face's vertices ordered counter-clockwise around its normal. */
function orderAround(vertices: Vec[], idx: number[], n: Vec): number[] {
  const c = mul(idx.reduce((s, i) => add(s, vertices[i]), [0, 0, 0] as Vec), 1 / idx.length)
  const u = norm(sub(vertices[idx[0]], c))
  const w = cross(n, u)
  return [...idx].sort((a, b) => {
    const pa = sub(vertices[a], c), pb = sub(vertices[b], c)
    return Math.atan2(dot(pa, w), dot(pa, u)) - Math.atan2(dot(pb, w), dot(pb, u))
  })
}

/** A polygon's normal (Newell's method): the best fit when a rough die's face isn't quite flat. */
function newell(vs: Vec[]): Vec {
  const n: Vec = [0, 0, 0]
  vs.forEach((a, i) => {
    const b = vs[(i + 1) % vs.length]
    n[0] += (a[1] - b[1]) * (a[2] + b[2])
    n[1] += (a[2] - b[2]) * (a[0] + b[0])
    n[2] += (a[0] - b[0]) * (a[1] + b[1])
  })
  return norm(n)
}
const centroid = (vs: Vec[]) => mul(vs.reduce((s, v) => add(s, v), [0, 0, 0] as Vec), 1 / vs.length)

function icosaVertices(): Vec[] {
  const out: Vec[] = []
  for (const a of [-1, 1]) for (const b of [-PHI, PHI]) out.push([0, a, b], [a, b, 0], [b, 0, a])
  return out
}

function dodecaVertices(): Vec[] {
  const out: Vec[] = []
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push([x, y, z])
  const p = PHI, q = 1 / PHI
  for (const a of [-1, 1]) for (const b of [-1, 1]) out.push([0, a * q, b * p], [a * q, b * p, 0], [a * p, 0, b * q])
  return out
}

/** The pentagonal trapezohedron (d10): two apexes and a zig-zag ring, its apex height making the kites flat. */
function d10(): { vertices: Vec[]; faces: number[][] } {
  const a = 0.105
  const ring: Vec[] = Array.from({ length: 10 }, (_, i) => {
    const t = (i * Math.PI) / 5
    return [Math.cos(t), i % 2 ? -a : a, Math.sin(t)]
  })
  // The apex where the plane through ring 0, 1, 2 meets the axis
  const n = cross(sub(ring[1], ring[0]), sub(ring[2], ring[0]))
  const h = Math.abs(dot(n, ring[0]) / n[1])
  const vertices: Vec[] = [[0, h, 0], [0, -h, 0], ...ring]
  const faces: number[][] = []
  for (let k = 0; k < 5; k++) {
    faces.push([0, 2 + 2 * k, 2 + ((2 * k + 1) % 10), 2 + ((2 * k + 2) % 10)])
    faces.push([1, 2 + ((2 * k + 1) % 10), 2 + ((2 * k + 2) % 10), 2 + ((2 * k + 3) % 10)])
  }
  return { vertices, faces }
}

/** Values so opposite faces add up to sides + 1 (when the shape has opposite faces). */
/** Faces counter-clockwise from outside, with their normals (no values yet). */
function orient(vertices: Vec[], faces: number[][]): Polyhedron['faces'] {
  const out = faces.map((f) => {
    const c = centroid(f.map((i) => vertices[i]))
    let verts = f
    const n0 = norm(cross(sub(vertices[f[1]], vertices[f[0]]), sub(vertices[f[2]], vertices[f[0]])))
    if (dot(n0, c) < 0) verts = [...f].reverse() // counter-clockwise from outside
    return { verts, value: 0, normal: norm(c) }
  })
  const normals = out.map((f) => {
    const vs = f.verts.map((i) => vertices[i])
    return norm(cross(sub(vs[1], vs[0]), sub(vs[2], vs[0])))
  })
  out.forEach((f, i) => { f.normal = normals[i] })
  return out
}

/** Values so opposite faces add up to sides + 1 (when the shape has opposite faces). */
function assignValues(vertices: Vec[], faces: number[][]): Polyhedron['faces'] {
  const out = orient(vertices, faces)
  const n = out.length
  const opposite = (i: number) => out.findIndex((g, j) => j !== i && dot(g.normal, out[i].normal) < -0.999)
  let next = 1
  for (let i = 0; i < n; i++) {
    if (out[i].value) continue
    out[i].value = next
    const j = opposite(i)
    if (j >= 0 && !out[j].value) out[j].value = n + 1 - next
    next += 1
    while (out.some((f) => f.value === next)) next += 1
  }
  return out
}

/** A coin: a thin 24-sided disc; 1 on top, 2 below, its rim plain. */
function coin(): Polyhedron {
  const n = 24, t = 0.17
  const vertices: Vec[] = []
  for (const y of [t, -t]) for (let i = 0; i < n; i++) vertices.push([Math.cos((i * 2 * Math.PI) / n), y, Math.sin((i * 2 * Math.PI) / n)])
  const faces = orient(vertices, hullFaces(vertices))
  for (const f of faces) f.value = f.normal[1] > 0.99 ? 1 : f.normal[1] < -0.99 ? 2 : 0
  return { vertices, faces }
}

/** A crystal d4: a square prism with pointed ends; its 4 long faces numbered (opposite ones add up to 5), the tips plain. */
function crystal(): Polyhedron {
  const a = 0.5, h = 0.7, tip = 0.45
  const vertices: Vec[] = [[0, h + tip, 0], [0, -h - tip, 0]]
  for (const y of [h, -h]) for (const [x, z] of [[a, a], [a, -a], [-a, -a], [-a, a]]) vertices.push([x, y, z])
  const faces = orient(vertices, hullFaces(vertices))
  // Around the long axis: +x 1, +z 2, -x 4, -z 3
  for (const f of faces) {
    const [x, y, z] = f.normal
    f.value = Math.abs(y) > 0.01 ? 0 : x > 0.9 ? 1 : z > 0.9 ? 2 : x < -0.9 ? 4 : 3
  }
  return { vertices, faces }
}

/** The polyhedron of a die, scaled to a circumradius of 1. */
export function polyhedron(sides: number): Polyhedron {
  let vertices: Vec[]
  let faces: number[][]
  if (sides === 2 || sides === 4) {
    const p = sides === 2 ? coin() : crystal()
    const r = Math.max(...p.vertices.map(len))
    return { vertices: p.vertices.map((v) => mul(v, 1 / r)), faces: p.faces }
  }
  switch (sides) {
    case 6:
      vertices = []
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) vertices.push([x, y, z])
      faces = facesFrom(vertices, [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]])
      break
    case 8:
      vertices = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
      faces = facesFrom(vertices, (() => { const d: Vec[] = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) d.push([x, y, z]); return d })())
      break
    case 10:
    case 100: {
      const t = d10()
      vertices = t.vertices
      faces = t.faces
      break
    }
    case 12:
      vertices = dodecaVertices()
      faces = hullFaces(vertices)
      break
    case 20:
      vertices = icosaVertices()
      faces = hullFaces(vertices)
      break
    default:
      throw new Error(`No d${sides}`)
  }
  const r = Math.max(...vertices.map(len))
  vertices = vertices.map((v) => mul(v, 1 / r))
  return { vertices, faces: assignValues(vertices, faces) }
}

/** What a face shows: d10 1..10; a d100's tens die "00".."90" and its units die "0".."9". */
export function faceLabel(_sides: number, value: number, part: 'tens' | 'units' | null = null): string {
  if (part === 'tens') return `${(value % 10) * 10}`.padStart(2, '0')
  if (part === 'units') return `${value % 10}`
  return String(value)
}

/** The faces a d100 roll lands on: [tens die value, units die value] (10 stands for 0). */
export function d100Faces(value: number): [number, number] {
  const tens = Math.floor((value % 100) / 10)
  const units = value % 10
  return [tens || 10, units || 10]
}

export interface DieMesh {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  /** Each vertex's face's "up" (its number's top; on edges and corners blended between the faces around): the way a
   *  surface's flames climb (dice/surfaces.ts). */
  ups: Float32Array
  /** Each numbered face (in atlas cell order): its value, its normal in the die's own frame (it points up when it's
   * rolled) and `up`, the way its number's top points (turned to the screen's top when it lands). */
  faces: { value: number; normal: Vec; up: Vec }[]
  /** Each face's outline in its atlas cell, from its centre (-1..1, y up; the chamfer's inner edge). */
  outlines: [number, number][][]
  /** How many atlas cells: one per numbered face, and the last one plain (edges, corners, faces without a number). */
  cells: number
  /** The face's inscribed size to its circumscribed (number size in its cell). */
  numberScale: number
  /** Distance from the centre to a face (how high it rests). */
  inradius: number
}

export interface MeshOptions {
  /** Edge rounding, 0 (sharp) to ~0.3. */
  chamfer?: number
  /** Stretch (x, y, z). */
  scale?: Vec
  /** Rough, uneven shape (0: none): vertices nudged, from a seed. */
  rough?: number
}

/** Atlas cell rectangle (u0, v0, size) for cell index i in a square grid of `cols`. */
export function cellOf(i: number, cols: number) {
  const size = 1 / cols
  return { u: (i % cols) * size, v: 1 - (Math.floor(i / cols) + 1) * size, size }
}

export const atlasCols = (cells: number) => Math.ceil(Math.sqrt(cells))

/** The die as triangles: faces (numbered), edge strips and corner caps (rounded shading), UVs into the atlas. */
export function dieMesh(sides: number, options: MeshOptions = {}): DieMesh {
  const poly = polyhedron(sides)
  const chamfer = options.chamfer ?? 0.1
  const scale = options.scale ?? [1, 1, 1]
  let rnd = 1234567
  const jitter = () => { rnd = (rnd * 16807) % 2147483647; return (rnd / 2147483647 - 0.5) * 2 }
  const vertices = poly.vertices.map((v) => {
    const s: Vec = [v[0] * scale[0], v[1] * scale[1], v[2] * scale[2]]
    return options.rough ? add(s, mul([jitter(), jitter(), jitter()], options.rough)) : s
  })
  const faces = poly.faces.map((f) => {
    const vs = f.verts.map((i) => vertices[i])
    return { ...f, normal: newell(vs), center: centroid(vs) }
  })
  const tops: Vec[] = []
  const outlines: [number, number][][] = []
  const numbered = faces.filter((f) => f.value > 0)
  const cells = numbered.length + 1
  const cols = atlasCols(cells)
  const pos: number[] = [], nor: number[] = [], uv: number[] = []
  const up: number[] = []
  // A face's up: its number's top (set below), or for a face without a number the world's up laid on it
  const faceUp: Vec[] = faces.map((f) => {
    const t = sub([0, 1, 0], mul(f.normal, f.normal[1]))
    return len(t) > 0.1 ? norm(t) : norm(sub([0, 0, 1], mul(f.normal, f.normal[2])))
  })
  const tri = (a: Vec, b: Vec, c: Vec, na: Vec, nb: Vec, nc: Vec, ua: [number, number], ub: [number, number], uc: [number, number],
    wa: Vec, wb: Vec, wc: Vec) => {
    up.push(...wa, ...wb, ...wc)
    pos.push(...a, ...b, ...c)
    nor.push(...na, ...nb, ...nc)
    uv.push(...ua, ...ub, ...uc)
  }
  // Inset copy of each face's vertices (the chamfer): towards the face's centre
  const inset = faces.map((f) => f.verts.map((i) => add(vertices[i], mul(sub(f.center, vertices[i]), chamfer))))
  const plain = cellOf(cells - 1, cols)
  const plainUv: [number, number] = [plain.u + plain.size / 2, plain.v + plain.size / 2]
  // Faces: a fan, UVs projected into their cell
  let numberScale = 1
  faces.forEach((f, fi) => {
    const pts = inset[fi]
    if (!f.value) { // no number: plain, like the edges
      for (let i = 1; i < pts.length - 1; i++) tri(pts[0], pts[i], pts[i + 1], f.normal, f.normal, f.normal, plainUv, plainUv, plainUv, faceUp[fi], faceUp[fi], faceUp[fi])
      return
    }
    const ci = numbered.indexOf(f)
    const c = centroid(pts)
    // A d6's or a crystal d4's number is square to its edges (its top towards its longest edge's middle, so a crystal
    // lies across the screen); others point at a corner
    let u: Vec
    if (sides === 6 || sides === 4) {
      const e = pts.map((p, i) => [p, pts[(i + 1) % pts.length]] as const)
      const [p, q] = e.reduce((best, x) => (len(sub(x[1], x[0])) > len(sub(best[1], best[0])) + 1e-6 ? x : best))
      u = norm(sub(mul(add(p, q), 0.5), c))
    } else u = norm(sub(pts[0], c))
    const w = cross(u, f.normal) // to the right, seen from outside (so numbers aren't mirrored)
    // Turn the number so it stands upright on the face (its first vertex up)
    const proj = pts.map((p) => [dot(sub(p, c), w), dot(sub(p, c), u)] as [number, number])
    const R = Math.max(...proj.map(([x, y]) => Math.hypot(x, y)))
    const inr = Math.min(...proj.map((p, i) => {
      const q = proj[(i + 1) % proj.length]
      const [ex, ey] = [q[0] - p[0], q[1] - p[1]]
      return Math.abs(p[0] * ey - p[1] * ex) / Math.hypot(ex, ey)
    }))
    numberScale = Math.min(numberScale, inr / R)
    tops.push(u)
    faceUp[fi] = u
    outlines.push(proj.map(([px, py]) => [px / R, py / R]))
    const cell = cellOf(ci, cols)
    const k = (cell.size / 2) * 0.96 / R
    const toUv = ([x, y]: [number, number]): [number, number] => [cell.u + cell.size / 2 + x * k, cell.v + cell.size / 2 + y * k]
    for (let i = 1; i < pts.length - 1; i++) {
      tri(pts[0], pts[i], pts[i + 1], f.normal, f.normal, f.normal, toUv(proj[0]), toUv(proj[i]), toUv(proj[i + 1]), u, u, u)
    }
  })
  if (chamfer > 0) {
    // Edge strips: between two faces' inset edges, shaded from one face's normal to the other's
    const edges = new Map<string, { f: number; i: number }>()
    faces.forEach((f, fi) => f.verts.forEach((v, i) => {
      const w = f.verts[(i + 1) % f.verts.length]
      edges.set(`${v}-${w}`, { f: fi, i })
    }))
    faces.forEach((f, fi) => f.verts.forEach((v, i) => {
      const w = f.verts[(i + 1) % f.verts.length]
      if (v > w) return
      const other = edges.get(`${w}-${v}`)
      if (!other) return
      const g = other.f
      const a1 = inset[fi][i], b1 = inset[fi][(i + 1) % f.verts.length]
      const a2 = inset[g][(other.i + 1) % faces[g].verts.length], b2 = inset[g][other.i]
      const n1 = f.normal, n2 = faces[g].normal
      const w1 = faceUp[fi], w2 = faceUp[g]
      tri(a1, a2, b2, n1, n2, n2, plainUv, plainUv, plainUv, w1, w2, w2)
      tri(a1, b2, b1, n1, n2, n1, plainUv, plainUv, plainUv, w1, w2, w1)
    }))
    // Corner caps: each vertex's inset copies around it, shaded towards the vertex
    vertices.forEach((v, vi) => {
      const around = faces.map((f, fi) => [fi, f.verts.indexOf(vi)] as const).filter(([, i]) => i >= 0)
      if (around.length < 3) return
      const pts = around.map(([fi, i]) => inset[fi][i])
      const n = norm(v)
      const order = orderAround(pts, pts.map((_, i) => i), n)
      const ordered = order.map((i) => pts[i])
      const c = centroid(ordered)
      const ups = order.map((k) => faceUp[around[k][0]])
      const middleUp = norm(ups.reduce((acc, w) => add(acc, w), [0, 0, 0] as Vec))
      for (let i = 0; i < ordered.length; i++) {
        const p = ordered[i], q = ordered[(i + 1) % ordered.length]
        tri(c, p, q, n, norm(add(n, faces[around[order[i]][0]].normal)), norm(add(n, faces[around[order[(i + 1) % ordered.length]][0]].normal)),
          plainUv, plainUv, plainUv, middleUp, ups[i], ups[(i + 1) % ordered.length])
      }
    })
  }
  // It rests on a numbered face (the one opposite its value)
  const inradius = Math.min(...numbered.map((f) => dot(f.center, f.normal)))
  return {
    positions: new Float32Array(pos), normals: new Float32Array(nor), uvs: new Float32Array(uv), ups: new Float32Array(up),
    faces: numbered.map((f, i) => ({ value: f.value, normal: f.normal, up: tops[i] })), outlines, cells, numberScale, inradius,
  }
}
