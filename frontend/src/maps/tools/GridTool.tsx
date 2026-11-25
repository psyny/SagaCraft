/**
 * The grid (the DM; maps are grid first, plan 46): none, square or hex; the tile size (previewed live, saved on
 * release); how many tiles across (X) and down (Y); the fog of war on or off (painted for the players with the Fog
 * tool); the tile's physical size; how lines look (contrast by default, a colour or inverse; opacity; width). The
 * pictures are placed and sized on the grid, never the other way round. Resizing keeps everything on its tile,
 * counted from the top left; tiles are added or dropped at the last ones.
 */
import { useEffect, useRef, useState } from 'react'
import type { GridMode, GridType, LocationMap, MapGrid } from '../../api/types'
import ColorPicker from '../../components/ColorPicker'
import Segmented from '../../components/Segmented'
import type { MapCommand } from '../useLocationMap'

/** A slider previewed on the map while dragged, saved when released. */
function GridSlider({ map, setMap, run, field, label, min, max, step = 1, unit = '' }: {
  map: LocationMap
  setMap: (map: LocationMap) => void
  run: MapCommand
  field: keyof MapGrid
  label: string
  min: number
  max: number
  step?: number
  unit?: string
}) {
  const saved = Number(map.grid[field])
  const [value, setValue] = useState(saved)
  const start = useRef<number | null>(null)
  useEffect(() => setValue(saved), [saved])
  const commit = () => {
    if (start.current !== null && value !== start.current) void run('grid.set', { changes: { [field]: value } })
    start.current = null
  }
  return (
    <label className="slider">
      <span className="slider-head">{label} <span className="muted">{value}{unit}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={(e) => {
          if (start.current === null) start.current = saved
          const next = Number(e.target.value)
          setValue(next)
          setMap({ ...map, grid: { ...map.grid, [field]: next } })
        }}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </label>
  )
}

export function GridPanel({ map, run, setMap }: { map: LocationMap; run: MapCommand; setMap: (map: LocationMap) => void }) {
  const grid = map.grid
  const set = (changes: Partial<MapGrid>) => void run('grid.set', { changes })
  const number = (field: 'cols' | 'rows', label: string) => (
    <label className="inline">{label}
      <input type="number" min={1} max={400} defaultValue={grid[field]} key={`${field}-${grid[field]}`}
        onBlur={(e) => Number(e.target.value) !== grid[field] && set({ [field]: Number(e.target.value) })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  )
  return (
    <div className="tool-panel">
      <div className="field">
        <span className="field-label">Grid</span>
        <Segmented<GridType> value={grid.type} options={[['square', 'Square'], ['hex', 'Hex'], ['none', 'None']]} onChange={(type) => set({ type })} />
      </div>
      {grid.type !== 'none' && (
        <>
          <GridSlider map={map} setMap={setMap} run={run} field="size" label="Tile size" min={8} max={400} unit=" px" />
          <div className="field">
            <span className="field-label">Tiles <span className="muted">{grid.cols} × {grid.rows}</span></span>
            <div className="grid-2">{number('cols', 'Tiles X')}{number('rows', 'Tiles Y')}</div>
          </div>
          <label className="check">
            <input type="checkbox" checked={map.fog.enabled} onChange={(e) => void run('fog.set', { enabled: e.target.checked })} />
            Fog of war <span className="muted small">(paint it for the players with the Fog tool over the map)</span>
          </label>
          <div className="field">
            <span className="field-label">One tile is</span>
            <div className="grid-2">
              <input type="number" min={0} step="any" defaultValue={grid.unit_size} key={`u-${grid.unit_size}`} aria-label="Physical size"
                onBlur={(e) => Number(e.target.value) !== grid.unit_size && set({ unit_size: Number(e.target.value) })} />
              <input defaultValue={grid.unit} key={`n-${grid.unit}`} aria-label="Unit" placeholder="ft, m, miles, days"
                onBlur={(e) => e.target.value !== grid.unit && set({ unit: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <span className="field-label">Lines</span>
            <Segmented<GridMode> value={grid.mode} options={[['color', 'A color'], ['contrast', 'Contrast'], ['inverse', 'Inverse']]} onChange={(mode) => set({ mode })} />
            {grid.mode === 'color' && <ColorPicker label="Grid color" value={grid.color} onChange={(color) => set({ color })} />}
            <span className="muted small">
              {grid.mode === 'contrast' ? 'Black or white at each pixel, against the map under it.' : grid.mode === 'inverse' ? 'The inverse of the map’s colour at each pixel.' : ''}
            </span>
          </div>
          <GridSlider map={map} setMap={setMap} run={run} field="opacity" label="Opacity" min={0} max={1} step={0.05} />
          <GridSlider map={map} setMap={setMap} run={run} field="line" label="Line width" min={0.5} max={6} step={0.5} unit=" px" />
        </>
      )}
    </div>
  )
}
