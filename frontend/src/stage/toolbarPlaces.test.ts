import { describe, expect, it } from 'vitest'
import { DEFAULT_PLACE, dockStyle, placeOf, stackKey, toolbarsOf } from './toolbarPlaces'
import type { SetTypeUI } from './types'

const ui = (toolbars: SetTypeUI['toolbars']) => ({ key: 't', name: 'T', View: () => null, toolbars }) as SetTypeUI

describe('Set toolbars', () => {
  it('give every Set a main toolbar first (the type can name it and place it)', () => {
    expect(toolbarsOf(undefined).map((t) => t.key)).toEqual(['main'])
    const own = toolbarsOf(ui([{ key: 'turns', name: 'Turns', place: { anchor: 'bottom' } }, { key: 'main', name: 'Scene', place: { outside: true } }]))
    expect(own.map((t) => [t.key, t.name])).toEqual([['main', 'Scene'], ['turns', 'Turns']])
  })

  it('place a toolbar: the default, then the type\'s, then what the DM changed', () => {
    const def = { key: 'turns', name: 'Turns', place: { anchor: 'bottom' as const, outside: true } }
    expect(placeOf(def, {})).toEqual({ ...DEFAULT_PLACE, anchor: 'bottom', outside: true })
    expect(placeOf(def, { toolbars: { turns: { anchor: 'right', vertical: true } } })).toMatchObject({ anchor: 'right', vertical: true, outside: true })
  })

  it('stack by anchor; outside only counts on a canvas Stage', () => {
    const place = { ...DEFAULT_PLACE, anchor: 'top' as const, outside: true }
    expect(stackKey(place, true)).toBe('out-top')
    expect(stackKey(place, false)).toBe('top')
  })

  it('turn the distance into margins away from the edge, or a shift along an edge\'s middle', () => {
    const at = (anchor: typeof DEFAULT_PLACE.anchor) => ({ ...DEFAULT_PLACE, anchor, x: 10, y: 20 })
    expect(dockStyle(at('top-left'), false)).toEqual({ marginLeft: 10, marginTop: 20 })
    expect(dockStyle(at('bottom-right'), false)).toEqual({ marginRight: 10, marginBottom: 20 })
    expect(dockStyle(at('top'), false)).toEqual({ position: 'relative', left: 10, marginTop: 20 })
    expect(dockStyle(at('right'), false)).toEqual({ marginRight: 10, position: 'relative', top: 20 })
    // Outside: away from the Set's own edge (above it, below it, beside it)
    expect(dockStyle(at('top-left'), true)).toEqual({ marginLeft: 10, marginBottom: 20 })
    expect(dockStyle(at('bottom'), true)).toEqual({ position: 'relative', left: 10, marginTop: 20 })
    expect(dockStyle(at('left'), true)).toEqual({ marginRight: 10, position: 'relative', top: 20 })
  })
})
