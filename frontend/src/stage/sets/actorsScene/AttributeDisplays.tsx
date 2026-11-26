import { motion, type MotionStyle } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { BarShape, DiscreteIcon, NumberColor, ValueShown } from '../../../api/types'
import { contrastOn } from '../../../saga/templates/modes'

const TONES = { high: '#52c06e', mid: '#e2b742', low: '#e2604f' }

/** The text color for numbers drawn on (or next to) a color. `theme`: the app's default (light, shadowed). */
export function numberColor(choice: NumberColor | undefined, behind: string | null): string | undefined {
  if (choice === 'black') return '#111'
  if (choice === 'white') return '#fff'
  if (choice === 'contrast') return behind ? contrastOn(behind) : undefined
  return undefined
}

/** 0-100 from the min to the max, whole; never 0 above the min nor 100 below it (mirrors domain/discrete.percent). */
export function percentOf(current: number, max: number, min = 0): number {
  const span = max - min
  if (span <= 0) return current >= max ? 100 : 0
  const value = Math.max(0, Math.min(100, Math.floor(((current - min) * 100) / span + 0.5)))
  if (value === 0 && current > min) return 1
  if (value === 100 && current < max) return 99
  return value
}

interface BarProps {
  /** The numbers (absent: players who get only the percentage). */
  current?: number
  max?: number
  min?: number
  percent?: number
  /** What it writes on it: nothing, "23 / 31" or "74%". */
  shown?: ValueShown
  shape?: BarShape
  gradient?: boolean
  /** The fill color; null: the theme's (green, yellow, red as it drops). */
  color?: string | null
  numbers?: NumberColor
}

/** HP-style bar, filled from the min to the max. Damage: the fill drops fast and a pale "chip" trails behind.
 * Healing: a green chip leads. */
export function Bar({ current, max, min = 0, percent, shown = 'current_max', shape = 'round', gradient = false, color = null, numbers = 'theme' }: BarProps) {
  const exact = current !== undefined && max !== undefined
  const pct = exact ? (max > min ? Math.max(0, Math.min(100, ((current - min) / (max - min)) * 100)) : current >= max ? 100 : 0) : percent ?? 0
  const readout = shown === 'percent' ? `${percent ?? (exact ? percentOf(current, max, min) : 0)}%` : null
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
      {shown !== 'none' && (readout !== null || exact) && (
        <span className={`bar-text ${text ? 'plain' : ''}`} style={text ? { color: text } : undefined}>
          {readout !== null ? <Num value={readout} /> : <><Num value={current} /> / {max}</>}
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
  stars: 'M8 1.3 9.76 6.27 15.04 6.41 10.85 9.63 12.35 14.69 8 11.7 3.65 14.69 5.15 9.63 0.96 6.41 6.24 6.27z',
  bars: 'M1 1h6v14H1z', // in its own 8 x 16 box: half as wide as tall
}
const VIEW_BOX: Partial<Record<DiscreteIcon, string>> = { bars: '0 0 8 16' }

/**
 * Scale a row down to the room its parent has (1 when it fits): the row keeps its icons and spacing on one line, the
 * whole of it smaller on a small card. Its origin: the centre when the parent centres it, else its left.
 */
function useFitWidth(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<{ scale: number; origin: string }>({ scale: 1, origin: 'center' })
  useLayoutEffect(() => {
    const row = ref.current
    const parent = row?.parentElement
    if (!row || !parent || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const style = getComputedStyle(parent)
      const room = parent.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0')
      const need = row.scrollWidth
      const scale = room > 0 && need > room ? room / need : 1
      const origin = style.justifyContent === 'center' ? 'center' : 'left'
      setFit((was) => (Math.abs(was.scale - scale) < 0.01 && was.origin === origin ? was : { scale, origin }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { ref, fit }
}

/** Discrete threshold: a few icons (balls, hearts, stars, bars...), never the value, `gap` px apart, on one line
 * (smaller where there's less room). An icon pops when it's lost or regained. */
export function Balls({ level, levels, icon = 'balls', color = null, gap = 5 }: {
  level: number; levels: number; icon?: DiscreteIcon; color?: string | null; gap?: number
}) {
  const { ref, fit } = useFitWidth([levels, gap, icon])
  const style: CSSProperties = fit.scale < 1 ? { columnGap: gap, transform: `scale(${fit.scale})`, transformOrigin: fit.origin } : { columnGap: gap }
  return (
    <div ref={ref} className={`balls icons-${icon} ${level === 0 ? 'down' : ''}`} style={style} aria-label={`${level} of ${levels}`}>
      {Array.from({ length: levels }, (_, i) => {
        const filled = i < level
        return (
          <motion.svg
            key={`${i}-${filled}`}
            viewBox={VIEW_BOX[icon] ?? '0 0 16 16'}
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
