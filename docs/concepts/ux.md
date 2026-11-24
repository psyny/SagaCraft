# User experience (UX)

**UX is SagaCraft's top directive.** It ranks above every other goal, including Stages and Rulesets:
those are the core *features*; UX is how every feature must feel.

SagaCraft exists to **aid** RPG playing. The game happens between people at the table. The app must
help and then **get out of the way** as much as possible.

## Why it matters most for the DM

The DM is narrating, voicing characters, tracking the story and reading the table, all at once.
Every click, menu or wait the app adds is attention taken from the adventure. The better the UX, the
more the DM can focus on actually narrating. A feature that works but demands attention at the wrong
moment is a failed feature.

Players matter too: they should glance at the app, get what they need, and look back up at the table.

## Principles

- **Fewest steps for frequent actions.** Showing a Stage, revealing an item, grabbing attention,
  changing HP: one or two actions, reachable without hunting through menus.
- **Capture fast.** Adding a relationship or an event during play must take seconds: autocomplete,
  recent choices first, create missing resources on the fly, details later.
- **Prepare before, act during.** Heavy work (building Stages, writing lore, setting visibility) happens
  before the session. During play, the DM triggers what was prepared.
- **Play vs. Build.** In-session screens (the Play view) look like what players see and act through popups
  on the thing clicked. Detailed settings live in the Build view, showing only what was selected.
- **Don't interrupt.** No confirmation dialogs for reversible actions; offer undo instead. No pop-ups
  that block the table.
- **Glanceable.** Information readable at a glance, at table distance, on a phone, in dim light.
- **Forgiving.** Mistakes are easy to undo; nothing is shown to players by accident (safe defaults:
  hidden until revealed).
- **Fast.** Actions feel instant; real-time updates reach players quickly; no spinners mid-scene.
- **Consistent.** The same gesture does the same thing everywhere (reveal, drag, open, link).
- **Fit the device.** DM on laptop/tablet (maybe with a second screen), players on phones: each layout
  designed for its device, not shrunk from another.
- **Hide complexity until needed.** Flexible features (Stages, Rulesets, groups, permissions) have
  simple defaults; advanced options are there when asked for, not in the way.

## Future: hands-free help (speech and AI)

A long-term direction, aligned with "get out of the way":

- **Speech recognition**: the DM says "show the tavern map", "goblin two takes 7 damage", "reveal the
  letter to Ana", and the app does it.
- **AI assistance**: e.g. suggesting what to show next, summarizing the session into the saga log,
  finding lore by meaning, drafting NPC details during prep.

Not in the first versions. Designs should keep it possible: app actions should be well-defined commands
(with clear names and parameters) that a UI button, a shortcut, a voice command or an AI could all trigger.

## Navigation

Entering a Saga (signing in, or picking it on the Sagas list) lands on its **Stage** when one is live, else on
its **Saga** tab (the DM's Members, everyone else's User page): with nothing live, the Stage tab would be empty (plan 44).

The top bar has one tab per page: **Stage**, **Stages** (DM), **Characters**, **Locations**, **Items**,
**Lore**, **EFX** (DM: environment effects), **Saga** (DM). A page's sections sit in the **section bar**, a second menu strip right under the top
bar that names its page ("Lore ›") and underlines the section you're in, on every page of that section (a
document's page too); each section has its own address and the page's heading is the section's name:
Characters › Characters | Groups; Locations › Places | Fog presets; Lore › Documents | Events | Relationships;
Saga › Members | Template | Display templates | Calendar | Settings. A page with one section for you (a player's
Characters) has no bar. Anything
about how the Saga is set up goes in the Saga page, not in a new top tab. Moved pages redirect from their old
addresses. The **Stage** tab is the exception: the live Stage takes the whole window (✕ goes back).

## The combo tray

Wherever several things can be picked together (who can see, who can edit, players in control, owners, a character's
groups, a member group's members), the form shows **one button** that says the pick ("All players · Owner", "Ana,
Bruno +2") and opens the **combo tray**: a roomy picker in sections, the special cases first (Admins only, All
players, Owner, Inherit), then groups, then each person (with a search once the list is long). Picks apply at once;
Done or Esc closes it. Chips laid out in place stay only for short fixed lists (filters, a few options).

## How to apply

- Every implementation plan has a **UX** section: who uses it, during prep or play, the main flows and
  how many steps they take.
- When a choice trades UX against something else (simpler code, more features, flexibility), UX wins by
  default; if the trade is big, ask the user.
- Test new screens in the real situation: a DM running a scene, a player on a phone at the table.
