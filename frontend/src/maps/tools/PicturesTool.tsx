/**
 * The map's pictures (the DM): upload them, drag them on the map with snapping (to the grid, or to the other
 * pictures' edges, so tiles of a big map meet exactly); the picked one has handles (plan 46): its corners resize it
 * (the opposite corner stays), the round one above it turns it (Shift: by 15°); flip it across or down, turn it by
 * 90°; change the order, remove. Maps are grid first: the pictures are fitted to the grid, not the other way round.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { apiUrl } from '../../api/client'
import type { LocationMap, MapGrid, MapImage } from '../../api/types'
import { imageBox } from '../geometry'
import ImageUploader from '../../components/imageEditor/ImageUploader'
import Modal from '../../components/Modal'
import Segmented from '../../components/Segmented'
import { useSaga } from '../../saga/SagaContext'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'

export type Snap = 'none' | 'grid' | 'edges'

interface Box { x: number; y: number; w: number; h: number }
/** The box it covers on the map, turned as it's drawn (what snapping lines up). */
const boxOf = (i: MapImage): Box => {
  const [l, t, r, b] = imageBox(i)
  return { x: l, y: t, w: r - l, h: b - t }
}
type Pt = [number, number]
const centre = (i: MapImage): Pt => [i.x + (i.w * i.scale) / 2, i.y + (i.h * i.scale) / 2]
const rad = (deg: number) => (deg * Math.PI) / 180
/** A point of the picture's own frame (from its middle, before it's turned) on the map. */
const toWorld = (i: MapImage, [lx, ly]: Pt): Pt => {
  const [cx, cy] = centre(i)
  const a = rad(i.rotation ?? 0)
  return [cx + lx * Math.cos(a) - ly * Math.sin(a), cy + lx * Math.sin(a) + ly * Math.cos(a)]
}
/** A map point in the picture's own frame. */
const toLocal = (i: MapImage, [px, py]: Pt): Pt => {
  const [cx, cy] = centre(i)
  const a = -rad(i.rotation ?? 0)
  const dx = px - cx, dy = py - cy
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]
}
const inside = (i: MapImage, p: Pt) => {
  const [lx, ly] = toLocal(i, p)
  return Math.abs(lx) <= (i.w * i.scale) / 2 && Math.abs(ly) <= (i.h * i.scale) / 2
}
/** The four corners, in its own frame: top left, top right, bottom right, bottom left. */
const corners = (i: MapImage): Pt[] => {
  const hw = (i.w * i.scale) / 2, hh = (i.h * i.scale) / 2
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
}
/** An angle kept between -180 and 180. */
export const normalAngle = (deg: number) => Math.round((((deg + 180) % 360 + 360) % 360 - 180) * 100) / 100

/** Pure: the picture resized by dragging one corner to `p`, the opposite corner staying where it is. */
export function resizeFromCorner(i: MapImage, corner: number, p: Pt, start: MapImage = i): MapImage {
  const c = corners(start)
  const from = toWorld(start, c[corner])
  const fixed = toWorld(start, c[(corner + 2) % 4])
  const L0 = Math.hypot(from[0] - fixed[0], from[1] - fixed[1])
  const d: Pt = [(from[0] - fixed[0]) / L0, (from[1] - fixed[1]) / L0]
  const L = Math.max(L0 * (0.05 / start.scale), (p[0] - fixed[0]) * d[0] + (p[1] - fixed[1]) * d[1])
  const scale = Math.min(8, Math.max(0.05, (start.scale * L) / L0))
  const span = (L0 * scale) / start.scale
  const cx = fixed[0] + (d[0] * span) / 2, cy = fixed[1] + (d[1] * span) / 2
  return { ...i, scale: Math.round(scale * 10000) / 10000, x: Math.round(cx - (i.w * scale) / 2), y: Math.round(cy - (i.h * scale) / 2) }
}

/** Where a dragged picture lands: snapped to the grid lines, or to the other pictures' edges when close. */
export function snapPosition(box: Box, others: Box[], grid: MapGrid, snap: Snap, threshold: number): { x: number; y: number } {
  let { x, y } = box
  if (snap === 'grid' && grid.type !== 'none') {
    x = grid.x + Math.round((x - grid.x) / grid.size) * grid.size
    y = grid.y + Math.round((y - grid.y) / grid.size) * grid.size
  } else if (snap === 'edges') {
    // Each axis: the edge (start or end) closest to another picture's edge, within the threshold, wins
    const snapAxis = (start: number, length: number, targets: number[]) => {
      let best = start
      let distance = threshold + 0.001
      for (const t of targets) {
        for (const [edge, offset] of [[start, 0], [start + length, length]] as const) {
          if (Math.abs(t - edge) < distance) {
            distance = Math.abs(t - edge)
            best = t - offset
          }
        }
      }
      return best
    }
    x = snapAxis(x, box.w, others.flatMap((o) => [o.x, o.x + o.w]))
    y = snapAxis(y, box.h, others.flatMap((o) => [o.y, o.y + o.h]))
  }
  return { x: Math.round(x), y: Math.round(y) }
}

const asCommand = (images: MapImage[]) => images.map(({ id, file_id, x, y, scale, rotation, flip_x, flip_y }) =>
  ({ id, file_id, x, y, scale, rotation: rotation ?? 0, flip_x: Boolean(flip_x), flip_y: Boolean(flip_y) }))

export function usePicturesTool({ map, run, setMap, active }: {
  map: LocationMap | null
  run: MapCommand
  setMap: (map: LocationMap) => void
  active: boolean
}) {
  const { sagaId } = useSaga()
  const [selected, setSelected] = useState<string | null>(null)
  const [snap, setSnap] = useState<Snap>('edges')
  const [uploading, setUploading] = useState(false)
  const drag = useRef<{ id: string; kind: 'move' | 'resize' | 'rotate'; corner: number; dx: number; dy: number; start: MapImage; moved: boolean } | null>(null)
  // Screen px per map px (from the pointer's events): handles keep one size on screen at any zoom
  const [k, setK] = useState(1)
  const images = map?.images || []
  const image = images.find((i) => i.id === selected) ?? null
  const handle = 7 / k // a handle's half size, map px
  const stem = 26 / k // the turning handle's distance above the top edge

  const save = (next: MapImage[]) => void run('images.set', { images: asCommand(next) })
  const local = (next: MapImage[]) => map && setMap({ ...map, images: next })
  const change = (id: string, changes: Partial<MapImage>) => save(images.map((i) => (i.id === id ? { ...i, ...changes } : i)))

  /** Which of the picked picture's handles is under the point. */
  const handleAt = (p: Pt): { kind: 'resize' | 'rotate'; corner: number } | null => {
    if (!image) return null
    const near = (q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= handle * 1.8
    const top = -(image.h * image.scale) / 2
    if (near(toWorld(image, [0, top - stem]))) return { kind: 'rotate', corner: -1 }
    const corner = corners(image).findIndex((c) => near(toWorld(image, c)))
    return corner >= 0 ? { kind: 'resize', corner } : null
  }

  const onPoint: MapViewProps['onPoint'] = (phase, p, event) => {
    if (!map) return
    // The zoom, from the map's box on screen (the event is the map view's)
    const box = ((event as unknown as ReactPointerEvent).currentTarget as Element | null)?.querySelector?.('.map-world')?.getBoundingClientRect()
    if (box?.width) {
      const next = box.width / map.size[0]
      if (Math.abs(next - k) / k > 0.04) setK(next)
    }
    if (phase === 'down') {
      const h = handleAt(p)
      const hit = h ? image : [...images].reverse().find((i) => inside(i, p)) ?? null
      setSelected(hit?.id ?? null)
      drag.current = hit ? { id: hit.id, kind: h?.kind ?? 'move', corner: h?.corner ?? -1, dx: p[0] - hit.x, dy: p[1] - hit.y, start: hit, moved: false } : null
      return
    }
    const d = drag.current
    if (!d) return
    if (phase === 'move') {
      const target = images.find((i) => i.id === d.id)
      if (!target) return
      let next: MapImage
      if (d.kind === 'rotate') {
        const [cx, cy] = centre(target)
        const angle = (Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI + 90
        next = { ...target, rotation: normalAngle(event.shiftKey ? Math.round(angle / 15) * 15 : Math.round(angle * 10) / 10) }
      } else if (d.kind === 'resize') {
        next = resizeFromCorner(target, d.corner, p, d.start)
      } else {
        // Moved: its turned box snaps (to the grid, or the other pictures' edges)
        const moved = { ...target, x: p[0] - d.dx, y: p[1] - d.dy }
        const box = boxOf(moved)
        const others = images.filter((i) => i.id !== d.id).map(boxOf)
        const at = snapPosition(box, others, map.grid, snap, Math.max(6, map.grid.size * 0.25))
        next = { ...moved, x: Math.round(moved.x + at.x - box.x), y: Math.round(moved.y + at.y - box.y) }
      }
      d.moved = true
      local(images.map((i) => (i.id === d.id ? next : i)))
    } else {
      drag.current = null
      if (d.moved) save(images)
    }
  }

  const move = (by: number) => {
    if (!image) return
    const index = images.indexOf(image)
    const next = [...images]
    next.splice(index, 1)
    next.splice(Math.max(0, Math.min(next.length, index + by)), 0, image)
    save(next)
  }

  const panel = map && (
    <div className="tool-panel">
      <div className="tool-head">
        <strong>Pictures</strong>
        <button className="primary small" onClick={() => setUploading(true)}>＋ Picture</button>
      </div>
      <div className="field">
        <span className="field-label">Snap while dragging</span>
        <Segmented<Snap> value={snap} options={[['edges', 'To pictures'], ['grid', 'To the grid'], ['none', 'Off']]} onChange={setSnap} />
      </div>
      {images.length === 0 && <p className="muted small">Upload the map's pictures: one, or many to put side by side (tiles of a big map).</p>}
      <div className="picture-list">
        {images.map((i, n) => (
          <button key={i.id} className={`picture-row ${i.id === selected ? 'on' : ''}`} onClick={() => setSelected(i.id)}>
            {i.url && <img src={apiUrl(i.url)} alt="" />}
            <span>Picture {n + 1}</span>
            <span className="muted small">{Math.round(i.w * i.scale)}×{Math.round(i.h * i.scale)}</span>
          </button>
        ))}
      </div>
      {image && (
        <div className="picture-editor">
          <label className="slider">
            <span className="slider-head">Scale <span className="muted">{Math.round(image.scale * 100)}%</span></span>
            <input type="range" min={0.1} max={4} step={0.01} value={image.scale}
              onChange={(e) => local(images.map((i) => (i.id === image.id ? { ...i, scale: Number(e.target.value) } : i)))}
              onPointerUp={() => save(images)} onKeyUp={() => save(images)} />
          </label>
          <div className="field">
            <span className="field-label">Turn and flip <span className="muted">{image.rotation ?? 0}°</span></span>
            <div className="button-row">
              <button className="small" title="Turn 90° to the left" onClick={() => change(image.id, { rotation: normalAngle((image.rotation ?? 0) - 90) })}>⟲ 90°</button>
              <button className="small" title="Turn 90° to the right" onClick={() => change(image.id, { rotation: normalAngle((image.rotation ?? 0) + 90) })}>⟳ 90°</button>
              <input type="number" className="angle-input" min={-180} max={180} step={1} aria-label="Angle" key={`${image.id}-${image.rotation ?? 0}`}
                defaultValue={image.rotation ?? 0} onBlur={(e) => Number(e.target.value) !== (image.rotation ?? 0) && change(image.id, { rotation: normalAngle(Number(e.target.value)) })}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
              <button className={`small ${image.flip_x ? 'primary' : ''}`} aria-pressed={Boolean(image.flip_x)} title="Mirror it left to right"
                onClick={() => change(image.id, { flip_x: !image.flip_x })}>⇋ Flip X</button>
              <button className={`small ${image.flip_y ? 'primary' : ''}`} aria-pressed={Boolean(image.flip_y)} title="Mirror it top to bottom"
                onClick={() => change(image.id, { flip_y: !image.flip_y })}>⥮ Flip Y</button>
            </div>
          </div>
          <div className="grid-2">
            <label className="inline">X<input type="number" value={image.x} onChange={(e) => save(images.map((i) => (i.id === image.id ? { ...i, x: Number(e.target.value) } : i)))} /></label>
            <label className="inline">Y<input type="number" value={image.y} onChange={(e) => save(images.map((i) => (i.id === image.id ? { ...i, y: Number(e.target.value) } : i)))} /></label>
          </div>
          <div className="button-row">
            <button className="small" onClick={() => move(-1)} disabled={images.indexOf(image) === 0}>Send back</button>
            <button className="small" onClick={() => move(1)} disabled={images.indexOf(image) === images.length - 1}>Bring forward</button>
            <button className="small ghost danger" onClick={() => { setSelected(null); save(images.filter((i) => i.id !== image.id)) }}>Remove</button>
          </div>
        </div>
      )}
      <p className="muted small">Drag a picture on the map to move it; drag the picked one's corners to resize it and its round
        handle to turn it (Shift: by 15°).</p>
      <Modal open={uploading} wide title="Add a map picture" onClose={() => setUploading(false)}>
        {uploading && (
          <ImageUploader sagaId={sagaId} category="map" onCancel={() => setUploading(false)} onUploaded={(file) => {
            setUploading(false)
            // New pictures go to the right of the others (so a big map is laid out tile by tile)
            const right = Math.max(0, ...images.map((i) => i.x + i.w * i.scale))
            void run('images.set', { images: [...asCommand(images), { file_id: file.id, x: images.length ? Math.round(right) : 0, y: 0, scale: 1 }] })
          }} />
        )}
      </Modal>
    </div>
  )

  const mapProps: Partial<MapViewProps> = active && map ? {
    onPoint,
    overlay: {
      children: image ? (() => {
        const [cx, cy] = centre(image)
        const hw = (image.w * image.scale) / 2, hh = (image.h * image.scale) / 2
        return (
          <g className="picture-handles" transform={`translate(${cx} ${cy}) rotate(${image.rotation ?? 0})`}>
            <rect className="picture-outline" x={-hw} y={-hh} width={hw * 2} height={hh * 2} />
            <line className="picture-stem" x1={0} y1={-hh} x2={0} y2={-hh - stem} />
            <circle className="picture-rotate" cx={0} cy={-hh - stem} r={handle * 1.1} />
            {corners(image).map(([x, y], n) => (
              <rect key={n} className={`picture-handle corner-${n}`} x={x - handle} y={y - handle} width={handle * 2} height={handle * 2} />
            ))}
          </g>
        )
      })() : null,
    },
  } : {}
  return { panel, mapProps }
}
