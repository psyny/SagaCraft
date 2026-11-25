/**
 * The sprites' atlas (plan 48): each sprite a painting uses, in each set of colours it's painted in, rasterized once
 * from its SVG (the colours put in for `var(--a)`, `var(--b)`, `var(--c)`, `var(--ink)`, `var(--light)`) into two
 * canvases with the same layout: the day picture (without its `night` group) and the night lights (only that group).
 * Rasters are kept per page (a new atlas only packs them again); the canvases are power-of-two sized (mipmapped).
 */
import type { PaintPack } from '../../api/types'
import { spriteShape } from './sprites'

export interface SpriteRequest { name: string; colors: [string, string, string]; px: number }
export interface Slot { u0: number; v0: number; u1: number; v1: number; night: boolean }

interface Raster { day: CanvasImageSource; night: CanvasImageSource | null; w: number; h: number }

const rasters = new Map<string, Promise<Raster | null>>()
const PAD = 6 // around each sprite in the atlas (mipmaps don't bleed into the neighbours)

export const slotKey = (r: SpriteRequest) => `${r.name}|${r.colors.join(',')}|${r.px}`

/** The SVG with its colours put in, sized to draw (one version: the day, or only the night group). */
export function coloured(svg: string, colors: [string, string, string], ink: string, light: string, w: number, h: number, part: 'day' | 'night'): string {
  // the night's lights glow a little (a town reads as lit from far away)
  const hide = part === 'day' ? '.night{display:none}'
    : 'svg>:not(.night):not(defs):not(style){display:none} .night{filter:url(#mp-night-glow)}'
  const glow = part === 'night'
    ? '<defs><filter id="mp-night-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/>'
      + '<feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' : ''
  return svg
    .replace(/var\(--a\)/g, colors[0]).replace(/var\(--b\)/g, colors[1]).replace(/var\(--c\)/g, colors[2])
    .replace(/var\(--ink\)/g, ink).replace(/var\(--light\)/g, light)
    .replace(/<svg\b/, `<svg width="${w}" height="${h}" preserveAspectRatio="none"`)
    .replace(/(<svg[^>]*>)/, `$1<style>${hide}</style>${glow}`)
}

function load(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('A sprite did not draw'))
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

function rasterize(pack: PaintPack, request: SpriteRequest): Promise<Raster | null> {
  const key = `${pack.version}|${slotKey(request)}`
  let raster = rasters.get(key)
  if (!raster) {
    const svg = pack.sprites[request.name]
    const shape = spriteShape(svg)
    raster = !svg || !shape ? Promise.resolve(null) : (async () => {
      const h = request.px, w = Math.max(1, Math.round((request.px * shape.w) / shape.h))
      const { ink, light } = pack.style
      const [day, night] = await Promise.all([load(coloured(svg, request.colors, ink, light, w, h, 'day')),
        shape.night ? load(coloured(svg, request.colors, ink, light, w, h, 'night')) : Promise.resolve(null)])
      return { day, night, w, h }
    })().catch(() => null)
    rasters.set(key, raster)
  }
  return raster
}

export interface Atlas {
  day: HTMLCanvasElement
  night: HTMLCanvasElement | null
  slots: Map<string, Slot>
}

const pot = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(1, n)))

/** An atlas of these sprites (shelves, tallest first), at most `max` px a side (sprites shrink to fit). */
export async function buildAtlas(pack: PaintPack, requests: SpriteRequest[], max: number): Promise<Atlas> {
  const unique = [...new Map(requests.map((r) => [slotKey(r), r])).values()]
  const loaded = (await Promise.all(unique.map(async (r) => [slotKey(r), await rasterize(pack, r)] as const)))
    .filter((x): x is [string, Raster] => Boolean(x[1]))
  loaded.sort((a, b) => b[1].h - a[1].h)
  for (let scale = 1; scale > 0.1; scale *= 0.75) {
    const area = loaded.reduce((sum, [, r]) => sum + (r.w * scale + PAD * 2) * (r.h * scale + PAD * 2), 0)
    const side = Math.min(max, pot(Math.sqrt(area * 1.25)))
    const places: [string, Raster, number, number, number, number][] = []
    let x = 0, y = 0, shelf = 0, fits = true
    for (const [key, r] of loaded) {
      const w = Math.max(1, Math.round(r.w * scale)), h = Math.max(1, Math.round(r.h * scale))
      if (x + w + PAD * 2 > side) { x = 0; y += shelf; shelf = 0 }
      if (y + h + PAD * 2 > side || w + PAD * 2 > side) { fits = false; break }
      places.push([key, r, x + PAD, y + PAD, w, h])
      x += w + PAD * 2
      shelf = Math.max(shelf, h + PAD * 2)
    }
    if (!fits) continue
    const height = pot(y + shelf)
    const day = document.createElement('canvas')
    day.width = side; day.height = Math.max(1, Math.min(side, height))
    const anyNight = places.some(([, r]) => r.night)
    const night = anyNight ? document.createElement('canvas') : null
    if (night) { night.width = day.width; night.height = day.height }
    const dctx = day.getContext('2d')!
    const nctx = night?.getContext('2d') ?? null
    const slots = new Map<string, Slot>()
    for (const [key, r, px, py, w, h] of places) {
      dctx.drawImage(r.day, px, py, w, h)
      if (r.night && nctx) nctx.drawImage(r.night, px, py, w, h)
      slots.set(key, { u0: px / day.width, v0: py / day.height, u1: (px + w) / day.width, v1: (py + h) / day.height, night: Boolean(r.night) })
    }
    return { day, night, slots }
  }
  throw new Error('The sprites do not fit in an atlas')
}
