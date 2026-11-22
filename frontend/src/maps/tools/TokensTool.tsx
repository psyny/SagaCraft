/**
 * Tokens (the DM): mobile tokens on the map, like labels but meant to move. "＋ Character / Item / Group / Custom":
 * pick it (a custom one: a name and a picture uploaded now, deleted with the token), then click a tile to place it.
 * Drag tokens on the map (they snap to the tile they're dropped on). Each token: its size (tiles), who sees it,
 * remove. Players see a token when it's shared with them and not on a tile their fog hides.
 */
import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { CharacterGroup, LocationMap, MapToken, MapTokenKind } from '../../api/types'
import ImageUploader from '../../components/imageEditor/ImageUploader'
import Modal from '../../components/Modal'
import ResourcePicker from '../../components/ResourcePicker'
import Segmented from '../../components/Segmented'
import Token from '../../components/Token'
import VisibilityPicker from '../../components/VisibilityPicker'
import { useSaga } from '../../saga/SagaContext'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'
import { inGrid } from '../geometry'

const KINDS: [MapTokenKind, string][] = [['character', 'Character'], ['item', 'Item'], ['group', 'Group'], ['custom', 'Custom']]
const SIZES: [string, string][] = [['1', '1 tile'], ['2', '2'], ['3', '3'], ['4', '4']]

/** What's about to be placed (the next tile clicked). */
type Draft = { kind: MapTokenKind; ref?: number; name?: string; file_id?: number; label: string }

export function useTokensTool({ map, run, active }: { map: LocationMap | null; run: MapCommand; active: boolean }) {
  const { sagaId, saga } = useSaga()
  const [kind, setKind] = useState<MapTokenKind>('character')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [picking, setPicking] = useState(false)
  const [groups, setGroups] = useState<CharacterGroup[]>([])
  const [customName, setCustomName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    if (active) api.characterGroups(sagaId).then(setGroups).catch(() => undefined)
  }, [active, sagaId])
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
  const save = (t: MapToken, changes: Record<string, unknown>) => void run('tokens.save', { token: { id: t.id, ...changes } })

  const panel = map && (
    <div className="tool-panel">
      <div className="tool-head"><strong>Tokens</strong></div>
      <p className="muted small">Mobile pieces on the map: characters, items, a group, or anything (a custom one). Drag them; they snap to tiles.</p>
      <Segmented<MapTokenKind> value={kind} options={KINDS} onChange={(k) => { setKind(k); setDraft(null) }} />
      {draft ? (
        <div className="button-row">
          <span className="small"><strong>{draft.label}</strong>: click a tile to place it</span>
          <button className="small ghost" onClick={() => setDraft(null)}>Cancel</button>
        </div>
      ) : kind === 'group' ? (
        <select aria-label="Group" value="" onChange={(e) => {
          const g = groups.find((x) => x.id === Number(e.target.value))
          if (g) setDraft({ kind: 'group', ref: g.id, label: g.name })
        }}>
          <option value="">{groups.length ? 'Pick a group…' : 'No groups yet (Characters → Groups)'}</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      ) : kind === 'custom' ? (
        <div className="form">
          <label>Name<input value={customName} maxLength={40} placeholder="Boulder, cart, the fire…" onChange={(e) => setCustomName(e.target.value)} /></label>
          <div className="button-row">
            <button className="small" disabled={!customName.trim()} onClick={() => setDraft({ kind: 'custom', name: customName.trim(), label: customName.trim() })}>Without a picture</button>
            <button className="small primary" onClick={() => setUploading(true)}>Upload a picture…</button>
          </div>
          <span className="muted small">Its picture is temporary: it's deleted with the token.</span>
        </div>
      ) : (
        <button className="small primary" onClick={() => setPicking(true)}>＋ Pick the {kind}…</button>
      )}
      <div className="path-list">
        {tokens.map((t) => (
          <button key={t.id} className={`path-row ${t.id === selected ? 'on' : ''}`} onClick={() => setSelected(t.id === selected ? null : t.id)}>
            <Token id={`list-${t.id}`} icon={t.icon} name={t.name} style={t.style} color={t.color} size={28} />
            <span>{t.name ?? '???'}</span>
            <span className="muted small">{t.kind}{t.size > 1 ? ` · ${t.size} tiles` : ''}</span>
          </button>
        ))}
      </div>
      {token && (
        <div className="path-editor">
          <div className="field"><span className="field-label">Size</span>
            <Segmented value={String(token.size)} options={SIZES} onChange={(v) => save(token, { size: Number(v) })} />
          </div>
          <div className="field">
            <span className="field-label">Who sees it</span>
            <VisibilityPicker value={token.visibility || { groups: [], members: [] }} groups={saga.groups} members={saga.members}
              emptyLabel="Hidden (admins only)" onChange={(visibility) => save(token, { visibility })} />
            <span className="muted small">Players see it only on a tile they know.</span>
          </div>
          <div className="button-row">
            <span className="muted small">Drag it on the map to move it.</span>
            <span className="spacer" />
            <button className="small ghost danger" onClick={() => { setSelected(null); void run('tokens.delete', { id: token.id }) }}>Remove</button>
          </div>
        </div>
      )}
      <ResourcePicker open={picking} title={kind === 'item' ? 'Item token' : 'Character token'} kinds={[kind]} multiple={false}
        onPick={(_, [r]) => r && setDraft({ kind, ref: r.id, label: r.name })} onClose={() => setPicking(false)} />
      <Modal open={uploading} wide title="A picture for the token" onClose={() => setUploading(false)}>
        {uploading && (
          <ImageUploader sagaId={sagaId} category="token" defaultRatio="1:1" onCancel={() => setUploading(false)}
            onUploaded={(file) => {
              setUploading(false)
              setDraft({ kind: 'custom', name: customName.trim(), file_id: file.id, label: customName.trim() || 'Custom token' })
            }} />
        )}
      </Modal>
    </div>
  )

  const mapProps: Partial<MapViewProps> = active && map ? {
    ...(draft ? { onTile: place } : {}),
    overlay: { tokens: { onMove: (t, tile) => void run('tokens.move', { id: t.id, tile }) } },
  } : {}
  return { panel, mapProps }
}
