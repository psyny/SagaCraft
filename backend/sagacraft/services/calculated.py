"""Calculated variables' values (domain/calculated.py), worked out when a character, an item or a group is sent: from a
character's inventory or groups, an item's owners, a group's characters, or a formula of the thing's own values."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from domain import calculated
from domain.ruleset import AttributeDef, Ruleset
from models import CharacterGroup, CharacterGroupMember, Resource


def _calcs(attrs: list[AttributeDef]) -> list[AttributeDef]:
    return [a for a in attrs if a.type == "calculated" and a.calc]


def _formulas(attrs: list[AttributeDef], values: dict[str, Any]) -> dict[str, Any]:
    """The formulas only (no database): a thing's own values."""
    return {a.key: calculated.evaluate(a.calc["formula"], values) for a in _calcs(attrs) if a.calc["op"] == "formula"}


def inventory_ids(ruleset: Ruleset, resource: Resource) -> list[int]:
    type_def = ruleset.def_for(resource)
    ids: list[int] = []
    for attr in type_def.attributes:
        if attr.type == "list" and (attr.of or {}).get("kind") == "item":
            ids += [i for i in (resource.attributes or {}).get(attr.key) or [] if isinstance(i, int)]
    return ids


def owners_of(db: Session, ruleset: Ruleset, item: Resource) -> list[Resource]:
    """The characters whose inventory holds an item."""
    characters = db.scalars(select(Resource).where(Resource.saga_id == item.saga_id, Resource.kind == "character")).all()
    return [c for c in characters if item.id in inventory_ids(ruleset, c)]


def groups_of(db: Session, resource_id: int) -> list[CharacterGroup]:
    return list(db.scalars(select(CharacterGroup).join(CharacterGroupMember, CharacterGroupMember.group_id == CharacterGroup.id)
                           .where(CharacterGroupMember.resource_id == resource_id).order_by(CharacterGroup.id)).all())


class Lookup:
    """What calculated values read (items, a Saga's characters, group memberships), loaded once for a whole list or
    Stage instead of once per thing."""

    def __init__(self, db: Session, ruleset: Ruleset, saga_id: int):
        self.db = db
        self.ruleset = ruleset
        self.saga_id = saga_id
        self._resources: dict[int, Resource | None] = {}
        self._characters: list[Resource] | None = None
        self._groups: dict[int, list[CharacterGroup]] | None = None

    def resources(self, ids: list[int]) -> dict[int, Resource]:
        missing = [i for i in set(ids) if i not in self._resources]
        if missing:
            found = {r.id: r for r in self.db.scalars(select(Resource).where(Resource.id.in_(missing),
                                                                              Resource.saga_id == self.saga_id)).all()}
            for i in missing:
                self._resources[i] = found.get(i)
        return {i: r for i in ids if (r := self._resources.get(i)) is not None}

    def preload(self, things: list[Resource]) -> None:
        """Every item the listed characters hold, in one query."""
        self.resources([i for r in things if r.kind == "character" for i in inventory_ids(self.ruleset, r)])

    def owners_of(self, item: Resource) -> list[Resource]:
        if self._characters is None:
            self._characters = list(self.db.scalars(select(Resource).where(Resource.saga_id == self.saga_id,
                                                                            Resource.kind == "character")).all())
        return [c for c in self._characters if item.id in inventory_ids(self.ruleset, c)]

    def groups_of(self, resource_id: int) -> list[CharacterGroup]:
        if self._groups is None:
            self._groups = {}
            rows = self.db.execute(select(CharacterGroupMember.resource_id, CharacterGroup)
                                   .join(CharacterGroup, CharacterGroup.id == CharacterGroupMember.group_id)
                                   .where(CharacterGroup.saga_id == self.saga_id).order_by(CharacterGroup.id)).all()
            for rid, group in rows:
                self._groups.setdefault(rid, []).append(group)
        return self._groups.get(resource_id, [])


def resource_values(db: Session, ruleset: Ruleset, resource: Resource, values: dict | None = None,
                    lookup: Lookup | None = None) -> dict[str, Any]:
    """A character's or item's calculated values (by key); `values`: its values (an instance's), else its own.
    `lookup`: shared by a list (else one is made for this thing)."""
    if resource.kind not in ("character", "item"):
        return {}
    attrs = ruleset.def_for(resource).attributes
    calcs = _calcs(attrs)
    if not calcs:
        return {}
    lookup = lookup or Lookup(db, ruleset, resource.saga_id)
    own = values if values is not None else (resource.attributes or {})
    out: dict[str, Any] = _formulas(attrs, own)
    for attr in calcs:
        if attr.calc["op"] == "formula":
            continue
        of = attr.calc["of"]
        if of == "inventory":
            ids = inventory_ids(ruleset, resource)
            items = lookup.resources(ids)
            rows = []
            for i in ids:  # each one listed (the same item twice counts twice)
                item = items.get(i)
                if item is not None:
                    item_attrs = ruleset.def_for(item).attributes
                    rows.append({**(item.attributes or {}), **_formulas(item_attrs, item.attributes or {})})
        elif of == "groups":
            rows = [dict(g.attributes or {}) | group_values(db, ruleset, g, with_lists=False) for g in lookup.groups_of(resource.id)]
        else:  # an item's owners
            rows = [{**(c.attributes or {})} for c in lookup.owners_of(resource)]
        out[attr.key] = calculated.aggregate(attr.calc, rows)
    return out


def group_values(db: Session, ruleset: Ruleset, group: CharacterGroup, with_lists: bool = True) -> dict[str, Any]:
    """A group's calculated values (its characters' values, or its own formulas)."""
    calcs = _calcs(ruleset.group_attributes)
    if not calcs:
        return {}
    out: dict[str, Any] = _formulas(ruleset.group_attributes, group.attributes or {})
    if with_lists and any(a.calc["op"] != "formula" for a in calcs):
        ids = [m.resource_id for m in group.members]
        characters = db.scalars(select(Resource).where(Resource.id.in_(ids))).all() if ids else []
        rows = [{**(c.attributes or {}), **_formulas(ruleset.def_for(c).attributes, c.attributes or {})} for c in characters]
        for attr in calcs:
            if attr.calc["op"] != "formula":
                out[attr.key] = calculated.aggregate(attr.calc, rows)
    return out
