# Sagas, accounts and access

## One backend, many Sagas

SagaCraft has one hosted backend that holds many independent **Sagas**. A Saga is the main division
of concerns: everything game-related (members, groups, ruleset, Stages, lore, characters) belongs to
exactly one Saga, and nothing leaks between Sagas.

Everyone logs in with their own **account** and device. An account belongs to the whole server (plan 42): one login
(not case sensitive) and a password, for one person, who is in any number of Sagas with a role, a **display name**,
a colour and dice options in each (an account has no name of its own):

- The **DM** runs the Saga from a laptop (and maybe a TV/second screen at the table).
- **Players** and **viewers** join from phones, tablets or laptops.

Remote play through Stages is possible, but the main use is at the table.

## Two levels of administration

```
System (the backend instance)
├── System admins          manage the instance, with granted permissions
└── Saga (many)
    ├── Saga admins (DMs)  manage the Saga
    ├── Players
    ├── Viewers
    ├── Member groups      default: admins, players, viewers + custom groups
    └── Characters         by type and in (character) groups: see characters.md
```

### System level

- A **root system admin** is created when the instance is set up (bootstrap: command or env settings).
- System admins can create other **system admins** and choose their **permissions**. First permission list
  (to refine):

  | Permission | Allows |
  |------------|--------|
  | `system_admins.manage` | Create, edit, disable system admins and grant permissions (only permissions they hold themselves) |
  | `sagas.create` | Create a Saga |
  | `sagas.manage` | Edit, archive, delete any Saga; replace its admins |
  | `saga_admins.assign` | Create a Saga admin for a Saga |
  | `users.manage` | System → **Users**: look accounts up, create, rename, turn off, set a new password, delete |
  | `rulesets.manage` | Install / remove rulesets available to the instance |
  | `system_settings.manage` | Change instance settings, e.g. upload limits per picture category |

- **Instance settings** (v1: upload limits per picture category: character, item, document, map; size in MB
  and longest side in px) are edited in System administration. `MAX_UPLOAD_MB` (server setting) caps them.
- System admins don't see a Saga's content (lore, Stages) just for being system admins. Whether they
  can is an open question (support vs. privacy).

- **System administration** (plan 43) is in tabs: **Sagas**, **Users**, **System admins**, **Upload limits**.
- **Sagas**: 5 at a time, found by name, All / Active / Inactive, ordered by **last login** (the latest a member
  opened it; default), name, newest or oldest; ＋ New saga (a window). A Saga opens **its page**: numbers, never content
  (DMs, players, viewers and each one's last login; player characters, NPCs, items, documents, events, locations, maps,
  relationships, Stages; files per upload category and their size), **Turn off / Turn on** (`sagas.manage`: off, its
  members can't open it, it leaves their Sagas list and its live link stops; system admins still see it), **Add a DM**
  (`saga_admins.assign`: an existing account or a new one) and **Delete** (`sagas.manage`: everything in it, for good;
  its name typed to confirm; its members' accounts stay).
- **System → Users** (plan 42, `users.manage`): every account, found by login, with its Sagas (role and display name
  in each). A system admin creates an account (in no Saga yet), renames its login, turns it off (it's signed out
  everywhere and can't sign in; its Sagas keep it) or on, sets a new password, makes it a **system admin** and picks
  its permissions or removes that (with `system_admins.manage`: only permissions they hold; there's no separate form
  for new system admins: any account becomes one), or deletes it (it leaves every Saga;
  what it made stays without its name). Never the root admin's (only the root changes its login or password), never
  your own, nor a Saga's only DM (make someone else DM there first).

### Saga level

- A system admin creates a Saga and its first **Saga admin** (DM), the same two ways as a DM adds someone: an
  **existing account** (looked up by login) or a **new account** (login and password), with the DM's display name in
  the Saga.
- The Saga admin adds people on Saga → Members, **Add someone**, two ways: an **existing account** (looked up by
  login: two letters or more; those already in the Saga aren't offered), or a **new account** made for this Saga (a
  login and password they'll sign in with). Each gets a role and a display name in this Saga (their login until
  set).

| Role | Can |
|------|-----|
| **Admin (DM)** | Everything in the Saga: members, groups, Stages, lore, visibility, characters, ruleset. A Saga can have several admins (co-DMs). |
| **Player** | See the live Stage and what was shared with them; edit their own character(s); later, private notes. |
| **Viewer** | See the live Stage and whatever players see (plus what's shared with them by name). No character, never edits. |

## Your account (Saga → User)

Everyone has the Saga page's **User** section (for players and viewers it's the Saga page's only one): their
account's **password** (with the current one), and in this Saga their **display name** (each Saga's: plan 42),
**colour** (their characters' token borders, pings, dice; a palette colour until they pick one) and **dice style**
(ten, from Minimalist to Nature, with a live 3D preview in their colour: see `stages.md`, "Dice roller").
**Sign out** is there too, under the account ("Signed in as …"): a member of one Saga (not a system admin) never sees
the Sagas list, which sends them straight into their Saga.

## Member groups

> Two kinds of groups exist. **Member groups** (this section) are sets of Saga *members*, used for
> visibility. **Groups** in the UI (Characters → Groups) are sets of *characters* (the party, an encounter): see
> `characters.md`. In code, member groups are `Group`; character groups are `CharacterGroup`.

- Member groups are sets of Saga members, used in visibility and permission settings.
- Every Saga has three **default groups**: `admins`, `players`, `viewers`. Every member is
  automatically in the default group of their role. Default groups can't be deleted and their
  membership follows the role.
- Saga admins create **custom groups** (e.g. "Party A", "The Thieves' Guild", "Elves") with any members.
  A member can be in many groups.
- Groups belong to one Saga.
- Each group also holds its own **relationships** and **relationship types**: what that group knows.
  Players add, edit and remove them in their own groups.

## Visibility

Every shareable thing in a Saga (resource, Set, Actor, later Stage-level items) has a visibility,
expressed as a list of **groups and/or individual members** that can see it.

- Default: `admins` only (hidden from everyone else).
- "All players" = the `players` group. **Viewers see what players see** (and never edit anything), so "all viewers"
  is no choice: a viewer counts as being in the `players` group for seeing (resources, relationships, fog, ruleset
  rules).
- **Owner** (resources and folders): the resource's owners (a character's Players in control; other resources'
  Owner field) see it.
- A **folder** can decide who sees what's in it, overriding its resources' own choice (see `rulesets.md`, "Folders").
- Who can see (and who can edit) is picked in the **combo tray** (`ux.md`).
- Admins always see everything in their Saga.
- Filtering happens on the server: a client never receives hidden data, including file URLs.
- Revealing is an admin action (one click from anywhere the item appears).
- Inside a resource, each attribute also has its own visibility (defaults from the ruleset, see
  `rulesets.md`), so a player can know an NPC's name but not their HP.
- **Relationships are the exception**: each relationship belongs to one group, and its group *is* its
  visibility. Members see the relationships of the groups they are in (see `relationships.md`).
- Later: reveal history.

## Saga content

- its **Ruleset** (one per Saga),
- **Stages** (see `stages.md`),
- its **resources**, the Saga's lore: Documents (text, images, PDFs; files in object storage),
  Characters (PCs, NPCs), Locations (nested into a world map, each with its map: see `locations.md`) and
  Items, all shaped by the ruleset and linked to each other (see `rulesets.md`).

Members browse and search the resources visible to them. Visibility works at three levels: the whole
resource, each attribute inside it (defaults from the ruleset), and inside a location's map, the fog of war
per member group and each path's own visibility. The DM **tags** resources (free words, e.g. "dungeon",
"capital"); whoever sees a resource sees its tags.
