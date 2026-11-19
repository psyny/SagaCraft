import { useEffect, useRef, type PointerEvent } from 'react'
import { moveCrop, resizeCrop, type Crop, type Handle } from './imageMath'

interface Props {
  preview: HTMLCanvasElement
  filter: string
  crop: Crop
  ratio: number | null
  /** Oriented full-size pixels (for the ratio math). */
  width: number
  height: number
  onChange: (crop: Crop) => void
}

const CORNERS: Handle[] = ['nw', 'ne', 'sw', 'se']
const EDGES: Handle[] = ['n', 's', 'e', 'w']

/** The picture with a draggable crop box: drag inside to move it, drag the handles to resize it. */
export default function CropArea({ preview, filter, crop, ratio, width, height, onChange }: Props) {
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ mode: 'move' | Handle; x: number; y: number; start: Crop } | null>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    el.width = preview.width
    el.height = preview.height
    el.getContext('2d')!.drawImage(preview, 0, 0)
  }, [preview])

  const begin = (e: PointerEvent, mode: 'move' | Handle) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { mode, x: e.clientX, y: e.clientY, start: crop }
  }
  const move = (e: PointerEvent) => {
    const d = drag.current
    const rect = stage.current?.getBoundingClientRect()
    if (!d || !rect) return
    const dx = (e.clientX - d.x) / rect.width
    const dy = (e.clientY - d.y) / rect.height
    onChange(d.mode === 'move' ? moveCrop(d.start, dx, dy) : resizeCrop(d.start, d.mode, dx, dy, ratio, width, height))
  }
  const end = () => {
    drag.current = null
  }
  const handlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: end }

  return (
    <div className="crop-stage" ref={stage}>
      <canvas ref={canvas} className="crop-canvas" style={{ filter }} />
      <div
        className="crop-box"
        style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
        onPointerDown={(e) => begin(e, 'move')}
        {...handlers}
      >
        <div className="crop-grid" />
        {(ratio ? CORNERS : [...CORNERS, ...EDGES]).map((h) => (
          <div key={h} className={`crop-handle h-${h}`} onPointerDown={(e) => begin(e, h)} {...handlers} />
        ))}
      </div>
    </div>
  )
}
