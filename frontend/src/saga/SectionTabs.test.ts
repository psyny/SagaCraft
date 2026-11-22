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
    expect(active('/locations/map')).toEqual(['Places'])
    expect(active('/locations/14')).toEqual(['Places'])
    expect(active('/locations/fog')).toEqual(['Fog presets'])
    expect(active('/saga/displays/3')).toEqual(['Display templates'])
  })
  it('has no bar where there is nothing to switch to', () => {
    expect(sectionsFor('/characters', false)).toBeNull() // a player: Characters only
    expect(sectionsFor('/locations', false)).toBeNull()
    expect(sectionsFor('/stages', true)).toBeNull()
    expect(sectionsFor('/', true)).toBeNull()
  })
})
