import { useMemo, useState } from 'react'
import { api } from '../api'
import type { AttributeDef, Counter, ImageValue, Presentation, Resource, Visibility } from '../api/types'
import ImageUploader from '../components/imageEditor/ImageUploader'
import Modal from '../components/Modal'
import Picture from '../components/Picture'
import VisibilityPicker from '../components/VisibilityPicker'
import { useSaga } from './SagaContext'

interface Props {
  resource?: Resource
  kind: string
  onDone: (resource: Resource | null) => void
}

/** A resource form built from the ruleset: no attribute is hard-coded here. */
export default function CharacterForm({ resource, kind, onDone }: Props) {
  const { sagaId, ruleset, saga, isAdmin } = useSaga()
  const types = ruleset.kinds[kind]?.types || {}
  const [type, setType] = useState(resource?.type || Object.keys(types)[0])
  const typeDef = types[type]
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    if (resource) return { ...resource.attributes }
    return Object.fromEntries(typeDef.attributes.map((a) => [a.key, a.default ?? null]))
  })
  const everyone = useMemo<Visibility>(
    () => ({ groups: saga.groups.filter((g) => g.key === 'players' || g.key === 'viewers').map((g) => g.id), members: [] }),
    [saga.groups],
  )
  // New PCs are visible to the table; anything else starts hidden (nothing shown by accident)
  const [visibility, setVisibility] = useState<Visibility>(resource?.visibility || (type === 'pc' ? everyone : { groups: [], members: [] }))
  // The name players see (an alias, or no name): applies everywhere the character shows
  const [shown, setShown] = useState<Presentation>(resource?.presentation || { alias: null, hide_name: false })
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canEdit = (key: string) => !resource || resource.editable.includes(key)

  const set = (key: string, value: unknown) => {
    setValues((v) => ({ ...v, [key]: value }))
    setChanged((c) => new Set(c).add(key))
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const attributes = Object.fromEntries(
        typeDef.attributes
          .filter((a) => a.type !== 'list' && (resource ? changed.has(a.key) : values[a.key] !== null && values[a.key] !== undefined))
          .map((a) => [a.key, values[a.key]]),
      )
      const saved = resource
        ? await api.updateResource(sagaId, resource.id, { attributes, ...(isAdmin ? { visibility, presentation: shown } : {}) })
        : await api.createResource(sagaId, { kind, type, attributes, visibility, presentation: shown })
      onDone(saved)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!resource || !window.confirm(`Delete ${resource.name}? It also leaves every Stage.`)) return
    await api.deleteResource(sagaId, resource.id)
    onDone(null)
  }

  return (
    <div className="form">
      {!resource && Object.keys(types).length > 1 && (
        <div className="segmented">
          {Object.entries(types).map(([key, t]) => (
            <button key={key} type="button" className={type === key ? 'on' : ''} onClick={() => {
              setType(key)
              setVisibility(key === 'pc' ? everyone : { groups: [], members: [] })
            }}>{t.name}</button>
          ))}
        </div>
      )}
      {typeDef.attributes.map((attr) =>
        attr.key in values || !resource ? (
          <AttributeField key={attr.key} attr={attr} value={values[attr.key]} disabled={!canEdit(attr.key)} onChange={(v) => set(attr.key, v)} />
        ) : null,
      )}
      {isAdmin && (
        <div className="field">
          <span className="field-label">Who can see this character</span>
          <VisibilityPicker value={visibility} groups={saga.groups} members={saga.members} onChange={setVisibility} />
          <span className="muted small">Players in control always see their character.</span>
        </div>
      )}
      {isAdmin && (
        <div className="field">
          <span className="field-label">Name players see</span>
          <input
            placeholder={(values.name as string) || 'The real name'}
            value={shown.alias || ''}
            disabled={shown.hide_name}
            onChange={(e) => setShown({ ...shown, alias: e.target.value || null })}
          />
          <label className="check">
            <input type="checkbox" checked={shown.hide_name} onChange={(e) => setShown({ ...shown, hide_name: e.target.checked })} /> Hide the name (players see ???)
          </label>
          <span className="muted small">Everywhere: Stages, sheets and this list. Players in control see the real name here.</span>
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <div className="button-row end">
        {resource && isAdmin && <button className="danger ghost" onClick={remove}>Delete</button>}
        <button className="primary" onClick={save} disabled={busy}>{resource ? 'Save' : 'Create'}</button>
      </div>
    </div>
  )
}

function AttributeField({ attr, value, disabled, onChange }: { attr: AttributeDef; value: unknown; disabled: boolean; onChange: (v: unknown) => void }) {
  const { sagaId, saga } = useSaga()
  const [uploader, setUploader] = useState<'new' | 'edit' | null>(null)

  switch (attr.type) {
    case 'text':
      return <label>{attr.name}<input value={(value as string) || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} /></label>
    case 'rich_text':
      return <label>{attr.name}<textarea rows={4} value={(value as string) || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} /></label>
    case 'number':
      return (
        <label>{attr.name}
          <input type="number" value={value === null || value === undefined ? '' : String(value)} disabled={disabled}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
        </label>
      )
    case 'boolean':
      return <label className="check"><input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {attr.name}</label>
    case 'counter': {
      const c = (value as Counter) || { current: 0, max: 0 }
      return (
        <div className="field">
          <span className="field-label">{attr.name}</span>
          <div className="grid-2">
            <label className="inline">Current<input type="number" value={c.current} disabled={disabled} onChange={(e) => onChange({ ...c, current: Number(e.target.value) })} /></label>
            <label className="inline">Max<input type="number" value={c.max} disabled={disabled} onChange={(e) => onChange({ ...c, max: Number(e.target.value), current: c.current === c.max ? Number(e.target.value) : c.current })} /></label>
          </div>
        </div>
      )
    }
    case 'member_ref': {
      const ids = (value as number[]) || []
      const players = saga.members.filter((m) => m.role === 'player')
      return (
        <div className="field">
          <span className="field-label">{attr.name}</span>
          <div className="chips">
            {players.length === 0 && <span className="muted small">No players in this saga yet.</span>}
            {players.map((m) => (
              <button key={m.id} type="button" disabled={disabled} className={`chip ${ids.includes(m.id) ? 'on' : ''}`}
                onClick={() => onChange(ids.includes(m.id) ? ids.filter((x) => x !== m.id) : [...ids, m.id])}>
                {m.display_name}
              </button>
            ))}
          </div>
        </div>
      )
    }
    case 'image': {
      const img = value as ImageValue | null
      const face = img?.face || { x: 0.5, y: 0.3, size: 0.4 }
      return (
        <div className="field">
          <span className="field-label">{attr.name}</span>
          <div className="image-field">
            <div className="image-previews">
              <Picture url={img?.url} mode="full" className="preview-full" />
              <Picture url={img?.url} mode="face" face={face} className="preview-face" />
            </div>
            {!disabled && (
              <div className="image-controls">
                <div className="button-row">
                  <button type="button" onClick={() => setUploader('new')}>{img ? 'New picture' : 'Upload picture'}</button>
                  {img?.url && <button type="button" className="ghost" onClick={() => setUploader('edit')}>Crop / adjust</button>}
                </div>
                {img && (
                  <>
                    <span className="muted small">Face crop</span>
                    {(['x', 'y', 'size'] as const).map((k) => (
                      <label key={k} className="slider">
                        {k === 'size' ? 'Zoom' : k === 'x' ? 'Left ↔ right' : 'Up ↕ down'}
                        <input type="range" min={k === 'size' ? 0.1 : 0} max={1} step={0.01}
                          value={k === 'size' ? 1.1 - face.size : face[k]}
                          onChange={(e) => onChange({ ...img, face: { ...face, [k]: k === 'size' ? 1.1 - Number(e.target.value) : Number(e.target.value) } })} />
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <Modal open={uploader !== null} wide title={uploader === 'edit' ? 'Edit picture' : 'Upload a picture'} onClose={() => setUploader(null)}>
            {uploader !== null && (
              <ImageUploader
                sagaId={sagaId}
                category="character"
                initialUrl={uploader === 'edit' ? img?.url : null}
                onCancel={() => setUploader(null)}
                onUploaded={(file) => {
                  // A new picture gets a centred face crop; re-editing keeps the old one
                  onChange({ file_id: file.id, url: file.url, face: uploader === 'edit' ? face : { x: 0.5, y: 0.35, size: 0.6 } })
                  setUploader(null)
                }}
              />
            )}
          </Modal>
        </div>
      )
    }
    case 'list':
      return (
        <div className="field">
          <span className="field-label">{attr.name}</span>
          <span className="muted small">Coming soon.</span>
        </div>
      )
    default:
      return null
  }
}
