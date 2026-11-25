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

  it('set the daytime from the tools bar (also on a Stage): shown at once, sent as it changes', () => {
    const run = vi.fn()
    render(<Harness run={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Daytime' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Hour of the day' }), { target: { value: '20' } })
    expect(shown.ambience?.hour).toBe(20)
    expect(run).toHaveBeenLastCalledWith('ambience.set', { changes: { hour: 20 } })
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

  it('show the link under the pointer between two centres; rivers flow the way chosen (plan 51)', async () => {
    const run = vi.fn()
    render(<Harness run={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Routes' }))
    await screen.findByRole('button', { name: 'Type: Dirt road' })
    act(() => { tools.mapProps.onTile!('move', [1, 1], [190, 150], ev(0)) }) // between (1,1) and (2,1)
    expect(tools.mapProps.overlay?.preview?.edges).toEqual([[[150, 150], [250, 150]]])
    act(() => { tools.mapProps.onTile!('move', [1, 1], [152, 152], ev(0)) }) // on a centre: the tile
    expect(tools.mapProps.overlay?.preview).toEqual(expect.objectContaining({ tiles: [[1, 1]], edges: [] }))
    expect(screen.queryByRole('button', { name: /^Flow/ })).not.toBeInTheDocument() // roads don't flow
    fireEvent.click(screen.getByRole('button', { name: 'Category: Roads' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Rivers/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Flow: The way you draw' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Back toward/ }))
    act(() => { tools.mapProps.onTile!('down', [0, 0], [50, 50], ev(1)) })
    act(() => { tools.mapProps.onTile!('move', [1, 0], [150, 50], ev(1)) })
    act(() => { tools.mapProps.onTile!('up', [1, 0], [150, 50], ev(0)) })
    expect(run).toHaveBeenLastCalledWith('paint.connect', expect.objectContaining({ channel: 'river', reverse: true, tiles: [[0, 0], [1, 0]] }))
    expect([...rleDecode(shown.paint!.river_out, 24)].slice(0, 2)).toEqual([0, 16])
  })

  it('put boundaries on the edges a stroke passes over (plan 50): along a grid line, a continuous wall; cliffs turn', async () => {
    const run = vi.fn()
    render(<Harness run={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Boundaries' }))
    await screen.findByRole('button', { name: 'Type: Castle wall' })
    expect(screen.queryByRole('button', { name: 'Turn' })).not.toBeInTheDocument() // walls have no high side
    const onTile = tools.mapProps.onTile!
    // the edge under the pointer shows
    act(() => { onTile('move', [1, 1], [195, 150], ev(0)) })
    expect(tools.mapProps.overlay?.preview?.edges).toEqual([[[200, 100], [200, 200]]])
    // along the line between rows 0 and 1, fast: every edge on the way
    act(() => { onTile('down', [0, 1], [10, 102], ev(1)) })
    act(() => { onTile('move', [3, 1], [390, 102], ev(1)) })
    expect([...rleDecode(shown.paint!.bounds_1, 24)].slice(0, 6)).toEqual([1, 1, 1, 1, 0, 0])
    expect(run).not.toHaveBeenCalled()
    act(() => { onTile('up', [3, 1], [390, 102], ev(0)) })
    expect(run).toHaveBeenLastCalledWith('paint.boundaries', expect.objectContaining({ type: 'wall.castle',
      edges: [[0, 1, 6], [1, 1, 6], [2, 1, 6], [3, 1, 6]] }))
    // a cliff: Turn, a click on its edge
    fireEvent.click(screen.getByRole('button', { name: 'Category: Walls' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Cliffs/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Turn' }))
    act(() => { tools.mapProps.onTile!('down', [1, 0], [150, 97], ev(1)) })
    act(() => { tools.mapProps.onTile!('up', [1, 0], [150, 97], ev(0)) })
    expect(run).toHaveBeenLastCalledWith('paint.boundaries.turn', { edges: [[1, 0, 2]] })
  })
})
