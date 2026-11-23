/**
 * The map's layers (the DM): add, rename, see-through, move up and down, delete; which one the editor works on. And
 * the no-map colour (Background): what shows where no picture covers the map. The grid, the fog and the no-map colour
 * are the whole map's; pictures, tokens, links, paths, regions and labels are each layer's.
 */
import { useState } from 'react'
import type { LocationMap, MapLayer } from '../../api/types'
import ColorPicker from '../../components/ColorPicker'
import type { MapCommand } from '../useLocationMap'

/** Pick the layer the editor (or a viewer) shows: top layer first. */
export function LayerPicker({ map, onPick, label = 'Layer' }: { map: LocationMap; onPick: (id: string) => void; label?: string }) {
  return (
    <label className="layer-pick">
      <span className="muted small">{label}</span>
      <select value={map.layer} aria-label={label} onChange={(e) => onPick(e.target.value)}>
        {[...map.layers].reverse().map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </label>
  )
}

export function LayersPanel({ map, run, onPick }: { map: LocationMap; run: MapCommand; onPick: (id: string) => void }) {
  const [name, setName] = useState('')
  const top = [...map.layers].reverse() // the top layer first
  const update = (layer: MapLayer, changes: Partial<MapLayer>) => void run('layers.update', { id: layer.id, changes })
  return (
    <div className="tool-panel">
      <div className="tool-head"><strong>Layers</strong></div>
      <p className="muted small">Floors of a tower, the cave under the forest, the same place by night. Each layer has its own pictures,
        tokens, links, paths, regions and labels; the grid and the fog are the whole map's. The top layer is first.</p>
      <div className="path-list">
        {top.map((l, i) => (
          <div key={l.id} className={`layer-row ${l.id === map.layer ? 'on' : ''}`}>
            <input key={`${l.id}-${l.name}`} defaultValue={l.name} aria-label={`${l.name}: name`}
              onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && update(l, { name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            <label className="check small" title="Where this layer has no picture, the layers under it show">
              <input type="checkbox" checked={l.see_through} disabled={i === top.length - 1} onChange={(e) => update(l, { see_through: e.target.checked })} /> See-through
            </label>
            <button className="small ghost" aria-label={`${l.name}: up`} disabled={i === 0} onClick={() => void run('layers.move', { id: l.id, delta: 1 })}>↑</button>
            <button className="small ghost" aria-label={`${l.name}: down`} disabled={i === top.length - 1} onClick={() => void run('layers.move', { id: l.id, delta: -1 })}>↓</button>
            <button className={`small ${l.id === map.layer ? 'primary' : ''}`} onClick={() => onPick(l.id)}>{l.id === map.layer ? 'Editing' : 'Edit'}</button>
            <button className="small ghost danger" aria-label={`Delete ${l.name}`} disabled={map.layers.length < 2}
              onClick={() => window.confirm(`Delete the layer "${l.name}" with its pictures, tokens, links, paths, regions and labels?`)
                && void run('layers.delete', { id: l.id }).then(() => l.id === map.layer && onPick(map.layers.find((x) => x.id !== l.id)!.id))}>✕</button>
          </div>
        ))}
      </div>
      <div className="add-variable">
        <input placeholder="New layer" value={name} onChange={(e) => setName(e.target.value)} aria-label="New layer" />
        <button className="small" disabled={map.layers.length >= 12} onClick={() => void run('layers.add', { name: name.trim() }).then((next) => {
          setName('')
          const made = next?.layers[next.layers.length - 1]
          if (made) onPick(made.id)
        })}>＋ Add on top</button>
      </div>
    </div>
  )
}

export function BackgroundPanel({ map, run }: { map: LocationMap; run: MapCommand }) {
  return (
    <div className="tool-panel">
      <div className="tool-head"><strong>Background</strong></div>
      <p className="muted small">The no-map colour: what shows where no picture covers the map (every layer).</p>
      <ColorPicker label="No-map colour" value={map.background} onChange={(color) => void run('background.set', { color })} />
    </div>
  )
}
