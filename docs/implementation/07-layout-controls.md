# 07 - Layout controls

Status: Done
Requirements: SET-38, SET-39, SET-30 (changed)
Depends on: 06-template-lists-and-colors

## Goal

More control over how each Actors Scene layout places cards, without leaving the table.

## UX

The layout settings (Play: the scene's title menu; Build: the side panel) gain sliders, previewed live while
dragging and saved on release:

| Layout | Sliders |
|--------|---------|
| Every layout | Distance to top |
| Grid, Turn bar | Horizontal space, Vertical space (turn bar: from the bar to the drawn card) |
| Row | Horizontal space (one line: no vertical space) |
| Column, Circle | Spacing |
| Boundary | Spacing, Neutral zone (%), Scatter (px) |

Boundary: player characters fill from the top left corner rightwards then down; the others from the top
right corner leftwards then down.

## Design

- Tab settings: `top` (px, default 16, max 600), `spacing` (horizontal, or the only spacing), `spacing_y`
  (vertical), `neutral` (% of the width, 0-80; Dialog's default 20), `scatter` (px, 0-80; older `true`
  becomes 12). Set with `tab.set`; sent to players with the tab (they place cards the same way).
- `layout.ts`: `tabLayout(tab)` turns a tab into `computeLayout`'s gap and options; scatter uses the card's
  stable hash, up to `scatter` px each way on x and on y.

## Steps

- [x] Backend: settings, limits, older scatter.
- [x] Frontend: layout math, sliders.
- [x] Tests, docs.

## Changes from plan

- Free layout: the distance to top applies to cards not placed yet (placed cards keep their positions).
- Checked with layout and API tests and a production build; not tried in a browser.
