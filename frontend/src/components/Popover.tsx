import { motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface Anchor {
  /** Screen rect of what was clicked; the popover opens below it (or above when there's no room). */
  left: number
  top: number
  width: number
  height: number
}

export function anchorOf(element: Element): Anchor {
  const r = element.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/**
 * A small floating panel in screen space (not affected by the Stage zoom). Closes on outside click,
 * Escape, or when the window resizes.
 */
export default function Popover({ anchor, onClose, children, className = '' }: { anchor: Anchor; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const close = useRef(onClose)
  close.current = onClose

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const margin = 8
    const { width, height } = el.getBoundingClientRect()
    let left = anchor.left + anchor.width / 2 - width / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
    let top = anchor.top + anchor.height + 6
    if (top + height > window.innerHeight - margin) top = Math.max(margin, anchor.top - height - 6)
    setPos({ left, top })
  }, [anchor])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close.current()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    const onResize = () => close.current()
    // Next tick: the click that opened the popover must not close it
    const timer = window.setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return createPortal(
    <motion.div
      ref={ref}
      className={`popover ${className}`}
      style={{ left: pos?.left ?? anchor.left, top: pos?.top ?? anchor.top + anchor.height, visibility: pos ? 'visible' : 'hidden' }}
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.14 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </motion.div>,
    document.body,
  )
}
