"""Character categories and groups, and the Saga template's starting ones. See docs/concepts/characters.md.

Categories organize characters (each is based on a ruleset type: picking the category picks the type).
Groups are sets of characters (the party, an encounter); they are the DM's preparation, admin only.
"""
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from domain.display import PALETTE, TemplateError, builtin_config, clean_color
from models import CharacterCategory, CharacterGroup, CharacterGroupMember, DisplayTemplate, Resource, Saga, SagaMember
from services.access import get_saga, require_admin
from services.errors import BadRequest, NotFound

KIND = "character"
MAX_COUNT = 50


# ---------------------------------------------------------------------------
# Saga template: starting categories and groups, created once
# ---------------------------------------------------------------------------


def ensure_template(db: Session, saga: Saga) -> None:
    """Apply the Saga template's defaults the first time (new Sagas, and Sagas made before categories).
    Each category gets its own built-in display template (made from its type) as its default. Existing
    characters get the first category of their type; player characters join the player parties."""
    if saga.template_applied:
        return
    from domain.ruleset import get_ruleset

    ruleset = get_ruleset(saga.ruleset_key)
    template = ruleset.saga_template
    categories = []
    for index, raw in enumerate(template["categories"], start=1):
        category = CharacterCategory(saga_id=saga.id, sort_order=index, **raw)
        db.add(category)
        categories.append(category)
    db.flush()
    defaults = dict(saga.display_defaults or {})
    own = dict(defaults.get("categories") or {})
    by_type_default = dict(defaults.get(KIND) or {})
    for index, category in enumerate(categories):
        made = DisplayTemplate(saga_id=saga.id, kind=KIND, name=category.name,
                                  config=builtin_config(ruleset.type_def(KIND, category.type), PALETTE[(index + 2) % len(PALETTE)]))
        db.add(made)
        db.flush()
        own[str(category.id)] = made.id
        by_type_default.setdefault(category.type, made.id)  # a type's default: its first category's
    defaults["categories"], defaults[KIND] = own, by_type_default
    saga.display_defaults = defaults
    by_type: dict[str, CharacterCategory] = {}
    for category in categories:
        by_type.setdefault(category.type, category)
    characters = db.scalars(select(Resource).where(Resource.saga_id == saga.id, Resource.kind == KIND)
                            .order_by(Resource.id)).all()
    for resource in characters:
        if resource.category_id is None and resource.type in by_type:
            resource.category_id = by_type[resource.type].id
    player_ids = {c.id for c in categories if c.player}
    for index, raw in enumerate(template["groups"], start=1):
        group = CharacterGroup(saga_id=saga.id, sort_order=index, **{"color": PALETTE[(index - 1) % len(PALETTE)], **raw})
        db.add(group)
        db.flush()
        if raw["player_party"]:
            for order, resource in enumerate((r for r in characters if r.category_id in player_ids), start=1):
                db.add(CharacterGroupMember(group_id=group.id, resource_id=resource.id, count=1, sort_order=order))
    saga.template_applied = True
    db.commit()


def saga_categories(db: Session, saga_id: int) -> list[CharacterCategory]:
    ensure_template(db, get_saga(db, saga_id))
    return list(db.scalars(select(CharacterCategory).where(CharacterCategory.saga_id == saga_id)
                           .order_by(CharacterCategory.sort_order, CharacterCategory.id)).all())


def category_of(db: Session, saga_id: int, category_id: int) -> CharacterCategory:
    category = db.get(CharacterCategory, category_id)
    if category is None or category.saga_id != saga_id:
        raise BadRequest("Unknown category")
    return category


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------


def category_out(category: CharacterCategory, count: int | None = None) -> dict:
    data = {"id": category.id, "key": category.key, "name": category.name, "plural": category.plural or category.name,
            "type": category.type, "player": category.player, "instanceable": category.instanceable,
            "sort_order": category.sort_order}
    if count is not None:
        data["count"] = count
    return data


def list_categories(db: Session, member: SagaMember) -> list[dict]:
    """Every member sees the categories (they are the Characters tab's sections); admins also get counts."""
    categories = saga_categories(db, member.saga_id)
    counts: dict[int, int] = {}
    if member.role == "admin":
        rows = db.execute(select(Resource.category_id, func.count()).where(Resource.saga_id == member.saga_id)
                          .group_by(Resource.category_id)).all()
        counts = {cid: n for cid, n in rows if cid is not None}
    return [category_out(c, counts.get(c.id, 0) if member.role == "admin" else None) for c in categories]


def _clean_name(value: Any, label: str) -> str:
    name = str(value or "").strip()[:120]
    if not name:
        raise BadRequest(f"The {label} needs a name")
    return name


def create_category(db: Session, member: SagaMember, data: dict) -> dict:
    require_admin(member)
    from services.resources import ruleset_for

    existing = saga_categories(db, member.saga_id)
    type_key = data.get("type")
    if ("character", type_key) not in ruleset_for(db, member.saga_id).types:
        raise BadRequest("Pick the type this category is based on")
    player = bool(data.get("player", False))
    category = CharacterCategory(
        saga_id=member.saga_id, key=None, name=_clean_name(data.get("name"), "category"),
        plural=str(data.get("plural") or "").strip()[:120], type=type_key, player=player,
        instanceable=bool(data.get("instanceable", False)) and not player,
        sort_order=max((c.sort_order for c in existing), default=0) + 1,
    )
    db.add(category)
    db.commit()
    return category_out(category, 0)


def _used(db: Session, category_id: int) -> int:
    return db.scalar(select(func.count()).select_from(Resource).where(Resource.category_id == category_id)) or 0


def update_category(db: Session, member: SagaMember, category_id: int, data: dict) -> dict:
    require_admin(member)
    category = category_of(db, member.saga_id, category_id)
    if "name" in data and data["name"] is not None:
        category.name = _clean_name(data["name"], "category")
    if data.get("plural") is not None:
        category.plural = str(data["plural"]).strip()[:120]
    if data.get("type") is not None and data["type"] != category.type:
        from services.resources import ruleset_for

        if ("character", data["type"]) not in ruleset_for(db, member.saga_id).types:
            raise BadRequest("Unknown type")
        if _used(db, category.id):
            raise BadRequest("Characters use this category: its type can't change")
        category.type = data["type"]
    if data.get("player") is not None:
        category.player = bool(data["player"])
    if data.get("instanceable") is not None:
        category.instanceable = bool(data["instanceable"])
    if category.player:
        category.instanceable = False
    if data.get("sort_order") is not None:
        category.sort_order = int(data["sort_order"])
    db.commit()
    return category_out(category, _used(db, category.id))


def delete_category(db: Session, member: SagaMember, category_id: int) -> None:
    require_admin(member)
    category = category_of(db, member.saga_id, category_id)
    if _used(db, category.id):
        raise BadRequest("Characters use this category: move them to another one first")
    db.delete(category)
    db.commit()


# ---------------------------------------------------------------------------
# Groups (of characters)
# ---------------------------------------------------------------------------


def group_out(group: CharacterGroup) -> dict:
    return {
        "id": group.id, "name": group.name, "player_party": group.player_party, "active": group.active,
        "favorite": group.favorite, "color": group.color, "sort_order": group.sort_order,
        "members": [{"resource_id": m.resource_id, "count": m.count} for m in group.members],
        "created_at": group.created_at.isoformat() if group.created_at else None,
    }


def saga_groups(db: Session, saga_id: int) -> list[CharacterGroup]:
    """Favorites first, then the DM's order."""
    ensure_template(db, get_saga(db, saga_id))
    return list(db.scalars(select(CharacterGroup).where(CharacterGroup.saga_id == saga_id).order_by(
        CharacterGroup.favorite.desc(), CharacterGroup.sort_order, CharacterGroup.id)).all())


def list_groups(db: Session, member: SagaMember) -> list[dict]:
    require_admin(member)
    return [group_out(g) for g in saga_groups(db, member.saga_id)]


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
    return group_out(group)


def update_group(db: Session, member: SagaMember, group_id: int, data: dict) -> dict:
    require_admin(member)
    group = _group(db, member, group_id)
    _apply_group(db, member, group, data)
    db.commit()
    return group_out(group)


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
            result.extend([(link.resource_id, group.id)] * max(1, link.count))
    return result
