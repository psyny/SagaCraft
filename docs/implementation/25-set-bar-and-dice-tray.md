# 25 - The Set bar, settings in Play, and the dice tray

Status: Done
Requirements: STG-28, STG-29, SET-71, SET-72, SET-73, SET-74, SET-75, SET-76 (STG-17, STG-23, STG-24, STG-25, STG-27,
SET-36, SET-40, SET-63, SET-65, SET-66 and SET-70 reworded)
Depends on: 03-build-and-play, 23-dice-roller, 24-general-improvements

From the draft `docs/drafts/stage_set_contro.smd` (deleted once built). The problem: a Stage's controls crowd the DM.

## Goal and design

### The Set bar (Stage core)

- **One bar across the top of the Stage** (the DM's Play and Build; on the Stage tab, beside its corner with ✕ and Full
  screen) with a button per Set: the Set type's **icon** (each type draws its own, `SetTypeUI.icon`), the Set's name as
  its tooltip. EFX layers (their main toolbar is hidden by default) aren't on it: EFX Controls is.
- Clicking a button **opens** that Set: its name shows beside the icon (the button widens and pushes the others) and a
  **menu row** opens under the bar: the **eye** (put away / bring back, icon only), **⚙** (settings, icon only), in Play
  **fold** (the Set's other toolbars away and back, icon only), then the Set's **main options** (what its view puts in
  `<Toolbar id="main">`). Clicking it again (or another) closes it. One Set open at a time, per browser.
- A put-away Set's button is faded with a crossed eye, so it can be brought back from the bar.
- **Main toolbars leave the canvas**: they only exist in the menu row, so Build's Controls no longer place them. Other
  toolbars (the scene's Turns, the map's tools and zoom, the dice tray) stay where the DM placed them. On an interface
  Stage, toolbars at the screen's top edge start under the bar.
- Players and viewers have no bar (main toolbars held only the DM's controls, and the players' fold for the dice: the
  dice tray now minimizes itself).
- **⚙ without a Play menu** (Relationship graph, Timeline, Desktop, Dice roller, EFX Controls) opens the Set's **settings
  in a window** over the Stage (its Inspector), instead of leaving for Build. In Build, ⚙ selects the Set in the side
  panel.

### Sets

- **Actors Scene**: its main toolbar (tabs, ＋ Add creatures in Build) goes to the menu row; Turns stays.
- **Map**: the main options are one button, the shown location's name: it opens a picker with the Set's locations on
  top ("On this map") and every other location below; picking one not on the Set adds it and shows it. Map tools and
  Zoom stay.
- **Relationship graph** and **Timeline**: a "What it shows…" main option opens their settings in a window (whose
  knowledge, the query or dates...), the same as ⚙. Their settings get **Delete**.
- **Desktop**: a **background** opacity slider (0–100%, default 78%: as before) in its settings. The Stage core draws a
  Set's panel with the opacity its type asks for (`SetTypeUI.background`).
- **Dice roller**: ⚙ and the eye only in the menu row. The **tray** toolbar holds everything else:
  - At the bottom: **minimize** (only the results stay; the tray never minimizes by itself), **roll**, **clear** (your
    own row: your waiting dice and your rolls), **clear all** (the DM: every row), then the **roll types**. A number in
    a circle over a roll type: how many of it you're about to roll; clicking it takes one back.
  - Above, the **results**: one row per roll, newest at the bottom, the roller's name on the left, each roll type's
    result in its column (over its button), its dice in small print.
  - Over all of it, the 3D dice waiting (as before).
  - **Your preparation is yours**: each member's waiting dice are their own row; players get only their own (the DM
    gets everyone's, to pick values); **Roll** throws only yours.
  - **Who can roll** (settings): everyone who sees it (default), or some groups and members (the DM always can).
  - **Rolled dice stay** on the Set until their roller (or the DM, with clear all) clears them; new throws bounce off
    the dice already there. Every screen keeps them where they landed. At most 12 rolls (60 dice): the oldest go.

## UX

- One place for every Set's controls, closed by default: the Stage stays clear; one click opens a Set's controls.
- Icons first, names when opened; tooltips always.
- Settings without leaving the Stage (no trip to Build during a session).
- The dice: one compact tray, results where their buttons are, no other player's half-built roll to misclick.

## Steps

- [x] Backend: dice tray per member, acts (take one, roll yours, clear, clear all), who can roll, rolls kept; Desktop
      background. Tests.
- [x] Stage core: the Set bar, icons, settings windows, main toolbars off the canvas, `SetTypeUI.background`.
- [x] Sets: the map picker, graph and timeline "What it shows…" and Delete, Desktop slider.
- [x] Dice: the tray (results rows, badges, controls, minimize), the scene with kept rolls and collisions.
- [x] Tests, checks in the running app, docs.

## Changes from plan

- The tray shows the **latest 4 rows**, "＋N earlier" for the rest: 12 kept rolls would otherwise fill the Set.
- The waiting dice and new throws keep clear of the tray's controls wherever the DM placed them (measured: how far the
  tray covers the Set from the tray's edge); rolls already on the Set wait for that measure before resting. A tray
  outside the Set (tried as the default) left it off screen after "Recenter" (the fit only frames Sets): it stays
  inside by default.
- Rolls from before this change (one shown roll and a history) become one row; the history is dropped.
- The Stage tab hides the Stage's name caption for the DM: the Set bar takes the top left.

## Changes from the draft

- **One Set open at a time**, closed by default; the menu row also has **fold** (Play), kept from plan 24, and the
  bar is in Build too (there ⚙ selects the Set in the side panel). Players have no bar: they had nothing in main
  toolbars but the fold, and the dice tray minimizes itself.
- **⚙ opens a settings window** for every type without a Play menu (Desktop, Dice roller, EFX Controls too), not only
  the graph and the timeline; their "What it shows…" opens the same settings.
- The map picker lists **every location** (not only those with a map picture): a location's map can be made later.
- **The DM sees everyone's waiting dice** (to pick values, SET-65); players only their own.
- **Clear** clears your waiting dice too, not only your results; the rolled dice of a cleared row leave the Set.
- At most **12 rolls (60 dice)** stay; the oldest go.
- Rest positions can differ between screens whose Set or tray differ in size (the numbers never do).

## After the review

- The menu row starts at the bar's left edge (not under the open button).
- **EFX Controls**: its controls are its main options in the Set bar: the environment in a dropdown (it was a chip per
  environment), the layers' eyes (Far, Near, Front) and "Environments →"; the Set itself is see-through and lets
  clicks through. A Set type whose panel is fully
  see-through (`SetTypeUI.background` 0) behaves like a transparent Set (no frame; its title only in Build and on
  hover).
- **Dice shapes**: the d4 is a crystal (a square prism with pointed ends: 4 numbered long faces, plain tips; it lies across
  the screen, its value on top), and a **d2** (a coin: a thin 24-sided disc, 1 and 2) joins the dice a roll type can
  use (server `domain/dice.py` SIDES). Faces without a number are plain (value 0); the atlas has a cell per number.
- **Hiding rolled dice**: the DM's eye in the tray (after Clear all) hides the rolled 3D dice for everyone (act
  `rolls.hide`; `rolled_hidden` resets on a new roll and on Clear all); clicking a rolled die hides it for whoever
  clicked (their browser). The Set now lets clicks through unless dice are waiting in the tray; the dice scene reads
  clicks over the Set's box with a window listener, so rolled dice still catch theirs (not over toolbars, the Set bar
  or dialogs).
- **An empty Desktop is invisible**: no panel, no "empty desk" message, and clicks go through (its type's `background`
  is 0 and `passThrough` true while it has no pieces); in Build its dashed outline, title and hint stay.
