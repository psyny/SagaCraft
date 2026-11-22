import { bestInk, complement, inkOn, vividComplement, contrast, hexToRgb, hslToRgb, luminance, mix, readableComplement, rgbToHex, rgbToHsl, shade } from './theory'

describe('colour theory', () => {
  it('converts both ways', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0])
    expect(rgbToHex(hslToRgb(rgbToHsl([18, 52, 86])))).toBe('#123456')
    expect(hexToRgb('#abc')).toEqual([170, 187, 204])
  })
  it('measures lightness and contrast the WCAG way', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1)
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1)
  })
  it('picks ink and complements that read', () => {
    expect(bestInk('#ffe066')).toBe('#000000')
    expect(bestInk('#1b1722')).toBe('#ffffff')
    expect(complement('#ff0000')).toBe('#00ffff')
    for (const c of ['#e2604f', '#5bb98c', '#6fa8e0', '#d6a84a', '#111111', '#f5f5f5', '#808080']) {
      expect(contrast(readableComplement(c), c)).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast(inkOn('#4fc1c9', '#f3efe7'), '#f3efe7')).toBeGreaterThanOrEqual(3) // a light colour on pearl: darkened
    expect(inkOn('#e2604f', '#121012')).toBe('#e2604f') // already reads: kept
    expect(rgbToHsl(hexToRgb(vividComplement('#e2604f')))[0]).toBeCloseTo((rgbToHsl(hexToRgb('#e2604f'))[0] + 180) % 360, 0)
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(shade('#808080', -1)).toBe('#000000')
  })
})
