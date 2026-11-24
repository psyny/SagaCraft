/**
 * The Saga template (DM): what this Saga is built on. Per kind (characters, items, documents, locations): the
 * variables every resource of the kind has, and the types (character types, item categories...) with their own
 * variables and who sees the shared ones. Then what a Saga made from this template starts with (groups, Actors
 * Scene tabs, turn order), and export / import as a JSON file. See docs/concepts/rulesets.md ("Saga templates").
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import type { LevelChange, SagaTemplateDoc, SagaTemplateView, StartingGroup, StartingTab, TemplateArchetype, TemplateVariable } from '../../api/types'
import Modal from '../../components/Modal'
import { describeByLevel, shortValue, valueAt } from '../archetypes'
import ColorPicker from '../../components/ColorPicker'
import { useSaga } from '../SagaContext'
import RollTypesEditor from '../../stage/sets/dice/RollTypesEditor'
import { DIE_SIDES, type RollType } from '../../stage/sets/dice/types'
import { ActionsTab, CalcEditor } from './RulesEditors'
import TemplatesPage from '../templates/TemplatesPage'

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
      {ROLES.filter(([k]) => k !== 'controllers' || kind === 'character' || kind === 'archetype').map(([key, label, hint]) => {
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

function VariableEditor({ kind, typeKey, variable, doc, run, onGone, maxLevel }: {
  kind: string; typeKey: string | null; variable: TemplateVariable; doc: SagaTemplateDoc; run: Run; onGone: () => void
  /** An archetype's variable: the archetype's levels (it comes at one of them). */
  maxLevel?: number
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
      {maxLevel !== undefined && (
        <label>Comes at level
          <select value={variable.level ?? 1} onChange={(e) => void update({ level: Number(e.target.value) })}>
            {Array.from({ length: maxLevel }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="muted small">A character has it from this level of the archetype on.</span>
        </label>
      )}
      {maxLevel !== undefined && ['number', 'counter', 'text', 'boolean', 'choice'].includes(variable.type) && (
        <ByLevelEditor variable={variable} maxLevel={maxLevel} onSave={(by_level) => void update({ by_level })} />
      )}
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

/** An archetype's variables can be these (no calculated or dates). */
const ARCHETYPE_TYPES = ['text', 'rich_text', 'number', 'boolean', 'choice', 'counter']

/** One level's value for a variable: a number (a counter: its max), words, yes/no, one of a choice's options. */
function LevelValueInput({ variable, value, onSave }: { variable: TemplateVariable; value: unknown; onSave: (v: unknown) => void }) {
  if (variable.type === 'boolean') return <label className="check small"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onSave(e.target.checked)} /> yes</label>
  if (variable.type === 'choice') {
    return (
      <select value={(value as string) ?? ''} onChange={(e) => onSave(e.target.value)} aria-label="Its value">
        {(variable.options || []).map((o) => <option key={o}>{o}</option>)}
      </select>
    )
  }
  const numeric = variable.type === 'number' || variable.type === 'counter'
  return (
    <input className="amount" type={numeric ? 'number' : 'text'} min={variable.type === 'counter' ? 0 : undefined} key={String(value)}
      defaultValue={value === null || value === undefined ? '' : String(value)} aria-label={variable.type === 'counter' ? 'Its max' : 'Its value'}
      onBlur={(e) => { const next = numeric ? Number(e.target.value) : e.target.value; if (next !== value) onSave(next) }} />
  )
}

/**
 * Changes by level (an archetype's variable): only the levels where it changes, each with its value from then on (a
 * counter: its max), and the whole progression in one line ("3: 4 · 7: 5 · 15: 6").
 */
function ByLevelEditor({ variable, maxLevel, onSave }: { variable: TemplateVariable; maxLevel: number; onSave: (changes: LevelChange[]) => void }) {
  const changes = variable.by_level || []
  const from = variable.level ?? 1
  const free = Array.from({ length: maxLevel - from }, (_, i) => from + 1 + i).filter((n) => !changes.some((c) => c.level === n))
  const set = (next: LevelChange[]) => onSave([...next].sort((a, b) => a.level - b.level))
  const start = variable.type === 'counter' ? (variable.default as { max?: number } | null)?.max ?? 0 : variable.default
  return (
    <div className="field by-level">
      <span className="field-label">Changes by level <span className="muted small">(only the levels where it changes{variable.type === 'counter' ? '; its max' : ''})</span></span>
      <div className="by-level-row muted small"><span className="by-level-at">Level {from}</span><span>{shortValue(start)} <span className="muted">(it comes; "Starts as" below)</span></span></div>
      {changes.map((c, i) => (
        <div key={c.level} className="by-level-row">
          <select className="by-level-at" value={c.level} aria-label="At level"
            onChange={(e) => set(changes.map((x, j) => (j === i ? { ...x, level: Number(e.target.value) } : x)))}>
            {[c.level, ...free].sort((a, b) => a - b).map((n) => <option key={n} value={n}>Level {n}</option>)}
          </select>
          <LevelValueInput variable={variable} value={c.value} onSave={(value) => set(changes.map((x, j) => (j === i ? { ...x, value } : x)))} />
          <button type="button" className="small ghost" aria-label={`No change at level ${c.level}`} onClick={() => set(changes.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      {free.length > 0 ? (
        <button type="button" className="small" onClick={() => {
          const at = free[0]
          set([...changes, { level: at, value: valueAt({ ...variable, by_level: changes }, at - 1) ?? (variable.type === 'counter' ? 0 : variable.default ?? null) }])
        }}>＋ A change at a level</button>
      ) : <span className="muted small">{maxLevel <= from ? 'The archetype has no later levels.' : 'A change at every level.'}</span>}
      {changes.length > 0 && <span className="muted small by-level-line">By level: {describeByLevel(variable)}</span>}
    </div>
  )
}

/** An archetype's levels as a table, like a class table in a rulebook: a row per level, a column per variable; where
 *  a variable comes ("new") and where it changes stand out; click a column to edit it. */
function ProgressionTable({ archetype, onPick }: { archetype: TemplateArchetype; onPick: (key: string) => void }) {
  const variables = [...archetype.variables].sort((a, b) => (a.level ?? 1) - (b.level ?? 1))
  if (!variables.length) return <p className="muted">No variables yet: add them in Variables.</p>
  const levels = Array.from({ length: archetype.max_level }, (_, i) => i + 1)
  return (
    <div className="progression-wrap">
      <table className="progression">
        <thead>
          <tr>
            <th>Level</th>
            {variables.map((v) => (
              <th key={v.key}><button type="button" className="link-button" title="Edit it" onClick={() => onPick(v.key)}>{v.name}</button>
                {v.type === 'counter' && <span className="muted small"> max</span>}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {levels.map((n) => (
            <tr key={n}>
              <th>{n}</th>
              {variables.map((v) => {
                const comes = (v.level ?? 1) === n
                const changes = (v.by_level || []).some((c) => c.level === n)
                const value = valueAt(v, n)
                return (
                  <td key={v.key} className={comes ? 'comes' : changes ? 'changes' : value === undefined ? 'before' : 'same'}
                    title={comes ? 'It comes at this level' : changes ? 'It changes at this level' : undefined}>
                    {value === undefined ? '' : shortValue(value)}{comes && <span className="progression-tag">new</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small"><span className="progression-key comes">new</span> it comes · <span className="progression-key changes">bold</span> it changes · faded: the same as before</p>
    </div>
  )
}

type ArchetypeTab = 'settings' | 'variables' | 'progression'

/** An archetype in a window: Settings, its Variables by level (the variable editor beside them), its Progression. */
function ArchetypeWindow({ archetype, view, run, error, onGone }: {
  archetype: TemplateArchetype; view: SagaTemplateView; run: Run; error: string; onGone: () => void
}) {
  const doc = view.template
  const categories = doc.archetype_categories || []
  const [tab, setTab] = useState<ArchetypeTab>('settings')
  const [variableKey, setVariableKey] = useState<string | null>(null)
  const variable = archetype.variables.find((v) => v.key === variableKey) ?? null
  const used = view.archetype_usage?.[archetype.key] ?? 0
  // A variable just added arrives with the next view: select it then
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (!pending.current) return
    const made = [...archetype.variables].reverse().find((v) => v.name === pending.current)
    if (made) setVariableKey(made.key)
    pending.current = null
  })
  const levels = Array.from({ length: archetype.max_level }, (_, i) => i + 1)
  const update = (changes: Record<string, unknown>) => void run('archetype.update', { key: archetype.key, changes })
  return (
    <div className="archetype-window">
      {error && <div className="error">{error}</div>}
      <div className="tool-tabs" role="tablist" aria-label="The archetype">
        {([['settings', 'Settings'], ['variables', `Variables (${archetype.variables.length})`], ['progression', 'Progression']] as [ArchetypeTab, string][]).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tool-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      {tab === 'settings' && (
        <section className="archetype-settings">
          <div className="grid-2">
            <label>Name<input key={`${archetype.key}-${archetype.name}`} defaultValue={archetype.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== archetype.name && update({ name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /></label>
            <label>Category
              <select value={archetype.category} onChange={(e) => update({ category: e.target.value })}>
                {categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <label>Description<textarea key={`${archetype.key}-${archetype.description}`} rows={3} defaultValue={archetype.description}
            placeholder="What it is in the story" onBlur={(e) => e.target.value !== archetype.description && update({ description: e.target.value })} /></label>
          <label>Levels
            <input key={`${archetype.key}-${archetype.max_level}`} type="number" min={1} max={30} defaultValue={archetype.max_level}
              onBlur={(e) => { const n = Math.round(Number(e.target.value)); if (n >= 1 && n !== archetype.max_level) update({ max_level: n }) }} />
            <span className="muted small">1 for an archetype without levels (a race, a talent): it shows without a number ("Dwarf"; "Fighter 5").</span>
          </label>
          <div className="button-row">
            <span className="muted small">{used ? `${used} character${used > 1 ? 's have' : ' has'} it` : 'No character has it yet'}</span>
            <span className="spacer" />
            <button className="small ghost danger" disabled={used > 0} title={used ? 'Take it off its characters first' : undefined}
              onClick={() => window.confirm(`Delete the archetype "${archetype.name}"?`) && void run('archetype.delete', { key: archetype.key }).then((ok) => ok && onGone())}>
              Delete the archetype
            </button>
          </div>
        </section>
      )}
      {tab === 'variables' && (
        <div className="archetype-variables">
          <section className="tpl-col">
            <p className="muted small">The variables it gives a character, by the level each comes at. One that changes at later levels
              (a fighter's superiority dice) is one variable: its changes by level are in its editor.</p>
            {!archetype.variables.length && <p className="muted small">None yet.</p>}
            {levels.filter((n) => archetype.variables.some((v) => (v.level ?? 1) === n)).map((n) => (
              <div key={n} className="archetype-level">
                <span className="field-label">Level {n}</span>
                <div className="path-list">
                  {archetype.variables.filter((v) => (v.level ?? 1) === n).map((v) => (
                    <button key={v.key} className={`path-row ${variableKey === v.key ? 'on' : ''}`} onClick={() => setVariableKey(v.key)}>
                      <span className="muted small var-type">{TYPE_LABELS[v.type] ?? v.type}</span>
                      <span>{v.name}</span>
                      <span className="muted small">{(v.by_level?.length ?? 0) > 0 ? `changes at ${v.by_level!.map((c) => c.level).join(', ')}` : ''}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <AddVariable kind="archetype" typeKey={archetype.key} types={ARCHETYPE_TYPES} run={run} onAdded={(name) => { pending.current = name }} />
          </section>
          <section className="tpl-col">
            {variable ? (
              <VariableEditor key={`${archetype.key}-${variable.key}`} kind="archetype" typeKey={archetype.key} variable={variable} doc={doc} run={run}
                maxLevel={archetype.max_level} onGone={() => setVariableKey(null)} />
            ) : <p className="muted">Pick a variable to edit it.</p>}
          </section>
        </div>
      )}
      {tab === 'progression' && <ProgressionTable archetype={archetype} onPick={(key) => { setVariableKey(key); setTab('variables') }} />}
    </div>
  )
}

/**
 * The Archetypes tab (plan 33): what a character is besides its type (a race, a class, a talent…), as cards filtered by
 * search and category; Categories… and ＋ New archetype; a card opens the archetype's window.
 */
function ArchetypesTab({ view, run, error }: { view: SagaTemplateView; run: Run; error: string }) {
  const doc = view.template
  const categories = doc.archetype_categories || []
  const archetypes = doc.archetypes || []
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [managing, setManaging] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIn, setNewIn] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const archetype = archetypes.find((a) => a.key === open) ?? null
  // An archetype just added arrives with the next view: open it then
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (!pending.current) return
    const made = [...archetypes].reverse().find((a) => a.name === pending.current)
    if (made) setOpen(made.key)
    pending.current = null
  })
  const words = query.trim().toLowerCase()
  const shown = archetypes.filter((a) => (category === 'all' || a.category === category)
    && (!words || `${a.name} ${a.description} ${a.variables.map((v) => v.name).join(' ')}`.toLowerCase().includes(words)))
  const into = newIn || (category !== 'all' ? category : categories[0]?.key) || ''
  const add = () => {
    const name = newName.trim()
    if (!name || !into) return
    void run('archetype.add', { name, category: into }).then((ok) => { if (ok) { pending.current = name; setNewName(''); setAdding(false) } })
  }
  const nameOf = (key: string) => categories.find((c) => c.key === key)?.name ?? key
  return (
    <div className="actions-page">
      <p className="muted small">What a character is besides its type: a race, a class, a talent… Each adds variables to the characters that
        have it, level by level ("Fighter 5" has the Fighter's level 1 to 5 variables), and a variable can change at later levels.
        Characters get them in their editor (Archetypes); display templates show them by category.</p>
      <div className="actions-filters">
        <input type="search" placeholder="Search archetypes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search archetypes" />
        <div className="chips">
          <button type="button" className={`chip ${category === 'all' ? 'on' : ''}`} onClick={() => setCategory('all')}>All <span className="muted small">{archetypes.length}</span></button>
          {categories.map((c) => (
            <button key={c.key} type="button" className={`chip ${category === c.key ? 'on' : ''}`} onClick={() => setCategory(c.key)}>
              {c.name} <span className="muted small">{archetypes.filter((a) => a.category === c.key).length}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button onClick={() => setManaging(true)}>Categories…</button>
        <button className="primary" disabled={!categories.length} title={categories.length ? undefined : 'Add a category first (Categories…)'}
          onClick={() => setAdding(true)}>＋ New archetype</button>
      </div>
      {!categories.length ? <p className="muted">Start with the categories (Race, Class, Talent…): <button className="link-button" onClick={() => setManaging(true)}>Categories…</button></p>
        : !archetypes.length ? <p className="muted">No archetypes yet: ＋ New archetype makes one.</p>
          : !shown.length ? <p className="muted">No archetype matches.</p> : (
            <div className="action-cards">
              {shown.map((a) => {
                const changing = a.variables.filter((v) => (v.by_level?.length ?? 0) > 0).length
                const used = view.archetype_usage?.[a.key] ?? 0
                return (
                  <button key={a.key} type="button" className="action-card" onClick={() => setOpen(a.key)}>
                    <span className="action-card-head"><strong>{a.name}</strong><span className="chip small">{nameOf(a.category)}</span></span>
                    {a.description && <span className="muted small action-card-text">{a.description}</span>}
                    <span className="action-card-lines small">
                      {a.variables.slice(0, 3).map((v) => <span key={v.key}>{v.name}{(v.level ?? 1) > 1 ? ` · from level ${v.level}` : ''}</span>)}
                      {a.variables.length > 3 && <span className="muted">and {a.variables.length - 3} more</span>}
                      {!a.variables.length && <span className="muted">No variables yet</span>}
                    </span>
                    <span className="muted small">
                      {a.max_level > 1 ? `${a.max_level} levels` : 'No levels'}{changing ? ` · ${changing} changing by level` : ''} · {used ? `${used} character${used > 1 ? 's' : ''}` : 'no character'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
      <Modal open={managing} title="Archetype categories" onClose={() => setManaging(false)}>
        <div className="form">
          <p className="muted small">The kinds of archetype (Race, Class, Talent…): each archetype is in one, display templates can show one category's.</p>
          {error && managing && <div className="error">{error}</div>}
          {categories.map((c) => (
            <div key={c.key} className="category-row">
              <input key={`${c.key}-${c.name}`} defaultValue={c.name} aria-label={`${c.name}: name`}
                onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && void run('archetype_category.update', { key: c.key, changes: { name: e.target.value } })}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
              <span className="muted small">{archetypes.filter((a) => a.category === c.key).length} archetypes</span>
              <button className="small ghost" aria-label={`Delete ${c.name}`} disabled={archetypes.some((a) => a.category === c.key)}
                title={archetypes.some((a) => a.category === c.key) ? 'Move or delete its archetypes first' : undefined}
                onClick={() => void run('archetype_category.delete', { key: c.key })}>✕</button>
            </div>
          ))}
          <div className="add-variable">
            <input placeholder="New category (Race, Class, Talent…)" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} aria-label="New category"
              onKeyDown={(e) => e.key === 'Enter' && newCategory.trim() && void run('archetype_category.add', { name: newCategory.trim() }).then((ok) => ok && setNewCategory(''))} />
            <button className="small" disabled={!newCategory.trim()} onClick={() => void run('archetype_category.add', { name: newCategory.trim() }).then((ok) => ok && setNewCategory(''))}>＋ Add</button>
          </div>
        </div>
      </Modal>
      <Modal open={adding} title="New archetype" onClose={() => setAdding(false)}>
        <div className="form">
          <label>Name<input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /></label>
          <div className="field"><span className="field-label">Category</span>
            <div className="chips">
              {categories.map((c) => <button key={c.key} type="button" className={`chip ${into === c.key ? 'on' : ''}`} onClick={() => setNewIn(c.key)}>{c.name}</button>)}
            </div>
          </div>
          {error && adding && <div className="error">{error}</div>}
          <div className="button-row"><span className="spacer" /><button className="primary" disabled={!newName.trim()} onClick={add}>Make it</button></div>
        </div>
      </Modal>
      <Modal open={Boolean(archetype)} wide title={archetype ? `${archetype.name} · ${nameOf(archetype.category)}` : ''} onClose={() => setOpen(null)}>
        {archetype && <ArchetypeWindow key={archetype.key} archetype={archetype} view={view} run={run} error={error} onGone={() => setOpen(null)} />}
      </Modal>
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
          <li><Link to="?tab=displays">{view.display_templates} display templates</Link> <span className="muted small">(how characters and items look)</span></li>
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
  // The tab is in the address (?tab=), so a link can open one (display templates: ?tab=displays)
  const [params, setParams] = useSearchParams()
  const kind = params.get('tab') || 'character'
  const setKind = (next: string) => setParams(next === 'character' ? {} : { tab: next })
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
        <button role="tab" aria-selected={kind === 'archetypes'} className={`tool-tab ${kind === 'archetypes' ? 'on' : ''}`} onClick={() => setKind('archetypes')}>Archetypes</button>
        <button role="tab" aria-selected={kind === 'actions'} className={`tool-tab ${kind === 'actions' ? 'on' : ''}`} onClick={() => setKind('actions')}>Actions</button>
        <button role="tab" aria-selected={kind === 'displays'} className={`tool-tab ${kind === 'displays' ? 'on' : ''}`} onClick={() => setKind('displays')}>Display templates</button>
        <button role="tab" aria-selected={kind === 'starting'} className={`tool-tab ${kind === 'starting' ? 'on' : ''}`} onClick={() => setKind('starting')}>Starting content</button>
      </div>
      {kind === 'starting' ? <StartingContent view={view} run={run} />
        : kind === 'displays' ? <TemplatesPage />
        : kind === 'actions' ? <ActionsTab view={view} run={run} error={error} />
        : kind === 'archetypes' ? <ArchetypesTab view={view} run={run} error={error} />
        : kind === 'group' ? <GroupVariables view={view} run={run} />
          : <KindEditor key={kind} kind={view.kinds.includes(kind) ? kind : 'character'} view={view} run={run} />}
    </div>
  )
}
