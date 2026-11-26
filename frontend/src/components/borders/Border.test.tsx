import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { BorderStyle } from '../../api/types'
import { VisualPanel } from '../../saga/templates/TemplateEditor'
import { BORDER_STYLES, BoxBorder, RingBorder } from './Border'

describe('Borders (plan 59)', () => {
  it('draw every style around a token, and along a larger token\'s outline', () => {
    for (const [style] of BORDER_STYLES) {
      const { container } = render(<svg><RingBorder cx={50} cy={50} r={40} w={5} border={{ style, color: '#52c06e', width: 'm' }} id={`t-${style}`} /></svg>)
      expect(container.querySelector(`.ring-${style}`)).not.toBeNull()
      expect(container.querySelectorAll('circle').length).toBeGreaterThan(0)
    }
    const outline = render(<svg><RingBorder cx={50} cy={50} r={40} w={5} d="M0 0H100V100H0Z" length={400} border={{ style: 'neon', color: '#52c06e', width: 'l' }} id="big" /></svg>)
    expect(outline.container.querySelector('clipPath#big-in')).not.toBeNull()
  })

  it('draw over a card, the size of its box: ornaments on the corners of framed styles', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200)
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(280)
    const draw = (style: BorderStyle) => render(<div><BoxBorder border={{ style, color: '#aa8800', width: 'm' }} /></div>).container
    expect(draw('noble').querySelectorAll('g[transform] path').length).toBeGreaterThanOrEqual(8) // four corners, and middles
    expect(draw('hud').querySelectorAll('path').length).toBeGreaterThanOrEqual(8)
    expect(draw('flat').querySelector('svg')!.getAttribute('width')).toBe('200')
    width.mockRestore()
    height.mockRestore()
  })

  it("the Visual panel: a mode's border style, colour and width", () => {
    const onChange = vi.fn()
    render(<VisualPanel visual={{ color: 'custom', custom: '#123456' }} tokenStyle="simple" mode="token" onChange={onChange} />)
    expect((screen.getByLabelText('Border style') as HTMLSelectElement).value).toBe('flat') // the token's older style
    fireEvent.change(screen.getByLabelText('Border style'), { target: { value: 'vines' } })
    expect(onChange).toHaveBeenLastCalledWith({ style: 'vines' })
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    expect(onChange).toHaveBeenLastCalledWith({ color: 'group' })
    fireEvent.click(screen.getByRole('button', { name: 'XL' }))
    expect(onChange).toHaveBeenLastCalledWith({ width: 'xl' })
  })
})
