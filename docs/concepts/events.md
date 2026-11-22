# Events, eras, calendars and timeline

An **event** is something that happened in the Saga, at an in-world date. Events tie resources and
relationships to time, so the group can see the saga unfold on a timeline.

## Event is a resource kind

Event is a **resource kind**, like Document, Character, Location and Item (see `rulesets.md`). So:

- relationships can point to events ("Character A fought in the Battle of the Bridge"),
- documents can be about events, Stages can show them, the graph can include them,
- the ruleset can define event types with their own attributes (e.g. Battle, Festival, Death),
- events use the same visibility as other resources.

## Event

An event has, on top of its ruleset attributes:

| Field | Notes |
|-------|-------|
| **Date** | One exact date in the Saga's calendar (e.g. day 1 of the month Arara, year 300). No partial dates. |
| **Ends** | Optional: the day it ended, for an event that lasted (a siege, a festival week). Never before its date. An event with an end is a **period** on the timeline. |
| **Title / description** | What happened. |
| **Resources** | The resources involved (characters, locations, items, documents, other events). |
| **Sub-events** | The list of things that happened in it (see below). |
| **Visibility** | Same model as other resources. |
| **Created by** | Member and role, like relationships. |

### Sub-events

Sub-events describe the parts of an event. One level only (sub-events don't have sub-events). Two kinds:

- **Resource sub-event**: something that happened to one resource, from that resource type's list of
  **sub-event types**. E.g. `Location X: discovered`, `Character A: died`, `Item Y: destroyed`.
- **Relationship sub-event**: a relationship that started (or ended) at this event. E.g.
  `Character A killed Character B`.

Example:

```
Event: "Ambush at the old bridge"        day 1 of Arara, year 300
├── Location: Old Bridge — discovered    (resource sub-event)
└── Character A killed Character B       (relationship sub-event)
```

### Sub-event types per resource type

Each resource type has a list of sub-event types (Location: discovered, conquered, destroyed;
Character: born, met, died; Item: found, lost, destroyed...). A default list comes predefined; the
**Saga admin can edit it** (add, rename, remove). Where the defaults come from (app, ruleset, or both) is
an open point.

## Relationships and events stay in sync

To keep things concise, each fact is stored once and shown in both places:

- **Giving a relationship a start date** automatically creates an event at that date (or adds the
  relationship as a sub-event of an existing event at that date, if the user picks one).
- **Adding a relationship sub-event** to an event creates that relationship, with the event's date as its
  start date.
- Editing or deleting it in one place updates the other. A relationship and its sub-event are the same
  record, not copies.
- Relationships belong to groups (see `relationships.md`): a relationship sub-event is only shown to
  members who can see that relationship. An event created automatically from a player's relationship is
  visible to that relationship's group.

## Eras

An **era** is a named period with a **start date** and an **end date** ("The Long War", year 280 to
year 300). Eras give the timeline its big structure: the ages of the world, above the events (some of which
last a while: see **Ends**).

- Eras can overlap (a war inside a dynasty).
- Eras colour the timeline's line (two colours, alternating, so neighbours stand apart), with a long tick where
  each begins and ends; picking one in the filters shows its period.
- An era can be open-ended (still going: no end date yet).

## Calendars

Each Saga picks the calendar its dates use:

- the **real** (Gregorian) calendar, for modern or historical settings,
- a **fantasy calendar**: from a predefined list, or defined by the Saga admin (month names and lengths,
  week days, year numbering, maybe leap rules).

The Saga keeps a **current in-world date** ("today in the story"), used as the default date for new
events and as the starting point of the timeline.

Licensing: predefined fantasy calendars must be our own or openly licensed (no calendars copied from
published settings).

## Timeline

Lore → Events shows the Saga's events (what the member can see) as a **timeline** or a **list**; the choice is
remembered. The **filters on top** serve both: search, event type (each with its colour), a resource involved,
who made it, and the **dates**: from and to (an event counts when any of it is inside; an era's chip picks its
period). "Clear filters" resets them.

**The timeline** is horizontal and scrolls:

- The **line** runs through the middle, with **ticks** every few days, months or years, by zoom (labels never
  touch). **Eras** colour the line, two colours alternating, with a long tick at each start and end and their
  names under it (the DM clicks a name to edit the era). **Today** and the **moment** are vertical lines.
- **Events** are circles in their type's colour; **periods** (events with an end) are bars from start to end.
  What would touch **piles up**: periods first (overlapping ones stack), then circles, over the periods under
  them. Later than the moment: dimmed.
- Events start **collapsed** (only their marks; hover tells name and date). Clicking one **expands** it: a
  dashed line comes up to a box with its title, dates and the start of what happened, to the right of the line
  or to its left (wherever it fits among the other boxes, inside the view; a period's box covers the period).
  **Expand all / Collapse all**. Clicking a box opens the **whole event** (dates, type, description, involved,
  sub-events and relationships; a link to its page).
- **Zoom**: the wheel (around the pointer), − Fit ＋; **pan**: drag, sideways scrolling; ◉ Today centres on today.
  It opens around today and the events nearest it; with dates asked for, on exactly those dates.
- The **minimap** under it shows the whole timeline lightly (eras, events, today) and the part in view; click or
  drag it to move there.

**The list**: plain and informative, nothing timeline-like: one row per event with its date (or span), icon, name
and type (the type's colour), the start of what happened, how many resources and relationships it involves, and the
eras it falls in. **Oldest first / Newest first** (remembered). Events after the moment are dimmed; a row opens the
whole event.

A **timeline slider** sets "the moment in the story" for other views:

- The relationship graph shows only relationships active at that date (start ≤ date ≤ end; "always"
  counts as open on that side).
- Resource pages could show the resource's history up to that date.

The **Timeline Set** shows it on a Stage (the players' knowledge by default: see `stages.md`).

## In the app (Lore → Events)

- **Event kind** in the Saga template: types Event, Battle (with an Outcome), Celebration, Death; variables Title,
  Icon, **Date** and **Ends** (the app's: can't be deleted; Ends is a date variable marked `ends`), What happened,
  Involved (any resources). The Template page edits
  them like any kind, adds date variables to any kind (a character's birthday) and each type's **sub-event list**
  ("In events, it can be…": Born, Met the party, Died; a Location: Founded, Discovered, Conquered…).
- **Dates** are stored as one number per day (`year*10000 + month*100 + day`): they sort in order in any calendar
  and keep their day, month and year when the DM changes the calendar.
- **Calendars** (Saga → Calendar): Gregorian (leap years), **Twelve Moons** (ours: twelve months of 30 days, the
  DnD Lite default), or the DM's own (1–24 months of 1–99 days, a label after the year). A Saga template file
  carries its calendar. **Today in the story** is set there or on the timeline.
- **Resource sub-events** are the DM's: pick the resource, click a suggestion from its type's list or type what
  happened. Members see a sub-event when they see its resource.
- **Timeline and list** (see "Timeline" above); the **moment slider** dims later events and sets the moment the
  relationship graph uses.
- **Eras** are the DM's, each with its own visibility (hidden at first), a colour and a note.
- A Saga template (a Saga's own copy, or a file) made before events existed gets the built-in event kind; one
  whose event kind predates end dates gets the built-in **Ends**, right after the date.

## Open points

- Real-world session link: should events also record in which game session they were played/revealed?

Decided (2026-11-25): the list is a plain list (no rails or year rows); the timeline has a Stage Set.

Decided (2026-11-24): events may last (an optional end date: periods on the timeline); the timeline is horizontal
with a list beside it (see "Timeline").

Decided (2026-11-23): every event has a date (new ones start on today in the story); sub-event lists come from the
Saga template (per type, editable); eras are the DM's, with visibility; resource sub-events take any text, the
type's list being suggestions.
