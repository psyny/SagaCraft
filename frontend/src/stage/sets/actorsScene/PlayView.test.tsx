import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { StageSetView, StageView } from '../../../api/types'
import type { StageEditor } from '../../types'
import ActorsSceneView from './ActorsSceneView'
import { sceneCommands } from './commands'
import { TabsOfCard } from './PlayMenus'
import { tab } from './testTabs'
import type { ActorsSceneContent } from './types'

const actorCounter = vi.fn(() => Promise.resolve({}))
const actorValues = vi.fn(() => Promise.resolve({}))
const setCommand = vi.fn(() => Promise.resolve({}))
vi.mock('../../../api', () => ({
  api: {
    actorCounter: (...args: unknown[]) => actorCounter(...(args as [])),
    actorValues: (...args: unknown[]) => actorValues(...(args as [])),
    setCommand: (...args: unknown[]) => setCommand(...(args as [])),
  },
}))

const exploration = tab({ card_ids: [7, 8], order: [], sequence: [7, 8], turn_controls: false })
const combat = tab({ id: 2, name: 'Combat', order_by: 'initiative', card_ids: [8, 7], sequence: [8, 7], turn_controls: true, turn: { actor_id: 8, round: 1 } })

const content: ActorsSceneContent = {
  card_style: 'face',
  active_tab: 2,
  tab: combat,
  tabs: [exploration, combat],
  sort_keys: [['level', 'Level'], ['initiative', 'Initiative']],
  turn_order: 'initiative',
  config: { card_style: 'face', templates: {}, active_tab: 2 },
  cards: [
    {
      id: 7, resource_id: 70, instance: 1, position: {}, name: 'Ogre 1', real_name: 'Ogre 1', player_name: 'Ogre 1', type: 'npc', style: 'face',
      picture: null, defeated: false, hidden: false, tabs: { 1: { shown: true, position: {} }, 2: { shown: true, position: {} } },
      sort_values: { initiative: 4 },
      attributes: [{ key: 'hp', label: 'HP', type: 'counter', style: 'bar', region: 'bottom', player_style: 'discrete', player_region: 'bottom', current: 230, max: 230, level: 4, levels: 4 }],
    },
    {
      id: 8, resource_id: 80, position: {}, name: 'Thorin', real_name: 'Thorin', player_name: 'Thorin', type: 'pc', style: 'face',
      picture: null, defeated: false, hidden: true, tabs: { 1: { shown: false, position: {} }, 2: { shown: false, position: {} } },
      sort_values: { initiative: 12 }, attributes: [],
    },
  ],
}
const set: StageSetView = { id: 1, type: 'actors_scene', name: 'Fight', x: 0, y: 0, width: 900, height: 420, layer: 1, content }
const stage: StageView = { id: 3, name: 'Bridge', is_live: true, sets: [set] }
const editor: StageEditor = { sagaId: 5, stage, apply: () => undefined, run: async (action) => { await action() } }
const view = (mode: 'play' | 'build' = 'play') =>
  render(<ActorsSceneView set={set} mode={mode} editor={editor} selectedActorId={null} onSelectActor={() => undefined} attention={null} />)

describe('Actors Scene, Play view (DM)', () => {
  beforeEach(() => {
    actorCounter.mockClear()
    actorValues.mockClear()
    setCommand.mockClear()
  })

  it('shows how players see a value next to how the DM sees it', () => {
    const { container } = view()
    expect(container.querySelector('.bar')).not.toBeNull() // DM sees a bar
    expect(container.querySelector('.player-mode.pm-discrete')).not.toBeNull() // players see balls
  })

  it('changes a value on the card itself (an instance keeps its own)', async () => {
    const { container } = view()
    fireEvent.click(container.querySelector('.attr')!)
    for (const label of ['−10', '−1', 'OK', '+1', '+10']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '−10' }))
    fireEvent.click(screen.getByRole('button', { name: '−10' }))
    fireEvent.click(screen.getByRole('button', { name: '−1' }))
    expect(screen.getByText('209')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await Promise.resolve()
    expect(actorCounter).toHaveBeenCalledWith(5, 7, 'hp', { current: 209 })
  })

  it('accepts a typed change', async () => {
    const { container } = view()
    fireEvent.click(container.querySelector('.attr')!)
    const input = screen.getByPlaceholderText(/15, -7 or \+3/)
    fireEvent.change(input, { target: { value: '-17' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await Promise.resolve()
    expect(actorCounter).toHaveBeenCalledWith(5, 7, 'hp', { current: 213 })
  })

  it('switches the tab players see from the strip', () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: /Exploration/ }))
    expect(setCommand).toHaveBeenCalledWith(5, 1, 'tab.switch', { tab_id: 1 })
  })

  it('building another tab does not change what players see', () => {
    const { container } = view('build')
    fireEvent.click(screen.getByRole('button', { name: /Exploration/ }))
    expect(setCommand).not.toHaveBeenCalled()
    expect(container.textContent).toContain('players still see')
  })

  it('runs turns from the turn controls', () => {
    view()
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next turn' }))
    expect(setCommand).toHaveBeenCalledWith(5, 1, 'turn', { tab_id: 2, action: 'next' })
    fireEvent.click(screen.getByRole('button', { name: 'Previous turn' }))
    expect(setCommand).toHaveBeenCalledWith(5, 1, 'turn', { tab_id: 2, action: 'previous' })
  })

  it('edits the order in the order tray: initiative in place, move up and down', async () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: /Order…/ }))
    const rows = document.querySelectorAll('.order-row')
    expect([...rows].map((r) => r.querySelector('.order-name')!.textContent)).toEqual(['Thorin ⦸', 'Ogre 1'])
    fireEvent.click(screen.getByRole('button', { name: 'Move Ogre 1 up' }))
    expect(setCommand).toHaveBeenCalledWith(5, 1, 'order.move', { tab_id: 2, actor_id: 7, by: -1 })
    const input = screen.getByLabelText('Ogre 1 initiative')
    fireEvent.change(input, { target: { value: '19' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await Promise.resolve()
    expect(actorValues).toHaveBeenCalledWith(5, 7, { initiative: 19 })
  })

  it('puts the turn controls right under the tab strip; in Build, "+ Add creatures" takes their place', () => {
    const { container, unmount } = view()
    const bar = container.querySelector('.scene-bar')!
    expect(bar.previousElementSibling?.classList.contains('scene-tabs')).toBe(true)
    expect(bar.querySelector('.turn-controls')).not.toBeNull()
    unmount()
    const build = view('build')
    expect(build.container.querySelector('.turn-controls')).toBeNull()
    expect(build.container.querySelector('.scene-bar')!.textContent).toContain('Add creatures')
  })

  it('every tab has the scene\'s cards: "Shown in" toggles each tab', () => {
    const tabs = content.tabs!.map((t) => ({ ...t, card_ids: [7, 8] }))
    render(<TabsOfCard card={content.cards[0]} content={{ ...content, tabs }} commands={sceneCommands(editor, 1)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Exploration' }))
    expect(setCommand).toHaveBeenCalledWith(5, 1, 'card.show', { tab_id: 1, actor_id: 7, shown: false })
  })
})
