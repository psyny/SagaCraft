import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'
import type { LocationMap, PaintCatalogue } from '../../api/types'
import { MapToolButtons, MapToolRow, useMapTools, type MapTools } from '../toolbar/MapTools'
import { rleDecode } from './data'

const catalogue: PaintCatalogue = {
  categories: [{ key: 'ground', name: 'Ground' }, { key: 'trees', name: 'Trees' }, { key: 'roads', name: 'Roads' }, { key: 'settlements', name: 'Settlements' }],
  types: [
    { key: 'ground.grass', kind: 'terrain', category: 'ground', name: 'Grassland', material: 1, roles: ['Ground', 'Strokes', 'Light'], colors: ['#cdc98d', '#8f9a58', '#e6dfb0'] },
    { key: 'trees.pine', kind: 'terrain', category: 'trees', name: 'Pine forest', material: 20, roles: ['Needles', 'Shade', 'Ground'], colors: ['#56744a', '#2c4230', '#a7b27c'] },
    { key: 'road.dirt', kind: 'road', category: 'roads', name: 'Dirt road', material: 50, roles: ['Road', 'Edge', 'Ruts'], colors: ['#c8a676', '#6b4e2e', '#9c7a4e'] },
    { key: 'settlement.castle', kind: 'object', category: 'settlements', name: 'Castle', material: 100, roles: ['Walls', 'Roofs', 'Banners'], colors: ['#b9b2a5', '#58627a', '#b23a3a'], size: 2, variants: 3 },
  ],
}
vi.mock('../../api', () => ({ api: { paintCatalogue: () => Promise.resolve(catalogue), characterGroups: () => Promise.resolve([]) } }))
vi.mock('../../saga/SagaContext', () => ({ useSaga: () => ({ sagaId: 3 }), useOptionalSaga: () => ({ sagaId: 3 }) }))

const base: LocationMap = {
  location: { id: 5, name: 'Barovia' }, version: 1, size: [600, 400],
  grid: { type: 'square', size: 100, x: 0, y: 0, cols: 6, rows: 4, auto: false, unit_size: 5, unit: 'mi', color: '#fff', opacity: 0.5, mode: 'contrast', line: 0.5 },
  links: [], paths: [], regions: [], fog: { enabled: false, layers: {} }, background: '#000000',
  layers: [{ id: 'layer1', name: 'Map', see_through: false }], layer: 'layer1', images: [], paint: null,
  painter: { style: 'storybook', kind: 'world', animated: false },
}

let tools: MapTools
let shown: LocationMap
function Harness({ run, editor = true }: { run: (name: string, args: Record<string, unknown>) => void; editor?: boolean }) {
  const [map, setMap] = useState<LocationMap>(base)
  shown = map
  tools = useMapTools({ map, enabled: true, setMap: editor ? setMap : undefined, run: async (name, args = {}) => { run(name, args); return map } })
  return (
    <>
      <div role="toolbar" aria-label="tools"><MapToolButtons tools={tools} /></div>
      <div role="toolbar" aria-label="row"><MapToolRow tools={tools} /></div>
    </>
  )
}
const ev = (buttons: number) => ({ buttons }) as never // a pointer event: only its buttons are read

describe("the map editor's painter tools (plan 47)", () => {
  it("are the editor's only: a Stage shows none of them", () => {
    render(<Harness run={vi.fn()} editor={false} />)
    expect(screen.queryByRole('button', { name: 'Terrain' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Images' })).not.toBeInTheDocument()
  })

  it('paint terrain with a stroke: shown at once, saved once when released', async () => {
    const run = vi.fn()
    render(<Harness run={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Terrain' }))
    await screen.findByRole('button', { name: 'Type: Grassland' })
    fireEvent.click(screen.getByRole('button', { name: 'Category: Ground' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Trees/ }))
    expect(screen.getByRole('button', { name: 'Type: Pine forest' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Needles' })).toBeInTheDocument() // the type's colours, by their roles
    const onTile = tools.mapProps.onTile!
    act(() => { onTile('down', [0, 0], [50, 50], ev(1)) })
    act(() => { onTile('move', [1, 0], [150, 50], ev(1)) })
    expect([...rleDecode(shown.paint!.tiles, 24)].slice(0, 3)).toEqual([1, 1, 1]) // brush size 2: (0,0) and neighbours
    expect(run).not.toHaveBeenCalled()
    act(() => { onTile('up', [1, 0], [150, 50], ev(0)) })
    expect(run).toHaveBeenCalledTimes(1)
    const [name, args] = run.mock.calls[0]
    expect(name).toBe('paint.tiles')
    expect(args.type).toBe('trees.pine')
    expect(args.colors).toEqual(['#56744a', '#2c4230', '#a7b27c'])
  })

  it("pick what a tile has (the eyedropper), then paint with it; the colours' reset is always there", async () => {
    const run = vi.fn()
    render(<Harness run={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Terrain' }))
    await screen.findByRole('button', { name: 'Type: Grassland' })
    expect(screen.getByRole('button', { name: "The type's own colours" })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Category: Ground' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Trees/ }))
    act(() => { tools.mapProps.onTile!('down', [0, 0], [50, 50], ev(1)) })
    act(() => { tools.mapProps.onTile!('up', [0, 0], [50, 50], ev(0)) })
    fireEvent.click(screen.getByRole('button', { name: 'Category: Trees' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Ground/ }))
    expect(screen.getByRole('button', { name: 'Type: Grassland' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }))
    act(() => { tools.mapProps.onTile!('down', [0, 0], [50, 50], ev(1)) })
    expect(screen.getByRole('button', { name: 'Type: Pine forest' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true')
    expect(shown.paint!.palette).toHaveLength(1) // picking changes nothing
  })

  it('paint roads from tile to tile, and place landmarks', async () => {
    const run = vi.fn()
    render(<Harness run={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Roads & rivers' }))
    await screen.findByRole('button', { name: 'Type: Dirt road' })
    const onTile = tools.mapProps.onTile!
    act(() => { onTile('down', [0, 0], [50, 50], ev(1)) })
    act(() => { onTile('move', [3, 0], [350, 50], ev(1)) }) // fast: the tiles between are joined too
    act(() => { onTile('up', [3, 0], [350, 50], ev(0)) })
    expect(run).toHaveBeenLastCalledWith('paint.connect', expect.objectContaining({ channel: 'road', type: 'road.dirt', erase: false,
      tiles: [[0, 0], [1, 0], [2, 0], [3, 0]] }))
    fireEvent.click(screen.getByRole('button', { name: 'Landmarks' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Type: Castle' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Add a landmark' }))
    act(() => { tools.mapProps.onTile!('down', [2, 1], [250, 150], ev(1)) })
    expect(run).toHaveBeenLastCalledWith('paint.objects.save', { object: { type: 'settlement.castle', tile: [2, 1], size: 2, colors: ['#b9b2a5', '#58627a', '#b23a3a'] } })
  })
})
