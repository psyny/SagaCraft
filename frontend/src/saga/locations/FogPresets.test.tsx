import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import type { FogPreset } from '../../api/types'
import { DEFAULT_FOG_LOOK } from '../../maps/shader'
import FogPresets from './FogPresets'

const mist: FogPreset = { id: 1, name: 'White mist', look: DEFAULT_FOG_LOOK }
const updateFogPreset = vi.fn((_saga: number, id: number, body: { changes?: object }) =>
  Promise.resolve({ ...mist, id, look: { ...mist.look, ...body.changes } }))
vi.mock('../../api', () => ({
  api: {
    fogPresets: () => Promise.resolve([mist]),
    updateFogPreset: (...args: unknown[]) => updateFogPreset(...(args as [number, number, { changes?: object }])),
  },
}))
vi.mock('../SagaContext', () => ({ useSaga: () => ({ sagaId: 3 }) }))
vi.mock('../../maps/MapRenderer', () => ({ default: () => null })) // WebGL isn't in the test DOM
beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => null) as never })

describe('fog presets', () => {
  it('lists the presets, edits the picked one, and shows the colours by their role', async () => {
    render(<FogPresets />)
    await screen.findByDisplayValue('White mist')
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.getByText('Veils')).toBeInTheDocument() // mist's colours: shadow, veils, light
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled() // the last one stays
    fireEvent.click(screen.getByRole('button', { name: 'Embers' }))
    await waitFor(() => expect(updateFogPreset).toHaveBeenCalledWith(3, 1, { changes: { style: 'embers' } }))
    await screen.findByText('Ash')
    // Flat: no style settings, known tiles still
    fireEvent.click(screen.getByRole('button', { name: 'Flat (tile by tile)' }))
    await waitFor(() => expect(updateFogPreset).toHaveBeenLastCalledWith(3, 1, { changes: { display: 'flat' } }))
    await waitFor(() => expect(screen.queryByText('Style')).not.toBeInTheDocument())
    expect(screen.getByText('Known tiles')).toBeInTheDocument()
  })
})
