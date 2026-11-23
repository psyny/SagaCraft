/**
 * Where a Desktop's pieces go. Pure and deterministic (every screen arranges the same).
 * - Natural size: each piece's own shape at scale 1 (a card, a sheet, an item card, a page, a picture's ratio).
 * - Auto: in rows, in order, all at one scale: the largest that fits the desk, no piece taller than MAX_SHARE of it
 *   (a first piece doesn't fill the whole desk).
 * - Free: each piece's saved place (fractions of the desk), else where Auto would put it.
 */
import { cardSize } from '../actorsScene/layout'
import type { Piece } from './types'

export interface Box { x: number; y: number; w: number; h: number; rot: number; z: number }
export interface Size { w: number; h: number }

export const SHEET = { w: 380, h: 540 }
export const ITEM = { w: 250, h: 360 }
export const DOCUMENT = { w: 420, h: 560 }
export const PICTURE_W = 420
/** In Auto, no piece is taller than this share of the desk. */
export const MAX_SHARE = 0.4

export function naturalSize(piece: Piece): Size {
  switch (piece.kind) {
    case 'character':
      return piece.card ? cardSize(piece.card) : SHEET
    case 'item':
      return ITEM
    case 'document':
      return DOCUMENT
    case 'image':
      return { w: PICTURE_W, h: Math.round(PICTURE_W / Math.max(0.1, piece.ratio || 1)) }
  }
}

/** How much room a piece takes in Auto, for its natural size: cards are small at scale 1, so they get more. */
export function presence(piece: Piece): number {
  return piece.kind === 'character' && piece.card ? 1.6 : 1
}

/** The size a piece is laid out at (its natural shape, with its presence). */
export function layoutSize(piece: Piece): Size {
  const n = naturalSize(piece), k = presence(piece)
  return { w: n.w * k, h: n.h * k }
}

/** Rows at a scale (each a list of piece indexes); null when a piece is wider than the desk. */
function rows(sizes: Size[], s: number, width: number, gap: number): number[][] | null {
  const out: number[][] = []
  let row: number[] = []
  let used = 0
  for (let i = 0; i < sizes.length; i++) {
    const w = sizes[i].w * s
    if (w > width) return null
    if (row.length && used + gap + w > width) {
      out.push(row)
      row = []
      used = 0
    }
    used += (row.length ? gap : 0) + w
    row.push(i)
  }
  if (row.length) out.push(row)
  return out
}

function height(sizes: Size[], layout: number[][], s: number, gap: number): number {
  return layout.reduce((sum, row) => sum + Math.max(...row.map((i) => sizes[i].h * s)), 0) + gap * Math.max(0, layout.length - 1)
}

/** Auto: pieces in rows, centred, at the largest scale that fits the desk (padding `gap` all round). */
export function autoLayout(sizes: Size[], width: number, height_: number, gap: number): Box[] {
  if (!sizes.length || width <= 0 || height_ <= 0) return []
  const W = width - 2 * gap, H = height_ - 2 * gap
  const tallest = Math.max(...sizes.map((z) => z.h))
  let lo = 0.02, hi = Math.max(0.03, Math.min(4, (MAX_SHARE * height_) / tallest))
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2
    const layout = rows(sizes, mid, W, gap)
    if (layout && height(sizes, layout, mid, gap) <= H) lo = mid
    else hi = mid
  }
  const s = lo
  const layout = rows(sizes, s, W, gap) ?? sizes.map((_, i) => [i])
  const total = height(sizes, layout, s, gap)
  const boxes: Box[] = new Array(sizes.length)
  let y = gap + Math.max(0, (H - total) / 2)
  for (const row of layout) {
    const rowH = Math.max(...row.map((i) => sizes[i].h * s))
    const rowW = row.reduce((sum, i) => sum + sizes[i].w * s, 0) + gap * (row.length - 1)
    let x = gap + (W - rowW) / 2
    for (const i of row) {
      const w = sizes[i].w * s, h = sizes[i].h * s
      boxes[i] = { x, y: y + (rowH - h) / 2, w, h, rot: 0, z: 0 }
      x += w + gap
    }
    y += rowH + gap
  }
  return boxes
}

/** Free: a piece's saved place on a desk of this size (its natural shape kept), else its Auto box. */
export function freeBox(place: Piece['position'], size: Size, width: number, height_: number, fallback: Box): Box {
  if (place.x === undefined || place.y === undefined || place.w === undefined) return fallback
  const w = place.w * width
  return { x: place.x * width, y: place.y * height_, w, h: w * (size.h / size.w), rot: place.rot ?? 0, z: place.z ?? 0 }
}

/** A box as a saved place (fractions of the desk). */
export const toPlace = (box: Box, width: number, height_: number) => ({
  x: Math.round((box.x / width) * 10000) / 10000, y: Math.round((box.y / height_) * 10000) / 10000,
  w: Math.round((box.w / width) * 10000) / 10000, rot: Math.round(box.rot * 10) / 10,
})

/** The colours of an item's tier, low to high (grey, green, blue, purple, gold). */
export const TIER_COLORS = ['#9b92a4', '#5bb98c', '#6fa8e0', '#b07fd6', '#e0b25a']

/** Pure: a tier's colour by its place in its options (any number of options); null: no tier. */
export function tierColor(tier: { index: number; of: number } | null): string {
  if (!tier || tier.of <= 1) return TIER_COLORS[0]
  return TIER_COLORS[Math.round((tier.index / (tier.of - 1)) * (TIER_COLORS.length - 1))]
}
