import { motion, type MotionStyle } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { BarShape, DiscreteIcon, NumberColor } from '../../../api/types'
import { contrastOn } from '../../../saga/templates/modes'

const TONES = { high: '#52c06e', mid: '#e2b742', low: '#e2604f' }

/** The text color for numbers drawn on (or next to) a color. `theme`: the app's default (light, shadowed). */
export function numberColor(choice: NumberColor | undefined, behind: string | null): string | undefined {
  if (choice === 'black') return '#111'
  if (choice === 'white') return '#fff'
  if (choice === 'contrast') return behind ? contrastOn(behind) : undefined
  return undefined
}

interface BarProps {
  current: number
  max: number
  showNumbers?: boolean
  shape?: BarShape
  gradient?: boolean
  /** The fill color; null: the theme's (green, yellow, red as it drops). */
  color?: string | null
  numbers?: NumberColor
}

/** HP-style bar. Damage: the fill drops fast and a pale "chip" trails behind. Healing: a green chip leads. */
export function Bar({ current, max, showNumbers = true, shape = 'rounded', gradient = false, color = null, numbers = 'theme' }: BarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0
  const previous = useRef(pct)
  const [direction, setDirection] = useState<'down' | 'up' | 'none'>('none')
  useEffect(() => {
    if (pct < previous.current) setDirection('down')
    else if (pct > previous.current) setDirection('up')
    previous.current = pct
  }, [pct])
  const tone = pct > 50 ? 'high' : pct > 25 ? 'mid' : 'low'
  const fill = color ?? TONES[tone]
  const text = numberColor(numbers, pct >= 50 ? fill : null)

  return (
    <div className={`bar bar-${tone} bar-${shape} ${gradient ? 'gradient' : ''}`}>
      <motion.div
        className={`bar-chip ${direction === 'up' ? 'heal' : ''}`}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={direction === 'down' ? { delay: 0.45, duration: 0.7, ease: 'easeOut' } : { duration: 0.15 }}
      />
      <motion.div
        className="bar-fill"
        style={color ? { backgroundColor: color } : undefined}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={direction === 'up' ? { delay: 0.3, duration: 0.6, ease: 'easeOut' } : { duration: 0.18, ease: 'easeOut' }}
      />
      {showNumbers && (
        <span className={`bar-text ${text ? 'plain' : ''}`} style={text ? { color: text } : undefined}>
          <Num value={current} /> / {max}
        </span>
      )}
    </div>
  )
}

/** A number that pops when it changes. */
export function Num({ value, style }: { value: number | string | null | undefined; style?: MotionStyle }) {
  return (
    <motion.span
      key={String(value)}
      className="num"
      style={style}
      initial={{ scale: 1.5, opacity: 0.4 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 18 }}
    >
      {value ?? '—'}
    </motion.span>
  )
}

const SHAPES: Record<DiscreteIcon, string> = {
  balls: 'M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13z',
  hearts: 'M8 14.2 2.3 8.6A3.6 3.6 0 0 1 8 3.9a3.6 3.6 0 0 1 5.7 4.7z',
  diamonds: 'M8 1 15 8 8 15 1 8z',
  squares: 'M2 2h12v12H2z',
}

/** Discrete threshold: a few icons (balls, hearts...), never the value. An icon pops when it's lost or regained. */
export function Balls({ level, levels, icon = 'balls', color = null }: { level: number; levels: number; icon?: DiscreteIcon; color?: string | null }) {
  return (
    <div className={`balls icons-${icon} ${level === 0 ? 'down' : ''}`} aria-label={`${level} of ${levels}`}>
      {Array.from({ length: levels }, (_, i) => {
        const filled = i < level
        return (
          <motion.svg
            key={`${i}-${filled}`}
            viewBox="0 0 16 16"
            className={`ball ${filled ? 'filled' : ''}`}
            style={color ? ({ '--icon': color } as unknown as MotionStyle) : undefined}
            initial={{ scale: filled ? 0.3 : 1.7 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 14 }}
          >
            <path d={SHAPES[icon]} />
          </motion.svg>
        )
      })}
    </div>
  )
}
