import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { StageSetView, StageView } from '../../../api/types'
import type { StageEditor } from '../../types'
import CreaturePanelView from './CreaturePanelView'
import type { CreaturePanelContent } from './types'

const changeCounter = vi.fn(() => Promise.resolve({}))
vi.mock('../../../api', () => ({ api: { changeCounter: (...args: unknown[]) => changeCounter(...(args as [])) } }))

const content: CreaturePanelContent = {
  shape: 'grid',
  order: 'manual',
  card_style: 'face',
  highlight_actor_id: null,
  spotlight: false,
  config: { shape: 'grid', order: 'manual', card_style: 'face', highlight_actor_id: null, spotlight: false, sort_key: 'initiative', spacing: 14, templates: {} },
  cards: [
    {
      id: 7, resource_id: 70, order: 1, position: {}, name: 'Ogre', real_name: 'Ogre', type: 'npc', style: 'face', picture: null, defeated: false, hidden: false,
      attributes: [{ key: 'hp', label: 'HP', type: 'counter', style: 'bar', display_on: 'card', player_style: 'discrete', player_display_on: 'card', current: 230, max: 230, level: 4, levels: 4 }],
    },
  ],
}
const set: StageSetView = { id: 1, type: 'creature_panel', name: 'Fight', x: 0, y: 0, width: 900, height: 420, layer: 1, content }
const stage: StageView = { id: 3, name: 'Bridge', is_live: true, sets: [set] }
const editor: StageEditor = { sagaId: 5, stage, apply: () => undefined, run: async (action) => { await action() } }

describe('Creature panel, Play view (DM)', () => {
  it('shows how players see a value next to how the DM sees it', () => {
    const { container } = render(<CreaturePanelView set={set} mode="play" editor={editor} selectedActorId={null} onSelectActor={() => undefined} attention={null} />)
    expect(container.querySelector('.bar')).not.toBeNull() // DM sees a bar
    expect(container.querySelector('.player-mode.pm-discrete')).not.toBeNull() // players see balls
  })

  it('changes a value with the step buttons', async () => {
    const { container } = render(<CreaturePanelView set={set} mode="play" editor={editor} selectedActorId={null} onSelectActor={() => undefined} attention={null} />)
    fireEvent.click(container.querySelector('.attr')!)
    // HP 230: steps of 10 and 1
    for (const label of ['−10', '−1', 'OK', '+1', '+10']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '−10' }))
    fireEvent.click(screen.getByRole('button', { name: '−10' }))
    fireEvent.click(screen.getByRole('button', { name: '−1' }))
    expect(screen.getByText('209')).toBeInTheDocument() // preview: 230 → 209
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await Promise.resolve()
    expect(changeCounter).toHaveBeenCalledWith(5, 70, 'hp', { current: 209 })
  })

  it('accepts a typed change', async () => {
    changeCounter.mockClear()
    const { container } = render(<CreaturePanelView set={set} mode="play" editor={editor} selectedActorId={null} onSelectActor={() => undefined} attention={null} />)
    fireEvent.click(container.querySelector('.attr')!)
    const input = screen.getByPlaceholderText(/15, -7 or \+3/)
    fireEvent.change(input, { target: { value: '-17' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await Promise.resolve()
    expect(changeCounter).toHaveBeenCalledWith(5, 70, 'hp', { current: 213 })
  })
})
