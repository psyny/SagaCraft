/**
 * Resources on tiles (the DM): click a tile, see what's linked there, "Link…" opens the resource picker
 * (characters, items, locations; the location's sub-locations first). Icons show on the tile for whoever may
 * see the resource (and, with fog, knows the tile).
 */
import { useState } from 'react'
import type { LocationMap } from '../../api/types'
import ResourcePicker from '../../components/ResourcePicker'
import { inGrid, type Tile } from '../geometry'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'

export const LINK_KINDS = ['character', 'item', 'location']

export function useLinksTool({ map, run, active, favorites = [] }: { map: LocationMap | null; run: MapCommand; active: boolean; favorites?: number[] }) {
  const [tile, setTile] = useState<Tile | null>(null)
  const [picking, setPicking] = useState(false)
  const here = map && tile ? map.links.filter((l) => l.tile[0] === tile[0] && l.tile[1] === tile[1]) : []

  const panel = map && (
    <div className="tool-panel">
      {map.grid.type === 'none' && <p className="muted small">Resources go on tiles: pick a grid first.</p>}
      {!tile && map.grid.type !== 'none' && <p className="muted">Click a tile to see and link its resources.</p>}
      {tile && (
        <>
          <div className="tool-head">
            <strong>Tile {tile[0] + 1}, {tile[1] + 1}</strong>
            <button className="primary small" onClick={() => setPicking(true)}>＋ Link…</button>
          </div>
          {here.length === 0 && <p className="muted small">Nothing linked here.</p>}
          <div className="link-list">
            {here.map((l) => (
              <div key={l.resource_id} className="link-row">
                <span className={`kind-dot kind-${l.kind}`} />
                <span className="link-name">{l.name ?? '???'}</span>
                <button className="small ghost" aria-label={`Unlink ${l.name ?? ''}`} onClick={() => void run('links.remove', { tile, resource_id: l.resource_id })}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="muted small">Players see an icon for each resource they may see, on tiles they know. Clicking it opens the resource.</p>
      <ResourcePicker
        open={picking}
        title={tile ? `Link to tile ${tile[0] + 1}, ${tile[1] + 1}` : ''}
        kinds={LINK_KINDS}
        favorites={favorites}
        exclude={[map.location.id, ...here.map((l) => l.resource_id)]}
        onPick={(ids) => tile && void run('links.add', { tile, resource_ids: ids })}
        onClose={() => setPicking(false)}
      />
    </div>
  )

  const mapProps: Partial<MapViewProps> = active && map ? {
    onTile: (phase, t) => { if (phase === 'down' && inGrid(map.grid, t)) setTile(t) },
    onLinkClick: (link) => setTile(link.tile),
    overlay: { selectedTile: tile },
  } : {}
  return { panel, mapProps }
}
