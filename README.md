# SagaCraft

A companion app for tabletop RPG campaigns.

The Dungeon Master builds **Stages**, live scenes made of **Sets** (a battle grid, a world map,
a handout image, a relationship graph...), and shows one to the players at a time. Players follow
the Stage on their own device, can browse the lore the DM shared with them, and keep track of
their character's resources.

Its top directive is UX: help the table, then get out of the way.

SagaCraft works with any RPG system through **Rulesets**. *DnD Lite*, our light take on D&D 5e
(2014), is the first one. It does not try to automate every rule, and it is not meant to replace playing at the table.

**Status:** first version in progress: accounts and Sagas, DnD Lite characters (types, groups,
instanceable NPCs), locations with maps (grid, fog of war, links, paths, regions), items, documents, an editable Saga template, live Stages with the Actors Scene
(tabs, initiative order and turns) and the World map work. Stack: FastAPI (Python), React + TypeScript, PostgreSQL. Runs locally with Docker;
deploys to Railway.

## Run it

Needs Docker Desktop. On Windows:

```bat
make.bat up
```

Then open http://localhost:3100 and sign in as `admin` / `admin123` (the root system admin). In
**System administration** create a Saga and its DM; the DM adds players in **Saga → Members**, creates
characters in **Characters**, puts the party and each encounter in **Characters → Groups**, and builds scenes in
**Stages**, and keeps the story's documents, events and relationships in **Lore**. Players see the live Stage in the
**Stage** tab, on their phone or laptop.

`make.bat help` lists every command (tests, production-like build, reset). Deploying: see
[docs/railway/setup.md](docs/railway/setup.md).

## Main ideas

- **Stages and Sets**: flexible scenes the DM composes and switches between. The DM can grab the
  players' attention and center their view on a point of the Stage.
- **Lore library**: documents, pictures and maps, revealed to players when the DM decides.
- **Rulesets**: define the Saga's resources (documents, characters, locations, items), their
  attributes and how they relate. System-agnostic, defined as data, with an editor planned.
- **Relationships**: link any resources ("A killed B", "B lives in the city") and explore them as a
  graph. What players discover is marked as theirs, so the DM can show them what they got right.
- **Events and timeline**: dated events on the Saga's own calendar (real or fantasy), with a
  timeline to see the saga unfold.
- **Hosted, multi-Saga**: one backend holds many Sagas. Inside a Saga, the DM, players and viewers
  log in from their own devices. The DM controls what each member and group can see.

## Docs

- [Vision](docs/vision.md)
- [Requirements](docs/requirements.md)
- [User experience](docs/concepts/ux.md)
- [Stages and Sets](docs/concepts/stages.md)
- [Characters: types, groups, instances](docs/concepts/characters.md)
- [Rulesets](docs/concepts/rulesets.md)
- [Relationships](docs/concepts/relationships.md)
- [Events, calendars and timeline](docs/concepts/events.md)
- [Sagas, accounts and access](docs/concepts/sagas-and-access.md)
- [Implementation plans](docs/implementation/README.md)
- [Deploying on Railway](docs/railway/setup.md)
- [Glossary](docs/glossary.md)
- [Open questions and decisions](docs/open_questions.md)
