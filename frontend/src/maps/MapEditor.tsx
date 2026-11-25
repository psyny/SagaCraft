/**
 * A location's map with the DM's tools (plans 45, 47). Over the map, the map tools bar (maps/toolbar: Selection, Fog,
 * Links, Tokens, Paths, Regions, Labels, and the editor's own: Images, Terrain, Roads & rivers, Landmarks; then the open
 * tool's row), the same as on a map Set. The side panel holds the whole map's tabs: Details (the location page's form,
 * and the map painting's settings), Grid (with the fog of war on or off), Background and Layers. Map Sets open it in a
 * modal on the layer they show.
 * Players get the map read-only (MapViewer).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { LocationMap, MapLink } from '../api/types'
import Segmented from '../components/Segmented'
import { fogFromString } from './geometry'
import MapView, { ScaleLegend } from './MapView'
import { GridPanel } from './tools/GridTool'
import { BackgroundPanel, LayerPicker, LayersPanel } from './tools/LayersTool'
import { defaultFogGroups, fogFor } from './tools/FogTool'
import { MapToolButtons, MapToolRow, useMapTools } from './toolbar/MapTools'
import { ArrowIcon, MoveIcon } from './toolbar/icons'
import { ToolButton } from './toolbar/widgets'
import { useLocationMap, type MapCommand } from './useLocationMap'

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

export default function MapEditor({ sagaId, locationId, tabs = ['details', 'grid', 'background', 'layers'], initial, details, favorites, layer, onOpenLink }: Props) {
  const { map, setMap, run, error, setError, setLayer } = useLocationMap(sagaId, locationId, layer)
  const [section, setSection] = useState<MapPanelTab>(initial ?? tabs[0])
  const tools = useMapTools({ map, run, setMap, enabled: Boolean(map), favorites, onOpenLink })
  // Selection: look around (drag pans), or Move (drag tokens)
  const [moving, setMoving] = useState(false)
  const selectionProps = tools.tool !== 'select' || !moving ? {}
    : { overlay: { tokens: { onMove: (t: { id: string }, tile: [number, number]) => void run('tokens.move', { id: t.id, tile }) } } }
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
              <ToolButton icon={<ArrowIcon />} label="Select" text="Select" title="Look around: drag the map" on={!moving} onClick={() => setMoving(false)} />
              <ToolButton icon={<MoveIcon />} label="Move tokens" text="Move" title="Drag tokens; they snap to tiles" on={moving} onClick={() => setMoving(true)} />
            </>
          )} />
        </div>
        <div className="map-editor-map">
          {map ? (
            <MapView map={map} fog={tools.fog.fog} display="flat" seeThrough={0} paintable {...mapProps}>
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
          {section === 'details' && (
            <>
              {details}
              {map && <PainterPanel map={map} run={run} />}
              {map && <DownloadPanel sagaId={sagaId} map={map} />}
            </>
          )}
          {map && section === 'grid' && <GridPanel map={map} run={run} setMap={setMap} />}
          {map && section === 'background' && <BackgroundPanel map={map} run={run} />}
          {map && section === 'layers' && (
            <>
              <LayersPanel map={map} run={run} onPick={setLayer} editable />
              <p className="muted small">The picked layer's pictures and painting: the Images, Terrain, Roads & rivers and Landmarks tools over the map.</p>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

/** The Details tab's painting settings (plans 47-49): the painter's style, the kind of map. */
function PainterPanel({ map, run }: { map: LocationMap; run: MapCommand }) {
  const settings = map.painter ?? { style: 'storybook', kind: 'world', animated: false }
  const set = (changes: Record<string, unknown>) => void run('painter.set', { changes })
  // The styles (a folder each on the server: plan 48)
  const [styles, setStyles] = useState<{ key: string; name: string; description: string }[]>([])
  useEffect(() => { api.paintStyles().then((r) => setStyles(r.styles)).catch(() => undefined) }, [])
  return (
    <div className="tool-panel painter-panel">
      <div className="tool-head"><strong>Map painting</strong></div>
      <label>Style
        <select value={settings.style} onChange={(e) => set({ style: e.target.value })}>
          {(styles.length ? styles : [{ key: settings.style, name: settings.style, description: '' }]).map((st) => (
            <option key={st.key} value={st.key} title={st.description}>{st.name}</option>
          ))}
        </select>
      </label>
      <label>Map type
        <select value={settings.kind} onChange={(e) => set({ kind: e.target.value })}>
          <option value="world">World map</option>
          <option value="local" disabled>Local map (later)</option>
        </select>
      </label>
      <p className="muted small">Paint with the Terrain, Routes, Boundaries, Scenery, Effects and Features tools; pictures lie over the
        painting. Animation is each user's choice on their device (User page).</p>
    </div>
  )
}

/** The Details tab's download (plan 52): the map as the players see it, without the weather, as PNG or PDF. */
function DownloadPanel({ sagaId, map }: { sagaId: number; map: LocationMap }) {
  const [format, setFormat] = useState<'png' | 'pdf'>('png')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const download = async () => {
    setBusy(true)
    setError('')
    try {
      const { downloadMap } = await import('./download')
      await downloadMap(sagaId, map.location.id, map.layer, map.location.name ?? 'map', format)
    } catch (e) {
      setError((e as Error).message || 'The map could not be drawn')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="tool-panel">
      <div className="tool-head"><strong>Download the map</strong></div>
      <p className="muted small">As the players see it (their fog, what's shared with them), without the weather.</p>
      <div className="row">
        <Segmented<'png' | 'pdf'> value={format} options={[['png', 'PNG'], ['pdf', 'PDF']]} onChange={setFormat} />
        <button onClick={() => void download()} disabled={busy}>{busy ? 'Preparing…' : 'Download'}</button>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
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
