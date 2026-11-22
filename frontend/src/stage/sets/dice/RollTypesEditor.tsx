/**
 * The roll types editor: each roll's name, its dice (lines of count × sides), how it's read (sum, highest, lowest,
 * sum above / below X) and a modifier. Used by a Dice roller Set's settings and the Template page (the Saga's
 * defaults). Changes go out as a whole list (the server checks it).
 */
import { useEffect, useState } from 'react'
import { DIE_SIDES, type RollRead, type RollType } from './types'

const READS: [RollRead, string][] = [['sum', 'Sum'], ['highest', 'Highest'], ['lowest', 'Lowest'], ['sum_above', 'Sum above X'], ['sum_below', 'Sum below X']]

/** Pure: a short description of a roll type ("2d6 + 1d4, highest, +2"). */
export function describe(r: RollType): string {
  const dice = r.dice.map((d) => `${d.count}d${d.sides}`).join(' + ')
  const read = r.read === 'sum' ? '' : r.read === 'highest' ? ', highest' : r.read === 'lowest' ? ', lowest' : `, ${r.read === 'sum_above' ? 'above' : 'below'} ${r.x}`
  return `${dice}${read}${r.modifier ? `, ${r.modifier > 0 ? '+' : ''}${r.modifier}` : ''}`
}

const newId = (list: RollType[]) => {
  let i = list.length + 1
  while (list.some((r) => r.id === `r${i}`)) i += 1
  return `r${i}`
}

export default function RollTypesEditor({ value, onSave }: { value: RollType[]; onSave: (next: RollType[]) => Promise<unknown> | void }) {
  const [draft, setDraft] = useState<RollType[]>(value)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => setDraft(value), [value])
  const save = (next: RollType[]) => { setDraft(next); void onSave(next.map(({ label: _l, ...r }) => r)) }
  const change = (id: string, changes: Partial<RollType>) => save(draft.map((r) => (r.id === id ? { ...r, ...changes } : r)))
  const move = (i: number, by: number) => {
    const next = [...draft]
    const [r] = next.splice(i, 1)
    next.splice(Math.max(0, Math.min(next.length, i + by)), 0, r)
    save(next)
  }
  return (
    <div className="roll-types">
      {draft.map((r, i) => (
        <div key={r.id} className={`roll-type ${open === r.id ? 'open' : ''}`}>
          <div className="roll-type-head">
            <button className="ghost roll-type-name" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <strong>{r.name}</strong> <span className="muted small">{describe(r)}</span>
            </button>
            <button className="small ghost" aria-label={`Move ${r.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="small ghost" aria-label={`Move ${r.name} down`} disabled={i === draft.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button className="small ghost danger" aria-label={`Remove ${r.name}`} onClick={() => save(draft.filter((x) => x.id !== r.id))}>✕</button>
          </div>
          {open === r.id && (
            <div className="roll-type-body">
              <label>Name<input key={r.name} defaultValue={r.name} maxLength={40} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && change(r.id, { name: e.target.value })} /></label>
              <div className="field">
                <span className="field-label">Dice</span>
                {r.dice.map((d, k) => (
                  <div key={k} className="roll-line">
                    <input type="number" min={1} max={12} value={d.count} aria-label="How many"
                      onChange={(e) => change(r.id, { dice: r.dice.map((x, j) => (j === k ? { ...x, count: Math.max(1, Math.min(12, Number(e.target.value) || 1)) } : x)) })} />
                    <select value={d.sides} aria-label="Sides" onChange={(e) => change(r.id, { dice: r.dice.map((x, j) => (j === k ? { ...x, sides: Number(e.target.value) } : x)) })}>
                      {DIE_SIDES.map((s) => <option key={s} value={s}>d{s}</option>)}
                    </select>
                    {r.dice.length > 1 && <button className="small ghost" aria-label="Remove these dice" onClick={() => change(r.id, { dice: r.dice.filter((_, j) => j !== k) })}>✕</button>}
                  </div>
                ))}
                <button className="small ghost" onClick={() => change(r.id, { dice: [...r.dice, { count: 1, sides: 6 }] })}>＋ Dice</button>
              </div>
              <div className="field">
                <span className="field-label">Result</span>
                <select value={r.read} onChange={(e) => change(r.id, { read: e.target.value as RollRead })}>
                  {READS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                {(r.read === 'sum_above' || r.read === 'sum_below') && (
                  <label className="inline">X<input type="number" min={0} max={100} value={r.x} onChange={(e) => change(r.id, { x: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></label>
                )}
              </div>
              <label className="inline">Modifier<input type="number" min={-100} max={100} value={r.modifier} onChange={(e) => change(r.id, { modifier: Math.max(-100, Math.min(100, Number(e.target.value) || 0)) })} /></label>
            </div>
          )}
        </div>
      ))}
      <button className="small" onClick={() => {
        const id = newId(draft)
        setOpen(id)
        save([...draft, { id, name: 'New roll', dice: [{ count: 1, sides: 20 }], read: 'sum', x: 0, modifier: 0 }])
      }}>＋ Roll type</button>
    </div>
  )
}
