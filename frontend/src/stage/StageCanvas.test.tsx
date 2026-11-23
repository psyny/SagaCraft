import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StageSetView, StageView } from '../api/types'
import StageCanvas from './StageCanvas'
import { SET_TYPE_UIS } from './sets/registry'
import { tab } from './sets/actorsScene/testTabs'
import type { ActorsSceneContent } from './sets/actorsScene/types'
import type { StageEditor } from './types'

const updateSet = vi.fn(() => Promise.resolve({}))
vi.mock('../api', () => ({ api: { setCommand: vi.fn(() => Promise.resolve({})), updateSet: (...a: unknown[]) => updateSet(...(a as [])) } }))

const content: ActorsSceneContent = {
  card_style: 'face', active_tab: 1, tab: tab({ turn_controls: true }),
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
    expect([...container.querySelectorAll('.set-bar-button')].map((m) => m.getAttribute('aria-label'))).toEqual(['Second', 'Fight'])
    expect(area.querySelector('.toolbar-stack.at-right .set-toolbar.vertical .turn-controls')).not.toBeNull()
    expect(area.querySelector('[data-toolbar="2:turns"]')).toBeNull()
  })
})
