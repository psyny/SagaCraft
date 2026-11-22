import type { AttributeDef } from '../api/types'
import { tabOf } from '../saga/CharacterForm'
import { shade, tokenColor } from './Token'

describe('tokens', () => {
  const members = [{ id: 1, color: '#112233', role: 'player' }, { id: 2, color: '#445566', role: 'player' }, { id: 3, color: '#778899', role: 'admin' }] as const
  it('take their player\'s colour; several players: white; no player: black', () => {
    expect(tokenColor([1], [...members])).toBe('#112233')
    expect(tokenColor([1, 2], [...members])).toBe('#ffffff')
    expect(tokenColor([], [...members])).toBe('#000000')
    expect(tokenColor([9], [...members])).toBe('#000000') // someone who left
    expect(tokenColor([3], [...members])).toBe('#000000') // not a player
  })
  it('shade colours for gradient and studded borders', () => {
    expect(shade('#808080', 1)).toBe('#ffffff')
    expect(shade('#808080', -1)).toBe('#000000')
  })
})

describe('the editor tabs', () => {
  const a = (x: Partial<AttributeDef>) => ({ key: 'k', name: 'K', type: 'text', view: [], edit: [], ...x }) as AttributeDef
  it('sort variables by what they are, never by name', () => {
    expect(tabOf(a({ key: 'name', required: true }))).toBe('identity')
    expect(tabOf(a({ type: 'image', category: 'icon' }))).toBe('identity')
    expect(tabOf(a({ type: 'list', of: { type: 'resource_ref', kind: 'item' } }))).toBe('inventory')
    expect(tabOf(a({ type: 'member_ref', controllers: true }))).toBe('admin')
    expect(tabOf(a({ type: 'counter', key: 'hp' }))).toBe('variables')
    expect(tabOf(a({ type: 'text', key: 'backstory' }))).toBe('variables')
  })
})
