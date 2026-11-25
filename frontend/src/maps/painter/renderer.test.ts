import type { MapGrid } from '../../api/types'
import { emptyPaint, withTiles } from './data'
import { forStyle, Painter, paintersBuilding, type PaintView } from './renderer'
import { PAINT_FRAGMENT } from './shader'

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
const paint = withTiles(emptyPaint(), GRID, { type: 'ground.grass', colors: ['#cdc98d', '#8f9a58', '#e6dfb0'], material: 1 }, [[0, 0]])

describe("the map painter's shaders build in the background (plan 47: they once froze Windows browsers)", () => {
  it('are built for one style: the other one is left out', () => {
    const storybook = forStyle(PAINT_FRAGMENT, 'storybook')
    expect(storybook).toContain('const float uStyle = 0.0;')
    expect(storybook).not.toMatch(/uniform float uStyle/)
    expect(() => forStyle('void main() {}', 'storybook')).toThrow()
  })

  it("never wait for a build: the background colour until it's done, then the painting", () => {
    const { gl, state } = fakeGl()
    const painter = Painter.create(gl, 'storybook')
    painter.setData(paint, GRID)
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
    expect(state.calls.filter((c) => c === 'createProgram').length).toBe(programs + 2) // terrain and landmarks
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
    painter.setData(paint, GRID)
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
