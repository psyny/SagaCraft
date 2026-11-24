/**
 * The Saga template's rules, on the Template page: the Actions tab (actions on characters, items and groups as cards,
 * filtered; each opens in a window: Settings, then Mechanics: costs, gains with fixed amounts, max or formulas with
 * dice, triggers) and the calculation of a calculated variable. Every change is a template
 * command; the server checks it against the variables. See docs/implementation/30-actions-and-calculated-variables.md.
 */
import { useEffect, useRef, useState } from 'react'
import type { ActionCost, ActionDef, ActionFormula, ActionGain, ActionPlace, ActionTrigger, Calc, SagaTemplateDoc, SagaTemplateView, TemplateVariable } from '../../api/types'
import Modal from '../../components/Modal'
import { describeAction, DICE_SIDES, isFormula, NOTIFY_HINTS, NOTIFY_LABELS, ON_LABELS, PLACE_LABELS, PLACES, placeKind, WHO_HINTS, WHO_LABELS, type ActionOn } from '../actions'

type Run = (name: string, args: Record<string, unknown>) => Promise<boolean>

/** A kind's variables in the template (every type's; "group": the group variables), each once. */
export function docVariables(doc: SagaTemplateDoc, kind: string): TemplateVariable[] {
  if (kind === 'group') return doc.group_attributes || []
  const data = doc.kinds[kind]
  if (!data) return []
  const seen = new Map<string, TemplateVariable>()
  for (const v of [...(data.attributes || []), ...Object.values(data.types || {}).flatMap((t) => t.attributes || [])]) {
    if (!seen.has(v.key)) seen.set(v.key, v)
  }
  return [...seen.values()]
}

const numeric = (doc: SagaTemplateDoc, kind: string, withCalculated = false) =>
  docVariables(doc, kind).filter((v) => v.type === 'number' || v.type === 'counter' || (withCalculated && v.type === 'calculated'))

// -- calculated variables -----------------------------------------------------------------------------------

const OPS: [Calc['op'], string][] = [['sum', 'Total'], ['count', 'How many'], ['min', 'Lowest'], ['max', 'Highest'], ['avg', 'Average'], ['formula', 'Formula']]
const OF: Record<string, [string, string][]> = {
  character: [['inventory', 'its inventory (items)'], ['groups', 'its groups']],
  item: [['owner', 'its owner (the character holding it)']],
  group: [['characters', 'its characters']],
}
const OF_KIND: Record<string, string> = { inventory: 'item', groups: 'group', owner: 'character', characters: 'character' }

/** A calculated variable's calculation: over a list, or a formula of the thing's own numbers. */
export function CalcEditor({ kind, variable, doc, onSave }: {
  kind: string; variable: TemplateVariable; doc: SagaTemplateDoc; onSave: (calc: Calc) => void
}) {
  const calc: Calc = variable.calc ?? { op: 'count', of: (OF[kind]?.[0]?.[0] ?? 'inventory') as 'inventory' }
  const own = numeric(doc, kind).filter((v) => v.key !== variable.key)
  const setOp = (op: Calc['op']) => {
    if (op === 'formula') return onSave({ op, formula: own[0]?.key ?? '0' })
    const of = (calc.op !== 'formula' ? calc.of : OF[kind][0][0]) as 'inventory'
    const first = numeric(doc, OF_KIND[of], true)[0]?.key
    onSave(op === 'count' ? { op, of } : { op, of, variable: calc.op !== 'formula' && calc.variable ? calc.variable : first ?? '' })
  }
  return (
    <div className="calc-editor">
      <span className="field-label">Worked out as</span>
      <select value={calc.op} aria-label="Calculation" onChange={(e) => setOp(e.target.value as Calc['op'])}>
        {OPS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
      {calc.op === 'formula' ? (
        <>
          <input key={calc.formula} defaultValue={calc.formula} aria-label="Formula" placeholder="strength * 15"
            onBlur={(e) => e.target.value.trim() && e.target.value !== calc.formula && onSave({ op: 'formula', formula: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          <span className="muted small">Its own numbers and counters ({own.map((v) => v.key).join(', ') || 'none yet'}), + − × ÷ as + - * /,
            brackets, min, max, floor, ceil, round.</span>
        </>
      ) : (
        <>
          <label className="inline">of
            <select value={calc.of} onChange={(e) => {
              const of = e.target.value as 'inventory'
              const first = numeric(doc, OF_KIND[of], true)[0]?.key ?? ''
              onSave(calc.op === 'count' ? { op: 'count', of } : { op: calc.op, of, variable: first })
            }}>
              {(OF[kind] || []).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          {calc.op !== 'count' && (
            <label className="inline">their
              <select value={calc.variable ?? ''} onChange={(e) => onSave({ ...calc, variable: e.target.value })}>
                {numeric(doc, OF_KIND[calc.of], true).map((v) => <option key={v.key} value={v.key}>{v.name}</option>)}
              </select>
            </label>
          )}
          {calc.op !== 'count' && (
            <label className="inline">each multiplied by
              <select value={calc.times ?? ''} onChange={(e) => {
                const { times: _drop, ...rest } = calc
                void _drop
                onSave(e.target.value ? { ...rest, times: e.target.value } : rest)
              }}>
                <option value="">—</option>
                {numeric(doc, OF_KIND[calc.of]).map((v) => <option key={v.key} value={v.key}>{v.name}</option>)}
              </select>
            </label>
          )}
        </>
      )}
      <span className="muted small">Worked out by the server whenever it's shown: nobody types it.</span>
    </div>
  )
}

// -- actions ------------------------------------------------------------------------------------------------

function VariableSelect({ doc, kind, value, onChange }: { doc: SagaTemplateDoc; kind: string; value: string; onChange: (key: string) => void }) {
  const options = numeric(doc, kind)
  return (
    <select value={value} aria-label="Variable" onChange={(e) => onChange(e.target.value)}>
      {!options.some((v) => v.key === value) && <option value={value}>{value || '—'}</option>}
      {options.map((v) => <option key={v.key} value={v.key}>{v.name}</option>)}
    </select>
  )
}

function PlaceSelect({ on, value, onChange }: { on: ActionOn; value: ActionPlace; onChange: (place: ActionPlace) => void }) {
  if (PLACES[on].length < 2) return null
  return (
    <select value={value} aria-label="Where" onChange={(e) => onChange(e.target.value as ActionPlace)}>
      {PLACES[on].map((p) => <option key={p} value={p}>{PLACE_LABELS[on][p]}</option>)}
    </select>
  )
}

/** A number typed in (saved on leaving the field). */
function NumberInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input className="amount" type="number" min={0} key={value} defaultValue={value} aria-label="Amount"
      onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0 && n !== value) onChange(n) }} />
  )
}

type Amount = number | 'max' | ActionFormula

/**
 * A formula with its builder: the text (dice like 2d6 or "level d20", the thing's numbers, + - * / and brackets,
 * min max floor ceil round abs), and buttons that add a die (a count, or a variable's worth, of a size), a variable
 * or an operator. Saved on leaving the text or when a button adds something; the server checks it.
 */
export function FormulaBuilder({ value, variables, onChange }: {
  value: string; variables: TemplateVariable[]; onChange: (formula: string) => void
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const [count, setCount] = useState('1')
  const [sides, setSides] = useState(20)
  const add = (piece: string, op = ' + ') => {
    const trimmed = text.trim()
    const joined = !trimmed || /[+\-*/(]$/.test(trimmed) ? `${trimmed}${trimmed ? ' ' : ''}${piece}` : `${trimmed}${op}${piece}`
    setText(joined)
    onChange(joined)
  }
  const known = new Set(variables.map((v) => v.key))
  const unknown = (text.match(/[A-Za-z_]\w*/g) || []).filter((w) => !known.has(w) && !/^d\d+$/i.test(w)
    && !['min', 'max', 'floor', 'ceil', 'round', 'abs'].includes(w))
  return (
    <div className="formula-builder">
      <input className="formula-text" value={text} placeholder="e.g. level d20 + int" aria-label="Formula"
        onChange={(e) => setText(e.target.value)} onBlur={() => text.trim() && text !== value && onChange(text.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      {unknown.length > 0 && <span className="small error-inline">Not a number here: {[...new Set(unknown)].join(', ')}</span>}
      <div className="formula-tools">
        <span className="muted small">Dice</span>
        <select value={count} aria-label="How many dice" onChange={(e) => setCount(e.target.value)}>
          {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={String(n)}>{n}</option>)}
          {variables.map((v) => <option key={v.key} value={v.key}>{v.name} ×</option>)}
        </select>
        <select value={sides} aria-label="Dice size" onChange={(e) => setSides(Number(e.target.value))}>
          {DICE_SIDES.map((n) => <option key={n} value={n}>d{n}</option>)}
        </select>
        <button type="button" className="small" onClick={() => add(/^\d+$/.test(count) ? `${count}d${sides}` : `${count} d${sides}`)}>＋ Dice</button>
        <span className="formula-sep" />
        {variables.map((v) => (
          <button key={v.key} type="button" className="chip small" title={`Add ${v.name} (${v.key})`} onClick={() => add(v.key)}>{v.name}</button>
        ))}
        <span className="formula-sep" />
        {['+', '-', '*', '/', '(', ')'].map((op) => (
          <button key={op} type="button" className="small ghost" onClick={() => {
            const joined = `${text.trim()} ${op}`.trim()
            setText(joined)
            if (op === ')') onChange(joined)
          }}>{op === '*' ? '×' : op === '/' ? '÷' : op === '-' ? '−' : op}</button>
        ))}
      </div>
      <span className="muted small">Rolled each time the action runs: "level d20" rolls a d20 per level; the values are the thing's own.</span>
    </div>
  )
}

/** An amount: Fixed (a number), Max (a gain on a counter: fill it) or Formula. */
function AmountField({ value, canMax, variables, onChange }: {
  value: Amount; canMax: boolean; variables: TemplateVariable[]; onChange: (amount: Amount) => void
}) {
  const mode = value === 'max' ? 'max' : isFormula(value) ? 'formula' : 'fixed'
  return (
    <span className="amount-field">
      <select value={mode} aria-label="Amount" onChange={(e) => {
        const next = e.target.value
        onChange(next === 'max' ? 'max' : next === 'formula' ? { formula: typeof value === 'number' ? String(value) : '1' } : 1)
      }}>
        <option value="fixed">Fixed</option>
        {canMax && <option value="max">Max</option>}
        <option value="formula">Formula</option>
      </select>
      {mode === 'fixed' && <NumberInput value={value as number} onChange={onChange} />}
      {mode === 'max' && <span className="muted small">fills it</span>}
      {mode === 'formula' && <FormulaBuilder value={(value as ActionFormula).formula} variables={variables} onChange={(formula) => onChange({ formula })} />}
    </span>
  )
}

type EditorTab = 'settings' | 'mechanics'

/** An action in a window: Settings (name, description, what it's on, for which types, who runs it) and Mechanics
 *  (costs, gains, the actions it runs next). */
function ActionEditor({ action, doc, actions, run, error, onGone }: {
  action: ActionDef; doc: SagaTemplateDoc; actions: ActionDef[]; run: Run; error: string; onGone: () => void
}) {
  const [tab, setTab] = useState<EditorTab>('settings')
  const update = (changes: Partial<ActionDef>) => void run('action.update', { key: action.key, changes })
  const on = action.on
  const first = (kind: string) => numeric(doc, kind)[0]?.key ?? ''
  const kindOf = (place: ActionPlace) => placeKind(on, place)
  const isCounter = (kind: string, key: string) => docVariables(doc, kind).find((v) => v.key === key)?.type === 'counter'
  const types = on === 'group' ? {} : doc.kinds[on]?.types || {}
  const names = {
    nameOf: (kind: string, key: string) => docVariables(doc, kind).find((v) => v.key === key)?.name ?? key,
    actionName: (key: string) => actions.find((a) => a.key === key)?.name ?? key,
  }
  const setCost = (i: number, changes: Partial<ActionCost>) => update({ costs: action.costs.map((c, j) => (j === i ? { ...c, ...changes } : c)) })
  const setGain = (i: number, changes: Partial<ActionGain>) => update({ gains: action.gains.map((g, j) => (j === i ? { ...g, ...changes } : g)) })
  const setTrigger = (i: number, changes: Partial<ActionTrigger>) => update({ triggers: action.triggers.map((t, j) => (j === i ? { ...t, ...changes } : t)) })
  const triggerable = (place: ActionPlace) => actions.filter((a) => a.on === kindOf(place))
  const lines = describeAction(action, names.nameOf, names.actionName)
  const usedBy = actions.filter((a) => a.triggers.some((t) => t.action === action.key)).map((a) => a.name)

  return (
    <div className="action-editor">
      {error && <div className="error">{error}</div>}
      <div className="tool-tabs" role="tablist" aria-label="The action">
        <button role="tab" aria-selected={tab === 'settings'} className={`tool-tab ${tab === 'settings' ? 'on' : ''}`} onClick={() => setTab('settings')}>Settings</button>
        <button role="tab" aria-selected={tab === 'mechanics'} className={`tool-tab ${tab === 'mechanics' ? 'on' : ''}`} onClick={() => setTab('mechanics')}>Mechanics</button>
      </div>
      {tab === 'settings' ? (
        <section className="action-settings">
          <label>Name<input key={action.key + action.name} defaultValue={action.name}
            onBlur={(e) => e.target.value.trim() && e.target.value !== action.name && update({ name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /></label>
          <label>Description<textarea key={action.key + action.description} rows={3} defaultValue={action.description} placeholder="What it means in the story"
            onBlur={(e) => e.target.value !== action.description && update({ description: e.target.value })} /></label>
          <div className="field"><span className="field-label">On</span>
            <span>{ON_LABELS[on]} <span className="muted small">(for another kind, make a new action)</span></span>
          </div>
          {on !== 'group' && Object.keys(types).length > 1 && (
            <div className="field"><span className="field-label">Only for</span>
              <div className="chips">
                <button type="button" className={`chip ${action.types.length === 0 ? 'on' : ''}`} onClick={() => update({ types: [] })}>Every {on}</button>
                {Object.entries(types).map(([key, t]) => {
                  const has = action.types.includes(key)
                  return <button key={key} type="button" className={`chip ${has ? 'on' : ''}`}
                    onClick={() => update({ types: has ? action.types.filter((x) => x !== key) : [...action.types, key] })}>{t.name}</button>
                })}
              </div>
            </div>
          )}
          <div className="field"><span className="field-label">Who can run it <span className="muted small">(the DM always can)</span></span>
            <div className="chips">
              {(Object.keys(WHO_LABELS) as ActionDef['who'][]).map((w) => (
                <button key={w} type="button" title={WHO_HINTS[w]} className={`chip ${action.who === w ? 'on' : ''}`} onClick={() => update({ who: w })}>{WHO_LABELS[w]}</button>
              ))}
            </div>
          </div>
          <div className="field"><span className="field-label">Notify <span className="muted small">(who is told it ran; the DM always is)</span></span>
            <div className="chips">
              {(Object.keys(NOTIFY_LABELS) as NonNullable<ActionDef['notify']>[]).map((n) => (
                <button key={n} type="button" title={NOTIFY_HINTS[n]} className={`chip ${(action.notify ?? 'user') === n ? 'on' : ''}`} onClick={() => update({ notify: n })}>{NOTIFY_LABELS[n]}</button>
              ))}
            </div>
            <span className="muted small">{NOTIFY_HINTS[action.notify ?? 'user']}.</span>
          </div>
          <div className="button-row">
            <span className="spacer" />
            {usedBy.length ? <span className="muted small">Triggered by {usedBy.join(', ')}: it can't be deleted</span> : (
              <button className="small ghost danger" onClick={() => {
                if (window.confirm(`Delete the action "${action.name}"?`)) void run('action.delete', { key: action.key }).then((ok) => ok && onGone())
              }}>Delete the action</button>
            )}
          </div>
        </section>
      ) : (
        <section className="action-mechanics">
          <div className="field"><span className="field-label">What it does</span>
            {lines.length ? <ul className="action-summary">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : <span className="muted small">Nothing yet: add costs, gains or what it runs next.</span>}
          </div>
          <h3>Costs</h3>
          <p className="muted small">What it takes. Needed: not enough, and it doesn't run. Not spent: it only checks it's there.</p>
          {action.costs.map((c, i) => (
            <div key={i} className="rule-row">
              <PlaceSelect on={on} value={c.source} onChange={(source) => setCost(i, { source, variable: first(kindOf(source)) })} />
              <AmountField value={c.amount} canMax={false} variables={numeric(doc, kindOf(c.source))} onChange={(amount) => setCost(i, { amount: amount as ActionCost['amount'] })} />
              <VariableSelect doc={doc} kind={kindOf(c.source)} value={c.variable} onChange={(variable) => setCost(i, { variable })} />
              <label className="check small"><input type="checkbox" checked={c.consume} onChange={(e) => setCost(i, { consume: e.target.checked })} /> Spent</label>
              <label className="check small"><input type="checkbox" checked={c.required} onChange={(e) => setCost(i, { required: e.target.checked })} /> Needed</label>
              <button className="small ghost" aria-label="Remove cost" onClick={() => update({ costs: action.costs.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="small" disabled={!PLACES[on].some((p) => first(kindOf(p)))}
            onClick={() => {
              const source = PLACES[on].find((p) => first(kindOf(p))) ?? 'self'
              update({ costs: [...action.costs, { source, variable: first(kindOf(source)), amount: 1, consume: true, required: true }] })
            }}>＋ Cost</button>
          <h3>Gains</h3>
          <p className="muted small">What it gives. A counter never passes its maximum; "Max" fills it; a formula rolls its dice each time.</p>
          {action.gains.map((g, i) => (
            <div key={i} className="rule-row">
              <PlaceSelect on={on} value={g.target} onChange={(target) => setGain(i, { target, variable: first(kindOf(target)), amount: 1 })} />
              <AmountField value={g.amount} canMax={isCounter(kindOf(g.target), g.variable)} variables={numeric(doc, kindOf(g.target))}
                onChange={(amount) => setGain(i, { amount })} />
              <VariableSelect doc={doc} kind={kindOf(g.target)} value={g.variable}
                onChange={(variable) => setGain(i, { variable, ...(g.amount === 'max' && !isCounter(kindOf(g.target), variable) ? { amount: 1 } : {}) })} />
              <button className="small ghost" aria-label="Remove gain" onClick={() => update({ gains: action.gains.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="small" disabled={!PLACES[on].some((p) => first(kindOf(p)))}
            onClick={() => {
              const target = PLACES[on].find((p) => first(kindOf(p))) ?? 'self'
              update({ gains: [...action.gains, { target, variable: first(kindOf(target)), amount: 1 }] })
            }}>＋ Gain</button>
          <h3>Then</h3>
          <p className="muted small">Other actions it runs, as part of it (a party's long rest runs each character's).</p>
          {action.triggers.map((t, i) => (
            <div key={i} className="rule-row">
              <PlaceSelect on={on} value={t.target} onChange={(target) => setTrigger(i, { target, action: triggerable(target)[0]?.key ?? '' })} />
              <select value={t.action} aria-label="Action" onChange={(e) => setTrigger(i, { action: e.target.value })}>
                {triggerable(t.target).map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
              </select>
              <span className="rule-skips">
                {(['skip_costs', 'skip_gains', 'skip_triggers'] as const).map((flag) => (
                  <label key={flag} className="check small"><input type="checkbox" checked={t[flag]} onChange={(e) => setTrigger(i, { [flag]: e.target.checked })} />
                    {' '}No {flag === 'skip_costs' ? 'costs' : flag === 'skip_gains' ? 'gains' : 'triggers'}</label>
                ))}
              </span>
              <button className="small ghost" aria-label="Remove trigger" onClick={() => update({ triggers: action.triggers.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button className="small" disabled={!PLACES[on].some((p) => triggerable(p).length)}
            onClick={() => {
              const target = PLACES[on].find((p) => p !== 'self' && triggerable(p).length) ?? PLACES[on].find((p) => triggerable(p).length) ?? 'self'
              update({ triggers: [...action.triggers, { target, action: triggerable(target)[0]?.key ?? '', skip_costs: false, skip_gains: false, skip_triggers: false }] })
            }}>＋ Then…</button>
        </section>
      )}
    </div>
  )
}

/** Template › Actions: every action as a card (filtered: search, what it's on, who runs it, a type); a card opens
 *  the action's window; ＋ New action names one and opens it. */
export function ActionsTab({ view, run, error }: { view: SagaTemplateView; run: Run; error: string }) {
  const doc = view.template
  const actions = doc.actions || []
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [onFilter, setOnFilter] = useState<ActionOn | 'all'>('all')
  const [who, setWho] = useState<ActionDef['who'] | 'all'>('all')
  const [type, setType] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [on, setOn] = useState<ActionOn>('character')
  const action = actions.find((a) => a.key === open) ?? null
  // An action just added arrives with the next view: open it then
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (!pending.current) return
    const made = [...actions].reverse().find((a) => a.name === pending.current)
    if (made) setOpen(made.key)
    pending.current = null
  })
  const add = () => {
    if (!name.trim()) return
    const wanted = name.trim()
    void run('action.add', { name: wanted, on }).then((ok) => { if (ok) { pending.current = wanted; setName(''); setAdding(false) } })
  }
  const names = {
    nameOf: (kind: string, key: string) => docVariables(doc, kind).find((v) => v.key === key)?.name ?? key,
    actionName: (key: string) => actions.find((a) => a.key === key)?.name ?? key,
  }
  const typeChoices = onFilter === 'character' || onFilter === 'item' ? Object.entries(doc.kinds[onFilter]?.types || {}) : []
  const words = query.trim().toLowerCase()
  const shown = actions.filter((a) => (onFilter === 'all' || a.on === onFilter) && (who === 'all' || a.who === who)
    && (!type || !a.types.length || a.types.includes(type))
    && (!words || `${a.name} ${a.description}`.toLowerCase().includes(words)))
  return (
    <div className="actions-page">
      <p className="muted small">Rules players and the DM run in one click: a short rest spends a hit die and gives back HP; a party's
        long rest uses its rations and runs each character's. They show in the character, item and group editors, on sheets
        and in the Stage's Action control.</p>
      <div className="actions-filters">
        <input type="search" placeholder="Search actions" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search actions" />
        <div className="chips">
          {(['all', 'character', 'item', 'group'] as const).map((k) => (
            <button key={k} type="button" className={`chip ${onFilter === k ? 'on' : ''}`} onClick={() => { setOnFilter(k); setType('') }}>
              {k === 'all' ? 'All' : ON_LABELS[k]} <span className="muted small">{k === 'all' ? actions.length : actions.filter((a) => a.on === k).length}</span>
            </button>
          ))}
        </div>
        {typeChoices.length > 1 && (
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="For a type">
            <option value="">Every type</option>
            {typeChoices.map(([key, t]) => <option key={key} value={key}>{t.name}</option>)}
          </select>
        )}
        <select value={who} onChange={(e) => setWho(e.target.value as ActionDef['who'] | 'all')} aria-label="Who can run it">
          <option value="all">Anyone runs it</option>
          {(Object.keys(WHO_LABELS) as ActionDef['who'][]).map((w) => <option key={w} value={w}>{WHO_LABELS[w]}</option>)}
        </select>
        <span className="spacer" />
        <button className="primary" onClick={() => setAdding(true)}>＋ New action</button>
      </div>
      {!actions.length ? <p className="muted">No actions yet: ＋ New action makes one.</p>
        : !shown.length ? <p className="muted">No action matches.</p> : (
          <div className="action-cards">
            {shown.map((a) => {
              const lines = describeAction(a, names.nameOf, names.actionName)
              return (
                <button key={a.key} type="button" className="action-card" onClick={() => setOpen(a.key)}>
                  <span className="action-card-head"><strong>{a.name}</strong><span className="chip small">{ON_LABELS[a.on]}</span></span>
                  {a.description && <span className="muted small action-card-text">{a.description}</span>}
                  <span className="action-card-lines small">
                    {lines.slice(0, 3).map((l, i) => <span key={i}>{l}</span>)}
                    {lines.length > 3 && <span className="muted">and {lines.length - 3} more</span>}
                    {!lines.length && <span className="muted">Nothing yet</span>}
                  </span>
                  <span className="muted small">{WHO_LABELS[a.who]}{a.types.length ? ` · only ${a.types.map((t) => doc.kinds[a.on]?.types?.[t]?.name ?? t).join(', ')}` : ''}</span>
                </button>
              )
            })}
          </div>
        )}
      <Modal open={adding} title="New action" onClose={() => setAdding(false)}>
        <div className="form">
          <label>Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /></label>
          <div className="field"><span className="field-label">On</span>
            <div className="chips">
              {(['character', 'item', 'group'] as ActionOn[]).map((k) => (
                <button key={k} type="button" className={`chip ${on === k ? 'on' : ''}`} onClick={() => setOn(k)}>{ON_LABELS[k]}</button>
              ))}
            </div>
          </div>
          {error && adding && <div className="error">{error}</div>}
          <div className="button-row"><span className="spacer" /><button className="primary" disabled={!name.trim()} onClick={add}>Make it</button></div>
        </div>
      </Modal>
      <Modal open={Boolean(action)} wide title={action ? `${action.name} · ${ON_LABELS[action.on].toLowerCase()}` : ''} onClose={() => setOpen(null)}>
        {action && <ActionEditor key={action.key} action={action} doc={doc} actions={actions} run={run} error={error} onGone={() => setOpen(null)} />}
      </Modal>
    </div>
  )
}
