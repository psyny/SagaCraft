/**
 * Section tabs inside a page of the Saga (Characters | Groups; Lore: Documents | Events | Relationships; Saga:
 * Members | Template | Display templates | Calendar):
 * links, so each section has its own address. The top bar keeps one tab per page; sections go here.
 */
import { NavLink } from 'react-router-dom'
import { useSaga } from './SagaContext'

export interface Section {
  to: string
  label: string
  /** Active only on this exact address (not its sub-pages). */
  end?: boolean
  title?: string
}

export default function SectionTabs({ sections }: { sections: Section[] }) {
  return (
    <nav className="tool-tabs section-tabs" aria-label="Sections">
      {sections.map((s) => (
        <NavLink key={s.to} to={s.to} end={s.end} title={s.title} className={({ isActive }) => `tool-tab ${isActive ? 'on' : ''}`}>{s.label}</NavLink>
      ))}
    </nav>
  )
}

/** The Characters page's sections (Groups is the DM's). */
export function CharacterSections() {
  const { sagaId, isAdmin } = useSaga()
  if (!isAdmin) return null
  const base = `/s/${sagaId}/characters`
  return <SectionTabs sections={[{ to: base, label: 'Characters', end: true }, { to: `${base}/groups`, label: 'Groups', title: 'The party and your encounters' }]} />
}

/** The Saga page's sections: everything about how the Saga is set up (the DM's). */
export function SagaSections() {
  const { sagaId } = useSaga()
  const base = `/s/${sagaId}/saga`
  return (
    <SectionTabs sections={[
      { to: `${base}/members`, label: 'Members', title: 'People, roles and member groups' },
      { to: `${base}/template`, label: 'Template', title: 'The Saga template: variables, types, starting content' },
      { to: `${base}/displays`, label: 'Display templates', title: 'How characters and items show on cards and sheets' },
      { to: `${base}/calendar`, label: 'Calendar', title: 'The in-world calendar and today in the story' },
    ]} />
  )
}

/** The Lore page's sections: what the Saga's world remembers. */
export function LoreSections() {
  const { sagaId } = useSaga()
  const base = `/s/${sagaId}/lore`
  return (
    <SectionTabs sections={[
      { to: `${base}/documents`, label: 'Documents', title: 'Letters, books, handouts' },
      { to: `${base}/events`, label: 'Events', title: 'The timeline: events and eras' },
      { to: `${base}/relationships`, label: 'Relationships', title: 'Who is linked to whom: the graph' },
    ]} />
  )
}
