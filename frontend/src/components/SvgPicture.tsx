/**
 * A round picture inside SVG (relationship graph nodes, resources on maps): an icon fills the circle; a picture
 * with a face crop shows the face, like Picture's "face" mode (centre and size as fractions of its width).
 */
import { useEffect, useState } from 'react'
import { apiUrl } from '../api/client'
import type { Face } from '../api/types'

const ratios = new Map<string, number>()

/** The picture's height / width (known once it loads; cached). */
export function useImageRatio(url: string | null | undefined): number | null {
  const [ratio, setRatio] = useState<number | null>(url ? ratios.get(url) ?? null : null)
  useEffect(() => {
    if (!url) return setRatio(null)
    if (ratios.has(url)) return setRatio(ratios.get(url)!)
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth) {
        ratios.set(url, img.naturalHeight / img.naturalWidth)
        setRatio(img.naturalHeight / img.naturalWidth)
      }
    }
    img.src = apiUrl(url)
  }, [url])
  return ratio
}

/** Where the picture goes so the face crop fills a circle of radius r at (cx, cy); null until its size is known. */
export function faceBox(face: Face, ratio: number, cx: number, cy: number, r: number) {
  const width = (2 * r) / Math.max(0.05, face.size)
  const height = width * ratio
  return { x: cx - face.x * width, y: cy - face.y * height, width, height }
}

export default function SvgPicture({ url, face, cx, cy, r, clipId }: { url: string; face?: Face | null; cx: number; cy: number; r: number; clipId: string }) {
  const ratio = useImageRatio(face ? url : null)
  const box = face && ratio ? faceBox(face, ratio, cx, cy, r) : { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r }
  return (
    <>
      <clipPath id={clipId}><circle cx={cx} cy={cy} r={r} /></clipPath>
      <image href={apiUrl(url)} clipPath={`url(#${clipId})`} preserveAspectRatio={face && ratio ? 'none' : 'xMidYMid slice'} {...box} />
    </>
  )
}
