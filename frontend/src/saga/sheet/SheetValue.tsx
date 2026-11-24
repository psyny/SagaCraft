import type { DisplayValue } from '../../api/types'
import { Balls, Bar, Num, numberColor } from '../../stage/sets/actorsScene/AttributeDisplays'

const DARK = '#1b1722' // what numbers sit on, outside bars (the dark theme's panels)

/**
 * The value itself, drawn in its value style and view style: bar, number or discrete for counters; text, yes/no
 * or a list otherwise. Used on cards and sheets.
 */
export function ValueBody({ value }: { value: DisplayValue }) {
  const color = value.color ?? null
  if (value.type === 'counter') {
    if (value.style === 'discrete' && value.level !== undefined) {
      return <Balls level={value.level} levels={value.levels ?? 4} icon={value.icon} color={color} />
    }
    if (value.style === 'bar' && value.current !== undefined) {
      return <Bar current={value.current} max={value.max ?? 0} shape={value.bar} gradient={value.gradient} color={color} numbers={value.number_color} />
    }
    if (value.current !== undefined) {
      const text = numberColor(value.number_color, DARK) ?? color ?? undefined
      return <span className="attr-value" style={{ color: text }}><Num value={value.current} /> / {value.max}</span>
    }
    return <span className="muted">?</span>
  }
  const raw = value.value
  if (raw === null || raw === undefined || raw === '') return <span className="muted">{value.key === '@name' ? '???' : '—'}</span>
  if (Array.isArray(raw)) {
    if (!raw.length) return <span className="muted">none</span>
    return (
      <span className="chips">
        {raw.map((item, i) => <span key={i} className="chip" style={color ? { borderColor: color } : undefined}>{String(item)}</span>)}
      </span>
    )
  }
  if (typeof raw === 'boolean') return <span style={{ color: color ?? undefined }}>{raw ? 'Yes' : 'No'}</span>
  if (typeof raw === 'number') {
    const text = numberColor(value.number_color, DARK) ?? color ?? undefined
    return <span className="attr-value" style={{ color: text }}><Num value={raw} /></span>
  }
  return <span className="sheet-text" style={{ color: color ?? undefined }}>{String(raw)}</span>
}

/** Clicking a value to change it (a sheet drawn as a Stage card): numbers and counters. */
export type ValueClick = (value: DisplayValue, element: HTMLElement) => void
const changeable = (value: DisplayValue) => value.type === 'counter' || value.type === 'number'

/** A labelled value on a sheet (the label only when the template shows it). `big`: the informative header.
 * `onClick`: numbers and counters can be clicked (to change them). */
export default function SheetValue({ value, big = false, onClick }: { value: DisplayValue; big?: boolean; onClick?: ValueClick }) {
  const click = onClick && changeable(value) ? onClick : undefined
  return (
    <div className={`sheet-value ${big ? 'big' : ''} type-${value.type} ${click ? 'clickable' : ''}`}
      onPointerDown={click ? (e) => e.stopPropagation() : undefined}
      onClick={click ? (e) => { e.stopPropagation(); click(value, e.currentTarget) } : undefined}>
      {value.show_label !== false && <div className="sheet-label">{value.label}</div>}
      <div className="sheet-body"><ValueBody value={value} /></div>
    </div>
  )
}
