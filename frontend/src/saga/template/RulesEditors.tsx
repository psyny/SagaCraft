/**
 * The Saga template's rules, on the Template page: the Actions tab (actions on characters, items and groups: who runs
 * them, their costs, gains and triggers) and the calculation of a calculated variable. Every change is a template
 * command; the server checks it against the variables. See docs/implementation/30-actions-and-calculated-variables.md.
 */
import { useEffect, useRef, useState } from 'react'
import type { ActionCost, ActionDef, ActionGain, ActionPlace, ActionTrigger, Calc, SagaTemplateDoc, SagaTemplateView, TemplateVariable } from '../../api/types'
import { describeAction, ON_LABELS, PLACE_LABELS, PLACES, placeKind, WHO_HINTS, WHO_LABELS, type ActionOn } from '../actions'

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

function AmountInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input className="amount" type="number" min={0} key={value} defaultValue={value} aria-label="Amount"
      onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0 && n !== value) onChange(n) }} />
  )
}

function ActionEditor({ action, doc, actions, run, onGone }: {
  action: ActionDef; doc: SagaTemplateDoc; actions: ActionDef[]; run: Run; onGone: () => void
}) {
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
    <>
      <section className="tpl-col">
        <div className="tool-head">
          <strong>{action.name}</strong>
          <span className="muted small">on {ON_LABELS[on].toLowerCase()}</span>
        </div>
        <label>Name<input key={action.key + action.name} defaultValue={action.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== action.name && update({ name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /></label>
        <label>Description<textarea key={action.key + action.description} rows={2} defaultValue={action.description} placeholder="What it means in the story"
          onBlur={(e) => e.target.value !== action.description && update({ description: e.target.value })} /></label>
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
        <div className="field"><span className="field-label">What it does</span>
          {lines.length ? <ul className="action-summary">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : <span className="muted small">Nothing yet: add costs, gains or triggers.</span>}
        </div>
        <div className="button-row">
          <span className="spacer" />
          {usedBy.length ? <span className="muted small">Triggered by {usedBy.join(', ')}</span> : (
            <button className="small ghost danger" onClick={() => {
              if (window.confirm(`Delete the action "${action.name}"?`)) void run('action.delete', { key: action.key }).then((ok) => ok && onGone())
            }}>Delete</button>
          )}
        </div>
      </section>
      <section className="tpl-col">
        <h3>Costs</h3>
        <p className="muted small">What it takes. Needed: not enough, and it doesn't run. Not spent: it only checks it's there.</p>
        {action.costs.map((c, i) => (
          <div key={i} className="rule-row">
            <PlaceSelect on={on} value={c.source} onChange={(source) => setCost(i, { source, variable: first(kindOf(source)) })} />
            <AmountInput value={c.amount} onChange={(amount) => setCost(i, { amount })} />
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
        <p className="muted small">What it gives. A counter never passes its maximum; "Max" fills it.</p>
        {action.gains.map((g, i) => (
          <div key={i} className="rule-row">
            <PlaceSelect on={on} value={g.target} onChange={(target) => setGain(i, { target, variable: first(kindOf(target)), amount: 1 })} />
            {g.amount === 'max' ? <span className="amount muted">max</span> : <AmountInput value={g.amount} onChange={(amount) => setGain(i, { amount })} />}
            <VariableSelect doc={doc} kind={kindOf(g.target)} value={g.variable} onChange={(variable) => setGain(i, { variable, ...(isCounter(kindOf(g.target), variable) ? {} : { amount: g.amount === 'max' ? 1 : g.amount }) })} />
            {isCounter(kindOf(g.target), g.variable) && (
              <label className="check small"><input type="checkbox" checked={g.amount === 'max'} onChange={(e) => setGain(i, { amount: e.target.checked ? 'max' : 1 })} /> Max</label>
            )}
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
    </>
  )
}

/** Template › Actions: the actions by what they're on, and the one picked's editor. */
export function ActionsTab({ view, run }: { view: SagaTemplateView; run: Run }) {
  const doc = view.template
  const actions = doc.actions || []
  const [selected, setSelected] = useState<string | null>(actions[0]?.key ?? null)
  const [name, setName] = useState('')
  const [on, setOn] = useState<ActionOn>('character')
  const action = actions.find((a) => a.key === selected) ?? null
  // An action just added arrives with the next view: select it then
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (!pending.current) return
    const made = [...actions].reverse().find((a) => a.name === pending.current)
    if (made) setSelected(made.key)
    pending.current = null
  })
  const add = () => {
    if (!name.trim()) return
    const wanted = name.trim()
    void run('action.add', { name: wanted, on }).then((ok) => { if (ok) { pending.current = wanted; setName('') } })
  }
  return (
    <div className="tpl-kind">
      <section className="tpl-col">
        <h3>Actions</h3>
        <p className="muted small">Rules players and the DM run in one click: a short rest spends a hit die and gives back HP; a party's
          long rest uses its rations and runs each character's. They show in the character, item and group editors and on sheets.</p>
        {(['character', 'item', 'group'] as ActionOn[]).map((kind) => {
          const list = actions.filter((a) => a.on === kind)
          if (!list.length) return null
          return (
            <div key={kind} className="path-list">
              <span className="field-label">{ON_LABELS[kind]}</span>
              {list.map((a) => (
                <button key={a.key} className={`path-row ${selected === a.key ? 'on' : ''}`} onClick={() => setSelected(a.key)}>
                  <span className="muted small var-type">{a.costs.length + a.gains.length + a.triggers.length} rules</span>
                  <span>{a.name}</span>
                  <span className="muted small">{WHO_LABELS[a.who]}</span>
                </button>
              ))}
            </div>
          )
        })}
        {!actions.length && <p className="muted small">None yet.</p>}
        <div className="add-variable">
          <input placeholder="New action" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="New action name" />
          <select value={on} onChange={(e) => setOn(e.target.value as ActionOn)} aria-label="On">
            {(['character', 'item', 'group'] as ActionOn[]).map((k) => <option key={k} value={k}>on {ON_LABELS[k].toLowerCase()}</option>)}
          </select>
          <button className="small" disabled={!name.trim()} onClick={add}>＋ Add</button>
        </div>
      </section>
      {action ? <ActionEditor key={action.key} action={action} doc={doc} actions={actions} run={run} onGone={() => setSelected(null)} />
        : <section className="tpl-col"><p className="muted">Pick an action to edit it.</p></section>}
    </div>
  )
}
