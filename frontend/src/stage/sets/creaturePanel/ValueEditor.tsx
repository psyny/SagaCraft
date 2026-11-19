import { useState, type KeyboardEvent } from 'react'
import { parseValueInput, quickSteps } from './layout'
import type { CardAttribute } from './types'

interface Props {
  attr: CardAttribute
  onCommit: (value: number) => void
}

/**
 * The DM's quick value editor: type a value ("15") or a change ("-7", "+3"), or use the buttons
 * (−X −Y OK +Y +X, steps scaled to the value). Enter or OK applies; Escape closes.
 */
export default function ValueEditor({ attr, onCommit }: Props) {
  const current = (attr.type === 'counter' ? attr.current : attr.value) ?? 0
  const max = attr.type === 'counter' ? attr.max : null
  const [pending, setPending] = useState(current)
  const [text, setText] = useState('')
  const typed = text ? parseValueInput(text, current) : null
  const result = typed ?? pending
  const { big, small } = quickSteps(current, max)

  const step = (delta: number) => {
    setPending(result + delta)
    setText('')
  }
  const commit = () => {
    if (Number.isFinite(result) && result !== current) onCommit(result)
    else onCommit(current)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'ArrowUp') { e.preventDefault(); step(e.shiftKey && big ? big : small) }
    if (e.key === 'ArrowDown') { e.preventDefault(); step(-(e.shiftKey && big ? big : small)) }
  }
  const diff = result - current

  return (
    <div className="value-editor">
      <div className="value-editor-head">
        <strong>{attr.label}</strong>
        <span className="value-preview">
          {current}{max !== null && max !== undefined ? ` / ${max}` : ''}
          {diff !== 0 && <> → <b className={diff < 0 ? 'down' : 'up'}>{result}</b> <span className="muted">({diff > 0 ? '+' : ''}{diff})</span></>}
        </span>
      </div>
      <input
        autoFocus
        inputMode="decimal"
        className="value-input"
        placeholder={`${current}   (15, -7 or +3)`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
      />
      <div className="value-steps">
        {big !== null && <button type="button" onClick={() => step(-big)}>−{big}</button>}
        <button type="button" onClick={() => step(-small)}>−{small}</button>
        <button type="button" className="primary" onClick={commit}>OK</button>
        <button type="button" onClick={() => step(small)}>+{small}</button>
        {big !== null && <button type="button" onClick={() => step(big)}>+{big}</button>}
      </div>
    </div>
  )
}
