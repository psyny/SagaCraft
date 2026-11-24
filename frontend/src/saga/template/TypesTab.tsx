/**
 * Saga → Template, a kind's **Types** sub-tab (plan 38; plan 40: character types took over the categories): the list
 * (left) and the one picked in full (right), with room for every field. Name, plural, what can happen to one in
 * events; a character type also whether its characters are player characters (the players' side, never instanceable)
 * and whether new ones are instanceable; add, delete (not while resources use it, not the last). Their own variables
 * are in Variables; which display template a type uses, in Display templates.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SagaTemplateView } from '../../api/types'

export type Run = (name: string, args: Record<string, unknown>) => Promise<boolean>

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** What can happen to a resource of this type in an event: suggested when the DM adds a sub-event. */
export function SubEventList({ kind, typeKey, names, run }: { kind: string; typeKey: string; names: string[]; run: Run }) {
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

/** A text saved when leaving it (or on Enter). */
function SavedInput({ label, hint, value, placeholder, onSave }: {
  label: string; hint?: string; value: string; placeholder?: string; onSave: (value: string) => void
}) {
  return (
    <label className="cat-field">
      <span className="field-label">{label}</span>
      <input key={value} defaultValue={value} placeholder={placeholder}
        onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== value && onSave(e.target.value.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      {hint && <span className="muted small">{hint}</span>}
    </label>
  )
}

/** A kind's words, from the Template page (KIND_LABELS). */
export interface KindWords { title: string; one: string; types: string; typeOne: string; hint: string }

/** A kind's types (character, item, document, location, event types): the list and the one picked. */
export function TypesEditor({ kind, words, view, run }: { kind: string; words: KindWords; view: SagaTemplateView; run: Run }) {
  const types = view.template.kinds[kind]?.types || {}
  const keys = Object.keys(types)
  const [selected, setSelected] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const key = selected && types[selected] ? selected : keys[0]
  const type = key ? types[key] : null
  const used = (k: string) => view.usage[kind]?.[k] ?? 0
  const many = words.title.toLowerCase()
  const count = (n: number) => `${n} ${n === 1 ? words.one : many}`
  // A type just added arrives with the next view: select it then
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (!pending.current) return
    const made = keys.find((k) => types[k].name === pending.current)
    if (made) setSelected(made)
    pending.current = null
  })
  const create = async () => {
    const name = newName.trim()
    if (!name) return
    pending.current = name
    if (await run('type.add', { kind, name })) setNewName('')
  }
  return (
    <div className="cat-layout">
      <section className="tpl-col cat-list-col">
        <p className="muted small">{words.types}: each adds its own variables (edited in <Link to={`?tab=${kind}`}>Variables</Link>) to what every {words.one} has.
          {kind === 'character' ? ` ${words.hint}` : ''}</p>
        <div className="cat-list" role="listbox" aria-label={words.types}>
          {keys.map((k) => (
            <button key={k} type="button" role="option" aria-selected={k === key} className={`cat-item ${k === key ? 'on' : ''}`} onClick={() => setSelected(k)}>
              <strong>{types[k].name}</strong>
              <span className="muted small">{plural((types[k].attributes || []).length, 'own variable')}
                {types[k].player ? " · players' side" : types[k].instanceable ? ' · instanceable' : ''}</span>
              <span className="cat-count muted small" title={count(used(k))}>{used(k)}</span>
            </button>
          ))}
        </div>
        <div className="cat-new">
          <span className="field-label">New {words.typeOne}</span>
          <input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()} aria-label={`New ${words.typeOne}'s name`} />
          <button className="primary" disabled={!newName.trim()} onClick={() => void create()}>＋ Add {words.typeOne}</button>
        </div>
      </section>

      <section className="tpl-col cat-detail">
        {type && key ? (
          <>
            <h3>{type.name}</h3>
            <div className="cat-fields">
              <SavedInput label="Name" value={type.name} onSave={(name) => void run('type.update', { kind, type: key, changes: { name } })} />
              <SavedInput label="Plural" hint="Lists and pickers use it." value={type.plural || type.name}
                onSave={(plural) => void run('type.update', { kind, type: key, changes: { plural } })} />
            </div>
            {kind === 'character' && (
              <>
                <label className="check">
                  <input type="checkbox" checked={Boolean(type.player)} onChange={(e) => void run('type.update', { kind, type: key, changes: { player: e.target.checked } })} />
                  Player characters <span className="muted small">— the players' side (the Boundary layout's left; new ones join the active party); never instanceable</span>
                </label>
                <label className="check">
                  <input type="checkbox" disabled={Boolean(type.player)} checked={Boolean(type.instanceable) && !type.player}
                    onChange={(e) => void run('type.update', { kind, type: key, changes: { instanceable: e.target.checked } })} />
                  New characters are instanceable <span className="muted small">— each one added to a scene is a copy of its own (Goblin 1, Goblin 2)</span>
                </label>
              </>
            )}
            {kind !== 'event' && <SubEventList kind={kind} typeKey={key} names={type.sub_events ?? []} run={run} />}
            <p className="muted small">Its own variables ({(type.attributes || []).length}) are edited in <Link to={`?tab=${kind}`}>Variables</Link>.</p>
            <div className="button-row">
              <span className="muted small">{count(used(key))}</span>
              <span className="spacer" />
              <button className="small ghost danger" disabled={used(key) > 0 || keys.length < 2}
                title={used(key) > 0 ? `Move or delete its ${many} first` : keys.length < 2 ? `${words.title} need at least one ${words.typeOne}` : undefined}
                onClick={() => window.confirm(`Delete the ${words.typeOne} "${type.name}"?`) && void run('type.delete', { kind, type: key }).then((ok) => ok && setSelected(null))}>
                Delete {words.typeOne}
              </button>
            </div>
          </>
        ) : <p className="muted">None yet: add one.</p>}
      </section>
    </div>
  )
}
