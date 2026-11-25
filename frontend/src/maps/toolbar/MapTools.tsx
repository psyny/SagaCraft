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
import { ArrowIcon, ChainIcon, CloudIcon, FigureIcon, FlagIcon, PinIcon, RoadIcon } from './icons'
import { EntityHead, ToolButton } from './widgets'

export type MapToolKey = 'select' | 'fog' | 'links' | 'tokens' | 'paths' | 'regions' | 'labels'
type EntityTool = Exclude<MapToolKey, 'select' | 'fog'>

export const MAP_TOOLS: [MapToolKey, string, string, () => JSX.Element][] = [
  ['select', 'Selection', 'Select, move tokens', () => <ArrowIcon />],
  ['fog', 'Fog', 'Reveal, known, hide: paint the fog', () => <CloudIcon />],
  ['links', 'Links', 'Characters, items and places on tiles', () => <ChainIcon />],
  ['tokens', 'Tokens', 'Mobile tokens: characters, items, groups, custom', () => <FigureIcon />],
  ['paths', 'Paths', 'Tiles in order: a journey, a trail', () => <RoadIcon />],
  ['regions', 'Regions', 'Named groups of tiles: a kingdom, a forest', () => <FlagIcon />],
  ['labels', 'Labels', 'Places marked on the map', () => <PinIcon />],
]
const TITLES: Record<EntityTool, string> = { links: 'Links', tokens: 'Tokens', paths: 'Paths', regions: 'Regions', labels: 'Labels' }

export interface MapToolsOptions {
  map: LocationMap | null
  run: MapCommand
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

export function useMapTools({ map, run, enabled, favorites, onOpenLink, tokenActions, onSelectionEscape }: MapToolsOptions) {
  const [tool, setTool] = useState<MapToolKey>('select')
  const on = (t: MapToolKey) => enabled && tool === t
  const fog = useFogTool({ map, run, active: on('fog') })
  const links = useLinksTool({ map, run, active: on('links'), favorites, onOpen: onOpenLink })
  const tokens = useTokensTool({ map, run, active: on('tokens') })
  const paths = usePathsTool({ map, run, active: on('paths') })
  const regions = useRegionsTool({ map, run, active: on('regions') })
  const labels = useLabelsTool({ map, run, active: on('labels') })
  const entities = { links, tokens, paths, regions, labels }
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
  return { tool, setTool, pick, fog, links, tokens, paths, regions, labels, mapProps, armed, tokenActions }
}

export type MapTools = ReturnType<typeof useMapTools>

/** The tool buttons (the Stage's menu row, the editor's first row). */
export function MapToolButtons({ tools, only }: { tools: MapTools; only?: MapToolKey[] }) {
  return (
    <>
      {MAP_TOOLS.filter(([key]) => !only || only.includes(key)).map(([key, name, hint, icon]) => (
        <ToolButton key={key} icon={icon()} label={name} title={`${name}: ${hint}${tools.tool === key && key !== 'select' ? ' (click again or Esc: close)' : ''}`}
          on={tools.tool === key} onClick={() => tools.pick(key)} className="map-tool-main" />
      ))}
    </>
  )
}

/** The open tool's row. `selection`: the Selection tool's tools (the caller's). */
export function MapToolRow({ tools, selection }: { tools: MapTools; selection?: ReactNode }) {
  const { tool } = tools
  if (tool === 'select') return <>{selection}</>
  if (tool === 'fog') return <>{tools.fog.row}</>
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
