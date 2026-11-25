/**
 * The map painter's renderer (plan 47), in the map renderer's WebGL context: it draws the part of the map in view
 * (terrain, roads and rivers, then the landmarks) into a texture the size of the canvas, which the map shader puts
 * under the pictures. Data changes upload textures once; drawing is one full-canvas pass plus a quad per landmark.
 *
 * Its shaders are big: Windows browsers (Direct3D) take seconds to build them the first time (then the browser keeps
 * them on disk). So they're built for the painting's style only (the other style's code isn't in them: half the time),
 * in the background where the browser can (KHR_parallel_shader_compile: every current browser on Windows), and nothing
 * waits for them: until they're ready the painting is the map's background colour, and the map redraws when they are.
 * Never ask a program's link status, nor use it, before it's complete: that waits for the build, and on Windows the
 * whole browser waits with it.
 */
import type { MapGrid, MapPaint, PainterSettings } from '../../api/types'
import { paintTextures } from './data'
import { OBJECT_FRAGMENT, OBJECT_VERTEX } from './objects'
import { PAINT_FRAGMENT, PAINT_VERTEX } from './shader'

const FLOATS = 17 // per landmark vertex: corner 2, place 4, kind 2, colours 9

type Style = PainterSettings['style']

/** The styles' numbers in the shaders (plan 48: Storybook only for now). */
const STYLE_NUMBERS: Record<string, number> = { storybook: 0 }

/** A shader built for one style: its style is a constant (the compiler drops the other styles' code). */
export function forStyle(source: string, style: Style): string {
  const line = /uniform float uStyle;[^\n]*/
  if (!line.test(source)) throw new Error('The painter shader has no uStyle uniform to build for a style')
  return source.replace(line, `const float uStyle = ${(STYLE_NUMBERS[style] ?? 0).toFixed(1)}; // built for one style`)
}

interface Build { name: string; program: WebGLProgram; vs: WebGLShader; fs: WebGLShader }

/** One style's programs: terrain (roads, rivers) and landmarks. */
interface Programs {
  builds: [Build, Build]
  status: PainterState
  terrain: Record<string, WebGLUniformLocation | null>
  objects: Record<string, WebGLUniformLocation | null>
}

/** Starts building a program (its status isn't asked here: see the top). */
function startBuild(gl: WebGLRenderingContext, vertex: string, fragment: string, name: string): Build {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, source)
    gl.compileShader(s)
    return s
  }
  const vs = shader(gl.VERTEX_SHADER, vertex)
  const fs = shader(gl.FRAGMENT_SHADER, fragment)
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  return { name, program, vs, fs }
}

/** A finished build: did it link? (logs why not) */
function built(gl: WebGLRenderingContext, b: Build): boolean {
  if (gl.getProgramParameter(b.program, gl.LINK_STATUS)) return true
  const log = [b.vs, b.fs].map((s) => gl.getShaderInfoLog(s)).filter(Boolean).join(' ')
  console.error(`Map painter (${b.name}) did not build:`, log || gl.getProgramInfoLog(b.program) || '(no log)',
    gl.isContextLost() ? '(the GPU context was lost)' : '')
  return false
}

// How many painters are still building (the painter's tools say so: the first time on Windows takes seconds)
let building = 0
const listeners = new Set<() => void>()
const changed = (by: number) => { building += by; listeners.forEach((l) => l()) }
export const paintersBuilding = () => building
export function onPaintersBuilding(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export type PainterState = 'building' | 'ready' | 'failed'

const hexRgb = (c: string) => [1, 3, 5].map((i) => (parseInt(c.slice(i, i + 2), 16) || 0) / 255)
const seedOf = (id: string) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7) / 997

export interface PaintView {
  /** The canvas, px. */
  width: number
  height: number
  /** The part of the map the canvas covers (map px). */
  view: { x: number; y: number; w: number; h: number }
  grid: MapGrid
  settings: PainterSettings
  background: [number, number, number]
  /** Seconds (0: still). */
  time: number
}

export class Painter {
  private gl: WebGLRenderingContext
  private parallel: { COMPLETION_STATUS_KHR: number } | null
  /** Per style, built when first wanted */
  private programs = new Map<Style, Programs>()
  /** The style last wanted (`state`'s) */
  private style: Style
  private disposed = false
  /** What the map shader gets until the painter is ready: the background colour (1 × 1). */
  private placeholder: WebGLTexture
  private placeholderColor = ''
  private quad: WebGLBuffer
  private objectBuffer: WebGLBuffer
  private objectCount = 0
  private tiles: WebGLTexture
  private kinds: WebGLTexture
  private palette: WebGLTexture
  private counts: [number, number] = [1, 1]
  private target: WebGLTexture
  private frame: WebGLFramebuffer
  private size: [number, number] = [0, 0]
  /** What the texture holds now: a still painting is drawn again only when this changes (fog strokes, the grid's
   *  lines... redraw the map, not the painting). */
  private drawn = ''

  /** A painter for this context: its shaders start building for this style (see the top; `state` says when they're
   *  done). */
  static create(gl: WebGLRenderingContext, style: Style = 'storybook'): Painter {
    return new Painter(gl, style)
  }

  private constructor(gl: WebGLRenderingContext, style: Style) {
    this.gl = gl
    this.parallel = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null
    this.style = style
    this.quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    this.objectBuffer = gl.createBuffer()!
    const texture = () => {
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST)
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE)
      return t
    }
    this.tiles = texture()
    this.kinds = texture()
    this.palette = texture()
    this.target = texture()
    this.placeholder = texture()
    this.frame = gl.createFramebuffer()!
    this.prepare(style)
  }

  /** The style's programs, their build started the first time (the painter's tools and the map wait for nothing). */
  prepare(style: Style): Programs {
    this.style = style
    let p = this.programs.get(style)
    if (!p) {
      const { gl } = this
      p = {
        builds: [startBuild(gl, PAINT_VERTEX, forStyle(PAINT_FRAGMENT, style), `terrain, ${style}`),
          startBuild(gl, OBJECT_VERTEX, forStyle(OBJECT_FRAGMENT, style), `landmarks, ${style}`)],
        status: 'building', terrain: {}, objects: {},
      }
      this.programs.set(style, p)
      changed(1)
    }
    this.check(p)
    return p
  }

  /** The last wanted style's programs: building (the painting shows as the background colour meanwhile), ready, or
   *  failed (they stay so). */
  get state(): PainterState {
    const p = this.programs.get(this.style)
    return p ? this.check(p) : 'building'
  }

  private check(p: Programs): PainterState {
    if (p.status !== 'building' || this.disposed) return p.status
    const { gl } = this
    // Without the extension the build is done by now (compiling waited for it)
    if (this.parallel && !p.builds.every((b) => gl.getProgramParameter(b.program, this.parallel!.COMPLETION_STATUS_KHR))) return 'building'
    const ok = p.builds.every((b) => built(gl, b))
    p.status = ok ? 'ready' : 'failed'
    changed(-1)
    if (ok) {
      const names = (program: WebGLProgram, list: string[]) => Object.fromEntries(list.map((n) => [n, gl.getUniformLocation(program, n)]))
      p.terrain = names(p.builds[0].program, ['uRes', 'uView', 'uCount', 'uTiles', 'uKinds', 'uPalette', 'uBackground', 'uGridType', 'uSize', 'uOrigin', 'uTime'])
      p.objects = names(p.builds[1].program, ['uRes', 'uView', 'uGridType', 'uSize', 'uOrigin', 'uTime'])
    }
    return p.status
  }

  /** The painting to draw (on this grid). */
  setData(paint: MapPaint, grid: MapGrid) {
    if (this.disposed) return
    const { gl } = this
    const t = paintTextures(paint, grid)
    this.counts = [t.cols, t.rows]
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    const upload = (tex: WebGLTexture, w: number, h: number, bytes: Uint8Array) => {
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
    }
    upload(this.tiles, t.cols, t.rows, t.tiles)
    upload(this.kinds, t.cols, t.rows, t.kinds)
    upload(this.palette, 256, 4, t.palette)
    // Landmarks: two triangles each, from their anchor tile's centre
    const data = new Float32Array(paint.objects.length * 6 * FLOATS)
    const R = grid.size / Math.sqrt(3)
    paint.objects.forEach((o, n) => {
      const [c, r] = o.tile
      const cx = grid.type === 'hex' ? grid.x + grid.size * (c + 0.5 + (r % 2 ? 0.5 : 0)) : grid.x + grid.size * (c + 0.5)
      const cy = grid.type === 'hex' ? grid.y + R + r * 1.5 * R : grid.y + grid.size * (r + 0.5)
      const radius = o.size * grid.size * 0.5
      const colours = o.colors.flatMap(hexRgb)
      ;[[-1, -1], [1, -1], [-1, 1], [-1, 1], [1, -1], [1, 1]].forEach(([x, y], k) => {
        data.set([x, y, cx, cy, radius, seedOf(o.id), o.material, o.variant, ...colours], (n * 6 + k) * FLOATS)
      })
    })
    gl.bindBuffer(gl.ARRAY_BUFFER, this.objectBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    this.objectCount = paint.objects.length * 6
    this.drawn = ''
  }

  /** Draws the painting for this view into its texture, and returns it (the map shader samples it per pixel); until
   *  the painter is ready (or if it failed), a texture of the background colour. Null once disposed. */
  render(v: PaintView): WebGLTexture | null {
    const { gl } = this
    if (this.disposed) return null
    const programs = this.prepare(v.settings.style)
    if (programs.status !== 'ready') {
      const color = v.background.join()
      if (color !== this.placeholderColor) {
        this.placeholderColor = color
        gl.bindTexture(gl.TEXTURE_2D, this.placeholder)
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([...v.background.map((c) => Math.round(c * 255)), 255]))
      }
      return this.placeholder
    }
    const key = JSON.stringify([v.width, v.height, v.view, v.grid.size, v.grid.x, v.grid.y, v.grid.type, v.settings.style, v.background])
    if (!v.time && key === this.drawn) return this.target
    this.drawn = v.time ? '' : key
    if (this.size[0] !== v.width || this.size[1] !== v.height) {
      gl.bindTexture(gl.TEXTURE_2D, this.target)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, v.width, v.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.frame)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.target, 0)
      this.size = [v.width, v.height]
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frame)
    gl.viewport(0, 0, v.width, v.height)
    const grid = (u: Record<string, WebGLUniformLocation | null>) => {
      gl.uniform2f(u.uRes, v.width, v.height)
      gl.uniform4f(u.uView, v.view.x, v.view.y, v.view.w, v.view.h)
      gl.uniform1f(u.uGridType, v.grid.type === 'hex' ? 2 : 1)
      gl.uniform1f(u.uSize, v.grid.size)
      gl.uniform2f(u.uOrigin, v.grid.x, v.grid.y)
      gl.uniform1f(u.uTime, v.time)
    }
    // Terrain, roads and rivers: one pass
    gl.disable(gl.BLEND)
    const [terrain, objects] = programs.builds.map((b) => b.program)
    gl.useProgram(terrain)
    const u = programs.terrain
    grid(u)
    gl.uniform2f(u.uCount, this.counts[0], this.counts[1])
    gl.uniform3f(u.uBackground, ...v.background)
    const bind = (unit: number, tex: WebGLTexture, uniform: WebGLUniformLocation | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform1i(uniform, unit)
    }
    bind(3, this.tiles, u.uTiles)
    bind(4, this.kinds, u.uKinds)
    bind(5, this.palette, u.uPalette)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    const pos = gl.getAttribLocation(terrain, 'aPos')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.disableVertexAttribArray(pos)
    // Landmarks over it
    if (this.objectCount) {
      gl.enable(gl.BLEND)
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(objects)
      grid(programs.objects)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.objectBuffer)
      const attributes: [string, number, number][] = [['aCorner', 2, 0], ['aPlace', 4, 2], ['aKind', 2, 6], ['aColA', 3, 8], ['aColB', 3, 11], ['aColC', 3, 14]]
      const used: number[] = []
      for (const [name, size, offset] of attributes) {
        const at = gl.getAttribLocation(objects, name)
        if (at < 0) continue
        gl.enableVertexAttribArray(at)
        gl.vertexAttribPointer(at, size, gl.FLOAT, false, FLOATS * 4, offset * 4)
        used.push(at)
      }
      gl.drawArrays(gl.TRIANGLES, 0, this.objectCount)
      used.forEach((at) => gl.disableVertexAttribArray(at))
      gl.disable(gl.BLEND)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return this.target
  }

  /** Frees its GL objects; it does nothing after this (a late call can't touch deleted objects). */
  dispose() {
    if (this.disposed) return
    const { gl } = this
    for (const p of this.programs.values()) {
      if (p.status === 'building') changed(-1)
      for (const b of p.builds) {
        gl.deleteProgram(b.program)
        gl.deleteShader(b.vs)
        gl.deleteShader(b.fs)
      }
    }
    this.disposed = true
    for (const t of [this.tiles, this.kinds, this.palette, this.target, this.placeholder]) gl.deleteTexture(t)
    gl.deleteFramebuffer(this.frame)
    gl.deleteBuffer(this.quad)
    gl.deleteBuffer(this.objectBuffer)
  }
}
