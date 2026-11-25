/**
 * The map tools bar (plan 45), the same on a map Set (the Set bar's menu row and tool row) and in the map editor (over
 * the map): the tool buttons (Selection, Fog, Links, Tokens, Paths, Regions, Labels), then the open tool's row.
 * Kinds of things (links, tokens, paths, regions, labels) start their row with ☰ (the layer's list: select, eye,
 * rename, delete) and ＋ (add one, selected), then the selected one's tools. Clicking the open tool again, or Esc,
 * steps back: a tray closes, then drawing or placing stops, then the thing is deselected, then back to Selection.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LocationMap, MapLink, MapToken } from '../../api/types'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import { useFogTool } from '../tools/FogTool'
import { useLabelsTool } from '../tools/LabelsTool'
import { useLinksTool } from '../tools/LinksTool'
import { usePathsTool } from '../tools/PathsTool'
import { useRegionsTool } from '../tools/RegionsTool'
import { useTokensTool } from '../tools/TokensTool'
import { usePicturesTool } from '../tools/PicturesTool'
import { useAmbienceTools } from '../tools/AmbienceTools'
import { usePaintPack } from '../painter/pack'
import { useFeaturesTool, useRoutesTool, useSceneryTool, useTerrainTool } from '../painter/tools'
import { ArrowIcon, ChainIcon, CloudIcon, FeatureIcon, FigureIcon, FlagIcon, FrameIcon, PinIcon, RoadIcon, SceneryIcon, WaysIcon, WorldBrushIcon } from './icons'
import { EntityHead, Sep, ToolButton } from './widgets'

export type MapToolKey = 'select' | 'fog' | 'links' | 'tokens' | 'paths' | 'regions' | 'labels' | 'images' | 'terrain' | 'routes' | 'scenery' | 'features'
type EntityTool = 'links' | 'tokens' | 'paths' | 'regions' | 'labels' | 'images' | 'features'
/** The map editor's own tools (not on a Stage): the pictures, then the painter's, one per layer, bottom to top (plan 48). */
export const EDITOR_TOOLS: MapToolKey[] = ['terrain', 'routes', 'scenery', 'features', 'images']

export const MAP_TOOLS: [MapToolKey, string, string, () => JSX.Element][] = [
  ['select', 'Selection', 'Select, move tokens', () => <ArrowIcon />],
  ['fog', 'Fog', 'Reveal, known, hide: paint the fog', () => <CloudIcon />],
  ['links', 'Links', 'Characters, items and places on tiles', () => <ChainIcon />],
  ['tokens', 'Tokens', 'Mobile tokens: characters, items, groups, custom', () => <FigureIcon />],
  ['paths', 'Paths', 'Tiles in order: a journey, a trail', () => <RoadIcon />],
  ['regions', 'Regions', 'Named groups of tiles: a kingdom, a forest', () => <FlagIcon />],
  ['labels', 'Labels', 'Places marked on the map', () => <PinIcon />],
  ['terrain', 'Terrain', 'Paint the ground: grass, sand, rock, snow, water...', () => <WorldBrushIcon />],
  ['routes', 'Routes', 'Roads and rivers, from tile to tile', () => <WaysIcon />],
  ['scenery', 'Scenery', 'Forests, mountains, cities, castles... painted on tiles', () => <SceneryIcon />],
  ['features', 'Features', 'Towers, windmills, portals, birds, clouds... one at a time', () => <FeatureIcon />],
  ['images', 'Images', "The layer's pictures (over the painting)", () => <FrameIcon />],
]
const TITLES: Record<EntityTool, string> = { links: 'Links', tokens: 'Tokens', paths: 'Paths', regions: 'Regions', labels: 'Labels', images: 'Images', features: 'Features' }

export interface MapToolsOptions {
  map: LocationMap | null
  run: MapCommand
  /** The map editor: its own tools too (images, the painter), which preview changes on the map at once. */
  setMap?: (map: LocationMap) => void
  /** The tools work (the DM, with a map). */
  enabled: boolean
  /** Suggested resources to link (sub-locations). */
  favorites?: number[]
  onOpenLink?: (link: MapLink) => void
  /** More tools for a selected token (the Stage's). */
  tokenActions?: (token: MapToken) => ReactNode
  /** Esc with the Selection tool on (the Stage: back to Select from Move or Highlight). */
  onSelectionEscape?: () => boolean
}

export function useMapTools({ map, run, setMap, enabled, favorites, onOpenLink, tokenActions, onSelectionEscape }: MapToolsOptions) {
  const [tool, setTool] = useState<MapToolKey>('select')
  const on = (t: MapToolKey) => enabled && tool === t
  const fog = useFogTool({ map, run, active: on('fog') })
  const links = useLinksTool({ map, run, active: on('links'), favorites, onOpen: onOpenLink })
  const tokens = useTokensTool({ map, run, active: on('tokens') })
  const paths = usePathsTool({ map, run, active: on('paths') })
  const regions = useRegionsTool({ map, run, active: on('regions') })
  const labels = useLabelsTool({ map, run, active: on('labels') })
  const keep = setMap ?? (() => undefined)
  const images = usePicturesTool({ map, run, setMap: keep, active: on('images') })
  const pack = usePaintPack(map?.painter?.style ?? 'storybook', Boolean(setMap))
  const terrain = useTerrainTool({ map, run, setMap: keep, active: on('terrain'), pack })
  const routes = useRoutesTool({ map, run, setMap: keep, active: on('routes'), pack })
  const scenery = useSceneryTool({ map, run, setMap: keep, active: on('scenery'), pack })
  const features = useFeaturesTool({ map, run, active: on('features'), pack })
  // The ambience (daytime, weather): in the editor and on a Stage
  const ambience = useAmbienceTools({ map, run, setMap, enabled })
  const entities = { links, tokens, paths, regions, labels, images, features, terrain, routes, scenery }
  const current = tool === 'select' || tool === 'fog' ? null : entities[tool]

  /** A tool's button: opens it, or (open) steps back to Selection. */
  const pick = (t: MapToolKey) => setTool(t === tool ? 'select' : t)

  // Esc steps back (an open tray or window handles its own Esc first)
  const escape = useRef<() => void>(() => undefined)
  escape.current = () => {
    if (current?.escape()) return
    if (tool === 'select') onSelectionEscape?.()
    else setTool('select')
  }
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      if (document.querySelector('.popover, .modal')) return
      escape.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])

  const mapProps: Partial<MapViewProps> = !enabled ? {} : tool === 'fog' ? fog.mapProps : current?.mapProps ?? {}
  /** The tool takes the map's drags (painting, placing): the map doesn't pan with them. */
  const armed = enabled && (tool === 'fog' ? fog.armed : Boolean(current?.armed))
  return { tool, setTool, pick, fog, links, tokens, paths, regions, labels, images, terrain, routes, scenery, features, ambience, mapProps, armed, tokenActions,
    editor: Boolean(setMap) }
}

export type MapTools = ReturnType<typeof useMapTools>

/** The tool buttons (the Stage's menu row, the editor's first row). */
export function MapToolButtons({ tools, only }: { tools: MapTools; only?: MapToolKey[] }) {
  // The editor's own tools (images, the painter) after a line; on a Stage they're left out
  const shown = MAP_TOOLS.filter(([key]) => (!only || only.includes(key)) && (tools.editor || !EDITOR_TOOLS.includes(key)))
  const ambience = !only && tools.ambience.daytime
  return (
    <>
      {shown.filter(([key]) => !EDITOR_TOOLS.includes(key)).map(([key, name, hint, icon]) => (
        <span key={key} className="map-tool-slot">
          <ToolButton icon={icon()} label={name} title={`${name}: ${hint}${tools.tool === key && key !== 'select' ? ' (click again or Esc: close)' : ''}`}
            on={tools.tool === key} onClick={() => tools.pick(key)} className="map-tool-main" />
        </span>
      ))}
      {/* the ambience: in the editor and on a Stage (so it comes before the editor's own tools) */}
      {ambience && <><Sep />{tools.ambience.daytime}{tools.ambience.weather}</>}
      {shown.filter(([key]) => EDITOR_TOOLS.includes(key)).map(([key, name, hint, icon]) => (
        <span key={key} className="map-tool-slot">
          {key === 'terrain' && <Sep />}
          <ToolButton icon={icon()} label={name} title={`${name}: ${hint}${tools.tool === key && key !== 'select' ? ' (click again or Esc: close)' : ''}`}
            on={tools.tool === key} onClick={() => tools.pick(key)} className="map-tool-main" />
        </span>
      ))}
    </>
  )
}

/** The open tool's row. `selection`: the Selection tool's tools (the caller's). */
export function MapToolRow({ tools, selection }: { tools: MapTools; selection?: ReactNode }) {
  const { tool } = tools
  if (tool === 'select') return <>{selection}</>
  if (tool === 'fog') return <>{tools.fog.row}</>
  if (tool === 'terrain' || tool === 'routes' || tool === 'scenery') return <>{tools[tool].row}</>
  const t = tools[tool]
  return (
    <>
      <EntityHead kind={t.kind} title={TITLES[tool]} />
      {t.row}
      {tool === 'tokens' && tools.tokens.selectedToken && tools.tokenActions?.(tools.tokens.selectedToken)}
      {'extras' in t && t.extras}
    </>
  )
}
