import { fireEvent, render, screen } from '@testing-library/react'
import type { Group, Member } from '../api/types'
import { liveUrl } from '../saga/SagaSettingsPage'
import ComboTray, { cleanCombo, comboSummary, toggleCombo, type ComboSection } from './ComboTray'
import { picksVisibility, visibilityPicks, visibilitySections } from './VisibilityPicker'

const groups = [
  { id: 1, key: 'admins', name: 'Admins', is_default: true, member_ids: [] },
  { id: 2, key: 'players', name: 'Players', is_default: true, member_ids: [] },
  { id: 3, key: 'viewers', name: 'Viewers', is_default: true, member_ids: [] },
  { id: 4, key: null, name: 'Party A', is_default: false, member_ids: [] },
] as Group[]
const members = [
  { id: 10, display_name: 'The DM', role: 'admin' }, { id: 11, display_name: 'Ana', role: 'player' },
  { id: 12, display_name: 'Bruno', role: 'player' }, { id: 13, display_name: 'Vic', role: 'viewer' },
] as Member[]

describe('the combo tray', () => {
  const sections: ComboSection[] = [
    { title: 'Special', options: [{ id: 'inherit', label: 'Inherit', exclusive: true }, { id: '_none', label: 'Admins only', whenEmpty: true }, { id: 'owner', label: 'Owner' }] },
    { title: 'People', options: ['Ana', 'Bruno', 'Caio', 'Dora'].map((n) => ({ id: n, label: n })) },
  ]
  it('picks several, clears with the empty choice, and keeps exclusive choices alone', () => {
    expect(toggleCombo(['Ana'], { id: 'Bruno', label: 'Bruno' })).toEqual(['Ana', 'Bruno'])
    expect(toggleCombo(['Ana', 'Bruno'], { id: 'Ana', label: 'Ana' })).toEqual(['Bruno'])
    expect(toggleCombo(['Ana'], sections[0].options[1])).toEqual([])
    expect(toggleCombo(['Ana'], sections[0].options[0])).toEqual(['inherit'])
    expect(cleanCombo(['inherit', 'Ana'], sections)).toEqual(['Ana'])
  })
  it('says what is picked, with "+N" past three', () => {
    expect(comboSummary([], sections, 'x')).toBe('Admins only')
    expect(comboSummary(['owner', 'Ana'], sections, 'x')).toBe('Owner, Ana')
    expect(comboSummary(['Ana', 'Bruno', 'Caio', 'Dora'], sections, 'x')).toBe('Ana, Bruno, Caio +1')
  })
  it('opens a tray where picks apply at once', () => {
    const onChange = vi.fn()
    render(<ComboTray title="Who can see" sections={sections} value={['Ana']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Who can see: Ana' }))
    fireEvent.click(screen.getByRole('button', { name: /Bruno/ }))
    expect(onChange).toHaveBeenLastCalledWith(['Ana', 'Bruno'])
    fireEvent.click(screen.getByRole('button', { name: /Inherit/ }))
    expect(onChange).toHaveBeenLastCalledWith(['inherit'])
  })
})

describe('who can see and edit', () => {
  it('offers all players (viewers see what they see), groups and people, never admins nor the viewers group', () => {
    const [special, custom, people] = visibilitySections(groups, members, { owner: true })
    expect(special.options.map((o) => o.label)).toEqual(['Admins only', 'All players', 'Owner'])
    expect(custom.options.map((o) => o.label)).toEqual(['Party A'])
    expect(people.options.map((o) => o.label)).toEqual(['Ana', 'Bruno', 'Vic'])
    // Who can edit: viewers never edit
    expect(visibilitySections(groups, members, { editing: true })[2].options.map((o) => o.label)).toEqual(['Ana', 'Bruno'])
    expect(visibilitySections(groups, members, { inherit: true })[0].options[0].label).toBe('Inherit')
  })
  it('turn a visibility into picks and back (owner, inherit)', () => {
    const v = { groups: [4], members: [11], owner: true }
    expect(visibilityPicks(v)).toEqual(['owner', 'g4', 'm11'])
    expect(picksVisibility(visibilityPicks(v), false)).toEqual(v)
    expect(picksVisibility(['inherit'], true)).toBeNull()
    expect(visibilityPicks(null)).toEqual(['inherit'])
    expect(picksVisibility([], false)).toEqual({ groups: [], members: [] })
  })
  it('the live link is the app address with its token', () => {
    expect(liveUrl('abc', 'https://saga.example')).toBe('https://saga.example/live/abc')
  })
})
