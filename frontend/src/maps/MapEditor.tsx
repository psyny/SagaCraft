/**
 * A location's map with the DM's tools, in tabs: the map stays (pan, zoom) and the side panel changes. The
 * location page uses every tab (and its Details); map Sets open it in a modal with the table tools (fog,
 * links, paths, regions) first. Players get the map read-only (MapViewer).
 */
import { useState, type ReactNode } from 'react'
import type { MapLink } from '../api/types'
import { fogFromString } from './geometry'
import MapView, { ScaleLegend } from './MapView'
import { GridPanel } from './tools/GridTool'
import { defaultFogGroups, fogFor, useFogTool } from './tools/FogTool'
import { useLinksTool } from './tools/LinksTool'
import { usePathsTool } from './tools/PathsTool'
import { usePicturesTool } from './tools/PicturesTool'
import { useLabelsTool } from './tools/LabelsTool'
import { useRegionsTool } from './tools/RegionsTool'
import { useTokensTool } from './tools/TokensTool'
import { useLocationMap } from './useLocationMap'

export type MapTool = 'details' | 'pictures' | 'grid' | 'fog' | 'links' | 'paths' | 'regions' | 'labels' | 'tokens'

const TOOL_LABELS: Record<MapTool, string> = {
  details: 'Details', pictures: 'Pictures', grid: 'Grid', fog: 'Fog', links: 'Links', paths: 'Paths', regions: 'Regions', labels: 'Labels',
  tokens: 'Tokens',
}

interface Props {
  sagaId: number
  locationId: number
  tools: MapTool[]
  initial?: MapTool
  /** The Details tab's content (the location's form). */
  details?: ReactNode
  /** Suggested resources to link (sub-locations). */
  favorites?: number[]
}

export default function MapEditor({ sagaId, locationId, tools, initial, details, favorites }: Props) {
  const { map, setMap, run, error, setError } = useLocationMap(sagaId, locationId)
  const [tool, setTool] = useState<MapTool>(initial ?? tools[0])
  const fogTool = useFogTool({ map, run, active: tool === 'fog' })
  const links = useLinksTool({ map, run, active: tool === 'links', favorites })
  const paths = usePathsTool({ map, run, active: tool === 'paths' })
  const regions = useRegionsTool({ map, run, active: tool === 'regions' })
  const labels = useLabelsTool({ map, run, active: tool === 'labels' })
  const pictures = usePicturesTool({ map, run, setMap, active: tool === 'pictures' })
  const tokens = useTokensTool({ map, run, active: tool === 'tokens' })
  const mapProps = {
    fog: fogTool.mapProps, links: links.mapProps, paths: paths.mapProps, regions: regions.mapProps, pictures: pictures.mapProps,
    labels: labels.mapProps, tokens: tokens.mapProps,
  }[tool as string] ?? {}

  return (
    <div className="map-editor">
      <div className="map-editor-map">
        {map ? (
          <MapView map={map} fog={fogTool.fog} display="flat" seeThrough={0} {...mapProps}>
            <ScaleLegend map={map} />
          </MapView>
        ) : <div className="page-message">{error || 'Loading the map…'}</div>}
      </div>
      <aside className="map-editor-panel">
        <div className="tool-tabs" role="tablist">
          {tools.map((t) => (
            <button key={t} role="tab" aria-selected={t === tool} className={`tool-tab ${t === tool ? 'on' : ''}`} onClick={() => setTool(t)}>
              {TOOL_LABELS[t]}
            </button>
          ))}
        </div>
        {error && map && <div className="error" onClick={() => setError('')}>{error}</div>}
        <div className="tool-body">
          {tool === 'details' && details}
          {map && tool === 'pictures' && pictures.panel}
          {map && tool === 'grid' && <GridPanel map={map} run={run} setMap={setMap} />}
          {map && tool === 'fog' && fogTool.panel}
          {map && tool === 'links' && links.panel}
          {map && tool === 'paths' && paths.panel}
          {map && tool === 'regions' && regions.panel}
          {map && tool === 'labels' && labels.panel}
          {map && tool === 'tokens' && tokens.panel}
        </div>
      </aside>
    </div>
  )
}

/**
 * A location's map as this member may see it, read-only: their fog (immersive by default), the paths
 * shared with them, and the resources on tiles they know (a click opens them).
 */
export function MapViewer({ sagaId, locationId, onLinkClick, display = 'soft' }: {
  sagaId: number
  locationId: number
  onLinkClick?: (link: MapLink) => void
  display?: 'flat' | 'soft'
}) {
  const { map, error } = useLocationMap(sagaId, locationId)
  if (!map) return <div className="page-message">{error || 'Loading the map…'}</div>
  // Players get their own fog; the DM sees the players' (the map shows through)
  const fog = map.fog.states ? fogFromString(map.fog.states) : fogFor(map, defaultFogGroups(map))
  return (
    <MapView map={map} fog={fog} display={display} seeThrough={map.images ? 0.45 : 0} onLinkClick={onLinkClick}>
      <ScaleLegend map={map} />
    </MapView>
  )
}
