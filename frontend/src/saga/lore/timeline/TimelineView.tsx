/**
 * The horizontal timeline (Lore → Events, "Timeline"). The line runs through the middle with ticks (days, months
 * or years, by zoom). Events are circles in their type's colour, periods (an event with an end) are bars; ones
 * that would touch pile up. Eras colour the line (two colours, alternating), with a long tick where each begins
 * and ends. Events start collapsed: click one (or "Expand all") for a dashed line up to a box with its title,
 * dates and a bit of what happened, beside the line where it fits (a period's box covers the period); click the
 * box for the whole event. Wheel zooms, drag pans; the minimap under it shows the whole timeline and where the
 * view is (click or drag it to move). See docs/concepts/events.md ("Timeline").
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Calendar, Era, EventView } from '../../../api/types'
import ResourceIcon from '../../../components/ResourceIcon'
import { formatDate, formatEventDate } from '../dates'
import { eventDescription } from '../EventLines'
import {
  clampView, DOT_R, dayNumber, firstView, placeBoxes, rangeOf, stackMarks, ticksFor, zoomView, type Mark, type View,
} from './scale'

/** Event types' colours, in the template's order. */
export const TYPE_COLORS = ['#d6a84a', '#e2604f', '#5bb98c', '#6fa8e0', '#b07fd6', '#e08c4f', '#4fc1c9', '#c9c34f']
/** Eras along the line: two colours, alternating. */
export const ERA_COLORS = ['#c9a25a', '#5f9fc4']

export const typeColor = (types: string[], key: string) => TYPE_COLORS[Math.max(0, types.indexOf(key)) % TYPE_COLORS.length]

const LANE_H = 24
const BOX_H = 100
const ROW_H = BOX_H + 12
const TOP = 30
const BELOW = 70
const MIN_H = 300
const MINI_H = 48

interface Props {
  calendar: Calendar
  events: EventView[]
  eras: Era[]
  /** Today in the story. */
  today: number
  /** The moment in the story: later events dim. */
  moment: number | null
  /** The dates asked for (filters): the timeline covers exactly them. */
  from: number | null
  to: number | null
  /** Event type keys, in order (colours). */
  types: string[]
  typeAttrs: (type: string) => { key: string; type: string }[] | undefined
  /** Clicking a box opens the whole event; without it (a Stage), it collapses the box. */
  onOpen?: (event: EventView) => void
  onEra?: (era: Era) => void
  /** Events start expanded (and new ones too). */
  startExpanded?: boolean
}

interface Item { e: EventView; d0: number; d1: number | null }

export default function TimelineView({ calendar: cal, events, eras, today, moment, from, to, types, typeAttrs, onOpen, onEra, startExpanded = false }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [view, setView] = useState<View | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const pan = useRef<{ x: number; start: number } | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(el)
    return () => observer?.disconnect()
  }, [])

  const day = (date: number) => dayNumber(cal, date)
  const items: Item[] = useMemo(() => events.filter((e) => e.date !== null).map((e) => ({
    e, d0: dayNumber(cal, e.date!), d1: e.end !== null && e.end !== undefined && e.end > e.date! ? dayNumber(cal, e.end) + 1 : null,
  })), [events, cal])
  const expandKey = startExpanded ? items.map((i) => i.e.id).join(',') : ''
  useEffect(() => {
    if (startExpanded) setExpanded(new Set(items.map((i) => i.e.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startExpanded, expandKey])
  const range = useMemo(() => {
    const days = items.flatMap((i) => (i.d1 === null ? [i.d0] : [i.d0, i.d1]))
    for (const era of eras) days.push(dayNumber(cal, era.start), ...(era.end !== null ? [dayNumber(cal, era.end)] : []))
    days.push(dayNumber(cal, today))
    return rangeOf(days, from === null ? null : dayNumber(cal, from), to === null ? null : dayNumber(cal, to))
  }, [items, eras, today, from, to, cal])

  // The first view: around today and the events nearest it (firstView); the whole range when
  // the dates asked for change
  const rangeKey = `${from}|${to}`
  const shownKey = useRef<string | null>(null)
  useEffect(() => {
    if (!width) return
    if (shownKey.current !== rangeKey || !view) {
      shownKey.current = rangeKey
      const t = dayNumber(cal, today)
      const asked = from !== null || to !== null
      setView(asked || t < range[0] || t > range[1]
        ? clampView({ start: range[0], ppd: width / (range[1] - range[0]) }, range, width)
        : firstView(items.map((i) => i.d0), t, range, width))
    } else {
      setView((v) => (v ? clampView(v, range, width) : v))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, range, rangeKey])

  // Wheel: zoom around the pointer; sideways (or with Shift) pans
  const viewRef = useRef(view)
  viewRef.current = view
  const rangeRef = useRef(range)
  rangeRef.current = range
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current
      // Over the timeline's line only (the tools and the minimap scroll the page as usual)
      if (!v || !(e.target as HTMLElement).closest?.('.tl-track')) return
      e.preventDefault()
      const w = el.clientWidth
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey
      if (sideways) {
        const d = (e.deltaX || e.deltaY) / v.ppd
        setView(clampView({ ...v, start: v.start + d }, rangeRef.current, w))
      } else {
        const px = e.clientX - el.getBoundingClientRect().left
        setView(zoomView(v, Math.exp(-e.deltaY * 0.0015), px, rangeRef.current, w))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  if (!view || !width) return <div className="tl-view" ref={box}><div className="tl-track" style={{ height: MIN_H }} /></div>

  const end = view.start + width / view.ppd
  const x = (d: number) => (d - view.start) * view.ppd
  const margin = 400 / view.ppd
  const visible = items.filter((i) => (i.d1 ?? i.d0 + 1) >= view.start - margin && i.d0 <= end + margin)
  const marks: Mark[] = visible.map((i) => (i.d1 === null
    ? { id: i.e.id, x0: x(i.d0 + 0.5), x1: x(i.d0 + 0.5), span: false }
    : { id: i.e.id, x0: x(i.d0), x1: Math.max(x(i.d1), x(i.d0) + 2 * DOT_R), span: true }))
  const markOf = new Map(marks.map((m) => [m.id, m]))
  const lanes = stackMarks(marks)
  const topLane = Math.max(0, ...lanes.values())
  const boxes = placeBoxes(marks.filter((m) => expanded.has(m.id)), width)
  const rows = boxes.length ? Math.max(...boxes.map((b) => b.row)) + 1 : 0
  const stackH = topLane * LANE_H + DOT_R + 6
  const axisY = Math.max(MIN_H / 2, TOP + rows * ROW_H + stackH + 16)
  const height = axisY + BELOW
  const laneY = (l: number) => axisY - l * LANE_H
  const boxBottom = (row: number) => axisY - stackH - 14 - row * ROW_H
  const ticks = ticksFor(cal, view.start, end, view.ppd)
  const sortedEras = [...eras].sort((a, b) => a.start - b.start || a.id - b.id)
  const eraSpan = (era: Era): [number, number] => [day(era.start), era.end !== null ? day(era.end) + 1 : range[1]]
  const momentDay = moment === null ? null : day(moment)
  const todayX = x(day(today) + 0.5)
  const later = (i: Item) => momentDay !== null && i.d0 > momentDay
  const color = (e: EventView) => typeColor(types, e.type)
  const toggle = (id: number) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allOpen = items.length > 0 && items.every((i) => expanded.has(i.e.id))

  const startPan = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    pan.current = { x: e.clientX, start: view.start }
  }
  const movePan = (e: ReactPointerEvent) => {
    const p = pan.current
    if (p) setView(clampView({ ...view, start: p.start - (e.clientX - p.x) / view.ppd }, range, width))
  }
  const zoomBy = (f: number) => setView(zoomView(view, f, width / 2, range, width))
  const fit = () => setView(clampView({ start: range[0], ppd: width / (range[1] - range[0]) }, range, width))
  const centreOn = (d: number) => setView(clampView({ ...view, start: d - width / view.ppd / 2 }, range, width))

  // Minimap: the whole range
  const mppd = width / (range[1] - range[0])
  const mx = (d: number) => (d - range[0]) * mppd
  const miniMove = (e: ReactPointerEvent) => {
    if (e.type === 'pointermove' && !e.buttons) return
    const px = e.clientX - (e.currentTarget as Element).getBoundingClientRect().left
    centreOn(range[0] + px / mppd)
  }

  return (
    <div className="tl-view" ref={box}>
      <div className="tl-tools">
        <button className="small" onClick={() => setExpanded(allOpen ? new Set() : new Set(items.map((i) => i.e.id)))}>
          {allOpen ? '▾ Collapse all' : '▸ Expand all'}
        </button>
        <span className="spacer" />
        <button className="small ghost" onClick={() => centreOn(day(today))} title="Centre on today in the story">◉ Today</button>
        <div className="tl-zoom">
          <button className="small" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.5)}>−</button>
          <button className="small" onClick={fit} title="The whole timeline">Fit</button>
          <button className="small" aria-label="Zoom in" onClick={() => zoomBy(1.5)}>＋</button>
        </div>
      </div>
      <div className="tl-track" style={{ height }} onPointerDown={startPan} onPointerMove={movePan}
        onPointerUp={() => { pan.current = null }} onPointerCancel={() => { pan.current = null }}>
        <svg width={width} height={height} className="tl-svg">
          {/* today and the moment */}
          {todayX >= 0 && todayX <= width && (
            <g className="tl-today-line">
              <line x1={todayX} x2={todayX} y1={14} y2={height - 6} />
              <text x={todayX + 4} y={22}>Today</text>
            </g>
          )}
          {momentDay !== null && x(momentDay + 1) >= 0 && x(momentDay + 1) <= width && (
            <g className="tl-moment-line">
              <line x1={x(momentDay + 1)} x2={x(momentDay + 1)} y1={14} y2={height - 6} />
              <text x={x(momentDay + 1) + 4} y={36}>Moment</text>
            </g>
          )}
          {/* the line, eras on it */}
          <line className="tl-axis" x1={0} x2={width} y1={axisY} y2={axisY} />
          {sortedEras.map((era, i) => {
            const [a, b] = eraSpan(era)
            if (b < view.start || a > end) return null
            const c = ERA_COLORS[i % 2]
            return (
              <g key={era.id} className="tl-era">
                <rect x={x(a)} y={axisY - 3} width={Math.max(2, x(b) - x(a))} height={6} rx={3} style={{ fill: c }} />
                <line x1={x(a)} x2={x(a)} y1={axisY - 20} y2={axisY + 20} style={{ stroke: c }} />
                {era.end !== null && <line x1={x(b)} x2={x(b)} y1={axisY - 20} y2={axisY + 20} style={{ stroke: c }} />}
              </g>
            )
          })}
          {ticks.map((t) => (
            <g key={t.day} className={`tl-tick ${t.major ? 'major' : ''}`}>
              <line x1={x(t.day)} x2={x(t.day)} y1={axisY - (t.major ? 9 : 5)} y2={axisY + (t.major ? 9 : 5)} />
              <text x={x(t.day)} y={axisY + 26}>{t.label}</text>
            </g>
          ))}
          {/* expanded: a dashed line up to the box */}
          {boxes.map((b) => {
            const m = markOf.get(b.id)!
            const lx = m.span ? m.x0 + DOT_R : m.x0
            return <line key={b.id} className="tl-stem" x1={lx} x2={lx} y1={laneY(lanes.get(b.id) ?? 0) - DOT_R} y2={boxBottom(b.row)} />
          })}
          {visible.map((i) => {
            const m = markOf.get(i.e.id)!
            const y = laneY(lanes.get(i.e.id) ?? 0)
            const open = expanded.has(i.e.id)
            const label = `${i.e.name ?? '???'} · ${formatEventDate(cal, i.e.date, i.e.end)}`
            return (
              <g key={i.e.id} className={`tl-mark ${open ? 'open' : ''} ${later(i) ? 'later' : ''}`} role="button" tabIndex={0} aria-label={label}
                aria-expanded={open} onPointerDown={(e) => e.stopPropagation()} onClick={() => toggle(i.e.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle(i.e.id)}>
                <title>{label}</title>
                {m.span
                  ? <rect x={m.x0} y={y - 8} width={m.x1 - m.x0} height={16} rx={8} style={{ fill: color(i.e) }} />
                  : <circle cx={m.x0} cy={y} r={DOT_R} style={{ fill: color(i.e) }} />}
              </g>
            )
          })}
        </svg>
        {/* era names under the line */}
        {sortedEras.map((era) => {
          const [a, b] = eraSpan(era)
          if (b < view.start || a > end) return null
          return (
            <button key={era.id} className="tl-era-name" style={{ left: Math.max(4, x(a) + 4), top: axisY + 38 }}
              onPointerDown={(e) => e.stopPropagation()} onClick={() => onEra?.(era)} disabled={!onEra}
              title={`${era.name}: ${formatDate(cal, era.start)} – ${era.end === null ? 'still going' : formatDate(cal, era.end)}${era.note ? ` · ${era.note}` : ''}`}>
              {era.name}
            </button>
          )
        })}
        {boxes.map((b) => {
          const it = visible.find((i) => i.e.id === b.id)!
          const e = it.e
          const text = eventDescription(e, typeAttrs(e.type))
          return (
            <div key={b.id} className={`tl-box side-${b.side} ${later(it) ? 'later' : ''}`} role="button" tabIndex={0}
              style={{ left: b.left, top: boxBottom(b.row) - BOX_H, width: b.width, height: BOX_H, borderColor: color(e) }}
              onPointerDown={(ev) => ev.stopPropagation()} onClick={() => (onOpen ? onOpen(e) : toggle(e.id))}
              onKeyDown={(ev) => ev.key === 'Enter' && (onOpen ? onOpen(e) : toggle(e.id))}>
              <div className="tl-box-head">
                <ResourceIcon resource={e} className="tl-icon round" />
                <strong>{e.name ?? '???'}</strong>
                <button className="tl-box-close small ghost" aria-label="Collapse" onClick={(ev) => { ev.stopPropagation(); toggle(e.id) }}>–</button>
              </div>
              <span className="tl-box-date">{formatEventDate(cal, e.date, e.end)}</span>
              {text && <span className="tl-box-text">{text}</span>}
            </div>
          )
        })}
      </div>
      {/* the whole timeline, and where the view is */}
      <svg className="tl-mini" width={width} height={MINI_H} onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); miniMove(e) }}
        onPointerMove={miniMove} role="slider" aria-label="Where the view is on the whole timeline" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(((view.start - range[0]) / (range[1] - range[0])) * 100)}>
        <line className="tl-mini-axis" x1={0} x2={width} y1={30} y2={30} />
        {sortedEras.map((era, i) => {
          const [a, b] = eraSpan(era)
          return <rect key={era.id} x={mx(a)} y={28} width={Math.max(1, mx(b) - mx(a))} height={4} style={{ fill: ERA_COLORS[i % 2] }} className="tl-mini-era" />
        })}
        {items.map((i) => (i.d1 === null
          ? <circle key={i.e.id} cx={mx(i.d0 + 0.5)} cy={18} r={2.5} style={{ fill: color(i.e) }} className="tl-mini-mark" />
          : <rect key={i.e.id} x={mx(i.d0)} y={16} width={Math.max(2, mx(i.d1) - mx(i.d0))} height={4} rx={2} style={{ fill: color(i.e) }} className="tl-mini-mark" />))}
        <line className="tl-mini-today" x1={mx(day(today) + 0.5)} x2={mx(day(today) + 0.5)} y1={6} y2={MINI_H - 6} />
        <rect className="tl-mini-view" x={mx(view.start)} y={2} width={Math.max(4, (width / view.ppd) * mppd)} height={MINI_H - 4} rx={4} />
      </svg>
    </div>
  )
}
