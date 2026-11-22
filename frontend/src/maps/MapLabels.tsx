/**
 * Labels on a map (SVG, map px): a pin (pin, dot, star, flag, diamond, or none) and a text above it or on its left
 * or right, with a dark contour so it reads on any picture. "Text on click": only the pin shows until clicked.
 * Sizes follow the grid's tile size, so labels keep their scale with the map.
 */
import { memo, useState } from 'react'
import type { LabelPin, MapGrid, MapLabel } from '../api/types'

const SCALE: Record<MapLabel['size'], number> = { small: 0.26, medium: 0.38, large: 0.56 }
const CONTOUR = 'rgba(0,0,0,0.7)'

/** The label's text size in map px. */
export function labelFont(grid: MapGrid, label: Pick<MapLabel, 'size'>): number {
  return Math.max(8, (grid.type === 'none' ? 64 : grid.size) * SCALE[label.size])
}

/** A pin drawn around (0, 0) with size s; `top` is how far above the point it reaches (for the text). */
export function pinShape(pin: LabelPin, s: number, color: string): { shape: JSX.Element | null; top: number; half: number } {
  const stroke = { stroke: CONTOUR, strokeWidth: s * 0.12, strokeLinejoin: 'round' as const, paintOrder: 'stroke' as const }
  switch (pin) {
    case 'pin': {
      const r = s * 0.42
      const cy = -s * 0.95
      return {
        shape: <g><path d={`M 0 0 C ${-r * 0.35} ${cy + r * 1.2}, ${-r} ${cy + r * 0.55}, ${-r} ${cy} A ${r} ${r} 0 1 1 ${r} ${cy} C ${r} ${cy + r * 0.55}, ${r * 0.35} ${cy + r * 1.2}, 0 0 Z`} fill={color} {...stroke} />
          <circle cx={0} cy={cy} r={r * 0.38} fill="rgba(0,0,0,0.45)" /></g>,
        top: s * 1.4, half: r,
      }
    }
    case 'dot':
      return { shape: <circle r={s * 0.28} fill={color} {...stroke} />, top: s * 0.35, half: s * 0.28 }
    case 'diamond': {
      const d = s * 0.4
      return { shape: <path d={`M 0 ${-d} L ${d * 0.75} 0 L 0 ${d} L ${-d * 0.75} 0 Z`} fill={color} {...stroke} />, top: d, half: d * 0.75 }
    }
    case 'star': {
      const outer = s * 0.48, inner = outer * 0.45
      const points = Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 ? inner : outer
        return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`
      }).join(' ')
      return { shape: <polygon points={points} fill={color} {...stroke} />, top: outer, half: outer }
    }
    case 'flag': {
      const h = s * 1.1, w = s * 0.62
      return {
        shape: <g><line x1={0} y1={0} x2={0} y2={-h} stroke={CONTOUR} strokeWidth={s * 0.16} strokeLinecap="round" />
          <line x1={0} y1={0} x2={0} y2={-h} stroke="#e8e0d0" strokeWidth={s * 0.07} strokeLinecap="round" />
          <path d={`M 0 ${-h} L ${w} ${-h + w * 0.32} L 0 ${-h + w * 0.64} Z`} fill={color} {...stroke} /></g>,
        top: h, half: s * 0.15,
      }
    }
    default:
      return { shape: null, top: 0, half: 0 }
  }
}

export const LabelMarker = memo(function LabelMarker({ grid, label, open, selected, onClick }: {
  grid: MapGrid
  label: MapLabel
  /** Its text shows (always, unless "text on click" and not clicked). */
  open: boolean
  selected?: boolean
  onClick?: () => void
}) {
  const font = labelFont(grid, label)
  const { shape, top, half } = pinShape(label.pin, font * 1.5, label.color)
  const gap = font * 0.35
  const text = label.text && open ? (() => {
    if (label.side === 'left') return { x: -half - gap, y: label.pin === 'pin' || label.pin === 'flag' ? -top * 0.65 : 0, anchor: 'end' as const }
    if (label.side === 'right') return { x: half + gap, y: label.pin === 'pin' || label.pin === 'flag' ? -top * 0.65 : 0, anchor: 'start' as const }
    return { x: 0, y: label.pin === 'none' ? 0 : -top - gap * 0.6, anchor: 'middle' as const }
  })() : null
  return (
    <g className={`map-label ${onClick ? 'clickable' : ''} ${selected ? 'selected' : ''}`} transform={`translate(${label.point[0]} ${label.point[1]})`}
      onPointerDown={(e) => onClick && e.stopPropagation()} onClick={(e) => { if (onClick) { e.stopPropagation(); onClick() } }}>
      {label.text && <title>{label.text}</title>}
      {selected && <circle r={font * 0.9} fill="none" stroke="#fff" strokeDasharray={`${font * 0.2} ${font * 0.15}`} strokeWidth={font * 0.08} />}
      {shape}
      {text && (
        <text x={text.x} y={text.y} dy="0.35em" textAnchor={text.anchor} fontSize={font} fontFamily="Georgia, serif" fontWeight={600}
          fill="#f3ecdc" stroke={CONTOUR} strokeWidth={font * 0.22} strokeLinejoin="round" paintOrder="stroke">{label.text}</text>
      )}
    </g>
  )
})

/** Every label: "text on click" ones open and close on click; `showAll` (the DM's editor) shows every text. */
export default function MapLabels({ grid, labels, showAll = false, selectedId, onSelect }: {
  grid: MapGrid
  labels: MapLabel[]
  showAll?: boolean
  selectedId?: string | null
  onSelect?: (label: MapLabel) => void
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return (
    <g className="map-labels">
      {labels.map((l) => (
        <LabelMarker key={l.id} grid={grid} label={l} open={showAll || !l.on_click || open.has(l.id)} selected={selectedId === l.id}
          onClick={onSelect ? () => onSelect(l) : l.on_click ? () => toggle(l.id) : undefined} />
      ))}
    </g>
  )
}
