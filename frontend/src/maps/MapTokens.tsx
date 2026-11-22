/**
 * Mobile tokens and pings over a map (inside MapOverlay's SVG, in map px).
 * - Tokens: a character, an item, a group or a custom one, centred on its tile and `size` tiles wide; its picture
 *   (icon, else face, else initials) in a ring (components/Token.tsx: its player's colour, a group's colour, black).
 *   The DM drags them: the token follows the pointer and snaps to the centre of the tile it's dropped on.
 * - Pings: the tile glows in the pinger's colour with a thick contour, and a pin with their name.
 * See docs/concepts/locations.md ("Tokens", "Pings").
 */
import { useRef, useState, type PointerEvent } from 'react'
import type { MapGrid, MapToken } from '../api/types'
import SvgPicture from '../components/SvgPicture'
import { TokenRing } from '../components/Token'
import { inGrid, tileAt, tileCenter, tilePolygon, type Point, type Tile } from './geometry'

/** Pure: the tile a dragged token lands on (the one under the point), kept on the grid. */
export function snapTile(grid: MapGrid, point: Point): Tile | null {
  const tile = tileAt(grid, point[0], point[1])
  return inGrid(grid, tile) ? tile : null
}

/** Pure: initials for a token without a picture ("Old Mill" → "OM"). */
export const initials = (name: string | null) =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

export interface DrawnPing { key: string; tile: Tile; color: string; name: string }

export function MapTokens({ grid, tokens, mapId, onMove }: {
  grid: MapGrid
  tokens: MapToken[]
  mapId: number
  /** The DM drags tokens: called with the tile it's dropped on. */
  onMove?: (token: MapToken, tile: Tile) => void
}) {
  const [drag, setDrag] = useState<{ id: string; point: Point; tile: Tile | null } | null>(null)
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
        const [cx, cy] = dragging ? drag.point : tileCenter(grid, t.tile[0], t.tile[1])
        const r = grid.size * t.size * 0.42
        const clip = `tok-${mapId}-${t.id}`
        const ghost = dragging && drag.tile ? tileCenter(grid, drag.tile[0], drag.tile[1]) : null
        return (
          <g key={t.id} className={`map-token kind-${t.kind} ${onMove ? 'draggable' : ''} ${dragging ? 'dragging' : ''}`}
            onPointerDown={onMove ? (e) => {
              if (e.button !== 0) return
              e.stopPropagation()
              ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
              const p = toMap(e)
              if (p) setDrag({ id: t.id, point: p, tile: snapTile(grid, p) })
            } : undefined}
            onPointerMove={onMove ? (e) => {
              if (!dragging) return
              const p = toMap(e)
              if (p) setDrag({ id: t.id, point: p, tile: snapTile(grid, p) })
            } : undefined}
            onPointerUp={onMove ? () => {
              if (dragging && drag.tile && (drag.tile[0] !== t.tile[0] || drag.tile[1] !== t.tile[1])) onMove(t, drag.tile)
              setDrag(null)
            } : undefined}
            onPointerCancel={() => setDrag(null)}>
            <title>{t.name ?? '???'}</title>
            {ghost && <circle cx={ghost[0]} cy={ghost[1]} r={r} className="map-token-ghost" />}
            <circle cx={cx} cy={cy} r={r} fill="#1b1722" />
            {t.icon?.url
              ? <SvgPicture url={t.icon.url} face={t.icon.face} cx={cx} cy={cy} r={r} clipId={clip} />
              : <text x={cx} y={cy} dy="0.35em" textAnchor="middle" fontSize={r * (initials(t.name).length > 1 ? 0.8 : 1)} fill="#ece6da" fontFamily="serif">{initials(t.name)}</text>}
            <TokenRing cx={cx} cy={cy} r={r} style={t.style} color={t.color} id={`${clip}-ring`} />
          </g>
        )
      })}
    </g>
  )
}

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
            <path className="map-ping-pin" style={{ fill: p.color }}
              d={`M ${cx} ${top} c ${-pin * 0.9} ${-pin * 1.1} ${-pin * 0.9} ${-pin * 2.2} 0 ${-pin * 2.2} c ${pin * 0.9} 0 ${pin * 0.9} ${pin * 1.1} 0 ${pin * 2.2} z`} />
            <text x={cx} y={top - pin * 2.5} textAnchor="middle" className="map-ping-name" style={{ fill: p.color, fontSize: Math.max(12, grid.size * 0.32) }}>{p.name}</text>
          </g>
        )
      })}
    </g>
  )
}
