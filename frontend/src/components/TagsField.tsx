/** The DM's tags on a resource: chips, a field to add one (Enter or comma), the Saga's tags as suggestions. */
import { useState } from 'react'

export default function TagsField({ value, suggestions, onChange }: { value: string[]; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState('')
  const has = (tag: string) => value.some((t) => t.toLowerCase() === tag.toLowerCase())
  const add = (raw: string) => {
    const tag = raw.trim().replace(/,$/, '').trim()
    if (tag && !has(tag)) onChange([...value, tag])
    setText('')
  }
  const offered = suggestions.filter((s) => !has(s) && (!text || s.toLowerCase().includes(text.toLowerCase()))).slice(0, 10)
  return (
    <div className="field tags-field">
      <span className="field-label">Tags</span>
      <div className="chips">
        {value.map((t) => (
          <span key={t} className="chip on">{t}<button type="button" className="chip-x" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>×</button></span>
        ))}
        <input className="tag-input" value={text} placeholder="Add a tag" aria-label="Add a tag" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text) }
            else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => text && add(text)} />
      </div>
      {offered.length > 0 && (
        <div className="chips suggestions">
          {offered.map((s) => <button key={s} type="button" className="chip" onClick={() => add(s)}>+ {s}</button>)}
        </div>
      )}
    </div>
  )
}
