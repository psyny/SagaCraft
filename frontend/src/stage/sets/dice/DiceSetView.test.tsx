import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StageSetView } from '../../../api/types'
import DiceSetView, { waiting } from './DiceSetView'
import type { DiceContent } from './types'

const act = vi.fn(() => Promise.resolve({ ok: true }))
vi.mock('../../../api', () => ({ api: { act: (...a: unknown[]) => act(...(a as [])) } }))
vi.mock('../../../dice/DiceScene', () => ({ default: () => null }))
vi.mock('../../../saga/SagaContext', () => ({ useOptionalSaga: () => ({ sagaId: 4, saga: { me: { role: 'player', member_id: 7 } } }) }))

const types = [
  { id: 'd20', name: 'd20', dice: [{ count: 1, sides: 20 }], read: 'sum' as const, x: 0, modifier: 0, label: '1d20' },
  { id: 'adv', name: 'Advantage', dice: [{ count: 2, sides: 20 }], read: 'highest' as const, x: 0, modifier: 0, label: '2d20 (highest)' },
]
const die = (id: number, type_id: string, member_id = 7) => ({ id, group: 1, type_id, sides: 20, member_id, member: 'Ana', color: '#e2604f', style: 'minimal' })
const content: DiceContent = {
  roll_types: types, can_roll: true,
  tray: [die(1, 'adv'), die(2, 'adv'), die(3, 'adv'), die(4, 'adv'), die(5, 'd20')],
  rolls: [{ id: 9, seed: 1, member_id: 8, by: 'Bob', color: '#5bb98c', at: 0, groups: [
    { group: 3, type_id: 'adv', name: 'Advantage', label: '2d20 (highest)', member: 'Bob', color: '#5bb98c', style: 'minimal',
      dice: [{ id: 6, sides: 20, value: 4, counted: false }, { id: 7, sides: 20, value: 17, counted: true }], result: 17 },
  ] }],
}
const set: StageSetView = { id: 2, type: 'dice', name: 'Dice', x: 0, y: 0, width: 900, height: 520, layer: 1, content }

describe('the dice tray', () => {
  it('counts what you are about to roll, by roll type', () => {
    expect(waiting(content, 7)).toEqual({ adv: 2, d20: 1 })
    expect(waiting(content, 8)).toEqual({})
  })

  it('puts each roll in a row (who, then each roll type\'s result over its button), the controls and badges at the bottom', () => {
    const { container } = render(<DiceSetView set={set} mode="view" selectedActorId={null} onSelectActor={() => undefined} attention={null} />)
    const tray = container.querySelector('.dice-tray')!
    expect(tray.querySelector('.dice-tray-who')!.textContent).toContain('Bob')
    const cells = [...tray.querySelectorAll('.dice-tray-cell')].map((c) => c.textContent)
    expect(cells[0]).toBe('') // no d20 in Bob's roll
    expect(cells[1]).toContain('17') // Advantage, in its column
    // Badges: how many of each you'll roll; a click takes one back
    fireEvent.click(screen.getByRole('button', { name: 'One Advantage less (2)' }))
    expect(act).toHaveBeenCalledWith(4, 2, 'tray.take', { type_id: 'adv' })
    fireEvent.click(screen.getByRole('button', { name: 'd20' }))
    expect(act).toHaveBeenCalledWith(4, 2, 'tray.add', { type_id: 'd20' })
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(act).toHaveBeenCalledWith(4, 2, 'roll', {})
    // Players don't clear every row
    expect(screen.queryByRole('button', { name: 'Clear every row' })).toBeNull()
    // Plan 59: a player's roll buttons are their bar's (the tray keeps the results, with each column's name)
    expect(container.querySelector('.toolbar-player')!.textContent).toContain('d20')
    expect(tray.textContent).toContain('Advantage')
    expect(screen.queryByRole('button', { name: 'Minimize the tray' })).toBeNull()
  })

  it('shows only the results to whoever can\'t roll', () => {
    render(<DiceSetView set={{ ...set, content: { ...content, can_roll: false, tray: [] } }} mode="view" selectedActorId={null} onSelectActor={() => undefined} attention={null} />)
    expect(screen.queryByRole('button', { name: 'Roll' })).toBeNull()
    expect(screen.getByText('Advantage')).toBeInTheDocument() // the column's name, under its results
  })
})
