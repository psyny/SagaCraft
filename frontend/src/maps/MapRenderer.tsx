/**
 * Draws a location's map: its picture (the DM: the pictures composed here; players: the composed picture the
 * server made for their fog), the grid and the fog, with one WebGL shader (see shader.ts). Without WebGL it
 * falls back to a 2D canvas (flat fog, square-ish lines).
 * The canvas covers only the part of the map in view (plus a margin), at the screen's resolution, so the grid, the
 * fog's edges and the pictures stay sharp at any zoom. The pictures are one texture: power-of-two sized and mipmapped
 * (smooth zoomed out), sampled bicubically zoomed in past it.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '../api/client'
import type { MapGrid, MapImage, MapPaint, PainterSettings } from '../api/types'
import { fogBytes, inGrid, tilePolygon } from './geometry'
import { hasPaint } from './painter/data'
import { usePaintPack } from './painter/pack'
import { daylight } from './painter/daylight'
import { useAnimateMaps } from './animation'
import { Painter } from './painter/renderer'
import { DEFAULT_FOG_LOOK, FOG_STYLES, FRAGMENT, VERTEX, type FogDisplay, type FogLook } from './shader'

/** The map's picture: a URL (players' composed picture), the DM's pictures, or a canvas drawn here (previews). */
export type MapSource = { url: string } | { images: MapImage[] } | { canvas: HTMLCanvasElement } | null

interface Props {
  /** The map's size, in map px. */
  width: number
  height: number
  /** Screen px per map px wanted (zoom): the canvas resolution follows it, within limits. */
  quality: number
  source: MapSource
  grid: MapGrid
  showGrid: boolean
  /** Fog per tile (0 unknown, 1 known, 2 visible); null: no fog. */
  fog: Uint8Array | null
  display: FogDisplay
  fogLook?: FogLook
  /** 0..1: how much of the map shows under unknown tiles (the DM). */
  seeThrough?: number
  /** Grid lines only on known and visible tiles (map Sets); else everywhere (the editor). */
  gridOnlySeen?: boolean
  /** Where no picture covers the map (#rrggbb). */
  background?: string
  /** How far the map is zoomed in from its unzoomed (fitted) view: the grid's lines grow with it (its line width is
   *  for the unzoomed view). */
  lineZoom?: number
  /** The map painter (plan 47): the layer's painting, drawn under the pictures, and the map's painting settings. */
  paint?: MapPaint | null
  painter?: PainterSettings
  /** The map may be painted here (the editor): the painter's shaders start building at once, not at the first stroke
   *  (on Windows that takes seconds the first time). */
  paintable?: boolean
  /** The hour of the day (plan 48): its light on the painting and the pictures (default noon). */
  hour?: number
  /** Where the wind blows (the weather's: the ocean's waves move with it), map px direction, length its strength. */
  wind?: [number, number]
  /** Nothing moves (a download, plan 52). */
  still?: boolean
  /** After a draw with everything in (its picture, its painting's types, programs and sprites): the canvas, to copy at
   *  once (in the same task: its drawing buffer isn't kept). */
  onReady?: (canvas: HTMLCanvasElement) => void
}

/** A part of the map, in map px. */
interface Rect { x: number; y: number; w: number; h: number }

/** Pure: the part of the map to draw, from where the map is on screen and what of it is visible (screen px): the
 * visible part, a margin around it, snapped to steps of an eighth of it (small pans redraw without resizing). */
export function viewRect(world: DOMRect, visible: { left: number; top: number; right: number; bottom: number }, width: number, height: number): Rect | null {
  const left = Math.max(world.left, visible.left), top = Math.max(world.top, visible.top)
  const right = Math.min(world.right, visible.right), bottom = Math.min(world.bottom, visible.bottom)
  if (world.width < 1 || right <= left || bottom <= top) return null
  const k = width / world.width // map px per screen px
  const x = (left - world.left) * k, y = (top - world.top) * k, w = (right - left) * k, h = (bottom - top) * k
  const step = Math.max(16, Math.max(w, h) / 8)
  const x0 = Math.max(0, Math.floor((x - step) / step) * step), y0 = Math.max(0, Math.floor((y - step) / step) * step)
  const x1 = Math.min(width, Math.ceil((x + w + step) / step) * step), y1 = Math.min(height, Math.ceil((y + h + step) / step) * step)
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) }
}

/** Pure: a power of two at least `n` (and at most `max`): textures that can be mipmapped. */
export const pot = (n: number, max: number) => Math.min(max, 2 ** Math.ceil(Math.log2(Math.max(1, n))))

const MAX_CANVAS = 4096
const DEFAULT_WIND: [number, number] = [0.45, 0.12]
const MAX_TEXTURE = 4096

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
}

const loaded = new Map<string, Promise<HTMLImageElement>>()

/** Pictures are cached by URL: dragging a picture redraws without reloading the others. */
function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = loaded.get(url)
  if (cached) return cached
  const promise = fetchImage(url)
  loaded.set(url, promise)
  promise.catch(() => loaded.delete(url))
  if (loaded.size > 64) loaded.delete(loaded.keys().next().value as string)
  return promise
}

function fetchImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous' // the texture must not be "tainted"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${url}`))
    image.src = apiUrl(url)
  })
}

/** The map's picture as a power-of-two canvas (at most MAX_TEXTURE px a side: mipmapped), over the no-map colour (or
 * null while loading). */
function useComposite(source: MapSource, width: number, height: number, background: string, transparent = false): HTMLCanvasElement | null {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const key = source === null ? '' : 'url' in source ? source.url : 'canvas' in source ? source.canvas
    : JSON.stringify(source.images.map((i) => [i.url, i.x, i.y, i.scale, i.rotation ?? 0, Boolean(i.flip_x), Boolean(i.flip_y)]))
  useEffect(() => {
    let cancelled = false
    if (source === null) {
      setCanvas(null)
      return
    }
    if ('canvas' in source) {
      const out = document.createElement('canvas')
      out.width = pot(source.canvas.width, MAX_TEXTURE)
      out.height = pot(source.canvas.height, MAX_TEXTURE)
      out.getContext('2d')?.drawImage(source.canvas, 0, 0, out.width, out.height)
      setCanvas(out)
      return
    }
    const parts = 'url' in source ? [{ url: source.url, x: 0, y: 0, w: width, h: height }] :
      source.images.filter((i) => i.url).map((i) => ({ url: i.url!, x: i.x, y: i.y, w: i.w * i.scale, h: i.h * i.scale,
        rotation: i.rotation ?? 0, flipX: Boolean(i.flip_x), flipY: Boolean(i.flip_y) }))
    Promise.allSettled(parts.map((p) => loadImage(p.url))).then((results) => {
      if (cancelled) return
      const out = document.createElement('canvas')
      out.width = pot(width, MAX_TEXTURE)
      out.height = pot(height, MAX_TEXTURE)
      const fx = out.width / width, fy = out.height / height
      const ctx = out.getContext('2d')
      if (!ctx) return setCanvas(null)
      ctx.imageSmoothingQuality = 'high'
      // A painted map: the pictures over nothing (the painting shows where they don't cover it)
      if (!transparent) {
        ctx.fillStyle = background
        ctx.fillRect(0, 0, out.width, out.height)
      }
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return
        const p = parts[i]
        if (!('rotation' in p) || (!p.rotation && !p.flipX && !p.flipY)) {
          ctx.drawImage(r.value, p.x * fx, p.y * fy, p.w * fx, p.h * fy)
          return
        }
        // Mirrored, then turned around its middle (in map px, then to the canvas)
        ctx.save()
        ctx.setTransform(fx, 0, 0, fy, 0, 0)
        ctx.translate(p.x + p.w / 2, p.y + p.h / 2)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1)
        ctx.drawImage(r.value, -p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      })
      setCanvas(out)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, height, background, transparent])
  return canvas
}

interface Gl {
  gl: WebGLRenderingContext
  program: WebGLProgram
  quad: WebGLBuffer
  position: number
  map: WebGLTexture
  fog: WebGLTexture
  uniforms: Record<string, WebGLUniformLocation | null>
  /** The map painter, made the first time a painting shows (or the editor opens). */
  painter?: Painter
}

function setupGl(canvas: HTMLCanvasElement): Gl | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: false }) as WebGLRenderingContext | null
  if (!gl) {
    console.warn('Map: no WebGL here, drawing the plain 2D map (no fog looks, no contrast/inverse grid)')
    return null
  }
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Map shader:', gl.getShaderInfoLog(shader))
      return null
    }
    return shader
  }
  const vs = compile(gl.VERTEX_SHADER, VERTEX)
  const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT)
  if (!vs || !fs) return null
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    // Check other platforms with frontend/scripts/gpu-check.mjs: a shader can link on one and not another
    console.error('Map shader did not link, drawing the plain 2D map:', gl.getProgramInfoLog(program) || '(no log)',
      gl.isContextLost() ? '(the GPU context was lost)' : '')
    return null
  }
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
  const pos = gl.getAttribLocation(program, 'aPos')
  gl.enableVertexAttribArray(pos)
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
  const texture = (filter: number) => {
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }
  const names = ['uRes', 'uWorld', 'uView', 'uTexSize', 'uBackground', 'uMap', 'uHasMap', 'uFog', 'uHasFog', 'uFogSize', 'uGridType', 'uShowGrid', 'uSize', 'uOrigin',
    'uGridColor', 'uGridOpacity', 'uGridMode', 'uLine', 'uMode', 'uStyle', 'uFog1', 'uFog2', 'uFog3', 'uFxSize', 'uFxIntensity', 'uEdge', 'uKnown', 'uTime', 'uSeeThrough', 'uGridSeen',
    'uPaint', 'uHasPaint', 'uTint']
  return {
    gl, program, quad: buffer!, position: pos, map: texture(gl.LINEAR), fog: texture(gl.NEAREST),
    uniforms: Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)])),
  }
}

/** Canvas px per map px: the wanted quality, in steps (no reallocation on every zoom tick), within limits. */
export function canvasScale(quality: number, width: number, height: number): number {
  const stepped = 2 ** (Math.round(Math.log2(Math.max(0.05, quality)) * 2) / 2)
  return Math.max(0.05, Math.min(stepped, MAX_CANVAS / Math.max(width, height)))
}

/** Upload the picture: mipmapped (and anisotropic where the browser has it). Over a painting it keeps its alpha
 *  (premultiplied: transparent texels don't bleed dark into their neighbours). */
function upload(g: Gl, composite: HTMLCanvasElement, alpha = false) {
  const { gl } = g
  gl.bindTexture(gl.TEXTURE_2D, g.map)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, alpha)
  if (alpha) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, composite)
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, composite)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
  if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)))
}

export default function MapRenderer(props: Props) {
  const { width, height, quality, source, grid, showGrid, fog, display, fogLook = DEFAULT_FOG_LOOK, seeThrough = 0, gridOnlySeen = false,
    background = '#000000', lineZoom = 1, paint = null, painter, paintable = false, hour = 12, wind = DEFAULT_WIND, still = false } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<Gl | null | undefined>(undefined)
  const painted = hasPaint(paint) && grid.type !== 'none'
  const wantPainter = painted || paintable
  // The style: its types' art and sprites (fetched once per page)
  const pack = usePaintPack(painter?.style ?? 'storybook', wantPainter)
  const composite = useComposite(source, width, height, background, painted)
  // The part of the map in view (re-measured after every render: pans and zooms re-render the map)
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: width, h: height })
  useLayoutEffect(() => {
    const world = canvasRef.current?.parentElement
    if (!world) return
    const clip = (world.closest('.map-set-body') ?? world.closest('.map-view') ?? world).getBoundingClientRect()
    const visible = { left: Math.max(clip.left, 0), top: Math.max(clip.top, 0), right: Math.min(clip.right, window.innerWidth), bottom: Math.min(clip.bottom, window.innerHeight) }
    const next = viewRect(world.getBoundingClientRect(), visible, width, height)
    if (next && (Math.abs(next.x - rect.x) > 0.5 || Math.abs(next.y - rect.y) > 0.5 || Math.abs(next.w - rect.w) > 0.5 || Math.abs(next.h - rect.h) > 0.5)) setRect(next)
  })
  const scale = canvasScale(quality * (window.devicePixelRatio || 1), rect.w, rect.h)
  const pixels = useMemo(() => [Math.max(1, Math.round(rect.w * scale)), Math.max(1, Math.round(rect.h * scale))], [rect.w, rect.h, scale])
  const animateHere = useAnimateMaps() && !still // the user's choice on this device (plan 49)
  const paintAnimated = painted && animateHere
  const light = useMemo(() => daylight(hour), [hour])
  const animated = (display === 'soft' && fog !== null && fogLook.motion > 0 && !still) || paintAnimated
  const lookKey = JSON.stringify(fogLook)
  const paintKey = painted ? `${JSON.stringify(paint)}|${grid.cols}x${grid.rows}|${grid.type}|${grid.size}|${grid.x},${grid.y}|${pack?.version ?? ''}` : ''
  const painterKey = JSON.stringify(painter ?? null)

  // Upload the picture when it changes
  useEffect(() => {
    const g = glRef.current
    if (!g || !composite) return
    upload(g, composite, painted)
  }, [composite, painted])

  // The painter: made when a painting shows or the map may be painted here, its data uploaded when it changes
  const [paintVersion, setPaintVersion] = useState(0)
  const preparePainter = (g: Gl) => {
    if (!wantPainter) return
    if (g.painter === undefined) {
      g.painter = Painter.create(g.gl, painter?.style ?? 'storybook')
      g.painter.onChange = () => setPaintVersion((n) => n + 1) // its sprites got ready: draw again
    }
    if (painted && paint) g.painter.setData(paint, grid, pack)
  }
  useEffect(() => {
    const g = glRef.current
    if (!g || !wantPainter) return
    preparePainter(g)
    setPaintVersion((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintKey, wantPainter, glRef.current])
  // Gone: its GL objects freed, and forgotten (React's StrictMode unmounts and mounts again: a new one is made)
  useEffect(() => () => {
    const g = glRef.current
    if (g?.painter) { g.painter.dispose(); g.painter = undefined }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (canvas.width !== pixels[0]) canvas.width = pixels[0]
    if (canvas.height !== pixels[1]) canvas.height = pixels[1]
    if (glRef.current === undefined) {
      glRef.current = setupGl(canvas)
      const g = glRef.current
      if (g && composite) upload(g, composite, painted)
      if (g) preparePainter(g)
    }
    const g = glRef.current
    let frame = 0
    let poll = 0
    const start = performance.now()
    const pictureIn = source === null || composite !== null
    const draw = () => {
      if (!g) {
        drawFallback(canvas, composite, props, scale, rect)
        if (pictureIn) props.onReady?.(canvas)
        return
      }
      const { gl, uniforms: u } = g
      // The painting first, into its texture (the part in view, the canvas's size); while its shaders build, the
      // background colour, and a look again soon (an animated map looks every frame anyway)
      const paintTexture = painted && g.painter ? g.painter.render({
        width: canvas.width, height: canvas.height, view: rect, grid, background: hexToRgb(background),
        settings: painter ?? { style: 'storybook', kind: 'world', animated: false },
        time: paintAnimated ? (performance.now() - start) / 1000 + 1 : 0, light, wind,
      }) : null
      if (painted && !animated && g.painter?.state === 'building') poll = window.setTimeout(draw, 150)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(g.program)
      gl.bindBuffer(gl.ARRAY_BUFFER, g.quad)
      gl.enableVertexAttribArray(g.position)
      gl.vertexAttribPointer(g.position, 2, gl.FLOAT, false, 0, 0)
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, paintTexture)
      gl.uniform1i(u.uPaint, 2)
      gl.uniform1f(u.uHasPaint, paintTexture ? 1 : 0)
      gl.uniform3f(u.uTint, ...light.tint)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, g.map)
      gl.uniform1i(u.uMap, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, g.fog)
      gl.uniform1i(u.uFog, 1)
      gl.uniform2f(u.uRes, canvas.width, canvas.height)
      gl.uniform2f(u.uWorld, width, height)
      gl.uniform4f(u.uView, rect.x, rect.y, rect.w, rect.h)
      gl.uniform2f(u.uTexSize, composite?.width ?? 1, composite?.height ?? 1)
      gl.uniform3f(u.uBackground, ...hexToRgb(background))
      gl.uniform1f(u.uHasMap, composite ? 1 : 0)
      gl.uniform1f(u.uHasFog, fog ? 1 : 0)
      gl.uniform2f(u.uFogSize, grid.cols, grid.rows)
      gl.uniform1f(u.uGridType, grid.type === 'hex' ? 2 : grid.type === 'square' ? 1 : 0)
      gl.uniform1f(u.uShowGrid, showGrid ? 1 : 0)
      gl.uniform1f(u.uSize, grid.size)
      gl.uniform2f(u.uOrigin, grid.x, grid.y)
      gl.uniform3f(u.uGridColor, ...hexToRgb(grid.color))
      gl.uniform1f(u.uGridOpacity, grid.opacity)
      gl.uniform1f(u.uGridMode, grid.mode === 'inverse' ? 2 : grid.mode === 'contrast' ? 1 : 0)
      // The line's width: as set in the unzoomed view, growing (and shrinking) with the zoom, as if the grid were drawn
      gl.uniform1f(u.uLine, grid.line > 0 ? Math.max(0.05, grid.line * lineZoom * (scale / Math.max(0.01, quality))) : 0)
      gl.uniform1f(u.uMode, display === 'flat' ? 0 : 1)
      gl.uniform1f(u.uStyle, Math.max(0, FOG_STYLES.indexOf(fogLook.style)))
      gl.uniform3f(u.uFog1, ...hexToRgb(fogLook.colors[0]))
      gl.uniform3f(u.uFog2, ...hexToRgb(fogLook.colors[1]))
      gl.uniform3f(u.uFog3, ...hexToRgb(fogLook.colors[2]))
      gl.uniform1f(u.uFxSize, fogLook.size)
      gl.uniform1f(u.uFxIntensity, fogLook.intensity)
      gl.uniform1f(u.uEdge, fogLook.edge)
      gl.uniform1f(u.uKnown, fogLook.known)
      gl.uniform1f(u.uTime, ((Date.now() / 1000) % 10000) * (display === 'soft' && !still ? fogLook.motion : 0))
      gl.uniform1f(u.uSeeThrough, seeThrough)
      gl.uniform1f(u.uGridSeen, gridOnlySeen ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      if (props.onReady && pictureIn && (!painted || (pack && g.painter?.complete))) props.onReady(canvas)
      if (animated) frame = requestAnimationFrame(draw)
    }
    if (g && fog) {
      const { gl } = g
      const bytes = fogBytes(fog, grid)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, g.fog)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, grid.cols, grid.rows, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes)
    }
    draw()
    return () => { cancelAnimationFrame(frame); window.clearTimeout(poll) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixels, composite, grid, showGrid, fog, display, lookKey, seeThrough, gridOnlySeen, animated, width, height, rect, background, lineZoom,
    painted, paintVersion, painterKey, light, wind[0], wind[1]])

  return <canvas ref={canvasRef} className="map-canvas" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} aria-label="Map" />
}

/** No WebGL: the picture, flat fog and the grid's outlines on a 2D canvas (its part of the map). */
function drawFallback(canvas: HTMLCanvasElement, composite: HTMLCanvasElement | null, props: Props, scale: number, rect: Rect) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { grid, fog, showGrid } = props
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = props.background ?? '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(scale, 0, 0, scale, -rect.x * scale, -rect.y * scale)
  if (composite) ctx.drawImage(composite, 0, 0, props.width, props.height)
  if (grid.type === 'none') return
  const many = grid.cols * grid.rows > 6000
  for (let r = 0; r < grid.rows; r += 1) {
    for (let c = 0; c < grid.cols; c += 1) {
      if (!inGrid(grid, [c, r])) continue
      const state = fog ? fog[r * grid.cols + c] : 2
      const poly = tilePolygon(grid, c, r)
      if (state < 2 || (showGrid && !many)) {
        ctx.beginPath()
        poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.closePath()
      }
      if (state === 0) { ctx.fillStyle = props.seeThrough ? 'rgba(0,0,0,0.6)' : '#000'; ctx.fill() }
      else if (state === 1) { ctx.fillStyle = 'rgba(70,70,70,0.55)'; ctx.fill() }
      if (showGrid && !many && grid.line > 0 && !(props.gridOnlySeen && state === 0)) {
        ctx.strokeStyle = grid.color
        ctx.globalAlpha = grid.opacity
        ctx.lineWidth = (grid.line * (props.lineZoom ?? 1)) / props.quality
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
  }
}
