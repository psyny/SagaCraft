import { nameAbbreviations } from './nameAbbreviations'

describe('name abbreviations', () => {
  it('abbreviates from the last word back, keeping the first word', () => {
    expect(nameAbbreviations('Goblin King of the North')).toEqual([
      'Goblin King of the North',
      'Goblin King of the N.',
      'Goblin King of t. N.',
      'Goblin King o. t. N.',
      'Goblin K. o. t. N.',
    ])
  })

  it('leaves single words alone', () => {
    expect(nameAbbreviations('  Thorin  ')).toEqual(['Thorin'])
  })
})
