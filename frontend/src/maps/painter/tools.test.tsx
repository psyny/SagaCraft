import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'
import type { LocationMap } from '../../api/types'
import { MapToolButtons, MapToolRow, useMapTools, type MapTools } from '../toolbar/MapTools'
import { rleDecode } from './data'
import { TEST_PACK } from './testPack'

vi.mock('../../api', () => ({ api: { paintPack: () => Promise.resolve(TEST_PACK), characterGroups: () => Promise.resolve([]) } }))
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
const stroke = (tiles: [number, number][]) => {
  act(() => { tools.mapProps.onTile!('down', tiles[0], [50, 50], ev(1)) })
  for (const t of tiles.slice(1)) act(() => { tools.mapProps.onTile!('move', t, [t[0] * 100 + 50, t[1] * 100 + 50], ev(1)) })
  act(() => { tools.mapProps.onTile!('up', tiles[tiles.length - 1], [50, 50], ev(0)) })
}

describe("the map editor's painter tools (plans 47, 48)", () => {
  it("are the editor's only, one per layer: a Stage shows none of them", () => {
    render(<Harness run={vi.fn()} editor={false} />)
    for (const name of ['Images', 'Terrain', 'Routes', 'Scenery', 'Features']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('paint terrain with a stroke: shown at once, saved once when released', async () => {
    const run = vi.fn()
    render(<Harness run={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Terrain' }))
    await screen.findByRole('button', { name: 'Type: Grassland' })
    fireEvent.click(screen.getByRole('button', { name: 'Category: Ground' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Water/ }))
    expect(screen.getByRole('button', { name: 'Type: Lake' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shoreline' })).toBeInTheDocument() // the type's colours, by their roles
    const onTile = tools.mapProps.onTile!
    act(() => { onTile('down', [0, 0], [50, 50], ev(1)) })
    act(() => { onTile('move', [1, 0], [150, 50], ev(1)) })
    expect([...rleDecode(shown.paint!.tiles, 24)].slice(0, 3)).toEqual([1, 1, 1]) // brush size 2: (0,0) and neighbours
    expect(run).not.toHaveBeenCalled()
    act(() => { onTile('up', [1, 0], [150, 50], ev(0)) })
    expect(run).toHaveBeenCalledTimes(1)
    const [name, args] = run.mock.calls[0]
    expect(name).toBe('paint.tiles')
    expect(args.type).toBe('water.lake')
    expect(args.colors).toEqual(['#93c2d1', '#5f93a8', '#d6c79e'])
  })

  it("pick what a tile has (the eyedropper), then paint with it; the colours' reset is always there", async () => {
    render(<Harness run={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Terrain' }))
    await screen.findByRole('button', { name: 'Type: Grassland' })
    expect(screen.getByRole('button', { name: "The type's own colours" })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Category: Ground' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Water/ }))
    stroke([[0, 0]])
    fireEvent.click(screen.getByRole('button', { name: 'Category: Water' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Ground/ }))
    expect(screen.getByRole('button', { name: 'Type: Grassland' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }))
    act(() => { tools.mapProps.onTile!('down', [0, 0], [50, 50], ev(1)) })
    expect(screen.getByRole('button', { name: 'Type: Lake' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true')
    expect(shown.paint!.palette).toHaveLength(1) // picking changes nothing
  })

  it('paint scenery over the terrain, routes from tile to tile, and place features', async () => {
    const run = vi.fn()
    render(<Harness run={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Scenery' }))
    await screen.findByRole('button', { name: 'Type: Pine forest' })
    stroke([[2, 2]])
    expect(run).toHaveBeenLastCalledWith('paint.scenery', expect.objectContaining({ type: 'trees.pine' }))
    expect([...rleDecode(shown.paint!.scenery, 24)][2 * 6 + 2]).toBe(1)
    expect(shown.paint!.tiles).toBe('') // the terrain under it untouched
    fireEvent.click(screen.getByRole('button', { name: 'Routes' }))
    await screen.findByRole('button', { name: 'Type: Dirt road' })
    const onTile = tools.mapProps.onTile!
    act(() => { onTile('down', [0, 0], [50, 50], ev(1)) })
    act(() => { onTile('move', [3, 0], [350, 50], ev(1)) }) // fast: the tiles between are joined too
    act(() => { onTile('up', [3, 0], [350, 50], ev(0)) })
    expect(run).toHaveBeenLastCalledWith('paint.connect', expect.objectContaining({ channel: 'road', type: 'road.dirt', erase: false,
      tiles: [[0, 0], [1, 0], [2, 0], [3, 0]] }))
    fireEvent.click(screen.getByRole('button', { name: 'Features' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Type: Windmill' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Add a feature' }))
    act(() => { tools.mapProps.onTile!('down', [2, 1], [250, 150], ev(1)) })
    expect(run).toHaveBeenLastCalledWith('paint.features.save', { feature: { type: 'feature.windmill', tile: [2, 1], size: 1, colors: ['#e6d8b8', '#8a6a4a', '#8a4a3a'] } })
  })
})
