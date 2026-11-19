import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { api } from '../../api'
import { apiUrl } from '../../api/client'
import type { UploadCategory, UploadedFile } from '../../api/types'
import CropArea from './CropArea'
import { exportPicture, orientedCanvas, type Rotation } from './exportImage'
import {
  cropForRatio,
  cssFilter,
  formatBytes,
  FULL_CROP,
  isDefault,
  NO_ADJUSTMENTS,
  outputSize,
  type Adjustments,
  type Crop,
} from './imageMath'
import { useUploadLimits } from './useUploadLimits'

const RATIOS: [string, number | null][] = [['Free', null], ['1:1', 1], ['3:4', 3 / 4], ['4:3', 4 / 3], ['16:9', 16 / 9]]
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
const MAX_SOURCE_MB = 60
const PREVIEW_SIDE = 1400

interface Props {
  sagaId: number
  category: UploadCategory
  /** Start from an existing picture (to re-crop or adjust it). */
  initialUrl?: string | null
  defaultRatio?: string
  onUploaded: (file: UploadedFile) => void
  onCancel: () => void
}

interface Source {
  image: HTMLImageElement
  name: string
  bytes: number
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => resolve(image) // keep the object URL alive while editing
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This file isn’t a picture the browser can read.'))
    }
    image.src = url
  })
}

/**
 * Picture uploader: pick (file, drop or paste), crop, rotate/flip, adjust colours, then the browser resizes
 * and compresses it to the category's limits before uploading. The server checks the limits again.
 */
export default function ImageUploader({ sagaId, category, initialUrl, defaultRatio = 'Free', onUploaded, onCancel }: Props) {
  const limits = useUploadLimits()
  const limit = limits?.categories[category]
  const [source, setSource] = useState<Source | null>(null)
  const [rotation, setRotation] = useState<Rotation>(0)
  const [flip, setFlip] = useState(false)
  const [ratioKey, setRatioKey] = useState(defaultRatio)
  const [crop, setCrop] = useState<Crop>(FULL_CROP)
  const [adj, setAdj] = useState<Adjustments>(NO_ADJUSTMENTS)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const ratio = RATIOS.find(([k]) => k === ratioKey)?.[1] ?? null

  const preview = useMemo(
    () => (source ? orientedCanvas(source.image, rotation, flip, PREVIEW_SIDE) : null),
    [source, rotation, flip],
  )
  const sideways = rotation === 90 || rotation === 270
  const W = source ? (sideways ? source.image.naturalHeight : source.image.naturalWidth) : 1
  const H = source ? (sideways ? source.image.naturalWidth : source.image.naturalHeight) : 1

  const open = useCallback(async (blob: Blob, name: string) => {
    setError('')
    if (!ACCEPT.split(',').includes(blob.type)) return setError('Choose a PNG, JPEG, WebP or GIF picture.')
    if (blob.size > MAX_SOURCE_MB * 1024 * 1024) return setError(`That file is very large (over ${MAX_SOURCE_MB} MB). Try a smaller one.`)
    try {
      const image = await loadImage(blob)
      setSource({ image, name, bytes: blob.size })
      setRotation(0)
      setFlip(false)
      setAdj(NO_ADJUSTMENTS)
      const r = RATIOS.find(([k]) => k === ratioKey)?.[1] ?? null
      setCrop(cropForRatio(r, image.naturalWidth, image.naturalHeight))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [ratioKey])

  // Start from the current picture when editing an existing one
  useEffect(() => {
    if (!initialUrl) return
    fetch(apiUrl(initialUrl))
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('Could not load the current picture.'))))
      .then((blob) => open(blob, 'picture'))
      .catch((e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl])

  // Paste a picture from the clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'))
      if (file) void open(file, file.name || 'pasted')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void open(file, file.name)
  }

  const rotate = (delta: 90 | -90) => {
    const next = (((rotation + delta) % 360) + 360) % 360 as Rotation
    setRotation(next)
    const nw = next === 90 || next === 270 ? source!.image.naturalHeight : source!.image.naturalWidth
    const nh = next === 90 || next === 270 ? source!.image.naturalWidth : source!.image.naturalHeight
    setCrop(cropForRatio(ratio, nw, nh))
  }

  const chooseRatio = (key: string) => {
    setRatioKey(key)
    setCrop(cropForRatio(RATIOS.find(([k]) => k === key)?.[1] ?? null, W, H))
  }

  const upload = async () => {
    if (!source || !limit) return
    setError('')
    try {
      setBusy('Preparing the picture…')
      const result = await exportPicture({
        source: source.image, rotation, flip, crop, adjustments: adj,
        maxPx: limit.max_px, maxBytes: Math.floor(limit.max_mb * 1024 * 1024),
      })
      setBusy(`Uploading ${formatBytes(result.blob.size)}…`)
      const ext = result.type === 'image/webp' ? 'webp' : 'jpg'
      const base = source.name.replace(/\.[^.]+$/, '') || 'picture'
      onUploaded(await api.uploadFile(sagaId, result.blob, category, `${base}.${ext}`))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const limitText = limit ? `Up to ${limit.max_mb} MB and ${limit.max_px} px on the longest side` : 'Loading limits…'
  const out = source && limit ? outputSize(crop, W, H, limit.max_px) : null

  if (!source || !preview) {
    return (
      <div className="uploader">
        <label
          className={`drop-zone ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <span className="drop-glyph">⇪</span>
          <strong>{initialUrl && !error ? 'Loading the current picture…' : 'Choose a picture'}</strong>
          <span className="muted">or drop it here, or paste it (Ctrl+V)</span>
          <span className="limit-note">{limit?.label}: {limitText}. Bigger pictures are resized for you.</span>
          <input type="file" accept={ACCEPT} hidden onChange={(e) => e.target.files?.[0] && open(e.target.files[0], e.target.files[0].name)} />
        </label>
        {error && <div className="error">{error}</div>}
        <div className="button-row end"><button className="ghost" onClick={onCancel}>Cancel</button></div>
      </div>
    )
  }

  const slider = (key: keyof Adjustments, label: string, min: number, max: number, step: number, show: (v: number) => string) => (
    <label className="slider">
      <span className="slider-head">{label}<span className="muted">{show(adj[key])}</span></span>
      <input type="range" min={min} max={max} step={step} value={adj[key]}
        onChange={(e) => setAdj({ ...adj, [key]: Number(e.target.value) })}
        onDoubleClick={() => setAdj({ ...adj, [key]: NO_ADJUSTMENTS[key] })} />
    </label>
  )
  const pct = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`

  return (
    <div className="uploader editing">
      <div className="uploader-body">
        <div className="uploader-canvas">
          <CropArea preview={preview} filter={cssFilter(adj)} crop={crop} ratio={ratio} width={W} height={H} onChange={setCrop} />
        </div>
        <div className="uploader-tools">
          <div className="field">
            <span className="field-label">Crop</span>
            <div className="chips">
              {RATIOS.map(([key]) => (
                <button key={key} type="button" className={`chip ${ratioKey === key ? 'on' : ''}`} onClick={() => chooseRatio(key)}>{key}</button>
              ))}
            </div>
            <div className="button-row">
              <button type="button" onClick={() => rotate(-90)} title="Rotate left">⟲</button>
              <button type="button" onClick={() => rotate(90)} title="Rotate right">⟳</button>
              <button type="button" className={flip ? 'on' : ''} onClick={() => setFlip(!flip)} title="Mirror">⇋ Mirror</button>
              <button type="button" className="ghost" onClick={() => setCrop(cropForRatio(ratio, W, H))}>Reset crop</button>
            </div>
          </div>
          <div className="field">
            <span className="field-label">
              Adjust {!isDefault(adj) && <button type="button" className="ghost small" onClick={() => setAdj(NO_ADJUSTMENTS)}>Reset</button>}
            </span>
            {slider('brightness', 'Brightness', 0.5, 1.5, 0.01, pct)}
            {slider('contrast', 'Contrast', 0.5, 1.5, 0.01, pct)}
            {slider('saturation', 'Saturation', 0, 2, 0.01, pct)}
            {slider('hue', 'Hue', -180, 180, 1, (v) => `${v > 0 ? '+' : ''}${v}°`)}
          </div>
          <div className="upload-info">
            <div>Original: {source.image.naturalWidth}×{source.image.naturalHeight} px · {formatBytes(source.bytes)}</div>
            {out && <div>Will upload: <strong>{out.width}×{out.height} px</strong>, at most {limit!.max_mb} MB</div>}
            <div className="muted small">{limit?.label}: {limitText}.</div>
          </div>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="button-row end">
        <button className="ghost" onClick={() => setSource(null)} disabled={Boolean(busy)}>Choose another</button>
        <button className="ghost" onClick={onCancel} disabled={Boolean(busy)}>Cancel</button>
        <button className="primary" onClick={upload} disabled={Boolean(busy) || !limit}>{busy || 'Upload'}</button>
      </div>
    </div>
  )
}
