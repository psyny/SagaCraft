import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import AddMember from './AddMember'

const searchAccounts = vi.fn((_saga: number, _q: string) => Promise.resolve([{ user_id: 7, login: 'anabel' }, { user_id: 8, login: 'anatole' }]))
vi.mock('../api', () => ({ api: { searchAccounts: (saga: number, q: string) => searchAccounts(saga, q) } }))

describe('Add someone (plan 42)', () => {
  it('finds an existing account by login and adds it with a name and a role', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true))
    render(<AddMember sagaId={3} onAdd={onAdd} />)
    expect(screen.getByRole('button', { name: 'Add to this Saga' })).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('Find an account by login'), { target: { value: 'an' } })
    fireEvent.click(await screen.findByRole('option', { name: 'anabel' }))
    expect(searchAccounts).toHaveBeenCalledWith(3, 'an')
    fireEvent.change(screen.getByLabelText('Display name in this Saga'), { target: { value: 'Bel' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'viewer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add anabel to this Saga' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ account: 'existing', login: 'anabel', display_name: 'Bel', role: 'viewer' }))
  })

  it('creates a new account for the Saga, saying so', async () => {
    const onAdd = vi.fn(() => Promise.resolve(true))
    render(<AddMember sagaId={3} onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('tab', { name: 'New account' }))
    expect(screen.getByText(/Creates an account they sign in with/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Login'), { target: { value: 'Newbie' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create the account and add it' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ account: 'new', login: 'Newbie', password: 'pass-123', display_name: '', role: 'player' }))
  })
})
