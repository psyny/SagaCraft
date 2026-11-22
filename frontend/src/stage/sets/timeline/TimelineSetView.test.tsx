import { render, screen } from '@testing-library/react'
import type { StageSetView } from '../../../api/types'
import TimelineSetView from './TimelineSetView'
import type { TimelineContent } from './types'

const calendar = { preset: 'twelve_moons', name: 'Twelve Moons', real: false, year_label: '', months: Array.from({ length: 12 }, (_, i) => ({ name: `M${i + 1}`, days: 30 })) }
const event = (id: number, name: string, date: number) => ({
  id, kind: 'event', type: 'event', name, date, end: null, attributes: { description: `What ${name} was` }, editable: [], updated_at: null,
  created_by: 1, sub_events: [], relationships: [],
})
const content = (c: Partial<TimelineContent>): TimelineContent => ({
  events: [], eras: [], calendar, today: 3000101, from: null, to: null, expanded: false,
  types: [{ key: 'event', name: 'Event', text: 'description' }], ...c,
})
const set = (c: TimelineContent) => ({ id: 1, type: 'timeline', name: 'History', x: 0, y: 0, width: 900, height: 400, layer: 1, content: c }) as unknown as StageSetView

describe('the Timeline Set', () => {
  it('says when there is nothing to show', () => {
    render(<TimelineSetView set={set(content({}))} mode="view" selectedActorId={null} onSelectActor={() => undefined} attention={null} />)
    expect(screen.getByText(/No events to show/)).toBeTruthy()
  })
  it('draws the events, zoomable inside the Set', () => {
    const { container } = render(<TimelineSetView set={set(content({ events: [event(1, 'The siege', 3000101) as never], expanded: true }))} mode="view" selectedActorId={null} onSelectActor={() => undefined} attention={null} />)
    expect(container.querySelector('.timeline-set[data-wheel]')).toBeTruthy()
  })
})
