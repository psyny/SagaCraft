import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import type { Sheet } from '../../api/types'
import CharacterSheetModal from './CharacterSheet'

const sheet: Sheet = {
  resource_id: 4, name: 'Thorin', type: 'pc', type_name: 'Player', picture: null, template: { id: 1, name: 'PC' },
  immersive: [],
  informative: [
    { key: 'hp', label: 'HP', type: 'counter', style: 'bar', region: 'header', current: 12, max: 20 },
    { key: 'level', label: 'Level', type: 'number', style: 'number', region: 'body', value: 3 },
    { key: 'mood', label: 'Mood', type: 'counter', style: 'discrete', region: 'body', level: 2, levels: 4 },
  ],
  editable: ['hp', 'mood'], // mood: shown as icons, no number to change
}
const changeCounter = vi.fn(() => Promise.resolve({}))
const actorCounter = vi.fn(() => Promise.resolve({}))
const loadSheet = vi.fn(() => Promise.resolve(sheet))
vi.mock('../../api', () => ({ api: {
  sheet: (...a: unknown[]) => loadSheet(...(a as [])),
  changeCounter: (...a: unknown[]) => changeCounter(...(a as [])),
  actorCounter: (...a: unknown[]) => actorCounter(...(a as [])),
} }))
let admin = false
vi.mock('../SagaContext', () => ({ useOptionalSaga: () => (admin ? { sagaId: 1, isAdmin: true } : { sagaId: 1, isAdmin: false }) }))
vi.mock('../lore/RelationshipsPanel', () => ({ RelationshipsButton: () => null }))
vi.mock('../ActionsPanel', () => ({ ActionsButton: () => null }))

describe('A sheet opened from the Stage (plan 58)', () => {
  it('lets you change the values the server says you may, with the quick editor', async () => {
    render(<CharacterSheetModal sagaId={1} resourceId={4} initialMode="informative" editable onClose={() => undefined} />)
    await screen.findAllByText('Level')
    const clickable = [...document.querySelectorAll('.sheet-value.clickable')].filter((e) => !e.closest('.measure')).map((e) => e.querySelector('.sheet-label')?.textContent)
    expect(clickable).toEqual(['HP']) // not Level (not yours), not Mood (icons: no number)
    fireEvent.click(document.querySelector('.sheet-value.clickable')!)
    fireEvent.change(screen.getByPlaceholderText(/15, -7 or \+3/), { target: { value: '-5' } })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(changeCounter).toHaveBeenCalledWith(1, 4, 'hp', { current: 7 }))
    await waitFor(() => expect(loadSheet).toHaveBeenCalledTimes(2)) // reloaded
  })

  it('the DM on a card changes it through the card (an instance keeps its own); not editable: nothing to click', async () => {
    admin = true
    const { unmount } = render(<CharacterSheetModal sagaId={1} resourceId={4} actorId={9} initialMode="informative" editable onClose={() => undefined} />)
    await screen.findAllByText('Level')
    fireEvent.click(document.querySelector('.sheet-value.clickable')!)
    fireEvent.change(screen.getByPlaceholderText(/15, -7 or \+3/), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(actorCounter).toHaveBeenCalledWith(1, 9, 'hp', { current: 20 })) // kept at its max
    unmount()
    admin = false
    render(<CharacterSheetModal sagaId={1} resourceId={4} initialMode="informative" editable={false} onClose={() => undefined} />)
    await screen.findAllByText('Level')
    expect(document.querySelector('.sheet-value.clickable')).toBeNull()
  })
})
