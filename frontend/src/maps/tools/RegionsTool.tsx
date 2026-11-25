/**
 * Regions (the DM, plan 45): named sets of tiles (a kingdom, a forest, a district), on the map tools bar. ＋ adds one,
 * selected and ready to paint. The selected region's tools: paint its tiles (add or remove; brush or rectangle),
 * clear; how it shows (its tiles filled, its border, or both), fill colour and opacity, border colour, width and
 * line, shape (along the tile edges, or smooth), its name on the map. With none selected, a click on a tile picks
 * the region there.
 */
import { useMemo, useState } from 'react'
import type { LocationMap, MapRegion, RegionLine, RegionShow } from '../../api/types'
import { tileKey, type Tile } from '../geometry'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import { EraserIcon, MinusIcon, PlusIcon } from '../toolbar/icons'
import { ColorTool, eyeVisibility, isHidden, MenuTool, Sep, SliderTool, ToolButton, type EntityKind } from '../toolbar/widgets'
import { WIDTHS, widthKey } from './PathsTool'
import { BrushTools, useTileBrush } from './useTileBrush'

const SHOWS: [RegionShow, string][] = [['both', 'Fill and border'], ['fill', 'Fill'], ['border', 'Border']]
const LINES: [RegionLine, string][] = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]

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

export function useRegionsTool({ map, run, active }: { map: LocationMap | null; run: MapCommand; active: boolean }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const regions = map?.regions || []
  const region = regions.find((r) => r.id === selected) ?? null

  const save = (changes: Partial<MapRegion>, id: string | null = selected) => run('regions.save', { region: { ...(id ? { id } : {}), ...changes } })
  const select = (id: string | null) => { setSelected(id); setMode('add') }

  const painter = useTileBrush({
    map, active: active && Boolean(region), enabled: Boolean(region),
    onStroke: (tiles) => (region ? save({ tiles: paintRegion(region.tiles, tiles, mode) }) : undefined),
  })
  const draft = useMemo(
    () => (region && painter.stroke.size ? { id: region.id, tiles: paintRegion(region.tiles, [...painter.stroke.values()], mode) } : null),
    [region, painter.stroke, mode],
  )
  // None selected: a click picks the region on that tile (the topmost)
  const pickAt: MapViewProps['onTile'] = (phase, tile) => {
    if (phase !== 'down') return
    const hit = [...regions].reverse().find((r) => r.tiles.some((t) => t[0] === tile[0] && t[1] === tile[1]))
    if (hit) select(hit.id)
  }

  const kind: EntityKind = {
    noun: 'region',
    items: regions.map((r) => ({
      id: r.id, name: r.name, hidden: isHidden(r.visibility), renamable: true, note: `${r.tiles.length} tiles`,
      mark: <span className="color-dot" style={{ background: r.show === 'border' ? r.color : r.fill }} />,
    })),
    selected,
    select,
    add: () => void run('regions.save', { region: { name: `Region ${regions.length + 1}`, tiles: [] } }).then((next) => {
      const made = next?.regions[next.regions.length - 1]
      if (made) select(made.id)
    }),
    setHidden: (id, hidden) => void save({ visibility: eyeVisibility(map?.groups, hidden) }, id),
    rename: (id, name) => void save({ name }, id),
    remove: (id) => { if (id === selected) select(null); void run('regions.delete', { id }) },
    empty: map?.grid.type === 'none' ? 'Regions are made of tiles: pick a grid first.' : 'A region is a named group of tiles: a kingdom, a forest, a district. ＋ adds one.',
  }

  const row = region && (
    <>
      <ToolButton icon={<PlusIcon />} label="Paint: add tiles" text="Add" on={mode === 'add'} onClick={() => setMode('add')} />
      <ToolButton icon={<MinusIcon />} label="Paint: remove tiles" text="Remove" on={mode === 'remove'} onClick={() => setMode('remove')} />
      <BrushTools painter={painter} />
      <ToolButton icon={<EraserIcon />} label="Clear its tiles" disabled={!region.tiles.length}
        onClick={() => window.confirm(`Remove every tile from "${region.name}"?`) && void save({ tiles: [] })} />
      <Sep />
      <MenuTool label="Show" value={region.show} options={SHOWS} onChange={(show) => void save({ show })} />
      {region.show !== 'border' && (
        <>
          <ColorTool label="Fill" value={region.fill} onChange={(fill) => void save({ fill })} />
          <SliderTool key={region.id} label="Opacity" value={Math.round(region.opacity * 100)} min={5} max={100} step={5} onSave={(v) => void save({ opacity: v / 100 })} />
        </>
      )}
      {region.show !== 'fill' && (
        <>
          <ColorTool label="Border" value={region.color} onChange={(color) => void save({ color })} />
          <MenuTool label="Width" value={widthKey(region.width)} options={WIDTHS} onChange={(w) => void save({ width: Number(w) })} />
          <MenuTool label="Line" value={region.line} options={LINES} onChange={(line) => void save({ line })} />
        </>
      )}
      <MenuTool label="Shape" value={region.render} options={[['spline', 'Smooth'], ['poly', 'Tile edges']] as const} onChange={(render) => void save({ render })} />
      <ToolButton icon={<span className="map-tool-glyph">Aa</span>} label="Its name on the map" text="Name" on={region.label}
        title={region.label ? 'Its name shows on the map: click to hide it' : 'Show its name on the map'} onClick={() => void save({ label: !region.label })} />
    </>
  )

  const mapProps: Partial<MapViewProps> = active && map ? {
    onTile: region ? painter.onTile : pickAt,
    overlay: {
      activeRegionId: selected,
      regionDraft: draft,
      preview: region ? { tiles: painter.hover, tone: mode === 'add' ? 'select' : 'unknown' } : undefined,
    },
  } : {}
  return {
    kind, row, mapProps, armed: Boolean(region),
    escape: () => { if (!selected) return false; select(null); return true },
  }
}
