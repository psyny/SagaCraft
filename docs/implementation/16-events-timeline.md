# 16 - The events timeline

Status: Done
Requirements: EVT-15, EVT-16, EVT-17, EVT-18 (and EVT-1, EVT-7, EVT-11 reworded)
Depends on: 13-lore-relationships-events

## Goal

The events screen was a long list that read badly. Lore → Events becomes a horizontal **timeline** (with the list
kept as the other view): events on a line, periods as bars, eras along it, details on demand, a minimap to know
where you are. Events may now **last** (an end date), so a siege or a festival week is one event.

From the draft `docs/drafts/events_timeline.md` (deleted once built).

## Out of scope

- A timeline Set for Stages (EVT-10).
- Dragging events on the timeline to change their dates.
- Partial dates ("sometime in year 300").

## UX

- **Filters on top** (one panel): Timeline | List, search, Involving…, who made it, Clear filters; the type chips
  (each with its colour); From and To (each "the beginning" / "the end" when unset) and the eras' chips (one
  picks its period). Today in the story and the moment slider sit under it.
- **Timeline**: the line in the middle; ticks by zoom; eras in two alternating colours with long ticks and their
  names under the line (DM: click to edit); circles by type colour, bars for periods, piled up where they'd
  touch (periods first, circles over them); today and the moment as vertical lines; later events dimmed.
  Collapsed at first; click a mark (or Expand all) for a dashed line up to a box (title, dates, the start of the
  description) to the right or left, inside the view; click the box for the event modal. Wheel zooms, drag pans,
  − Fit ＋, ◉ Today. It opens around today and the events nearest it (a range asked for: exactly that range).
- **Minimap** under the timeline: the whole range, eras, events, today, and the part in view; click or drag.
- **List**: as before, with each event's dates (a period: "2 Goldmoon – 15 Emberfall 301") and its type colour;
  a card opens the event modal.
- **Event modal**: dates, type, description, involved, sub-events and relationships, "Open the event's page".
- **Ends** appears in an event's Details like any date ("No date" by default).

## Design

- **End dates**: a date variable flagged `ends` (`AttributeDef.ends`, only on optional dates; `TypeDef.end_attr()`).
  DnD Lite's event kind has `end` ("Ends"), version 0.4.0. `saga_template.locked` keeps it (like the date);
  `saga_templates.with_app_kinds` adds it right after the date to event kinds that predate it. `check_event_span`
  refuses an end before the date (create and update). Event views (`events._event_out`) carry `end`, read from
  what the viewer is sent (null if hidden or not after the date). No migration: values live in attributes.
- **Frontend**: `saga/lore/timeline/scale.ts` (pure): `dayNumber`/`dateOfDay` (a straight line of days in any
  calendar, leap years and negative years included), `ticksFor` (the first step of days, months or years whose
  ticks are ≥ 96 px apart), `stackMarks` (lanes), `placeBoxes` (rows; right, left, or slid inside the view),
  `clampView`, `zoomView`, `rangeOf`, `firstView`. `timeline/TimelineView.tsx` draws it (SVG for the line and
  marks, HTML boxes and era names, an SVG minimap); only what's near the view is laid out.
- `TimelinePage` keeps the filters (`filterEvents` gained from/to with `inRange`) and both views; `EventLines`
  and `EventModal` are their own files; `dates.formatEventDate` writes a period once.
- Type colours: eight, in the template's type order (`typeColor`), also on the type chips and list cards. Era
  colours on the line follow the draft (two, alternating); the DM's era colours stay on the chips and list rails.

## Steps

- [x] Backend: `ends` flag, the built-in Ends, older templates, span check, `end` in event views; tests.
- [x] Frontend: scale helpers, TimelineView with minimap, filters with dates and eras, list, event modal; tests.
- [x] Docs: events.md ("Timeline", Ends), requirements, glossary, decision, roadmap, AGENTS.md (and how to handle
  drafts); the draft deleted.

## Tests

- API: `test_lore.py::test_events_with_an_end` (ends sent to players, refusals on create and update, clearing,
  can't be deleted), `::test_older_event_kinds_get_an_end` (added after the date; a non-date `ends` refused).
- Frontend: `saga/lore/timeline/scale.test.ts` (days in both calendars and back, ticks per zoom, stacking, boxes
  inside the view, first view, ranges and clamping, the dates filter, period text).
- Checked in headless Chrome (the "Map check" Saga, with demo periods): collapsed and expanded timeline, the
  event modal, the list, an era picked as the range.

## Changes from the draft

- "Events that have a start [and an end]": events had one date only, so the end date was added (EVT-18).
- Boxes stay inside the view (left of the line near the right edge, slid in when neither side fits), and only
  rows that are needed are added, so the line moves down as boxes open.
- Eras' names sit under the line and open the era editor for the DM.
