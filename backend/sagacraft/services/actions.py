"""Running the Saga template's actions (domain/actions.py) on characters, items and groups: who may, the things an
action reaches (an item's owner, a character's party, a group's characters), and saving every change at once. Its
dice, when the Saga's settings say so, are thrown on the live Stage's dice roller (plan 37).
See docs/implementation/30-actions-and-calculated-variables.md and 37-display-and-action-upgrades.md."""
from __future__ import annotations

from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from domain import actions as rules
from domain.calculated import tidy as _tidy
from domain.ruleset import default_value
from domain.visibility import Viewer, rule_allows
from models import CharacterGroup, Resource, SagaMember, Stage, StageActor, StageSet
from services.access import get_saga, saga_settings, viewer_for
from services.calculated import groups_of, owners_of
from services.errors import BadRequest, Forbidden, NotFound
from services.resources import can_see_resource, controller_ids, ruleset_for, shown_name


class _World:
    """The things an action reaches, each loaded once (so changes add up), for one Saga. An instance (a Stage actor
    of an instanceable character: its own values on top of the character's) is a thing of its own ("instance")."""

    def __init__(self, db: Session, saga_id: int):
        self.db = db
        self.saga_id = saga_id
        self.ruleset = ruleset_for(db, saga_id)
        self.things: dict[tuple[str, int], rules.Thing] = {}
        self.rows: dict[tuple[str, int], Resource | CharacterGroup | StageActor] = {}

    def resource(self, resource: Resource) -> rules.Thing:
        ref = (resource.kind, resource.id)
        if ref not in self.things:
            attrs = self.ruleset.def_for(resource).attributes
            self.things[ref] = rules.Thing(resource.kind, resource.id, resource.name or "?", resource.type,
                                           _with_defaults(resource.attributes, attrs), {a.key: a.type for a in attrs})
            self.rows[ref] = resource
        return self.things[ref]

    def instance(self, actor: StageActor) -> rules.Thing:
        """An instance: the character's values with its own on top; its changes are saved as its own."""
        ref = ("instance", actor.id)
        if ref not in self.things:
            resource = actor.resource
            attrs = self.ruleset.def_for(resource).attributes
            own = ((actor.config or {}).get("instance") or {})
            values = {**(resource.attributes or {}), **(own.get("values") or {})}
            name = f"{resource.name or '?'} {own.get('number')}" if own.get("number") else (resource.name or "?")
            self.things[ref] = rules.Thing("instance", actor.id, name, resource.type, _with_defaults(values, attrs),
                                           {a.key: a.type for a in attrs})
            self.rows[ref] = actor
        return self.things[ref]

    def instances(self, character: Resource, group: CharacterGroup) -> list[StageActor]:
        """The instances of an instanceable character that came with this group, on any of the Saga's Stages."""
        actors = self.db.scalars(select(StageActor).join(StageSet, StageActor.set_id == StageSet.id)
                                 .join(Stage, StageSet.stage_id == Stage.id)
                                 .where(Stage.saga_id == self.saga_id, StageActor.resource_id == character.id)
                                 .order_by(StageActor.id)).all()
        return [a for a in actors if (a.config or {}).get("instance") and (a.config or {}).get("group_id") == group.id]

    def group(self, group: CharacterGroup) -> rules.Thing:
        ref = ("group", group.id)
        if ref not in self.things:
            attrs = self.ruleset.group_attributes
            self.things[ref] = rules.Thing("group", group.id, group.name, None, _with_defaults(group.attributes, attrs),
                                           {a.key: a.type for a in attrs})
            self.rows[ref] = group
        return self.things[ref]

    def party(self, character: Resource) -> CharacterGroup | None:
        """A character's party: the active player party it's in, else a player party, else its first group."""
        groups = groups_of(self.db, character.id)
        return next((g for g in groups if g.player_party and g.active), None) or next((g for g in groups if g.player_party), None) \
            or (groups[0] if groups else None)

    def related(self, thing: rules.Thing, place: str) -> Iterable[rules.Thing]:
        row = self.rows[thing.ref]
        if place == "self":
            return [thing]
        if isinstance(row, StageActor):  # an instance: its group is the one it came with, else its character's party
            if place == "group":
                came = self.db.get(CharacterGroup, (row.config or {}).get("group_id") or 0)
                party = came if came is not None and came.saga_id == self.saga_id else self.party(row.resource)
                return [self.group(party)] if party is not None else []
            return []
        if place == "character":  # an item's owner(s)
            return [self.resource(c) for c in owners_of(self.db, self.ruleset, row)]
        if place == "group":  # a character's party, an item's owner's
            character = row if thing.kind == "character" else next(iter(owners_of(self.db, self.ruleset, row)), None)
            party = self.party(character) if character is not None else None
            return [self.group(party)] if party is not None else []
        if place == "group_characters":
            # Each character; an instanceable one: each of its instances that came with this group (their values are
            # what the table plays with), else the character itself
            ids = [m.resource_id for m in row.members]
            out: list[rules.Thing] = []
            for r in self.db.scalars(select(Resource).where(Resource.id.in_(ids)).order_by(Resource.id)).all():
                instances = self.instances(r, row) if r.instanceable else []
                out.extend([self.instance(a) for a in instances] if instances else [self.resource(r)])
            return out
        return []

    def save(self) -> list[rules.Change]:
        found = rules.changed(self.things.values())
        for change in found:
            row = self.rows[change.thing.ref]
            if isinstance(row, StageActor):  # an instance keeps only its own values
                config = dict(row.config or {})
                own = dict(config.get("instance") or {})
                own["values"] = {**(own.get("values") or {}), change.key: change.thing.values[change.key]}
                row.config = {**config, "instance": own}
            else:
                row.attributes = dict(change.thing.values)
        return found

    def character_of(self, row) -> Resource | None:
        """The character a row is (an instance: its character's), for who may see it and whose it is."""
        return row.resource if isinstance(row, StageActor) else row


def _with_defaults(values: dict | None, attrs) -> dict:
    """Its values, a number or counter it has none of (added to the template after it was made) at its default."""
    out = dict(values or {})
    for attr in attrs:
        if attr.type in rules.VALUE_TYPES and out.get(attr.key) is None:
            out[attr.key] = default_value(attr)
    return out


def _may_run(world: _World, viewer: Viewer, action: dict, row: Resource | CharacterGroup) -> bool:
    """Who may run an action on this thing (the DM always; viewers never)."""
    if viewer.is_admin:
        return True
    if viewer.role != "player" or action["who"] == "admins":
        return False
    if action["who"] == "players":
        return True
    me = viewer.member_id

    def controls(character: Resource) -> bool:
        return me in controller_ids(world.ruleset, character, viewer)

    def group_characters(group: CharacterGroup | None) -> list[Resource]:
        if group is None:
            return []
        ids = [m.resource_id for m in group.members]
        return list(world.db.scalars(select(Resource).where(Resource.id.in_(ids))).all()) if ids else []

    if isinstance(row, CharacterGroup):
        return any(controls(c) for c in group_characters(row))
    character = row if row.kind == "character" else next(iter(owners_of(world.db, world.ruleset, row)), None)
    if character is None:
        return False
    if action["who"] == "owner":
        return controls(character)
    return any(controls(c) for c in group_characters(world.party(character)))  # "group": anyone in its party


def _resource(db: Session, member: SagaMember, viewer: Viewer, resource_id: int) -> Resource:
    resource = db.get(Resource, resource_id)
    if resource is None or resource.saga_id != member.saga_id or not can_see_resource(viewer, ruleset_for(db, member.saga_id), resource):
        raise NotFound("Resource not found")
    if resource.kind not in ("character", "item"):
        raise BadRequest("Actions are on characters, items and groups")
    return resource


def _group(db: Session, member: SagaMember, group_id: int) -> CharacterGroup:
    group = db.get(CharacterGroup, group_id)
    if group is None or group.saga_id != member.saga_id:
        raise NotFound("Group not found")
    return group


def _out(action: dict, can: bool) -> dict:
    return {"key": action["key"], "name": action["name"], "description": action["description"], "on": action["on"],
            "who": action["who"], "notify": action.get("notify", "user"), "costs": action["costs"], "changes": action["changes"], "triggers": action["triggers"], "can": can}


def resource_actions(db: Session, member: SagaMember, resource_id: int) -> dict:
    """A character's or item's actions (the ones on its kind and type), and its party's for a character."""
    viewer = viewer_for(db, member)
    resource = _resource(db, member, viewer, resource_id)
    world = _World(db, member.saga_id)
    actions = world.ruleset.actions
    own = [_out(a, _may_run(world, viewer, a, resource)) for a in actions if rules.applies(a, resource.kind, resource.type)]
    out: dict = {"actions": own, "party": None}
    party = world.party(resource) if resource.kind == "character" else None
    if party is not None:
        listed = [_out(a, _may_run(world, viewer, a, party)) for a in actions if a["on"] == "group"]
        if viewer.is_admin or any(a["can"] for a in listed):
            out["party"] = {"id": party.id, "name": party.name, "actions": [a for a in listed if viewer.is_admin or a["can"]]}
    return out


def group_actions(db: Session, member: SagaMember, group_id: int) -> list[dict]:
    viewer = viewer_for(db, member)
    world = _World(db, member.saga_id)
    _group(db, member, group_id)
    if not viewer.is_admin:  # groups are the DM's: players see the actions they may run, from their character
        raise Forbidden("Groups are the DM's")
    return [_out(a, True) for a in world.ruleset.actions if a["on"] == "group"]


def actors(db: Session, member: SagaMember) -> dict:
    """What this member runs actions on from the Stage's Action control (plan 33), each with the actions they may run
    on it: the DM every character, item and group with actions; a player their characters, those characters' items
    and their groups. Viewers nothing."""
    viewer = viewer_for(db, member)
    out: dict[str, list[dict]] = {"character": [], "item": [], "group": []}
    world = _World(db, member.saga_id)
    actions = world.ruleset.actions
    if not actions or viewer.role not in ("admin", "player"):
        return out
    characters = db.scalars(select(Resource).where(Resource.saga_id == member.saga_id, Resource.kind == "character")
                            .order_by(Resource.name, Resource.id)).all()
    if viewer.is_admin:
        items = db.scalars(select(Resource).where(Resource.saga_id == member.saga_id, Resource.kind == "item")
                           .order_by(Resource.name, Resource.id)).all()
        groups = db.scalars(select(CharacterGroup).where(CharacterGroup.saga_id == member.saga_id)
                            .order_by(CharacterGroup.name, CharacterGroup.id)).all()
    else:
        characters = [c for c in characters if viewer.member_id in controller_ids(world.ruleset, c, viewer)]
        from services.calculated import inventory_ids
        item_ids = sorted({i for c in characters for i in inventory_ids(world.ruleset, c)})
        items = db.scalars(select(Resource).where(Resource.id.in_(item_ids), Resource.kind == "item")
                           .order_by(Resource.name, Resource.id)).all() if item_ids else []
        seen: dict[int, CharacterGroup] = {}
        for c in characters:
            for g in groups_of(db, c.id):
                seen.setdefault(g.id, g)
        groups = sorted(seen.values(), key=lambda g: (g.name, g.id))

    def offers(row: Resource | CharacterGroup, kind: str, type_key: str | None) -> list[dict]:
        return [{"key": a["key"], "name": a["name"], "description": a["description"]} for a in actions
                if rules.applies(a, kind, type_key) and _may_run(world, viewer, a, row)]

    for c in characters:
        if (listed := offers(c, "character", c.type)):
            name = c.name if viewer.is_admin else shown_name(viewer, c, controller_ids(world.ruleset, c, viewer))
            out["character"].append({"id": c.id, "name": name or "???", "actions": listed})
    for item in items:
        if can_see_resource(viewer, world.ruleset, item) and (listed := offers(item, "item", item.type)):
            out["item"].append({"id": item.id, "name": item.name or "?", "actions": listed})
    for g in groups:
        if (listed := offers(g, "group", None)):
            out["group"].append({"id": g.id, "name": g.name, "actions": listed})
    return out


def _run(db: Session, member: SagaMember, world: _World, row: Resource | CharacterGroup, thing: rules.Thing, key: str) -> dict:
    from services.stages import refuse_if_paused

    refuse_if_paused(db, member)  # the DM paused the game (plan 58): players run nothing until it's resumed
    viewer = viewer_for(db, member)
    action = next((a for a in world.ruleset.actions if a["key"] == key), None)
    kind = "group" if isinstance(row, CharacterGroup) else row.kind
    if action is None or not rules.applies(action, kind, None if kind == "group" else row.type):
        raise BadRequest("That action isn't on this")
    if not _may_run(world, viewer, action, row):
        raise Forbidden(f"You can't run {action['name']}")
    log: list[dict] = []
    try:
        rules.run({a["key"]: a for a in world.ruleset.actions}, key, thing, world, log=log)
    except rules.ActionError as exc:
        db.rollback()
        raise BadRequest(str(exc)) from None
    changes = world.save()
    db.commit()
    notify = action.get("notify", "user")
    secret = notify == "dm" and not viewer.is_admin  # only the DM is told: the player who ran it isn't
    # Its dice on the live dice roller (unless only the DM may know: a secret is rolled behind the screen)
    stage_ids = [] if notify == "dm" else _roll_on_stage(db, member, world, action, log)
    # Instances changed: the Stages they're on show it
    actors = [world.rows[c.thing.ref] for c in changes if c.thing.kind == "instance"]
    stage_ids = sorted(set(stage_ids) | {a.stage_set.stage_id for a in actors})
    return {
        "action": action["name"],
        "changes": [] if secret else _shown(world, viewer, changes),
        "rolls": [] if secret else _rolls_shown(world, viewer, log),
        "secret": secret,
        "resource_ids": sorted({c.thing.id for c in changes if c.thing.kind in ("character", "item")}),
        "stage_ids": stage_ids,
        "notices": _notices(db, member, world, row, action, changes, log),
    }


def _roll_on_stage(db: Session, runner: SagaMember, world: _World, action: dict, log: list[dict]) -> list[int]:
    """An action's dice, thrown on the live Stage's dice rollers (plan 37) when the Saga's settings say so: each
    formula's dice, in the dice of the player of the character it worked on (else whoever ran it). The Stages
    changed (to push)."""
    saga = get_saga(db, runner.saga_id)
    if not saga_settings(saga)["action_dice"] or saga.live_stage_id is None:
        return []
    thrown = [entry for entry in log if any(r["results"] for r in entry["rolls"])]
    if not thrown:
        return []
    sets = [s for s in db.scalars(select(StageSet).where(StageSet.stage_id == saga.live_stage_id)).all() if not s.off]
    if not sets:
        return []
    by_owner: dict[int, list[dict]] = {}
    for entry in thrown:
        dice = [{"sides": r["sides"], "value": value} for r in entry["rolls"] for value in r["results"]]
        by_owner.setdefault(_dice_owner(world, runner, entry["ref"]), []).append(
            {"formula": entry["formula"], "value": entry["value"], "dice": dice})
    from services.stages import _context
    from set_types import get_set_type

    ctx = _context(db, saga.id, viewer_for(db, runner))
    changed = False
    for stage_set in sets:
        for owner, formulas in by_owner.items():
            roll = {"member_id": owner, "action": action["name"], "formulas": formulas}
            changed = get_set_type(stage_set.type).action_rolled(ctx, stage_set, roll) or changed
    if not changed:
        return []
    db.commit()
    return [saga.live_stage_id]


def _dice_owner(world: _World, runner: SagaMember, ref: tuple[str, int]) -> int:
    """Whose dice a formula is thrown in: the player of the character it worked on (an item: its owner's; whoever
    ran it, when they're one of them), else whoever ran it (a group, an NPC)."""
    row = world.character_of(world.rows.get(ref))
    if row is None or isinstance(row, CharacterGroup):
        return runner.id
    characters = owners_of(world.db, world.ruleset, row) if row.kind == "item" else [row]
    for character in characters:
        players = controller_ids(world.ruleset, character)
        if runner.id in players:
            return runner.id
        if players:
            return min(players)
    return runner.id


def _notices(db: Session, runner: SagaMember, world: _World, row: Resource | CharacterGroup, action: dict,
             changes: list[rules.Change], log: list[dict]) -> dict[int, dict]:
    """Who else is told the action ran (plan 34), each with what they may see: the DM always; everyone when the action
    says so. {member id: message}."""
    everyone = action.get("notify", "user") == "all"
    members = db.scalars(select(SagaMember).where(SagaMember.saga_id == runner.saga_id, SagaMember.id != runner.id)).all()
    from services.access import member_name

    by = member_name(runner) if runner.user is not None else "Someone"
    out: dict[int, dict] = {}
    for member in members:
        if not everyone and member.role != "admin":
            continue
        viewer = viewer_for(db, member)
        out[member.id] = {"type": "action_notice", "by": by, "action": action["name"], "on": _thing_name(world, viewer, row),
                          "changes": _shown(world, viewer, changes), "rolls": _rolls_shown(world, viewer, log)}
    return out


def _thing_name(world: _World, viewer: Viewer, row: Resource | CharacterGroup) -> str | None:
    """What a member is told the action ran on: its name as they see it, or nothing if they don't see it."""
    if isinstance(row, CharacterGroup):
        if viewer.is_admin:
            return row.name
        ids = [m.resource_id for m in row.members]
        characters = world.db.scalars(select(Resource).where(Resource.id.in_(ids))).all() if ids else []
        return row.name if any(viewer.member_id in controller_ids(world.ruleset, c, viewer) for c in characters) else None
    if not can_see_resource(viewer, world.ruleset, row):
        return None
    return shown_name(viewer, row, controller_ids(world.ruleset, row, viewer)) if row.kind == "character" else row.name


def _rolls_shown(world: _World, viewer: Viewer, log: list[dict]) -> list[dict]:
    """The formulas' rolls this member may see: the DM all; a player those on their characters (and their items and
    groups): a formula reads values they may not see elsewhere."""
    def mine(ref: tuple[str, int]) -> bool:
        if viewer.is_admin:
            return True
        row = world.character_of(world.rows.get(ref))
        if isinstance(row, CharacterGroup):
            ids = [m.resource_id for m in row.members]
            characters = world.db.scalars(select(Resource).where(Resource.id.in_(ids))).all() if ids else []
        elif row is not None and row.kind == "item":
            characters = owners_of(world.db, world.ruleset, row)
        else:
            characters = [row] if row is not None else []
        return any(viewer.member_id in controller_ids(world.ruleset, c, viewer) for c in characters)

    return [{k: v for k, v in entry.items() if k != "ref"} for entry in log if mine(entry["ref"])]


def _shown(world: _World, viewer: Viewer, changes: list[rules.Change]) -> list[dict]:
    """The changes this member may see (an action on the party changes characters they may not see, or values of
    theirs that are hidden), with the names they see."""
    out = []
    for c in changes:
        actor = world.rows[c.thing.ref] if c.thing.kind == "instance" else None
        row = world.character_of(world.rows[c.thing.ref])
        name: str | None = c.thing.name
        if isinstance(row, CharacterGroup):
            members = [m.resource_id for m in row.members]
            mine = viewer.is_admin or any(
                viewer.member_id in controller_ids(world.ruleset, r, viewer)
                for r in world.db.scalars(select(Resource).where(Resource.id.in_(members))).all())
            if not mine:
                continue
        else:
            if not can_see_resource(viewer, world.ruleset, row):
                continue
            controllers = controller_ids(world.ruleset, row, viewer)
            attr = next((a for a in world.ruleset.def_for(row).attributes if a.key == c.key), None)
            if attr is None or not rule_allows(viewer, attr.view, controllers):
                continue
            name = shown_name(viewer, row, controllers) if row.kind == "character" else row.name
            number = ((actor.config or {}).get("instance") or {}).get("number") if actor is not None else None
            if number and name:
                name = f"{name} {number}"  # an instance: "Goblin 2"
        out.append({"kind": c.thing.kind, "id": c.thing.id, "name": name or "???", "key": c.key,
                    "variable": _name(world, c.thing, c.key), "before": _tidy(c.before), "after": _tidy(c.after)})
    return out


def _name(world: _World, thing: rules.Thing, key: str) -> str:
    attrs = world.ruleset.group_attributes if thing.kind == "group" else world.ruleset.def_for(world.character_of(world.rows[thing.ref])).attributes
    return next((a.name for a in attrs if a.key == key), key)


def run_on_resource(db: Session, member: SagaMember, resource_id: int, key: str) -> dict:
    viewer = viewer_for(db, member)
    resource = _resource(db, member, viewer, resource_id)
    world = _World(db, member.saga_id)
    return _run(db, member, world, resource, world.resource(resource), key)


def run_on_group(db: Session, member: SagaMember, group_id: int, key: str) -> dict:
    """A group's action: the DM, or a player it lets run it (from their character's Actions: its party's)."""
    group = _group(db, member, group_id)
    world = _World(db, member.saga_id)
    return _run(db, member, world, group, world.group(group), key)
