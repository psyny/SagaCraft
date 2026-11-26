/**
 * Mobile tokens and pings over a map (inside MapOverlay's SVG, in map px).
 * - Tokens: a character, an item, a group or a custom one; its picture (icon, else face, else initials) in a border
 *   (components/Token.tsx: its player's colour, a group's colour, black). Size 1: a circle on its tile. Larger: on a
 *   square grid a rounded square over n×n tiles; on a hex grid the cluster of hexes it covers (2: 3 hexes, 3: 7, 4: 12,
 *   5: 19). A character shows the values its display template places on the token and, while the pointer is on it,
 *   around it (the Token mode). The DM drags them; they snap to the tiles they're dropped on. While a token is dragged
 *   (plan 39): where it was and where it would land are highlighted, with "Distance moved" in the map's units; the
 *   others see the same, live (`remote`: the tile it's being dragged to, from the realtime drag messages).
 * - Pings: the tile glows in the pinger's colour with a thick contour, and a pin with their name.
 * See docs/concepts/locations.md ("Tokens", "Pings").
 */
import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { DisplayValue, MapGrid, MapToken, TokenStyle } from '../api/types'
import SvgPicture from '../components/SvgPicture'
import { ringWidth, TokenRing } from '../components/Token'
import { ownerStyle } from '../components/ownerColor'
import { apiUrl } from '../api/client'
import { sizedUrl, TOKEN_WIDTH } from '../components/sizedUrl'
import { AttributeRow } from '../stage/sets/actorsScene/CreatureCard'
import { PinGradient } from './MapLabels'
import { distanceLabel, hexRadius, inGrid, outlineD, tileAt, tileCenter, tileDistance, tilePolygon, tilesOutline, type Point, type Tile } from './geometry'

/** Pure: initials for a token without a picture ("Old Mill" → "OM"). */
export const initials = (name: string | null) =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

/** Pure: the tiles a token of this size covers from its anchor tile. Square: n×n from the anchor (its top left).
 * Hex: odd sizes, the hexes within (n-1)/2 of the anchor (1, 7, 19, 37...); even, the hexes around the corner the
 * anchor shares with its east and south-east neighbours (2: 3, 4: 12, 6: 27...). */
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
  // Hex centres around a corner sit at R, 2R, √7R, √13R, 4R, √19R...: these reaches give 3, 12, 27... hexes
  const reach = R * (Math.sqrt(3) * size / 2 - 0.72) * 1.01
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
function TokenBody({ shape, icon, name, style, color, id, border }: {
  shape: Shape; icon: MapToken['icon']; name: string | null; style: TokenStyle; color: string; id: string; border?: MapToken['border']
}) {
  const { cx, cy, half, d, box } = shape
  return (
    <>
      {d ? <path d={d} fill="#1b1722" /> : <circle cx={cx} cy={cy} r={half} fill="#1b1722" />}
      {icon?.url && !d && <SvgPicture url={icon.url} face={icon.face} cx={cx} cy={cy} r={half} clipId={id} />}
      {icon?.url && d && (
        <>
          <defs><clipPath id={id}><path d={d} /></clipPath></defs>
          <image href={apiUrl(sizedUrl(icon.url, TOKEN_WIDTH))} x={box[0]} y={box[1]} width={box[2]} height={box[3]} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
        </>
      )}
      {!icon?.url && (
        <text x={cx} y={cy} dy="0.35em" textAnchor="middle" fontSize={half * (initials(name).length > 1 ? 0.8 : 1)} fill="#ece6da" fontFamily="serif">{initials(name)}</text>
      )}
      <TokenRing cx={cx} cy={cy} r={half} style={style} color={color} id={`${id}-ring`} d={d} length={shape.length} width={shape.ring} border={border} />
    </>
  )
}

type TraySide = 'top' | 'bottom' | 'left' | 'right'
const TRAY_SIDES: TraySide[] = ['top', 'bottom', 'left', 'right']
/** The trays sit this far from the token (px at the trays' own size, which follows the grid). */
const TRAY_GAP = 5
const traysOf = (values: DisplayValue[]) => TRAY_SIDES.map((side) => [side, values.filter((v) => v.region === `hover_${side}`)] as const)

/**
 * The lines from a hovered token's centre to its trays (drawn before the token: under it and the trays, they show
 * in the gap and tie each tray to its token). Trays are centred on the token along their side, so a straight line
 * from the centre meets them.
 */
export function TokenLinks({ shape, values, tile }: { shape: Shape; values: DisplayValue[]; tile: number }) {
  const [bx, by, bw, bh] = shape.box
  const zoom = tile / 64
  const reach = (TRAY_GAP + 16) * zoom // past the gap, under the tray
  const ends: Record<TraySide, [number, number]> = {
    top: [shape.cx, by - reach], bottom: [shape.cx, by + bh + reach], left: [bx - reach, shape.cy], right: [bx + bw + reach, shape.cy],
  }
  return (
    <g className="token-links" aria-hidden>
      {traysOf(values).map(([side, list]) => list.length > 0 && (
        <line key={side} x1={shape.cx} y1={shape.cy} x2={ends[side][0]} y2={ends[side][1]} strokeWidth={2 * zoom} />
      ))}
    </g>
  )
}

/**
 * A character's values from its template: on the token (a strip at its bottom) and, while hovered, over it (a tray
 * centred on the token, over its picture) and in trays around. Each tray fits its content; the ones around sit 5 px
 * from the token, growing away from it: the top one upwards, the bottom one downwards, the side ones outwards
 * (centred on the token).
 */
export function TokenValues({ shape, values, hovered, tile }: { shape: Shape; values: DisplayValue[]; hovered: boolean; tile: number }) {
  const [bx, by, bw, bh] = shape.box
  const zoom = tile / 64 // the trays' size follows the grid
  const gap = TRAY_GAP * zoom
  const at = (region: string) => values.filter((v) => v.region === region)
  const tray = (side: TraySide, list: readonly DisplayValue[]): ReactNode => {
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
  const over = at('hover_over')
  const overW = Math.max(bw, tile * 4), overH = Math.max(bh, tile * 4)
  return (
    <g className="token-values">
      {on.length > 0 && (
        <foreignObject x={bx} y={by + bh * 0.66} width={bw} height={bh * 0.5}>
          <div className="token-on" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: bw / zoom }}>
            {on.map((v) => <AttributeRow key={v.key} attr={v} admin={false} compact />)}
          </div>
        </foreignObject>
      )}
      {hovered && traysOf(values).map(([side, list]) => tray(side, list))}
      {hovered && over.length > 0 && (
        // Over the token: centred on it (it grows both ways if it needs more room)
        <foreignObject x={bx + bw / 2 - overW / 2} y={by + bh / 2 - overH / 2} width={overW} height={overH} className="token-tray-fo">
          <div className="token-tray-box side-over" style={{ width: overW / zoom, height: overH / zoom, transform: `scale(${zoom})` }}>
            <div className="token-tray">{over.map((v) => <AttributeRow key={v.key} attr={v} admin={false} />)}</div>
          </div>
        </foreignObject>
      )}
    </g>
  )
}

export interface DrawnPing { key: string; tile: Tile; color: string; name: string }

/** The move's arrow (plan 58): from the centre of where it was to the centre of where it would land. */
function MoveArrow({ grid, from, to, size }: { grid: MapGrid; from: Tile; to: Tile; size: number }) {
  const a = tokenShape(grid, from, size)
  const b = tokenShape(grid, to, size)
  const length = Math.hypot(b.cx - a.cx, b.cy - a.cy)
  if (length < 1) return null
  const width = Math.max(3, grid.size * 0.07)
  const head = Math.min(width * 3.4, length * 0.6)
  const [ux, uy] = [(b.cx - a.cx) / length, (b.cy - a.cy) / length]
  const [bx, by] = [b.cx - ux * head, b.cy - uy * head] // where the head starts
  const side = head * 0.6
  const points = `${b.cx},${b.cy} ${bx - uy * side},${by + ux * side} ${bx + uy * side},${by - ux * side}`
  return (
    <g className="map-token-arrow" aria-hidden>
      <line x1={a.cx} y1={a.cy} x2={bx} y2={by} className="map-token-arrow-edge" style={{ strokeWidth: width + 3 }} />
      <polygon points={points} className="map-token-arrow-edge" style={{ strokeWidth: 3 }} />
      <line x1={a.cx} y1={a.cy} x2={bx} y2={by} className="map-token-arrow-line" style={{ strokeWidth: width }} />
      <polygon points={points} className="map-token-arrow-head" />
    </g>
  )
}

/**
 * Where a dragged token was and would land, and how far that is. Drawn in two layers around the token: `under` (the
 * tiles' fills: where it was, where it would land) and `over` (the landing tiles' bright edge, the move's arrow and the
 * distance), so the token being dragged never hides where it goes.
 */
function DragPreview({ grid, from, to, size, layer, color }: { grid: MapGrid; from: Tile; to: Tile; size: number; layer: 'under' | 'over'; color: string }) {
  const area = (tile: Tile) => outlineD(tilesOutline(grid, tokenTiles(grid, tile, size)), 'poly')
  const away = from[0] !== to[0] || from[1] !== to[1]
  if (layer === 'under') {
    return (
      <g className="map-token-drag" aria-hidden style={ownerStyle(color)}>
        <path d={area(from)} className="map-token-origin" style={{ strokeWidth: Math.max(2, grid.size * 0.05) }} />
        {away && <path d={area(to)} className="map-token-target" />}
      </g>
    )
  }
  if (!away) return null
  const target = tokenShape(grid, to, size)
  const font = Math.max(12, grid.size * 0.28)
  const text = `Distance moved: ${distanceLabel(grid, tileDistance(grid, from, to))}`
  const width = text.length * font * 0.56 + font
  const top = target.box[1] - font * 0.6
  return (
    <g className="map-token-drag" aria-hidden style={ownerStyle(color)}>
      <path d={area(to)} className="map-token-target-edge" style={{ strokeWidth: Math.max(3, grid.size * 0.07) }} />
      <MoveArrow grid={grid} from={from} to={to} size={size} />
      <g className="map-token-distance" transform={`translate(${target.cx} ${top})`}>
        <rect x={-width / 2} y={-font * 1.4} width={width} height={font * 1.6} rx={font * 0.4} />
        <text y={-font * 0.6} dy="0.35em" textAnchor="middle" style={{ fontSize: font }}>{text}</text>
      </g>
    </g>
  )
}

export function MapTokens({ grid, tokens, mapId, onMove, canMove, onPick, onDragTile, picked, remote }: {
  grid: MapGrid
  tokens: MapToken[]
  mapId: number
  /** Dragging tokens (the DM; players those they may move): called with the anchor tile it's dropped on. */
  onMove?: (token: MapToken, tile: Tile) => void
  /** Which tokens drag (absent: all, with onMove). */
  canMove?: (token: MapToken) => boolean
  /** A click on a token (no drag): the token and where on the screen. */
  onPick?: (token: MapToken, at: { x: number; y: number }) => void
  /** The DM dragging: the tile it would land on, each time it changes (null: the drag ended without a move). */
  onDragTile?: (token: MapToken, tile: Tile | null) => void
  /** The token picked (outlined). */
  picked?: string | null
  /** Tokens someone else is dragging (by id): the tile each would land on, and whether the drag is still going. */
  remote?: Record<string, { tile: Tile; live: boolean }>
}) {
  const [drag, setDrag] = useState<{ id: string; point: Point; tile: Tile | null } | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const down = useRef<{ x: number; y: number } | null>(null) // where a press started (a click, or a drag)
  const svgRef = useRef<SVGGElement>(null)
  const toMap = (e: PointerEvent): Point | null => {
    const svg = svgRef.current?.ownerSVGElement
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return [p.x, p.y]
  }
  // A token being dragged (yours, or someone else's) is drawn on top of every token, with where it would land and
  // how far (its place in the list stays: moving it would lose the pointer)
  const moving: ReactNode[] = []
  return (
    <g ref={svgRef} className="map-tokens">
      {tokens.map((t) => {
        const dragging = drag?.id === t.id
        const movable = Boolean(onMove) && (!canMove || canMove(t))
        const shape = tokenShape(grid, t.tile, t.size)
        const away = !dragging ? remote?.[t.id] : undefined // someone else dragging it: drawn where it would land
        const moved = dragging ? { ...shape, ...offset(shape, drag.point) } : away ? tokenShape(grid, away.tile, t.size) : shape
        const preview = dragging && drag.tile ? drag.tile : away?.live ? away.tile : null
        const id = `tok-${mapId}-${t.id}`
        if (dragging || away) {
          moving.push(
            <g key={t.id} className={`map-token moving ${dragging ? 'dragging' : ''}`} aria-hidden>
              <g transform={`translate(${moved.cx - shape.cx} ${moved.cy - shape.cy})`}>
                <TokenBody shape={shape} icon={t.icon} name={t.name} style={t.style} color={t.color} border={t.border} id={`${id}-moving`} />
              </g>
              {preview && <DragPreview grid={grid} from={t.tile} to={preview} size={t.size} layer="over" color={t.color} />}
            </g>,
          )
        }
        return (
          <g key={t.id} className={`map-token kind-${t.kind} ${movable ? 'draggable' : onPick ? 'pickable' : ''} ${dragging ? 'dragging' : ''} ${picked === t.id ? 'picked' : ''}`}
            onPointerEnter={() => setHover(t.id)} onPointerLeave={() => setHover((h) => (h === t.id ? null : h))}
            onPointerDown={movable || onPick ? (e) => {
              if (e.button !== 0 || e.altKey) return
              e.stopPropagation()
              ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
              const p = toMap(e)
              down.current = { x: e.clientX, y: e.clientY }
              if (p && movable) setDrag({ id: t.id, point: p, tile: anchorFor(grid, p, t.size) })
            } : undefined}
            onPointerMove={movable ? (e) => {
              if (!dragging) return
              const p = toMap(e)
              if (!p) return
              const tile = anchorFor(grid, p, t.size)
              if (tile && (!drag.tile || tile[0] !== drag.tile[0] || tile[1] !== drag.tile[1])) onDragTile?.(t, tile) // the others see it go
              setDrag({ id: t.id, point: p, tile })
            } : undefined}
            onPointerUp={movable || onPick ? (e) => {
              const start = down.current
              down.current = null
              const still = start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5
              const moving = dragging && drag.tile && (drag.tile[0] !== t.tile[0] || drag.tile[1] !== t.tile[1]) && !still
              if (moving) onMove?.(t, drag.tile!) // (the drag's end goes out once the move is saved)
              else {
                if (dragging) onDragTile?.(t, null)
                if (still && onPick) onPick(t, { x: e.clientX, y: e.clientY })
              }
              setDrag(null)
            } : undefined}
            onPointerCancel={() => { if (dragging) onDragTile?.(t, null); setDrag(null); down.current = null }}>
            <title>{t.name ?? '???'}</title>
            {preview && <DragPreview grid={grid} from={t.tile} to={preview} size={t.size} layer="under" color={t.color} />}
            {/* Being dragged: drawn in the layer on top (this one keeps the pointer) */}
            <g style={dragging || away ? { visibility: 'hidden' } : undefined}>
              {hover === t.id && t.values && t.values.length > 0 && <TokenLinks shape={shape} values={t.values} tile={grid.size} />}
              <TokenBody shape={shape} icon={t.icon} name={t.name} style={t.style} color={t.color} border={t.border} id={id} />
              {t.values && t.values.length > 0 && <TokenValues shape={shape} values={t.values} hovered={hover === t.id} tile={grid.size} />}
            </g>
          </g>
        )
      })}
      <g className="map-tokens-moving">{moving}</g>
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
