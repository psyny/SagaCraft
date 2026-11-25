/**
 * The map painter's renderer (plans 47, 48), in the map renderer's WebGL context: it draws the part of the map in view
 * into a texture the size of the canvas, which the map shader puts under the pictures. Two passes: the ground (terrain,
 * routes: painter/shader.ts, one full-canvas pass) and the sprites (scenery, boundaries, rivers' waterfalls, effects and features:
 * painter/sprites.ts, one instanced draw over it); at night, a bloom over them (painter/bloom.ts: small passes at a
 * quarter size). Data changes upload textures and the sprites' instances once; a still painting is drawn
 * again only when the view changes.
 *
 * Its ground shader is big: Windows browsers (Direct3D) take seconds to build it the first time (then the browser keeps
 * it on disk). So the programs are built for the painting's style only, in the background where the browser can
 * (KHR_parallel_shader_compile: every current browser on Windows), and nothing waits for them: until they're ready the
 * painting is the map's background colour, and the map redraws when they are. Never ask a program's link status, nor
 * use it, before it's complete: that waits for the build, and on Windows the whole browser waits with it. The sprites'
 * atlas is made in the background too (painter/atlas.ts); `onChange` says when there's something new to draw.
 */
import type { MapGrid, MapPaint, PainterSettings, PaintPack } from '../../api/types'
import { buildAtlas, slotKey, type Atlas } from './atlas'
import { paintTextures, PALETTE_ROWS } from './data'
import type { Daylight } from './daylight'
import { BLOOM_FRAGMENT, BLOOM_VERTEX } from './bloom'
import { PAINT_FRAGMENT, PAINT_VERTEX } from './shader'
import { SPRITE_FRAGMENT, SPRITE_VERTEX } from './spriteShader'
import { paintSprites, type Sprite } from './sprites'

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

/** One style's programs: the ground pass, the sprites, the night's bloom. */
interface Programs {
  builds: [Build, Build, Build]
  status: PainterState
  ground: Record<string, WebGLUniformLocation | null>
  sprites: Record<string, WebGLUniformLocation | null>
  bloom: Record<string, WebGLUniformLocation | null>
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

/** Floats per sprite instance: aBase 4, aBox 4, aUV 4, aMove 4, aPath 4. */
const FLOATS = 20
const ATTRIBUTES: [string, number][] = [['aBase', 0], ['aBox', 4], ['aUV', 8], ['aMove', 12], ['aPath', 16]]

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
  /** The hour's light (painter/daylight.ts; default noon). */
  light?: Daylight
  /** Where the wind blows (the ocean's waves): map px direction, its length its strength. */
  wind?: [number, number]
}

interface Instancing {
  vertexAttribDivisorANGLE(index: number, divisor: number): void
  drawArraysInstancedANGLE(mode: number, first: number, count: number, primcount: number): void
}

export class Painter {
  private gl: WebGLRenderingContext
  private parallel: { COMPLETION_STATUS_KHR: number } | null
  private instancing: Instancing | null
  /** Per style, built when first wanted */
  private programs = new Map<Style, Programs>()
  /** The style last wanted (`state`'s) */
  private style: Style
  private disposed = false
  /** What the map shader gets until the painter is ready: the background colour (1 × 1). */
  private placeholder: WebGLTexture
  private placeholderColor = ''
  private quad: WebGLBuffer
  private corners: WebGLBuffer
  private instances: WebGLBuffer
  private instanceCount = 0
  private tiles: WebGLTexture
  private kinds: WebGLTexture
  private palette: WebGLTexture
  private atlasDay: WebGLTexture
  private atlasNight: WebGLTexture
  private counts: [number, number] = [1, 1]
  private target: WebGLTexture
  private frame: WebGLFramebuffer
  private size: [number, number] = [0, 0]
  /** The night's bloom: two quarter-size textures, blurred back and forth. */
  private glow: [WebGLTexture, WebGLTexture]
  private glowFrames: [WebGLFramebuffer, WebGLFramebuffer]
  private glowSize: [number, number] = [0, 0]
  /** The painting's sprites (made from its data) and the atlas they're drawn from (made in the background). */
  private sprites: Sprite[] = []
  private atlas: Atlas | null = null
  private atlasWanted = ''
  private pack: PaintPack | null = null
  /** What the texture holds now: a still painting is drawn again only when this changes (fog strokes, the grid's
   *  lines... redraw the map, not the painting). */
  private drawn = ''
  /** Something new to draw (the atlas got ready): the map draws again. */
  onChange: (() => void) | null = null

  /** A painter for this context: its shaders start building for this style (see the top; `state` says when they're
   *  done). */
  static create(gl: WebGLRenderingContext, style: Style = 'storybook'): Painter {
    return new Painter(gl, style)
  }

  private constructor(gl: WebGLRenderingContext, style: Style) {
    this.gl = gl
    this.parallel = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null
    this.instancing = gl.getExtension('ANGLE_instanced_arrays') as Instancing | null
    this.style = style
    this.quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    this.corners = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW)
    this.instances = gl.createBuffer()!
    const texture = (filter: number = gl.NEAREST) => {
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, filter)
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE)
      return t
    }
    this.tiles = texture()
    this.kinds = texture()
    this.palette = texture()
    this.target = texture()
    this.placeholder = texture()
    this.atlasDay = texture(gl.LINEAR)
    this.atlasNight = texture(gl.LINEAR)
    for (const t of [this.atlasDay, this.atlasNight]) {
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
    }
    this.frame = gl.createFramebuffer()!
    this.glow = [texture(gl.LINEAR), texture(gl.LINEAR)]
    this.glowFrames = [gl.createFramebuffer()!, gl.createFramebuffer()!]
    this.prepare(style)
  }

  /** The style's programs, their build started the first time (the painter's tools and the map wait for nothing). */
  prepare(style: Style): Programs {
    this.style = style
    let p = this.programs.get(style)
    if (!p) {
      const { gl } = this
      p = {
        builds: [startBuild(gl, PAINT_VERTEX, forStyle(PAINT_FRAGMENT, style), `ground, ${style}`),
          startBuild(gl, SPRITE_VERTEX, SPRITE_FRAGMENT, `sprites, ${style}`), startBuild(gl, BLOOM_VERTEX, BLOOM_FRAGMENT, 'bloom')],
        status: 'building', ground: {}, sprites: {}, bloom: {},
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
      p.ground = names(p.builds[0].program, ['uRes', 'uView', 'uCount', 'uTiles', 'uKinds', 'uPalette', 'uBackground', 'uGridType', 'uSize', 'uOrigin', 'uTime', 'uTint', 'uNight', 'uWind'])
      p.sprites = names(p.builds[1].program, ['uView', 'uTime', 'uAtlas', 'uNightAtlas', 'uLight', 'uNight', 'uGlowColor', 'uPalette', 'uPx'])
      p.bloom = names(p.builds[2].program, ['uTex', 'uStep', 'uMode', 'uAmount'])
    }
    return p.status
  }

  /** The painting to draw (on this grid, its types drawn as the style's pack says). */
  setData(paint: MapPaint, grid: MapGrid, pack: PaintPack | null) {
    if (this.disposed) return
    const { gl } = this
    const t = paintTextures(paint, grid, pack)
    this.counts = [t.cols, t.rows]
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    const upload = (tex: WebGLTexture, w: number, h: number, bytes: Uint8Array) => {
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
    }
    upload(this.tiles, t.cols, t.rows, t.tiles)
    upload(this.kinds, t.cols, t.rows, t.kinds)
    upload(this.palette, 256, PALETTE_ROWS, t.palette)
    this.pack = pack
    this.sprites = paintSprites(paint, grid, pack)
    this.updateSprites()
    this.drawn = ''
  }

  /** The sprites' instances from the atlas we have; a new atlas made in the background when sprites need one. */
  private updateSprites() {
    const { gl, pack } = this
    const wanted = this.sprites.filter((s) => !s.glow && !s.box && !s.particle && !s.fall).map((s) => ({ name: s.name, colors: s.colors, px: s.px }))
    const key = pack ? `${pack.version}|${[...new Set(wanted.map(slotKey))].sort().join(';')}` : ''
    if (pack && wanted.length && key !== this.atlasWanted && typeof document !== 'undefined') {
      this.atlasWanted = key
      const max = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number || 2048)
      buildAtlas(pack, wanted, max).then((atlas) => {
        if (this.disposed || this.atlasWanted !== key) return
        this.atlas = atlas
        this.uploadAtlas(atlas)
        this.updateSprites()
        this.drawn = ''
        this.onChange?.()
      }).catch((e) => console.error('Map painter: the sprites did not draw', e))
    }
    const slots = this.atlas?.slots
    const data = new Float32Array(this.sprites.length * FLOATS)
    let n = 0
    for (const s of this.sprites) {
      if (s.particle) {
        const p = s.particle
        data.set([s.x, s.y, s.w, s.h, p.shape, p.lift, p.opacity, 3, p.entry, p.row, p.glow ? 1 : 0, p.night ? 1 : 0,
          p.motion, s.amount, s.speed, s.phase, p.spin, p.twinkle, 0, 0], n * FLOATS)
        n += 1
        continue
      }
      if (s.fall) {
        const f = s.fall
        data.set([s.x, s.y, f.dx, f.dy, f.half, s.h, f.mode, 4, f.entry, f.lava ? 1 : 0, s.phase, 0,
          0, 0, 0, 0, 0, 0, 0, 0], n * FLOATS)
        n += 1
        continue
      }
      if (s.box) {
        const b = s.box
        data.set([s.x, s.y, b.qx, b.qy, b.thick, s.h, b.cliff ? 1 : 0, 2, b.entry, b.look, b.gaps, s.phase,
          b.outX, b.outY, 0, 0, 0, 0, 0, 0], n * FLOATS)
        n += 1
        continue
      }
      const slot = s.glow ? { u0: 0, v0: 0, u1: 0, v1: 0, night: false } : slots?.get(slotKey(s))
      if (!slot) continue
      // (aBox.w: 1 a glow; a picture's 0 or less: minus how much of its foot fades)
      data.set([s.x, s.y, s.w, s.h, s.ax, s.ay, s.flip ? 1 : 0, s.glow ? 1 : -(s.fade ?? 0), slot.u0, slot.v0, slot.u1, slot.v1,
        s.sway, s.phase, s.spin, slot.night ? 1 : 0, s.motion, s.amount, s.speed, s.blink], n * FLOATS)
      n += 1
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances)
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, Math.max(1, n) * FLOATS), gl.STATIC_DRAW)
    this.instanceCount = n
  }

  private uploadAtlas(atlas: Atlas) {
    const { gl } = this
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    for (const [tex, canvas] of [[this.atlasDay, atlas.day], [this.atlasNight, atlas.night]] as const) {
      gl.bindTexture(gl.TEXTURE_2D, tex)
      if (canvas) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  }

  /** The night's bloom over the drawn painting: its bright parts at a quarter size, blurred near then wide, added back. */
  private bloom(program: WebGLProgram, u: Record<string, WebGLUniformLocation | null>, v: PaintView, night: number) {
    const { gl } = this
    const w = Math.max(1, Math.ceil(v.width / 4)), h = Math.max(1, Math.ceil(v.height / 4))
    if (this.glowSize[0] !== w || this.glowSize[1] !== h) {
      this.glow.forEach((tex, i) => {
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowFrames[i])
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      })
      this.glowSize = [w, h]
    }
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    const pos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0 + 6)
    gl.uniform1i(u.uTex, 6)
    const pass = (from: WebGLTexture, to: number, mode: number, step: [number, number], amount: number) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to < 0 ? this.frame : this.glowFrames[to])
      if (to < 0) gl.viewport(0, 0, v.width, v.height)
      else gl.viewport(0, 0, w, h)
      gl.bindTexture(gl.TEXTURE_2D, from)
      gl.uniform1f(u.uMode, mode)
      gl.uniform2f(u.uStep, step[0], step[1])
      gl.uniform1f(u.uAmount, amount)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    gl.disable(gl.BLEND)
    // bright parts (less of them toward dusk), then near and wide blurs
    pass(this.target, 0, 0, [1 / v.width, 1 / v.height], 0.6 + (1 - night) * 0.3)
    pass(this.glow[0], 1, 1, [1.5 / w, 0], 0)
    pass(this.glow[1], 0, 1, [0, 1.5 / h], 0)
    pass(this.glow[0], 1, 1, [3.5 / w, 0], 0)
    pass(this.glow[1], 0, 1, [0, 3.5 / h], 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    pass(this.glow[0], -1, 2, [0, 0], 0.9 * night)
    gl.disable(gl.BLEND)
    gl.disableVertexAttribArray(pos)
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
    const light = v.light ?? { tint: [1, 1, 1], night: 0 }
    const key = JSON.stringify([v.width, v.height, v.view, v.grid.size, v.grid.x, v.grid.y, v.grid.type, v.settings.style, v.background, light, v.wind])
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
    const [ground, sprites, bloom] = programs.builds.map((b) => b.program)
    const bind = (unit: number, tex: WebGLTexture, uniform: WebGLUniformLocation | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform1i(uniform, unit)
    }
    // The ground: one pass
    gl.disable(gl.BLEND)
    gl.useProgram(ground)
    const u = programs.ground
    gl.uniform2f(u.uRes, v.width, v.height)
    gl.uniform4f(u.uView, v.view.x, v.view.y, v.view.w, v.view.h)
    gl.uniform1f(u.uGridType, v.grid.type === 'hex' ? 2 : 1)
    gl.uniform1f(u.uSize, v.grid.size)
    gl.uniform2f(u.uOrigin, v.grid.x, v.grid.y)
    gl.uniform1f(u.uTime, v.time)
    gl.uniform2f(u.uCount, this.counts[0], this.counts[1])
    gl.uniform3f(u.uBackground, ...v.background)
    gl.uniform3f(u.uTint, ...light.tint)
    gl.uniform1f(u.uNight, light.night)
    gl.uniform2f(u.uWind, ...(v.wind ?? [0.45, 0.12]))
    bind(3, this.tiles, u.uTiles)
    bind(4, this.kinds, u.uKinds)
    bind(5, this.palette, u.uPalette)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    const pos = gl.getAttribLocation(ground, 'aPos')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.disableVertexAttribArray(pos)
    // The sprites over it, nearest last (premultiplied: the atlas was uploaded so)
    const inst = this.instancing
    if (this.instanceCount && inst) {
      gl.enable(gl.BLEND)
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE)
      gl.useProgram(sprites)
      const s = programs.sprites
      gl.uniform4f(s.uView, v.view.x, v.view.y, v.view.w, v.view.h)
      gl.uniform1f(s.uTime, v.time)
      gl.uniform3f(s.uLight, ...light.tint)
      gl.uniform1f(s.uNight, light.night)
      const glow = this.pack?.style.light ?? '#ffd27a'
      gl.uniform3f(s.uGlowColor, ...([1, 3, 5].map((i) => (parseInt(glow.slice(i, i + 2), 16) || 0) / 255) as [number, number, number]))
      bind(6, this.atlasDay, s.uAtlas)
      bind(7, this.atlasNight, s.uNightAtlas)
      bind(5, this.palette, s.uPalette)
      gl.uniform1f(s.uPx, v.view.w / v.width)
      const used: number[] = []
      gl.bindBuffer(gl.ARRAY_BUFFER, this.corners)
      const corner = gl.getAttribLocation(sprites, 'aCorner')
      gl.enableVertexAttribArray(corner)
      gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0)
      used.push(corner)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instances)
      for (const [name, offset] of ATTRIBUTES) {
        const at = gl.getAttribLocation(sprites, name)
        if (at < 0) continue
        gl.enableVertexAttribArray(at)
        gl.vertexAttribPointer(at, 4, gl.FLOAT, false, FLOATS * 4, offset * 4)
        inst.vertexAttribDivisorANGLE(at, 1)
        used.push(at)
      }
      inst.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, this.instanceCount)
      // (attributes are shared with the other programs: put them back as they were)
      for (const at of used) {
        inst.vertexAttribDivisorANGLE(at, 0)
        gl.disableVertexAttribArray(at)
      }
      gl.disable(gl.BLEND)
    }
    // At night, what lights itself glows over a larger area (painter/bloom.ts)
    if (light.night > 0.03) this.bloom(bloom, programs.bloom, v, light.night)
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
    for (const t of [this.tiles, this.kinds, this.palette, this.target, this.placeholder, this.atlasDay, this.atlasNight, ...this.glow]) gl.deleteTexture(t)
    for (const f of this.glowFrames) gl.deleteFramebuffer(f)
    gl.deleteFramebuffer(this.frame)
    for (const b of [this.quad, this.corners, this.instances]) gl.deleteBuffer(b)
  }
}
