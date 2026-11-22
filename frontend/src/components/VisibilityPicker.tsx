import type { Group, Member, Visibility } from '../api/types'
import ComboTray, { type ComboSection } from './ComboTray'

interface Props {
  /** null: inherit (folders; only with `onInherit`). */
  value: Visibility | null
  groups: Group[]
  members: Member[]
  onChange: (value: Visibility) => void
  /** Offer "Inherit" (folders: each resource keeps its own), picked: this is called. */
  onInherit?: () => void
  /** The tray's title ("Who can see this document"). */
  title?: string
  /** Label for the empty selection. */
  emptyLabel?: string
  /** Offer "Owner" (resources and folders: their owners). */
  owner?: boolean
  /** Who can edit: viewers never edit, so they aren't offered. */
  editing?: boolean
  disabled?: boolean
  note?: string
}

const EMPTY: Visibility = { groups: [], members: [] }

/** Pure: a visibility as the tray's picks, and back. */
export function visibilityPicks(value: Visibility | null): string[] {
  if (value === null) return ['inherit']
  return [...(value.owner ? ['owner'] : []), ...value.groups.map((g) => `g${g}`), ...value.members.map((m) => `m${m}`)]
}

export function picksVisibility(picks: string[], inherit: boolean): Visibility | null {
  if (inherit && picks.includes('inherit')) return null
  const out: Visibility = {
    groups: picks.filter((p) => p.startsWith('g')).map((p) => Number(p.slice(1))),
    members: picks.filter((p) => p.startsWith('m')).map((p) => Number(p.slice(1))),
  }
  if (picks.includes('owner')) out.owner = true
  return out
}

/** Pure: the tray's sections. Admins always see everything, so they're not offered; viewers see what players see,
 * so the viewers group isn't either. */
export function visibilitySections(groups: Group[], members: Member[], opts: { owner?: boolean; inherit?: boolean; editing?: boolean; emptyLabel?: string } = {}): ComboSection[] {
  const players = groups.find((g) => g.key === 'players')
  const special: ComboSection = {
    title: 'Special',
    options: [
      ...(opts.inherit ? [{ id: 'inherit', label: 'Inherit', hint: 'each keeps its own', exclusive: true }] : []),
      { id: '_admins', label: opts.emptyLabel ?? 'Admins only', whenEmpty: true },
      ...(players ? [{ id: `g${players.id}`, label: 'All players', hint: opts.editing ? undefined : 'viewers too' }] : []),
      ...(opts.owner ? [{ id: 'owner', label: 'Owner', hint: 'its owners' }] : []),
    ],
  }
  const custom = groups.filter((g) => !g.key)
  const people = members.filter((m) => m.role === 'player' || (!opts.editing && m.role === 'viewer'))
  return [
    special,
    ...(custom.length ? [{ title: 'Groups', options: custom.map((g) => ({ id: `g${g.id}`, label: g.name })) }] : []),
    ...(people.length ? [{ title: 'People', options: people.map((m) => ({ id: `m${m.id}`, label: m.display_name, hint: m.role === 'viewer' ? 'viewer' : undefined })) }] : []),
  ]
}

/** Who can see (or edit): a button that says the pick and opens the combo tray. */
export default function VisibilityPicker({ value, groups, members, onChange, title = 'Who can see', emptyLabel = 'Admins only',
  owner = false, onInherit, editing = false, disabled, note }: Props) {
  const inherit = Boolean(onInherit)
  const sections = visibilitySections(groups, members, { owner, inherit, editing, emptyLabel })
  const current = value === null && !inherit ? EMPTY : value
  // Only what's offered counts (a pick no longer offered, like the old viewers group, goes at the next change)
  const offered = new Set(sections.flatMap((s) => s.options.map((o) => o.id)))
  const picks = visibilityPicks(current).filter((p) => offered.has(p))
  return (
    <ComboTray title={title} sections={sections} value={picks} emptyLabel={emptyLabel} disabled={disabled} note={note}
      onChange={(next) => {
        const picked = picksVisibility(next, inherit)
        if (picked === null) onInherit?.()
        else onChange(picked)
      }} />
  )
}
