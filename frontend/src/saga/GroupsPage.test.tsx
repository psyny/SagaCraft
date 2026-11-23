import { describe, expect, it } from 'vitest'
import type { AttributeDef } from '../api/types'
import { groupValues } from './GroupsPage'

const attr = (over: Partial<AttributeDef>): AttributeDef =>
  ({ key: 'gold', name: 'Shared gold', type: 'number', view: ['admins'], edit: ['admins'], default: 0, ...over }) as AttributeDef

describe('group variables', () => {
  it('reads a group\'s values, the variable\'s default where it has none', () => {
    const vars = [attr({}), attr({ key: 'banner', name: 'Banner', type: 'choice', default: null, options: ['Lion'] })]
    expect(groupValues({ attributes: {} }, vars)).toEqual({ gold: 0, banner: null })
    expect(groupValues({ attributes: { gold: 120, old: 'kept' } }, vars)).toEqual({ gold: 120, banner: null })
    expect(groupValues({}, vars)).toEqual({ gold: 0, banner: null })
  })
})
