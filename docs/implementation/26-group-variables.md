# 26 - Group variables and the group editor

Status: Done
Requirements: CHR-21, CHR-22, TPL-15 (CHR-5 and CHR-12 reworded)
Depends on: 05-groups-and-encounters, 14-saga-template-editor

From the draft `docs/drafts/group_variables.md` (deleted once built).

## Goal and design

Some things belong to a whole group, not to one character: a party's shared gold, its reputation, an encounter's
morale. The Saga template defines **group variables**, like it defines the variables of characters or items, and every
group of characters (Characters → Groups) has values for them.

### The Saga template

- A new list in the template document: `group_attributes` (the variables every group has), beside `kinds`. Exported
  and imported with the rest; checked by the ruleset parser like any variable.
- The Template page gets a **Groups** tab: "Every group" variables, added, edited, moved and deleted like a kind's
  shared variables (the same commands, `kind: "group"`; the types a DM adds: text, long text, number, yes/no, choice,
  counter, date). Groups have no types.
- Groups are the DM's (players don't see them yet), so the editor doesn't ask who sees and edits a group variable; the
  rules are kept in the definition (players and viewers see, admins edit) for when players get a view of their party.
- DnD Lite gets one: **Shared gold** (a number, 0 to start).

### Groups

- A group keeps its values (`character_groups.attributes`, JSON), checked against the template's group variables (like
  a resource's values); values of a deleted variable stay, unseen, and come back if it does.
- **The group card** loses its toggles (Player party, Active, Favorite) and its click-to-rename: it shows the group's
  name, its state (★ favorite, "Active"), its creatures (counts, ＋ Add creatures, remove) and its variables' values,
  with **Edit** and Delete.
- **Edit** opens the group's editor (a modal):
  - **Group**: name, colour, Player party, Active, Favorite (the system variables);
  - **Variables**: every group variable of the template, edited like a character's;
  - Save (one change; the server checks every value), Cancel.

## UX

- The card stays a glance: who's in it and what it holds; changes happen in one place, the editor.
- The same fields as a character's editor, so nothing new to learn.

## Steps

- [x] Template: `group_attributes` (parser, commands with `kind: "group"`), DnD Lite's Shared gold; tests.
- [x] Groups: the `attributes` column (migration), values checked on save, sent with the group; tests.
- [x] Frontend: the Template page's Groups tab; the group card and its editor.
- [x] Checks in the running app, docs.

## Changes from plan

- The Template page's Groups tab hides what doesn't apply to groups: who sees (in the list and the editor) and "Lists
  can sort by it".
- A failed save shows its reason in the editor (the page's message is behind the modal).

## Changes from the draft

- **The colour and the name** moved to the editor too (with Player party, Active and Favorite), so the card has no
  controls of its own besides its creatures, Edit and Delete; it shows the state (★, "Active") and the values.
- **The variables are the template's** (a Groups tab on the Template page, the same commands as other variables), and
  DnD Lite has one to start (*Shared gold*).
- **Players don't see group values yet**: groups were already the DM's only. The variables keep who-sees rules for
  when they do (an open question).
