/**
 * The Stage's control icons (plan 45): filled shapes in soft two-colour gradients with a thin darker outline, like a
 * colour emoji but the same on every platform. An icon names its colours (`useGloss`) and draws with them:
 *
 *   const g = useGloss('gold', 'steel')
 *   <Gloss defs={g.defs}><path d="…" {...g.gold} /></Gloss>
 */
import { useId, type ReactNode } from 'react'

/** Light (top), deep (bottom), outline. */
export const TONES = {
  gold: ['#ffe58a', '#f2a51f', '#8a5410'],
  amber: ['#ffd28a', '#e8812a', '#7a3a10'],
  blue: ['#a9dcff', '#3d86db', '#1b3c70'],
  sky: ['#d6f1ff', '#7cc0ee', '#2b5f88'],
  teal: ['#a8f1e5', '#25a593', '#11554c'],
  green: ['#c4f2a8', '#4aa84f', '#1f5a24'],
  red: ['#ffb3a3', '#e04f3a', '#76200f'],
  pink: ['#ffc6e0', '#e0609c', '#7a1f4c'],
  purple: ['#e3c7ff', '#9b5ddc', '#482074'],
  steel: ['#f1f4f8', '#a2abba', '#4a5262'],
  slate: ['#aab3c2', '#5a6475', '#262c36'],
  paper: ['#fff6dc', '#e5c88e', '#7a5a26'],
  wood: ['#e9b97c', '#9a6232', '#4a2c12'],
  skin: ['#ffe0c2', '#e9a877', '#7a4a26'],
  white: ['#ffffff', '#dfe4ec', '#5a6272'],
  dark: ['#5b5468', '#2a2532', '#0e0c12'],
} as const
export type Tone = keyof typeof TONES

export interface Paint { fill: string; stroke: string; strokeWidth: number }

/** Gradients for these tones, and the props to paint a shape with each (fill, outline). */
export function useGloss<T extends Tone>(...tones: T[]): { defs: ReactNode } & Record<T, Paint> {
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const out = {} as Record<T, Paint>
  const defs = tones.map((tone) => {
    const [light, deep, line] = TONES[tone]
    const id = `g${base}${tone}`
    out[tone] = { fill: `url(#${id})`, stroke: line, strokeWidth: 0.9 }
    return (
      <linearGradient key={tone} id={id} x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stopColor={light} />
        <stop offset="1" stopColor={deep} />
      </linearGradient>
    )
  })
  return { defs: <defs>{defs}</defs>, ...out }
}

/** A flat colour of a tone (details drawn over the gradients: a highlight, a line). */
export const tone = (t: Tone, which: 0 | 1 | 2 = 2) => TONES[t][which]

export function Gloss({ children, defs, size = 20, label, className = '' }: {
  children: ReactNode; defs?: ReactNode; size?: number; label?: string; className?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" strokeLinecap="round" strokeLinejoin="round" className={`gloss-icon ${className}`}
      aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      {defs}
      {children}
    </svg>
  )
}
