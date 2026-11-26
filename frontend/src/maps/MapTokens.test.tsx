import { fireEvent, render } from '@testing-library/react'
import { vi } from 'vitest'
import type { MapGrid, MapToken } from '../api/types'
import { MapTokens } from './MapTokens'
import { moveByOptions } from './tools/TokensTool'

const grid = { type: 'square', size: 50, cols: 6, rows: 4, x: 0, y: 0 } as unknown as MapGrid
const token = (id: string, tile: [number, number], movable?: boolean): MapToken =>
  ({ id, kind: 'custom', tile, size: 1, name: id, icon: null, color: '#000000', style: 'gradient', movable })

describe('Map tokens (plan 58)', () => {
  it('drag only the tokens you may move', () => {
    const { container } = render(<svg><MapTokens grid={grid} mapId={1} tokens={[token('a', [0, 0], true), token('b', [1, 0], false)]}
      onMove={vi.fn()} canMove={(t) => Boolean(t.movable)} onPick={vi.fn()} /></svg>)
    const [a, b] = [...container.querySelectorAll('.map-token')]
    expect(a.classList.contains('draggable')).toBe(true)
    expect(b.classList.contains('draggable')).toBe(false)
    expect(b.classList.contains('pickable')).toBe(true)
  })

  it("draw the move's arrow, from where it was to where it would land", () => {
    const { container } = render(<svg><MapTokens grid={grid} mapId={1} tokens={[token('a', [0, 0])]} remote={{ a: { tile: [3, 2], live: true } }} /></svg>)
    const line = container.querySelector('.map-token-arrow-line')!
    expect(line).not.toBeNull()
    expect([line.getAttribute('x1'), line.getAttribute('y1')]).toEqual(['25', '25']) // the centre of where it was
    expect(container.querySelector('.map-token-arrow-head')!.getAttribute('points')!.startsWith('175,125')).toBe(true) // its tip: where it lands
    fireEvent.pointerLeave(container.querySelector('.map-token')!)
  })

  it("offer 'its players' only where a token has them (a character's, an item's)", () => {
    expect(moveByOptions({ kind: 'character' }).map(([k]) => k)).toEqual(['dm', 'players', 'owners', 'anyone'])
    expect(moveByOptions({ kind: 'custom' }).map(([k]) => k)).toEqual(['dm', 'players', 'anyone'])
  })
})
