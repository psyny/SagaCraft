/**
 * The map's pictures (the DM): upload them, drag them on the map with snapping (to the grid, or to the other
 * pictures' edges, so tiles of a big map meet exactly), scale them, change their order, remove them.
 */
import { useRef, useState } from 'react'
import { apiUrl } from '../../api/client'
import type { LocationMap, MapGrid, MapImage } from '../../api/types'
import ImageUploader from '../../components/imageEditor/ImageUploader'
import Modal from '../../components/Modal'
import Segmented from '../../components/Segmented'
import { useSaga } from '../../saga/SagaContext'
import type { MapViewProps } from '../MapView'
import type { MapCommand } from '../useLocationMap'

export type Snap = 'none' | 'grid' | 'edges'

interface Box { x: number; y: number; w: number; h: number }
const boxOf = (i: MapImage): Box => ({ x: i.x, y: i.y, w: i.w * i.scale, h: i.h * i.scale })

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

const asCommand = (images: MapImage[]) => images.map(({ id, file_id, x, y, scale }) => ({ id, file_id, x, y, scale }))

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
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null)
  const images = map?.images || []
  const image = images.find((i) => i.id === selected) ?? null

  const save = (next: MapImage[]) => void run('images.set', { images: asCommand(next) })
  const local = (next: MapImage[]) => map && setMap({ ...map, images: next })

  const onPoint: MapViewProps['onPoint'] = (phase, [px, py]) => {
    if (!map) return
    if (phase === 'down') {
      const hit = [...images].reverse().find((i) => px >= i.x && py >= i.y && px <= i.x + i.w * i.scale && py <= i.y + i.h * i.scale)
      setSelected(hit?.id ?? null)
      drag.current = hit ? { id: hit.id, dx: px - hit.x, dy: py - hit.y, moved: false } : null
      return
    }
    const d = drag.current
    if (!d) return
    if (phase === 'move') {
      const target = images.find((i) => i.id === d.id)
      if (!target) return
      const box = { ...boxOf(target), x: px - d.dx, y: py - d.dy }
      const others = images.filter((i) => i.id !== d.id).map(boxOf)
      const at = snapPosition(box, others, map.grid, snap, Math.max(6, map.grid.size * 0.25))
      d.moved = true
      local(images.map((i) => (i.id === d.id ? { ...i, ...at } : i)))
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
      <p className="muted small">Drag a picture on the map to move it.</p>
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
      children: image ? <rect className="picture-outline" x={image.x} y={image.y} width={image.w * image.scale} height={image.h * image.scale} /> : null,
    },
  } : {}
  return { panel, mapProps }
}
