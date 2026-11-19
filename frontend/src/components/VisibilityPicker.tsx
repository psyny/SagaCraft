import type { Group, Member, Visibility } from '../api/types'

interface Props {
  value: Visibility
  groups: Group[]
  members: Member[]
  onChange: (value: Visibility) => void
  /** Label for the empty selection. */
  emptyLabel?: string
}

/** Pick groups and/or members. Admins always see everything, so they're not offered. */
export default function VisibilityPicker({ value, groups, members, onChange, emptyLabel = 'Admins only' }: Props) {
  const shareable = groups.filter((g) => g.key !== 'admins')
  const people = members.filter((m) => m.role !== 'admin')
  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const nothing = value.groups.length === 0 && value.members.length === 0

  return (
    <div className="visibility-picker">
      <div className="chips">
        <button type="button" className={`chip ${nothing ? 'on' : ''}`} onClick={() => onChange({ groups: [], members: [] })}>
          {emptyLabel}
        </button>
        {shareable.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`chip ${value.groups.includes(g.id) ? 'on' : ''}`}
            onClick={() => onChange({ ...value, groups: toggle(value.groups, g.id) })}
          >
            {g.is_default ? `All ${g.name.toLowerCase()}` : g.name}
          </button>
        ))}
      </div>
      {people.length > 0 && (
        <div className="chips small">
          {people.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`chip ${value.members.includes(m.id) ? 'on' : ''}`}
              onClick={() => onChange({ ...value, members: toggle(value.members, m.id) })}
            >
              {m.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
