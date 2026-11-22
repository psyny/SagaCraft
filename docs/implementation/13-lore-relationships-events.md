# 13 - Lore: relationships, events, the timeline

Status: Done
Requirements: REL-1..11, REL-14, REL-15, REL-16, EVT-1..8, EVT-11, EVT-12, EVT-13, EVT-14, SET-4, LORE-11, TPL-13, UX-10
Depends on: 11-saga-templates-items-documents, 12-document-folders-and-navigation

## Goal

The Saga's lore becomes a web and a history. Members link resources with **relationships** (each belonging to
a member group: what that group knows), explore them as a **graph**, and follow the story on a **timeline** of
**events** (with sub-events and eras) read in the Saga's **calendar**. A new **Lore** tab holds Documents,
Events and Relationships; the DM can put a relationship graph on a Stage.

## Out of scope

- The "what did the players get right?" comparison (REL-12), quick text entry (REL-13): later.
- Fantasy calendar weekdays and custom leap rules (EVT-9), the timeline Set (EVT-10): later.
- Linking events to real-world game sessions.

## UX

- **Top bar**: Stage, Stages (DM), Characters, Locations, Items, **Lore**, Saga (DM). Lore's sections: Documents,
  Events, Relationships.
- **Adding a relationship** (anyone who writes: the DM, players in their groups), from:
  - any resource page (the **⟷ Relationships** button: items, documents, locations, events, a character's sheet);
  - the graph: select a node, drag its "+" onto another;
  - an event's page ("＋ Relationship": it starts at the event);
  - the Relationships page ("＋ Relationship").
  One form reads like a sentence: *who* · *type* · *whom*. Types are chips, recent first and ranked by the kinds
  linked; typing a new label makes the group's own type (one way or both, with how it reads back). The DM can
  make a missing resource by name. Group (last used), dates ("always" by default) and note stay folded.
- **Graph**: Characters (default), Everything, Around… (N steps), Among… (a chosen set with neighbours). Whose
  knowledge (the DM: the truth by default; players: their groups), kinds, added by, the moment in the story,
  template links (part of, inventory, involved). Click selects (the rest dims), double click opens, scroll
  zooms, drag pans or moves nodes. A List view shows the same relationships as a table.
- **Timeline**: today in the story (the DM changes it in place), era chips (the DM edits them), search, type,
  "Involving…", who made it; the **moment slider** dims what comes later and is shared with the graph. Rows:
  year headings, era begins/ends, today, event cards with their sub-events and relationships; eras run down the
  left as coloured bands.
- **Event page**: date, what happened, involved resources, "What happened" (resource sub-events with suggestions
  from the resource's type, relationships that started there). The DM edits details in the Details tab.
- **Saga → Calendar**: Gregorian, Twelve Moons, or our own (months and days, a year label); today in the story.
- **Relationship graph Set**: the DM picks whose knowledge and the query in Build, drags nodes into place.

## Design

- **Calendar** (`domain/calendar.py`, `services/calendars.py`): dates are integers `year*10000 + month*100 + day`
  (sort in order, any calendar, negative years). `sagas.calendar` (None: the Saga template's `starting.calendar`,
  else Twelve Moons) and `sagas.story_date`. Both come with the Saga overview. Changing the calendar keeps every
  date's numbers. Exports carry the calendar.
- **Ruleset**: block `date`; types' `sub_events` (names); kind `event` with types Event, Battle (Outcome),
  Celebration, Death; variables Title, Icon, Date (required: the event's date), What happened, Involved (list of
  any resources). The Template page edits events, date variables and sub-event lists.
- **Relationships** (`domain/relationships.py`, `services/relationships.py`): tables `relationships` (group,
  from, to, predefined `type_key` or the group's `type_id`, note, start/end, `event_id`, `owns_event`,
  `source_id`, creator and role) and `relationship_types` (a group's own). Members read their groups' (the DM:
  all); players and the DM write in their groups. Endpoints a member can't see come back masked. A start date
  links an event (picked, or made for it: visible to the group, named as the creator sees the resources); the
  event's date is the start date (moving either moves both); an event made for a relationship goes when the
  relationship leaves it empty. Reveal = a copy in the target group (its event becomes visible to the group if it
  was made for it). Graph queries build nodes and edges per viewer (`build_graph`).
- **Events** (`services/events.py`): `sub_events` table (event, resource, what, note, position); eras table (name,
  start, end, colour, note, visibility). The timeline returns visible events in date order with their visible
  sub-events and relationships, and visible eras.
- **Set type** `relationship_graph` (`set_types/relationship_graph.py`): config groups, mode, ids, hops, kinds,
  references, at, labels, positions; commands `nodes.place`, `nodes.reset`; `RenderContext.relationships`.
- **API** (`api/lore.py`): calendar, relationship types, relationships (+ graph, reveal), timeline, events'
  sub-events, eras. Old `/documents` addresses redirect to `/lore/documents`.
- **Frontend**: `saga/lore/` (dates, DateInput, relationships helpers, RelationshipForm, RelationshipsPanel,
  graph/layout + RelationshipGraph, TimelinePage, EventPage, RelationshipsPage, moment), `saga/CalendarPage.tsx`,
  `stage/sets/relationshipGraph/`.

## Tools chosen

| Need | Choice | Why |
|------|--------|-----|
| Graph layout and drawing | Own force-directed layout (`graph/layout.ts`) + SVG | Small graphs; deterministic (the DM and players see the same picture); no new dependency |

## Steps

- [x] Backend: calendar, date block, event kind, sub-event lists, relationships and types, events' sub-events,
  eras, timeline, graph, reveal, the graph Set; migration `d4b8f1e6a273`.
- [x] Frontend: Lore tab and sections, timeline, event page, relationships page with graph and list, relationship
  form and panel on resource pages, Calendar section, Template page (events, dates, sub-events), graph Set.
- [x] Docs.

## Tests

- API (`tests/test_lore.py`): calendar presets, leap years, own calendars, export; relationships by group (truth
  hidden, players' theories, viewers read-only, refused cases), own types (reuse by label, used types kept),
  masking, reveal, by resource; events' default date and calendar check, sub-events (DM only, visibility, order),
  relationship sub-events, date sync both ways, events made for relationships (visibility, names, moved,
  deleted), deleting events and resources; timeline order and visibility, eras; graph modes, hops, kinds, moment,
  groups, references; the graph Set (config, positions, a player's live view masked); template events, date
  variables, sub-event lists.
- Frontend (`saga/lore/timeline.test.ts`): dates, timeline rows, eras, filters, relationship reading and type
  suggestions, writable groups, layout determinism, parallel edges.
- Checked in headless Chrome: timeline (DM and player), event page, relationships graph (DM and player, a
  selected node with its "+"), the relationship form, Saga → Calendar, the graph Set in Build.

## Changes from the concept docs

- Resource sub-events take any text; the type's list is suggested (one click), not enforced.
- Every event has a date (no undated events); new ones start on today in the story.
- Eras are the DM's, with their own visibility (players don't make eras).
- An end date doesn't make an event.
- Players can move a relationship between their own groups.
- Template references (part of, inventory, involved) can show as dashed edges in the graph.
- Saga templates copied or written before events existed get the built-in event kind when read
  (`services/saga_templates.with_app_kinds`), so older Sagas and files have events without a migration.
- The graph Set shows the groups the DM picked to whoever sees it (a reveal by the DM's choice); each viewer still
  gets hidden resources masked.
