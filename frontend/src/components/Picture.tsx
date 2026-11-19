import { apiUrl } from '../api/client'

interface Props {
  url?: string | null
  mode: 'face' | 'full'
  face?: { x: number; y: number; size: number } | null
  alt?: string
  className?: string
}

/**
 * A character picture. "face" shows the crop set on the character (center x/y and size, as
 * fractions of the image width), "full" shows the whole picture covering the box.
 */
export default function Picture({ url, mode, face, alt = '', className = '' }: Props) {
  if (!url) return <div className={`picture picture-empty ${className}`} aria-hidden>✦</div>
  const src = apiUrl(url)
  if (mode === 'full') {
    return (
      <div className={`picture ${className}`}>
        <img src={src} alt={alt} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  const f = face || { x: 0.5, y: 0.3, size: 0.4 }
  const size = Math.max(0.05, f.size)
  return (
    <div className={`picture picture-face ${className}`}>
      <img
        src={src}
        alt={alt}
        draggable={false}
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
