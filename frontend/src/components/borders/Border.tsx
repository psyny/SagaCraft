/**
 * Borders (plan 59): one layer drawn over a card or sheet (BoxBorder, a rectangle) or around a token (RingBorder, a
 * circle or a larger token's outline), in a display template's style, colour and width (the server resolves the colour:
 * the owner's, the group's or a custom one). Simple styles: flat, gradient, chip (embossed segments), neon (a lighter
 * line glowing in the colour). Framed ones, after references the user collected (docs/drafts/border_styles): electric
 * (a jagged glowing line), HUD (chamfered corner brackets and side bars), light frame (thin double lines crossing at the
 * corners), Mayan (a stepped band between two lines), and the ornamental noble, roses and vines (flourishes on the
 * corners). Everything is SVG, made from the colour: no pictures.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Border, BorderStyle, BorderWidth } from '../../api/types'
import { shade } from '../../color/theory'

export const BORDER_STYLES: [BorderStyle, string][] = [
  ['flat', 'Flat'], ['gradient', 'Gradient'], ['chip', 'Chip'], ['neon', 'Neon'],
  ['electric', 'Electric'], ['hud', 'HUD'], ['lightframe', 'Light frame'], ['mayan', 'Mayan'], ['noble', 'Noble'], ['roses', 'Roses'], ['vines', 'Vines'],
]
export const SIMPLE_BORDERS: BorderStyle[] = ['flat', 'gradient', 'chip', 'neon']
export const BORDER_WIDTHS: [BorderWidth, string][] = [['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']]
const SCALE: Record<BorderWidth, number> = { s: 0.6, m: 1, l: 1.5, xl: 2.1 }
/** The dark line between a border and the picture: the same width in every style. */
const SEPARATOR = 'rgba(8, 6, 12, 0.7)'

let next = 0
const useId = (prefix: string) => {
  const ref = useRef<string>()
  if (!ref.current) ref.current = `${prefix}-${(next += 1)}`
  return ref.current
}

/** The box's size, as it's drawn (it follows its parent). */
function useBoxSize() {
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState<{ w: number; h: number; r: number } | null>(null)
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return
    const measure = () => {
      const r = parseFloat(getComputedStyle(parent).borderTopLeftRadius || '0') || 0
      setSize((was) => (was && was.w === parent.clientWidth && was.h === parent.clientHeight && was.r === r ? was : { w: parent.clientWidth, h: parent.clientHeight, r }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  return { ref, size }
}

/** A flourish for a corner (40 × 40, at the corner, curling along both sides): noble, roses, vines. */
const FLOURISH: Record<'noble' | 'roses' | 'vines', string> = {
  noble: 'M3 3C15 3 22 6 25 13C27 18 23 21 20 18C18 16 20 13 22 15M3 3C3 15 6 22 13 25C18 27 21 23 18 20C16 18 13 20 15 22M3 3L11 11M30 4C34 5 36 7 38 4M4 30C5 34 7 36 4 38',
  roses: 'M2 2C12 2 17 5 18 11C19 16 14 18 12 15C10 12 14 10 15 12M2 2C2 12 5 17 11 18C16 19 18 14 15 12M7 7C10 4 16 6 14 9C12 11 9 10 9 8M24 3C28 2 33 3 37 6M3 24C2 28 3 33 6 37',
  vines: 'M3 3C10 6 16 9 20 16C22 19 26 20 28 18M3 3C6 10 9 16 16 20C19 22 20 26 18 28M14 6C17 4 20 5 21 8C18 9 15 8 14 6M6 14C4 17 5 20 8 21C9 18 8 15 6 14',
}
/** A small ornament for the middle of a side (noble: a diamond with curls; vines: an arrow; roses: none). */
const MIDDLE: Partial<Record<'noble' | 'vines', string>> = {
  noble: 'M0 -5L5 0L0 5L-5 0ZM-5 0C-10 -4 -15 -1 -13 2C-12 4 -9 3 -10 1M5 0C10 -4 15 -1 13 2C12 4 9 3 10 1',
  vines: 'M-12 0H12M7 -4L12 0L7 4M-7 -4L-12 0L-7 4M0 -4V4',
}

function Defs({ id, c, w }: { id: string; c: string; w: number }) {
  return (
    <defs>
      <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={shade(c, 0.55)} /><stop offset="0.5" stopColor={c} /><stop offset="1" stopColor={shade(c, -0.45)} />
      </linearGradient>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={shade(c, 0.6)} /><stop offset="0.35" stopColor={c} /><stop offset="0.6" stopColor={shade(c, 0.35)} /><stop offset="1" stopColor={shade(c, -0.4)} />
      </linearGradient>
      <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation={Math.max(1.5, w * 0.9)} />
      </filter>
      <filter id={`${id}-zap`} x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale={Math.max(3, w * 1.6)} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <pattern id={`${id}-fret`} width={w * 2} height={w * 2} patternUnits="userSpaceOnUse">
        <path d={`M0 ${w * 2}V${w}H${w}V0H${w * 2}`} fill="none" stroke={c} strokeWidth={Math.max(1, w * 0.28)} />
      </pattern>
    </defs>
  )
}

/** A rounded rectangle inset by `i` from a w × h box. */
const rect = (w: number, h: number, r: number, i: number, props: Record<string, unknown>) => (
  <rect x={i} y={i} width={Math.max(0, w - 2 * i)} height={Math.max(0, h - 2 * i)} rx={Math.max(0, r - i)} fill="none" {...props} />
)

/** Neon's glow on a card or sheet (plan 59): outside its box, a drop shadow in the border's colour (the box clips
 * what's drawn inside it). A class and CSS variables for the box; nothing for other styles. */
export function borderGlow(border: Border | undefined, base = 4): { className: string; style: Record<string, string> } {
  if (!border || border.style !== 'neon') return { className: '', style: {} }
  const w = base * SCALE[border.width ?? 'm']
  return { className: 'border-glow', style: { '--border-glow-color': border.color, '--border-glow': `${Math.round(w * 2.2)}px` } }
}

/** A card's or sheet's border: an SVG over it, the size of its box (its parent, positioned). */
export function BoxBorder({ border, base = 4 }: { border: Border; base?: number }) {
  const id = useId('bb')
  const { ref, size } = useBoxSize()
  const c = border.color || '#000000'
  const w = base * SCALE[border.width ?? 'm']
  let body: ReactNode = null
  if (size && size.w > 0) {
    const { w: W, h: H, r } = size
    const half = w / 2
    const separator = rect(W, H, r, w + 0.75, { stroke: SEPARATOR, strokeWidth: 1.5 })
    switch (border.style) {
      case 'flat':
        body = <>{rect(W, H, r, half, { stroke: c, strokeWidth: w })}{separator}</>
        break
      case 'chip': {
        const seg = Math.max(10, (W + H) / 14)
        const dash = `${seg} ${seg * 0.18}`
        body = (
          <>
            {rect(W, H, r, half, { stroke: shade(c, -0.55), strokeWidth: w + 1.5 })}
            {rect(W, H, r, half, { stroke: c, strokeWidth: w, strokeDasharray: dash })}
            {rect(W, H, r, half, { stroke: '#f4f0e6', strokeWidth: w, strokeDasharray: `${seg * 0.42} ${seg * 0.76 + seg * 0.18 * 2 - seg * 0.42}`, strokeDashoffset: -seg * 0.29 })}
            {rect(W, H, r, half - w * 0.28, { stroke: 'rgba(255,255,255,0.45)', strokeWidth: Math.max(0.8, w * 0.22), strokeDasharray: dash })}
            {rect(W, H, r, half + w * 0.3, { stroke: 'rgba(0,0,0,0.4)', strokeWidth: Math.max(0.8, w * 0.22), strokeDasharray: dash })}
            {separator}
          </>
        )
        break
      }
      case 'neon': // one flat line in a lighter colour (plan 60); its glow is outside the box (borderGlow)
        body = <>{rect(W, H, r, half, { stroke: shade(c, 0.45), strokeWidth: w })}{separator}</>
        break
      case 'electric':
        body = (
          <>
            {rect(W, H, r, w, { stroke: c, strokeWidth: w * 1.2, filter: `url(#${id}-glow)` })}
            <g filter={`url(#${id}-zap)`}>
              {rect(W, H, r, w, { stroke: c, strokeWidth: w * 0.7 })}
              {rect(W, H, r, w, { stroke: shade(c, 0.75), strokeWidth: Math.max(0.8, w * 0.25) })}
            </g>
          </>
        )
        break
      case 'hud': {
        const L = Math.min(W, H) * 0.24, k = Math.min(W, H) * 0.07, i = half + 1
        const corner = `M${i + L} ${i}H${i + k}L${i} ${i + k}V${i + L}`
        const corners = [corner, `M${W - i - L} ${i}H${W - i - k}L${W - i} ${i + k}V${i + L}`,
          `M${i + L} ${H - i}H${i + k}L${i} ${H - i - k}V${H - i - L}`, `M${W - i - L} ${H - i}H${W - i - k}L${W - i} ${H - i - k}V${H - i - L}`]
        const bars = `M${i + w} ${H * 0.36}V${H * 0.64}M${W - i - w} ${H * 0.36}V${H * 0.64}`
        const lines = (stroke: string, width: number, extra = {}) => (
          <>{corners.map((d, n) => <path key={n} d={d} fill="none" stroke={stroke} strokeWidth={width} strokeLinejoin="round" {...extra} />)}
            <path d={bars} stroke={shade(c, -0.15)} strokeWidth={width * 0.8} {...extra} /></>
        )
        body = <>{lines(c, w * 1.3, { filter: `url(#${id}-glow)` })}{lines(shade(c, 0.5), w * 0.7)}{rect(W, H, r, half + 2, { stroke: c, strokeWidth: 0.75, opacity: 0.35 })}</>
        break
      }
      case 'lightframe': {
        const a = half, b = w * 2.4
        const cross = [`M0 ${b}H${W}`, `M0 ${H - b}H${W}`, `M${b} 0V${H}`, `M${W - b} 0V${H}`]
        body = (
          <>
            {rect(W, H, r, a, { stroke: `url(#${id}-g)`, strokeWidth: Math.max(1, w * 0.4) })}
            {cross.map((d, n) => <path key={n} d={d} stroke={shade(c, 0.35)} strokeWidth={Math.max(0.8, w * 0.25)} opacity="0.85" />)}
            {rect(W, H, r, b, { stroke: c, strokeWidth: Math.max(1, w * 0.3), filter: `url(#${id}-glow)`, opacity: 0.6 })}
          </>
        )
        break
      }
      case 'mayan': {
        const band = w * 2
        body = (
          <>
            {rect(W, H, 0, band / 2 + 1, { stroke: `url(#${id}-fret)`, strokeWidth: band })}
            {rect(W, H, 0, 1, { stroke: c, strokeWidth: Math.max(1, w * 0.3) })}
            {rect(W, H, 0, band + 1, { stroke: c, strokeWidth: Math.max(1, w * 0.3) })}
            {rect(W, H, 0, band + 1 + Math.max(1, w * 0.3), { stroke: SEPARATOR, strokeWidth: 1.2 })}
          </>
        )
        break
      }
      case 'noble':
      case 'roses':
      case 'vines': {
        const k = Math.min(1.6, Math.max(0.6, Math.min(W, H) / 220)) * (0.8 + SCALE[border.width ?? 'm'] * 0.25)
        const flourish = FLOURISH[border.style]
        const at = (x: number, y: number, sx: number, sy: number) => `translate(${x} ${y}) scale(${sx * k} ${sy * k})`
        const corners = [at(0, 0, 1, 1), at(W, 0, -1, 1), at(0, H, 1, -1), at(W, H, -1, -1)]
        const mid = MIDDLE[border.style as 'noble' | 'vines']
        const stroke = `url(#${id}-gold)`
        body = (
          <>
            {rect(W, H, r, half, { stroke, strokeWidth: Math.max(1, w * 0.35) })}
            {border.style !== 'noble' && rect(W, H, r, half + w * 1.1, { stroke, strokeWidth: Math.max(0.8, w * 0.22) })}
            {corners.map((t, n) => (
              <g key={n} transform={t}>
                <path d={flourish} fill="none" stroke="rgba(8,6,12,0.65)" strokeWidth={Math.max(2.4, w * 0.85) / k} strokeLinecap="round" />
                <path d={flourish} fill="none" stroke={stroke} strokeWidth={Math.max(1.2, w * 0.45) / k} strokeLinecap="round" />
              </g>
            ))}
            {mid && [[W / 2, half, 0], [W / 2, H - half, 0], [half, H / 2, 90], [W - half, H / 2, 90]].map(([x, y, rot], n) => (
              <g key={n} transform={`translate(${x} ${y}) rotate(${rot}) scale(${k})`}>
                <path d={mid} fill={border.style === 'noble' ? shade(c, -0.2) : 'none'} stroke={stroke} strokeWidth={Math.max(1.1, w * 0.4) / k} strokeLinecap="round" />
              </g>
            ))}
            {separator}
          </>
        )
        break
      }
      default: // gradient
        body = <>{rect(W, H, r, half, { stroke: `url(#${id}-g)`, strokeWidth: w })}{separator}</>
    }
  }
  return (
    <svg ref={ref} className={`box-border border-${border.style}`} aria-hidden width={size?.w ?? 0} height={size?.h ?? 0}>
      {size && <Defs id={id} c={c} w={w} />}
      {body}
    </svg>
  )
}

/**
 * A token's border (plan 59): around a circle (cx, cy, r) or, for a larger token, along its outline `d` (inside it:
 * clipped to its shape). `w`: the size-1 border's width; the width setting scales it. The border grows inwards from the
 * token's edge: a token is the same size whatever its border (only Neon's glow spills out).
 */
export function RingBorder({ cx, cy, r, d, length, w: base, border, id }: {
  cx: number; cy: number; r: number; d?: string; length?: number; w: number; border: Border; id: string
}) {
  const c = border.color || '#000000'
  const w = Math.min(r * 0.42, base * SCALE[border.width ?? 'm'])
  const k = d ? 2 : 1 // along an outline, strokes are drawn twice as wide and clipped inside
  const total = length ?? 2 * Math.PI * r
  // A ring `width` wide whose outer edge is `from` inside the token's edge (along an outline: on it, inner half shown)
  const ring = (stroke: string, width: number, extra: Record<string, unknown> = {}, from = 0) => d
    ? <path d={d} fill="none" stroke={stroke} strokeWidth={width * k} strokeLinejoin="round" clipPath={`url(#${id}-in)`} {...extra} />
    : <circle cx={cx} cy={cy} r={Math.max(0.5, r - from - width / 2)} fill="none" stroke={stroke} strokeWidth={width} {...extra} />
  const separator = (inside: number) => ring(SEPARATOR, Math.max(1, w * 0.2), {}, inside)
  const under = (inside: number) => (
    <>
      {ring('rgba(0,0,0,0.55)', inside)}
      {c.toLowerCase() === '#000000' && ring('rgba(236,230,218,0.55)', Math.max(0.6, w * 0.18))}
    </>
  )
  let body: ReactNode
  switch (border.style) {
    case 'flat': body = <>{under(w)}{ring(c, w)}{separator(w)}</>; break
    case 'chip': {
      const seg = total / 8, band = w * 1.4
      const dash = { strokeDasharray: `${seg * 0.82} ${seg * 0.18}` }
      body = (
        <>
          {ring(shade(c, -0.5), band)}
          {ring(c, band, dash)}
          {ring('#f4f0e6', band, { strokeDasharray: `${seg * 0.3} ${seg * 0.7}`, strokeDashoffset: -seg * 0.26 })}
          {ring('rgba(0,0,0,0.45)', w * 0.25, dash, 0)}
          {ring('rgba(255,255,255,0.5)', w * 0.25, dash, band - w * 0.25)}
          {separator(band)}
        </>
      )
      break
    }
    // One flat line in a lighter colour (plan 60), glowing in the colour itself
    case 'neon': body = <>{ring(c, w, { filter: `url(#${id}-glow)` })}{ring(shade(c, 0.45), w)}{separator(w)}</>; break
    case 'electric': body = <>{ring(c, w * 1.2, { filter: `url(#${id}-glow)` }, w * 0.3)}<g filter={`url(#${id}-zap)`}>{ring(c, w * 0.7, {}, w * 0.55)}{ring(shade(c, 0.75), w * 0.26, {}, w * 0.77)}</g></>; break
    case 'hud': {
      const arc = total / 4
      const dash = { strokeDasharray: `${arc * 0.55} ${arc * 0.45}`, strokeDashoffset: arc * 0.27 }
      body = <>{ring(c, w * 1.2, { ...dash, filter: `url(#${id}-glow)` }, w * 0.1)}{ring(shade(c, 0.5), w * 0.8, dash, w * 0.3)}{ring(c, 0.8, { opacity: 0.4 }, w * 1.5)}</>
      break
    }
    case 'lightframe': body = <>{ring(`url(#${id}-g)`, w * 0.45, {}, 0)}{ring(c, w * 0.35, { filter: `url(#${id}-glow)`, opacity: 0.7 }, w * 0.95)}{ring(shade(c, 0.4), w * 0.3, {}, w)}</>; break
    case 'mayan': body = <>{under(w * 1.9)}{ring(c, w * 0.3, {}, 0)}{ring(shade(c, -0.2), w * 1.1, { strokeDasharray: `${w * 0.5} ${w * 0.5}` }, w * 0.4)}{ring(c, w * 0.3, {}, w * 1.5)}{separator(w * 1.8)}</>; break
    case 'noble':
    case 'roses':
    case 'vines': {
      const at = r - w * 0.9 // the ornaments sit on the ring, inside the token
      const ornament = d ? null : [0, 90, 180, 270].map((deg) => (
        <g key={deg} transform={`rotate(${deg + (border.style === 'roses' ? 45 : 0)} ${cx} ${cy}) translate(${cx} ${cy - at})`}>
          <path d={border.style === 'vines' ? 'M0 -4C-3 -1 -3 2 0 4C3 2 3 -1 0 -4Z' : 'M0 -4L3 0L0 4L-3 0Z'} transform={`scale(${w * 0.2})`}
            fill={`url(#${id}-gold)`} stroke="rgba(8,6,12,0.7)" strokeWidth={0.6} />
        </g>
      ))
      body = <>{under(w * 1.2)}{ring(`url(#${id}-gold)`, w * 1.2)}{border.style !== 'noble' && ring(shade(c, 0.5), w * 0.22, {}, w * 1.35)}{ornament}{separator(w * 1.6)}</>
      break
    }
    default: body = <>{under(w * 1.4)}{ring(`url(#${id}-g)`, w * 1.4)}{separator(w * 1.4)}</>
  }
  return (
    <g className={`token-ring ring-${border.style}`}>
      <defs>
        {d && <clipPath id={`${id}-in`}><path d={d} /></clipPath>}
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={shade(c, 0.55)} /><stop offset="0.5" stopColor={c} /><stop offset="1" stopColor={shade(c, -0.45)} />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={shade(c, 0.6)} /><stop offset="0.4" stopColor={c} /><stop offset="0.65" stopColor={shade(c, 0.35)} /><stop offset="1" stopColor={shade(c, -0.4)} />
        </linearGradient>
        <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation={Math.max(1, w * 0.8)} /></filter>
        <filter id={`${id}-zap`} x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency={0.6 / Math.max(4, w)} numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale={Math.max(2, w * 1.3)} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      {body}
    </g>
  )
}
