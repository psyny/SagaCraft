# 30 - Actions and calculated variables (the ruleset editor's first rules)

Status: Done
Requirements: RUL-20, RUL-21, RUL-22, RUL-23, RUL-24, RUL-25 (TPL-12 done by them)
Depends on: 14-saga-template-editor, 20-character-item-editors-user-page, 26-group-variables

From the draft `docs/drafts/rulesets.md` (deleted once built).

## Goal and design

The Saga template gets **rules**: **actions** that spend some values and give others (a short rest spends a hit die
and gives back HP; a party's long rest runs every member's), and **calculated variables** read from other things (the
weight a character carries). They're data, like the rest of the template: no game is hard-coded.

### Actions (the template's `actions`)

An action: a **key**, a **name**, a description, what it's **on** (characters, items or groups; optionally only some
types of characters or items) and **who can run it**:

| Who | Characters | Items | Groups |
|-----|------------|-------|--------|
| **owner** | its players in control | its owner's players | the players of its characters |
| **group** | the players of its party's characters | the same, from its owner | the players of its characters |
| **players** | any player | any player | any player |
| **admins** | the DM | the DM | the DM |

The DM can always run an action; viewers never. Then three lists:

- **Costs**: `source`, `variable`, `amount`, `consume` (take it away, else only check it's there), `required` (not
  enough: the action doesn't run). Not required and not enough: it takes what there is (never under 0).
- **Gains**: `target`, `variable`, `amount` (a number, or `max`: up to a counter's maximum).
- **Triggers**: `target`, `action` (one on the target's kind), and `skip_costs`, `skip_gains`, `skip_triggers`.

Sources and targets, by what the action is on:

| On | `self` | `character` | `group` | `group_characters` |
|----|--------|-------------|---------|--------------------|
| characters | the character | — | its party | — |
| items | the item | its owner | its owner's party | — |
| groups | the group | — | — | its characters |

A character's **party**: the active player party it's in, else its first player party, else its first group. Values
are numbers or counters (a counter's current value; gains never pass its maximum). Group values are the group
variables (plan 26).

**Running** (one change: all or nothing): costs, gains, triggers in order, the triggered actions run as part of it
(with the runner's right to run the first one). A loop (an action triggering itself on the same thing) stops, and
chains are at most 8 deep. The result lists every change ("Thorin · HP 4 → 9").

### Calculated variables (type `calculated`)

A variable whose value is worked out, never typed (`calc`):

- **From a list**: `op` (sum, count, min, max, average) of a `variable` over `of`: a character's **inventory** (its
  items; `times`: an item variable to multiply by, e.g. quantity) or its **groups**; an item's **owner**; a group's
  **characters**.
- **A formula** of the thing's own numbers and counters: `+ - * /`, brackets, `min`, `max`, `floor`, `ceil`, `round`
  (`strength * 15`).

The server works them out when it sends a character, an item or a group (cards and sheets too); nobody can write them.

### Where

- **Saga → Template**: an **Actions** tab (the actions by what they're on; an editor with its costs, gains and
  triggers); calculated variables are added like any (their calculation edited in the variable's panel).
- **The character editor, the item editor**: an **Actions** tab (when it has actions): each action on it (and on its
  party, for the players who may), what it does in words, **Run**; the result shows. Running is at once, not with
  Save; the editor takes the new values in, keeping what's being edited.
- **The group editor**: its actions under its variables, Run (the editor then saves only the values changed in it,
  so a run isn't undone). A group card's **⚡ Actions** runs them without opening the editor.
- **A character's sheet** (Characters, the Actors Scene): **⚡ Actions** next to Relationships, when it has some (not on
  an instance's sheet: its values are the instance's, actions change the character).
- DnD Lite gets examples: a **Hit dice** counter on characters, **Short rest** (spend a hit die, +5 HP),
  **Long rest** (HP and hit dice to the max), the party's **Long rest** (every member's), a calculated **Weight
  carried** (the inventory's weight).

## Steps

- [x] Domain: actions (parse, check against the variables, run), calculated values (lists, formulas); tests.
- [x] Template: actions and calculated variables in the document, commands; DnD Lite examples.
- [x] Services and routes: list and run actions (characters, items, groups), calculated values out; realtime.
- [x] Frontend: Template › Actions, calculated variables' editor, Actions tabs (characters, items, groups, sheets).
- [x] Checks in the running app, docs.

## Changes from the draft

- **Places by what the action is on**: the draft's sources and targets (character, item, group, all characters in
  group) become *itself*, *its owner* (items), *its party* (characters and items: their owner's) and *each of its
  characters* (groups), so a list only offers what makes sense for the action.
- **Gains can fill a counter** (`max`): a long rest is "HP to the max", not a guessed number. Counters never pass
  their maximum. Not-needed costs take what there is.
- **Who**: the draft's four choices, plus the DM can always run an action and viewers never.
- **All or nothing**, loops stop, chains at most 8 deep: a party's long rest with no ration left changes nothing.
- **Fixed amounts, no dice** (light tracking): DnD Lite's short rest gives back 5 HP; the table rolls if it wants
  to. No spell slots: DnD Lite has none.
- **Results per viewer**: a player running the party's rest sees their own character's and the party's changes,
  not other players' hidden HP.
- **Groups**: besides the group editor, a group card has **⚡ Actions** (one click during play). Players run a
  party's actions from their character (its Actions), since groups are the DM's page.
- **Sheets**: an Actions button opening a window, like Relationships (the draft said a tab); not on an instance's
  sheet.
- **Missing values**: a number or counter added to the template after a character was made counts at its default.
- **Calculated variables**: over a list (total, count, lowest, highest, average, optionally multiplied by another
  variable) or a formula; shown read only in editors, as numbers on cards; DnD Lite's Weight carried is seen by the
  DM and the character's players (like the inventory).
