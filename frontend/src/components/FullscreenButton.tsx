/** Puts the whole page in the browser's full screen (and back): more room for the map tools. */
import { useEffect, useState } from 'react'

export default function FullscreenButton({ className = 'small ghost' }: { className?: string }) {
  const [on, setOn] = useState(Boolean(document.fullscreenElement))
  useEffect(() => {
    const sync = () => setOn(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  if (!document.documentElement.requestFullscreen) return null
  return (
    <button type="button" className={className} title={on ? 'Leave full screen' : 'Use the whole screen'}
      onClick={() => void (on ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)}>
      {on ? '⤡ Exit full screen' : '⤢ Full screen'}
    </button>
  )
}
