import { timeAgo } from './timeAgo'

describe('timeAgo', () => {
  const now = new Date('2026-11-28T12:00:00Z').getTime()
  it('says how long ago, in words', () => {
    expect(timeAgo(null, now)).toBe('never')
    expect(timeAgo('2026-11-28T11:59:40Z', now)).toBe('just now')
    expect(timeAgo('2026-11-28T11:15:00Z', now)).toBe('45 min ago')
    expect(timeAgo('2026-11-28T07:00:00Z', now)).toBe('5 h ago')
    expect(timeAgo('2026-11-27T10:00:00Z', now)).toBe('1 day ago')
    expect(timeAgo('2026-11-18T12:00:00Z', now)).toBe('10 days ago')
  })
})
