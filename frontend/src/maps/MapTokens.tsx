/**
 * Mobile tokens and pings over a map (inside MapOverlay's SVG, in map px).
 * - Tokens: a character, an item, a group or a custom one; its picture (icon, else face, else initials) in a border
 *   (components/Token.tsx: its player's colour, a group's colour, black). Size 1: a circle on its tile. Larger: on a
 *   square grid a rounded square over n×n tiles; on a hex grid the cluster of hexes it covers (2: 3 hexes, 3: 7, 4: 12,
 *   5: 19). A character shows the values its display template places on the token and, while the pointer is on it,
 *   around it (the Token mode). The DM drags them; they snap to the tiles they're dropped on.
 * - Pings: the tile glows in the pinger's colour with a thick contour, and a pin with their name.
 * See docs/concepts/locations.md ("Tokens", "Pings").
 */
import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { DisplayValue, MapGrid, MapToken, TokenStyle } from '../api/types'
import SvgPicture from '../components/SvgPicture'
import { ringWidth, TokenRing } from '../components/Token'
import { apiUrl } from '../api/client'
import { AttributeRow } from '../stage/sets/actorsScene/CreatureCard'
import { PinGradient } from './MapLabels'
import { hexRadius, inGrid, outlineD, tileAt, tileCenter, tilePolygon, tilesOutline, type Point, type Tile } from './geometry'

/** Pure: initials for a token without a picture ("Old Mill" → "OM"). */
export const initials = (name: string | null) =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

/** Pure: the tiles a token of this size covers from its anchor tile. Square: n×n from the anchor (its top left).
 * Hex: odd sizes, the hexes within (n-1)/2 of the anchor (1, 7, 19); even, the hexes around the corner the anchor
 * shares with its east and south-east neighbours (2: 3, 4: 12). */
export function tokenTiles(grid: MapGrid, [c, r]: Tile, size: number): Tile[] {
  if (size <= 1) return [[c, r]]
  if (grid.type !== 'hex') {
    const out: Tile[] = []
    for (let dr = 0; dr < size; dr++) for (let dc = 0; dc < size; dc++) out.push([c + dc, r + dr])
    return out
  }
  if (size % 2) return hexDisc([c, r], (size - 1) / 2)
  const R = hexRadius(grid)
  const [x, y] = tileCenter(grid, c, r)
  const corner: Point = [x + grid.size / 2, y + R / 2]
  const reach = size === 2 ? R * 1.01 : Math.sqrt(7) * R * 1.01
  return hexDisc([c, r], size / 2 + 1).filter(([cc, rr]) => {
    const [px, py] = tileCenter(grid, cc, rr)
    return Math.hypot(px - corner[0], py - corner[1]) <= reach
  })
}

/** Hexes within `radius` steps of a tile (all of them, even off the grid: tokens may hang over the edge). */
function hexDisc([c, r]: Tile, radius: number): Tile[] {
  const cube = (cc: number, rr: number) => { const q = cc - (rr - (rr & 1)) / 2; return [q, rr, -q - rr] }
  const [q0, r0, s0] = cube(c, r)
  const out: Tile[] = []
  for (let rr = r - radius; rr <= r + radius; rr++) {
    for (let cc = c - radius - 1; cc <= c + radius + 1; cc++) {
      const [q, r1, s] = cube(cc, rr)
      if (Math.max(Math.abs(q - q0), Math.abs(r1 - r0), Math.abs(s - s0)) <= radius) out.push([cc, rr])
    }
  }
  return out
}

/** Pure: the anchor tile for a token dropped at a point (so the shape centres on the pointer), kept on the grid. */
export function anchorFor(grid: MapGrid, point: Point, size: number): Tile | null {
  let [x, y] = point
  if (size > 1 && grid.type !== 'hex') { x -= ((size - 1) / 2) * grid.size; y -= ((size - 1) / 2) * grid.size }
  if (size > 1 && grid.type === 'hex' && size % 2 === 0) { x -= grid.size / 2; y -= hexRadius(grid) / 2 }
  const tile = tileAt(grid, x, y)
  return inGrid(grid, tile) ? tile : null
}

/** Kept for callers placing size-1 things. */
export const snapTile = (grid: MapGrid, point: Point) => anchorFor(grid, point, 1)

/** `ring`: the border's width, a size-1 token's whatever the size. */
export interface Shape { cx: number; cy: number; half: number; ring: number; d?: string; length?: number; box: [number, number, number, number] }

/** Pure: where and how a token is drawn: a circle (size 1), a rounded square, or a hex cluster's outline. */
export function tokenShape(grid: MapGrid, tile: Tile, size: number): Shape {
  const ring = ringWidth(grid.size * 0.42)
  if (size <= 1 || grid.type === 'none') {
    const [cx, cy] = tileCenter(grid, tile[0], tile[1])
    const half = grid.size * Math.max(1, size) * 0.42
    return { cx, cy, half, ring, box: [cx - half, cy - half, half * 2, half * 2] }
  }
  if (grid.type !== 'hex') {
    const pad = grid.size * 0.06
    const x = grid.x + tile[0] * grid.size + pad, y = grid.y + tile[1] * grid.size + pad
    const w = size * grid.size - 2 * pad
    const k = w * 0.16
    const d = `M ${x + k} ${y} H ${x + w - k} Q ${x + w} ${y} ${x + w} ${y + k} V ${y + w - k} Q ${x + w} ${y + w} ${x + w - k} ${y + w} H ${x + k} Q ${x} ${y + w} ${x} ${y + w - k} V ${y + k} Q ${x} ${y} ${x + k} ${y} Z`
    return { cx: x + w / 2, cy: y + w / 2, half: w / 2, ring, d, length: 4 * (w - 2 * k) + 2 * Math.PI * k, box: [x, y, w, w] }
  }
  const tiles = tokenTiles(grid, tile, size)
  const loops = tilesOutline(grid, tiles)
  const pts = loops.flat()
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const centers = tiles.map(([c, r]) => tileCenter(grid, c, r))
  const cx = centers.reduce((s, p) => s + p[0], 0) / centers.length
  const cy = centers.reduce((s, p) => s + p[1], 0) / centers.length
  const length = loops.reduce((sum, loop) => sum + loop.reduce((l, p, i) => l + Math.hypot(p[0] - loop[(i + 1) % loop.length][0], p[1] - loop[(i + 1) % loop.length][1]), 0), 0)
  const box: Shape['box'] = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
  return { cx, cy, half: Math.min(box[2], box[3]) / 2, ring, d: outlineD(loops, 'poly'), length, box }
}

/** A token's picture and border, at a shape. */
function TokenBody({ shape, icon, name, style, color, id }: {
  shape: Shape; icon: MapToken['icon']; name: string | null; style: TokenStyle; color: string; id: string
}) {
  const { cx, cy, half, d, box } = shape
  return (
    <>
      {d ? <path d={d} fill="#1b1722" /> : <circle cx={cx} cy={cy} r={half} fill="#1b1722" />}
      {icon?.url && !d && <SvgPicture url={icon.url} face={icon.face} cx={cx} cy={cy} r={half} clipId={id} />}
      {icon?.url && d && (
        <>
          <defs><clipPath id={id}><path d={d} /></clipPath></defs>
          <image href={apiUrl(icon.url)} x={box[0]} y={box[1]} width={box[2]} height={box[3]} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
        </>
      )}
      {!icon?.url && (
        <text x={cx} y={cy} dy="0.35em" textAnchor="middle" fontSize={half * (initials(name).length > 1 ? 0.8 : 1)} fill="#ece6da" fontFamily="serif">{initials(name)}</text>
      )}
      <TokenRing cx={cx} cy={cy} r={half} style={style} color={color} id={`${id}-ring`} d={d} length={shape.length} width={shape.ring} />
    </>
  )
}

/**
 * A character's values from its template: on the token (a strip at its bottom) and, while hovered, in trays around.
 * Each tray fits its content and sits against the token, growing away from it: the top one upwards, the bottom one
 * downwards, the side ones outwards (centred on the token).
 */
export function TokenValues({ shape, values, hovered, tile }: { shape: Shape; values: DisplayValue[]; hovered: boolean; tile: number }) {
  const [bx, by, bw, bh] = shape.box
  const zoom = tile / 64 // the trays' size follows the grid
  const gap = tile * 0.1
  const at = (region: string) => values.filter((v) => v.region === region)
  const tray = (side: 'top' | 'bottom' | 'left' | 'right', list: DisplayValue[]): ReactNode => {
    if (!list.length) return null
    // The room on that side (content overflows it, away from the token, if it needs more)
    const across = side === 'top' || side === 'bottom'
    const w = across ? bw + tile * 4 : tile * 4
    const h = across ? tile * 4 : Math.max(bh, tile * 4)
    const x = side === 'left' ? bx - gap - w : side === 'right' ? bx + bw + gap : bx + bw / 2 - w / 2
    const y = side === 'top' ? by - gap - h : side === 'bottom' ? by + bh + gap : by + bh / 2 - h / 2
    return (
      <foreignObject key={side} x={x} y={y} width={w} height={h} className="token-tray-fo">
        <div className={`token-tray-box side-${side}`} style={{ width: w / zoom, height: h / zoom, transform: `scale(${zoom})` }}>
          <div className="token-tray">{list.map((v) => <AttributeRow key={v.key} attr={v} admin={false} />)}</div>
        </div>
      </foreignObject>
    )
  }
  const on = at('token')
  return (
    <g className="token-values">
      {on.length > 0 && (
        <foreignObject x={bx} y={by + bh * 0.66} width={bw} height={bh * 0.5}>
          <div className="token-on" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: bw / zoom }}>
            {on.map((v) => <AttributeRow key={v.key} attr={v} admin={false} compact />)}
          </div>
        </foreignObject>
      )}
      {hovered && (
        <>
          {tray('top', at('hover_top'))}
          {tray('bottom', at('hover_bottom'))}
          {tray('left', at('hover_left'))}
          {tray('right', at('hover_right'))}
        </>
      )}
    </g>
  )
}

export interface DrawnPing { key: string; tile: Tile; color: string; name: string }

export function MapTokens({ grid, tokens, mapId, onMove }: {
  grid: MapGrid
  tokens: MapToken[]
  mapId: number
  /** The DM drags tokens: called with the anchor tile it's dropped on. */
  onMove?: (token: MapToken, tile: Tile) => void
}) {
  const [drag, setDrag] = useState<{ id: string; point: Point; tile: Tile | null } | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const svgRef = useRef<SVGGElement>(null)
  const toMap = (e: PointerEvent): Point | null => {
    const svg = svgRef.current?.ownerSVGElement
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return [p.x, p.y]
  }
  return (
    <g ref={svgRef} className="map-tokens">
      {tokens.map((t) => {
        const dragging = drag?.id === t.id
        const shape = tokenShape(grid, t.tile, t.size)
        const moved = dragging ? { ...shape, ...offset(shape, drag.point) } : shape
        const ghost = dragging && drag.tile ? tokenShape(grid, drag.tile, t.size) : null
        const id = `tok-${mapId}-${t.id}`
        return (
          <g key={t.id} className={`map-token kind-${t.kind} ${onMove ? 'draggable' : ''} ${dragging ? 'dragging' : ''}`}
            onPointerEnter={() => setHover(t.id)} onPointerLeave={() => setHover((h) => (h === t.id ? null : h))}
            onPointerDown={onMove ? (e) => {
              if (e.button !== 0) return
              e.stopPropagation()
              ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
              const p = toMap(e)
              if (p) setDrag({ id: t.id, point: p, tile: anchorFor(grid, p, t.size) })
            } : undefined}
            onPointerMove={onMove ? (e) => {
              if (!dragging) return
              const p = toMap(e)
              if (p) setDrag({ id: t.id, point: p, tile: anchorFor(grid, p, t.size) })
            } : undefined}
            onPointerUp={onMove ? () => {
              if (dragging && drag.tile && (drag.tile[0] !== t.tile[0] || drag.tile[1] !== t.tile[1])) onMove(t, drag.tile)
              setDrag(null)
            } : undefined}
            onPointerCancel={() => setDrag(null)}>
            <title>{t.name ?? '???'}</title>
            {ghost && (ghost.d ? <path d={ghost.d} className="map-token-ghost" /> : <circle cx={ghost.cx} cy={ghost.cy} r={ghost.half} className="map-token-ghost" />)}
            <g transform={dragging ? `translate(${moved.cx - shape.cx} ${moved.cy - shape.cy})` : undefined}>
              <TokenBody shape={shape} icon={t.icon} name={t.name} style={t.style} color={t.color} id={id} />
              {t.values && t.values.length > 0 && !dragging && <TokenValues shape={shape} values={t.values} hovered={hover === t.id} tile={grid.size} />}
            </g>
          </g>
        )
      })}
    </g>
  )
}

/** While dragging: the shape's centre follows the pointer. */
const offset = (shape: Shape, point: Point) => ({ cx: point[0], cy: point[1], half: shape.half })

export function MapPings({ grid, pings }: { grid: MapGrid; pings: DrawnPing[] }) {
  return (
    <g className="map-pings">
      {pings.map((p) => {
        const points = tilePolygon(grid, p.tile[0], p.tile[1]).map(([x, y]) => `${x},${y}`).join(' ')
        const [cx, cy] = tileCenter(grid, p.tile[0], p.tile[1])
        const top = cy - grid.size * 0.5
        const pin = grid.size * 0.32
        return (
          <g key={p.key} className="map-ping" style={{ color: p.color }}>
            <polygon points={points} className="map-ping-glow" style={{ fill: p.color }} />
            <polygon points={points} className="map-ping-edge" style={{ stroke: p.color, strokeWidth: Math.max(3, grid.size * 0.09) }} />
            <PinGradient id={`ping-${p.key}`} color={p.color} />
            <path className="map-ping-pin" fill={`url(#ping-${p.key})`}
              d={`M ${cx} ${top} c ${-pin * 0.9} ${-pin * 1.1} ${-pin * 0.9} ${-pin * 2.2} 0 ${-pin * 2.2} c ${pin * 0.9} 0 ${pin * 0.9} ${pin * 1.1} 0 ${pin * 2.2} z`} />
            <text x={cx} y={top - pin * 2.5} textAnchor="middle" className="map-ping-name" style={{ fill: p.color, fontSize: Math.max(12, grid.size * 0.32) }}>{p.name}</text>
          </g>
        )
      })}
    </g>
  )
}
