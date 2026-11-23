/**
 * A location's map with the DM's tools, in tabs: the map stays (pan, zoom) and the side panel changes. The
 * tabs are the whole map's (Details, Grid, Fog, Background, Layers); in Layers, the layers' list, then the layer
 * being edited (a picker) and its own tools (Pictures, Links, Tokens, Paths, Regions, Labels). The location page uses
 * every tab (and its Details); map Sets open it in a modal on the layer they show. Players get the map read-only
 * (MapViewer).
 */
import { useState, type ReactNode } from 'react'
import type { MapLink } from '../api/types'
import { fogFromString } from './geometry'
import MapView, { ScaleLegend } from './MapView'
import { GridPanel } from './tools/GridTool'
import { BackgroundPanel, LayerPicker, LayersPanel } from './tools/LayersTool'
import { defaultFogGroups, fogFor, useFogTool } from './tools/FogTool'
import { useLinksTool } from './tools/LinksTool'
import { usePathsTool } from './tools/PathsTool'
import { usePicturesTool } from './tools/PicturesTool'
import { useLabelsTool } from './tools/LabelsTool'
import { useRegionsTool } from './tools/RegionsTool'
import { useTokensTool } from './tools/TokensTool'
import { useLocationMap } from './useLocationMap'

export type MapTool = 'details' | 'pictures' | 'grid' | 'fog' | 'links' | 'paths' | 'regions' | 'labels' | 'tokens' | 'layers' | 'background'

const TOOL_LABELS: Record<MapTool, string> = {
  details: 'Details', pictures: 'Pictures', grid: 'Grid', fog: 'Fog', links: 'Links', paths: 'Paths', regions: 'Regions', labels: 'Labels',
  tokens: 'Tokens', layers: 'Layers', background: 'Background',
}
/** The tools for the whole map, the top tabs (the others are the layer's, inside Layers). */
const WHOLE_MAP: MapTool[] = ['details', 'grid', 'fog', 'background', 'layers']
const ofLayer = (t: MapTool) => !WHOLE_MAP.includes(t)

interface Props {
  sagaId: number
  locationId: number
  tools: MapTool[]
  initial?: MapTool
  /** The Details tab's content (the location's form). */
  details?: ReactNode
  /** Suggested resources to link (sub-locations). */
  favorites?: number[]
  /** The layer to start on (a Map Set's shown one). */
  layer?: string | null
}

export default function MapEditor({ sagaId, locationId, tools, initial, details, favorites, layer }: Props) {
  const { map, setMap, run, error, setError, setLayer } = useLocationMap(sagaId, locationId, layer)
  // The top tab, and (in Layers) the layer's tool open
  const layerTools = tools.filter(ofLayer)
  const tabs = [...tools.filter((t) => !ofLayer(t) && t !== 'layers'), ...(layerTools.length || tools.includes('layers') ? ['layers' as MapTool] : [])]
  const start = initial ?? tools[0]
  const [section, setSection] = useState<MapTool>(ofLayer(start) ? 'layers' : start)
  const [layerTool, setLayerTool] = useState<MapTool | null>(ofLayer(start) ? start : layerTools[0] ?? null)
  const tool: MapTool | null = section === 'layers' ? layerTool : section
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
  }[(tool ?? '') as string] ?? {}

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
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={t === section} className={`tool-tab ${t === section ? 'on' : ''}`} onClick={() => setSection(t)}>
              {TOOL_LABELS[t]}
            </button>
          ))}
        </div>
        {error && map && <div className="error" onClick={() => setError('')}>{error}</div>}
        <div className="tool-body">
          {section === 'details' && details}
          {map && section === 'grid' && <GridPanel map={map} run={run} setMap={setMap} />}
          {map && section === 'fog' && fogTool.panel}
          {map && section === 'background' && <BackgroundPanel map={map} run={run} />}
          {map && section === 'layers' && (
            <>
              {/* The layers first, then the one being edited and its tools */}
              <LayersPanel map={map} run={run} onPick={setLayer} />
              {layerTools.length > 0 && (
                <div className="layer-tools">
                  <LayerPicker map={map} onPick={setLayer} label="Editing layer" />
                  <div className="tool-tabs" role="tablist" aria-label="The layer's tools">
                    {layerTools.map((t) => (
                      <button key={t} role="tab" aria-selected={t === layerTool} className={`tool-tab ${t === layerTool ? 'on' : ''}`} onClick={() => setLayerTool(t)}>
                        {TOOL_LABELS[t]}
                      </button>
                    ))}
                  </div>
                  {tool === 'pictures' && pictures.panel}
                  {tool === 'links' && links.panel}
                  {tool === 'tokens' && tokens.panel}
                  {tool === 'paths' && paths.panel}
                  {tool === 'regions' && regions.panel}
                  {tool === 'labels' && labels.panel}
                </div>
              )}
            </>
          )}
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
  const { map, error, setLayer } = useLocationMap(sagaId, locationId)
  if (!map) return <div className="page-message">{error || 'Loading the map…'}</div>
  // Players get their own fog; the DM sees the players' (the map shows through)
  const fog = map.fog.states ? fogFromString(map.fog.states) : fogFor(map, defaultFogGroups(map))
  return (
    <MapView map={map} fog={fog} display={display} seeThrough={map.images ? 0.45 : 0} onLinkClick={onLinkClick}>
      <ScaleLegend map={map} />
      {map.layers.length > 1 && <div className="map-layer-corner" onPointerDown={(e) => e.stopPropagation()}><LayerPicker map={map} onPick={setLayer} /></div>}
    </MapView>
  )
}
