/**
 * Movement (the DM, plan 59): what tiles cost to move into, on the map tools bar: **Normal** (1: clears), **Double**,
 * **Blocked**, or **Other** (plan 60: a slider, 1× to 10× by halves), painted with the brush ([ and ] change its size)
 * or a rectangle. Planned moves go around blocked
 * tiles and count the others' cost (stage/sets/maps/MovePlanner.ts). Shared by the location page and map Sets.
 */
import { useState } from 'react'
import type { LocationMap, MoveCost } from '../../api/types'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import Popover, { anchorOf, type Anchor } from '../../components/Popover'
import { Sep } from '../toolbar/widgets'
import { BrushTools, useTileBrush } from './useTileBrush'

type Paint = MoveCost | 1
const COSTS: [Paint, string, string][] = [
  [1, 'Normal', 'The usual cost (1)'],
  [2, 'Double', 'Moving into these tiles counts 2 (difficult terrain)'],
  ['x', 'Blocked', 'Nothing moves into these tiles (walls, chasms): routes go around'],
]

/** "Other": any cost from 1× to 10× by halves, on a slider that drops down (plan 60). */
function OtherCost({ cost, onPick, disabled }: { cost: Paint; onPick: (cost: number) => void; disabled: boolean }) {
  const [menu, setMenu] = useState<Anchor | null>(null)
  const other = typeof cost === 'number' && cost !== 1 && cost !== 2
  const [value, setValue] = useState(other ? cost : 1.5)
  return (
    <>
      <button type="button" className={`map-tool with-text move-cost-pick cost-other ${other ? 'on' : ''}`} aria-pressed={other} aria-haspopup="dialog"
        disabled={disabled} title="Another cost: 1× to 10×, by halves" onClick={(e) => { if (!menu) onPick(value); setMenu(menu ? null : anchorOf(e.currentTarget)) }}>
        <span className="move-cost-swatch" />{other ? `${cost}×` : 'Other'} ▾
      </button>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <div className="move-cost-slider">
            <span className="field-label">Moving in counts <strong>{value}×</strong></span>
            <input type="range" min={1} max={10} step={0.5} value={value} aria-label="Movement cost" autoFocus
              onChange={(e) => { const v = Number(e.target.value); setValue(v); onPick(v) }} />
            <span className="muted small">1× is the usual; a route counts each tile's cost.</span>
          </div>
        </Popover>
      )}
    </>
  )
}

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
      <OtherCost cost={cost} disabled={off} onPick={setCost} />
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
