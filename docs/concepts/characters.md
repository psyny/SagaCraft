# Characters: types, groups and instances

A Saga is played as a series of **encounters between groups**: the party meets the goblins at the bridge,
then the duke's court. SagaCraft keeps the characters organized the same way, so that putting an
encounter on a Stage is a few clicks, not a hunt through a list.

Two concepts organize characters, and one decides how they are put on Stages:

| Concept | Answers | A character has |
|---------|---------|-----------------|
| **Type** | What kind of character is this? (player, major NPC, minor NPC, boss...) | exactly one |
| **Group** | Who goes together? (the party, "Goblin ambush", "The duke's court") | any number |
| **Instanceable** | Can it appear many times, each with its own values? | yes or no |

## Saga template

A **Saga template** is what a Saga is built on: its variables (attributes per kind and type), its character
**types**, its starting **groups**, and more (see `rulesets.md`, "Saga templates"). Each Saga has its own copy, made
when the Saga is and edited on the **Template** page; a system admin picks a built-in template or uploads a template
file when creating a Saga. A template file can also carry Stages, EFX environments and groups (plan 41).

DnD Lite's Saga template (0.5.0, plan 41: the Saga the DM adjusted for play):

| Character types | Key | Player characters | New characters instanceable | Display template |
|-----------------|-----|-------------------|-----------------------------|------------------|
| **Player** (Players) | `pc` | yes | no | "Player character" |
| **DM** (DM characters) | `dm` | no | no | "NPC" |
| **NPC** (NPCs) | `npc` | no | yes | "NPC" |

Until 0.5.0 DnD Lite had **Player**, **Major NPC** (named characters the story follows, not instanceable) and **Minor
NPC** (the ones that come by the dozen, instanceable); Sagas made before keep them (each Saga owns its template).
A type with no display template of its own gets a built-in one, made from it, so the DM can make them look
different. (Until plan 40 a Saga also had character **categories**, each based on a type; they were merged into the
types: see below.)

| Groups | Player party | Active | Favorite | Color |
|--------|--------------|--------|----------|-------|
| **Player Party** | yes | yes | yes | blue |
| **Enemy** | no | no | no | blue |

The defaults are applied once, when the Saga is created (or the first time an older Saga is opened).
After that they are the DM's: renamed, deleted or added to like any other. An export takes the Saga's groups as they
are then (without their characters), as the starting groups of a Saga made from the file.

## Types

A character's **type** is the main way the Saga organizes its characters: the Characters page has one section per
type, and display templates have a default per type. The type is the Saga template's: it gives the character its own
variables (on top of what every character has), who sees each shared one, and:

- **Player characters** (flag): characters of this type belong to the players' side (the Actors Scene's *boundary*
  layout puts them on the left) and new ones join the active player parties. Player characters are never
  instanceable.
- **New characters instanceable** (flag): the default of the *instanceable* box when creating a character of this
  type.
- The DM adds, renames and deletes types in Saga → Template → Characters → **Types** (the Characters page's Types
  button opens it). A type with characters can't be deleted, nor the last one. A character moves to another type
  in its editor (Admin → Type, the DM's); values the new type doesn't have stay hidden on it.

Until plan 40 there were two things: **types** (the template's: variables) and **categories** (the Saga's: name,
flags, sections, display defaults), each category based on a type. Every place used the category and only the
variables used the type, so they were merged: each category became a type. Older Sagas and template files are
converted (`domain/saga_template.merge_categories`; the migration `b8e2f6a0d514`): the first category of each type
keeps the type's key, the others become copies of it.

## Groups

A group is a set of characters that go together; sometimes called a **party**. A character can be in
many groups. The DM manages them in the **Groups** tab:

- Two sections: **Player parties** and **Other groups** (encounters, courts, crews).
- Cards, **favorites first**, each showing its **name** (★ when a favorite, "Active" when active), its **color**,
  its **variables'** values and its **creatures** (pictures and names).
- An instanceable character appears in a group with a **count** ("Goblin × 3"): adding the group to a
  scene creates that many instances.
- Add and delete groups; add and remove creatures. **Edit** opens the group's **editor**: **Group** (name, color, the
  flags **player party**, **active**, **favorite**), then its **variables**: the Saga template's group variables
  (Template → Groups), edited like a character's (a party's shared gold, an encounter's morale). Save checks every
  value; a deleted variable's value stays hidden on the group. Under them, the template's **actions** on groups
  (a party's long rest), each with Run; a card's **⚡ Actions** runs them without opening the editor.
- A group's **color** follows its creatures onto Stages: a card has the color of the group it was added
  with (else of the character's first group), used for the current-turn highlight and the "Turn" tag, and
  by template elements colored "group".

**Active player parties** are the groups the DM always wants at hand: when adding creatures to a scene,
they come first and preselected (unless all their creatures are already there), so putting the party
on a Stage is one click. A character's form also lists its groups; new player characters start in the
active player parties.

Groups are the DM's preparation: players don't see them (only their colors on cards, and a group's
name where the DM's template adds the Group element).

## The editor

Clicking a character shows its sheet; **✎ Edit** opens the editor, full screen, in tabs (one Save for all). It opens on
**Identity**; a new character (or item, document…) opens on **Admin**, where its type, groups and who sees it are
decided first:

- **Admin** (the DM): type, **Active**, instanceable, groups, tags; players in control, who can edit, who can see;
  the name players see.
- **Identity** (the DM and its players): name, hide the name, who else can see it (its players: "Only its players",
  all players or some players, on top of the DM's choice), relationships; the pictures (main with its face crop,
  icon, others) and the **token**.
- **Archetypes** (when the Saga template has some): a column per category (Race, Class, Talent…), each of its
  archetypes with its description, **Level n of max** and ✕, "＋ Add a race…" from the category's others. The DM's to
  change; players see theirs, read only. A change lists **On Save** what saving will change in the variables
  (raising Fighter from 3 to 7: "Superiority dice: 4 / 4 → 5 / 5").
- **Variables**: the rest of what the Saga template defines (level, HP, initiative…), each editable as its rules say;
  then a section per archetype ("Warrior 3") with the variables it gives up to its level; one that changes by level
  notes its steps ("By level: 3: 4 · 7: 5 · 15: 6"), the one in force lit.
- **Inventory**: its items with what's left on their counter; **Use** takes one off at once (the DM, and whoever may
  change the inventory); add and remove items.
- **Actions** (when the Saga template has some for it): each action on it, what it does in words, **Run** (at once,
  not with Save; the result shows what changed), then its **party's** actions (those the member may run). See
  `rulesets.md` ("Actions").

Which tab a variable goes in follows what it is (pictures and the name: Identity; lists of items: Inventory; the
members in control: Admin), never its name. Items use the same editor (no Inventory tab). Calculated variables
(weight carried) show their value, read only. A character's sheet has **⚡ Actions** next to Relationships.

**Active**: an inactive character (resting, retired, away) stays off Actor Sets (players aren't sent its card; the
DM sees it faded in Build) and is left out when its group or party is added to a Set.

## Token

On maps a character is a **token**: its icon (else its face crop, else its initial) in a border, in its
player's **colour** (Saga → User; several players: white; none: black). Its **display template** draws it (the
*Token* mode, see `stages.md`, "Display templates"): the border's style (Gradient by default, Simple, Chip) and the
values on the token and in its hover trays. The Identity tab shows the token as its template draws it, with a pointer
to the template. Cards and sheets get a thin frame in the same colour.

## Who can edit

A character's **who can edit** (the DM's, in its form; the combo tray): members, member groups, **Owner** (its
Players in control; the default, which is how it always worked) or "Only the DM". Those members change the variables
the Saga template opens to "its players" (HP, initiative, inventory…), and see what those variables show. Whoever can
edit a character also sees it. Viewers never edit, even when named.

## Pictures and icon

A character has its **main picture** (cards and sheets, with a face crop), **other pictures** to switch to (★
makes one the main picture: a disguise, an older portrait) and an **icon** (small and round: on maps, in lists
and pickers; without one, the picture's face crop). See `locations.md` ("Icons and pictures").

The **character view** (clicking a card on a Stage, or a character on a map) opens its sheet with the
informative template, in a modal; the person can switch to immersive.

## Instances

An **instanceable** character (usually an NPC or a monster) is a *reference*: putting it on a Stage
creates an **instance**, with its own current values (HP, initiative...). Changing an instance's values
on the Stage doesn't change the reference, nor the other instances. Instances are numbered per Set
("Goblin 1", "Goblin 2"; with an alias: "Hooded figure 2").

- An instance starts with the reference's values and keeps only what was changed on the Stage, so
  values never changed on the Stage (e.g. max HP) follow the reference.
- Each instance has its own discrete thresholds (seeded per instance).
- The instance's sheet shows its own values.

A **non-instanceable** character (every player character) is the same character everywhere: changing its
HP on any Stage changes the character, and every Stage that shows it. This keeps the party simple to
follow.

## From characters to a combat

The flow the app is built for:

1. **Characters tab**: the DM creates the player characters (type Player) and the NPCs (DnD Lite's NPC type is
   instanceable: monsters and extras; a named NPC is made not instanceable in its editor).
2. **Characters → Groups**: one group for the party (the default *Player Party*), and one per planned encounter
   ("Goblin ambush": Goblin × 3, Goblin King × 1).
3. **Stages tab**: a Stage with an **Actors Scene** (tabs Exploration, Dialog, Combat). The DM adds the
   party (preselected) and the "Goblin ambush" group (instances) to the scene: every tab has them, and
   each tab shows to players only the ones revealed there.
4. **At the table**: Exploration is used while the party explores. When the fight starts the DM switches
   the scene to the Combat tab. Players roll initiative at the table; the DM types it in the **order
   tray**, rolls for the NPCs, adjusts the order if needed, and clicks **Start**. **Next** moves the turn.

See `stages.md` (Actors Scene) and `../implementation/05-groups-and-encounters.md`.
