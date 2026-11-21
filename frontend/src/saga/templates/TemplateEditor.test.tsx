import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { AttributeDef, Region, TemplateElement } from '../../api/types'
import { RegionList } from './TemplateEditor'
import { newElement, REGIONS } from './modes'

const hp = { key: 'hp', name: 'HP', type: 'counter' } as AttributeDef
const level = { key: 'level', name: 'Level', type: 'number' } as AttributeDef
const attrOf = (key: string) => [hp, level].find((a) => a.key === key)
const labelOf = (key: string) => ({ '@name': 'Name', '@category': 'Category' }[key] ?? attrOf(key)?.name ?? key)

const lists = (over: Partial<Record<Region, TemplateElement[]>>) =>
  ({ ...Object.fromEntries(REGIONS.face.map((r) => [r, []])), ...over }) as Record<Region, TemplateElement[]>

describe('Template editor: a region as a list', () => {
  it('adds, moves, restyles and removes elements', () => {
    const save = vi.fn()
    const current = lists({ bottom: [newElement('hp', hp), newElement('level', level)] })
    render(<RegionList region="bottom" lists={current} regions={REGIONS.face} labelOf={labelOf} attrOf={attrOf} available={['@category']} save={save} />)

    fireEvent.change(screen.getByLabelText('Add to Bottom'), { target: { value: '@category' } })
    expect(save).toHaveBeenLastCalledWith({ bottom: [current.bottom[0], current.bottom[1], newElement('@category')] })

    fireEvent.click(screen.getByRole('button', { name: 'Move Level up' }))
    expect(save.mock.lastCall![0].bottom.map((e: TemplateElement) => e.key)).toEqual(['level', 'hp'])

    fireEvent.click(screen.getByRole('button', { name: 'HP settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discrete' }))
    expect(save.mock.lastCall![0].bottom[0]).toMatchObject({ key: 'hp', style: 'discrete' })

    fireEvent.change(screen.getByLabelText('HP region'), { target: { value: 'hover_left' } })
    expect(save).toHaveBeenLastCalledWith({ bottom: [current.bottom[1]], hover_left: [current.bottom[0]] })

    fireEvent.click(screen.getByRole('button', { name: 'Remove Level' }))
    expect(save).toHaveBeenLastCalledWith({ bottom: [current.bottom[0]] })
  })

  it('a one-element region takes nothing more once full', () => {
    render(<RegionList region="top" lists={lists({ top: [newElement('@name')] })} regions={REGIONS.face} labelOf={labelOf} attrOf={attrOf}
      available={['@category']} save={() => undefined} />)
    expect(screen.queryByLabelText('Add to Top')).toBeNull()
    expect(screen.getByText('1/1')).toBeInTheDocument()
  })
})
