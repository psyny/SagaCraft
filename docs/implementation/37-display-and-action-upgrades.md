# 37 - Display and action upgrades

Status: Done
Requirements: DSP-29, DSP-30, RUL-32, RUL-33, RUL-34 (DSP-28, RUL-20, RUL-22, RUL-23, RUL-27 reworded)
Depends on: 30-actions-and-calculated-variables, 33-improvements (formulas with dice), 23-dice-roller,
34-small-improvements (cards in the card ratio)

From the draft `docs/drafts/improvements.md` (deleted once built), in two parts: display templates (cards and
immersive sheets) and the actions editor (changes, and an action's dice on the dice roller).

## 1. Display templates

### UX

- **A card's value band fits what it shows** (Face, Full, None): a value whose name isn't shown takes only its
  display's height; it no longer keeps the name's room. Face keeps its band's minimum; past it, the same.
  The DM's mark for a value players see otherwise (⦸, another style…) sits on the value's corner when its name is
  hidden, instead of bringing the name's row back.
- **Bars show on immersive sheets** everywhere: the title slots, the bottom centre and the side panels size their
  values to their content, and a bar has no width of its own, so it was drawn 0 wide (numbers and balls have one).
  There a bar gets one (140 px; 110 in the title).

### Design

- `CreatureCard.AttributeRow`: `no-label` when the name isn't drawn (`.attr.no-label { min-height: 0 }`: the 36 px
  minimum was the name, the gap and the display); the mark as `.player-mode.corner`.
- `styles.css`: `.sheet-title / .sheet-bottom-center / .sheet-hover .sheet-body .bar` get a width.

## 2. Actions

### UX

- **Mechanics**: the Fixed amount's field is 120 px (was 54).
- **Gains become Changes**: each change picks **Add**, **Remove** or **Set to**, then the amount and the variable.
  Add: a counter never passes its maximum (Max fills it). Remove: never below 0. Set to: the value (a counter at most
  its maximum; Max: to it). "What it does" reads "+5 HP", "−(1d6) HP", "Hit dice set to 0". A trigger's "No gains"
  is "No changes".
- **Saga → Settings → Actions**: "Roll their dice" (on by default). When an action's formula rolls dice and a Stage
  is live, its dice rollers throw them as the action rolled them, in the dice (colour and style) of the character's
  player (an item: its owner's; whoever ran it when they're one of them; else whoever ran it: a group, an NPC), with
  one result per formula on their row: "Mappy · Short rest (1d8 + 1) 5".

### Design

- `domain/actions.py`: `changes: [{target, variable, op, amount}]`, `OPS = add | remove | set`; triggers'
  `skip_changes`. `upgrade(action)` reads an action written before (gains: changes that add; `skip_gains`):
  `clean_actions`, `services/saga_templates.document` and `saga_template.update_action` go through it, so stored
  templates and old files read without a migration and are saved in the new form on their next change. The built-in
  DnD Lite file is written with changes. `changes()` (what changed after a run) is now `changed()`.
- `sagas.settings` (JSON; migration `f6c0d4e8a392`): `services/access.SAGA_SETTINGS = {"action_dice": True}`,
  `saga_settings(saga)`, `update_settings` (admins; `PATCH /api/sagas/{id}/settings`); the Saga overview gives them
  to admins.
- Set contract: `SetType.action_rolled(ctx, stage_set, roll)` (default: nothing). The dice roller adds a roll of
  the action's dice (their values the action's; dice it can't draw left out; at most 30), its groups typed `action`
  (the tray lists them by name after the roller). `services/actions._run` calls it on the live Stage's Sets (not put
  away) unless the action is a secret (notify "dm"), and the routes push the Stage.

## Follow-ups (after review)

- **Sheet-style cards take value clicks**: on the Actors Scene, the DM clicks a number or counter on an Immersive or
  Informative card to change it, as on Face, Full and No picture (plan 34 had left them out). `SheetView` and
  `SheetValue` take `onValueClick`; the scene finds the value in the card's sheet or its other looks (`findValue`).
- **A group's action reaches instances** (RUL-34): "each of its characters" runs, for an instanceable character, on
  each instance that came with the group (Stage actors with its `group_id`, on any of the Saga's Stages), as a thing
  of its own (`services/actions._World.instance`): its values are the character's with its own on top, and what
  changes is saved as its own values. The character itself is left alone, unless it has no such instances. The
  result names them ("Goblin 2"), and the Stages they're on are pushed. An instance's party (for its own triggers)
  is the group it came with.

- **Token: Hover over** (DSP-21): a token region whose values show in a tray centred over the token itself while
  the pointer is on it (`display.REGIONS["token"]`, `MapTokens.TokenValues`), next to the trays around it.
- **Deleting a display template** (DSP-2): only a default the templates page shows stops it (a category's, its own or
  the type's it follows; an item type's). A character type's default no category follows any more (each picked its
  own) was unseen and still blocked the delete ("This template is a default"); now it moves to the template the
  type's category uses (else the built-in one) and the template goes.

## Steps

- [x] Cards: values without names; the DM's mark on the corner; immersive bars.
- [x] Actions: changes with add, remove, set (backend, built-in template, reading older ones), the editor, the
  wider field.
- [x] Saga settings; an action's dice on the live dice roller.
- [x] Tests (backend: changes, older gains, settings, dice on the roller; frontend: describing changes, values without
  names), checks in the running app, docs.

## Changes from the draft

- **Remove** never goes below 0 and **Set** never passes a counter's maximum (like Add); **Max** is offered for Add
  and Set, not Remove.
- **Secret actions** (only the DM is told) aren't thrown on the dice roller: their dice would tell the players.
- The **DM's mark** on a value players see otherwise moves to the value's corner when its name is hidden; it used to
  keep the name's row, which is what made those bands taller.
- The dice go to every dice roller on the live Stage that isn't put away; dice the 3D tray can't draw (a d3) and any
  past 30 in one action are left out (the result still counts them).
- Not built: the draft's "(and maybe others)" for regions besides the cards' value band: the immersive and
  informative sheets already size their regions to their content.
