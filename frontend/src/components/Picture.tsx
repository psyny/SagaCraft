import { useLayoutEffect, useRef, useState } from 'react'
import { apiUrl } from '../api/client'
import { pickWidth, sizedUrl } from './sizedUrl'

interface Props {
  url?: string | null
  mode: 'face' | 'full'
  face?: { x: number; y: number; size: number } | null
  alt?: string
  className?: string
}

/** How wide (CSS px) the picture is drawn in its box, measured before anything loads and growing with the box (never
 * shrinking: a bigger copy already loaded stays). "full": the box has no width of its own (the file itself);
 * "pending": not measured yet (nothing loads, so the full file isn't fetched for nothing). */
function useDrawnWidth(box: React.RefObject<HTMLDivElement>, scale: number): number | 'full' | 'pending' {
  const [width, setWidth] = useState<number | 'full' | 'pending'>('pending')
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const measure = (first: boolean) => {
      const drawn = element.offsetWidth * scale
      if (drawn > 0) setWidth((old) => (typeof old === 'number' && old >= drawn ? old : old === 'full' ? old : drawn))
      else if (first) setWidth((old) => (old === 'pending' ? 'full' : old))
    }
    measure(true)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure(false))
    observer.observe(element)
    return () => observer.disconnect()
  }, [box, scale])
  return width
}

/**
 * A character picture. "face" shows the crop set on the character (center x/y and size, as
 * fractions of the image width), "full" shows the whole picture covering the box. The picture is asked for at
 * the size it's drawn (sizedUrl) and loads lazily (off screen: when scrolled to).
 */
export default function Picture({ url, mode, face, alt = '', className = '' }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const f = face || { x: 0.5, y: 0.3, size: 0.4 }
  const size = Math.max(0.05, f.size)
  const drawn = useDrawnWidth(box, mode === 'face' ? 1 / size : 1)
  if (!url) return <div className={`picture picture-empty ${className}`} aria-hidden>✦</div>
  const width = typeof drawn === 'number' ? pickWidth(drawn, typeof window === 'undefined' ? 1 : window.devicePixelRatio) : null
  const src = drawn === 'pending' ? undefined : apiUrl(sizedUrl(url, width))
  if (mode === 'full') {
    return (
      <div ref={box} className={`picture ${className}`}>
        <img src={src} alt={alt} draggable={false} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  return (
    <div ref={box} className={`picture picture-face ${className}`}>
      <img
        src={src}
        alt={alt}
        draggable={false}
        loading="lazy"
        decoding="async"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: `${100 / size}%`,
          maxWidth: 'none',
          transform: `translate(-${f.x * 100}%, -${f.y * 100}%)`,
        }}
      />
    </div>
  )
}
