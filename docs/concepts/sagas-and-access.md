# Sagas, accounts and access

## One backend, many Sagas

SagaCraft has one hosted backend that holds many independent **Sagas**. A Saga is the main division
of concerns: everything game-related (members, groups, ruleset, Stages, lore, characters) belongs to
exactly one Saga, and nothing leaks between Sagas.

Everyone logs in with their own account and device:

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
    └── Groups             default: admins, players, viewers + custom groups
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
  | `users.manage` | See and manage any account (disable, reset password) |
  | `rulesets.manage` | Install / remove rulesets available to the instance |
  | `system_settings.manage` | Change instance settings, e.g. upload limits per picture category |

- **Instance settings** (v1: upload limits per picture category: character, item, document, map; size in MB
  and longest side in px) are edited in System administration. `MAX_UPLOAD_MB` (server setting) caps them.
- System admins don't see a Saga's content (lore, Stages) just for being system admins. Whether they
  can is an open question (support vs. privacy).

### Saga level

- A system admin creates a Saga and its first **Saga admin**.
- The Saga admin creates the Saga's users and gives each one a role.

| Role | Can |
|------|-----|
| **Admin (DM)** | Everything in the Saga: members, groups, Stages, lore, visibility, characters, ruleset. A Saga can have several admins (co-DMs). |
| **Player** | See the live Stage and what was shared with them; edit their own character(s); later, private notes. |
| **Viewer** | See the live Stage and what was shared with them. No character, no editing. |

## Groups

- Groups are sets of Saga members, used in visibility and permission settings.
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
- "Show to all players" = add the `players` group; "show to everyone" = `players` + `viewers`.
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
  Characters (PCs, NPCs), Locations (nested into a world map) and Items, all shaped by the ruleset and
  linked to each other (see `rulesets.md`).

Members browse and search the resources visible to them. Visibility works at two levels: the whole
resource, and each attribute inside it (defaults from the ruleset).
