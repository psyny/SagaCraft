/**
 * Fog painting (the DM): pick the member groups painted for (players and viewers by default), a state
 * (Visible V, Known K, Unknown U), a brush ([ and ] change its size) or a rectangle, and paint by dragging.
 * The stroke shows at once; it is sent when the pointer is released. Shared by the location page and map Sets.
 */
import { useEffect, useMemo, useState } from 'react'
import type { FogState, LocationMap } from '../../api/types'
import Segmented from '../../components/Segmented'
import { mergeFog, tileIndex } from '../geometry'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import { useTileBrush } from './useTileBrush'

export const FOG_LABELS: [FogState, string][] = [['2', 'Visible'], ['1', 'Known'], ['0', 'Unknown']]
const TONES: Record<FogState, 'visible' | 'known' | 'unknown'> = { 2: 'visible', 1: 'known', 0: 'unknown' }

/** Groups painted for by default: the default players' and viewers' groups. */
export const defaultFogGroups = (map: LocationMap) =>
  (map.groups || []).filter((g) => g.key === 'players' || g.key === 'viewers').map((g) => g.id)

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
  const [groups, setGroups] = useState<number[] | null>(null)
  const [state, setState] = useState<FogState>('2')
  const targets = groups ?? (map ? defaultFogGroups(map) : [])
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

  const panel = map && (
    <div className="tool-panel">
      <label className="check">
        <input type="checkbox" checked={map.fog.enabled} onChange={(e) => void run('fog.set', { enabled: e.target.checked })} />
        Fog of war
      </label>
      {!map.fog.enabled && <p className="muted small">Off: everyone who sees the map sees all of it.</p>}
      {map.fog.enabled && map.grid.type === 'none' && <p className="muted small">Fog is painted on tiles: pick a grid first.</p>}
      {map.fog.enabled && (
        <>
          <div className="field">
            <span className="field-label">Paint for</span>
            <div className="chips">
              {(map.groups || []).map((g) => {
                const on = targets.includes(g.id)
                return (
                  <button key={g.id} type="button" className={`chip ${on ? 'on' : ''}`}
                    onClick={() => setGroups(on ? targets.filter((x) => x !== g.id) : [...targets, g.id])}>{g.name}</button>
                )
              })}
            </div>
            <span className="muted small">Each member sees the best of their groups' fog. The map shows the fog of the groups picked here.</span>
          </div>
          <div className="field">
            <span className="field-label">Paint <span className="muted">(V K U)</span></span>
            <Segmented<FogState> value={state} options={FOG_LABELS} onChange={setState} />
          </div>
          {painter.controls}
          <div className="button-row">
            <button className="small" onClick={() => void run('fog.fill', { group_ids: targets, state: '2' })}>Reveal all</button>
            <button className="small" onClick={() => void run('fog.fill', { group_ids: targets, state: '1' })}>All known</button>
            <button className="small" onClick={() => window.confirm('Hide the whole map from these groups?') && void run('fog.fill', { group_ids: targets, state: '0' })}>Hide all</button>
          </div>
          <div className="fog-legend muted small">
            <span><i className="swatch-unknown" /> Unknown</span><span><i className="swatch-known" /> Known (grey)</span><span><i className="swatch-visible" /> Visible</span>
          </div>
        </>
      )}
    </div>
  )

  const mapProps: Partial<MapViewProps> = active && map?.fog.enabled
    ? { onTile: painter.onTile, overlay: { preview: { tiles: painter.hover, tone: TONES[state] } } }
    : {}

  return { fog, panel, mapProps, targets, state, setState, brush, setBrush }
}
