/**
 * What's drawn over the map, in map px (SVG): regions, paths, resources on tiles (round icons), labels, the highlight
 * zone, previews. Lines and shapes have a dark contour so they read on any map.
 */
import { memo, useMemo, useState, type ReactNode } from 'react'
import { bestInk } from '../color/theory'
import { TokenRing } from '../components/Token'
import SvgPicture from '../components/SvgPicture'
import type { LocationMap, MapGrid, MapLabel, MapLink, MapPath, MapRegion, MapToken } from '../api/types'
import { MapPings, MapTokens, TokenValues, type DrawnPing } from './MapTokens'
import MapLabels from './MapLabels'
import { labelPoint, outlineD, pathCut, pathD, pathSamples, tileCenter, tileKey, tilePolygon, tilesOutline, type Along, type Tile } from './geometry'

const KIND_RING: Record<string, string> = { character: '#d6a84e', location: '#6cc9e0', item: '#b48cf2' }
/** The dark edge around lines and shapes. */
const CONTOUR = 'rgba(0,0,0,0.5)'
const CONTOUR_W = 2.5
/** The highlight zone's border, like a normal path. */
export const HIGHLIGHT_WIDTH = 5

const polygonPoints = (map: LocationMap, [c, r]: Tile) => tilePolygon(map.grid, c, r).map((p) => p.join(',')).join(' ')

function dash(body: string, w: number): string | undefined {
  if (body === 'dashed') return `${w * 3} ${w * 2}`
  if (body === 'dotted') return `0.1 ${w * 2.4}`
  return undefined
}

const deg = (rad: number) => (rad * 180) / Math.PI
const placed = ({ at, angle }: Along) => `translate(${at[0]} ${at[1]}) rotate(${deg(angle)})`

/** A head or tail: drawn pointing along +x at the line's end, with a contour. */
function End({ kind, at, width, color }: { kind: string; at: Along; width: number; color: string }) {
  const edge = bestInk(color)
  if (kind === 'circle') {
    const r = Math.max(width * 1.4, 4.5)
    return <circle cx={at.at[0]} cy={at.at[1]} r={r} fill={color} stroke={edge} strokeWidth={CONTOUR_W} paintOrder="stroke" />
  }
  // arrow: its tip just past the line's end (covering the round cap)
  const l = Math.max(width * 3.2, 10)
  const tip = width * 0.5
  return (
    <path transform={placed(at)} d={`M ${tip} 0 L ${tip - l} ${-l * 0.55} L ${tip - l} ${l * 0.55} Z`} fill={color}
      stroke={edge} strokeWidth={CONTOUR_W} strokeLinejoin="round" paintOrder="stroke" />
  )
}

/**
 * One path. Solid, dashed and dotted: a line. Arrows and arrowheads: no line, a string of chevrons or filled
 * arrowheads along the way. Heads and tails sit at the ends (a tail arrow points out of the start).
 */
export const PathLine = memo(function PathLine({ grid, path, faded = false }: { grid: MapGrid; path: MapPath; faded?: boolean }) {
  const w = path.width
  const string = path.body === 'arrows' || path.body === 'arrowheads'
  const size = Math.max(w * 2.6, 9)
  const { d, samples } = useMemo(() => {
    const cut = pathCut(path)
    const samples = pathSamples(grid, path, size * 1.7, path.head !== 'none' ? size * 1.2 : size * 0.4, cut)
    // Partly shown: the line up to the cut (finely sampled); none at all when nothing is shown yet
    const d = cut === null ? pathD(grid, path)
      : samples.length > 0 ? `M ${samples.points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')}` : ''
    return { d, samples }
  }, [grid, path, size])
  const tail = samples.start && { ...samples.start, angle: samples.start.angle + Math.PI }
  // Its contour: solid black or white, whichever stands out from its colour
  const edge = bestInk(path.color)
  return (
    <g className={`map-path ${faded ? 'faded' : ''}`}>
      {!string && (
        <>
          <path d={d} fill="none" stroke={edge} strokeWidth={w + CONTOUR_W} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash(path.body, w)} />
          <path d={d} fill="none" stroke={path.color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash(path.body, w)} />
        </>
      )}
      {string && samples.along.map((at, i) => (
        path.body === 'arrowheads' ? (
          <path key={i} transform={placed(at)} d={`M ${size * 0.55} 0 L ${-size * 0.45} ${-size * 0.5} L ${-size * 0.45} ${size * 0.5} Z`}
            fill={path.color} stroke={edge} strokeWidth={CONTOUR_W} strokeLinejoin="round" paintOrder="stroke" />
        ) : (
          <g key={i} transform={placed(at)}>
            <path d={`M ${-size * 0.3} ${-size * 0.48} L ${size * 0.25} 0 L ${-size * 0.3} ${size * 0.48}`} fill="none" stroke={edge}
              strokeWidth={Math.max(w * 0.8, 2) + CONTOUR_W} strokeLinecap="round" strokeLinejoin="round" />
            <path d={`M ${-size * 0.3} ${-size * 0.48} L ${size * 0.25} 0 L ${-size * 0.3} ${size * 0.48}`} fill="none" stroke={path.color}
              strokeWidth={Math.max(w * 0.8, 2)} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )
      ))}
      {string && samples.length === 0 && d && pathCut(path) === null && (
        <path d={d} fill="none" stroke={path.color} strokeWidth={w * 1.6} strokeLinecap="round" />
      )}
      {path.tail !== 'none' && tail && <End kind={path.tail} at={tail} width={w} color={path.color} />}
      {path.head !== 'none' && samples.end && <End kind={path.head} at={samples.end} width={w} color={path.color} />}
    </g>
  )
})

/** A region: its tiles filled, its border (along the tile edges, or splined), or both; and its name. */
export const RegionShape = memo(function RegionShape({ grid, region, faded = false }: { grid: MapGrid; region: MapRegion; faded?: boolean }) {
  const d = useMemo(() => outlineD(tilesOutline(grid, region.tiles), region.render), [grid, region.tiles, region.render])
  const label = useMemo(() => (region.label ? labelPoint(grid, region.tiles) : null), [grid, region.tiles, region.label])
  if (!d) return null
  const border = region.show !== 'fill'
  const fill = region.show !== 'border'
  const w = region.width
  const font = Math.max(grid.size * 0.42, 12)
  return (
    <g className={`map-region ${faded ? 'faded' : ''}`}>
      {fill && <path d={d} fill={region.fill} fillOpacity={region.opacity} fillRule="evenodd" stroke="none" />}
      {border && (
        <>
          <path d={d} fill="none" stroke={CONTOUR} strokeWidth={w + CONTOUR_W} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dash(region.line, w)} />
          <path d={d} fill="none" stroke={region.color} strokeWidth={w} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dash(region.line, w)} />
        </>
      )}
      {label && (
        <text x={label[0]} y={label[1]} dy="0.35em" textAnchor="middle" fontSize={font} fontFamily="serif" fill="#f4eee2"
          stroke="rgba(0,0,0,0.75)" strokeWidth={font * 0.18} paintOrder="stroke" className="map-region-label">{region.name}</text>
      )}
    </g>
  )
})

/** Highlighted tiles: everything else is darkened; the tiles keep their look, with a splined border. */
export const HighlightZone = memo(function HighlightZone({ grid, tiles, size }: { grid: MapGrid; tiles: Tile[]; size: [number, number] }) {
  const d = useMemo(() => outlineD(tilesOutline(grid, tiles), 'spline'), [grid, tiles])
  if (!d) return null
  const [w, h] = size
  const pad = Math.max(w, h)
  return (
    <g className="map-highlight-zone">
      <path d={`M ${-pad} ${-pad} H ${w + pad} V ${h + pad} H ${-pad} Z ${d}`} fillRule="evenodd" className="map-highlight-dim" />
      <path d={d} fill="none" stroke={CONTOUR} strokeWidth={HIGHLIGHT_WIDTH + CONTOUR_W} strokeLinejoin="round" />
      <path d={d} fill="none" strokeWidth={HIGHLIGHT_WIDTH} strokeLinejoin="round" className="map-highlight-border" />
    </g>
  )
})

/** The resources on one tile: round icons with a ring; several share the tile (smaller) so all show. */
function TileLinks({ map, tile, links, onClick }: { map: LocationMap; tile: Tile; links: MapLink[]; onClick?: (link: MapLink) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const [cx, cy] = tileCenter(map.grid, tile[0], tile[1])
  const per = Math.ceil(Math.sqrt(links.length))
  const rows = Math.ceil(links.length / per)
  const cell = (map.grid.size * (links.length > 1 ? 0.9 : 0.72)) / per
  const radius = cell * (links.length > 1 ? 0.47 : 0.44)
  return (
    <g className="map-links">
      {links.map((link, i) => {
        const col = i % per
        const row = Math.floor(i / per)
        const inRow = row === rows - 1 ? links.length - row * per : per
        const x = cx + (col - (inRow - 1) / 2) * cell
        const y = cy + (row - (rows - 1) / 2) * cell
        const clip = `clip-${map.location.id}-${tileKey(tile)}-${i}`
        return (
          <g key={`${link.resource_id}`} className={`map-link kind-${link.kind} ${onClick ? 'clickable' : ''} ${link.hidden ? 'dm-only' : ''}`}
            onPointerEnter={() => setHover(link.resource_id)} onPointerLeave={() => setHover((h) => (h === link.resource_id ? null : h))}
            onPointerDown={(e) => onClick && e.stopPropagation()}
            onClick={(e) => { if (onClick) { e.stopPropagation(); onClick(link) } }}>
            <title>{link.name ?? '???'}</title>
            <circle cx={x} cy={y} r={radius} fill="#1b1722" />
            {link.icon ? (
              // The icon, else the picture's face crop
              <SvgPicture url={link.icon.url} face={link.icon.face} cx={x} cy={y} r={radius} clipId={clip} />
            ) : (
              <text x={x} y={y} dy="0.35em" textAnchor="middle" fontSize={radius} fill="#ece6da" fontFamily="serif">
                {(link.name || '?').slice(0, 1)}
              </text>
            )}
            {link.token ? (
              // A character: its token as its display template draws it (border, values on and around it)
              <>
                <TokenRing cx={x} cy={y} r={radius} style={link.token.style} color={link.token.color} id={`${clip}-ring`} />
                {link.token.values.length > 0 && (
                  <TokenValues shape={{ cx: x, cy: y, half: radius, ring: 0, box: [x - radius, y - radius, radius * 2, radius * 2] }}
                    values={link.token.values} hovered={hover === link.resource_id} tile={map.grid.size} />
                )}
              </>
            ) : (
              <>
                <circle cx={x} cy={y} r={radius} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={radius * 0.28} />
                <circle cx={x} cy={y} r={radius} fill="none" stroke={KIND_RING[link.kind] ?? '#ece6da'} strokeWidth={radius * 0.14} />
              </>
            )}
          </g>
        )
      })}
    </g>
  )
}

interface Props {
  map: LocationMap
  onLinkClick?: (link: MapLink) => void
  /** Tiles drawn as a preview (brush, rectangle, path being drawn). */
  preview?: { tiles: Tile[]; tone: 'visible' | 'known' | 'unknown' | 'select' }
  selectedTile?: Tile | null
  /** Paths: one being edited stands out; the others fade. */
  activePathId?: string | null
  /** A path's shown part while its slider is dragged (before it's saved). */
  pathDraft?: { id: string; shown: number } | null
  /** Regions: one being edited stands out (with its tiles as painted so far); the others fade. */
  activeRegionId?: string | null
  regionDraft?: { id: string; tiles: Tile[] } | null
  /** Labels: the editor shows every text and picks a label on click. */
  labels?: { showAll?: boolean; selectedId?: string | null; onSelect?: (label: MapLabel) => void }
  /** Tokens: the DM drags them (dropped on a tile). */
  tokens?: { onMove?: (token: MapToken, tile: Tile) => void; onPick?: (token: MapToken, at: { x: number; y: number }) => void; picked?: string | null
    /** The DM dragging a token: the tile it would land on (null: no move). */
    onDragTile?: (token: MapToken, tile: Tile | null) => void
    /** Tokens someone else is dragging: where each would land (plan 39). */
    remote?: Record<string, { tile: Tile; live: boolean }> }
  /** Pings shown now (a few seconds each). */
  pings?: DrawnPing[]
  children?: ReactNode
}

export default function MapOverlay({ map, onLinkClick, preview, selectedTile, activePathId, pathDraft, activeRegionId, regionDraft, labels, tokens, pings, children }: Props) {
  const [w, h] = map.size
  const byTile = new Map<string, MapLink[]>()
  for (const link of map.links) {
    const key = tileKey(link.tile)
    byTile.set(key, [...(byTile.get(key) || []), link])
  }
  return (
    <svg className="map-overlay" viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none">
      {(map.regions || []).map((r) => (
        <RegionShape key={r.id} grid={map.grid} region={regionDraft?.id === r.id ? { ...r, tiles: regionDraft.tiles } : r}
          faded={Boolean(activeRegionId) && r.id !== activeRegionId} />
      ))}
      {map.paths.map((p) => (
        <PathLine key={p.id} grid={map.grid} path={pathDraft?.id === p.id ? { ...p, shown: pathDraft.shown } : p}
          faded={Boolean(activePathId) && p.id !== activePathId} />
      ))}
      {[...byTile.entries()].map(([key, links]) => (
        <TileLinks key={key} map={map} tile={links[0].tile} links={links} onClick={onLinkClick} />
      ))}
      {(map.tokens?.length ?? 0) > 0 && <MapTokens grid={map.grid} tokens={map.tokens!} mapId={map.location.id} onMove={tokens?.onMove} onPick={tokens?.onPick} picked={tokens?.picked}
        onDragTile={tokens?.onDragTile} remote={tokens?.remote} />}
      {(map.labels?.length ?? 0) > 0 && <MapLabels grid={map.grid} labels={map.labels!} {...labels} />}
      {map.highlight && map.highlight.length > 0 && <HighlightZone grid={map.grid} tiles={map.highlight} size={map.size} />}
      {preview?.tiles.map((t) => <polygon key={`pv-${tileKey(t)}`} className={`map-preview tone-${preview.tone}`} points={polygonPoints(map, t)} />)}
      {selectedTile && <polygon className="map-selected" points={polygonPoints(map, selectedTile)} />}
      {pings && pings.length > 0 && <MapPings grid={map.grid} pings={pings} />}
      {children}
    </svg>
  )
}
