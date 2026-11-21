/**
 * Draws a location's map: its picture (the DM: the pictures composed here; players: the composed picture the
 * server made for their fog), the grid and the fog, with one WebGL shader (see shader.ts). Without WebGL it
 * falls back to a 2D canvas (flat fog, square-ish lines).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '../api/client'
import type { MapGrid, MapImage } from '../api/types'
import { fogBytes, inGrid, tilePolygon } from './geometry'
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
}

const MAX_CANVAS = 4096
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

/** The map's picture, at most MAX_TEXTURE px on its longest side, as a canvas (or null while loading). */
function useComposite(source: MapSource, width: number, height: number): HTMLCanvasElement | null {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const key = source === null ? '' : 'url' in source ? source.url : 'canvas' in source ? source.canvas
    : JSON.stringify(source.images.map((i) => [i.url, i.x, i.y, i.scale]))
  useEffect(() => {
    let cancelled = false
    if (source === null || 'canvas' in source) {
      setCanvas(source ? source.canvas : null)
      return
    }
    const parts = 'url' in source ? [{ url: source.url, x: 0, y: 0, w: width, h: height }] :
      source.images.filter((i) => i.url).map((i) => ({ url: i.url!, x: i.x, y: i.y, w: i.w * i.scale, h: i.h * i.scale }))
    Promise.allSettled(parts.map((p) => loadImage(p.url))).then((results) => {
      if (cancelled) return
      const factor = Math.min(1, MAX_TEXTURE / Math.max(width, height))
      const out = document.createElement('canvas')
      out.width = Math.max(1, Math.round(width * factor))
      out.height = Math.max(1, Math.round(height * factor))
      const ctx = out.getContext('2d')
      if (!ctx) return setCanvas(null)
      ctx.fillStyle = '#0e0c11'
      ctx.fillRect(0, 0, out.width, out.height)
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') ctx.drawImage(r.value, parts[i].x * factor, parts[i].y * factor, parts[i].w * factor, parts[i].h * factor)
      })
      setCanvas(out)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, height])
  return canvas
}

interface Gl {
  gl: WebGLRenderingContext
  program: WebGLProgram
  map: WebGLTexture
  fog: WebGLTexture
  uniforms: Record<string, WebGLUniformLocation | null>
}

function setupGl(canvas: HTMLCanvasElement): Gl | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: false }) as WebGLRenderingContext | null
  if (!gl) return null
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
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
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
  const names = ['uRes', 'uWorld', 'uMap', 'uHasMap', 'uFog', 'uHasFog', 'uFogSize', 'uGridType', 'uShowGrid', 'uSize', 'uOrigin',
    'uGridColor', 'uGridOpacity', 'uGridMode', 'uLine', 'uMode', 'uStyle', 'uFog1', 'uFog2', 'uFog3', 'uFxSize', 'uFxIntensity', 'uEdge', 'uKnown', 'uTime', 'uSeeThrough', 'uGridSeen']
  return {
    gl, program, map: texture(gl.LINEAR), fog: texture(gl.NEAREST),
    uniforms: Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)])),
  }
}

/** Canvas px per map px: the wanted quality, in steps (no reallocation on every zoom tick), within limits. */
export function canvasScale(quality: number, width: number, height: number): number {
  const stepped = 2 ** (Math.round(Math.log2(Math.max(0.05, quality)) * 2) / 2)
  return Math.max(0.05, Math.min(stepped, MAX_CANVAS / Math.max(width, height)))
}

export default function MapRenderer(props: Props) {
  const { width, height, quality, source, grid, showGrid, fog, display, fogLook = DEFAULT_FOG_LOOK, seeThrough = 0, gridOnlySeen = false } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<Gl | null | undefined>(undefined)
  const composite = useComposite(source, width, height)
  const scale = canvasScale(quality * (window.devicePixelRatio || 1), width, height)
  const pixels = useMemo(() => [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))], [width, height, scale])
  const animated = display === 'soft' && fog !== null && fogLook.motion > 0
  const lookKey = JSON.stringify(fogLook)

  // Upload the picture when it changes
  useEffect(() => {
    const g = glRef.current
    if (!g || !composite) return
    g.gl.bindTexture(g.gl.TEXTURE_2D, g.map)
    g.gl.texImage2D(g.gl.TEXTURE_2D, 0, g.gl.RGB, g.gl.RGB, g.gl.UNSIGNED_BYTE, composite)
  }, [composite])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = pixels[0]
    canvas.height = pixels[1]
    if (glRef.current === undefined) {
      glRef.current = setupGl(canvas)
      const g = glRef.current
      if (g && composite) {
        g.gl.bindTexture(g.gl.TEXTURE_2D, g.map)
        g.gl.texImage2D(g.gl.TEXTURE_2D, 0, g.gl.RGB, g.gl.RGB, g.gl.UNSIGNED_BYTE, composite)
      }
    }
    const g = glRef.current
    let frame = 0
    const draw = () => {
      if (!g) return drawFallback(canvas, composite, props, scale)
      const { gl, uniforms: u } = g
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(g.program)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, g.map)
      gl.uniform1i(u.uMap, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, g.fog)
      gl.uniform1i(u.uFog, 1)
      gl.uniform2f(u.uRes, canvas.width, canvas.height)
      gl.uniform2f(u.uWorld, width, height)
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
      gl.uniform1f(u.uLine, Math.max(1, grid.line * (window.devicePixelRatio || 1) * (scale / Math.max(0.01, quality * (window.devicePixelRatio || 1)))))
      gl.uniform1f(u.uMode, display === 'flat' ? 0 : 1)
      gl.uniform1f(u.uStyle, Math.max(0, FOG_STYLES.indexOf(fogLook.style)))
      gl.uniform3f(u.uFog1, ...hexToRgb(fogLook.colors[0]))
      gl.uniform3f(u.uFog2, ...hexToRgb(fogLook.colors[1]))
      gl.uniform3f(u.uFog3, ...hexToRgb(fogLook.colors[2]))
      gl.uniform1f(u.uFxSize, fogLook.size)
      gl.uniform1f(u.uFxIntensity, fogLook.intensity)
      gl.uniform1f(u.uEdge, fogLook.edge)
      gl.uniform1f(u.uKnown, fogLook.known)
      gl.uniform1f(u.uTime, ((Date.now() / 1000) % 10000) * (display === 'soft' ? fogLook.motion : 0))
      gl.uniform1f(u.uSeeThrough, seeThrough)
      gl.uniform1f(u.uGridSeen, gridOnlySeen ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
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
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixels, composite, grid, showGrid, fog, display, lookKey, seeThrough, gridOnlySeen, animated, width, height])

  return <canvas ref={canvasRef} className="map-canvas" style={{ width: '100%', height: '100%' }} aria-label="Map" />
}

/** No WebGL: the picture, flat fog and the grid's outlines on a 2D canvas. */
function drawFallback(canvas: HTMLCanvasElement, composite: HTMLCanvasElement | null, props: Props, scale: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { grid, fog, showGrid } = props
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#141118'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (composite) ctx.drawImage(composite, 0, 0, canvas.width, canvas.height)
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
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
      if (showGrid && !many && !(props.gridOnlySeen && state === 0)) {
        ctx.strokeStyle = grid.color
        ctx.globalAlpha = grid.opacity
        ctx.lineWidth = grid.line / scale
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
  }
}
