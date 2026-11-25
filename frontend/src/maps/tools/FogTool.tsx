/**
 * Fog painting (the DM): on the map tools bar (plan 45), a state (Reveal V, Known K, Hide U), a brush ([ and ] change
 * its size) or a rectangle, and paint by dragging; reveal, know or hide everything. The stroke shows at once; it is
 * sent when the pointer is released. The editor's Fog tab (`panel`) turns the fog on and picks the member groups
 * painted for (the players by default; viewers see the players' fog). Shared by the location page and map Sets.
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

/** Groups the fog is painted for: not the viewers' (they see what players see). */
export const paintableGroups = (map: LocationMap) => (map.groups || []).filter((g) => g.key !== 'viewers')

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
              {paintableGroups(map).map((g) => {
                const on = targets.includes(g.id)
                return (
                  <button key={g.id} type="button" className={`chip ${on ? 'on' : ''}`}
                    onClick={() => setGroups(on ? targets.filter((x) => x !== g.id) : [...targets, g.id])}>{g.name}</button>
                )
              })}
            </div>
            <span className="muted small">Each member sees the best of their groups' fog (viewers: the players'). The map shows the fog of the groups picked here;
              paint it with the Fog tool on the bar over the map.</span>
          </div>
          <div className="fog-legend muted small">
            <span><i className="swatch-unknown" /> Unknown</span><span><i className="swatch-known" /> Known (grey)</span><span><i className="swatch-visible" /> Visible</span>
          </div>
        </>
      )}
    </div>
  )

  const off = !map?.fog.enabled || map.grid.type === 'none'
  const offHint = !map?.fog.enabled ? "Turn the fog on first (the editor's Fog tab)" : 'Fog is painted on tiles: pick a grid first'
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

  return { fog, panel, row, mapProps, targets, state, setState, brush, setBrush, armed: !off }
}
