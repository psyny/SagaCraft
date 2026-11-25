/**
 * A map painting style (plan 48): its types and how each is drawn (art), its SVG sprites; the server's
 * `map_painter/styles/<style>/` as one JSON (GET /api/map-painter/{style}, no sign-in, cached). Loaded once per page.
 */
import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { PaintPack, PaintType } from '../../api/types'

const packs = new Map<string, PaintPack>()
const loading = new Map<string, Promise<PaintPack>>()

/** The style's pack (fetched once; a failed fetch is tried again next time). */
export function loadPack(style: string): Promise<PaintPack> {
  const ready = packs.get(style)
  if (ready) return Promise.resolve(ready)
  let promise = loading.get(style)
  if (!promise) {
    promise = api.paintPack(style).then((pack) => { packs.set(style, pack); return pack })
    promise.catch(() => loading.delete(style))
    loading.set(style, promise)
  }
  return promise
}

/** The style's pack, once loaded (null meanwhile, or when not `wanted`). */
export function usePaintPack(style: string | null | undefined, wanted = true): PaintPack | null {
  const [pack, setPack] = useState<PaintPack | null>(() => (style ? packs.get(style) ?? null : null))
  useEffect(() => {
    if (!style || !wanted) return
    let alive = true
    const ready = packs.get(style)
    if (ready) { setPack(ready); return }
    loadPack(style).then((p) => { if (alive) setPack(p) }).catch(() => undefined)
    return () => { alive = false }
  }, [style, wanted])
  return style && pack?.style.key === style ? pack : null
}

/** Tests and dev pages: a pack known without fetching. */
export function setPack(pack: PaintPack) {
  packs.set(pack.style.key, pack)
}

/** A type of the pack by key (null: not in this style). */
export function typeOf(pack: PaintPack | null, key: string): PaintType | null {
  if (!pack) return null
  let index = (pack as PaintPack & { _index?: Map<string, PaintType> })._index
  if (!index) {
    index = new Map(pack.types.map((t) => [t.key, t]))
    Object.defineProperty(pack, '_index', { value: index, enumerable: false })
  }
  return index.get(key) ?? null
}
