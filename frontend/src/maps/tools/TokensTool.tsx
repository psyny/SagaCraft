/**
 * Tokens (the DM, plan 45): mobile pieces on the map, on the map tools bar. ＋ offers Character, Item, Group or Custom
 * (a name and maybe a picture uploaded now, deleted with the token): pick it, then click a tile to place it (it's
 * selected). Tokens drag on the map (they snap to tiles); a click on one picks it. The selected token's tools: its
 * size (1 to 10 tiles), its layer, who else moves it on the live Stage and when (plan 58), and what the caller adds
 * (MapTools' tokenActions; the Stage: its sheet, focus, grab attention).
 * Players see a token when it's shown to them and not on a tile their fog hides.
 */
import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { CharacterGroup, LocationMap, MapToken, MapTokenKind, TokenMoveBy, TokenMoveWhen } from '../../api/types'
import ImageUploader from '../../components/imageEditor/ImageUploader'
import Modal from '../../components/Modal'
import Popover, { anchorOf, type Anchor } from '../../components/Popover'
import ResourcePicker from '../../components/ResourcePicker'
import Token from '../../components/Token'
import { useOptionalSaga } from '../../saga/SagaContext'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import { inGrid } from '../geometry'
import { eyeVisibility, isHidden, MenuTool, type EntityKind } from '../toolbar/widgets'

const SIZES: [string, string][] = Array.from({ length: 10 }, (_, i) => [String(i + 1), i ? `${i + 1} tiles` : '1 tile'])
/** Who moves a token on the live Stage besides the DM (its players: a character's, an item's owners), and when. */
export function moveByOptions(token: Pick<MapToken, 'kind'>): [TokenMoveBy, string][] {
  return [['dm', 'DM only'], ['players', 'Players'], ...(token.kind === 'character' || token.kind === 'item' ? [['owners', 'Its players'] as [TokenMoveBy, string]] : []),
    ['anyone', 'Anyone']]
}
export const MOVE_WHEN: [TokenMoveWhen, string][] = [['always', 'Always'], ['turn', 'On its turn']]

/** What's about to be placed (the next tile clicked). */
type Draft = { kind: MapTokenKind; ref?: number; name?: string; file_id?: number; label: string }

export function useTokensTool({ map, run, active }: { map: LocationMap | null; run: MapCommand; active: boolean }) {
  // Only the DM's map tools use it (in a Saga); the live link's screen draws map Sets with no Saga around
  const sagaId = useOptionalSaga()?.sagaId ?? 0
  const [draft, setDraft] = useState<Draft | null>(null)
  const [menu, setMenu] = useState<Anchor | null>(null)
  const [picking, setPicking] = useState<'character' | 'item' | null>(null)
  const [groups, setGroups] = useState<CharacterGroup[] | null>(null)
  const [customName, setCustomName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    if (menu && groups === null) api.characterGroups(sagaId).then(setGroups).catch(() => setGroups([]))
  }, [menu, groups, sagaId])
  const tokens = map?.tokens ?? []
  const token = tokens.find((t) => t.id === selected) ?? null

  const place: MapViewProps['onTile'] = (phase, tile) => {
    if (phase !== 'down' || !draft || !map || !inGrid(map.grid, tile)) return
    const { label: _label, ...body } = draft
    void run('tokens.save', { token: { ...body, tile } }).then((next) => {
      const made = next?.tokens?.[next.tokens.length - 1]
      if (made) setSelected(made.id)
    })
    setDraft(null)
  }
  const save = (id: string, changes: Record<string, unknown>) => void run('tokens.save', { token: { id, ...changes } })
  const select = (id: string | null) => { setSelected(id); setDraft(null) }
  const start = (d: Draft) => { setDraft(d); setMenu(null); setSelected(null) }

  const kind: EntityKind = {
    noun: 'token',
    items: [...tokens].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map((t) => ({
      id: t.id, name: t.name ?? 'Unnamed token', hidden: isHidden(t.visibility), renamable: t.kind === 'custom',
      note: t.kind === 'custom' ? undefined : t.kind,
      mark: <Token id={`list-${t.id}`} icon={t.icon} name={t.name} style={t.style} color={t.color} size={22} />,
    })),
    selected,
    select,
    add: (e) => { if (draft) setDraft(null); else setMenu(menu ? null : anchorOf(e.currentTarget)) },
    adding: Boolean(draft || menu),
    setHidden: (id, hidden) => save(id, { visibility: eyeVisibility(map?.groups, hidden) }),
    rename: (id, name) => save(id, { name }),
    remove: (id) => { if (id === selected) select(null); void run('tokens.delete', { id }) },
    empty: 'Mobile pieces on the map: characters, items, a group, or anything (a custom one). ＋ adds one.',
  }

  const row = (
    <>
      {draft && <span className="map-tool-hint"><strong>{draft.label}</strong>: click a tile to place it (Esc: cancel)</span>}
      {token && !draft && (
        <>
          <MenuTool label="Size" value={String(token.size)} options={SIZES} onChange={(v) => save(token.id, { size: Number(v) })} />
          {map && map.layers.length > 1 && (
            <MenuTool label="Layer" value={map.layer} options={[...map.layers].reverse().map((l) => [l.id, l.name] as const)}
              onChange={(to) => { if (to !== map.layer) { select(null); void run('tokens.layer', { id: token.id, to }) } }} />
          )}
          <MenuTool label="Moved by" value={token.move_by ?? 'dm'} options={moveByOptions(token)}
            onChange={(move_by) => save(token.id, { move_by, ...(move_by === 'dm' ? { move_when: 'always' } : {}) })} />
          {token.kind === 'character' && (token.move_by ?? 'dm') !== 'dm' && (
            <MenuTool label="When" value={token.move_when ?? 'always'} options={MOVE_WHEN} onChange={(move_when) => save(token.id, { move_when })} />
          )}
        </>
      )}
    </>
  )

  const extras = (
    <>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <div className="menu token-add-menu">
            <div className="menu-title">Add a token</div>
            <button className="menu-item" onClick={() => { setMenu(null); setPicking('character') }}><span className="menu-icon">☺</span>Character…</button>
            <button className="menu-item" onClick={() => { setMenu(null); setPicking('item') }}><span className="menu-icon">◈</span>Item…</button>
            <div className="menu-note muted small">A group</div>
            {groups === null && <span className="menu-note muted small">Loading…</span>}
            {groups?.length === 0 && <span className="menu-note muted small">No groups yet (Characters → Groups)</span>}
            {groups?.map((g) => (
              <button key={g.id} className="menu-item" onClick={() => start({ kind: 'group', ref: g.id, label: g.name })}><span className="menu-icon">⁂</span>{g.name}</button>
            ))}
            <div className="menu-note muted small">Custom</div>
            <div className="token-custom">
              <input value={customName} maxLength={40} placeholder="Boulder, cart, the fire…" aria-label="Custom token name" onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && customName.trim() && start({ kind: 'custom', name: customName.trim(), label: customName.trim() })} />
              <button className="small" disabled={!customName.trim()} onClick={() => start({ kind: 'custom', name: customName.trim(), label: customName.trim() })}>Place</button>
              <button className="small" title="Its picture is temporary: it's deleted with the token" onClick={() => { setMenu(null); setUploading(true) }}>Picture…</button>
            </div>
          </div>
        </Popover>
      )}
      <ResourcePicker open={picking !== null} title={picking === 'item' ? 'Item token' : 'Character token'} kinds={[picking ?? 'character']} multiple={false}
        onPick={(_, [r]) => r && picking && start({ kind: picking, ref: r.id, label: r.name })} onClose={() => setPicking(null)} />
      <Modal open={uploading} wide title="A picture for the token" onClose={() => setUploading(false)}>
        {uploading && (
          <ImageUploader sagaId={sagaId} category="token" defaultRatio="1:1" onCancel={() => setUploading(false)}
            onUploaded={(file) => {
              setUploading(false)
              start({ kind: 'custom', name: customName.trim(), file_id: file.id, label: customName.trim() || 'Custom token' })
            }} />
        )}
      </Modal>
    </>
  )

  const mapProps: Partial<MapViewProps> = active && map ? {
    ...(draft ? { onTile: place } : {}),
    overlay: { tokens: { onMove: (t, tile) => void run('tokens.move', { id: t.id, tile }), onPick: (t) => select(t.id), picked: selected } },
  } : {}
  return {
    kind, row, extras, mapProps, armed: Boolean(draft),
    /** The selected token (not while placing one): the caller may add tools for it. */
    selectedToken: draft ? null : token,
    escape: () => { if (draft) setDraft(null); else if (selected) select(null); else return false; return true },
  }
}
