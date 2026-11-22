/**
 * A force-directed layout for relationship graphs (small graphs: tens to a few hundred nodes). Deterministic:
 * the same graph gets the same picture on every screen (the DM's and the players'). Positions are 0..1 of the
 * drawing; placed nodes (the DM dragged them) stay where they are and the others settle around them.
 */
export type Point = [number, number]

/** A stable pseudo-random number in [0, 1) for a string (initial positions). */
function hash(text: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

export function layoutGraph(ids: string[], edges: [string, string][], fixed: Record<string, Point> = {}, iterations = 260): Record<string, Point> {
  const nodes = [...ids].sort()
  const n = nodes.length
  const pos: Record<string, Point> = {}
  if (n === 0) return pos
  if (n === 1) return { [nodes[0]]: fixed[nodes[0]] ?? [0.5, 0.5] }
  nodes.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / n + hash(id) * 0.6
    const r = 0.3 + hash(id, 7) * 0.12
    pos[id] = fixed[id] ? [...fixed[id]] as Point : [0.5 + r * Math.cos(angle), 0.5 + r * Math.sin(angle)]
  })
  const links = edges.filter(([a, b]) => a !== b && pos[a] && pos[b])
  const k = Math.sqrt(1 / n) * 0.75 // ideal distance
  let temperature = 0.12
  for (let step = 0; step < iterations; step++) {
    const disp: Record<string, Point> = {}
    for (const id of nodes) disp[id] = [0, 0]
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i], b = nodes[j]
        let dx = pos[a][0] - pos[b][0], dy = pos[a][1] - pos[b][1]
        let d = Math.hypot(dx, dy)
        if (d < 1e-4) { dx = hash(a + b) - 0.5; dy = hash(b + a) - 0.5; d = Math.hypot(dx, dy) || 1e-3 }
        const force = (k * k) / d
        disp[a][0] += (dx / d) * force; disp[a][1] += (dy / d) * force
        disp[b][0] -= (dx / d) * force; disp[b][1] -= (dy / d) * force
      }
    }
    for (const [a, b] of links) {
      const dx = pos[a][0] - pos[b][0], dy = pos[a][1] - pos[b][1]
      const d = Math.hypot(dx, dy) || 1e-3
      const force = (d * d) / k
      disp[a][0] -= (dx / d) * force; disp[a][1] -= (dy / d) * force
      disp[b][0] += (dx / d) * force; disp[b][1] += (dy / d) * force
    }
    for (const id of nodes) {
      if (fixed[id]) continue
      // a gentle pull to the centre keeps separate groups on screen
      disp[id][0] += (0.5 - pos[id][0]) * 1.4 * k
      disp[id][1] += (0.5 - pos[id][1]) * 1.4 * k
      const d = Math.hypot(disp[id][0], disp[id][1]) || 1
      const move = Math.min(d, temperature)
      pos[id] = [pos[id][0] + (disp[id][0] / d) * move, pos[id][1] + (disp[id][1] / d) * move]
    }
    temperature = Math.max(0.002, temperature * 0.975)
  }
  return fitInside(pos, fixed)
}

/** How far apart the free nodes sit: a share of what filling the drawing would give (closer nodes, big discs). */
export const SPREAD = 0.6

/** Centre the free nodes and scale them to SPREAD of the drawing, without blowing a few nodes far apart (placed
 * nodes keep their spot). */
export function fitInside(pos: Record<string, Point>, fixed: Record<string, Point> = {}): Record<string, Point> {
  const free = Object.keys(pos).filter((id) => !fixed[id])
  if (free.length === 0) return pos
  const xs = free.map((id) => pos[id][0]), ys = free.map((id) => pos[id][1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const span = Math.max(x1 - x0, y1 - y0, 1e-6)
  const scale = Math.min(0.9 / span, 1.5) * SPREAD
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const out: Record<string, Point> = { ...pos }
  for (const id of free) out[id] = [0.5 + (pos[id][0] - cx) * scale, 0.5 + (pos[id][1] - cy) * scale]
  return out
}

export interface Px { x: number; y: number }

/**
 * Push apart nodes closer than `min` px (the drawing's own size: discs and their names), so close nodes never
 * hide each other or their link; placed nodes don't move (the other one moves the whole way). Deterministic.
 */
export function separate(pos: Record<string, Px>, min: number, fixed: Set<string> = new Set(), rounds = 40): Record<string, Px> {
  const ids = Object.keys(pos).sort()
  const out: Record<string, Px> = Object.fromEntries(ids.map((id) => [id, { ...pos[id] }]))
  for (let round = 0; round < rounds; round++) {
    let moved = false
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j]
        if (fixed.has(a) && fixed.has(b)) continue
        let dx = out[b].x - out[a].x, dy = out[b].y - out[a].y
        let d = Math.hypot(dx, dy)
        if (d >= min - 0.5) continue
        if (d < 1e-3) { const angle = hash(a + b) * 2 * Math.PI; dx = Math.cos(angle); dy = Math.sin(angle); d = 1 }
        const push = min - d
        const [sa, sb] = fixed.has(a) ? [0, 1] : fixed.has(b) ? [1, 0] : [0.5, 0.5]
        out[a] = { x: out[a].x - (dx / d) * push * sa, y: out[a].y - (dy / d) * push * sa }
        out[b] = { x: out[b].x + (dx / d) * push * sb, y: out[b].y + (dy / d) * push * sb }
        moved = true
      }
    }
    if (!moved) break
  }
  return out
}

/** The convex hull of some points (counter-clockwise; one or two points come back as they are). */
export function hull(points: Px[]): Px[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const cross = (o: Px, a: Px, b: Px) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Px[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Px[] = []
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Clusters (nodes sharing a group, e.g. a parent location): extra links for the layout only, each member to the
 * group's head (the group's own node when shown, else its first member), so they settle together. */
export function clusterLinks(nodes: { id: string; group?: string | null }[]): [string, string][] {
  const ids = new Set(nodes.map((n) => n.id))
  const members = new Map<string, string[]>()
  for (const n of nodes) if (n.group) members.set(n.group, [...(members.get(n.group) ?? []), n.id])
  const links: [string, string][] = []
  for (const [group, list] of members) {
    const head = ids.has(group) ? group : list[0]
    for (const id of list) if (id !== head) links.push([id, head])
  }
  return links
}
