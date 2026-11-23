/**
 * The Saga template (DM): what this Saga is built on. Per kind (characters, items, documents, locations): the
 * variables every resource of the kind has, and the types (character types, item categories...) with their own
 * variables and who sees the shared ones. Then what a Saga made from this template starts with (groups, Actors
 * Scene tabs, turn order), and export / import as a JSON file. See docs/concepts/rulesets.md ("Saga templates").
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import type { SagaTemplateDoc, SagaTemplateView, StartingGroup, StartingTab, TemplateVariable } from '../../api/types'
import ColorPicker from '../../components/ColorPicker'
import { useSaga } from '../SagaContext'
import RollTypesEditor from '../../stage/sets/dice/RollTypesEditor'
import { DIE_SIDES, type RollType } from '../../stage/sets/dice/types'
import { ActionsTab, CalcEditor } from './RulesEditors'

const KIND_LABELS: Record<string, { title: string; one: string; types: string; typeOne: string; hint: string }> = {
  character: { title: 'Characters', one: 'character', types: 'Character types', typeOne: 'type',
    hint: 'Categories (Player, Major NPC…) are based on a type: they share its variables.' },
  item: { title: 'Items', one: 'item', types: 'Item categories', typeOne: 'category', hint: 'Each category adds its own variables.' },
  document: { title: 'Documents', one: 'document', types: 'Document types', typeOne: 'type', hint: 'Documents are pages of text or pictures; variables add details.' },
  location: { title: 'Locations', one: 'location', types: 'Location types', typeOne: 'type', hint: 'The map is the location\'s own; variables add details.' },
  event: { title: 'Events', one: 'event', types: 'Event types', typeOne: 'type', hint: 'Every event has one date (the timeline); variables add details.' },
}
const TYPE_LABELS: Record<string, string> = {
  text: 'Text', rich_text: 'Long text', number: 'Number', boolean: 'Yes / no', choice: 'Choice', counter: 'Counter (current / max)',
  image: 'Picture', member_ref: 'Members', resource_ref: 'Reference', list: 'List', pages: 'Pages', date: 'Date',
  calculated: 'Calculated',
}
// Viewers see what players see and never edit, so they're no choice of their own
const ROLES: [string, string, string][] = [['players', 'Players', 'Every player (and viewer: they see what players see)'],
  ['controllers', 'Its players', 'Its players in control, and whoever its "who can edit" names']]
const LAYOUTS: [string, string][] = [['grid', 'Grid'], ['row', 'Row'], ['column', 'Column'], ['circle', 'Circle'], ['bar', 'Turn bar'], ['boundary', 'Boundary'], ['free', 'Free']]

/** What can happen to a resource of this type in an event: suggested when the DM adds a sub-event. */
function SubEventList({ kind, typeKey, names, run }: { kind: string; typeKey: string; names: string[]; run: Run }) {
  const [draft, setDraft] = useState('')
  const save = (next: string[]) => void run('type.update', { kind, type: typeKey, changes: { sub_events: next } })
  return (
    <div className="field">
      <span className="field-label">In events, it can be…</span>
      <div className="chips">
        {names.map((n) => <span key={n} className="chip">{n}<button className="small ghost" aria-label={`Remove ${n}`} onClick={() => save(names.filter((x) => x !== n))}>✕</button></span>)}
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { save([...names, draft.trim()]); setDraft('') } }}>
          <input className="small" placeholder="e.g. discovered" value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} aria-label="New sub-event" />
        </form>
      </div>
    </div>
  )
}

const locked = (v: TemplateVariable) => Boolean(v.required || v.controllers || v.parent || v.ends)
type Run = (name: string, args: Record<string, unknown>) => Promise<boolean>

/** Who sees / edits: the DM always; players (viewers see what they see), the character's own players. */
function RoleChips({ value, kind, onChange, disabled = false }: { value: string[]; kind: string; onChange: (v: string[]) => void; disabled?: boolean }) {
  const current = value.filter((k) => k !== 'viewers')
  return (
    <div className="chips">
      <span className="chip on" title="The DM always does">DM</span>
      {ROLES.filter(([k]) => k !== 'controllers' || kind === 'character').map(([key, label, hint]) => {
        const on = value.includes(key)
        return (
          <button key={key} type="button" disabled={disabled} className={`chip ${on ? 'on' : ''}`} title={hint}
            onClick={() => onChange(on ? current.filter((x) => x !== key) : [...current, key])}>{label}</button>
        )
      })}
    </div>
  )
}

function DefaultField({ variable, onSave }: { variable: TemplateVariable; onSave: (v: unknown) => void }) {
  const value = variable.default
  switch (variable.type) {
    case 'text':
    case 'rich_text':
    case 'number':
      return (
        <label>Starts as
          <input key={`${variable.key}-${String(value)}`} type={variable.type === 'number' ? 'number' : 'text'} defaultValue={value === null || value === undefined ? '' : String(value)}
            onBlur={(e) => {
              const raw = e.target.value
              const next = raw === '' ? null : variable.type === 'number' ? Number(raw) : raw
              if (next !== value) onSave(next)
            }} />
        </label>
      )
    case 'boolean':
      return <label className="check"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onSave(e.target.checked)} /> Starts as yes</label>
    case 'choice':
      return (
        <label>Starts as
          <select value={(value as string) ?? ''} onChange={(e) => onSave(e.target.value || null)}>
            <option value="">—</option>
            {(variable.options || []).map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
      )
    case 'counter': {
      const c = (value as { current: number; max: number }) || { current: 0, max: 0 }
      return (
        <div className="grid-2">
          <label className="inline">Starts at<input key={`c-${c.current}`} type="number" defaultValue={c.current} onBlur={(e) => Number(e.target.value) !== c.current && onSave({ ...c, current: Number(e.target.value) })} /></label>
          <label className="inline">Max<input key={`m-${c.max}`} type="number" defaultValue={c.max} onBlur={(e) => Number(e.target.value) !== c.max && onSave({ ...c, max: Number(e.target.value) })} /></label>
        </div>
      )
    }
    default:
      return null
  }
}

function VariableEditor({ kind, typeKey, variable, doc, run, onGone }: {
  kind: string; typeKey: string | null; variable: TemplateVariable; doc: SagaTemplateDoc; run: Run; onGone: () => void
}) {
  const base = { kind, ...(typeKey ? { type: typeKey } : {}), key: variable.key }
  const update = (changes: Record<string, unknown>) => run('variable.update', { ...base, changes })
  return (
    <div className="tool-panel">
      <div className="tool-head">
        <strong>{variable.name}</strong>
        <span className="muted small">{TYPE_LABELS[variable.type] ?? variable.type}{variable.many ? ' (several)' : ''}</span>
      </div>
      <label>Name<input key={variable.key + variable.name} defaultValue={variable.name}
        onBlur={(e) => e.target.value.trim() && e.target.value !== variable.name && void update({ name: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /></label>
      {kind === 'group' ? (
        <p className="muted small">Groups are yours (the DM's): you see and edit their values, in Characters → Groups.</p>
      ) : (
        <>
          <div className="field"><span className="field-label">Who sees it</span>
            <RoleChips value={variable.view || []} kind={kind} onChange={(view) => void update({ view })} />
          </div>
          {variable.type !== 'calculated' && (
            <div className="field"><span className="field-label">Who edits it</span>
              <RoleChips value={variable.edit || []} kind={kind} onChange={(edit) => void update({ edit })} />
            </div>
          )}
        </>
      )}
      {variable.type === 'calculated' && <CalcEditor kind={kind} variable={variable} doc={doc} onSave={(calc) => void update({ calc })} />}
      {variable.type === 'choice' && (
        <label>Options <span className="muted small">(one per line)</span>
          <textarea key={(variable.options || []).join('|')} rows={4} defaultValue={(variable.options || []).join('\n')}
            onBlur={(e) => {
              const options = e.target.value.split('\n').map((o) => o.trim()).filter(Boolean)
              if (options.join('|') !== (variable.options || []).join('|')) void update({ options })
            }} />
        </label>
      )}
      <DefaultField variable={variable} onSave={(value) => void update({ default: value })} />
      {kind !== 'group' && ['number', 'counter'].includes(variable.type) && (
        <label className="check"><input type="checkbox" checked={Boolean(variable.sortable)} onChange={(e) => void update({ sortable: e.target.checked })} /> Lists can sort by it</label>
      )}
      <div className="button-row">
        <button className="small" onClick={() => void run('variable.move', { ...base, delta: -1 })}>↑ Up</button>
        <button className="small" onClick={() => void run('variable.move', { ...base, delta: 1 })}>↓ Down</button>
        <span className="spacer" />
        {locked(variable) ? <span className="muted small">Needed by the app</span> : (
          <button className="small ghost danger" onClick={() => {
            if (!window.confirm(`Delete "${variable.name}"? Values already saved stay hidden on the resources.`)) return
            void run('variable.delete', base).then((ok) => ok && onGone())
          }}>Delete</button>
        )}
      </div>
    </div>
  )
}

function AddVariable({ kind, typeKey, types, run, onAdded }: { kind: string; typeKey: string | null; types: string[]; run: Run; onAdded: (name: string) => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState(types[0] ?? 'text')
  const add = () => {
    if (!name.trim()) return
    void run('variable.add', { kind, ...(typeKey ? { type: typeKey } : {}), variable: { name: name.trim(), type } }).then((ok) => {
      if (ok) { onAdded(name.trim()); setName('') }
    })
  }
  return (
    <div className="add-variable">
      <input placeholder="New variable" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="New variable name" />
      <select value={type} onChange={(e) => setType(e.target.value)} aria-label="New variable type">
        {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}
      </select>
      <button className="small" disabled={!name.trim()} onClick={add}>＋ Add</button>
    </div>
  )
}

function VariableList({ variables, selected, onSelect, who = true }: { variables: TemplateVariable[]; selected: string | null; onSelect: (key: string) => void; who?: boolean }) {
  if (!variables.length) return <p className="muted small">None yet.</p>
  return (
    <div className="path-list">
      {variables.map((v) => (
        <button key={v.key} className={`path-row ${selected === v.key ? 'on' : ''}`} onClick={() => onSelect(v.key)}>
          <span className="muted small var-type">{TYPE_LABELS[v.type] ?? v.type}</span>
          <span>{v.name}</span>
          {who && <span className="muted small">{(v.view || []).includes('players') ? 'players see' : 'DM'}</span>}
        </button>
      ))}
    </div>
  )
}

function KindEditor({ kind, view, run }: { kind: string; view: SagaTemplateView; run: Run }) {
  const labels = KIND_LABELS[kind]
  const data = view.template.kinds[kind] || { attributes: [], types: {} }
  const shared = data.attributes || []
  const typeKeys = Object.keys(data.types || {})
  const [typeKey, setTypeKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ type: string | null; key: string } | null>(null)
  const [newType, setNewType] = useState('')
  const type = typeKey ? data.types[typeKey] : null
  const own = type?.attributes || []
  const variable = selected ? (selected.type ? data.types[selected.type]?.attributes || [] : shared).find((v) => v.key === selected.key) : null
  const used = (key: string) => view.usage[kind]?.[key] ?? 0
  const findAdded = (list: TemplateVariable[], typeOf: string | null) => (name: string) => {
    const made = [...list].reverse().find((v) => v.name === name)
    if (made) setSelected({ type: typeOf, key: made.key })
  }
  // Variables just added arrive with the next view: select them then
  const pending = useRef<{ name: string; type: string | null } | null>(null)
  useEffect(() => {
    if (!pending.current) return
    const list = pending.current.type ? data.types[pending.current.type]?.attributes || [] : shared
    findAdded(list, pending.current.type)(pending.current.name)
    pending.current = null
  })

  return (
    <div className="tpl-kind">
      <section className="tpl-col">
        <h3>Every {labels.one}</h3>
        <p className="muted small">Variables all {labels.title.toLowerCase()} have.</p>
        <VariableList variables={shared} selected={selected?.type === null ? selected.key : null} onSelect={(key) => setSelected({ type: null, key })} />
        <AddVariable kind={kind} typeKey={null} types={view.new_types} run={run} onAdded={(name) => { pending.current = { name, type: null } }} />
        <h3>{labels.types}</h3>
        <p className="muted small">{labels.hint}</p>
        <div className="chips">
          {typeKeys.map((key) => (
            <button key={key} type="button" className={`chip ${typeKey === key ? 'on' : ''}`} onClick={() => setTypeKey(typeKey === key ? null : key)}>
              {data.types[key].name} <span className="muted">{used(key) || ''}</span>
            </button>
          ))}
        </div>
        <div className="add-variable">
          <input placeholder={`New ${labels.typeOne}`} value={newType} onChange={(e) => setNewType(e.target.value)} aria-label={`New ${labels.typeOne}`} />
          <button className="small" disabled={!newType.trim()} onClick={() => void run('type.add', { kind, name: newType }).then((ok) => ok && setNewType(''))}>＋ Add</button>
        </div>
      </section>
      <section className="tpl-col">
        {type && typeKey ? (
          <div className="tool-panel">
            <div className="grid-2">
              <label>Name<input key={`${typeKey}-${type.name}`} defaultValue={type.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== type.name && void run('type.update', { kind, type: typeKey, changes: { name: e.target.value } })} /></label>
              <label>Plural<input key={`${typeKey}-${type.plural}`} defaultValue={type.plural || type.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== type.plural && void run('type.update', { kind, type: typeKey, changes: { plural: e.target.value } })} /></label>
            </div>
            {kind !== 'event' && <SubEventList kind={kind} typeKey={typeKey} names={type.sub_events ?? []} run={run} />}
            <h3>{type.name}'s own variables</h3>
            <VariableList variables={own} selected={selected?.type === typeKey ? selected.key : null} onSelect={(key) => setSelected({ type: typeKey, key })} />
            <AddVariable kind={kind} typeKey={typeKey} types={view.new_types} run={run} onAdded={(name) => { pending.current = { name, type: typeKey } }} />
            {shared.length > 0 && (
              <>
                <h3>Who sees the shared variables, for {type.plural || type.name}</h3>
                <div className="override-list">
                  {shared.filter((v) => !v.required).map((v) => {
                    const override = type.overrides?.[v.key]?.view
                    return (
                      <div key={v.key} className="override-row">
                        <span>{v.name}</span>
                        <RoleChips value={override ?? v.view ?? []} kind={kind}
                          onChange={(next) => void run('override.set', { kind, type: typeKey, key: v.key, view: next })} />
                        {override && <button className="small ghost" title="Like every type" onClick={() => void run('override.set', { kind, type: typeKey, key: v.key, view: null })}>Reset</button>}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            <div className="button-row">
              <span className="muted small">{used(typeKey)} {used(typeKey) === 1 ? labels.one : labels.title.toLowerCase()}</span>
              <span className="spacer" />
              <button className="small ghost danger" disabled={used(typeKey) > 0 || typeKeys.length < 2}
                title={used(typeKey) > 0 ? 'Move or delete its resources first' : undefined}
                onClick={() => window.confirm(`Delete "${type.name}"?`) && void run('type.delete', { kind, type: typeKey }).then((ok) => ok && setTypeKey(null))}>
                Delete {labels.typeOne}
              </button>
            </div>
          </div>
        ) : <p className="muted">Pick a {labels.typeOne} to see its own variables.</p>}
      </section>
      <section className="tpl-col">
        {variable ? (
          <VariableEditor key={`${selected?.type}-${variable.key}`} kind={kind} typeKey={selected?.type ?? null} variable={variable} doc={view.template} run={run}
            onGone={() => setSelected(null)} />
        ) : <p className="muted">Pick a variable to edit it.</p>}
      </section>
    </div>
  )
}

/** The Groups tab: the variables every group of characters has (a party's shared gold...). Groups have no types. */
function GroupVariables({ view, run }: { view: SagaTemplateView; run: Run }) {
  const variables = view.template.group_attributes || []
  const [selected, setSelected] = useState<string | null>(null)
  const variable = variables.find((v) => v.key === selected) ?? null
  // A variable just added arrives with the next view: select it then
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (!pending.current) return
    const made = [...variables].reverse().find((v) => v.name === pending.current)
    if (made) setSelected(made.key)
    pending.current = null
  })
  return (
    <div className="tpl-kind">
      <section className="tpl-col">
        <h3>Every group</h3>
        <p className="muted small">Variables every group of characters has (Characters → Groups): what a party or an encounter
          holds together, like the party's gold. Each group's values are set in its editor.</p>
        <VariableList variables={variables} selected={selected} onSelect={setSelected} who={false} />
        <AddVariable kind="group" typeKey={null} types={view.new_types} run={run} onAdded={(name) => { pending.current = name }} />
      </section>
      <section className="tpl-col">
        {variable ? (
          <VariableEditor key={variable.key} kind="group" typeKey={null} variable={variable} doc={view.template} run={run} onGone={() => setSelected(null)} />
        ) : <p className="muted">Pick a variable to edit it.</p>}
      </section>
    </div>
  )
}

/** No dice rolls in the template: the usual polyhedral set (as the server reads it). */
const DEFAULT_ROLLS: RollType[] = DIE_SIDES.map((sides) => ({ id: `d${sides}`, name: `d${sides}`, dice: [{ count: 1, sides }], read: 'sum', x: 0, modifier: 0 }))

function StartingContent({ view, run }: { view: SagaTemplateView; run: Run }) {
  const starting = view.template.starting || {}
  const groups = starting.groups || []
  const tabs = starting.actors_tabs || []
  const numbers = (view.template.kinds.character?.attributes || []).filter((v) => v.type === 'number')
  const setGroups = (next: StartingGroup[]) => run('starting.set', { changes: { groups: next } })
  const setTabs = (next: StartingTab[]) => run('starting.set', { changes: { actors_tabs: next } })
  return (
    <div className="tpl-starting">
      <section className="tpl-col">
        <h3>Starting groups</h3>
        <p className="muted small">The character groups a new Saga from this template starts with (this Saga's own are under Characters → Groups).</p>
        {groups.map((g, i) => (
          <div key={i} className="starting-row">
            <input defaultValue={g.name} key={`${i}-${g.name}`} aria-label="Group name"
              onBlur={(e) => e.target.value.trim() && e.target.value !== g.name && void setGroups(groups.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <ColorPicker label="Group color" value={g.color} onChange={(color) => void setGroups(groups.map((x, j) => (j === i ? { ...x, color } : x)))} />
            <label className="check"><input type="checkbox" checked={g.player_party} onChange={(e) => void setGroups(groups.map((x, j) => (j === i ? { ...x, player_party: e.target.checked } : x)))} /> Player party</label>
            <button className="small ghost" aria-label="Remove group" onClick={() => void setGroups(groups.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="small" onClick={() => void setGroups([...groups, { name: `Group ${groups.length + 1}`, color: '#6cc9e0', player_party: false, active: false, favorite: false }])}>＋ Group</button>
      </section>
      <section className="tpl-col">
        <h3>Actors Scene tabs</h3>
        <p className="muted small">The tabs a new Actors Scene starts with: their names and layouts (the layouts' settings are the Scene's).</p>
        {tabs.map((t, i) => (
          <div key={i} className="starting-row">
            <input defaultValue={t.name} key={`${i}-${t.name}`} aria-label="Tab name"
              onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && void setTabs(tabs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <select value={t.layout} aria-label="Layout" onChange={(e) => void setTabs(tabs.map((x, j) => (j === i ? { ...x, layout: e.target.value } : x)))}>
              {LAYOUTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <label className="check"><input type="checkbox" checked={t.turns} onChange={(e) => void setTabs(tabs.map((x, j) => (j === i ? { ...x, turns: e.target.checked } : x)))} /> Turns</label>
            <button className="small ghost" aria-label="Remove tab" disabled={tabs.length < 2} onClick={() => void setTabs(tabs.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="small" disabled={tabs.length >= 12} onClick={() => void setTabs([...tabs, { name: `Tab ${tabs.length + 1}`, layout: 'grid', turns: false }])}>＋ Tab</button>
        <label>Turns follow
          <select value={starting.turn_order ?? ''} onChange={(e) => void run('starting.set', { changes: { turn_order: e.target.value || null } })}>
            <option value="">The DM's order</option>
            {numbers.map((v) => <option key={v.key} value={v.key}>{v.name}</option>)}
          </select>
        </label>
      </section>
      <section className="tpl-col">
        <h3>Dice rolls</h3>
        <p className="muted small">The roll types a new Dice roller starts with (each Dice roller can change its own).</p>
        <RollTypesEditor value={starting.dice_rolls ?? DEFAULT_ROLLS} onSave={(dice_rolls) => run('starting.set', { changes: { dice_rolls } })} />
      </section>
      <section className="tpl-col">
        <h3>Also saved in the file</h3>
        <p className="muted small">What this Saga made its own goes with an export, so a Saga made from the file starts the same:</p>
        <ul className="tpl-links">
          <li><Link to="../characters">{view.categories.length} character categories</Link> <span className="muted small">({view.categories.map((c) => c.name).join(', ')})</span></li>
          <li><Link to="../saga/displays">{view.display_templates} display templates</Link> <span className="muted small">(how characters and items look)</span></li>
          <li><Link to="../efx/fog">{view.fog_presets} fog presets</Link></li>
        </ul>
        <p className="muted small">Its actions (rests and other rules) are in the Actions tab, and go with an export too.</p>
      </section>
    </div>
  )
}

export default function SagaTemplatePage() {
  const { sagaId, refreshSaga } = useSaga()
  const [view, setView] = useState<SagaTemplateView | null>(null)
  const [kind, setKind] = useState('character')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => { api.sagaTemplate(sagaId).then(setView).catch((e: Error) => setError(e.message)) }, [sagaId])

  const run: Run = async (name, args) => {
    setError('')
    try {
      setView(await api.templateCommand(sagaId, name, args))
      void refreshSaga() // forms and sheets read the new variables
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  const exportFile = async () => {
    const doc = await api.exportTemplate(sagaId)
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${(doc.name || 'saga-template').replace(/[^\w-]+/g, '-').toLowerCase()}.sagacraft.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importFile = async (picked: File | undefined) => {
    if (!picked) return
    setError('')
    setNote('')
    try {
      const doc = JSON.parse(await picked.text()) as SagaTemplateDoc
      if (!window.confirm(`Use "${doc.name ?? picked.name}" as this Saga's template? Its variables replace these; its categories, display templates and fog presets are added where missing.`)) return
      const result = await api.importTemplate(sagaId, doc)
      setView(result)
      void refreshSaga()
      setNote(`Imported. Added: ${result.added.categories} categories, ${result.added.display_templates} display templates, ${result.added.fog_presets} fog presets.`)
    } catch (e) {
      setError(e instanceof SyntaxError ? 'That file is not JSON.' : (e as Error).message)
    } finally {
      if (file.current) file.current.value = ''
    }
  }

  if (!view) return <div className="page-message">{error || 'Loading the template…'}</div>
  const doc = view.template
  return (
    <div className="page page-full tpl-page">
      <header className="location-header"><h1>Saga template</h1></header>
      <header className="tpl-header">
        <div className="tpl-title">
          <input className="tpl-name" key={doc.name} defaultValue={doc.name} aria-label="Template name"
            onBlur={(e) => e.target.value.trim() && e.target.value !== doc.name && void run('info.set', { changes: { name: e.target.value } })} />
          <input className="tpl-description" key={doc.description} defaultValue={doc.description ?? ''} placeholder="What it's for (system, style)" aria-label="Description"
            onBlur={(e) => e.target.value !== (doc.description ?? '') && void run('info.set', { changes: { description: e.target.value } })} />
          <span className="muted small">{view.own_copy ? "This Saga's own template." : 'The built-in template, until you change something.'} Changes apply to this Saga at once.</span>
        </div>
        <div className="button-row">
          <button onClick={() => void exportFile()}>⇩ Export…</button>
          <button onClick={() => file.current?.click()}>⇧ Import…</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
        </div>
      </header>
      {error && <div className="error" onClick={() => setError('')}>{error}</div>}
      {note && <div className="notice" onClick={() => setNote('')}>{note}</div>}
      <div className="tool-tabs section-tabs" role="tablist">
        {view.kinds.map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={`tool-tab ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{KIND_LABELS[k]?.title ?? k}</button>
        ))}
        <button role="tab" aria-selected={kind === 'group'} className={`tool-tab ${kind === 'group' ? 'on' : ''}`} onClick={() => setKind('group')}>Groups</button>
        <button role="tab" aria-selected={kind === 'actions'} className={`tool-tab ${kind === 'actions' ? 'on' : ''}`} onClick={() => setKind('actions')}>Actions</button>
        <button role="tab" aria-selected={kind === 'starting'} className={`tool-tab ${kind === 'starting' ? 'on' : ''}`} onClick={() => setKind('starting')}>Starting content</button>
      </div>
      {kind === 'starting' ? <StartingContent view={view} run={run} />
        : kind === 'actions' ? <ActionsTab view={view} run={run} />
        : kind === 'group' ? <GroupVariables view={view} run={run} />
          : <KindEditor key={kind} kind={kind} view={view} run={run} />}
    </div>
  )
}
