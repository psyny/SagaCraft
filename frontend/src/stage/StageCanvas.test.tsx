import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StageSetView, StageView } from '../api/types'
import StageCanvas from './StageCanvas'
import { SagaContext } from '../saga/SagaContext'
import { SET_TYPE_UIS } from './sets/registry'
import { tab } from './sets/actorsScene/testTabs'
import type { ActorsSceneContent } from './sets/actorsScene/types'
import type { StageEditor } from './types'

const updateSet = vi.fn(() => Promise.resolve({}))
const pauseStage = vi.fn(() => Promise.resolve({}))
vi.mock('../api', () => ({ api: { stages: vi.fn(() => Promise.resolve([])), setCommand: vi.fn(() => Promise.resolve({})), updateSet: (...a: unknown[]) => updateSet(...(a as [])),
  pauseStage: (...a: unknown[]) => pauseStage(...(a as [])) } }))

const content: ActorsSceneContent = {
  active_tab: 1, tab: tab({ turn_controls: true }),
  tabs: [tab({ turn_controls: true }), tab({ id: 2, name: 'Combat' })], sort_keys: [], cards: [],
}
const scene = (over: Partial<StageSetView> = {}): StageSetView =>
  ({ id: 1, type: 'actors_scene', name: 'Fight', x: 0, y: 0, width: 900, height: 420, layer: 1, content, ...over })
const play = (stage: StageView) => {
  const editor: StageEditor = { sagaId: 5, stage, apply: () => undefined, run: async (action) => { await action() }, openSettings: vi.fn() }
  return render(<StageCanvas stage={stage} mode="play" editor={editor} />)
}

describe('Stage toolbars', () => {
  it('puts every Set in the Set bar: opening one shows its name and a menu row (eye, ⚙, fold, its main options)', () => {
    const { container } = play({ id: 3, name: 'Bridge', is_live: true, sets: [scene()] })
    // No main toolbar on the canvas any more; the turn controls stay where the type puts them
    expect(container.querySelector('.toolbar-frame .tb-main')).toBeNull()
    expect(container.querySelector('.toolbar-stack.outside.at-bottom .tb-turns .turn-controls')).not.toBeNull()
    const button = screen.getByRole('button', { name: 'Fight' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    const menu = container.querySelector('.set-bar-menu')!
    expect(menu.hasAttribute('hidden')).toBe(true)
    fireEvent.click(button)
    expect(button.textContent).toContain('Fight')
    expect(menu.hasAttribute('hidden')).toBe(false)
    expect([...menu.querySelectorAll('button')].slice(0, 3).map((b) => b.getAttribute('aria-label'))).toEqual(['Hide Fight', 'Fight: settings', "Fold Fight's controls"])
    expect(menu.textContent).toContain('Combat') // its main options: the tabs
    // ⚙: its Play menu
    fireEvent.click(screen.getByRole('button', { name: 'Fight: settings' }))
    expect(screen.getByText(/Players see/)).toBeInTheDocument()
    // Fold: its toolbars on the Stage go
    fireEvent.click(screen.getByRole('button', { name: "Fold Fight's controls" }))
    expect(container.querySelector('.tb-turns')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: "Show Fight's controls" }))
    expect(container.querySelector('.tb-turns')).not.toBeNull()
    // Players have no bar
    const players = render(<StageCanvas stage={{ id: 3, name: 'Bridge', is_live: true, sets: [scene()] }} mode="view" />)
    expect(players.container.querySelector('.set-bar')).toBeNull()
  })

  it('puts a Set away with the eye: not drawn, its button in the bar faded, to bring it back', () => {
    const { container } = play({ id: 3, name: 'Bridge', is_live: true, sets: [scene({ off: true })] })
    expect(container.querySelector('.stage-set')).toBeNull()
    expect(container.querySelector('.tb-turns')).toBeNull()
    const button = screen.getByRole('button', { name: 'Fight' })
    expect(button.className).toContain('away')
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: 'Show Fight' }))
    expect(updateSet).toHaveBeenCalledWith(5, 1, { off: false })
  })

  it('keeps an empty desk invisible and click-through; with pieces, its panel as opaque as set', () => {
    const desk = SET_TYPE_UIS.desktop
    const set = (pieces: unknown[]): StageSetView => ({ id: 9, type: 'desktop', name: 'Desk', x: 0, y: 0, width: 600, height: 400, layer: 2,
      content: { layout: 'auto', gap: 16, background: 50, pieces } })
    expect([desk.background!(set([])), typeof desk.passThrough === 'function' && desk.passThrough(set([]))]).toEqual([0, true])
    expect([desk.background!(set([{ id: 1 }])), typeof desk.passThrough === 'function' && desk.passThrough(set([{ id: 1 }]))]).toEqual([0.5, false])
  })

  it('lets clicks through EFX layers (they fill their box), and draws nothing without an environment outside Build', () => {
    const fore: StageSetView = { id: 7, type: 'efx_fore', name: 'Rain', x: 0, y: 0, width: 900, height: 420, layer: 5, transparent: true,
      content: { layer: 'fore', effects: [], environment: null } }
    const { container } = play({ id: 3, name: 'Bridge', is_live: true, sets: [scene(), fore] })
    const set = container.querySelector('[data-set-id="7"]')!
    expect(set.className).toContain('pass-through')
    expect(set.className).toContain('full-bleed')
    expect(set.querySelector('.efx-layer, .panel-empty')).toBeNull()
  })

  it('on an interface Stage, stack every Set\'s toolbars on the screen\'s edges, and leave hidden ones out', () => {
    const sets = [
      scene({ toolbars: { turns: { anchor: 'right', vertical: true } } }),
      scene({ id: 2, name: 'Second', layer: 2, toolbars: { turns: { hidden: true } } }),
    ]
    const { container } = play({ id: 3, name: 'Bridge', is_live: true, layout: 'interface', sets })
    const area = container.querySelector('.toolbar-area.screen')!
    expect(container.querySelector('.toolbar-frame')).toBeNull()
    // The main toolbars are in the Set bar (top layer first), not on the screen's edges
    expect(area.querySelector('.tb-main')).toBeNull()
    // Pause first (plan 58), then the Stage's own controls (the Stages selector on the bar, Actions; EFX only with EFX
    // layers), then the Sets
    expect(container.querySelector('.set-bar-buttons .stage-switcher select')).not.toBeNull()
    expect([...container.querySelectorAll('.set-bar-button')].map((m) => m.getAttribute('aria-label'))).toEqual(['Pause the game', 'Player view', 'Actions', 'Second', 'Fight'])
    expect(area.querySelector('.toolbar-stack.at-right .set-toolbar.vertical .turn-controls')).not.toBeNull()
    expect(area.querySelector('[data-toolbar="2:turns"]')).toBeNull()
  })
  it("leave the Stage's controls out when they're turned off", () => {
    const { container } = play({ id: 4, name: 'Quiet', is_live: true, layout: 'interface', sets: [scene({})], controls: { actions: false, efx: true, stages: false } })
    expect([...container.querySelectorAll('.set-bar-button')].map((m) => m.getAttribute('aria-label'))).toEqual(['Pause the game', 'Player view', 'Fight'])
    expect(container.querySelector('.stage-switcher')).toBeNull()
    const some = play({ id: 5, name: 'Some', is_live: true, layout: 'interface', sets: [scene({})], controls: { actions: false, efx: true, stages: true } })
    expect([...some.container.querySelectorAll('.set-bar-button')].map((m) => m.getAttribute('aria-label'))).toEqual(['Pause the game', 'Player view', 'Fight'])
    expect(some.container.querySelector('.set-bar-buttons .stage-switcher')).not.toBeNull()
  })
  it('pause: the DM pauses and resumes; players see the badge and the Actions button off', async () => {
    const { container, getByRole } = play({ id: 6, name: 'Bridge', is_live: true, layout: 'interface', sets: [scene({})] })
    fireEvent.click(getByRole('button', { name: 'Pause the game' }))
    await waitFor(() => expect(pauseStage).toHaveBeenCalledWith(5, 6, true))
    expect(container.querySelector('.stage-paused-badge')).toBeNull()
    const paused = play({ id: 7, name: 'Bridge', is_live: true, layout: 'interface', sets: [scene({})], paused: true })
    fireEvent.click(paused.getByRole('button', { name: 'Resume the game' }))
    await waitFor(() => expect(pauseStage).toHaveBeenCalledWith(5, 7, false))
    expect(paused.container.querySelector('.stage-paused-badge')?.textContent).toContain("players can't act")
    const player = render(<StageCanvas stage={{ id: 7, name: 'Bridge', is_live: true, layout: 'interface', sets: [], paused: true }} mode="view" />)
    expect(player.container.querySelector('.stage-paused-badge')?.textContent).toContain('The DM paused the game')
    expect(player.container.querySelector('.set-bar')).toBeNull()
  })
  it("players' Set bar (plan 59): only what they may do: Actions, and the Sets with a menu for them", () => {
    const mapSet = { id: 9, type: 'world_map', name: 'Overland', x: 0, y: 0, width: 400, height: 300, layer: 2, screen: {}, toolbars: {}, transparent: false,
      content: { fog: { style: 'mist', display: 'soft', colors: ['#000', '#111', '#222'], size: 1, intensity: 0.5, edge: 0.5, known: 0.5, motion: 0 }, show_grid: true, interactive: true, map: null } } as unknown as StageSetView
    const saga = { sagaId: 5, isAdmin: false, saga: { me: { member_id: 3, role: 'player', group_ids: [], color: '#52c06e' }, members: [], groups: [] } }
    const { container } = render(
      <SagaContext.Provider value={saga as never}>
        <StageCanvas stage={{ id: 8, name: 'Road', is_live: true, layout: 'interface', sets: [mapSet], controls: { actions: true } }} mode="view" />
      </SagaContext.Provider>,
    )
    expect([...container.querySelectorAll('.set-bar-button')].map((m) => m.getAttribute('aria-label'))).toEqual(['Actions', 'Overland'])
    expect(container.querySelector('.set-bar-icon')).toBeNull() // no eye, ⚙ or fold
  })
  it("the DM's player view (plan 60): the player's Set bar, with the DM's player view button first", () => {
    const mapSet = { id: 9, type: 'world_map', name: 'Overland', x: 0, y: 0, width: 400, height: 300, layer: 2, screen: {}, toolbars: {}, transparent: false,
      content: { fog: { style: 'mist', display: 'soft', colors: ['#000', '#111', '#222'], size: 1, intensity: 0.5, edge: 0.5, known: 0.5, motion: 0 }, show_grid: true, interactive: true, map: null } } as unknown as StageSetView
    const saga = { sagaId: 5, isAdmin: false, saga: { me: { member_id: 3, role: 'player', group_ids: [], color: '#52c06e' }, members: [{ id: 3, display_name: 'Ana', role: 'player', color: '#52c06e' }], groups: [] } }
    const onPick = vi.fn()
    const { container } = render(
      <SagaContext.Provider value={saga as never}>
        <StageCanvas stage={{ id: 8, name: 'Road', is_live: true, layout: 'interface', sets: [mapSet], controls: { actions: true } }} mode="view"
          preview={{ current: { memberId: 3 }, onPick }} />
      </SagaContext.Provider>,
    )
    expect([...container.querySelectorAll('.set-bar-button')].map((m) => m.getAttribute('aria-label'))).toEqual(['Player view', 'Actions', 'Overland'])
    expect(container.querySelector('.stage-canvas.previewing')).not.toBeNull()
    fireEvent.click(container.querySelector('.set-bar-button.player-view')!)
    expect(screen.getByRole('button', { name: /Ana/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'DM' }))
    expect(onPick).toHaveBeenCalledWith(null)
  })
})
