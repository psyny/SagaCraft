# Characters: categories, groups and instances

A Saga is played as a series of **encounters between groups**: the party meets the goblins at the bridge,
then the duke's court. SagaCraft keeps the characters organized the same way, so that putting an
encounter on a Stage is a few clicks, not a hunt through a list.

Two concepts organize characters, and one decides how they are put on Stages:

| Concept | Answers | A character has |
|---------|---------|-----------------|
| **Category** | What kind of character is this? (player, DM character, NPC, boss...) | exactly one |
| **Group** | Who goes together? (the party, "Goblin ambush", "The duke's court") | any number |
| **Instanceable** | Can it appear many times, each with its own values? | yes or no |

## Saga template

A **Saga template** is what a Saga is built on: its variables (attributes per kind and type), its starting
**categories** and **groups**, and more (see `rulesets.md`, "Saga templates"). Each Saga has its own copy, edited
on the **Template** page; a system admin picks a built-in template or uploads a template file when creating a
Saga.

DnD Lite's Saga template:

| Categories | Based on type | Player characters | New characters instanceable | Display template |
|------------|---------------|-------------------|-----------------------------|------------------|
| **Player** (Players) | PC | yes | no | "Player" |
| **Major NPC** (Major NPCs) | NPC | no | no | "Major NPC" (for now, like Minor NPC's: values hidden from players) |
| **Minor NPC** (Minor NPCs) | NPC | no | yes | "Minor NPC" |

Major NPCs are the named characters the story follows (the duke, the rival); Minor NPCs are the ones that
come by the dozen (goblins, guards). Each category of the Saga template gets its own built-in display
template, made from its type, so the DM can make them look different.

| Groups | Player party | Active | Favorite | Color |
|--------|--------------|--------|----------|-------|
| **Player Party** | yes | yes | yes | blue |

The defaults are applied once, when the Saga is created (or the first time an older Saga is opened).
After that they are the DM's: renamed, deleted or added to like any other.

## Categories

A category is the main way the Saga organizes its characters: the Characters tab has one section per
category, and display templates have a default per category.

- Each category is **based on a ruleset type**: the type gives the attributes and who sees them (DnD
  Lite: PC or NPC). Creating a character means picking only its category; its type follows.
- **Player characters** (flag): characters of this category belong to the players' side (the Actors
  Scene's *boundary* layout puts them on the left). Player characters are never instanceable.
- **New characters instanceable** (flag): the default of the *instanceable* box when creating a
  character of this category.
- The DM adds, renames and deletes categories (Characters tab → Categories). A category with
  characters can't be deleted; a character can move to another category based on the same type.

## Groups

A group is a set of characters that go together; sometimes called a **party**. A character can be in
many groups. The DM manages them in the **Groups** tab:

- Two sections: **Player parties** and **Other groups** (encounters, courts, crews).
- Cards, **favorites first**, each with its parameters: **name**, **color**, **player party**, **active**,
  **favorite**, and its **creatures** (pictures and names).
- An instanceable character appears in a group with a **count** ("Goblin × 3"): adding the group to a
  scene creates that many instances.
- Add, rename, delete groups; add and remove creatures; toggle the three flags in one click; pick the
  color (a palette in one click, or any color).
- A group's **color** follows its creatures onto Stages: a card has the color of the group it was added
  with (else of the character's first group), used for the current-turn highlight and the "Turn" tag, and
  by template elements colored "group".

**Active player parties** are the groups the DM always wants at hand: when adding creatures to a scene,
they come first and preselected (unless all their creatures are already there), so putting the party
on a Stage is one click. A character's form also lists its groups; new player characters start in the
active player parties.

Groups are the DM's preparation: players don't see them (only their colors on cards, and a group's
name where the DM's template adds the Group element).

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

1. **Characters tab**: the DM creates the player characters (category Player), the named NPCs (Major NPC)
   and the monsters and extras (Minor NPC, instanceable).
2. **Characters → Groups**: one group for the party (the default *Player Party*), and one per planned encounter
   ("Goblin ambush": Goblin × 3, Goblin King × 1).
3. **Stages tab**: a Stage with an **Actors Scene** (tabs Exploration, Dialog, Combat). The DM adds the
   party (preselected) and the "Goblin ambush" group (instances) to the scene: every tab has them, and
   each tab shows to players only the ones revealed there.
4. **At the table**: Exploration is used while the party explores. When the fight starts the DM switches
   the scene to the Combat tab. Players roll initiative at the table; the DM types it in the **order
   tray**, rolls for the NPCs, adjusts the order if needed, and clicks **Start**. **Next** moves the turn.

See `stages.md` (Actors Scene) and `../implementation/05-groups-and-encounters.md`.
