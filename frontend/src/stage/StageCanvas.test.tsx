import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StageSetView, StageView } from '../api/types'
import StageCanvas from './StageCanvas'
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
  it('put a Set\'s controls where its type says, the ⚙ first in the main toolbar', () => {
    const { container } = play({ id: 3, name: 'Bridge', is_live: true, sets: [scene()] })
    const main = container.querySelector('.toolbar-frame .toolbar-stack.outside.at-top-left .set-toolbar.tb-main')!
    // The eye first (put it away), then ⚙
    expect([...main.children].slice(0, 2).map((c) => c.className.split(' ')[0])).toEqual(['toolbar-eye', 'toolbar-gear'])
    expect(main.textContent).toContain('Combat')
    expect(container.querySelector('.toolbar-stack.outside.at-bottom .tb-turns .turn-controls')).not.toBeNull()
    // The title opens nothing any more: the ⚙ does
    expect(container.querySelector('.set-title')!.textContent).toBe('Fight')
    fireEvent.click(screen.getByRole('button', { name: 'Fight: settings' }))
    expect(screen.getByText(/Players see/)).toBeInTheDocument()
  })

  it('puts a Set away with the eye: not drawn, only its main toolbar (with its name) left to bring it back', () => {
    const { container } = play({ id: 3, name: 'Bridge', is_live: true, sets: [scene({ off: true })] })
    expect(container.querySelector('.stage-set')).toBeNull()
    expect(container.querySelector('.tb-turns')).toBeNull()
    const main = container.querySelector('.tb-main')!
    expect(main.textContent).toContain('Fight')
    fireEvent.click(screen.getByRole('button', { name: 'Show Fight' }))
    expect(updateSet).toHaveBeenCalledWith(5, 1, { off: false })
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
    // Both main toolbars at the top left (outside means nothing here), in layer order
    const mains = area.querySelectorAll('.toolbar-stack.at-top-left > .set-toolbar')
    expect([...mains].map((m) => m.getAttribute('data-toolbar'))).toEqual(['1:main', '2:main'])
    expect(area.querySelector('.toolbar-stack.at-right .set-toolbar.vertical .turn-controls')).not.toBeNull()
    expect(area.querySelector('[data-toolbar="2:turns"]')).toBeNull()
  })
})
