# Vision

## The problem

A tabletop campaign builds up a lot of material: maps, handouts, NPC portraits, letters, who-knows-whom,
what the party found out three sessions ago. The DM has to keep it, show the right piece at the right
moment, and remember what each player already knows. Players need a place to check that lore and
their character's resources.

Full virtual tabletops (VTTs) solve a different problem: playing entirely online, with rules automated.
They are heavy for groups that play at a table, and they tie the campaign to one game system.

## What SagaCraft is

A companion app the whole group uses during and between sessions:

- **The DM shows things.** A *Stage* is what the players are looking at right now. The DM prepares
  several Stages, composes each one out of *Sets* (grid, map, image, relationship graph...), and switches
  the live Stage when the story moves on.
- **The DM keeps the lore.** Documents, pictures, maps, characters, places and items live in the
  Saga. The DM reveals them to all players, chosen groups or members, or nobody.
- **Everyone connects the dots.** DM and players link resources with relationships ("A killed B") and
  explore them as a graph; events place them on the Saga's calendar and timeline.
- **Everyone tracks the light stuff.** HP, initiative, inventory: the data the Saga's *Ruleset*
  defines for its resources (documents, characters, locations, items), without automating the rules.

## Goals

0. **UX above all** (top directive): the app aids playing, then gets out of the way. The less attention
   it takes, the more the DM can focus on narrating. See `concepts/ux.md`.
1. **Stages are the core feature**: flexible, composable, live, and easy to prepare before a session.
2. **System-agnostic**: any RPG can be played by plugging in a Ruleset. *DnD Lite*, our light take on
   D&D 5e (2014), is the reference ruleset during development.
3. **Ruleset editor** (long-term goal): DMs can create and share rulesets without touching code.
   Version 1 can be very simple (a data file); the data model must not block a full editor later.
4. **DM-controlled visibility**: players see only what the DM shared with them.
5. **Hosted, multi-Saga**: one backend holds many independent Sagas, managed by system admins. Inside a
   Saga, admins (DMs), players and viewers log in from their own devices.
6. **Usable at the table**: works on a laptop/TV for the DM's display and on phones for players.
7. **Hands-free help** (long-term goal): speech recognition and AI to let the DM act without touching
   the app.

## Non-goals

- Automating every game rule (attack resolution, full spell effects, initiative engines...).
- Being primarily an online VTT. Remote play may work through Stages, but it doesn't drive the design.
- Built-in voice/video chat.
- Shipping copyrighted book content. Only open content (SRD) is bundled.

## Principles

- **UX first, always.** Help, then get out of the way. UX wins trade-offs by default.
- **Stages and Rulesets first.** They are the core features; everything else supports them.
- **Data over code.** Game-system knowledge is ruleset data; Set types share one contract.
- **The DM is in charge.** Nothing reaches players unless the DM allowed it, and the server enforces it.
- **Light, not complete.** Track what helps at the table; leave judgement to people.
- **Start simple, keep the door open.** First versions can be minimal, as long as the model allows
  the bigger goal (e.g. ruleset editor, new Set types).
