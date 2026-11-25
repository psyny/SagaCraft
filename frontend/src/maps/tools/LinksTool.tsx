/**
 * Resources on tiles (the DM, plan 45), on the map tools bar: ＋ opens the resource picker (characters, items,
 * locations; the location's sub-locations first), then a click on a tile puts them there (the first is selected).
 * A click on a resource's icon on the map picks it. The selected link's tools: move it (click another tile), open
 * its resource. Players see an icon for each resource they may see, on tiles they know, unless the DM hid the link.
 */
import { useState } from 'react'
import type { LocationMap, MapLink } from '../../api/types'
import ResourcePicker from '../../components/ResourcePicker'
import { inGrid } from '../geometry'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import { MoveIcon, OpenIcon } from '../toolbar/icons'
import { ToolButton, type EntityKind } from '../toolbar/widgets'

export const LINK_KINDS = ['character', 'item', 'location']

export const linkId = (l: Pick<MapLink, 'tile' | 'resource_id'>) => `${l.tile[0]},${l.tile[1]},${l.resource_id}`

export function useLinksTool({ map, run, active, favorites = [], onOpen }: {
  map: LocationMap | null; run: MapCommand; active: boolean; favorites?: number[]
  /** Open a linked resource (where the caller can show it). */
  onOpen?: (link: MapLink) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [placing, setPlacing] = useState<number[] | null>(null)
  const [moving, setMoving] = useState(false)
  const links = map?.links ?? []
  const link = links.find((l) => linkId(l) === selected) ?? null
  const select = (id: string | null) => { setSelected(id); setMoving(false); setPlacing(null) }

  const onTile: MapViewProps['onTile'] = (phase, tile) => {
    if (phase !== 'down' || !map || !inGrid(map.grid, tile)) return
    if (placing) {
      const ids = placing
      setPlacing(null)
      void run('links.add', { tile, resource_ids: ids }).then((next) => next && setSelected(linkId({ tile, resource_id: ids[0] })))
    } else if (moving && link) {
      setMoving(false)
      void run('links.move', { tile: link.tile, resource_id: link.resource_id, to: tile }).then((next) => next && setSelected(linkId({ tile, resource_id: link.resource_id })))
    }
  }

  const kind: EntityKind = {
    noun: 'link',
    items: links.map((l) => ({
      id: linkId(l), name: l.name ?? '???', hidden: Boolean(l.hidden), renamable: false, note: `tile ${l.tile[0] + 1}, ${l.tile[1] + 1}`,
      mark: <span className={`kind-dot kind-${l.kind}`} />,
    })),
    selected,
    select,
    add: () => { if (placing) setPlacing(null); else setPicking(true) },
    adding: Boolean(placing) || picking,
    setHidden: (id, hidden) => {
      const l = links.find((x) => linkId(x) === id)
      if (l) void run('links.hide', { tile: l.tile, resource_id: l.resource_id, hidden })
    },
    rename: () => undefined,
    remove: (id) => {
      const l = links.find((x) => linkId(x) === id)
      if (id === selected) select(null)
      if (l) void run('links.remove', { tile: l.tile, resource_id: l.resource_id })
    },
    empty: map?.grid.type === 'none' ? 'Resources go on tiles: pick a grid first.'
      : 'Characters, items and places on tiles: players see their icons and open them. ＋ adds some.',
  }

  const row = (
    <>
      {placing && <span className="map-tool-hint">Click the tile they go on (Esc: cancel)</span>}
      {link && !placing && (
        <>
          <ToolButton icon={<MoveIcon />} label="Move to another tile" text={moving ? 'Click a tile' : 'Move'} on={moving} onClick={() => setMoving(!moving)} />
          {onOpen && <ToolButton icon={<OpenIcon />} label={`Open ${link.name ?? 'it'}`} text="Open" onClick={() => onOpen(link)} />}
        </>
      )}
    </>
  )

  const extras = map && (
    <ResourcePicker open={picking} title="Put on a tile" kinds={LINK_KINDS} favorites={favorites} exclude={[map.location.id]}
      onPick={(ids) => { if (ids.length) { setPlacing(ids); setSelected(null) } }} onClose={() => setPicking(false)} />
  )

  const mapProps: Partial<MapViewProps> = active && map ? {
    ...(placing || moving ? { onTile } : {}),
    onLinkClick: (l) => select(linkId(l)),
    overlay: { selectedTile: link?.tile ?? null },
  } : {}
  return {
    kind, row, extras, mapProps, armed: Boolean(placing || moving),
    escape: () => { if (placing) setPlacing(null); else if (moving) setMoving(false); else if (selected) select(null); else return false; return true },
  }
}
