import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import type { Me } from '../api/types'
import HomePage, { sagaEntry } from './HomePage'

let me: Me
vi.mock('../auth', () => ({ useAuth: () => ({ me, signOut: () => undefined, reload: () => Promise.resolve() }) }))

function Where() {
  return <span>at {useLocation().pathname}</span>
}

const saga = (live: boolean) => ({ id: 3, name: 'Test Saga', role: 'player' as const, member_id: 9, display_name: 'Ana', live })

describe('Signing in (plan 44)', () => {
  it('lands on the Stage when one is live, else on the Saga tab', async () => {
    expect(sagaEntry(saga(true))).toBe('/s/3')
    expect(sagaEntry(saga(false))).toBe('/s/3/saga')
    me = { id: 1, login: 'ana', system_admin: null, sagas: [saga(false)] }
    render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<HomePage />} /><Route path="*" element={<Where />} /></Routes></MemoryRouter>)
    expect(await screen.findByText('at /s/3/saga')).toBeTruthy()
  })

  it('goes straight to the live Stage', async () => {
    me = { id: 1, login: 'ana', system_admin: null, sagas: [saga(true)] }
    render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<HomePage />} /><Route path="*" element={<Where />} /></Routes></MemoryRouter>)
    expect(await screen.findByText('at /s/3')).toBeTruthy()
  })
})
