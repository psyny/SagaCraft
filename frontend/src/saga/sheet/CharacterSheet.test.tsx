import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { DisplayValue, Sheet } from '../../api/types'
import { SheetView } from './CharacterSheet'

const name: DisplayValue = { key: '@name', label: 'Name', type: 'system', style: 'text', region: 'top_center', value: 'Hooded figure' }

const sheet: Sheet = {
  resource_id: 4,
  name: 'Hooded figure',
  type: 'npc',
  type_name: 'NPC',
  category_name: 'Major NPC',
  picture: null,
  template: { id: 2, name: 'NPC' },
  immersive: [
    name,
    { key: '@category', label: 'Category', type: 'system', style: 'text', region: 'top_right', value: 'Major NPC' },
    { key: 'level', label: 'Level', type: 'number', style: 'number', region: 'bottom_center', value: 5 },
    { key: 'hp', label: 'HP', type: 'counter', style: 'discrete', region: 'bottom_panel', level: 3, levels: 4 },
    { key: 'controllers', label: 'Players in control', type: 'member_ref', style: 'text', region: 'bottom_panel', value: [] },
    { key: 'initiative', label: 'Initiative', type: 'number', style: 'number', region: 'hover_left', value: 14 },
  ],
  informative: [
    { key: 'hp', label: 'HP', type: 'counter', style: 'bar', region: 'header', current: 12, max: 31 },
    { key: 'inventory', label: 'Inventory', type: 'list', style: 'text', region: 'body', value: ['Rope', 'Torch'] },
  ],
}

describe('Character sheet', () => {
  it('immersive: regions over the picture', () => {
    const { container } = render(<SheetView sheet={sheet} mode="immersive" />)
    expect(screen.getByRole('heading', { name: 'Hooded figure' })).toBeInTheDocument()
    expect(container.querySelector('.slot-right')!.textContent).toContain('Major NPC')
    expect(container.querySelector('.sheet-bottom-center')!.textContent).toContain('Level')
    expect(container.querySelectorAll('.sheet-values .ball.filled')).toHaveLength(3)
    expect(container.querySelector('.sheet-hover.hover-left')!.textContent).toContain('Initiative')
    expect(screen.getByText('none')).toBeInTheDocument() // an empty list
  })

  it('immersive: no category unless the template adds it', () => {
    const { container } = render(<SheetView sheet={{ ...sheet, immersive: [name] }} mode="immersive" />)
    expect(container.textContent).not.toContain('Major NPC')
  })

  it('informative: the header next to the face, the body below', () => {
    const { container } = render(<SheetView sheet={sheet} mode="informative" />)
    expect(container.querySelector('.sheet-highlights .bar')).not.toBeNull()
    const rest = container.querySelector('.sheet-rest:not(.measure)')!
    expect(rest.textContent).toContain('Rope')
    expect(rest.textContent).toContain('Torch')
    expect(container.querySelector('.page-controls')).toBeNull() // fits on one page
  })

  it('shows ??? for a hidden name', () => {
    render(<SheetView sheet={{ ...sheet, name: null }} mode="informative" />)
    expect(screen.getByRole('heading', { name: '???' })).toBeInTheDocument()
  })

  it('informative: a long body gets pages', () => {
    // Each element 120px tall, 130px apart: 2 per page (PAGE_H 300)
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120)
    const top = vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return [...(this.parentElement?.children ?? [])].indexOf(this) * 130
    })
    const body: DisplayValue[] = Array.from({ length: 6 }, (_, i) => ({ key: `n${i}`, label: `Note ${i}`, type: 'text', style: 'text', region: 'body', value: `Text ${i}` }))
    const { container } = render(<SheetView sheet={{ ...sheet, informative: body }} mode="informative" />)
    const page = () => container.querySelector('.sheet-rest:not(.measure)')!.textContent
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(page()).toContain('Note 1')
    expect(page()).not.toContain('Note 2')
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(page()).toContain('Note 2')
    height.mockRestore()
    top.mockRestore()
  })
})
