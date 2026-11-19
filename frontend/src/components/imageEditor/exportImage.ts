/** Browser-only: orient, crop, adjust, resize and compress a picture to fit the upload limits. */
import { applyAdjustments, outputSize, type Adjustments, type Crop } from './imageMath'

export type Rotation = 0 | 90 | 180 | 270

/** Draw the source rotated/flipped onto a canvas, scaled so its longest side is at most maxSide. */
export function orientedCanvas(source: CanvasImageSource & { width: number; height: number }, rotation: Rotation, flip: boolean, maxSide = Infinity): HTMLCanvasElement {
  const sideways = rotation === 90 || rotation === 270
  const W = sideways ? source.height : source.width
  const H = sideways ? source.width : source.height
  const scale = Math.min(1, maxSide / Math.max(W, H))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(W * scale))
  canvas.height = Math.max(1, Math.round(H * scale))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  if (flip) ctx.scale(-1, 1)
  const dw = source.width * scale
  const dh = source.height * scale
  ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh)
  return canvas
}

/** Downscale in halving steps: much smoother than one big drawImage jump. */
function resample(src: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, width: number, height: number): HTMLCanvasElement {
  let current: HTMLCanvasElement = src
  let cx = sx
  let cy = sy
  let cw = sw
  let ch = sh
  while (cw / 2 >= width && ch / 2 >= height) {
    const half = document.createElement('canvas')
    half.width = Math.round(cw / 2)
    half.height = Math.round(ch / 2)
    const hctx = half.getContext('2d')!
    hctx.imageSmoothingQuality = 'high'
    hctx.drawImage(current, cx, cy, cw, ch, 0, 0, half.width, half.height)
    current = half
    cx = 0
    cy = 0
    cw = half.width
    ch = half.height
  }
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(current, cx, cy, cw, ch, 0, 0, width, height)
  return out
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

function scaled(canvas: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(canvas.width * factor))
  out.height = Math.max(1, Math.round(canvas.height * factor))
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, out.width, out.height)
  return out
}

function onBackground(canvas: HTMLCanvasElement): HTMLCanvasElement {
  // JPEG has no transparency: paint the app's dark background behind it
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#120f16'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, 0, 0)
  return out
}

/** Encode under maxBytes: WebP (JPEG where WebP encoding isn't supported), lowering quality, then size. */
async function encode(canvas: HTMLCanvasElement, maxBytes: number): Promise<{ blob: Blob; canvas: HTMLCanvasElement }> {
  const probe = await toBlob(canvas, 'image/webp', 0.9)
  const type = probe?.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  let current = type === 'image/jpeg' ? onBackground(canvas) : canvas
  for (let attempt = 0; attempt < 8; attempt += 1) {
    for (const quality of [0.92, 0.85, 0.78, 0.7, 0.6]) {
      const blob = await toBlob(current, type, quality)
      if (blob && blob.size <= maxBytes) return { blob, canvas: current }
    }
    current = scaled(current, 0.8)
  }
  throw new Error('The picture can’t be made small enough for this upload limit.')
}

export interface ExportResult {
  blob: Blob
  width: number
  height: number
  type: string
}

export async function exportPicture(options: {
  source: HTMLImageElement
  rotation: Rotation
  flip: boolean
  crop: Crop
  adjustments: Adjustments
  maxPx: number
  maxBytes: number
}): Promise<ExportResult> {
  const { source, rotation, flip, crop, adjustments, maxPx, maxBytes } = options
  const full = orientedCanvas(source, rotation, flip)
  const { width, height } = outputSize(crop, full.width, full.height, maxPx)
  const out = resample(full, crop.x * full.width, crop.y * full.height, crop.w * full.width, crop.h * full.height, width, height)
  const ctx = out.getContext('2d')!
  const pixels = ctx.getImageData(0, 0, out.width, out.height)
  applyAdjustments(pixels.data, adjustments)
  ctx.putImageData(pixels, 0, 0)
  const { blob, canvas } = await encode(out, maxBytes)
  return { blob, width: canvas.width, height: canvas.height, type: blob.type }
}
