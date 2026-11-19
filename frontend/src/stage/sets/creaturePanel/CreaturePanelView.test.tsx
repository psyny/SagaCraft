import { render, screen } from '@testing-library/react'
import type { StageSetView } from '../../../api/types'
import CreaturePanelView from './CreaturePanelView'
import type { CreaturePanelContent } from './types'

const content: CreaturePanelContent = {
  shape: 'grid',
  order: 'manual',
  card_style: 'face',
  highlight_actor_id: 2,
  spotlight: true,
  cards: [
    {
      id: 1, resource_id: 10, order: 1, position: {}, name: 'Thorin', type: 'pc', style: 'face', picture: null, defeated: false,
      attributes: [
        { key: 'hp', label: 'HP', type: 'counter', style: 'bar', display_on: 'card', current: 12, max: 31 },
        { key: 'init', label: 'Initiative', type: 'number', style: 'number', display_on: 'hover', value: 14 },
      ],
    },
    {
      id: 2, resource_id: 11, order: 2, position: {}, name: 'Hooded figure', type: 'npc', style: 'face', picture: null, defeated: false,
      attributes: [{ key: 'hp', label: 'HP', type: 'counter', style: 'discrete', display_on: 'card', level: 2, levels: 4 }],
    },
    {
      id: 3, resource_id: 12, order: 3, position: {}, name: null, type: 'npc', style: 'face', picture: null, defeated: true,
      attributes: [{ key: 'hp', label: 'HP', type: 'counter', style: 'discrete', display_on: 'card', level: 0, levels: 4 }],
    },
  ],
}

const set: StageSetView = { id: 1, type: 'creature_panel', name: 'Fight', x: 0, y: 0, width: 900, height: 420, layer: 1, content }

describe('CreaturePanelView (player view)', () => {
  it('renders bars, balls, hidden names and the defeated mark', () => {
    const { container } = render(
      <CreaturePanelView set={set} mode="view" selectedActorId={null} onSelectActor={() => undefined} attention={null} />,
    )
    expect(screen.getByText('Thorin')).toBeInTheDocument()
    expect(screen.getByText('Hooded figure')).toBeInTheDocument()
    expect(screen.getByText('???')).toBeInTheDocument()
    expect(container.querySelectorAll('.bar')).toHaveLength(1)
    expect(container.querySelectorAll('.ball')).toHaveLength(8)
    expect(container.querySelectorAll('.ball.filled')).toHaveLength(2)
    expect(container.querySelector('.creature-card.highlighted')).not.toBeNull()
    expect(container.querySelector('.defeated-mark')).not.toBeNull()
    // Players never get real values, so nothing to reveal on hover
    expect(container.querySelector('.real-value')).toBeNull()
  })

  it('puts hover values in the tray under the card, not on it', () => {
    const { container } = render(
      <CreaturePanelView set={set} mode="view" selectedActorId={null} onSelectActor={() => undefined} attention={null} />,
    )
    const tray = container.querySelector('.hover-tray')!
    expect(tray).not.toBeNull()
    expect(tray.textContent).toContain('Initiative')
    expect(container.querySelector('.creature-card')!.textContent).not.toContain('Initiative')
  })
})
