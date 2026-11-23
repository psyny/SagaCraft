import { Fragment, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Link } from 'react-router-dom'
import type { AttributeDef, CharacterGroup, Counter, ImageValue, PickedArchetype, Presentation, Resource, ResourceFolder, Ruleset, Visibility } from '../api/types'
import ComboTray from '../components/ComboTray'
import Token, { tokenColor } from '../components/Token'
import ImageUploader from '../components/imageEditor/ImageUploader'
import Modal from '../components/Modal'
import Picture from '../components/Picture'
import ResourceIcon from '../components/ResourceIcon'
import ResourcePicker from '../components/ResourcePicker'
import MemberPicker from '../components/MemberPicker'
import TagsField from '../components/TagsField'
import VisibilityPicker from '../components/VisibilityPicker'
import type { UploadCategory } from '../api/types'
import ActionsPanel, { useResourceActions } from './ActionsPanel'
import { applyLevels, archetypeLabel, archetypesOf, archetypeVariables, levelChanges, levelSteps, shortValue, stepAt } from './archetypes'
import { useSaga } from './SagaContext'
import DateInput from './lore/DateInput'
import { RelationshipsButton } from './lore/RelationshipsPanel'
import { resourcePath, sagaKinds } from './lore/relationships'

interface Props {
  resource?: Resource
  kind: string
  /** A new character: the category it starts in. */
  categoryId?: number
  /** A new resource of another kind (an item): the type (category) it starts as. */
  typeKey?: string
  /** Documents, items, locations: the folder a new one goes in. */
  folderId?: number | null
  onDone: (resource: Resource | null) => void
  /** Tabs (characters and items, in the full-screen editor): Admin, Identity, Variables, Inventory, Actions. */
  tabbed?: boolean
}

export type EditorTab = 'admin' | 'identity' | 'archetypes' | 'variables' | 'inventory' | 'actions'

/** Pure: which tab a variable goes in. Identity: the name (required text) and pictures; Inventory: lists of items;
 * the members in control are the DM's (Admin); the rest are Variables. Nothing is hard-coded: it follows types. */
export function tabOf(attr: AttributeDef): EditorTab {
  if (attr.type === 'image' || (attr.type === 'text' && (attr.required || attr.key === 'name'))) return 'identity'
  if (attr.type === 'list' && attr.of?.kind === 'item') return 'inventory'
  if (attr.type === 'member_ref' && attr.controllers) return 'admin'
  return 'variables'
}

/**
 * A resource form built from the ruleset: no attribute is hard-coded here (any kind: characters, locations,
 * items). Characters pick a category (which picks the type), whether they're instanceable, and their groups.
 * The DM tags any resource.
 */
export default function CharacterForm({ resource, kind, categoryId: startCategory, typeKey, folderId, onDone, tabbed = false }: Props) {
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
  // "All players" (viewers see what players see)
  const everyone = useMemo<Visibility>(
    () => ({ groups: saga.groups.filter((g) => g.key === 'players').map((g) => g.id), members: [] }),
    [saga.groups],
  )
  const [owners, setOwners] = useState<number[]>(resource?.owners ?? [])
  const [editors, setEditors] = useState<Visibility>(resource?.editors ?? { groups: [], members: [], owner: true })
  // Its folder, when the folder decides who sees what's in it
  const [folder, setFolder] = useState<ResourceFolder | null>(null)
  const folderOf = resource ? resource.folder_id : folderId
  useEffect(() => {
    if (!isAdmin || !folderOf || isCharacter) return
    api.folders(sagaId, kind).then((list) => setFolder(list.find((f) => f.id === folderOf) ?? null)).catch(() => undefined)
  }, [isAdmin, folderOf, isCharacter, sagaId, kind])
  const folderDecides = folder?.visibility ? folder : null
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
  const [shownChanged, setShownChanged] = useState(false)
  const changeShown = (next: Presentation) => { setShown(next); setShownChanged(true) }
  const [active, setActive] = useState(resource?.active ?? true)
  // Its archetypes (the DM's): each at a level; their variables join its own (plan 33)
  const [archetypes, setArchetypes] = useState<PickedArchetype[]>(resource?.archetypes ?? [])
  const [archetypesChanged, setArchetypesChanged] = useState(false)
  // What Save does to its values (the server's rules, previewed): variables it gains at their level's value, ones whose
  // value changes between the saved level and the new one at the new level's (not those edited here)
  const savedArchetypes = resource?.archetypes ?? []
  const savedValues = resource?.attributes ?? {}
  const changeArchetypes = (next: PickedArchetype[]) => {
    setArchetypes(next)
    setArchetypesChanged(true)
    const preview = applyLevels(ruleset, savedArchetypes, next, savedValues)
    setValues((v) => ({ ...v, ...Object.fromEntries(archetypeVariables(ruleset, next).flatMap((g) => g.variables)
      .filter((a) => !changed.has(a.key)).map((a) => [a.key, preview[a.key] ?? v[a.key] ?? null])) }))
  }
  const fromArchetypes = isCharacter ? archetypeVariables(ruleset, archetypes) : []
  // Its players in control (not the DM): who they share it with
  const [sharing, setSharing] = useState<Visibility | null>(resource?.sharing ?? null)
  const [sharingChanged, setSharingChanged] = useState(false)
  // Its players (and whoever can edit it) style the token and hide the name; the DM does everything
  const controls = !isAdmin && resource?.presentation !== undefined
  const [tab, setTab] = useState<EditorTab>('identity')
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const [tags, setTags] = useState<string[]>(resource?.tags ?? [])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  useEffect(() => {
    if (isAdmin) api.tags(sagaId, kind).then(setTagSuggestions).catch(() => undefined)
  }, [isAdmin, sagaId, kind])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canEdit = (key: string) => !resource || resource.editable.includes(key) || (isAdmin && fromArchetypes.some((g) => g.variables.some((a) => a.key === key)))
  // The Saga template's actions on it (a short rest), and its party's
  const actions = useResourceActions(sagaId, tabbed && resource && (isCharacter || kind === 'item') ? resource.id : null)
  // An action ran: its values changed on the server (keep what's being edited here)
  const refreshValues = () => {
    if (!resource) return
    api.resource(sagaId, resource.id).then((fresh) => setValues((v) => ({
      ...v, ...Object.fromEntries(Object.entries(fresh.attributes).filter(([k]) => !changed.has(k))),
    }))).catch(() => undefined)
  }

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
        [...typeDef.attributes, ...fromArchetypes.flatMap((g) => g.variables)]
          .filter((a) => a.type !== 'pages' && a.type !== 'calculated' && (resource ? changed.has(a.key) : values[a.key] !== null && values[a.key] !== undefined))
          .map((a) => [a.key, values[a.key]]),
      )
      const character = isCharacter && isAdmin
        ? { category_id: categoryId, instanceable: !category?.player && instanceable, editors, active, ...(groupIds ? { group_ids: groupIds } : {}),
          ...(archetypesChanged || (!resource && archetypes.length) ? { archetypes } : {}) }
        : isAdmin ? { owners } : {}
      const own = controls ? {
        ...(shownChanged ? { presentation: { hide_name: shown.hide_name } as Presentation } : {}),
        ...(sharingChanged && sharing ? { visibility: sharing } : {}),
      } : {}
      const saved = resource
        ? await api.updateResource(sagaId, resource.id, { attributes, ...(isAdmin ? { visibility, presentation: shown, tags, ...character } : own) })
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

  const thing = (typeDef as { name?: string }).name?.toLowerCase() ?? kind
  const field = (attr: AttributeDef) => (attr.key in values || !resource ? (
    <AttributeField key={attr.key} attr={attr} kind={kind} self={resource?.id} value={values[attr.key]} disabled={!canEdit(attr.key)}
      onChange={(v) => set(attr.key, v)} onMain={(img) => {
        // A gallery picture becomes the main picture (the gallery keeps the old one)
        const main = typeDef.attributes.find((a) => a.type === 'image' && !a.many && a.category !== 'icon')
        if (main) set(main.key, img)
      }} />
  ) : null)
  const fieldsIn = (t: EditorTab) => typeDef.attributes.filter((a) => tabOf(a) === t)

  // -- the DM's settings ---------------------------------------------------------------------------------
  const categoryField = isCharacter && isAdmin && choices.length > 1 ? (
    <div className="field">
      <span className="field-label">Category</span>
      <div className="segmented">
        {choices.map((c) => (
          <button key={c.id} type="button" className={categoryId === c.id ? 'on' : ''} onClick={() => pickCategory(c.id)}>{c.name}</button>
        ))}
      </div>
    </div>
  ) : !isCharacter && !resource && Object.keys(types).length > 1 ? (
    <div className="field">
      <span className="field-label">Category</span>
      <div className="chips">
        {Object.entries(types).map(([key, t]) => (
          <button key={key} type="button" className={`chip ${type === key ? 'on' : ''}`} onClick={() => setPickedType(key)}>{t.name}</button>
        ))}
      </div>
    </div>
  ) : null
  const activeField = isCharacter && isAdmin ? (
    <label className="check">
      <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      Active <span className="muted small">an inactive character (resting, retired) stays off Actor Sets and out of what happens to its groups</span>
    </label>
  ) : null
  const instanceField = isCharacter && isAdmin && !category?.player ? (
    <label className="check">
      <input type="checkbox" checked={instanceable} onChange={(e) => setInstanceable(e.target.checked)} />
      Instanceable <span className="muted small">each time it's put on a Stage, a new instance with its own values (Goblin 1, Goblin 2…)</span>
    </label>
  ) : null
  const groupsField = isCharacter && isAdmin && groups.length > 0 ? (
    <div className="field">
      <span className="field-label">Groups</span>
      <ComboTray title="Groups" emptyLabel="No group" value={(groupIds ?? []).map(String)} onChange={(next) => setGroupIds(next.map(Number))}
        sections={[{ title: 'Groups', options: groups.map((g) => ({ id: String(g.id), label: `${g.favorite ? '★ ' : ''}${g.name}`, hint: g.player_party ? 'party' : undefined })) }]} />
    </div>
  ) : null
  const tagsField = isAdmin ? <TagsField value={tags} suggestions={tagSuggestions} onChange={setTags} /> : null
  const ownerField = isAdmin && !isCharacter ? (
    <div className="field">
      <span className="field-label">Owner</span>
      <MemberPicker title={`Who owns this ${thing}`} value={owners} members={saga.members} onChange={setOwners} />
      <span className="muted small">"Owner" in who can see (here or on its folder) shows it to them.</span>
    </div>
  ) : null
  const seeField = isAdmin ? (
    <div className="field">
      <span className="field-label">Who can see this {thing}</span>
      {folderDecides ? (
        <>
          <VisibilityPicker value={folderDecides.visibility ?? null} groups={saga.groups} members={saga.members} owner disabled onChange={() => undefined} />
          <span className="muted small">Set by the folder <strong>{folderDecides.name}</strong> (its ⚙). Out of the folder, its own choice applies again.</span>
        </>
      ) : (
        <VisibilityPicker title={`Who can see this ${thing}`} value={visibility} groups={saga.groups} members={saga.members} owner={!isCharacter} onChange={setVisibility} />
      )}
      {isCharacter && <span className="muted small">Admins always see everything. Players in control and whoever can edit it always see their character.</span>}
    </div>
  ) : null
  const editField = isAdmin && isCharacter ? (
    <div className="field">
      <span className="field-label">Who can edit this {thing}</span>
      <VisibilityPicker title={`Who can edit this ${thing}`} value={editors} groups={saga.groups} members={saga.members} owner editing
        emptyLabel="Only the DM" onChange={setEditors} />
      <span className="muted small">They change what the Saga template opens to "its players" (HP, inventory…). "Owner": its players in control.</span>
    </div>
  ) : null
  const aliasField = isAdmin ? (
    <div className="field">
      <span className="field-label">Name players see</span>
      <input placeholder={(values.name as string) || 'The real name'} value={shown.alias || ''} disabled={shown.hide_name}
        onChange={(e) => changeShown({ ...shown, alias: e.target.value || null })} />
      <span className="muted small">Everywhere: Stages, sheets and lists. Players in control see the real name.</span>
    </div>
  ) : null

  // -- identity: what its players style too ---------------------------------------------------------------
  const hideField = isAdmin || controls ? (
    <label className="check">
      <input type="checkbox" checked={shown.hide_name} onChange={(e) => changeShown({ ...shown, hide_name: e.target.checked })} /> Hide the name (other players see ???)
    </label>
  ) : null
  const iconAttr = typeDef.attributes.find((a) => a.type === 'image' && !a.many && a.category === 'icon')
  const pictureAttr = typeDef.attributes.find((a) => a.type === 'image' && !a.many && a.category !== 'icon')
  const tokenIcon = ((iconAttr && values[iconAttr.key]) || (pictureAttr && values[pictureAttr.key]) || null) as ImageValue | null
  const controllerIds = (typeDef.attributes.filter((a) => a.controllers).flatMap((a) => (values[a.key] as number[] | null) || []))
  const tokenField = isCharacter && (isAdmin || controls || !resource) ? (
    <div className="field">
      <span className="field-label">Token</span>
      <div className="token-field">
        <Token id={`edit-${resource?.id ?? 'new'}`} icon={tokenIcon} name={(values.name as string) || null}
          color={tokenColor(controllerIds, saga.members)} size={88} />
        <div className="token-styles">
          <span className="muted small">How it shows on maps: its icon (else its face) in a border of its player's colour (several players: white;
            none: black). Its border style and the values on and around it come from its display template (Saga → Display templates → Token).</span>
        </div>
      </div>
    </div>
  ) : null
  const shareField = controls && isCharacter && sharing ? (
    <div className="field">
      <span className="field-label">Who else can see it</span>
      <VisibilityPicker title={`Who can see ${(values.name as string) || 'your character'}`} value={sharing} playersOnly
        groups={saga.groups} members={saga.members.filter((m) => m.id !== saga.me.member_id)} emptyLabel="Only its players (and the DM)"
        onChange={(v) => { setSharing(v); setSharingChanged(true) }} />
    </div>
  ) : null
  const relationsField = resource ? (
    <div className="field">
      <span className="field-label">Relationships</span>
      <div><RelationshipsButton subject={{ id: resource.id, name: resource.name, kind }} /></div>
    </div>
  ) : null

  const footer = (
    <>
      {error && <div className="error">{error}</div>}
      <div className="button-row end editor-footer">
        {resource && isAdmin && <button className="danger ghost" onClick={remove}>Delete</button>}
        <button className="primary" onClick={save} disabled={busy}>{resource ? 'Save' : 'Create'}</button>
      </div>
    </>
  )

  if (!tabbed) {
    return (
      <div className="form">
        {categoryField}
        {typeDef.attributes.map(field)}
        {activeField}{instanceField}{groupsField}{tagsField}{ownerField}{seeField}{editField}
        {aliasField}{hideField}
        {footer}
      </div>
    )
  }

  const inventory = fieldsIn('inventory')
  const hasArchetypes = isCharacter && (ruleset.archetypes || []).length > 0 && (isAdmin || archetypes.length > 0)
  const archetypeFields = fromArchetypes.filter((g) => g.variables.some((a) => tabOf(a) === 'variables'))
  const tabs: [EditorTab, string][] = [
    ...(isAdmin ? [['admin', 'Admin'] as [EditorTab, string]] : []),
    ['identity', 'Identity'],
    ...(hasArchetypes ? [['archetypes', 'Archetypes'] as [EditorTab, string]] : []),
    ...(fieldsIn('variables').length || archetypeFields.length ? [['variables', 'Variables'] as [EditorTab, string]] : []),
    ...(inventory.length && resource ? [['inventory', 'Inventory'] as [EditorTab, string]] : []),
    ...(actions.any && resource ? [['actions', 'Actions'] as [EditorTab, string]] : []),
  ]
  const shownTab = tabs.some(([t]) => t === tab) ? tab : 'identity'
  return (
    <div className="form resource-editor">
      <div className="tool-tabs section-tabs editor-tabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={shownTab === t} className={`tool-tab ${shownTab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      <div className="editor-body">
        {shownTab === 'admin' && (
          <div className="editor-columns">
            <section className="editor-group">
              <h3>Kind</h3>
              {categoryField}{activeField}{instanceField}{groupsField}{tagsField}
            </section>
            <section className="editor-group">
              <h3>Who</h3>
              {fieldsIn('admin').map(field)}{ownerField}{editField}{seeField}
            </section>
            {aliasField && <section className="editor-group"><h3>Its name for players</h3>{aliasField}</section>}
          </div>
        )}
        {shownTab === 'identity' && (
          <div className="editor-columns">
            <section className="editor-group">
              <h3>Name</h3>
              {fieldsIn('identity').filter((a) => a.type !== 'image').map(field)}
              {hideField}
              {shareField}
              {relationsField}
            </section>
            <section className="editor-group">
              <h3>Pictures</h3>
              {fieldsIn('identity').filter((a) => a.type === 'image').map(field)}
              {tokenField}
            </section>
          </div>
        )}
        {shownTab === 'archetypes' && (
          <ArchetypesField ruleset={ruleset} value={archetypes} disabled={!isAdmin} onChange={changeArchetypes}
            changes={archetypesChanged ? levelChanges(ruleset, savedArchetypes, archetypes, savedValues).filter((c) => !changed.has(c.key)) : []} />
        )}
        {shownTab === 'variables' && (
          <div className="editor-columns">
            {fieldsIn('variables').length > 0 && <section className="editor-group">{fieldsIn('variables').map(field)}</section>}
            {archetypeFields.map((g) => (
              <section key={g.archetype.key} className="editor-group">
                <h3>{archetypeLabel(g.archetype, g.level)}</h3>
                {g.variables.filter((a) => tabOf(a) === 'variables').map((a) => (
                  <div key={a.key} className="archetype-variable">
                    {field(a)}
                    {(a.by_level?.length ?? 0) > 0 && (
                      <span className="muted small by-level-note" title="The value it takes at each level where it changes (a counter: its max); lit: where it is now">
                        By level:{' '}
                        {levelSteps(a).map((step, i, steps) => (
                          <Fragment key={step.level}>
                            {i > 0 && ' · '}
                            <span className={i === stepAt(steps, g.level) ? 'now' : undefined}>{step.level}: {shortValue(step.value)}</span>
                          </Fragment>
                        ))}
                      </span>
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
        {shownTab === 'inventory' && resource && inventory.map((attr) => (
          <InventoryField key={attr.key} attr={attr} owner={resource} value={values[attr.key]} disabled={!canEdit(attr.key)}
            canUse={isAdmin || canEdit(attr.key)} onChange={(v) => set(attr.key, v)} />
        ))}
        {shownTab === 'actions' && resource && (
          <div className="editor-columns">
            <section className="editor-group">
              <h3>Actions</h3>
              <p className="muted small">The Saga template's actions: each runs at once (all its changes, or none), not with Save.</p>
              <ActionsPanel resourceId={resource.id} data={actions.data} onRan={refreshValues} />
            </section>
          </div>
        )}
      </div>
      {footer}
    </div>
  )
}

/** A character's inventory: its items (with what's left to use), use one, add and remove (who may change it). */
/** A character's archetypes, by category: each with its level (1 to its levels), removed with ✕; added from its
 *  category's others. Read-only for players. */
function ArchetypesField({ ruleset, value, disabled, onChange, changes }: {
  ruleset: Ruleset; value: PickedArchetype[]; disabled: boolean; onChange: (next: PickedArchetype[]) => void
  /** What Save will change in its values (gained variables, changes by level). */
  changes: { archetype: string; variable: string; from: unknown; to: unknown }[]
}) {
  const byKey = archetypesOf(ruleset)
  const set = (key: string, level: number) => onChange(value.map((p) => (p.key === key ? { ...p, level } : p)))
  return (
    <div className="editor-columns archetypes-field">
      {(ruleset.archetype_categories || []).map((category) => {
        const mine = value.filter((p) => byKey.get(p.key)?.category === category.key)
        const others = (ruleset.archetypes || []).filter((a) => a.category === category.key && !value.some((p) => p.key === a.key))
        if (disabled && !mine.length) return null
        return (
          <section key={category.key} className="editor-group">
            <h3>{category.name}</h3>
            {!mine.length && <p className="muted small">None.</p>}
            {mine.map((p) => {
              const a = byKey.get(p.key)!
              return (
                <div key={p.key} className="archetype-row">
                  <div className="archetype-name">
                    <strong>{a.name}</strong>
                    {a.description && <span className="muted small">{a.description}</span>}
                  </div>
                  {a.max_level > 1 && (
                    <label className="inline small">Level
                      <input type="number" min={1} max={a.max_level} value={p.level} disabled={disabled} aria-label={`${a.name}: level`}
                        onChange={(e) => { const n = Math.round(Number(e.target.value)); if (n >= 1 && n <= a.max_level) set(p.key, n) }} />
                      <span className="muted small">of {a.max_level}</span>
                    </label>
                  )}
                  {!disabled && <button type="button" className="small ghost" aria-label={`Take ${a.name} off`} onClick={() => onChange(value.filter((x) => x.key !== p.key))}>✕</button>}
                </div>
              )
            })}
            {!disabled && others.length > 0 && (
              <select value="" aria-label={`Add a ${category.name}`} onChange={(e) => e.target.value && onChange([...value, { key: e.target.value, level: 1 }])}>
                <option value="">＋ Add a {category.name.toLowerCase()}…</option>
                {others.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
              </select>
            )}
          </section>
        )
      })}
      {changes.length > 0 && (
        <section className="editor-group archetype-changes">
          <h3>On Save</h3>
          <ul>
            {changes.map((c) => (
              <li key={`${c.archetype}-${c.variable}`}>
                <strong>{c.variable}</strong> <span className="muted small">({c.archetype})</span>: {c.from === undefined || c.from === null ? 'new, ' : `${shortValue(c.from)} → `}
                <strong>{shortValue(c.to)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!disabled && <p className="muted small archetypes-note">Each archetype adds its variables up to its level (in Variables); a variable that
        changes by level takes its new level's value (a counter: its max; what's spent stays spent). Saved with Save.</p>}
    </div>
  )
}

function InventoryField({ attr, owner, value, disabled, canUse, onChange }: {
  attr: AttributeDef; owner: Resource; value: unknown; disabled: boolean; canUse: boolean; onChange: (v: unknown) => void
}) {
  const { sagaId, ruleset } = useSaga()
  const [picking, setPicking] = useState(false)
  const [items, setItems] = useState<Resource[]>([])
  const [error, setError] = useState('')
  const ids = useMemo(() => (Array.isArray(value) ? (value as number[]) : []), [value])
  useEffect(() => {
    if (!ids.length) return setItems([])
    api.resources(sagaId, 'item').then((all) => setItems(all.filter((r) => ids.includes(r.id)))).catch(() => undefined)
  }, [sagaId, ids])
  const byId = new Map(items.map((r) => [r.id, r]))
  const counterOf = (item: Resource) => {
    const attrs = ruleset.kinds.item?.types[item.type]?.attributes || []
    const c = attrs.find((a) => a.type === 'counter' && item.attributes[a.key] !== undefined)
    return c ? { name: c.name, value: item.attributes[c.key] as Counter } : null
  }
  const use = async (item: Resource) => {
    setError('')
    try {
      const next = await api.useItem(sagaId, owner.id, item.id)
      setItems((list) => list.map((r) => (r.id === next.id ? next : r)))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <section className="editor-group inventory">
      <h3>{attr.name} <span className="muted">{ids.length}</span></h3>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      {ids.length === 0 && <p className="muted">Nothing yet.</p>}
      <ul className="inventory-list">
        {ids.map((id, i) => {
          const item = byId.get(id)
          const counter = item ? counterOf(item) : null
          const path = item ? resourcePath(sagaId, 'item', item.id) : null
          return (
            <li key={`${id}-${i}`} className="inventory-row">
              {item ? <ResourceIcon resource={item} className="inventory-icon round" /> : <span className="inventory-icon" />}
              <span className="inventory-name">
                {item && path ? <Link to={path}>{item.name}</Link> : <span className="muted">{item ? item.name : '…'}</span>}
                <span className="muted small">{item ? ruleset.kinds.item?.types[item.type]?.name : ''}</span>
              </span>
              {counter && <span className="inventory-uses small">{counter.name} <strong>{counter.value.current}</strong> / {counter.value.max}</span>}
              {counter && canUse && (
                <button type="button" className="small" disabled={counter.value.current <= 0} onClick={() => item && void use(item)}
                  title={`Use it: one less ${counter.name.toLowerCase()}`}>Use</button>
              )}
              {!disabled && <button type="button" className="small ghost" aria-label={`Remove ${item?.name ?? ''}`}
                onClick={() => onChange(ids.filter((_, j) => j !== i))}>✕</button>}
            </li>
          )
        })}
      </ul>
      {!disabled && <button type="button" className="small" onClick={() => setPicking(true)}>＋ Add items…</button>}
      {!disabled && ids.length > 0 && <p className="muted small">Added or removed items are kept with Save; using one counts at once.</p>}
      <ResourcePicker open={picking} title={attr.name} kinds={attr.of?.kind ? [attr.of.kind] : sagaKinds(ruleset)} multiple
        onPick={(picked) => onChange([...ids, ...picked])} onClose={() => setPicking(false)} />
    </section>
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

/** One variable's field (its type's input), as in the character and item editors; groups' variables too. */
export function AttributeField({ attr, kind, self, value, disabled, onChange, onMain }: {
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
      return (
        <div className="field">
          <span className="field-label">{attr.name}</span>
          <MemberPicker title={attr.name} value={ids} members={saga.members} disabled={disabled} emptyLabel="Nobody" onChange={onChange} />
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
    case 'calculated':
      return (
        <div className="field">
          <span className="field-label">{attr.name}</span>
          <span className="calc-value" title="Worked out by the Saga template: nobody types it">
            {value === null || value === undefined ? '—' : String(value)} <span className="muted small">calculated</span>
          </span>
        </div>
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
