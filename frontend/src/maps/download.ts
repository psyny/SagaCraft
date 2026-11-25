/**
 * Downloading a location's map (plan 52, the map editor's Details tab): as the players see it (the server's players'
 * view: their fog, their composed picture, the painting of their tiles, the regions, paths and labels shared with
 * them), still, without the weather; drawn offscreen by the map's own renderer at up to 4096 px a side, its regions,
 * paths and labels drawn over it (tokens, resource icons and pings left out). Saved as a PNG, or as a one-page PDF
 * (A4, the picture as a JPEG; written here: no library).
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { api } from '../api'
import type { LocationMap } from '../api/types'
import { fogFromString } from './geometry'
import MapOverlay from './MapOverlay'
import MapRenderer from './MapRenderer'
import { sourceOf } from './MapView'

const MAX_SIDE = 4096

/** The map drawn into a canvas (map px × up to 2, at most MAX_SIDE a side), when everything in it is drawn. */
export async function mapPicture(map: LocationMap, timeout = 120000): Promise<HTMLCanvasElement> {
  const [w, h] = map.size
  const want = Math.min(2, MAX_SIDE / Math.max(w, h))
  const dpr = window.devicePixelRatio || 1
  // Offscreen (the renderer draws the whole map when none of it is on screen)
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, { position: 'fixed', left: '-200000px', top: '0', width: `${w}px`, height: `${h}px`, overflow: 'hidden', pointerEvents: 'none' })
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    const picture = await new Promise<HTMLCanvasElement>((resolve, reject) => {
      let done = false
      const timer = window.setTimeout(() => reject(new Error('The map took too long to draw')), timeout)
      const fog = map.fog.enabled && map.fog.states ? fogFromString(map.fog.states) : null
      const onReady = (canvas: HTMLCanvasElement) => {
        if (done) return
        done = true
        window.clearTimeout(timer)
        // (copied now: the WebGL canvas's drawing isn't kept past this task)
        const out = document.createElement('canvas')
        out.width = canvas.width
        out.height = canvas.height
        out.getContext('2d')?.drawImage(canvas, 0, 0)
        resolve(out)
      }
      root.render(createElement('div', { className: 'map-world', style: { position: 'relative', width: w, height: h } },
        createElement(MapRenderer, {
          width: w, height: h, quality: want / dpr, source: sourceOf(map), grid: map.grid, showGrid: true, fog, display: 'soft',
          background: map.background, paint: map.paint, painter: map.painter, hour: map.ambience?.hour, lineZoom: want / dpr,
          still: true, onReady,
        })))
    })
    await drawOverlay(picture, map)
    return picture
  } finally {
    root.unmount()
    host.remove()
  }
}

/** Its regions, paths and labels over the picture (the overlay's SVG, drawn as a picture). */
async function drawOverlay(canvas: HTMLCanvasElement, map: LocationMap) {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const plain = { ...map, links: [], tokens: [], highlight: null }
  if (!plain.regions?.length && !plain.paths.length && !plain.labels?.length) return
  const svg = renderToStaticMarkup(createElement(MapOverlay, { map: plain }))
    .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    .replace('width="100%" height="100%"', `width="${canvas.width}" height="${canvas.height}"`)
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The map\'s labels could not be drawn'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
}

const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be made'))), type, quality)
})

/** A one-page PDF holding a JPEG picture, fitted on an A4 page turned its way (24 pt margins). */
export function pdfOf(jpeg: Uint8Array, width: number, height: number, title: string): Uint8Array {
  const landscape = width >= height
  const [pw, ph] = landscape ? [842, 595] : [595, 842]
  const k = Math.min((pw - 48) / width, (ph - 48) / height)
  const dw = width * k, dh = height * k, x = (pw - dw) / 2, y = (ph - dh) / 2
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part
    parts.push(bytes)
    length += bytes.length
  }
  const object = (n: number, ...body: (string | Uint8Array)[]) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
    body.forEach(push)
    push('\nendobj\n')
  }
  const text = (s: string) => s.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1')
  push('%PDF-1.4\n%âãÏÓ\n')
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  object(4, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    jpeg, '\nendstream')
  const content = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`
  object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  object(6, `<< /Title (${text(title)}) /Producer (SagaCraft) >>`)
  const xref = length
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`)
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const out = new Uint8Array(length)
  let at = 0
  for (const part of parts) { out.set(part, at); at += part.length }
  return out
}

/** A file to the user's downloads. */
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
}

/** The map (this layer) as the players see it, downloaded as PNG or PDF. */
export async function downloadMap(sagaId: number, locationId: number, layer: string | null, name: string, format: 'png' | 'pdf') {
  const map = await api.locationMapAsPlayers(sagaId, locationId, layer)
  const picture = await mapPicture(map)
  const file = (name.trim() || 'map').replace(/[\\/:*?"<>|]+/g, ' ').trim()
  if (format === 'png') {
    saveFile(await canvasBlob(picture, 'image/png'), `${file}.png`)
    return
  }
  const jpeg = new Uint8Array(await (await canvasBlob(picture, 'image/jpeg', 0.92)).arrayBuffer())
  saveFile(new Blob([pdfOf(jpeg, picture.width, picture.height, name).buffer as ArrayBuffer], { type: 'application/pdf' }), `${file}.pdf`)
}
