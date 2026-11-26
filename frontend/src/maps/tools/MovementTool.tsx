/**
 * Movement (the DM, plan 59): what tiles cost to move into, on the map tools bar: **Blocked**, **Cost 3**, **Cost 2** or
 * **Usual** (1: clears), painted with the brush ([ and ] change its size) or a rectangle. Planned moves go around blocked
 * tiles and count the others' cost (stage/sets/maps/MovePlanner.ts). Shared by the location page and map Sets.
 */
import { useState } from 'react'
import type { LocationMap, MoveCost } from '../../api/types'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import { Sep } from '../toolbar/widgets'
import { BrushTools, useTileBrush } from './useTileBrush'

type Paint = MoveCost | 1
const COSTS: [Paint, string, string][] = [
  ['x', 'Blocked', "Nothing moves into these tiles (walls, chasms): routes go around"],
  [3, 'Cost 3', 'Moving into these tiles counts 3 (deep water, rubble)'],
  [2, 'Cost 2', 'Moving into these tiles counts 2 (difficult terrain)'],
  [1, 'Usual', 'Back to the usual cost (1)'],
]

export function useMovementTool({ map, run, active }: { map: LocationMap | null; run: MapCommand; active: boolean }) {
  const [cost, setCost] = useState<Paint>('x')
  const off = !map || map.grid.type === 'none'
  const painter = useTileBrush({ map, active, enabled: !off, onStroke: (tiles) => run('moves.paint', { tiles, cost }) })
  const row = map && (
    <>
      {COSTS.map(([value, label, hint]) => (
        <button key={String(value)} type="button" className={`map-tool with-text move-cost-pick cost-${value} ${cost === value ? 'on' : ''}`} aria-pressed={cost === value}
          title={off ? 'Pick a grid first' : hint} disabled={off} onClick={() => setCost(value)}>
          <span className="move-cost-swatch" />{label}
        </button>
      ))}
      <BrushTools painter={painter} disabled={off} />
      <Sep />
      <span className="map-tool-hint">Planned moves go around blocked tiles and count each tile's cost.</span>
    </>
  )
  const mapProps: Partial<MapViewProps> = active && !off
    ? { onTile: painter.onTile, overlay: { costs: true, preview: { tiles: painter.hover, tone: cost === 'x' ? 'unknown' : cost === 1 ? 'visible' : 'known' } } }
    : {}
  return { row, mapProps, armed: !off }
}
