import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { AttributeDef, CharacterGroup, Counter, ImageValue, Presentation, Resource, Visibility } from '../api/types'
import ImageUploader from '../components/imageEditor/ImageUploader'
import Modal from '../components/Modal'
import Picture from '../components/Picture'
import ResourceIcon from '../components/ResourceIcon'
import ResourcePicker from '../components/ResourcePicker'
import TagsField from '../components/TagsField'
import VisibilityPicker from '../components/VisibilityPicker'
import type { UploadCategory } from '../api/types'
import { useSaga } from './SagaContext'
import DateInput from './lore/DateInput'
import { sagaKinds } from './lore/relationships'

interface Props {
  resource?: Resource
  kind: string
  /** A new character: the category it starts in. */
  categoryId?: number
  /** A new resource of another kind (an item): the type (category) it starts as. */
  typeKey?: string
  /** Documents: the folder a new one goes in. */
  folderId?: number | null
  onDone: (resource: Resource | null) => void
}

/**
 * A resource form built from the ruleset: no attribute is hard-coded here (any kind: characters, locations,
 * items). Characters pick a category (which picks the type), whether they're instanceable, and their groups.
 * The DM tags any resource.
 */
export default function CharacterForm({ resource, kind, categoryId: startCategory, typeKey, folderId, onDone }: Props) {
  const { sagaId, ruleset, saga, isAdmin, categories } = useSaga()
  const types = ruleset.kinds[kind]?.types || {}
  const isCharacter = kind === 'character'
  const [categoryId, setCategoryId] = useState<number | null>(
    resource?.category_id ?? startCategory ?? (isCharacter ? categories[0]?.id ?? null : null))
  const category = categories.find((c) => c.id === categoryId)
  const [pickedType, setPickedType] = useState<string>(typeKey && types[typeKey] ? typeKey : Object.keys(types)[0])
  const type = resource?.type || (isCharacter ? category?.type : pickedType) || Object.keys(types)[0]
  const typeDef = types[type]
  // An existing character only moves between categories of its type (same attributes)
  const choices = resource ? categories.filter((c) => c.type === resource.type) : categories
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    if (resource) return { ...resource.attributes }
    return Object.fromEntries(typeDef.attributes.map((a) => [a.key, a.default ?? null]))
  })
  const everyone = useMemo<Visibility>(
    () => ({ groups: saga.groups.filter((g) => g.key === 'players' || g.key === 'viewers').map((g) => g.id), members: [] }),
    [saga.groups],
  )
  // New player characters are visible to the table; anything else starts hidden (nothing shown by accident)
  const [visibility, setVisibility] = useState<Visibility>(resource?.visibility || (category?.player ? everyone : { groups: [], members: [] }))
  const [instanceable, setInstanceable] = useState(resource?.instanceable ?? Boolean(category?.instanceable))
  const [groups, setGroups] = useState<CharacterGroup[]>([])
  const [groupIds, setGroupIds] = useState<number[] | null>(resource?.group_ids ?? null)
  useEffect(() => {
    if (!isAdmin || !isCharacter) return
    api.characterGroups(sagaId).then((list) => {
      setGroups(list)
      // New player characters start in the active player parties
      setGroupIds((ids) => ids ?? (category?.player ? list.filter((g) => g.player_party && g.active).map((g) => g.id) : []))
    }).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sagaId, isAdmin, isCharacter])

  const pickCategory = (id: number) => {
    const next = categories.find((c) => c.id === id)
    setCategoryId(id)
    if (!resource && next) {
      setVisibility(next.player ? everyone : { groups: [], members: [] })
      setInstanceable(next.instanceable)
      setGroupIds(next.player ? groups.filter((g) => g.player_party && g.active).map((g) => g.id) : [])
    }
  }
  // The name players see (an alias, or no name): applies everywhere the character shows
  const [shown, setShown] = useState<Presentation>(resource?.presentation || { alias: null, hide_name: false })
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const [tags, setTags] = useState<string[]>(resource?.tags ?? [])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  useEffect(() => {
    if (isAdmin) api.tags(sagaId, kind).then(setTagSuggestions).catch(() => undefined)
  }, [isAdmin, sagaId, kind])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canEdit = (key: string) => !resource || resource.editable.includes(key)

  // Another type (category) for a new item: its own values, with their defaults
  useEffect(() => {
    if (resource || !typeDef) return
    setValues((v) => ({ ...Object.fromEntries(typeDef.attributes.map((a) => [a.key, a.default ?? null])), ...Object.fromEntries(
      Object.entries(v).filter(([k, val]) => typeDef.attributes.some((a) => a.key === k) && val !== null && val !== undefined)) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

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
          .filter((a) => a.type !== 'pages' && (resource ? changed.has(a.key) : values[a.key] !== null && values[a.key] !== undefined))
          .map((a) => [a.key, values[a.key]]),
      )
      const character = isCharacter && isAdmin
        ? { category_id: categoryId, instanceable: !category?.player && instanceable, ...(groupIds ? { group_ids: groupIds } : {}) }
        : {}
      const saved = resource
        ? await api.updateResource(sagaId, resource.id, { attributes, ...(isAdmin ? { visibility, presentation: shown, tags, ...character } : {}) })
        : await api.createResource(sagaId, { kind, ...(isCharacter ? {} : { type }), attributes, visibility, presentation: shown, tags, ...(folderId ? { folder_id: folderId } : {}), ...character })
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
      {isCharacter && isAdmin && choices.length > 1 && (
        <div className="field">
          <span className="field-label">Category</span>
          <div className="segmented">
            {choices.map((c) => (
              <button key={c.id} type="button" className={categoryId === c.id ? 'on' : ''} onClick={() => pickCategory(c.id)}>{c.name}</button>
            ))}
          </div>
        </div>
      )}
      {!isCharacter && !resource && Object.keys(types).length > 1 && (
        <div className="field">
          <span className="field-label">Category</span>
          <div className="chips">
            {Object.entries(types).map(([key, t]) => (
              <button key={key} type="button" className={`chip ${type === key ? 'on' : ''}`} onClick={() => setPickedType(key)}>{t.name}</button>
            ))}
          </div>
        </div>
      )}
      {typeDef.attributes.map((attr) =>
        attr.key in values || !resource ? (
          <AttributeField key={attr.key} attr={attr} kind={kind} self={resource?.id} value={values[attr.key]} disabled={!canEdit(attr.key)}
            onChange={(v) => set(attr.key, v)} onMain={(img) => {
              // A gallery picture becomes the main picture (the gallery keeps the old one)
              const main = typeDef.attributes.find((a) => a.type === 'image' && !a.many && a.category !== 'icon')
              if (main) set(main.key, img)
            }} />
        ) : null,
      )}
      {isCharacter && isAdmin && !category?.player && (
        <label className="check">
          <input type="checkbox" checked={instanceable} onChange={(e) => setInstanceable(e.target.checked)} />
          Instanceable <span className="muted small">each time it's put on a Stage, a new instance with its own values (Goblin 1, Goblin 2…)</span>
        </label>
      )}
      {isCharacter && isAdmin && groups.length > 0 && (
        <div className="field">
          <span className="field-label">Groups</span>
          <div className="chips">
            {groups.map((g) => {
              const on = (groupIds ?? []).includes(g.id)
              return (
                <button key={g.id} type="button" className={`chip ${on ? 'on' : ''}`}
                  onClick={() => setGroupIds(on ? (groupIds ?? []).filter((x) => x !== g.id) : [...(groupIds ?? []), g.id])}>
                  {g.favorite ? '★ ' : ''}{g.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {isAdmin && <TagsField value={tags} suggestions={tagSuggestions} onChange={setTags} />}
      {isAdmin && (
        <div className="field">
          <span className="field-label">Who can see this {(typeDef as { name?: string }).name?.toLowerCase() ?? kind}</span>
          <VisibilityPicker value={visibility} groups={saga.groups} members={saga.members} onChange={setVisibility} />
          {isCharacter && <span className="muted small">Players in control always see their character.</span>}
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

const DEFAULT_CATEGORY: Record<string, UploadCategory> = { character: 'character', item: 'item', location: 'map', document: 'document' }

/** Several pictures (a gallery): add, remove, and make one the main picture. */
function GalleryField({ attr, category, value, disabled, onChange, onMain }: {
  attr: AttributeDef
  category: UploadCategory
  value: ImageValue[]
  disabled: boolean
  onChange: (v: unknown) => void
  onMain: (img: ImageValue) => void
}) {
  const { sagaId } = useSaga()
  const [uploading, setUploading] = useState(false)
  return (
    <div className="field">
      <span className="field-label">{attr.name} <span className="muted">{value.length}</span></span>
      <div className="gallery">
        {value.map((img) => (
          <div key={img.file_id} className="gallery-item">
            <Picture url={img.url} mode="full" className="gallery-pic" />
            {!disabled && (
              <div className="gallery-actions">
                <button type="button" className="small" title="Use as the main picture" onClick={() => onMain(img)}>★</button>
                <button type="button" className="small ghost" aria-label="Remove picture" onClick={() => onChange(value.filter((p) => p.file_id !== img.file_id))}>✕</button>
              </div>
            )}
          </div>
        ))}
        {!disabled && <button type="button" className="gallery-add" onClick={() => setUploading(true)}>＋</button>}
      </div>
      <Modal open={uploading} wide title={`Add to ${attr.name}`} onClose={() => setUploading(false)}>
        {uploading && (
          <ImageUploader sagaId={sagaId} category={category} onCancel={() => setUploading(false)} onUploaded={(file) => {
            onChange([...value, { file_id: file.id, url: file.url, face: { x: 0.5, y: 0.35, size: 0.6 } }])
            setUploading(false)
          }} />
        )}
      </Modal>
    </div>
  )
}

/** A link to another resource (e.g. a Location's "part of"), picked with the resource picker. */
function RefField({ attr, self, value, disabled, onChange }: { attr: AttributeDef; self?: number; value: unknown; disabled: boolean; onChange: (v: unknown) => void }) {
  const { sagaId } = useSaga()
  const [picking, setPicking] = useState(false)
  const [target, setTarget] = useState<Resource | null>(null)
  const kind = attr.of?.kind
  const id = typeof value === 'number' ? value : null
  useEffect(() => {
    if (id === null) return setTarget(null)
    if (target?.id !== id) api.resource(sagaId, id).then(setTarget).catch(() => setTarget(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sagaId, id])
  return (
    <div className="field">
      <span className="field-label">{attr.name}</span>
      <div className="ref-field">
        {target ? <><ResourceIcon resource={target} /><strong>{target.name}</strong></> : <span className="muted">{id === null ? 'None' : '…'}</span>}
        {!disabled && <button type="button" className="small" onClick={() => setPicking(true)}>{id === null ? 'Pick…' : 'Change…'}</button>}
        {!disabled && id !== null && <button type="button" className="small ghost" onClick={() => onChange(null)}>Clear</button>}
      </div>
      <ResourcePicker open={picking} title={attr.name} kinds={kind ? [kind] : ['character', 'item', 'location']} multiple={false}
        exclude={self ? [self] : []} onPick={(ids, list) => { setTarget(list[0] ?? null); onChange(ids[0]) }} onClose={() => setPicking(false)} />
    </div>
  )
}

/** A list of resources (a character's inventory: items): add with the picker, remove, open. */
function RefListField({ attr, value, disabled, onChange }: { attr: AttributeDef; value: unknown; disabled: boolean; onChange: (v: unknown) => void }) {
  const { sagaId, ruleset } = useSaga()
  const [picking, setPicking] = useState(false)
  const [items, setItems] = useState<Resource[]>([])
  const ids = useMemo(() => (Array.isArray(value) ? (value as number[]) : []), [value])
  const kind = attr.of?.kind
  useEffect(() => {
    if (!ids.length) return setItems([])
    api.resources(sagaId, kind).then((all) => setItems(all.filter((r) => ids.includes(r.id)))).catch(() => undefined)
  }, [sagaId, kind, ids])
  const byId = new Map(items.map((r) => [r.id, r]))
  return (
    <div className="field">
      <span className="field-label">{attr.name} <span className="muted">{ids.length}</span></span>
      <div className="ref-list">
        {ids.map((id, i) => {
          const item = byId.get(id)
          return (
            <span key={`${id}-${i}`} className="sub-location">
              {item ? <><ResourceIcon resource={item} />{item.name}</> : '…'}
              {!disabled && <button type="button" className="small ghost" aria-label={`Remove ${item?.name ?? ''}`}
                onClick={() => onChange(ids.filter((_, j) => j !== i))}>✕</button>}
            </span>
          )
        })}
        {!disabled && <button type="button" className="small" onClick={() => setPicking(true)}>＋ Add…</button>}
      </div>
      <ResourcePicker open={picking} title={attr.name} kinds={kind ? [kind] : sagaKinds(ruleset)} multiple
        onPick={(picked) => onChange([...ids, ...picked])} onClose={() => setPicking(false)} />
    </div>
  )
}

function AttributeField({ attr, kind, self, value, disabled, onChange, onMain }: {
  attr: AttributeDef
  kind: string
  self?: number
  value: unknown
  disabled: boolean
  onChange: (v: unknown) => void
  onMain: (img: ImageValue) => void
}) {
  const { sagaId, saga } = useSaga()
  const [uploader, setUploader] = useState<'new' | 'edit' | null>(null)
  const category: UploadCategory = attr.category ?? DEFAULT_CATEGORY[kind] ?? 'character'

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
    case 'resource_ref':
      return attr.many ? null : <RefField attr={attr} self={self} value={value} disabled={disabled} onChange={onChange} />
    case 'image': {
      if (attr.many) return <GalleryField attr={attr} category={category} value={(value as ImageValue[]) || []} disabled={disabled} onChange={onChange} onMain={onMain} />
      if (category === 'icon') {
        const icon = value as ImageValue | null
        return (
          <div className="field">
            <span className="field-label">{attr.name}</span>
            <div className="icon-field">
              <Picture url={icon?.url} mode="full" className="icon-preview round" />
              {!disabled && <button type="button" onClick={() => setUploader('new')}>{icon ? 'New icon' : 'Upload icon'}</button>}
              {!disabled && icon && <button type="button" className="ghost" onClick={() => onChange(null)}>Remove</button>}
              <span className="muted small">Shown small and round: on maps, in lists and pickers.</span>
            </div>
            <Modal open={uploader !== null} wide title="Upload an icon" onClose={() => setUploader(null)}>
              {uploader !== null && (
                <ImageUploader sagaId={sagaId} category="icon" defaultRatio="1:1" onCancel={() => setUploader(null)}
                  onUploaded={(file) => { onChange({ file_id: file.id, url: file.url, face: { x: 0.5, y: 0.5, size: 1 } }); setUploader(null) }} />
              )}
            </Modal>
          </div>
        )
      }
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
                category={category}
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
    case 'choice':
      return (
        <label>{attr.name}
          <select value={(value as string) ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">—</option>
            {attr.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      )
    case 'date':
      return <DateInput label={attr.name} value={(value as number | null) ?? null} optional={!attr.required} emptyLabel="No date" disabled={disabled} onChange={onChange} />
    case 'list':
      if (attr.of?.type === 'resource_ref') return <RefListField attr={attr} value={value} disabled={disabled} onChange={onChange} />
      return null
    default:
      return null
  }
}
