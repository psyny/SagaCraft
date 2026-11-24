"""Character groups, and the Saga template's starting content. See docs/concepts/characters.md.

Characters are organized by their **type** (plan 40: the categories were merged into the types, in the Saga template:
a type's name, plural, its own variables, whether its characters are player characters and whether new ones are
instanceable). Groups are sets of characters (the party, an encounter); they are the DM's preparation, admin only.
"""
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from domain.display import PALETTE, TemplateError, builtin_config, clean_color
from models import CharacterGroup, CharacterGroupMember, DisplayTemplate, Resource, Saga, SagaMember
from services.access import get_saga, require_admin
from services.errors import BadRequest, NotFound

KIND = "character"
MAX_COUNT = 50


# ---------------------------------------------------------------------------
# Saga template: starting display templates and groups, made once
# ---------------------------------------------------------------------------


def ensure_template(db: Session, saga: Saga) -> None:
    """Apply the Saga template's starting content the first time (new Sagas): each character type without a default
    display template gets its own built-in one (made from its type); the starting groups the Saga doesn't have yet
    (by name: a file's were added with its extras); characters of player types join the player parties."""
    if saga.template_applied:
        return
    from services.resources import ruleset_for

    ruleset = ruleset_for(db, saga.id)
    template = ruleset.saga_template
    types = [(key, type_def) for (kind, key), type_def in ruleset.types.items() if kind == KIND]
    defaults = dict(saga.display_defaults or {})
    by_type = dict(defaults.get(KIND) or {})
    for index, (key, type_def) in enumerate(types):
        if key in by_type:
            continue
        made = DisplayTemplate(saga_id=saga.id, kind=KIND, name=type_def.name,
                               config=builtin_config(type_def, PALETTE[(index + 2) % len(PALETTE)]))
        db.add(made)
        db.flush()
        by_type[key] = made.id
    defaults[KIND] = by_type
    saga.display_defaults = defaults
    player_types = {key for key, type_def in types if type_def.player}
    characters = db.scalars(select(Resource).where(Resource.saga_id == saga.id, Resource.kind == KIND)
                            .order_by(Resource.id)).all()
    taken = {g.name.lower() for g in db.scalars(select(CharacterGroup).where(CharacterGroup.saga_id == saga.id)).all()}
    for index, raw in enumerate(template["groups"], start=1):
        if raw["name"].lower() in taken:
            continue
        group = CharacterGroup(saga_id=saga.id, sort_order=index, **{"color": PALETTE[(index - 1) % len(PALETTE)], **raw})
        db.add(group)
        db.flush()
        if raw["player_party"]:
            for order, resource in enumerate((r for r in characters if r.type in player_types), start=1):
                db.add(CharacterGroupMember(group_id=group.id, resource_id=resource.id, count=1, sort_order=order))
    saga.template_applied = True
    db.commit()


def _clean_name(value: Any, label: str) -> str:
    name = str(value or "").strip()[:120]
    if not name:
        raise BadRequest(f"The {label} needs a name")
    return name


# ---------------------------------------------------------------------------
# Groups (of characters)
# ---------------------------------------------------------------------------


def group_out(group: CharacterGroup, calculated: dict | None = None) -> dict:
    """`calculated`: its calculated group variables' values (services/calculated.py)."""
    return {
        "id": group.id, "name": group.name, "player_party": group.player_party, "active": group.active,
        "favorite": group.favorite, "color": group.color, "sort_order": group.sort_order,
        "attributes": {**(group.attributes or {}), **(calculated or {})},
        "members": [{"resource_id": m.resource_id, "count": m.count} for m in group.members],
        "created_at": group.created_at.isoformat() if group.created_at else None,
    }


def saga_groups(db: Session, saga_id: int) -> list[CharacterGroup]:
    """Favorites first, then the DM's order."""
    ensure_template(db, get_saga(db, saga_id))
    return list(db.scalars(select(CharacterGroup).where(CharacterGroup.saga_id == saga_id).order_by(
        CharacterGroup.favorite.desc(), CharacterGroup.sort_order, CharacterGroup.id)).all())


def _with_values(db: Session, group: CharacterGroup) -> dict:
    from services.calculated import group_values
    from services.resources import ruleset_for

    return group_out(group, group_values(db, ruleset_for(db, group.saga_id), group))


def list_groups(db: Session, member: SagaMember) -> list[dict]:
    require_admin(member)
    return [_with_values(db, g) for g in saga_groups(db, member.saga_id)]


def _group(db: Session, member: SagaMember, group_id: int) -> CharacterGroup:
    group = db.get(CharacterGroup, group_id)
    if group is None or group.saga_id != member.saga_id:
        raise NotFound("Group not found")
    return group


def _set_members(db: Session, saga_id: int, group: CharacterGroup, raw: Any) -> None:
    if not isinstance(raw, list):
        raise BadRequest("members must be a list")
    wanted: dict[int, int] = {}
    for item in raw:
        if not isinstance(item, dict) or "resource_id" not in item:
            raise BadRequest("Each member needs a resource_id")
        try:
            rid, count = int(item["resource_id"]), int(item.get("count", 1))
        except (TypeError, ValueError):
            raise BadRequest("Member ids and counts must be numbers") from None
        wanted[rid] = max(1, min(MAX_COUNT, count))
    resources = {r.id: r for r in db.scalars(select(Resource).where(
        Resource.saga_id == saga_id, Resource.kind == KIND, Resource.id.in_(list(wanted)))).all()}
    if set(resources) != set(wanted):
        raise BadRequest("Unknown character in the group")
    group.members.clear()
    db.flush()
    for order, (rid, count) in enumerate(wanted.items(), start=1):
        # Only instanceable characters can be there more than once (each copy becomes an instance)
        group.members.append(CharacterGroupMember(resource_id=rid, count=count if resources[rid].instanceable else 1,
                                                  sort_order=order))


def _apply_group(db: Session, member: SagaMember, group: CharacterGroup, data: dict) -> None:
    if data.get("name") is not None:
        group.name = _clean_name(data["name"], "group")
    for flag in ("player_party", "active", "favorite"):
        if data.get(flag) is not None:
            setattr(group, flag, bool(data[flag]))
    if data.get("color") is not None:
        try:
            group.color = clean_color(data["color"])
        except TemplateError as exc:
            raise BadRequest(str(exc)) from None
    if data.get("sort_order") is not None:
        group.sort_order = int(data["sort_order"])
    if data.get("members") is not None:
        _set_members(db, member.saga_id, group, data["members"])
    if data.get("attributes") is not None:  # the template's group variables, checked like a resource's values
        from services.resources import _apply, ruleset_for

        if not isinstance(data["attributes"], dict):
            raise BadRequest("attributes must be an object")
        group.attributes = _apply(db, member.saga_id, ruleset_for(db, member.saga_id).group_attributes,
                                  dict(group.attributes or {}), data["attributes"])


def create_group(db: Session, member: SagaMember, data: dict) -> dict:
    require_admin(member)
    existing = saga_groups(db, member.saga_id)
    group = CharacterGroup(saga_id=member.saga_id, name=_clean_name(data.get("name") or "New group", "group"),
                           color=PALETTE[len(existing) % len(PALETTE)],
                           sort_order=max((g.sort_order for g in existing), default=0) + 1)
    db.add(group)
    db.flush()
    _apply_group(db, member, group, {k: v for k, v in data.items() if k != "name"})
    db.commit()
    return _with_values(db, group)


def update_group(db: Session, member: SagaMember, group_id: int, data: dict) -> dict:
    require_admin(member)
    group = _group(db, member, group_id)
    _apply_group(db, member, group, data)
    db.commit()
    return _with_values(db, group)


def delete_group(db: Session, member: SagaMember, group_id: int) -> None:
    require_admin(member)
    db.delete(_group(db, member, group_id))
    db.commit()


def resource_group_ids(db: Session, resource_id: int) -> list[int]:
    return sorted(db.scalars(select(CharacterGroupMember.group_id).where(CharacterGroupMember.resource_id == resource_id)).all())


def set_resource_groups(db: Session, saga_id: int, resource: Resource, group_ids: list[int]) -> None:
    """The character form's groups: join the chosen groups, leave the others (counts kept where it stays)."""
    wanted = {int(g) for g in group_ids}
    groups = {g.id: g for g in db.scalars(select(CharacterGroup).where(CharacterGroup.saga_id == saga_id)).all()}
    if not wanted <= set(groups):
        raise BadRequest("Unknown group")
    for group in groups.values():
        link = next((m for m in group.members if m.resource_id == resource.id), None)
        if group.id in wanted and link is None:
            order = max((m.sort_order for m in group.members), default=0) + 1
            group.members.append(CharacterGroupMember(resource_id=resource.id, count=1, sort_order=order))
        elif group.id not in wanted and link is not None:
            group.members.remove(link)


def active_party_ids(db: Session, saga_id: int) -> list[int]:
    return [g.id for g in saga_groups(db, saga_id) if g.player_party and g.active]


def expand_groups(db: Session, saga_id: int, group_ids: list[int]) -> list[tuple[int, int]]:
    """(resource id, group id) to add for these groups, in group order; instanceable ones repeated by their count."""
    result: list[tuple[int, int]] = []
    for group_id in group_ids:
        group = db.get(CharacterGroup, int(group_id))
        if group is None or group.saga_id != saga_id:
            raise BadRequest("Unknown group")
        for link in group.members:
            character = db.get(Resource, link.resource_id)
            if character is not None and character.active is False:
                continue  # inactive: stays out of what happens to its groups
            result.extend([(link.resource_id, group.id)] * max(1, link.count))
    return result
