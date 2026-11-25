import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { vi } from 'vitest'
import type { LocationMap, MapPath } from '../../api/types'
import { MapToolButtons, MapToolRow, useMapTools } from './MapTools'

vi.mock('../../api', () => ({ api: { characterGroups: () => Promise.resolve([]), resources: () => Promise.resolve([]) } }))
vi.mock('../../saga/SagaContext', () => ({ useSaga: () => ({ sagaId: 3 }), useOptionalSaga: () => null }))

const PLAYERS = 2
const base: LocationMap = {
  location: { id: 5, name: 'Riverton' }, version: 1, size: [400, 200],
  grid: { type: 'square', size: 50, x: 0, y: 0, cols: 8, rows: 4, auto: false, unit_size: 5, unit: 'ft', color: '#fff', opacity: 0.4, mode: 'color', line: 1 },
  links: [{ tile: [1, 1], resource_id: 9, kind: 'item', name: 'Sword', icon: null, hidden: false }],
  paths: [], regions: [], fog: { enabled: true, layers: {} }, background: '#000000',
  layers: [{ id: 'layer1', name: 'Map', see_through: false }], layer: 'layer1',
  groups: [{ id: 1, key: 'admins', name: 'Admins' }, { id: PLAYERS, key: 'players', name: 'Players' }],
}
const path = (id: string, name: string, hidden = false): MapPath => ({
  id, name, tiles: [], color: '#e2b742', width: 7, body: 'dashed', head: 'arrow', tail: 'circle', render: 'spline', shown: 100,
  visibility: hidden ? { groups: [], members: [] } : { groups: [PLAYERS], members: [] },
})

/** The bar over a map the commands change (a new path for paths.save without an id). */
function Harness({ run }: { run: (name: string, args: Record<string, unknown>) => void }) {
  const [map, setMap] = useState<LocationMap>({ ...base, paths: [path('p1', 'Old road', true)] })
  const tools = useMapTools({
    map, enabled: true,
    run: async (name, args = {}) => {
      run(name, args)
      const raw = args.path as Partial<MapPath> | undefined
      if (name === 'paths.save' && raw && !raw.id) {
        const next = { ...map, paths: [...map.paths, path(`p${map.paths.length + 1}`, raw.name ?? 'Path')] }
        setMap(next)
        return next
      }
      return map
    },
  })
  return (
    <>
      <div role="toolbar" aria-label="tools"><MapToolButtons tools={tools} /></div>
      <div role="toolbar" aria-label="row"><MapToolRow tools={tools} selection={<span>selection tools</span>} /></div>
    </>
  )
}

describe('the map tools bar', () => {
  it('opens a tool on its row; the open tool again, or Esc, goes back to Selection', () => {
    render(<Harness run={vi.fn()} />)
    const row = screen.getByRole('toolbar', { name: 'row' })
    expect(within(row).getByText('selection tools')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Paths' }))
    expect(within(row).getByRole('button', { name: 'Add a path' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Paths' }))
    expect(within(row).getByText('selection tools')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Regions' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(within(row).getByText('selection tools')).toBeInTheDocument()
  })

  it('＋ adds a thing and selects it, ready to draw, with its own tools', async () => {
    const run = vi.fn()
    render(<Harness run={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Paths' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add a path' })) })
    expect(run).toHaveBeenCalledWith('paths.save', { path: { name: 'Path 2', tiles: [] } })
    const row = screen.getByRole('toolbar', { name: 'row' })
    expect(within(row).getByText('Path 2')).toBeInTheDocument() // the selected one's chip
    expect(within(row).getByRole('button', { name: 'Draw' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(row).getByRole('button', { name: 'Width: Normal' })).toBeInTheDocument()
    // The new widths: Thin, Normal, Bold
    fireEvent.click(within(row).getByRole('button', { name: 'Width: Normal' }))
    expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent?.replace('✓', ''))).toEqual(['Thin', 'Normal', 'Bold'])
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Bold/ }))
    expect(run).toHaveBeenLastCalledWith('paths.save', { path: { id: 'p2', width: 12 } })
    // Esc: stops drawing first, then deselects
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(within(row).getByRole('button', { name: 'Draw' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(within(row).queryByText('Path 2')).not.toBeInTheDocument()
  })

  it('☰ lists the layer\'s things: a name selects, the eye shows or hides it, rename, delete', () => {
    const run = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Harness run={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Paths' }))
    fireEvent.click(screen.getByRole('button', { name: 'Paths: the list' }))
    // Hidden from players: the eye shows it (to the players' group)
    fireEvent.click(screen.getByRole('button', { name: 'Show Old road to players' }))
    expect(run).toHaveBeenLastCalledWith('paths.save', { path: { id: 'p1', visibility: { groups: [PLAYERS], members: [] } } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename Old road' }))
    const input = screen.getByRole('textbox', { name: 'Rename Old road' })
    fireEvent.change(input, { target: { value: 'King\'s road' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    expect(run).toHaveBeenLastCalledWith('paths.save', { path: { id: 'p1', name: 'King\'s road' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete Old road' }))
    expect(run).toHaveBeenLastCalledWith('paths.delete', { id: 'p1' })
    fireEvent.click(screen.getByRole('button', { name: /^Old road/ }))
    expect(within(screen.getByRole('toolbar', { name: 'row' })).getByText('Old road')).toBeInTheDocument()
  })

  it('hides a link with its own eye (players still need to see its resource)', () => {
    const run = vi.fn()
    render(<Harness run={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Links' }))
    fireEvent.click(screen.getByRole('button', { name: 'Links: the list' }))
    expect(screen.queryByRole('button', { name: 'Rename Sword' })).not.toBeInTheDocument() // its resource's name
    fireEvent.click(screen.getByRole('button', { name: 'Hide Sword from players' }))
    expect(run).toHaveBeenLastCalledWith('links.hide', { tile: [1, 1], resource_id: 9, hidden: true })
  })
})
