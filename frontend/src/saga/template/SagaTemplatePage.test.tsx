import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import type { SagaTemplateView } from '../../api/types'
import SagaTemplatePage from './SagaTemplatePage'

const view: SagaTemplateView = {
  own_copy: false,
  usage: { item: { weapon: 2 } },
  kinds: ['character', 'item', 'document', 'location'],
  new_types: ['text', 'number', 'boolean', 'choice', 'counter'],
  categories: [{ id: 1, name: 'Player', type: 'pc' }],
  display_templates: 4,
  fog_presets: 1,
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
    templateCommand: (...args: unknown[]) => templateCommand(...(args as [number, string, object])),
  },
}))
vi.mock('../SagaContext', () => ({ useSaga: () => ({ sagaId: 3, refreshSaga: () => Promise.resolve() }) }))

describe('Saga template page', () => {
  it('shows a kind\'s shared variables and types, and adds variables', async () => {
    render(<MemoryRouter><SagaTemplatePage /></MemoryRouter>)
    await screen.findByDisplayValue('DnD Lite')
    fireEvent.click(screen.getByRole('tab', { name: 'Items' }))
    expect(screen.getByText('Rarity')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Weapon/ }))
    expect(screen.getByText('Damage')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete category' })).toBeDisabled() // two weapons exist
    // A shared variable
    const [shared] = screen.getAllByLabelText('New variable name')
    fireEvent.change(shared, { target: { value: 'Weight' } })
    fireEvent.change(screen.getAllByLabelText('New variable type')[0], { target: { value: 'number' } })
    fireEvent.click(screen.getAllByRole('button', { name: '＋ Add' })[0])
    await waitFor(() => expect(templateCommand).toHaveBeenCalledWith(3, 'variable.add', { kind: 'item', variable: { name: 'Weight', type: 'number' } }))
    // The name is the app's: no delete
    fireEvent.click(screen.getAllByRole('button', { name: /Name/ })[0])
    expect(screen.getByText('Needed by the app')).toBeInTheDocument()
  })
})
