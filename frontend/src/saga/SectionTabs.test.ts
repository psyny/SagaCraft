import { describe, expect, it } from 'vitest'
import { sectionsFor } from './SectionTabs'

const active = (rel: string, admin = true) => sectionsFor(rel, admin)?.sections.filter((s) => s.active(rel)).map((s) => s.label)

describe('the section bar', () => {
  it('names the page and marks the section a path is in, sub-pages included', () => {
    expect(sectionsFor('/lore/events/12', false)?.page).toBe('Lore')
    expect(active('/lore/events/12')).toEqual(['Events'])
    expect(active('/lore/documents')).toEqual(['Documents'])
    expect(active('/characters/groups')).toEqual(['Groups'])
    expect(active('/characters')).toEqual(['Characters'])
    expect(sectionsFor('/locations/14', true)).toBeNull() // Places only (fog presets moved to EFX)
    expect(active('/efx/environments')).toEqual(['Environments'])
    expect(active('/efx/fog')).toEqual(['Fog presets'])
    expect(active('/saga/displays/3')).toEqual(['Template']) // the display template editor: a Template tab's
    expect(active('/saga/user')).toEqual(['User'])
    expect(sectionsFor('/saga/user', false)).toBeNull() // a player: User only, no bar
  })
  it('has no bar where there is nothing to switch to', () => {
    expect(sectionsFor('/characters', false)).toBeNull() // a player: Characters only
    expect(sectionsFor('/locations', false)).toBeNull()
    expect(sectionsFor('/efx/environments', false)).toBeNull()
    expect(sectionsFor('/stages', true)).toBeNull()
    expect(sectionsFor('/', true)).toBeNull()
  })
})
