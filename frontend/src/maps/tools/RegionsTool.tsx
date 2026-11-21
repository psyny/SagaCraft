/**
 * Regions (the DM): named sets of tiles (a kingdom, a forest, a district). Pick or create one, paint its tiles
 * (add or remove; brush or rectangle), and choose how it shows: its tiles filled, its border (along the tile
 * edges, or splined), or both; its name on the map; who sees it.
 */
import { useMemo, useState } from 'react'
import type { LocationMap, MapRegion, RegionLine, RegionShow } from '../../api/types'
import ColorPicker from '../../components/ColorPicker'
import Segmented from '../../components/Segmented'
import VisibilityPicker from '../../components/VisibilityPicker'
import { useSaga } from '../../saga/SagaContext'
import { tileKey, type Tile } from '../geometry'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import { useTileBrush } from './useTileBrush'

const SHOWS: [RegionShow, string][] = [['both', 'Fill and border'], ['fill', 'Fill'], ['border', 'Border']]
const LINES: [RegionLine, string][] = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]
const WIDTHS: [string, string][] = [['2', 'Thin'], ['4', 'Normal'], ['7', 'Bold'], ['12', 'Heavy']]

/** A region's tiles after a stroke: added or removed. */
export function paintRegion(tiles: Tile[], stroke: Tile[], mode: 'add' | 'remove'): Tile[] {
  const keys = new Set(stroke.map(tileKey))
  if (mode === 'remove') return tiles.filter((t) => !keys.has(tileKey(t)))
  const have = new Set(tiles.map(tileKey))
  const added: Tile[] = []
  for (const t of stroke) {
    if (have.has(tileKey(t))) continue
    have.add(tileKey(t))
    added.push(t)
  }
  return [...tiles, ...added]
}

/** The fill's opacity: shows while dragging, saved when released. */
function OpacitySlider({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? Math.round(value * 100)
  const commit = () => { if (draft !== null) { onSave(draft / 100); setDraft(null) } }
  return (
    <label className="slider">
      <span className="slider-head">Opacity <span className="muted">{shown}%</span></span>
      <input type="range" min={5} max={100} step={5} value={shown} onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </label>
  )
}

export function useRegionsTool({ map, run, active }: { map: LocationMap | null; run: MapCommand; active: boolean }) {
  const { saga } = useSaga()
  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const regions = map?.regions || []
  const region = regions.find((r) => r.id === selected) ?? null

  const save = async (changes: Partial<MapRegion>) => {
    const next = await run('regions.save', { region: { ...(region ? { id: region.id } : {}), ...changes } })
    if (next && !region) setSelected(next.regions[next.regions.length - 1]?.id ?? null)
  }

  const painter = useTileBrush({
    map, active: active && Boolean(region), enabled: Boolean(region),
    onStroke: (tiles) => (region ? save({ tiles: paintRegion(region.tiles, tiles, mode) }) : undefined),
  })
  const draft = useMemo(
    () => (region && painter.stroke.size ? { id: region.id, tiles: paintRegion(region.tiles, [...painter.stroke.values()], mode) } : null),
    [region, painter.stroke, mode],
  )

  const panel = map && (
    <div className="tool-panel">
      <div className="tool-head">
        <strong>Regions</strong>
        <button className="small" onClick={() => { setMode('add'); void save({ name: `Region ${regions.length + 1}`, tiles: [] }) }}>＋ New region</button>
      </div>
      {map.grid.type === 'none' && <p className="muted small">Regions are made of tiles: pick a grid first.</p>}
      {regions.length === 0 && <p className="muted small">A region is a named group of tiles: a kingdom, a forest, a district. Fill its tiles, outline them, or both.</p>}
      <div className="path-list">
        {regions.map((r) => (
          <button key={r.id} className={`path-row ${r.id === selected ? 'on' : ''}`} onClick={() => setSelected(r.id === selected ? null : r.id)}>
            <span className="color-dot" style={{ background: r.show === 'border' ? r.color : r.fill }} />
            <span>{r.name}</span>
            <span className="muted small">{r.tiles.length} tiles</span>
          </button>
        ))}
      </div>
      {region && (
        <div className="path-editor">
          <label>Name<input key={region.id} defaultValue={region.name} onBlur={(e) => e.target.value !== region.name && void save({ name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /></label>
          <div className="field">
            <span className="field-label">Paint tiles</span>
            <Segmented value={mode} options={[['add', '＋ Add'], ['remove', '− Remove']]} onChange={setMode} />
            <span className="muted small">Drag on the map. Right drag (or Space) pans.</span>
          </div>
          {painter.controls}
          <button className="small ghost" disabled={!region.tiles.length}
            onClick={() => window.confirm(`Remove every tile from "${region.name}"?`) && void save({ tiles: [] })}>Clear tiles</button>
          <div className="field"><span className="field-label">Show</span><Segmented value={region.show} options={SHOWS} onChange={(show) => void save({ show })} /></div>
          {region.show !== 'border' && (
            <div className="grid-2">
              <div className="field"><span className="field-label">Fill</span><ColorPicker label="Fill color" value={region.fill} onChange={(fill) => void save({ fill })} /></div>
              <OpacitySlider value={region.opacity} onSave={(opacity) => void save({ opacity })} />
            </div>
          )}
          {region.show !== 'fill' && (
            <>
              <div className="field"><span className="field-label">Border</span><ColorPicker label="Border color" value={region.color} onChange={(color) => void save({ color })} /></div>
              <div className="field"><span className="field-label">Width</span>
                <Segmented<string> value={String(region.width)} options={WIDTHS} onChange={(w) => void save({ width: Number(w) })} />
              </div>
              <div className="field"><span className="field-label">Line</span><Segmented value={region.line} options={LINES} onChange={(line) => void save({ line })} /></div>
            </>
          )}
          <div className="field"><span className="field-label">Shape</span>
            <Segmented value={region.render} options={[['spline', 'Spline (smooth)'], ['poly', 'Tile edges']]} onChange={(render) => void save({ render })} />
          </div>
          <label className="check"><input type="checkbox" checked={region.label} onChange={(e) => void save({ label: e.target.checked })} /> Show its name on the map</label>
          <div className="field">
            <span className="field-label">Who sees it</span>
            <VisibilityPicker value={region.visibility || { groups: [], members: [] }} groups={saga.groups} members={saga.members}
              emptyLabel="Hidden (admins only)" onChange={(visibility) => void save({ visibility })} />
          </div>
          <button className="small ghost danger" onClick={() => {
            if (!window.confirm(`Delete the region "${region.name}"?`)) return
            setSelected(null)
            void run('regions.delete', { id: region.id })
          }}>Delete region</button>
        </div>
      )}
    </div>
  )

  const mapProps: Partial<MapViewProps> = active && map ? {
    ...(region ? { onTile: painter.onTile } : {}),
    overlay: {
      activeRegionId: selected,
      regionDraft: draft,
      preview: region ? { tiles: painter.hover, tone: mode === 'add' ? 'select' : 'unknown' } : undefined,
    },
  } : {}
  return { panel, mapProps }
}
