import type { Member } from '../api/types'
import ComboTray from './ComboTray'

/** Pick members (a character's players in control, a resource's owners) in the combo tray. */
export default function MemberPicker({ value, members, onChange, title, emptyLabel = 'No one', roles = ['player'], disabled }: {
  value: number[]
  members: Member[]
  onChange: (ids: number[]) => void
  title: string
  emptyLabel?: string
  roles?: string[]
  disabled?: boolean
}) {
  const people = members.filter((m) => roles.includes(m.role))
  const sections = [
    { title: 'Special', options: [{ id: '_none', label: emptyLabel, whenEmpty: true }] },
    { title: 'People', options: people.map((m) => ({ id: String(m.id), label: m.display_name })) },
  ]
  return (
    <ComboTray title={title} sections={sections} value={value.map(String)} emptyLabel={emptyLabel} disabled={disabled}
      onChange={(next) => onChange(next.map(Number))} note={people.length ? undefined : 'No one to pick in this Saga yet.'} />
  )
}
