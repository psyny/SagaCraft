import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import type { SagaTemplateView } from '../../api/types'
import SagaTemplatePage, { addedNote } from './SagaTemplatePage'

const view: SagaTemplateView = {
  own_copy: true,
  usage: { item: { weapon: 2 } },
  kinds: ['character', 'item', 'document', 'location'],
  new_types: ['text', 'number', 'boolean', 'choice', 'counter'],
  display_templates: 4,
  fog_presets: 1,
  stages: 2,
  environments: 1,
  groups: 2,
  template: {
    name: 'DnD Lite',
    kinds: {
      character: { attributes: [{ key: 'name', name: 'Name', type: 'text', required: true, view: ['admins', 'players'] }], types: { pc: { name: 'PC' } } },
      item: {
        attributes: [{ key: 'name', name: 'Name', type: 'text', required: true }, { key: 'rarity', name: 'Rarity', type: 'choice', options: ['Common'], view: ['admins', 'players'] }],
        types: { weapon: { name: 'Weapon', attributes: [{ key: 'damage', name: 'Damage', type: 'text' }] }, gear: { name: 'Gear' } },
      },
    },
    starting: { groups: [], actors_tabs: [{ name: 'Combat', layout: 'bar', turns: true }], turn_order: null },
  },
}
const templateCommand = vi.fn((_saga: number, _name: string, _args: object) => Promise.resolve(view))
vi.mock('../../api', () => ({
  api: {
    sagaTemplate: () => Promise.resolve(view),
    displayTemplates: () => Promise.resolve({ templates: [], defaults: { item: {} }, category_defaults: {} }),
    templateCommand: (...args: unknown[]) => templateCommand(...(args as [number, string, object])),
  },
}))
vi.mock('../SagaContext', () => ({ useSaga: () => ({ sagaId: 3, refreshSaga: () => Promise.resolve() }) }))

describe('Saga template page', () => {
  it('shows a kind\'s shared variables and types, and adds variables', async () => {
    render(<MemoryRouter><SagaTemplatePage /></MemoryRouter>)
    await screen.findByDisplayValue('DnD Lite')
    fireEvent.click(screen.getByRole('tab', { name: 'Items' }))
    // Plan 38: whose variables on top (every item, or a category); one list below
    expect(screen.getByRole('tab', { name: /Every item/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Rarity')).toBeInTheDocument()
    expect(screen.queryByText('Damage')).toBeNull()
    // A shared variable
    fireEvent.change(screen.getByLabelText('New variable name'), { target: { value: 'Weight' } })
    fireEvent.change(screen.getByLabelText('New variable type'), { target: { value: 'number' } })
    fireEvent.click(screen.getByRole('button', { name: '＋ Add' }))
    await waitFor(() => expect(templateCommand).toHaveBeenCalledWith(3, 'variable.add', { kind: 'item', variable: { name: 'Weight', type: 'number' } }))
    // The name is the app's: no delete
    fireEvent.click(screen.getAllByRole('button', { name: /Name/ })[0])
    expect(screen.getByText('Needed by the app')).toBeInTheDocument()
    // A type's own variables, instead of the shared ones
    fireEvent.click(screen.getByRole('tab', { name: /Weapon/ }))
    expect(screen.getByText('Damage')).toBeInTheDocument()
    expect(screen.queryByText('Needed by the app')).toBeNull() // the variable being edited was the shared list's
    // Item types are named, added and deleted in their own sub-tab
    expect(screen.queryByRole('button', { name: 'Delete type' })).toBeNull()
    // Items → Types (plan 39: were "categories"): the list and the one picked; a type in use can't be deleted
    fireEvent.click(screen.getByRole('tab', { name: 'Types' }))
    expect(screen.getByRole('option', { name: /Weapon/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Delete type' })).toBeDisabled() // two weapons exist
    fireEvent.click(screen.getByRole('option', { name: /Gear/ }))
    expect(screen.getByRole('button', { name: 'Delete type' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText("New type's name"), { target: { value: 'Scroll' } })
    fireEvent.click(screen.getByRole('button', { name: '＋ Add type' }))
    await waitFor(() => expect(templateCommand).toHaveBeenCalledWith(3, 'type.add', { kind: 'item', name: 'Scroll' }))
  })

  it('lists what goes with an export (plan 41)', async () => {
    render(<MemoryRouter><SagaTemplatePage /></MemoryRouter>)
    await screen.findByDisplayValue('DnD Lite')
    fireEvent.click(screen.getByRole('tab', { name: 'Starting content' }))
    expect(screen.getByRole('link', { name: '2 Stages' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '1 EFX environment' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '2 character groups' })).toBeTruthy()
    expect(screen.queryByText('Starting groups')).toBeNull()
  })

  it('says what an import added', () => {
    expect(addedNote({ stages: 2, environments: 1, groups: 0, display_templates: 0, fog_presets: 0 })).toBe('Added 2 Stages, 1 EFX environment.')
    expect(addedNote({ stages: 0 })).toBe('Nothing new to add: this Saga had all of it.')
  })
})
