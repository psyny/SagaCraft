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
| **Date** | One exact date in the Saga's calendar (e.g. day 1 of the month Arara, year 300). No partial dates, no durations: periods are **eras**. |
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
year 300). Eras give the timeline its big structure without making every event a range.

- Eras can overlap (a war inside a dynasty).
- Eras are shown as bands on the timeline and can be used as a filter or as a jump target for the slider.
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

A **timeline screen** shows the Saga's events in date order (list and visual timeline), with eras as
bands, filtered by what the member can see, by resource, by event type, by creator.

A **timeline slider** sets "the moment in the story" for other views:

- The relationship graph shows only relationships active at that date (start ≤ date ≤ end; "always"
  counts as open on that side).
- Resource pages could show the resource's history up to that date.

The timeline could also become a Set type on Stages (show the players "what happened so far").

## Open points

- Undated events: allowed (e.g. "sometime before the war"), or every event needs a date?
- Where the default sub-event types per resource type come from: the app, the ruleset, or both.
- Who creates eras: admins only, or players too (in their groups, like relationships)?
- Real-world session link: should events also record in which game session they were played/revealed?
