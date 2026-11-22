/**
 * The combo tray: wherever several things can be picked together (who can see, who can edit, players in control, a
 * character's groups), one button says what's picked ("All players · Owner", "Ana, Bruno +2") and opens a tray with
 * room for every choice, in sections: the special cases first (Admins only, All players, Owner, Inherit), then
 * groups, then each person (with a search once the list is long). Picks apply at once; Done or Esc closes it.
 * See docs/concepts/ux.md ("The combo tray").
 */
import { useMemo, useState } from 'react'
import Modal from './Modal'

export interface ComboOption {
  id: string
  label: string
  hint?: string
  /** Picking it clears the others (and picking another clears it): "Admins only", "Inherit". */
  exclusive?: boolean
  /** Shown as picked when nothing is ("Admins only", "Nobody"). */
  whenEmpty?: boolean
}

export interface ComboSection {
  title: string
  options: ComboOption[]
  hint?: string
}

/** Pure: the pick after clicking an option. */
export function toggleCombo(value: string[], option: ComboOption): string[] {
  if (option.whenEmpty) return []
  if (option.exclusive) return value.includes(option.id) ? [] : [option.id]
  const without = value.filter((id) => id !== option.id)
  return value.includes(option.id) ? without : [...without, option.id]
}

/** Pure: drop exclusive picks once something else is picked (keeps one choice meaning one thing). */
export function cleanCombo(value: string[], sections: ComboSection[]): string[] {
  const exclusive = new Set(sections.flatMap((s) => s.options).filter((o) => o.exclusive).map((o) => o.id))
  const others = value.filter((id) => !exclusive.has(id))
  return others.length ? others : value.filter((id) => exclusive.has(id)).slice(-1)
}

/** Pure: what the button says. The special cases first, then names; past `max` names: "+N". */
export function comboSummary(value: string[], sections: ComboSection[], emptyLabel: string, max = 3): string {
  const options = sections.flatMap((s) => s.options)
  const picked = options.filter((o) => value.includes(o.id))
  if (!picked.length) return options.find((o) => o.whenEmpty)?.label ?? emptyLabel
  const labels = picked.map((o) => o.label)
  const shown = labels.slice(0, max).join(', ')
  return labels.length > max ? `${shown} +${labels.length - max}` : shown
}

export const isPicked = (value: string[], option: ComboOption) => (option.whenEmpty ? value.length === 0 : value.includes(option.id))

interface Props {
  /** The tray's title, and the button's accessible name. */
  title: string
  sections: ComboSection[]
  value: string[]
  onChange: (value: string[]) => void
  emptyLabel?: string
  disabled?: boolean
  /** Shown under the sections (what the choice means). */
  note?: string
  className?: string
}

const SEARCH_FROM = 8

export default function ComboTray({ title, sections, value, onChange, emptyLabel = 'Nothing', disabled = false, note, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const summary = comboSummary(value, sections, emptyLabel)
  const long = sections.some((s) => s.options.length >= SEARCH_FROM)
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => sections.map((s) => ({
    ...s, options: q && s.options.length >= SEARCH_FROM ? s.options.filter((o) => o.label.toLowerCase().includes(q)) : s.options,
  })).filter((s) => s.options.length > 0), [sections, q])

  return (
    <>
      <button type="button" className={`combo-button ${className}`} disabled={disabled} aria-label={`${title}: ${summary}`}
        aria-haspopup="dialog" onClick={() => { setQuery(''); setOpen(true) }} title={summary}>
        <span className="combo-summary">{summary}</span>
        <span className="combo-caret" aria-hidden>▾</span>
      </button>
      <Modal open={open} title={title} onClose={() => setOpen(false)} className="combo-tray">
        {long && (
          <input className="combo-search" placeholder="Search" aria-label="Search" value={query} autoFocus
            onChange={(e) => setQuery(e.target.value)} />
        )}
        {shown.map((section) => (
          <section key={section.title} className="combo-section">
            <h4>{section.title}</h4>
            {section.hint && <p className="muted small">{section.hint}</p>}
            <div className="combo-options" role="group" aria-label={section.title}>
              {section.options.map((option) => {
                const on = isPicked(value, option)
                return (
                  <button key={option.id} type="button" className={`combo-option ${on ? 'on' : ''}`} aria-pressed={on}
                    onClick={() => onChange(cleanCombo(toggleCombo(value, option), sections))}>
                    <span className="combo-check" aria-hidden>{on ? '✓' : ''}</span>
                    <span className="combo-label">{option.label}</span>
                    {option.hint && <span className="muted small">{option.hint}</span>}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
        {q && shown.length === 0 && <p className="muted">Nothing matches.</p>}
        {note && <p className="muted small combo-note">{note}</p>}
        <div className="button-row combo-done">
          <span className="combo-now muted small">{summary}</span>
          <span className="spacer" />
          <button className="primary" onClick={() => setOpen(false)}>Done</button>
        </div>
      </Modal>
    </>
  )
}
