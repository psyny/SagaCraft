/** Drawing a Panels Set's shapes (plan 60): a rectangle's CSS, a line's SVG path with rounded corners. */
import type { CSSProperties } from 'react'
import type { PanelLine, PanelRect } from './types'

/** #rrggbb at an opacity. */
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** A rectangle as a box: its fill (flat or gradient, at its opacity), border, corners and effect (blurring what's
 * under it, frosted glass, a glow, an inner shadow). */
export function rectStyle(r: PanelRect): CSSProperties {
  const { fill, border } = r
  const a = rgba(fill.color, fill.opacity), b = rgba(fill.color2, fill.opacity)
  const background = fill.style === 'linear' ? `linear-gradient(${fill.angle}deg, ${a}, ${b})`
    : fill.style === 'radial' ? `radial-gradient(circle at 50% 50%, ${a}, ${b})` : a
  const size = fill.effect_size
  const style: CSSProperties = {
    position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: r.radius, background,
    border: border.width > 0 ? `${border.width}px solid ${border.color}` : 'none', boxSizing: 'border-box',
  }
  if (fill.effect === 'blur') Object.assign(style, { backdropFilter: `blur(${size}px)`, WebkitBackdropFilter: `blur(${size}px)` })
  if (fill.effect === 'frost') {
    const f = `blur(${size}px) saturate(1.6) brightness(1.12)`
    Object.assign(style, { backdropFilter: f, WebkitBackdropFilter: f, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(255,255,255,0.08)' })
  }
  if (fill.effect === 'glow') style.boxShadow = `0 0 ${size * 2}px ${size / 2}px ${border.width > 0 ? border.color : fill.color}`
  if (fill.effect === 'inset') style.boxShadow = `inset 0 0 ${size * 2}px ${size / 2}px rgba(0, 0, 0, 0.65)`
  return style
}

/** A polyline as a path, its corners rounded by `radius` (at most half of each side). */
export function linePath(points: [number, number][], radius: number): string {
  if (points.length < 2) return ''
  let d = `M${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const [p, c, n] = [points[i - 1], points[i], points[i + 1]]
    const [l1, l2] = [Math.hypot(c[0] - p[0], c[1] - p[1]), Math.hypot(n[0] - c[0], n[1] - c[1])]
    const r = Math.min(radius, l1 / 2, l2 / 2)
    if (r <= 0 || !l1 || !l2) { d += ` L${c[0]} ${c[1]}`; continue }
    const a = [c[0] + ((p[0] - c[0]) * r) / l1, c[1] + ((p[1] - c[1]) * r) / l1]
    const b = [c[0] + ((n[0] - c[0]) * r) / l2, c[1] + ((n[1] - c[1]) * r) / l2]
    d += ` L${a[0]} ${a[1]} Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`
  }
  const last = points[points.length - 1]
  return `${d} L${last[0]} ${last[1]}`
}

/** A line's stroke: its colour, thickness, opacity and style (dashed, dotted). */
export function lineStroke(l: Pick<PanelLine, 'color' | 'width' | 'style' | 'opacity'>) {
  return {
    stroke: l.color, strokeWidth: l.width, strokeOpacity: l.opacity, fill: 'none', strokeLinejoin: 'round' as const,
    strokeLinecap: (l.style === 'dotted' ? 'round' : 'butt') as 'round' | 'butt',
    strokeDasharray: l.style === 'dashed' ? `${l.width * 3} ${l.width * 2}` : l.style === 'dotted' ? `0 ${l.width * 2}` : undefined,
  }
}

/** A shape's box (selection outline, moving). */
export function lineBox(points: [number, number][]): [number, number, number, number] {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
}
