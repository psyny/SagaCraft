"""Running the Saga template's actions (domain/actions.py) on characters, items and groups: who may, the things an
action reaches (an item's owner, a character's party, a group's characters), and saving every change at once.
See docs/implementation/30-actions-and-calculated-variables.md."""
from __future__ import annotations

from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from domain import actions as rules
from domain.calculated import tidy as _tidy
from domain.ruleset import default_value
from domain.visibility import Viewer, rule_allows
from models import CharacterGroup, Resource, SagaMember
from services.access import viewer_for
from services.calculated import groups_of, owners_of
from services.errors import BadRequest, Forbidden, NotFound
from services.resources import can_see_resource, controller_ids, ruleset_for, shown_name


class _World:
    """The things an action reaches, each loaded once (so changes add up), for one Saga."""

    def __init__(self, db: Session, saga_id: int):
        self.db = db
        self.saga_id = saga_id
        self.ruleset = ruleset_for(db, saga_id)
        self.things: dict[tuple[str, int], rules.Thing] = {}
        self.rows: dict[tuple[str, int], Resource | CharacterGroup] = {}

    def resource(self, resource: Resource) -> rules.Thing:
        ref = (resource.kind, resource.id)
        if ref not in self.things:
            attrs = self.ruleset.def_for(resource).attributes
            self.things[ref] = rules.Thing(resource.kind, resource.id, resource.name or "?", resource.type,
                                           _with_defaults(resource.attributes, attrs), {a.key: a.type for a in attrs})
            self.rows[ref] = resource
        return self.things[ref]

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
        if place == "character":  # an item's owner(s)
            return [self.resource(c) for c in owners_of(self.db, self.ruleset, row)]
        if place == "group":  # a character's party, an item's owner's
            character = row if thing.kind == "character" else next(iter(owners_of(self.db, self.ruleset, row)), None)
            party = self.party(character) if character is not None else None
            return [self.group(party)] if party is not None else []
        if place == "group_characters":
            ids = [m.resource_id for m in row.members]
            return [self.resource(r) for r in self.db.scalars(select(Resource).where(Resource.id.in_(ids)).order_by(Resource.id)).all()]
        return []

    def save(self) -> list[rules.Change]:
        found = rules.changes(self.things.values())
        for change in found:
            row = self.rows[change.thing.ref]
            row.attributes = dict(change.thing.values)
        return found


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
            "who": action["who"], "costs": action["costs"], "gains": action["gains"], "triggers": action["triggers"], "can": can}


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
    return {
        "action": action["name"],
        "changes": _shown(world, viewer, changes),
        "rolls": _rolls_shown(world, viewer, log),
        "resource_ids": sorted({c.thing.id for c in changes if c.thing.kind != "group"}),
    }


def _rolls_shown(world: _World, viewer: Viewer, log: list[dict]) -> list[dict]:
    """The formulas' rolls this member may see: the DM all; a player those on their characters (and their items and
    groups): a formula reads values they may not see elsewhere."""
    def mine(ref: tuple[str, int]) -> bool:
        if viewer.is_admin:
            return True
        row = world.rows.get(ref)
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
        row = world.rows[c.thing.ref]
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
        out.append({"kind": c.thing.kind, "id": c.thing.id, "name": name or "???", "key": c.key,
                    "variable": _name(world, c.thing, c.key), "before": _tidy(c.before), "after": _tidy(c.after)})
    return out


def _name(world: _World, thing: rules.Thing, key: str) -> str:
    attrs = world.ruleset.group_attributes if thing.kind == "group" else world.ruleset.def_for(world.rows[thing.ref]).attributes
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
