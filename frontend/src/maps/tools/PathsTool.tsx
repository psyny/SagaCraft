/**
 * Paths (the DM): tiles in order (a journey, a treasure trail, instructions). Pick or create a path, then
 * "Draw" and click tiles in order (click the last tile again to remove it). Its look: colour, width, body
 * (solid, dashed, dotted, arrows, arrowheads), head and tail (none, arrow, circle), poly or spline; who sees it.
 */
import { useState } from 'react'
import type { LocationMap, MapPath, PathBody, PathEnd } from '../../api/types'
import ColorPicker from '../../components/ColorPicker'
import Segmented from '../../components/Segmented'
import VisibilityPicker from '../../components/VisibilityPicker'
import { useSaga } from '../../saga/SagaContext'
import { inGrid, type Tile } from '../geometry'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'

const BODIES: [PathBody, string][] = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['arrows', 'Arrows'], ['arrowheads', 'Arrowheads']]
const ENDS: [PathEnd, string][] = [['none', 'None'], ['arrow', 'Arrow'], ['circle', 'Circle']]

export function usePathsTool({ map, run, active }: { map: LocationMap | null; run: MapCommand; active: boolean }) {
  const { saga } = useSaga()
  const [selected, setSelected] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const path = map?.paths.find((p) => p.id === selected) ?? null

  const save = async (changes: Partial<MapPath>) => {
    const next = await run('paths.save', { path: { ...(path ? { id: path.id } : {}), ...changes } })
    if (next && !path) setSelected(next.paths[next.paths.length - 1]?.id ?? null)
  }

  const onTile: MapViewProps['onTile'] = (phase, tile) => {
    if (phase !== 'down' || !map || !path || !inGrid(map.grid, tile)) return
    const last = path.tiles[path.tiles.length - 1]
    const tiles: Tile[] = last && last[0] === tile[0] && last[1] === tile[1] ? path.tiles.slice(0, -1) : [...path.tiles, tile]
    void save({ tiles })
  }

  const panel = map && (
    <div className="tool-panel">
      <div className="tool-head">
        <strong>Paths</strong>
        <button className="small" onClick={() => { setDrawing(true); void save({ name: `Path ${map.paths.length + 1}`, tiles: [] }) }}>＋ New path</button>
      </div>
      {map.paths.length === 0 && <p className="muted small">A path is tiles in order: the party's journey, a treasure trail.</p>}
      <div className="path-list">
        {map.paths.map((p) => (
          <button key={p.id} className={`path-row ${p.id === selected ? 'on' : ''}`} onClick={() => { setSelected(p.id === selected ? null : p.id); setDrawing(false) }}>
            <span className="color-dot" style={{ background: p.color }} />
            <span>{p.name}</span>
            <span className="muted small">{p.tiles.length} tiles</span>
          </button>
        ))}
      </div>
      {path && (
        <div className="path-editor">
          <label>Name<input key={path.id} defaultValue={path.name} onBlur={(e) => e.target.value !== path.name && void save({ name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /></label>
          <div className="button-row">
            <button className={drawing ? 'primary' : ''} onClick={() => setDrawing(!drawing)}>{drawing ? '✎ Drawing: click tiles' : '✎ Draw'}</button>
            <button className="small" disabled={!path.tiles.length} onClick={() => void save({ tiles: path.tiles.slice(0, -1) })}>Undo last tile</button>
            <button className="small" disabled={path.tiles.length < 2} onClick={() => void save({ tiles: [...path.tiles].reverse() })}>Reverse</button>
            <button className="small ghost" disabled={!path.tiles.length} onClick={() => void save({ tiles: [] })}>Clear</button>
          </div>
          <div className="field"><span className="field-label">Color</span><ColorPicker label="Path color" value={path.color} onChange={(color) => void save({ color })} /></div>
          <div className="field"><span className="field-label">Width</span>
            <Segmented<string> value={String(path.width)} options={[['2', 'Thin'], ['4', 'Normal'], ['7', 'Bold'], ['12', 'Heavy']]}
              onChange={(w) => void save({ width: Number(w) })} />
          </div>
          <div className="field"><span className="field-label">Line</span><Segmented value={path.body} options={BODIES} onChange={(body) => void save({ body })} /></div>
          <div className="field"><span className="field-label">Shape</span>
            <Segmented value={path.render} options={[['spline', 'Spline (curves)'], ['poly', 'Poly (straight)']]} onChange={(render) => void save({ render })} />
          </div>
          <div className="grid-2">
            <div className="field"><span className="field-label">Tail (start)</span><Segmented value={path.tail} options={ENDS} onChange={(tail) => void save({ tail })} /></div>
            <div className="field"><span className="field-label">Head (end)</span><Segmented value={path.head} options={ENDS} onChange={(head) => void save({ head })} /></div>
          </div>
          <div className="field">
            <span className="field-label">Who sees it</span>
            <VisibilityPicker value={path.visibility || { groups: [], members: [] }} groups={saga.groups} members={saga.members}
              emptyLabel="Hidden (admins only)" onChange={(visibility) => void save({ visibility })} />
          </div>
          <button className="small ghost danger" onClick={() => {
            if (!window.confirm(`Delete the path "${path.name}"?`)) return
            setSelected(null)
            void run('paths.delete', { id: path.id })
          }}>Delete path</button>
        </div>
      )}
    </div>
  )

  const mapProps: Partial<MapViewProps> = active && map ? {
    ...(drawing && path ? { onTile } : {}),
    overlay: { activePathId: selected, preview: path ? { tiles: path.tiles, tone: 'select' as const } : undefined },
  } : {}
  return { panel, mapProps }
}
