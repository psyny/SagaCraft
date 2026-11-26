/**
 * A character's token: a circle with its icon (else its picture's face, else its initial) and a border in its
 * player's colour (several players: white; no player: black). The border has the style the character's display
 * template gives it: gradient (the default), simple, chip (a poker chip's stripes). Drawn in SVG, so maps use the same ring
 * (TokenRing) as the HTML previews (Token). See docs/concepts/characters.md ("Token").
 */
import type { Border, Member, TokenStyle } from '../api/types'
import { RingBorder } from './borders/Border'
import SvgPicture from './SvgPicture'

export const TOKEN_STYLES: [TokenStyle, string][] = [['gradient', 'Gradient'], ['simple', 'Simple'], ['chip', 'Chip']]
/** No player's: black (a light hairline keeps it visible on dark maps). */
export const NO_PLAYER = '#000000'

/** Pure: a token's colour from its players in control (one: theirs; several: white; no player: black). */
export function tokenColor(controllers: number[], members: Pick<Member, 'id' | 'color' | 'role'>[]): string {
  const own = controllers.map((id) => members.find((m) => m.id === id)).filter((m): m is Pick<Member, 'id' | 'color' | 'role'> => Boolean(m) && m!.role === 'player')
  if (own.length === 1) return own[0].color
  return own.length > 1 ? '#ffffff' : NO_PLAYER
}

/** Pure: lighten (amount > 0) or darken a #rrggbb colour. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount)))
  return `#${ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`
}

/** The border's width for a token of radius (or half size) r: thin. */
export const ringWidth = (r: number) => r * 0.128

/**
 * The border around a token, centred on (cx, cy), radius r; or along an outline `d` (a larger token: a rounded square,
 * a cluster of hexes; `length`: the outline's length, for the chip's stripes). `width`: the border's (a larger token
 * keeps its size-1 border). Along an outline the border is drawn inside it only, so it never spills past the token's
 * tiles. Goes inside an <svg>.
 */
export function TokenRing({ cx, cy, r, style = 'gradient', color, id, d, length, width, border }: {
  cx: number; cy: number; r: number; style?: TokenStyle; color: string | null; id: string; d?: string; length?: number; width?: number
  /** Plan 59: the template's border (style, colour, width): drawn by components/borders. */
  border?: Border
}) {
  const w = width ?? ringWidth(r)
  if (border) return <RingBorder cx={cx} cy={cy} r={r} d={d} length={length} w={w} border={border} id={id} />
  const c = color || NO_PLAYER
  // Inside only: the stroke is twice as wide and clipped to the shape, so what's left is its inner half
  const k = d ? 2 : 1
  const outline = (props: { stroke: string; strokeWidth: number; strokeDasharray?: string }) => {
    const sw = props.strokeWidth * k
    return d
      ? <path d={d} fill="none" strokeLinejoin="round" clipPath={`url(#${id}-in)`} {...props} strokeWidth={sw} />
      : <circle cx={cx} cy={cy} r={r} fill="none" {...props} />
  }
  const clip = d && <defs><clipPath id={`${id}-in`}><path d={d} /></clipPath></defs>
  const total = length ?? 2 * Math.PI * r
  const under = (
    <>
      {outline({ stroke: 'rgba(0,0,0,0.6)', strokeWidth: w * 1.9 })}
      {c.toLowerCase() === NO_PLAYER && !d && <circle cx={cx} cy={cy} r={r + w * 1.05} fill="none" stroke="rgba(236,230,218,0.55)" strokeWidth={Math.max(0.6, w * 0.22)} />}
      {c.toLowerCase() === NO_PLAYER && d && outline({ stroke: 'rgba(236,230,218,0.5)', strokeWidth: w * 2.3 })}
    </>
  )
  if (style === 'simple') return <g className="token-ring">{clip}{under}{outline({ stroke: c, strokeWidth: w })}</g>
  if (style === 'chip') {
    return (
      <g className="token-ring">
        {clip}
        {under}
        {outline({ stroke: c, strokeWidth: w * 1.5 })}
        {outline({ stroke: 'rgba(255,255,255,0.85)', strokeWidth: w * 1.5, strokeDasharray: `${total / 24} ${total / 8 - total / 24}` })}
      </g>
    )
  }
  return (
    <g className="token-ring">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={shade(c, 0.55)} />
          <stop offset="0.5" stopColor={c} />
          <stop offset="1" stopColor={shade(c, -0.45)} />
        </linearGradient>
        {d && <clipPath id={`${id}-in`}><path d={d} /></clipPath>}
      </defs>
      {under}
      {outline({ stroke: `url(#${id})`, strokeWidth: w * 1.4 })}
    </g>
  )
}

/** A token as a small picture (previews, lists): the icon and its ring. */
export default function Token({ icon, name, style = 'gradient', color, size = 64, id, border }: {
  icon: { url?: string; face?: { x: number; y: number; size: number } | null } | null
  name: string | null
  style?: TokenStyle
  color: string | null
  size?: number
  id: string
  border?: Border
}) {
  const r = size * 0.38
  const c = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="token" role="img" aria-label={`${name ?? '???'}'s token`}>
      <circle cx={c} cy={c} r={r} fill="#1b1722" />
      {icon?.url
        ? <SvgPicture url={icon.url} face={icon.face ?? null} cx={c} cy={c} r={r} clipId={`${id}-clip`} />
        : <text x={c} y={c} dy="0.35em" textAnchor="middle" fontSize={r} fill="#ece6da" fontFamily="serif">{(name || '?').slice(0, 1)}</text>}
      <TokenRing cx={c} cy={c} r={r} style={style} color={color} id={`${id}-ring`} border={border} />
    </svg>
  )
}
