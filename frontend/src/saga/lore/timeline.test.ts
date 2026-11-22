import type { Calendar, Era, EventView, Relationship, RelationshipType, SagaOverview } from '../../api/types'
import { clampDate, daysIn, formatDate, formatSpan, joinDate, splitDate } from './dates'
import { edgeBends } from './graph/RelationshipGraph'
import { clusterLinks, fitInside, hull, layoutGraph, separate } from './graph/layout'
import { readFrom, suggestTypes, writableGroups } from './relationships'
import { erasAt, filterEvents, timelineRows } from './TimelinePage'

const moons: Calendar = { preset: 'twelve_moons', name: 'Twelve Moons', real: false, year_label: '',
  months: ['Frostmoon', 'Thawmoon', 'Seedmoon'].map((name) => ({ name, days: 30 })) }
const real: Calendar = { preset: 'gregorian', name: 'Gregorian', real: true, year_label: 'AD',
  months: [{ name: 'January', days: 31 }, { name: 'February', days: 28 }] }

describe('in-world dates', () => {
  it('pack year, month and day into one sortable number, negative years too', () => {
    expect(joinDate(300, 3, 12)).toBe(3000312)
    expect(splitDate(3000312)).toEqual({ year: 300, month: 3, day: 12 })
    expect(splitDate(joinDate(-5, 2, 7))).toEqual({ year: -5, month: 2, day: 7 })
    expect(joinDate(-1, 12, 30) < joinDate(0, 1, 1)).toBe(true)
  })
  it('read with the calendar: names, leap years, a year label, "always"', () => {
    expect(formatDate(moons, joinDate(300, 3, 12))).toBe('12 Seedmoon 300')
    expect(formatDate(real, joinDate(2024, 2, 29))).toBe('29 February 2024 AD')
    expect(formatDate(moons, null)).toBe('always')
    expect(daysIn(real, 2024, 2)).toBe(29)
    expect(daysIn(real, 2023, 2)).toBe(28)
    expect(clampDate(real, 2023, 2, 31)).toBe(joinDate(2023, 2, 28))
    expect(formatSpan(moons, joinDate(1, 1, 1), null)).toBe('since 1 Frostmoon 1')
    expect(formatSpan(moons, null, null)).toBe('')
  })
})

const ev = (id: number, date: number | null, extra: Partial<EventView> = {}) => ({
  id, kind: 'event', type: 'event', name: `E${id}`, attributes: {}, editable: [], updated_at: null, date, created_by: 1,
  sub_events: [], relationships: [], ...extra,
}) as EventView

describe('the timeline', () => {
  const eras: Era[] = [{ id: 1, name: 'War', start: joinDate(299, 1, 1), end: joinDate(300, 6, 1), color: '#aa0000', note: '' }]
  it('orders events, era edges and today under year headings', () => {
    const rows = timelineRows([ev(1, joinDate(300, 2, 1)), ev(2, joinDate(299, 5, 5))], eras, joinDate(300, 2, 1))
    expect(rows.map((r) => r.kind === 'year' ? `y${r.year}` : r.kind === 'era' ? `era-${r.edge}` : r.kind === 'event' ? `e${r.event.id}` : 'today'))
      .toEqual(['y299', 'era-start', 'e2', 'y300', 'today', 'e1', 'era-end'])
  })
  it('knows the eras running at a date, open ones too', () => {
    expect(erasAt(eras, joinDate(299, 6, 1)).map((e) => e.id)).toEqual([1])
    expect(erasAt(eras, joinDate(301, 1, 1))).toEqual([])
    expect(erasAt([{ ...eras[0], end: null }], joinDate(900, 1, 1)).length).toBe(1)
  })
  it('filters by name, type, a resource involved and who made it', () => {
    const rel = { from: { id: 7 }, to: { id: 8 } } as Relationship
    const list = [ev(1, 1, { name: 'Siege', type: 'battle' }), ev(2, 2, { relationships: [rel], created_by: 2 }), ev(3, 3, { attributes: { involved: [9] } })]
    const roleOf = (id: number | null) => (id === 1 ? 'admin' : 'player')
    const f = { query: '', type: null, resourceId: null, creator: 'all' as const }
    expect(filterEvents(list, { ...f, query: 'sie' }, roleOf).map((e) => e.id)).toEqual([1])
    expect(filterEvents(list, { ...f, type: 'battle' }, roleOf).map((e) => e.id)).toEqual([1])
    expect(filterEvents(list, { ...f, resourceId: 8 }, roleOf).map((e) => e.id)).toEqual([2])
    expect(filterEvents(list, { ...f, resourceId: 9 }, roleOf).map((e) => e.id)).toEqual([3])
    expect(filterEvents(list, { ...f, creator: 'players' }, roleOf).map((e) => e.id)).toEqual([2])
  })
})

describe('relationships', () => {
  const killed: RelationshipType = { ref: 'killed', id: null, group_id: null, label: 'killed', inverse: 'killed by', directed: true,
    from_kinds: ['character'], to_kinds: ['character'], predefined: true }
  const livesIn: RelationshipType = { ...killed, ref: 'lives_in', label: 'lives in', inverse: 'home of', to_kinds: ['location'] }
  const framed: RelationshipType = { ...killed, ref: 'c4', id: 4, group_id: 2, label: 'framed', inverse: '', predefined: false }
  it('read from either side', () => {
    const rel = { type: killed, from: { id: 1, name: 'Aldric' }, to: { id: 2, name: 'Bram' } } as Relationship
    expect(readFrom(rel, 1).verb).toBe('killed')
    expect(readFrom(rel, 2)).toMatchObject({ verb: 'killed by', other: { name: 'Aldric' } })
    expect(readFrom({ ...rel, type: { ...killed, directed: false } }, 2).verb).toBe('killed')
  })
  it('suggest types: recent first, then those fitting the kinds; only the group\'s own', () => {
    const types = [killed, livesIn, framed]
    expect(suggestTypes(types, '', 2, ['c4'], 'character', 'location').map((t) => t.ref)).toEqual(['c4', 'lives_in', 'killed'])
    expect(suggestTypes(types, '', 3, [], 'character', 'character').map((t) => t.ref)).toEqual(['killed', 'lives_in'])
    expect(suggestTypes(types, 'home', 2, []).map((t) => t.ref)).toEqual(['lives_in'])
  })
  it('players write in their own groups, viewers nowhere', () => {
    const groups = [{ id: 1, key: 'admins' }, { id: 2, key: 'players' }, { id: 3, key: null }] as SagaOverview['groups']
    const saga = (role: string, ids: number[]) => ({ me: { role, group_ids: ids, member_id: 1 }, groups }) as unknown as SagaOverview
    expect(writableGroups(saga('admin', [1])).map((g) => g.id)).toEqual([1, 2, 3])
    expect(writableGroups(saga('player', [2, 3])).map((g) => g.id)).toEqual([2, 3])
    expect(writableGroups(saga('viewer', [3]))).toEqual([])
  })
})

describe('the graph drawing', () => {
  it('lays nodes out the same way every time, inside the drawing, placed ones kept', () => {
    const ids = ['r1', 'r2', 'r3', 'r4']
    const edges: [string, string][] = [['r1', 'r2'], ['r2', 'r3']]
    const a = layoutGraph(ids, edges, { r4: [0.1, 0.9] })
    expect(layoutGraph([...ids].reverse(), edges, { r4: [0.1, 0.9] })).toEqual(a)
    expect(a.r4).toEqual([0.1, 0.9])
    for (const id of ids) for (const v of a[id]) expect(v >= 0 && v <= 1).toBe(true)
    const d = (p: string, q: string) => Math.hypot(a[p][0] - a[q][0], a[p][1] - a[q][1])
    expect(d('r1', 'r2')).toBeLessThan(d('r1', 'r3'))
  })
  it('keeps free nodes at 60% of the drawing apart, placed ones where they are', () => {
    const a = fitInside({ r1: [0, 0.5], r2: [1, 0.5], r3: [0.9, 0.9] }, { r3: [0.9, 0.9] })
    expect(a.r2[0] - a.r1[0]).toBeCloseTo(0.9 * 0.6) // filling would be 0.9 of the drawing
    expect((a.r1[0] + a.r2[0]) / 2).toBeCloseTo(0.5)
    expect(a.r3).toEqual([0.9, 0.9])
  })
  it('pushes nodes that would touch just apart, placed ones staying put', () => {
    const out = separate({ a: { x: 100, y: 100 }, b: { x: 130, y: 100 }, c: { x: 400, y: 400 }, p: { x: 400, y: 440 } }, 100, new Set(['p']))
    expect(Math.hypot(out.b.x - out.a.x, out.b.y - out.a.y)).toBeCloseTo(100)
    expect((out.a.x + out.b.x) / 2).toBeCloseTo(115) // both moved, evenly
    expect(out.p).toEqual({ x: 400, y: 440 })
    expect(out.c.y).toBeCloseTo(340) // the free one moved the whole way
  })
  it('wraps a cluster: the hull of its points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }]
    expect(hull(pts)).toHaveLength(4) // the middle one is inside
    expect(hull([{ x: 1, y: 1 }, { x: 4, y: 2 }])).toHaveLength(2)
  })
  it('pulls a cluster together: members to their parent (when shown), else to the first member', () => {
    expect(clusterLinks([{ id: 'r1' }, { id: 'r2', group: 'r1' }, { id: 'r3', group: 'r1' }])).toEqual([['r2', 'r1'], ['r3', 'r1']])
    expect(clusterLinks([{ id: 'r2', group: 'r9' }, { id: 'r3', group: 'r9' }])).toEqual([['r3', 'r2']])
  })
  it('bends parallel links apart, whichever way they go', () => {
    const e = (id: string, from: string, to: string) => ({ id, from, to }) as never
    const bends = edgeBends([e('a', 'r1', 'r2'), e('b', 'r2', 'r1'), e('c', 'r1', 'r3'), e('d', 'r1', 'r3')])
    expect(bends).toMatchObject({ c: -28, d: 28 }) // same way: opposite bends
    // b runs the other way: a bend is measured from its own start, so the same number is the other side
    expect(bends.a).toBe(-28)
    expect(bends.b).toBe(-28)
  })
})
