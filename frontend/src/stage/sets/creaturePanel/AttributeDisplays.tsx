import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

/** HP-style bar. Damage: the fill drops fast and a pale "chip" trails behind. Healing: a green chip leads. */
export function Bar({ current, max, showNumbers = true }: { current: number; max: number; showNumbers?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0
  const previous = useRef(pct)
  const [direction, setDirection] = useState<'down' | 'up' | 'none'>('none')
  useEffect(() => {
    if (pct < previous.current) setDirection('down')
    else if (pct > previous.current) setDirection('up')
    previous.current = pct
  }, [pct])
  const tone = pct > 50 ? 'high' : pct > 25 ? 'mid' : 'low'

  return (
    <div className={`bar bar-${tone}`}>
      <motion.div
        className={`bar-chip ${direction === 'up' ? 'heal' : ''}`}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={direction === 'down' ? { delay: 0.45, duration: 0.7, ease: 'easeOut' } : { duration: 0.15 }}
      />
      <motion.div
        className="bar-fill"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={direction === 'up' ? { delay: 0.3, duration: 0.6, ease: 'easeOut' } : { duration: 0.18, ease: 'easeOut' }}
      />
      {showNumbers && (
        <span className="bar-text">
          <Num value={current} /> / {max}
        </span>
      )}
    </div>
  )
}

/** A number that pops when it changes. */
export function Num({ value }: { value: number | string | null | undefined }) {
  return (
    <motion.span
      key={String(value)}
      className="num"
      initial={{ scale: 1.5, opacity: 0.4 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 18 }}
    >
      {value ?? '—'}
    </motion.span>
  )
}

/** Discrete threshold: a few balls, never the value. A ball pops when it's lost or regained. */
export function Balls({ level, levels }: { level: number; levels: number }) {
  return (
    <div className={`balls ${level === 0 ? 'down' : ''}`} aria-label={`${level} of ${levels}`}>
      {Array.from({ length: levels }, (_, i) => {
        const filled = i < level
        return (
          <motion.span
            key={`${i}-${filled}`}
            className={`ball ${filled ? 'filled' : ''}`}
            initial={{ scale: filled ? 0.3 : 1.7 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 14 }}
          />
        )
      })}
    </div>
  )
}
