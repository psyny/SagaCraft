/**
 * The section bar: a second menu strip under the top bar, for the pages that have sections (Characters: Characters,
 * Groups; Locations: Places, Fog presets; Lore: Documents, Events, Relationships; Saga: Members, Template, Display
 * templates, Calendar, Settings). It names the page it belongs to ("Lore ›") and underlines the section you're in, so the
 * sections read as parts of that page, not as buttons of the screen. Drawn by SagaLayout for every page of the
 * section (a document's page too); one section alone (a player's Characters) has no bar.
 * See docs/concepts/ux.md ("Navigation").
 */
import { Link, useLocation } from 'react-router-dom'
import { useSaga } from './SagaContext'

export interface Section {
  /** Path inside the Saga, e.g. "/lore/events". */
  path: string
  label: string
  title?: string
  /** Is this section the one shown, for a path inside the Saga (sub-pages count). */
  active: (rel: string) => boolean
}

const under = (path: string) => (rel: string) => rel === path || rel.startsWith(`${path}/`)

/** Pure: the page a path is in and its sections (the member's), or null when it has none to switch between. */
export function sectionsFor(rel: string, isAdmin: boolean): { page: string; sections: Section[] } | null {
  const top = rel.split('/')[1] ?? ''
  let page = ''
  let sections: Section[] = []
  if (top === 'characters') {
    page = 'Characters'
    sections = [
      { path: '/characters', label: 'Characters', active: (r) => !under('/characters/groups')(r) },
      ...(isAdmin ? [{ path: '/characters/groups', label: 'Groups', title: 'The party and your encounters', active: under('/characters/groups') }] : []),
    ]
  } else if (top === 'locations') {
    page = 'Locations'
    sections = [
      { path: '/locations', label: 'Places', title: 'Every location, its map, and the location map', active: (r) => !under('/locations/fog')(r) },
      ...(isAdmin ? [{ path: '/locations/fog', label: 'Fog presets', title: 'How map Sets draw the fog of war', active: under('/locations/fog') }] : []),
    ]
  } else if (top === 'lore') {
    page = 'Lore'
    sections = [
      { path: '/lore/documents', label: 'Documents', title: 'Letters, books, handouts', active: under('/lore/documents') },
      { path: '/lore/events', label: 'Events', title: 'The timeline: events and eras', active: under('/lore/events') },
      { path: '/lore/relationships', label: 'Relationships', title: 'Who is linked to whom: the graph', active: under('/lore/relationships') },
    ]
  } else if (top === 'saga') {
    page = 'Saga'
    const user = { path: '/saga/user', label: 'User', title: 'Your account: name, password, colour, dice', active: under('/saga/user') }
    sections = !isAdmin ? [user] : [
      { path: '/saga/members', label: 'Members', title: 'People, roles and member groups', active: under('/saga/members') },
      { path: '/saga/template', label: 'Template', title: 'The Saga template: variables, types, starting content', active: under('/saga/template') },
      { path: '/saga/displays', label: 'Display templates', title: 'How characters and items show on cards and sheets', active: under('/saga/displays') },
      { path: '/saga/calendar', label: 'Calendar', title: 'The in-world calendar and today in the story', active: under('/saga/calendar') },
      { path: '/saga/settings', label: 'Settings', title: 'The live link (the live Stage on a TV or tablet, no sign-in)', active: under('/saga/settings') },
      user,
    ]
  }
  return sections.length > 1 ? { page, sections } : null
}

export default function SectionBar() {
  const { sagaId, isAdmin } = useSaga()
  const { pathname } = useLocation()
  const base = `/s/${sagaId}`
  const rel = pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname
  const found = sectionsFor(rel, isAdmin)
  if (!found) return null
  return (
    <nav className="section-bar" aria-label={`${found.page} sections`}>
      <span className="section-bar-page" aria-hidden>{found.page}<span className="section-bar-sep">›</span></span>
      {found.sections.map((s) => {
        const on = s.active(rel)
        return (
          <Link key={s.path} to={`${base}${s.path}`} title={s.title} className={`section-link ${on ? 'on' : ''}`}
            aria-current={on ? 'page' : undefined}>{s.label}</Link>
        )
      })}
    </nav>
  )
}
