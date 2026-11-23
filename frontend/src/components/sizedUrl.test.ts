import { describe, expect, it } from 'vitest'
import { pickWidth, sizedUrl } from './sizedUrl'

describe('sized pictures', () => {
  it('asks for the smallest width covering the box (screen density up to 2)', () => {
    expect(pickWidth(40)).toBe(96)
    expect(pickWidth(40, 3)).toBe(96)
    expect(pickWidth(120, 2)).toBe(384)
    expect(pickWidth(700)).toBe(768)
    expect(pickWidth(1000, 2)).toBeNull()
    expect(pickWidth(0)).toBeNull()
  })

  it('adds the width to file URLs only', () => {
    expect(sizedUrl('/api/files/6?e=1&s=x', 96)).toBe('/api/files/6?e=1&s=x&w=96')
    expect(sizedUrl('/api/files/6?e=1&s=x', null)).toBe('/api/files/6?e=1&s=x')
    expect(sizedUrl('blob:abc', 96)).toBe('blob:abc')
  })
})
