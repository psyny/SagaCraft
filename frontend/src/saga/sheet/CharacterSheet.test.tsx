import { render, screen } from '@testing-library/react'
import type { Sheet } from '../../api/types'
import { SheetView } from './CharacterSheet'

const sheet: Sheet = {
  resource_id: 4,
  name: 'Hooded figure',
  type: 'npc',
  type_name: 'NPC',
  picture: null,
  template: { id: 2, name: 'NPC' },
  immersive: [
    { key: 'hp', label: 'HP', type: 'counter', style: 'discrete', display_on: 'shown', level: 3, levels: 4 },
    { key: 'controllers', label: 'Players in control', type: 'member_ref', style: 'number', display_on: 'shown', value: [] },
  ],
  informative: {
    highlight: [{ key: 'hp', label: 'HP', type: 'counter', style: 'bar', display_on: 'highlight', current: 12, max: 31 }],
    body: [{ key: 'inventory', label: 'Inventory', type: 'list', style: 'number', display_on: 'body', value: ['Rope', 'Torch'] }],
  },
}

describe('Character sheet', () => {
  it('immersive: name on top, values over the picture', () => {
    const { container } = render(<SheetView sheet={sheet} mode="immersive" />)
    expect(screen.getByRole('heading', { name: 'Hooded figure' })).toBeInTheDocument()
    expect(container.querySelectorAll('.sheet-lower .ball.filled')).toHaveLength(3)
    expect(screen.getByText('none')).toBeInTheDocument() // an empty list
  })

  it('informative: highlights next to the face, the rest below', () => {
    const { container } = render(<SheetView sheet={sheet} mode="informative" />)
    expect(container.querySelector('.sheet-highlights .bar')).not.toBeNull()
    const rest = container.querySelector('.sheet-rest')!
    expect(rest.textContent).toContain('Rope')
    expect(rest.textContent).toContain('Torch')
  })

  it('shows ??? for a hidden name', () => {
    render(<SheetView sheet={{ ...sheet, name: null }} mode="informative" />)
    expect(screen.getByRole('heading', { name: '???' })).toBeInTheDocument()
  })
})
