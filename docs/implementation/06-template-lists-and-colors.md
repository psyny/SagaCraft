# 06 - Template lists, colors and scene casts

Status: Done
Requirements: DSP-12..20, CHR-12..14, SET-35..37, DSP-2, DSP-4, DSP-5, DSP-8, CHR-2, SET-25, SET-26 (changed)
Depends on: 05-groups-and-encounters

## Goal

Make display templates easier to shape and closer to how a table reads cards: each region of a card or
sheet is an ordered **list of elements** the DM adds, orders and styles. Give groups and templates a
**color**. Make every tab of an Actors Scene show the same creatures (the cast belongs to the scene). Small
fixes on the Groups page and the scene's turn controls.

## Out of scope

- Light themes (the "theme" color is the dark theme's).
- Other system elements than name, category and group.
- Per-character templates (DSP-11).

## UX

**Groups tab**: two sections, **Player parties** and **Other groups**. Each card has a color swatch
(palette, one click).

**Actors Scene**

- The "Turn" tag sits outside the current card, centred above it, in the card's group color.
- Turn controls are a bar right below the title and the tab strip (Play, when the tab has them on). In
  Build, the same bar holds "+ Add creatures".
- Every tab has the same creatures. A card is shown or hidden per tab ("Shown in" toggles in its menu);
  adding creatures reveals them only in the tab they were added from (when "Add and reveal").

**Display templates**

- A template has a **color** (swatches + any color).
- For each mode and view, the editor shows the mode's **regions**; each region is a list: "+ Add" offers
  the values and the system elements (Name, Category, Group) not used yet; rows move up/down (and to
  another region) and are removed with ✕. Values not added are not shown (there is no "hidden" place).
- Each element has a **Value style** (bar, number, discrete for counters) and a **View style**: bar shape
  (rounded, flat), gradient, discrete icon (balls, hearts, diamonds, squares), color (theme, group,
  template), number color (contrast, theme, black, white; bar and number styles), "Show the name".
- Regions:

| Mode | Regions |
|------|---------|
| Face, Full, None (cards) | Top (1: the name by default), Bottom, Hover left, Hover right, Hover bottom |
| Immersive (sheet) | Top left, Top center (the name), Top right (1 each), Bottom center, Bottom panel, Hover left, Hover right |
| Informative (sheet) | Header (at most 4, next to the face), Body (pages: "‹ 1 / 3 ›" at the bottom when it doesn't fit) |

- Pictures are shown either in the **card ratio** (5:7: full cards, immersive sheets) or as their **face
  crop** (1:1: face cards, informative sheets, small portraits). The immersive sheet has the card's ratio.
- The immersive sheet no longer shows the category under the name (add the Category element to show it).

## Design

**Template config v2** (`domain/display.py`)

```json
{"version": 2, "color": "#b48cf2",
 "modes": {"face": {"player": {"top": [{"key": "@name"}], "bottom": [{"key": "hp", "style": "discrete"}], ...},
                    "dm": {...}}, ...}}
```

- Element: `{key, style, bar, gradient, icon, color, number_color, show_label}`; `key` is an attribute key
  or a system element (`@name`, `@category`, `@group`). Each key at most once per mode and view.
- Older configs (per value `{style, display_on}`) are upgraded when read (card → bottom, hover → hover
  bottom, shown → bottom panel, highlight → header, body → body; the name goes on top).
- Built-in templates follow the ruleset as before, written as lists.
- Rendered values carry `region`, the view style, and `color` resolved to a color (group or template;
  null: theme). DM only: `player_style`, `player_region` (`hidden` when players don't get it).
- Controllers still see on their character's sheet what the ruleset lets them see: DM-view elements
  missing from the players' view are added in the DM's region.

**Colors**

- `character_groups.color` (palette by default). A card's group: the group it was added with (kept in the
  actor's config), else the character's first group. It colors the current-turn highlight, the Turn tag
  and the "group" element color.
- A template's color is in its config.

**Saga template (DnD Lite)**: categories **Player** (PC), **Major NPC** (NPC, not instanceable) and
**Minor NPC** (NPC, instanceable). Each category of the Saga template gets its own built-in template (made
from its type) as its default.

**Actors Scene**: the cast is the scene's: every actor is in every tab; `actor.config.tabs[tab_id]` keeps
only `shown` and `position` (missing: hidden). `card.tabs` is gone; deleting a tab never removes
creatures; "Remove from the scene" deletes the actor. `place_actors` options gain `sources` (the group
each creature came from).

## Steps

- [x] Docs: concepts, requirements, glossary, decisions, this plan.
- [x] Backend: template config v2 (lists, view styles, regions, upgrade, validation, render), template color.
- [x] Backend: group color (migration), Saga template categories and their templates, scene-wide cast.
- [x] Frontend: template editor (regions, element lists, styles, color), cards and sheets (regions, hover
  sides, pages, card ratio), value view styles.
- [x] Frontend: Groups page sections and colors; scene (turn tag, controls bar, build bar, shown-in tabs).
- [x] Tests (backend, frontend).

## Tests

Backend: upgrade of old configs; validation (unknown key, duplicates, one-element regions, header ≤ 4,
style per type); players never get elements outside their lists; controllers' extras; system elements;
color resolution (group, template); scene cast shared by tabs, tab delete keeps actors, add reveals in one
tab; group color and source group. Frontend: card regions and hover trays, sheet pages, editor list
actions.

## Changes from plan

- A character's "first group" (for its color when it wasn't added with a group): player parties first, then
  favorites and the DM's order.
- The informative sheet keeps the name fixed next to the face, with the category name under it; the
  header and page body are the lists. The immersive sheet shows only its lists (the name is its top center
  element).
- Pages are measured in the browser (an invisible copy of the body, as wide as the page) and break where a
  page would grow taller than 300 px.
- Colors "group" and "template" also color numbers and text (unless a number color is chosen).
- The Saga template's categories get their templates when the Saga is created (with the categories);
  existing Sagas keep their categories and templates (their templates are upgraded to lists when read).
- In Build the bar under the tab strip shows on every tab; the tab strip's count is how many cards players
  see in that tab.
- The immersive sheet's hover sides also open with a tap (touch screens); card trays stay hover-only.
- Checked with API and component tests (backend on SQLite and Postgres, frontend with Vitest), a production
  build, and a render of the local Saga's old templates; the screens weren't tried in a browser.
