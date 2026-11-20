import type { DisplayValue } from '../../api/types'
import { Balls, Bar, Num } from '../../stage/sets/creaturePanel/AttributeDisplays'

/** The value itself, drawn in its style: bar, balls or number for counters; text, yes/no or a list otherwise. */
export function ValueBody({ value }: { value: DisplayValue }) {
  if (value.type === 'counter') {
    if (value.style === 'discrete' && value.level !== undefined) return <Balls level={value.level} levels={value.levels ?? 4} />
    if (value.style === 'bar' && value.current !== undefined) return <Bar current={value.current} max={value.max ?? 0} />
    if (value.current !== undefined) return <span className="attr-value"><Num value={value.current} /> / {value.max}</span>
    return <span className="muted">?</span>
  }
  const raw = value.value
  if (raw === null || raw === undefined || raw === '') return <span className="muted">—</span>
  if (Array.isArray(raw)) {
    if (!raw.length) return <span className="muted">none</span>
    return (
      <span className="chips">
        {raw.map((item, i) => <span key={i} className="chip">{String(item)}</span>)}
      </span>
    )
  }
  if (typeof raw === 'boolean') return <span>{raw ? 'Yes' : 'No'}</span>
  if (typeof raw === 'number') return <span className="attr-value"><Num value={raw} /></span>
  return <span className="sheet-text">{String(raw)}</span>
}

/** A labelled value on a sheet. `big` for the informative sheet's highlights. */
export default function SheetValue({ value, big = false }: { value: DisplayValue; big?: boolean }) {
  return (
    <div className={`sheet-value ${big ? 'big' : ''} type-${value.type}`}>
      <div className="sheet-label">{value.label}</div>
      <div className="sheet-body"><ValueBody value={value} /></div>
    </div>
  )
}
