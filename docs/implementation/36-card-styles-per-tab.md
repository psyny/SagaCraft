# 36 - Card styles per tab

Status: Done
Requirements: SET-85 (reworded)
Depends on: 34-small-improvements (the default and evidence card styles)

From the draft `docs/drafts/improvements.md` (deleted once built).

## Goal

The Actors Scene's **default card style** and **evidence card style** were the scene's, in its settings, as rows of
buttons that overflowed. They become each **tab's** layout settings, picked from **lists**: an exploration tab can
show full pictures while the combat tab shows faces with the current creature drawn as its sheet.

## UX

- The tab's layout settings (Build's side panel under "Tab …", and Play's ⚙) get **Default card style** (a list: Face,
  Full picture, No picture, Sheet: immersive, Sheet: informative) under the layout; a turn bar tab also **Evidence
  card style (the current turn's)**. The scene's settings no longer have them.
- A tab saved before takes the scene's styles; a **new tab** takes the active tab's (the DM who likes full pictures
  doesn't set it again).
- In Build, the DM looking at another tab sees its cards in that tab's style.

## Design

- `set_types/actors_scene.py`: tab settings `card_style`, `evidence_card_style` (`tab.set`), out in each tab;
  `normalize` moves the scene's (before) into tabs without their own and drops them; the Set's config refuses them.
- Cards come in the active tab's style, with **looks** (`card.looks[style]`: style, picture, values, sheet) for the
  other styles they're drawn in: the DM's other tabs' default styles, and a turn bar's current creature in its tab's
  evidence style (the DM: any tab; players: the active one). This replaces plan 34's `card.evidence`.
- Frontend: `inStyle(card, style)` (`types.ts`) picks a look; `tabView` draws a tab's cards in its style, the view
  the drawn card in its tab's evidence style. `CardStyleField` in `PlayMenus.tsx`.

## Steps

- [x] Backend: tab styles, migration, looks; tests (migration, per tab, looks for the DM and for players, a new tab).
- [x] Frontend: lists in the tab settings, the scene's removed, looks; tests (`tabView`, `inStyle`).
- [x] Checks in the running app (Build: a tab in Full, a turn bar in Face with an immersive evidence card); docs.

## Changes from the draft

- The **evidence** list shows only on turn bar tabs: the only layout with a card in evidence.
- A **new tab** takes the active tab's styles rather than Face.
- The list's names say which are sheets ("Sheet: immersive", "Sheet: informative").
