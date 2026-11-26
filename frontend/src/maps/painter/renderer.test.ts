import type { MapGrid } from '../../api/types'
import { emptyPaint, withTiles } from './data'
import { Painter, paintersBuilding, type PaintView } from './renderer'
import { resolveMaterials, withMaterials } from './materials'
import { PAINT_FRAGMENT } from './shader'
import { SPRITE_FRAGMENT } from './spriteShader'
import { TEST_PACK } from './testPack'

const COMPLETION = 0x91b1

/** A WebGL context that records its calls; programs finish building when `done` says so. */
function fakeGl({ parallel = true } = {}) {
  const state = { done: false, calls: [] as string[] }
  const own: Record<string, unknown> = {
    LINK_STATUS: 0x8b82,
    getExtension: (name: string) => (parallel && name === 'KHR_parallel_shader_compile' ? { COMPLETION_STATUS_KHR: COMPLETION } : null),
    getProgramParameter: (_p: unknown, what: number) => {
      state.calls.push(what === COMPLETION ? 'complete?' : 'linked?')
      return what === COMPLETION ? state.done : true
    },
    getAttribLocation: () => 0,
  }
  const gl = new Proxy(own, {
    get(target, name: string) {
      if (name in target) return target[name]
      if (/^[A-Z0-9_]+$/.test(name)) return 1 // constants
      return () => { state.calls.push(name); return {} }
    },
  })
  return { gl: gl as unknown as WebGLRenderingContext, state }
}

const GRID: MapGrid = { type: 'square', size: 100, x: 0, y: 0, cols: 4, rows: 3, auto: false, unit_size: 5, unit: 'mi', color: '#fff', opacity: 0.5, mode: 'contrast', line: 0.5 }
const view = (style = 'storybook'): PaintView => ({
  width: 40, height: 30, view: { x: 0, y: 0, w: 400, h: 300 }, grid: GRID,
  settings: { style: style as 'storybook', kind: 'world', animated: false }, background: [1, 0.5, 0], time: 0,
})
const paint = withTiles(emptyPaint(), GRID, { type: 'ground.grass', colors: ['#cdc98d', '#8f9a58', '#e6dfb0'] }, [[0, 0]])

describe("the map painter's shaders build in the background (plan 47: they once froze Windows browsers)", () => {
  it('selects registered material functions and bounds parameters from a style pack', () => {
    const selected = resolveMaterials({ flame: { look: 'faceted', params: { flicker: 2.6, heat: 10 } }, water: { look: 'unknown' } })
    const ground = withMaterials(PAINT_FRAGMENT, selected, 'ground')
    const sprites = withMaterials(SPRITE_FRAGMENT, selected, 'sprites')
    expect(sprites).toContain('#define MAP_FLAME_FLICKER 2.6000')
    expect(sprites).toContain('#define MAP_FLAME_HEAT 1.0000')
    expect(sprites).toContain('vec4 facetedFlame(')
    expect(ground).not.toContain('vec4 facetedFlame(')
    expect(ground).not.toContain('#define MAP_WATER_')
    expect(withMaterials(SPRITE_FRAGMENT, resolveMaterials(), 'sprites')).not.toContain('vec4 facetedFlame(')
  })

  it('builds a new program when a pack selects another material on the same style', () => {
    const { gl, state } = fakeGl({ parallel: false })
    const painter = Painter.create(gl, 'storybook', TEST_PACK)
    const count = () => state.calls.filter((c) => c === 'createProgram').length
    const before = count()
    const pack = { ...TEST_PACK, style: { ...TEST_PACK.style, materials: { flame: { look: 'faceted' } } } }
    painter.setData(paint, GRID, pack)
    expect(count()).toBe(before + 3)
    painter.render(view())
    expect(count()).toBe(before + 3)
    painter.setData(paint, GRID, TEST_PACK)
    expect(count()).toBe(before + 3)
    painter.dispose()
  })

  it("never wait for a build: the background colour until it's done, then the painting", () => {
    const { gl, state } = fakeGl()
    const painter = Painter.create(gl, 'storybook')
    painter.setData(paint, GRID, TEST_PACK)
    expect(state.calls).toContain('linkProgram')
    expect(painter.state).toBe('building')
    expect(paintersBuilding()).toBe(1)
    expect(painter.render(view())).not.toBeNull() // the placeholder
    expect(state.calls).not.toContain('linked?') // asking would wait for the build (the whole browser, on Windows)
    expect(state.calls).not.toContain('drawArrays')

    state.done = true
    expect(painter.state).toBe('ready')
    expect(paintersBuilding()).toBe(0)
    painter.render(view())
    expect(state.calls).toContain('drawArrays')
    painter.dispose()
  })

  it('build another style when the painting changes to it', () => {
    const { gl, state } = fakeGl()
    const painter = Painter.create(gl, 'storybook')
    state.done = true
    expect(painter.state).toBe('ready')
    const programs = state.calls.filter((c) => c === 'createProgram').length
    state.done = false
    painter.render(view('another')) // (a style to come)
    expect(state.calls.filter((c) => c === 'createProgram').length).toBe(programs + 3) // the ground, the sprites, the bloom
    expect(painter.state).toBe('building')
    painter.dispose()
    expect(paintersBuilding()).toBe(0)
  })

  it('does nothing once disposed (React StrictMode disposes and makes a new one: no deleted GL objects used)', () => {
    const { gl, state } = fakeGl()
    const painter = Painter.create(gl, 'storybook')
    state.done = true
    painter.dispose()
    const before = state.calls.length
    painter.setData(paint, GRID, TEST_PACK)
    expect(painter.render(view())).toBeNull()
    expect(state.calls.length).toBe(before)
  })

  it('without the browser extension, build at once (as before)', () => {
    const { gl } = fakeGl({ parallel: false })
    const painter = Painter.create(gl, 'storybook')
    expect(painter.state).toBe('ready')
    painter.dispose()
  })
})
