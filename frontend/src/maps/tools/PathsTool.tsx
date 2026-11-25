/**
 * Paths (the DM, plan 45): tiles in order (a journey, a treasure trail, instructions), on the map tools bar. ＋ adds
 * one and starts drawing it: click tiles in order (click the last tile again to remove it). With no path drawing, a
 * click on a tile picks the path through it. The selected path's tools: draw, undo, reverse, clear; its colour,
 * width, line (solid, dashed, dotted, arrows, arrowheads), shape (spline or poly), tail and head (none, arrow,
 * circle), and its progress (how much of it is shown: players get only that part).
 */
import { useState } from 'react'
import type { LocationMap, MapPath, PathBody, PathEnd } from '../../api/types'
import { inGrid, type Tile } from '../geometry'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import { EraserIcon, PencilIcon, ReverseIcon, UndoIcon } from '../toolbar/icons'
import { ColorTool, eyeVisibility, isHidden, MenuTool, Sep, SliderTool, ToolButton, type EntityKind } from '../toolbar/widgets'

export const BODIES: [PathBody, string][] = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['arrows', 'Arrows'], ['arrowheads', 'Arrowheads']]
export const ENDS: [PathEnd, string][] = [['none', 'None'], ['arrow', 'Arrow'], ['circle', 'Circle']]
/** Line widths (paths, region borders): Normal is the default. Older widths show as the nearest. */
export const WIDTHS: [string, string][] = [['4', 'Thin'], ['7', 'Normal'], ['12', 'Bold']]
export const widthKey = (w: number) => (w <= 5 ? '4' : w <= 9 ? '7' : '12')

export function usePathsTool({ map, run, active }: { map: LocationMap | null; run: MapCommand; active: boolean }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [shownDraft, setShownDraft] = useState<number | null>(null)
  const paths = map?.paths ?? []
  const path = paths.find((p) => p.id === selected) ?? null

  const save = (changes: Partial<MapPath>, id: string | null = selected) => run('paths.save', { path: { ...(id ? { id } : {}), ...changes } })
  const select = (id: string | null) => { setSelected(id); setDrawing(false) }

  const onTile: MapViewProps['onTile'] = (phase, tile) => {
    if (phase !== 'down' || !map || !inGrid(map.grid, tile)) return
    if (drawing && path) {
      const last = path.tiles[path.tiles.length - 1]
      const tiles: Tile[] = last && last[0] === tile[0] && last[1] === tile[1] ? path.tiles.slice(0, -1) : [...path.tiles, tile]
      void save({ tiles })
      return
    }
    // The topmost path through this tile
    const hit = [...paths].reverse().find((p) => p.tiles.some((t) => t[0] === tile[0] && t[1] === tile[1]))
    if (hit) select(hit.id)
  }

  const kind: EntityKind = {
    noun: 'path',
    items: paths.map((p) => ({
      id: p.id, name: p.name, hidden: isHidden(p.visibility), renamable: true, note: `${p.tiles.length} tiles`,
      mark: <span className="color-dot" style={{ background: p.color }} />,
    })),
    selected,
    select,
    add: () => void run('paths.save', { path: { name: `Path ${paths.length + 1}`, tiles: [] } }).then((next) => {
      const made = next?.paths[next.paths.length - 1]
      if (made) { setSelected(made.id); setDrawing(true) }
    }),
    setHidden: (id, hidden) => void save({ visibility: eyeVisibility(map?.groups, hidden) }, id),
    rename: (id, name) => void save({ name }, id),
    remove: (id) => { if (id === selected) select(null); void run('paths.delete', { id }) },
    empty: 'A path is tiles in order: the party\'s journey, a treasure trail. ＋ adds one.',
  }

  const row = path && (
    <>
      <ToolButton icon={<PencilIcon />} label="Draw" text={drawing ? 'Click tiles' : 'Draw'} on={drawing}
        title={drawing ? 'Click tiles in order (the last one again removes it). Click to stop' : 'Draw: click tiles in order'} onClick={() => setDrawing(!drawing)} />
      <ToolButton icon={<UndoIcon />} label="Undo the last tile" disabled={!path.tiles.length} onClick={() => void save({ tiles: path.tiles.slice(0, -1) })} />
      <ToolButton icon={<ReverseIcon />} label="Reverse" title="Reverse: its end becomes its start" disabled={path.tiles.length < 2}
        onClick={() => void save({ tiles: [...path.tiles].reverse() })} />
      <ToolButton icon={<EraserIcon />} label="Clear its tiles" disabled={!path.tiles.length}
        onClick={() => window.confirm(`Remove every tile from "${path.name}"?`) && void save({ tiles: [] })} />
      <Sep />
      <ColorTool label="Colour" value={path.color} onChange={(color) => void save({ color })} />
      <MenuTool label="Width" value={widthKey(path.width)} options={WIDTHS} onChange={(w) => void save({ width: Number(w) })} />
      <MenuTool label="Line" value={path.body} options={BODIES} onChange={(body) => void save({ body })} />
      <MenuTool label="Shape" value={path.render} options={[['spline', 'Curves'], ['poly', 'Straight']] as const} onChange={(render) => void save({ render })} />
      <MenuTool label="Tail" value={path.tail} options={ENDS} onChange={(tail) => void save({ tail })} />
      <MenuTool label="Head" value={path.head} options={ENDS} onChange={(head) => void save({ head })} />
      <SliderTool key={path.id} label="Progress" value={path.shown ?? 100} min={0} max={100} onDraft={setShownDraft} onSave={(shown) => void save({ shown })}
        hint="How far along it's drawn, from its start (the head moves with it). Players get only that part." />
    </>
  )

  const mapProps: Partial<MapViewProps> = active && map ? {
    onTile,
    overlay: {
      activePathId: selected,
      pathDraft: path && shownDraft !== null ? { id: path.id, shown: shownDraft } : null,
      preview: path ? { tiles: path.tiles, tone: 'select' as const } : undefined,
    },
  } : {}
  return {
    kind, row, mapProps, armed: drawing,
    /** Esc: stop drawing, then deselect. */
    escape: () => { if (drawing) setDrawing(false); else if (selected) select(null); else return false; return true },
  }
}
