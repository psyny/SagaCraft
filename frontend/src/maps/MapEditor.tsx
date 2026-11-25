/**
 * A location's map with the DM's tools (plan 45). Over the map, the map tools bar (maps/toolbar: Selection, Fog,
 * Links, Tokens, Paths, Regions, Labels, then the open tool's row), the same as on a map Set. The side panel holds the
 * whole map's tabs: Details (the location page's), Grid (with the fog of war on or off), Background and Layers
 * (the layers' list; under it, the picked layer's pictures). Map Sets open it in a modal on the layer they show.
 * Players get the map read-only (MapViewer).
 */
import { useState, type ReactNode } from 'react'
import type { MapLink } from '../api/types'
import { fogFromString } from './geometry'
import MapView, { ScaleLegend } from './MapView'
import { GridPanel } from './tools/GridTool'
import { BackgroundPanel, LayerPicker, LayersPanel } from './tools/LayersTool'
import { defaultFogGroups, fogFor } from './tools/FogTool'
import { usePicturesTool } from './tools/PicturesTool'
import { MapToolButtons, MapToolRow, useMapTools } from './toolbar/MapTools'
import { ArrowIcon, MoveIcon } from './toolbar/icons'
import { ToolButton } from './toolbar/widgets'
import { useLocationMap } from './useLocationMap'

export type MapPanelTab = 'details' | 'grid' | 'background' | 'layers'

const TAB_LABELS: Record<MapPanelTab, string> = { details: 'Details', grid: 'Grid', background: 'Background', layers: 'Layers' }

interface Props {
  sagaId: number
  locationId: number
  /** The side panel's tabs (the location page adds Details). */
  tabs?: MapPanelTab[]
  initial?: MapPanelTab
  /** The Details tab's content (the location's form). */
  details?: ReactNode
  /** Suggested resources to link (sub-locations). */
  favorites?: number[]
  /** The layer to start on (a Map Set's shown one). */
  layer?: string | null
  onOpenLink?: (link: MapLink) => void
}

export default function MapEditor({ sagaId, locationId, tabs = ['grid', 'background', 'layers'], initial, details, favorites, layer, onOpenLink }: Props) {
  const { map, setMap, run, error, setError, setLayer } = useLocationMap(sagaId, locationId, layer)
  const [section, setSection] = useState<MapPanelTab>(initial ?? tabs[0])
  const tools = useMapTools({ map, run, enabled: Boolean(map), favorites, onOpenLink })
  // Selection: look around (drag pans), or Move (drag tokens)
  const [moving, setMoving] = useState(false)
  // The layer's pictures: dragged on the map while the Layers tab is open with the Selection tool
  const picturesOn = section === 'layers' && tools.tool === 'select' && !moving
  const pictures = usePicturesTool({ map, run, setMap, active: picturesOn })
  const selectionProps = tools.tool !== 'select' ? {}
    : moving ? { overlay: { tokens: { onMove: (t: { id: string }, tile: [number, number]) => void run('tokens.move', { id: t.id, tile }) } } }
      : picturesOn ? pictures.mapProps : {}
  const mapProps = tools.tool === 'select' ? selectionProps : tools.mapProps

  return (
    <div className="map-editor">
      <div className="map-editor-main">
        <div className="map-editor-bar" role="toolbar" aria-label="Map tools">
          <MapToolButtons tools={tools} />
        </div>
        <div className="map-editor-bar tool-row" role="toolbar" aria-label="The tool's options">
          <MapToolRow tools={tools} selection={(
            <>
              <ToolButton icon={<ArrowIcon />} label="Select" text="Select" title="Look around: drag the map (in Layers: drag its pictures)" on={!moving} onClick={() => setMoving(false)} />
              <ToolButton icon={<MoveIcon />} label="Move tokens" text="Move" title="Drag tokens; they snap to tiles" on={moving} onClick={() => setMoving(true)} />
            </>
          )} />
        </div>
        <div className="map-editor-map">
          {map ? (
            <MapView map={map} fog={tools.fog.fog} display="flat" seeThrough={0} {...mapProps}>
              <ScaleLegend map={map} />
            </MapView>
          ) : <div className="page-message">{error || 'Loading the map…'}</div>}
        </div>
      </div>
      <aside className="map-editor-panel">
        <div className="tool-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={t === section} className={`tool-tab ${t === section ? 'on' : ''}`} onClick={() => setSection(t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        {error && map && <div className="error" onClick={() => setError('')}>{error}</div>}
        <div className="tool-body">
          {section === 'details' && details}
          {map && section === 'grid' && <GridPanel map={map} run={run} setMap={setMap} />}
          {map && section === 'background' && <BackgroundPanel map={map} run={run} />}
          {map && section === 'layers' && (
            <>
              {/* The layers first, then the picked one's pictures */}
              <LayersPanel map={map} run={run} onPick={setLayer} editable />
              <div className="layer-tools">{pictures.panel}</div>
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
