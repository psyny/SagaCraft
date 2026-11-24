import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import SystemSagas from './SystemSagas'

const row = (id: number, name: string, extra = {}) => ({
  id, name, ruleset_key: 'dnd_lite', is_archived: false, admins: ['dm'], member_count: 3, last_login: null, created_at: null, ...extra,
})
const allSagas = vi.fn((params: { offset?: number }) => Promise.resolve({
  total: 7, offset: params.offset ?? 0, limit: 5,
  sagas: (params.offset ? [row(6, 'Zeta'), row(7, 'Eta')] : [row(1, 'Alpha', { is_archived: true }), row(2, 'Beta'), row(3, 'Gamma'), row(4, 'Delta'), row(5, 'Epsilon')]),
}))
vi.mock('../api', () => ({ api: { allSagas: (p: { offset?: number }) => allSagas(p) } }))

describe('System → Sagas (plan 43)', () => {
  it('lists 5 at a time, searches, orders and filters', async () => {
    render(<MemoryRouter><SystemSagas canCreate rulesets={[]} onCreated={() => undefined} /></MemoryRouter>)
    expect(await screen.findByText('Alpha')).toBeTruthy()
    expect(document.querySelector('.role-badge.off')?.textContent).toBe('Inactive')
    expect(allSagas).toHaveBeenLastCalledWith({ q: '', order: 'last_login', status: 'all', offset: 0, limit: 5 })
    expect(screen.getByText('1–5 of 7')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next ›' }))
    expect(await screen.findByText('Zeta')).toBeTruthy()
    expect(screen.getByText('6–7 of 7')).toBeTruthy()
    // A new order or filter starts again at the first page
    fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'name' } })
    await waitFor(() => expect(allSagas).toHaveBeenLastCalledWith({ q: '', order: 'name', status: 'all', offset: 0, limit: 5 }))
    fireEvent.click(screen.getByRole('tab', { name: 'Inactive' }))
    await waitFor(() => expect(allSagas).toHaveBeenLastCalledWith({ q: '', order: 'name', status: 'inactive', offset: 0, limit: 5 }))
    fireEvent.change(screen.getByLabelText('Find a Saga by name'), { target: { value: 'gam' } })
    await waitFor(() => expect(allSagas).toHaveBeenLastCalledWith({ q: 'gam', order: 'name', status: 'inactive', offset: 0, limit: 5 }))
    expect(screen.getByRole('button', { name: '＋ New saga' })).toBeTruthy()
  })
})
