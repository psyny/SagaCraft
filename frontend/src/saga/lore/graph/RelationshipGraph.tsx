/**
 * Draws a relationship graph (from the server, already filtered for this member): nodes are resources (icon, else
 * the picture's face, else the initial; coloured by kind; a hidden one is "?"), edges are relationships (arrows when directed, labels) and
 * references (dashed). Scroll to zoom, drag the background to pan, drag a node to move it, click to select.
 * With onConnect, a selected node shows a "+" handle: drag it onto another node to link them.
 * With clusters, nodes sharing a group (the location map: a parent place and its parts) settle together, share a
 * colour and sit in a soft region of it (regions nest).
 * Used by the Lore tab's Relationships, the relationship graph Set and the location map.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { GraphData, GraphEdge, GraphNode } from '../../../api/types'
import SvgPicture from '../../../components/SvgPicture'
import { clusterLinks, hull, layoutGraph, separate, type Point } from './layout'

export const KIND_COLORS: Record<string, string> = {
  character: '#d6a84a', location: '#5fae7a', item: '#5f8fd6', document: '#c9b48a', event: '#d0605a',
}

/** Cluster colours (the location map's regions). */
export const CLUSTER_COLORS = ['#5fae7a', '#d6a84a', '#6fa8e0', '#b07fd6', '#e08c4f', '#4fc1c9', '#e2604f', '#c9c34f']

/** With clusters, a node in no cluster (and heading none). */
const UNCLUSTERED = '#a39bb0'

export type Selection = { node: string } | { edge: string } | null

interface Props {
  data: GraphData
  /** Nodes placed by hand (0..1). */
  placed?: Record<string, Point>
  labels?: boolean
  selected?: Selection
  onSelect?: (selection: Selection) => void
  /** Dragging a node ends: its new place (0..1). Without it, moves are only local. */
  onPlace?: (id: string, point: Point) => void
  /** Drag from a node's "+" onto another: link the two resources. */
  onConnect?: (fromResourceId: number, toResourceId: number) => void
  /** Group nodes by their `group` (regions, shared colours). */
  clusters?: boolean
  /** Open a node's resource (double click). */
  onOpen?: (node: GraphNode) => void
  className?: string
}

const R = 44
/** Room around the drawing for names and the "+" handle. */
const PAD = 80
/** Closest two nodes may sit (px): their discs and a little room for names and the link between them. */
const MIN_GAP = 2 * R + 56

/** Edges between the same two nodes bend apart so their labels don't overlap. */
export function edgeBends(edges: GraphEdge[]): Record<string, number> {
  const groups: Record<string, GraphEdge[]> = {}
  for (const e of edges) {
    const key = [e.from, e.to].sort().join('|')
    ;(groups[key] ||= []).push(e)
  }
  const bends: Record<string, number> = {}
  for (const list of Object.values(groups)) {
    list.forEach((e, i) => {
      const offset = list.length === 1 ? 0 : (i - (list.length - 1) / 2) * 56
      bends[e.id] = e.from < e.to ? offset : -offset // the same side whichever way the edge goes
    })
  }
  return bends
}

export default function RelationshipGraph({ data, placed = {}, labels = true, selected = null, onSelect, onPlace, onConnect, onOpen, clusters = false, className = '' }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 500 })
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const [moved, setMoved] = useState<Record<string, Point>>({})
  const [linking, setLinking] = useState<{ from: string; x: number; y: number } | null>(null)
  const drag = useRef<{ mode: 'pan' | 'node'; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const update = () => setSize({ w: Math.max(200, el.clientWidth), h: Math.max(160, el.clientHeight) })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const placedKey = JSON.stringify(placed)
  const layout = useMemo(
    () => layoutGraph(data.nodes.map((n) => n.id), [
      ...data.edges.map((e) => [e.from, e.to] as [string, string]),
      ...(clusters ? clusterLinks(data.nodes) : []),
    ], placed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, placedKey],
  )
  useEffect(() => setMoved({}), [data, placedKey])
  const toPx = (p: Point) => ({ x: PAD + p[0] * (size.w - 2 * PAD), y: PAD * 0.7 + p[1] * (size.h - 2 * PAD) })
  // The layout keeps nodes close; at this size, nodes that would touch are pushed just apart
  const spaced = useMemo(
    () => separate(Object.fromEntries(Object.entries(layout).map(([id, p]) => [id, toPx(p)])), MIN_GAP, new Set(Object.keys(placed))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, size.w, size.h],
  )
  const pos = (id: string): { x: number; y: number } => (moved[id] ? toPx(moved[id]) : spaced[id] ?? toPx([0.5, 0.5]))
  const bends = useMemo(() => edgeBends(data.edges), [data.edges])
  // Clusters: a colour per group, in the order groups first appear
  const groupColor = useMemo(() => {
    const keys = [...new Set(data.nodes.map((n) => n.group).filter((g): g is string => Boolean(g)))]
    return new Map(keys.map((k, i) => [k, CLUSTER_COLORS[i % CLUSTER_COLORS.length]]))
  }, [data.nodes])
  const nodeColor = (n: GraphNode) => (n.hidden ? '#777'
    : clusters ? (n.group ? groupColor.get(n.group)! : groupColor.get(n.id) ?? UNCLUSTERED) // in no region: neutral
    : KIND_COLORS[n.kind ?? ''] ?? '#999')
  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes])

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const rect = box.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left - view.x) / view.k, y: (e.clientY - rect.top - view.y) / view.k }
  }

  const onDown = (e: ReactPointerEvent, id?: string) => {
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    if (id) {
      const p = pos(id)
      drag.current = { mode: 'node', id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false }
    } else {
      drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false }
    }
  }
  const onMove = (e: ReactPointerEvent) => {
    if (linking) {
      const p = toLocal(e)
      setLinking({ ...linking, x: p.x, y: p.y })
      return
    }
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    if (d.mode === 'pan') setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }))
    else if (d.id) {
      const x = Math.max(0, Math.min(1, (d.ox + dx / view.k - PAD) / (size.w - 2 * PAD)))
      const y = Math.max(0, Math.min(1, (d.oy + dy / view.k - PAD * 0.7) / (size.h - 2 * PAD)))
      setMoved((m) => ({ ...m, [d.id!]: [x, y] }))
    }
  }
  const onUp = () => {
    if (linking) {
      const a = byId.get(linking.from)
      const b = data.nodes.find((n) => n.id !== linking.from && Math.hypot(pos(n.id).x - linking.x, pos(n.id).y - linking.y) <= R + 6)
      if (a?.resource_id && b?.resource_id) onConnect?.(a.resource_id, b.resource_id)
      setLinking(null)
      return
    }
    const d = drag.current
    drag.current = null
    if (!d) return
    if (!d.moved) onSelect?.(d.mode === 'node' && d.id ? { node: d.id } : null)
    else if (d.mode === 'node' && d.id && moved[d.id] && d.id.startsWith('r')) onPlace?.(d.id, moved[d.id])
  }
  const onWheel = (e: React.WheelEvent) => {
    e.stopPropagation() // zoom the graph, not the Stage around it
    const rect = box.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const k = Math.max(0.3, Math.min(3, view.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
    setView({ k, x: mx - ((mx - view.x) * k) / view.k, y: my - ((my - view.y) * k) / view.k })
  }

  const selectedNode = selected && 'node' in selected ? selected.node : null
  const selectedEdge = selected && 'edge' in selected ? selected.edge : null
  const focus = selectedNode ? new Set([selectedNode, ...data.edges.filter((e) => e.from === selectedNode || e.to === selectedNode).flatMap((e) => [e.from, e.to])]) : null

  return (
    <div ref={box} className={`rel-graph ${className}`} data-wheel data-interactive onPointerDown={(e) => onDown(e)} onPointerMove={onMove} onPointerUp={onUp}
      onWheel={onWheel}>
      {data.nodes.length === 0 && <p className="muted rel-graph-empty">Nothing to show yet.</p>}
      <svg width={size.w} height={size.h}>
        <defs>
          <marker id="rel-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {clusters && [...groupColor.entries()].map(([group, color]) => {
            // The region: the group's head (when shown) and its members, wrapped
            const points = data.nodes.filter((n) => n.group === group || n.id === group).map((n) => pos(n.id))
            const outline = hull(points)
            if (!outline.length) return null
            const d = `M${outline.map((p) => `${p.x},${p.y}`).join(' L')}${outline.length > 2 ? ' Z' : ''}`
            return (
              <g key={group} className="rel-region" style={{ color }}>
                <path d={d} strokeWidth={2 * (R + 22)} />
              </g>
            )
          })}
          {data.edges.map((e) => {
            const a = pos(e.from), b = pos(e.to)
            const dx = b.x - a.x, dy = b.y - a.y
            const len = Math.hypot(dx, dy) || 1
            const bend = bends[e.id] || 0
            const mx = (a.x + b.x) / 2 - (dy / len) * bend, my = (a.y + b.y) / 2 + (dx / len) * bend
            // stop at the node's edge
            const ex = b.x - ((b.x - mx) / (Math.hypot(b.x - mx, b.y - my) || 1)) * (R + 3)
            const ey = b.y - ((b.y - my) / (Math.hypot(b.x - mx, b.y - my) || 1)) * (R + 3)
            const dim = focus && !(focus.has(e.from) && focus.has(e.to))
            const on = selectedEdge === e.id
            // the curve's middle (a quadratic's point at t = 0.5)
            const lx = (a.x + 2 * mx + b.x) / 4, ly = (a.y + 2 * my + b.y) / 4
            return (
              <g key={e.id} className={`rel-edge ${e.reference ? 'reference' : ''} ${on ? 'on' : ''} ${dim ? 'dim' : ''} ${e.created_role === 'player' ? 'by-player' : ''}`}
                onPointerDown={(ev) => { ev.stopPropagation(); onSelect?.({ edge: e.id }) }}>
                <path d={`M${a.x},${a.y} Q${mx},${my} ${ex},${ey}`} className="rel-edge-hit" />
                <path d={`M${a.x},${a.y} Q${mx},${my} ${ex},${ey}`} className="rel-edge-line" markerEnd={e.directed ? 'url(#rel-arrow)' : undefined} />
                {(labels || on) && <text x={lx} y={ly - 4} className="rel-edge-label">{e.label}</text>}
              </g>
            )
          })}
          {linking && (() => {
            const a = pos(linking.from)
            return <line x1={a.x} y1={a.y} x2={linking.x} y2={linking.y} className="rel-linking" />
          })()}
          {data.nodes.map((n) => {
            const p = pos(n.id)
            const color = nodeColor(n)
            const dim = focus && !focus.has(n.id)
            const on = selectedNode === n.id
            return (
              <g key={n.id} className={`rel-node ${n.hidden ? 'hidden' : ''} ${on ? 'on' : ''} ${dim ? 'dim' : ''} ${linking && Math.hypot(p.x - linking.x, p.y - linking.y) <= R + 6 && n.id !== linking.from ? 'target' : ''}`}
                transform={`translate(${p.x},${p.y})`} onPointerDown={(e) => onDown(e, n.id)}
                onDoubleClick={() => n.resource_id && onOpen?.(n)}>
                <title>{n.name ?? 'Someone unknown'}</title>
                <circle r={R} className="rel-node-disc" style={{ stroke: color }} />
                {n.icon ? <SvgPicture url={n.icon} face={n.face} cx={0} cy={0} r={R - 4} clipId={`rg-${n.id}`} /> : <text className="rel-node-initial" dy="0.35em" style={{ fill: color }}>{n.hidden ? '?' : (n.name || '?').slice(0, 1).toUpperCase()}</text>}
                {n.start && <circle r={R + 7} className="rel-node-start" style={{ stroke: color }} />}
                <text className="rel-node-name" y={R + 16}>{n.name ?? '???'}</text>
                {on && onConnect && n.resource_id && (
                  <g className="rel-handle" transform={`translate(${R * 0.75},${-R * 0.75})`}
                    onPointerDown={(e) => { e.stopPropagation(); const l = toLocal(e); setLinking({ from: n.id, x: l.x, y: l.y }) }}>
                    <title>Drag onto another to link them</title>
                    <circle r={10} />
                    <text dy="0.35em">+</text>
                  </g>
                )}
              </g>
            )
          })}
        </g>
      </svg>
      <div className="rel-graph-zoom">
        <button className="small" onPointerDown={(e) => e.stopPropagation()} onClick={() => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.2) }))} aria-label="Zoom in">＋</button>
        <button className="small" onPointerDown={(e) => e.stopPropagation()} onClick={() => setView((v) => ({ ...v, k: Math.max(0.3, v.k / 1.2) }))} aria-label="Zoom out">－</button>
        <button className="small" onPointerDown={(e) => e.stopPropagation()} onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Fit">⤢</button>
      </div>
    </div>
  )
}
