import { fireEvent, render } from '@testing-library/react'
import { vi } from 'vitest'
import type { StageSetView } from '../../../api/types'
import { linePath, lineStroke, rectStyle } from './draw'
import PanelsView from './PanelsView'
import { setPanelTool } from './selection'
import type { PanelLine, PanelRect } from './types'

const setCommand = vi.fn(() => Promise.resolve({ sets: [] }))
vi.mock('../../../api', () => ({ api: { setCommand: (...a: unknown[]) => setCommand(...(a as [])) } }))

const rect: PanelRect = { id: 1, kind: 'rect', x: 10, y: 20, w: 200, h: 100, radius: 12,
  fill: { color: '#1b1722', style: 'flat', color2: '#3a3045', angle: 135, opacity: 0.6, effect: 'none', effect_size: 8 }, border: { width: 2, color: '#d6a84e' } }
const line: PanelLine = { id: 2, kind: 'line', points: [[0, 0], [100, 0], [100, 100]], color: '#d6a84e', width: 4, style: 'dashed', radius: 20, opacity: 1 }
const set = { id: 7, type: 'panels', name: 'Panels', x: 0, y: 0, width: 400, height: 300, layer: 1, screen: {}, toolbars: {}, transparent: true,
  content: { shapes: [rect, line] } } as unknown as StageSetView

// jsdom has no PointerEvent: a MouseEvent with a pointer id stands in (coordinates and button come through)
beforeAll(() => {
  if (!('PointerEvent' in window)) {
    (window as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
      pointerId: number
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1 }
    }
  }
})

describe('Panels (plan 60)', () => {
  it("draw a rectangle's fill, border, corners and effect", () => {
    expect(rectStyle(rect)).toMatchObject({ left: 10, top: 20, width: 200, height: 100, borderRadius: 12, background: 'rgba(27, 23, 34, 0.6)', border: '2px solid #d6a84e' })
    expect(rectStyle({ ...rect, fill: { ...rect.fill, style: 'linear' } }).background).toContain('linear-gradient(135deg')
    expect(rectStyle({ ...rect, fill: { ...rect.fill, effect: 'blur', effect_size: 10 } }).backdropFilter).toBe('blur(10px)')
    expect(rectStyle({ ...rect, border: { width: 0, color: '#000000' } }).border).toBe('none')
  })

  it("round a line's corners and draw its style", () => {
    expect(linePath(line.points, 20)).toBe('M0 0 L80 0 Q100 0 100 20 L100 100')
    expect(linePath(line.points, 0)).toBe('M0 0 L100 0 L100 100')
    expect(lineStroke(line).strokeDasharray).toBe('12 8')
    expect(lineStroke({ ...line, style: 'dotted' }).strokeLinecap).toBe('round')
  })

  it('show the shapes in order; in Build, a drag draws a rectangle', () => {
    const { container, rerender } = render(<PanelsView set={set} mode="view" selectedActorId={null} onSelectActor={() => undefined} attention={null} />)
    expect(container.querySelectorAll('.panel-rect')).toHaveLength(1)
    expect(container.querySelectorAll('.panel-line path')).toHaveLength(1)
    const editor = { sagaId: 3, stage: { id: 1 }, apply: vi.fn(), run: async (f: () => Promise<unknown>) => { await f() } } as never
    setPanelTool(7, 'rect')
    rerender(<PanelsView set={set} mode="build" editor={editor} selectedActorId={null} onSelectActor={() => undefined} attention={null} />)
    const box = container.querySelector('.panels-set') as HTMLElement
    box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 260, right: 400, bottom: 260, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    box.setPointerCapture = () => undefined
    fireEvent.pointerDown(box, { button: 0, clientX: 30, clientY: 40, pointerId: 1 })
    fireEvent.pointerMove(box, { clientX: 130, clientY: 120, pointerId: 1 })
    fireEvent.pointerUp(box, { clientX: 130, clientY: 120, pointerId: 1 })
    expect(setCommand).toHaveBeenCalledWith(3, 7, 'shape.save', { shape: { kind: 'rect', x: 30, y: 40, w: 100, h: 80 } })
  })
})
