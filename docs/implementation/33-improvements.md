# 33 - Improvements: map tools, actions, Stage controls, archetypes, dice performance

Status: Done
Requirements: SET-80, SET-81 (were SET-25, SET-26, already taken), LOC-36, RUL-26, RUL-27, STG-30, CHR-23, TPL-16, DSP-24, SAGA-12
Depends on: 21-map-set-tokens-attention-pings, 27-map-layers, 30-actions-and-calculated-variables, 32-continuous-dice-surfaces

From the draft `docs/drafts/improvements.md` (deleted once built), in five parts. The user's answers: dice animations
are **on by default**; the **Action control** is the DM's and the players'; "classes" are named **archetypes**.

## 1. Map tools

### UX

In Play the map's tools toolbar reads, in groups (a thin line between them): **Select**, **Move**, **Highlight**,
**Grab attention** | **Reveal**, **Known**, **Hide** | **Full editor**; the brush and highlight options follow.

- **Select** (the default): drag the map (once zoomed), as Point did. Clicking a token opens its menu: for a character,
  **Open sheet** (with its ⚡ Actions); for every token **Focus on it** (the DM's view only), **Grab attention** (every
  view zooms to it; live Stages, tokens players see) and **Hide from players / Show to players** (who sees it: nobody,
  or all players).
- **Move**: drag tokens (they snap, as before) or the map around them; clicking a token (a map with layers) offers the
  map's other layers: the token moves to that layer, on the same tile (`tokens.layer`).
- The map's main options (the Set bar) end with a **Token…** picker after a thin line: picking a token focuses the DM's
  own view on it (players aren't moved; Grab attention does that).
- **Full editor › Layers**: the "Editing layer" dropdown is gone; each layer's row starts with **✎**, lit on the layer
  the tools below edit.

### Design

`MapTokens` gets `onPick` (a click: no drag) and `picked` (outlined) next to `onMove`; the Set's menu is a `Popover`
at the click; the sheet is `CharacterSheetModal`. Token visibility goes through `tokens.save`.

## 2. Actions: the editor, formulas, the Stage's Action control

### UX

- **Template › Actions** is a page of **action cards** (name, what it's on, its first lines in words, who runs it),
  filtered by search, **what it's on** (All · Characters · Items · Groups, with counts), **a type** (once on characters
  or items) and **who runs it**. **＋ New action** names one (and what it's on) and opens it. A card opens the
  action's **window**: **Settings** (name, description, what it's on, only for some types, who runs it, delete) and
  **Mechanics** (what it does in words, costs, gains, the actions it runs next).
- An amount is **Fixed** (a number), **Max** (a gain on a counter: fill it) or **Formula**. A formula has a
  **builder**: its text, a dice adder (a count, or a variable's worth, of d4…d100: "level d20"), the thing's variables
  as chips, operators; unknown names show at once; the server checks it on save.
- Running an action lists its rolls under its changes ("🎲 Thorin: level d4 + 1: 2d4 (3 + 1) = 5").

### Formulas

The calculated variables' small language (numbers, variables, + − × ÷, brackets, min max floor ceil round abs) plus
**dice**, only in actions (a calculated value must stay the same): `2d6`, `d20`, `level d20` (a variable's worth of
d20s) are written `roll(count, sides)` before parsing (`calculated.with_dice`); at most 100 dice of 2 to 1000 sides.
The variables are the thing the line is on (a cost's source, a gain's target): its numbers and counters (a counter: its
current). A formula is never below 0. The server rolls (`random.SystemRandom`) each time; every roll goes to the run's
log; the result's **rolls** are the DM's all, a player's only those on their characters (and their items and
groups): a formula reads values they may not see elsewhere.

### The Stage's controls

EFX Controls didn't need a Set, and neither does running actions: a Stage now has its own **controls**, on unless
turned off in Build's Stage panel (`stages.controls`: `{efx, actions, stages}`):

- **EFX** (the DM's): a button in the Set bar (when the Stage has an EFX layer Set) whose menu row holds the
  environment, an eye per layer and "Environments →" (what EFX Controls held). The **EFX Controls Set type is
  retired**: its Sets are deleted (the migration), the server refuses new ones.
- **Stages** (the DM's, asked for after the draft): first in the Set bar; its menu row shows which Stage is live (a
  red dot) in a picker ("Nothing live" too) and "● Make this one live" for the Stage on screen. Picking one makes it
  live; on the Stages page that Stage opens (in the same view), on the Stage tab the live Stage simply changes.
- **Actions**: for the DM a ⚡ button in the Set bar; for **players** a ⚡ Actions button at the bottom left of
  their live Stage (not viewers, not the live link). Either opens the **Action control**: what kind of thing
  (Characters, Items, Groups: the ones with something to run), which one, the action, **⚡ Run**; the result under it.
  The list comes from `GET /actions/actors`: the DM every character, item and group with actions; a player their
  characters, those characters' items and their groups, each with the actions they may run (the server's rules, as on
  sheets).

## 3. Archetypes

"Classes" that aren't only D&D's: a race, a class, a talent are all **archetypes** (the user's pick of name), each in
a **category** the Saga template names, each adding **character variables, level by level**.

### Design

- Template: `archetype_categories` `[{key, name}]` and `archetypes` `[{key, name, category, description, max_level
  (1-30), variables: [... each with its level]}]` (`domain/archetypes.py`). An archetype's variables are text, long
  text, numbers, yes/no, choices or counters; their keys are character keys (unique with the types' and other
  archetypes'), so actions, formulas and display templates use them like any character variable.
- A character's `archetypes` (a new column): `[{key, level}]` in order, each once, at a level it has (at most 20).
  It has an archetype's variables from their level on: **`Ruleset.def_for(resource)`** gives a resource's variables
  (its type's, plus its archetypes' up to their levels) and replaces `type_def` wherever values are read, shown,
  checked or changed (resources, sheets and cards, tokens, actions, calculated values, the desktop, the scene).
- Changing them is the **DM's** (like the category); new variables start at their default; a removed archetype's
  values stay on the character, unseen, and come back with it.
- **Changing by level** (asked after the draft: a Battle Master's superiority dice grow with the fighter's level): a
  variable is one key that comes at a level with its default and may **change at later levels**: `by_level`
  `[{level, value}]`, only the levels where it changes (sorted, each above the level it comes and within the
  archetype's levels, checked like its default). A counter's change is its **max** (superiority dice: 4 at level 3, 5
  at 7, 6 at 15). The value in force at a level is the last step at or below it (`domain/archetypes.value_at`).
  When a character's archetypes change, the server applies them (`apply_levels`, on create and update):
  - a variable the character gains takes the value in force at its level (a counter: that max, full);
  - a level change that **crosses** a change (up or down) sets the new value; a counter's current moves by as much as
    its max (what was spent stays spent), kept between 0 and the max;
  - a level change that crosses none leaves the values alone: a manual edit stays until a change is crossed.
- **Display templates**: system elements `@archetypes` (all, by category order) and `@archetypes:<category>` (one
  category's, labelled with its name): "Dwarf", "Warrior 4" (the level when it has more than one), "Lucky".

### UX

- **Template › Archetypes** is a page of **archetype cards**, as Actions is: each card the archetype's name, category,
  description, its variables, levels, "N changing by level" and how many characters have it; filtered by search and
  by **category** (chips, with counts). **Categories…** (a window: rename in place, ✕ when it has no archetypes, ＋
  Add); **＋ New archetype** names one (and its category) and opens it. A card opens the archetype's **window**:
  - **Settings**: name, category, description, levels, how many characters have it, delete (only when none does);
  - **Variables**: the list by the level each comes at (Level 1, Level 3…), each row its type, name and "changes at
    7, 15"; the picked one's editor beside it: the template's variable editor plus **Comes at level** and **Changes by
    level** (a row per change: a level from those left, the value, ✕; "＋ A change at a level"; a summary "By level:
    3: 4 · 7: 5 · 15: 6"); ＋ adds a variable;
  - **Progression**: a table, a row per level and a column per variable: where it comes and where it changes (lit,
    with the value), the value it keeps (plain), nothing before it comes; a column's head opens that variable.
- **The character editor › Archetypes** (between Identity and Variables): a column per category, each archetype with
  its description, **Level n of max** and ✕; "＋ Add a race…" from the category's others. Players see theirs, read-only.
  Changing a level or an archetype lists **On Save** what Save will change ("Superiority dice (Fighter): 4 / 4 → 5 /
  5"). **Variables** shows a section per archetype ("Fighter 3") with the variables it gives; one that changes by
  level has a note "By level: 3: 4 · 7: 5 · 15: 6" with the step in force lit. Saved with Save.

## 4. Dice performance

Saga → User › **Performance** (each member's, on their screen only): **Turn off dice animations** (rolls show where
they land, the tray's dice stay still; the scene draws only when something changes) and **Simplify dice visuals**
(everyone's dice as plain 3D dice in their roller's colour: the Minimalist look on a standard material, no style
maps, relief or shader work, nor their CPU-built maps). Both off by default. `saga_members.dice_still`, `dice_simple`;
`DiceScene` `still` and `simple`.

## Steps

- [x] Map: Select and Move, the grouped tray, a token's menu, its layers, the token focus, the editor's ✎.
- [x] Formulas with dice (domain, run log, visible rolls), the actions page and window, the formula builder.
- [x] Stage controls (model, view, update), EFX Controls retired (migration), the actors list, the Set bar and the
  players' control, Build's toggles.
- [x] Archetypes: template, commands, the character's column, `def_for` everywhere, display elements, the editors.
- [x] Dice settings and the still and simple scenes.
- [x] The archetypes page as cards with a window (Settings, Variables, Progression); variables changing by level
  (template, the server applying them to characters, the editor's On Save and by-level notes).
- [x] Tests (backend: formulas, rolls, actors, controls, archetypes, settings; frontend: Set bar controls, archetypes,
  display elements), checks in the running app, docs.

## Changes from the draft

- **Archetypes** is the name the user picked for "classes". A character's archetypes are the **DM's** to change (like
  its category); players see them. Levels go to 30; variables are numbers, words, choices and counters (no calculated
  or dates).
- **Grab attention** stays a button in the tools group (it acts once; it isn't a mode).
- **Select's token menu** has what fits a token from the Actors Scene card's: the sheet (with Actions), focus, grab
  attention, hide/show; the scene-only ones (spotlight, tabs, remove from the scene) don't apply.
- **Moving a token to another layer** is a click with Move (a menu of the other layers), not a separate tool.
- **Formulas** read the variables of the thing each line is on; dice show in the result (players: on what's theirs).
- **The Action control** lists the DM's everything, a player's own characters, their items and their groups (not every
  character an "any player" action could reach).
- **The EFX control shows only on Stages with an EFX layer**; turned off, the DM still picks the environment in Build.
- **The Stages control** (go live with any Stage) was added after the draft, on the same pattern.
- **The archetypes page** was first a list with the picked archetype under it (as Actions' first page); it was hard to
  use, so it got the actions' treatment: cards and a window with tabs.
- **Variables changing by level** were asked after the draft. Two ways were weighed: a same-named variable at a later
  level replacing the earlier one, or one variable with the levels where it changes. The second (the user's
  preference) keeps one key for actions, formulas and display templates and puts a variable's whole progression in
  one place. The tools that make it clear: the Progression table, the changes' summary, the editor's On Save and the
  lit step in Variables. A counter changes its max (the current follows), not its current.
- **Turn off dice animations** also stops redrawing a still scene (the draft's performance aim); the User page's
  preview keeps the member's style with Simplify on (it's where they pick it).
