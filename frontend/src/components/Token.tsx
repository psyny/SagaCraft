/**
 * A character's token: a circle with its icon (else its picture's face, else its initial) and a border in its
 * player's colour (several players: white; none: a neutral grey). The border has a style the character's players
 * pick: simple, gradient, chip (a poker chip's stripes), double, studded. Drawn in SVG, so maps use the same ring
 * (TokenRing) as the HTML previews (Token). See docs/concepts/characters.md ("Token").
 */
import type { Member, TokenStyle } from '../api/types'
import SvgPicture from './SvgPicture'

export const TOKEN_STYLES: [TokenStyle, string][] = [
  ['simple', 'Simple'], ['gradient', 'Gradient'], ['chip', 'Chip'], ['double', 'Double'], ['studded', 'Studded'],
]
export const NEUTRAL = '#9b92a4'

/** Pure: a token's colour from its players in control (one: theirs; several: white; none: null). */
export function tokenColor(controllers: number[], members: Pick<Member, 'id' | 'color'>[]): string | null {
  const own = controllers.map((id) => members.find((m) => m.id === id)).filter((m): m is Pick<Member, 'id' | 'color'> => Boolean(m))
  if (own.length === 1) return own[0].color
  return own.length > 1 ? '#ffffff' : null
}

/** Pure: lighten (amount > 0) or darken a #rrggbb colour. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount)))
  return `#${ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`
}

/** The ring around a token, centred on (cx, cy), for a token of radius r. Goes inside an <svg>. */
export function TokenRing({ cx, cy, r, style = 'simple', color, id }: { cx: number; cy: number; r: number; style?: TokenStyle; color: string | null; id: string }) {
  const c = color || NEUTRAL
  const w = r * 0.16
  const dark = <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={w * 1.9} />
  switch (style) {
    case 'gradient':
      return (
        <g className="token-ring">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={shade(c, 0.55)} />
              <stop offset="0.5" stopColor={c} />
              <stop offset="1" stopColor={shade(c, -0.45)} />
            </linearGradient>
          </defs>
          {dark}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={w * 1.5} />
        </g>
      )
    case 'chip': {
      const len = 2 * Math.PI * r
      return (
        <g className="token-ring">
          {dark}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth={w * 1.6} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={w * 1.6}
            strokeDasharray={`${len / 24} ${len / 8 - len / 24}`} />
        </g>
      )
    }
    case 'double':
      return (
        <g className="token-ring">
          {dark}
          <circle cx={cx} cy={cy} r={r - w * 0.55} fill="none" stroke={c} strokeWidth={w * 0.55} />
          <circle cx={cx} cy={cy} r={r + w * 0.55} fill="none" stroke={c} strokeWidth={w * 0.55} />
        </g>
      )
    case 'studded':
      return (
        <g className="token-ring">
          {dark}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth={w} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * 2 * Math.PI - Math.PI / 2
            return <circle key={i} cx={cx + Math.cos(a) * r} cy={cy + Math.sin(a) * r} r={w * 0.9} fill={shade(c, 0.35)} stroke="rgba(0,0,0,0.6)" strokeWidth={w * 0.3} />
          })}
        </g>
      )
    default:
      return (
        <g className="token-ring">
          {dark}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth={w} />
        </g>
      )
  }
}

/** A token as a small picture (previews, lists): the icon and its ring. */
export default function Token({ icon, name, style, color, size = 64, id }: {
  icon: { url?: string; face?: { x: number; y: number; size: number } | null } | null
  name: string | null
  style?: TokenStyle
  color: string | null
  size?: number
  id: string
}) {
  const r = size * 0.38
  const c = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="token" role="img" aria-label={`${name ?? '???'}'s token`}>
      <circle cx={c} cy={c} r={r} fill="#1b1722" />
      {icon?.url
        ? <SvgPicture url={icon.url} face={icon.face ?? null} cx={c} cy={c} r={r} clipId={`${id}-clip`} />
        : <text x={c} y={c} dy="0.35em" textAnchor="middle" fontSize={r} fill="#ece6da" fontFamily="serif">{(name || '?').slice(0, 1)}</text>}
      <TokenRing cx={c} cy={c} r={r} style={style} color={color} id={`${id}-ring`} />
    </svg>
  )
}
