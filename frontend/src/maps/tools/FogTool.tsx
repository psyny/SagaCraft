/**
 * Fog painting (the DM): on the map tools bar (plan 45), a state (Reveal V, Known K, Hide U), a brush ([ and ] change
 * its size) or a rectangle, and paint by dragging; reveal, know or hide everything. Always the players' fog (viewers
 * see what players see; plan 46). The stroke shows at once; it is sent when the pointer is released. The editor's Grid
 * tab turns the fog on. Shared by the location page and map Sets.
 */
import { useEffect, useMemo, useState } from 'react'
import type { FogState, LocationMap } from '../../api/types'
import { mergeFog, tileIndex } from '../geometry'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import { CloudIcon, MoonIcon, SunIcon } from '../toolbar/icons'
import { Sep, ToolButton } from '../toolbar/widgets'
import { BrushTools, useTileBrush } from './useTileBrush'

export const FOG_LABELS: [FogState, string][] = [['2', 'Visible'], ['1', 'Known'], ['0', 'Unknown']]
const TONES: Record<FogState, 'visible' | 'known' | 'unknown'> = { 2: 'visible', 1: 'known', 0: 'unknown' }

/** Groups painted for by default: the players' group (viewers see the players' fog). */
export const defaultFogGroups = (map: LocationMap) =>
  (map.groups || []).filter((g) => g.key === 'players').map((g) => g.id)


/** The fog the DM sees for some groups (best state over them); null when the fog is off. */
export function fogFor(map: LocationMap, groupIds: number[]): Uint8Array | null {
  if (!map.fog.enabled) return null
  const count = map.grid.cols * map.grid.rows
  if (map.fog.states) return mergeFog([map.fog.states], count)
  const layers = groupIds.map((g) => map.fog.layers?.[String(g)])
  return mergeFog(layers.some(Boolean) ? layers : [], count)
}

export interface FogToolOptions {
  map: LocationMap | null
  run: MapCommand
  active: boolean
}

export function useFogTool({ map, run, active }: FogToolOptions) {
  const [state, setState] = useState<FogState>('2')
  // Always the players' fog (viewers see what players see)
  const targets = useMemo(() => (map ? defaultFogGroups(map) : []), [map])
  const painter = useTileBrush({
    map, active, enabled: Boolean(map?.fog.enabled),
    onStroke: (tiles) => (targets.length ? run('fog.paint', { group_ids: targets, state, tiles }) : undefined),
  })
  const { stroke, brush, setBrush } = painter

  // Keyboard: V K U for the state ([ ] for the brush size: the brush's own)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      const key = e.key.toLowerCase()
      if (key === 'v') setState('2')
      else if (key === 'k') setState('1')
      else if (key === 'u') setState('0')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const fog = useMemo(() => {
    if (!map) return null
    const base = fogFor(map, targets)
    if (!base || !stroke.size) return base
    const preview = base.slice()
    const value = Number(state)
    stroke.forEach((t) => { preview[tileIndex(map.grid, t)] = value })
    return preview
  }, [map, targets, stroke, state])

  const off = !map?.fog.enabled || map.grid.type === 'none'
  const offHint = !map?.fog.enabled ? "Turn the fog of war on first (the editor's Grid tab)" : 'Fog is painted on tiles: pick a grid first'
  const fill = (to: FogState) => void run('fog.fill', { group_ids: targets, state: to })
  const row = map && (
    <>
      <ToolButton icon={<SunIcon />} label="Reveal (V)" text="Reveal" title={off ? offHint : 'Paint tiles players see (V)'} on={state === '2'} disabled={off} onClick={() => setState('2')} />
      <ToolButton icon={<MoonIcon />} label="Known (K)" text="Known" title={off ? offHint : 'Paint tiles players know, dimmed (K)'} on={state === '1'} disabled={off} onClick={() => setState('1')} />
      <ToolButton icon={<CloudIcon dark />} label="Hide (U)" text="Hide" title={off ? offHint : "Paint tiles players don't see (U)"} on={state === '0'} disabled={off} onClick={() => setState('0')} />
      <BrushTools painter={painter} disabled={off} />
      <Sep />
      <button type="button" className="map-tool with-text" disabled={off} onClick={() => fill('2')}>Reveal all</button>
      <button type="button" className="map-tool with-text" disabled={off} onClick={() => fill('1')}>All known</button>
      <button type="button" className="map-tool with-text" disabled={off}
        onClick={() => window.confirm('Hide the whole map from players?') && fill('0')}>Hide all</button>
      {off && <span className="map-tool-hint">{offHint}</span>}
    </>
  )

  const mapProps: Partial<MapViewProps> = active && map?.fog.enabled
    ? { onTile: painter.onTile, overlay: { preview: { tiles: painter.hover, tone: TONES[state] } } }
    : {}

  return { fog, row, mapProps, targets, state, setState, brush, setBrush, armed: !off }
}
