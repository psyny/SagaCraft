import { render, screen } from '@testing-library/react'
import type { StageSetView } from '../../../api/types'
import ActorsSceneView from './ActorsSceneView'
import { tab } from './testTabs'
import type { ActorsSceneContent, CardAttribute } from './types'

const nameTop = (value: string | null): CardAttribute => ({ key: '@name', label: 'Name', type: 'system', style: 'text', region: 'top', value })

const content: ActorsSceneContent = {
  active_tab: 1,
  tab: tab({ highlight_actor_id: 2, spotlight: true, card_ids: [1, 2, 3], turn: { actor_id: 1, round: 2 } }),
  cards: [
    {
      id: 1, resource_id: 10, position: {}, name: 'Thorin', type: 'pc', style: 'face', picture: null, defeated: false,
      color: '#e2604f',
      attributes: [
        nameTop('Thorin'),
        { key: 'hp', label: 'HP', type: 'counter', style: 'bar', region: 'bottom', current: 12, max: 31 },
        { key: 'init', label: 'Initiative', type: 'number', style: 'number', region: 'hover_bottom', value: 14 },
        { key: 'level', label: 'Level', type: 'number', style: 'number', region: 'hover_right', value: 3 },
      ],
    },
    {
      id: 2, resource_id: 11, position: {}, name: 'Hooded figure', type: 'npc', style: 'face', picture: null, defeated: false,
      attributes: [nameTop('Hooded figure'), { key: 'hp', label: 'HP', type: 'counter', style: 'discrete', icon: 'hearts', region: 'bottom', level: 2, levels: 4, show_label: false }],
    },
    {
      id: 3, resource_id: 12, instance: 2, position: {}, name: null, type: 'npc', style: 'face', picture: null, defeated: true,
      attributes: [nameTop(null), { key: 'hp', label: 'HP', type: 'counter', style: 'discrete', region: 'bottom', level: 0, levels: 4 }],
    },
  ],
}

const set: StageSetView = { id: 1, type: 'actors_scene', name: 'Fight', x: 0, y: 0, width: 900, height: 420, layer: 1, content }

describe('ActorsSceneView (player view)', () => {
  it('renders bars, balls, hidden names, the defeated mark and the current turn', () => {
    const { container } = render(
      <ActorsSceneView set={set} mode="view" selectedActorId={null} onSelectActor={() => undefined} attention={null} />,
    )
    expect(screen.getByText('Thorin')).toBeInTheDocument()
    expect(screen.getByText('Hooded figure')).toBeInTheDocument()
    expect(screen.getByText('???')).toBeInTheDocument()
    expect(container.querySelectorAll('.bar')).toHaveLength(1)
    expect(container.querySelectorAll('.ball')).toHaveLength(8)
    expect(container.querySelectorAll('.ball.filled')).toHaveLength(2)
    expect(container.querySelector('.creature-card.highlighted')).not.toBeNull()
    expect(container.querySelector('.defeated-mark')).not.toBeNull()
    // The current turn has its own highlight, in the card's group color; the Turn tag sits outside the card
    const currentCard = container.querySelector('.creature-card.current-turn') as HTMLElement
    expect(container.querySelectorAll('.creature-card.current-turn')).toHaveLength(1)
    expect(currentCard.style.getPropertyValue('--group')).toBe('#e2604f')
    const badge = screen.getByText('Turn')
    expect(currentCard.contains(badge)).toBe(false)
    // Icons follow the view style; labels can be left out
    expect(container.querySelectorAll('.icons-hearts .ball')).toHaveLength(4)
    expect(screen.getAllByText('HP')).toHaveLength(2)
    // Players never get real values, the tab strip or the turn controls
    expect(container.querySelector('.real-value')).toBeNull()
    expect(container.querySelector('.set-toolbar')).toBeNull()
    expect(container.querySelector('.turn-controls')).toBeNull()
  })

  it('puts hover values in trays beside and under the card, not on it', () => {
    const { container } = render(
      <ActorsSceneView set={set} mode="view" selectedActorId={null} onSelectActor={() => undefined} attention={null} />,
    )
    const under = container.querySelector('.hover-tray.tray-bottom')!
    expect(under.textContent).toContain('Initiative')
    expect(container.querySelector('.hover-tray.tray-right')!.textContent).toContain('Level')
    expect(container.querySelector('.creature-card')!.textContent).not.toContain('Initiative')
  })
})

describe('a value without its name', () => {
  it('takes no room for the name: the value band fits what it shows (plan 37)', async () => {
    const { AttributeRow } = await import('./CreatureCard')
    const hp: CardAttribute = { key: 'hp', label: 'HP', type: 'counter', style: 'bar', region: 'bottom', current: 4, max: 10 }
    const { container, rerender } = render(<AttributeRow attr={hp} admin={false} />)
    expect(container.querySelector('.attr')!.className).not.toContain('no-label')
    expect(container.querySelector('.attr-label')!.textContent).toBe('HP')
    rerender(<AttributeRow attr={{ ...hp, show_label: false }} admin={false} />)
    expect(container.querySelector('.attr')!.className).toContain('no-label')
    expect(container.querySelector('.attr-label')).toBeNull()
    // The DM's mark (players see it otherwise) sits on its corner then, not on a row of its own
    rerender(<AttributeRow attr={{ ...hp, show_label: false, player_region: 'hidden' }} admin />)
    expect(container.querySelector('.attr-label')).toBeNull()
    expect(container.querySelector('.player-mode.corner')!.textContent).toBe('⦸')
  })
})

describe('values on a sheet drawn as a card', () => {
  const hp: CardAttribute = { key: 'hp', label: 'HP', type: 'counter', style: 'bar', region: 'body', current: 4, max: 10 }
  const note: CardAttribute = { key: 'note', label: 'Note', type: 'text', style: 'text', region: 'body', value: 'hi' }
  const sheet = { resource_id: 1, name: 'Thorin', instance: null, type: 'pc', type_name: 'PC', category_name: 'Player', picture: null,
    template: { id: null, name: 'T' }, color: null, frame: null, immersive: [{ ...hp, region: 'bottom_center' as const }], informative: [hp, note] }

  it('are clicked to change them (numbers and counters), like a card\'s', async () => {
    const { SheetView } = await import('../../../saga/sheet/CharacterSheet')
    const clicked: string[] = []
    const { container } = render(<SheetView sheet={sheet as never} mode="informative" onValueClick={(v) => clicked.push(v.key)} />)
    const values = [...container.querySelectorAll('.sheet-rest:not(.measure) .sheet-value')] as HTMLElement[]
    values.forEach((v) => v.click())
    expect(clicked).toEqual(['hp']) // text isn't changed from a card
    expect(values[0].className).toContain('clickable')
  })

  it('are found to change them: the card\'s, its sheet\'s, its other looks\'', async () => {
    const { findValue } = await import('./types')
    const card = { id: 1, resource_id: 1, position: {}, name: 'Thorin', type: 'pc', style: 'informative' as const, side: 'player' as const,
      picture: null, defeated: false, attributes: [], sheet: sheet as never }
    expect(findValue(card, 'hp')?.current).toBe(4)
    expect(findValue({ ...card, sheet: undefined, looks: { immersive: { style: 'immersive', picture: null, attributes: [], sheet: sheet as never } } }, 'hp')?.key).toBe('hp')
    expect(findValue(card, 'level')).toBeUndefined()
  })
})
