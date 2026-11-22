/**
 * Dice shapes (pure, no three.js): the polyhedra, each face with its value and outward normal, made into a triangle
 * mesh with chamfered ("a bit rounded") edges and per-face UVs into a number atlas (textures.ts).
 * d4 tetrahedron, d6 cube, d8 octahedron, d10 pentagonal trapezohedron, d12 dodecahedron, d20 icosahedron; a d100 is
 * two d10s (tens and units). Opposite faces add up to sides + 1 (d4: none). See dice/DiceScene.tsx.
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
  /** Each face: its vertex indexes (counter-clockwise from outside), value, outward normal. */
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
function assignValues(vertices: Vec[], faces: number[][]): Polyhedron['faces'] {
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

/** The polyhedron of a die, scaled to a circumradius of 1. */
export function polyhedron(sides: number): Polyhedron {
  let vertices: Vec[]
  let faces: number[][]
  switch (sides) {
    case 4:
      vertices = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]
      faces = facesFrom(vertices, vertices.map((v) => mul(v, -1)))
      break
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
  /** Faces' values and normals in the die's own frame (for landing a value face up). */
  faces: { value: number; normal: Vec }[]
  /** How many atlas cells: one per face, and the last one plain (edges and corners). */
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
    return { ...f, normal: norm(cross(sub(vs[1], vs[0]), sub(vs[2], vs[0]))), center: centroid(vs) }
  })
  const cells = faces.length + 1
  const cols = atlasCols(cells)
  const pos: number[] = [], nor: number[] = [], uv: number[] = []
  const tri = (a: Vec, b: Vec, c: Vec, na: Vec, nb: Vec, nc: Vec, ua: [number, number], ub: [number, number], uc: [number, number]) => {
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
    const c = centroid(pts)
    const u = norm(sub(pts[0], c))
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
    const cell = cellOf(fi, cols)
    const k = (cell.size / 2) * 0.96 / R
    const toUv = ([x, y]: [number, number]): [number, number] => [cell.u + cell.size / 2 + x * k, cell.v + cell.size / 2 + y * k]
    for (let i = 1; i < pts.length - 1; i++) {
      tri(pts[0], pts[i], pts[i + 1], f.normal, f.normal, f.normal, toUv(proj[0]), toUv(proj[i]), toUv(proj[i + 1]))
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
      tri(a1, a2, b2, n1, n2, n2, plainUv, plainUv, plainUv)
      tri(a1, b2, b1, n1, n2, n1, plainUv, plainUv, plainUv)
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
      for (let i = 0; i < ordered.length; i++) {
        const p = ordered[i], q = ordered[(i + 1) % ordered.length]
        tri(c, p, q, n, norm(add(n, faces[around[order[i]][0]].normal)), norm(add(n, faces[around[order[(i + 1) % ordered.length]][0]].normal)),
          plainUv, plainUv, plainUv)
      }
    })
  }
  const inradius = Math.min(...faces.map((f) => dot(f.center, f.normal)))
  return {
    positions: new Float32Array(pos), normals: new Float32Array(nor), uvs: new Float32Array(uv),
    faces: faces.map((f) => ({ value: f.value, normal: f.normal })), cells, numberScale, inradius,
  }
}
