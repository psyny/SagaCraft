"""System administration of Sagas (plan 43): the list (search, order, a page at a time), one Saga's page (its
numbers, members, files per upload category), active or not, delete, add a DM.

System admins see numbers and names, never a Saga's content. Turning a Saga off (`sagas.is_archived`) closes it to
its members (it leaves their Sagas list; its live link stops) until it's turned on again; deleting it deletes
everything in it. See docs/concepts/sagas-and-access.md.
"""
from datetime import timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from domain import permissions as perms
from models import (LocationMap, Relationship, Resource, Saga, SagaMember, Stage, StoredFile, User, utcnow)
from services.access import _add_member, _like, member_name, require_permission, system_permissions
from services.errors import BadRequest, Forbidden, NotFound

ORDERS = ("last_login", "name", "newest", "oldest")
STATUSES = ("all", "active", "inactive")
MAX_PAGE = 50
SEEN_EVERY = timedelta(minutes=5)  # a member opening their Saga is written at most this often


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _require_system_admin(user: User) -> None:
    if not system_permissions(user):
        raise Forbidden("Only system admins can see this")


def touch_member(db: Session, member: SagaMember) -> None:
    """The member opened their Saga: its last login (written at most every few minutes)."""
    now = utcnow()
    seen = member.last_seen_at
    if seen is not None and seen.tzinfo is None:
        seen = seen.replace(tzinfo=now.tzinfo)
    if seen is None or now - seen >= SEEN_EVERY:
        member.last_seen_at = now
        db.commit()


def _members_summary(db: Session):
    return (select(SagaMember.saga_id, func.max(SagaMember.last_seen_at).label("seen"), func.count().label("members"))
            .group_by(SagaMember.saga_id).subquery())


def _admins(db: Session, saga_id: int) -> list[str]:
    return list(db.scalars(select(User.login).join(SagaMember, SagaMember.user_id == User.id)
                           .where(SagaMember.saga_id == saga_id, SagaMember.role == "admin").order_by(User.login)).all())


def saga_row(db: Session, saga: Saga, seen=None, members: int | None = None) -> dict:
    if members is None:
        summary = db.execute(select(func.max(SagaMember.last_seen_at), func.count()).where(SagaMember.saga_id == saga.id)).one()
        seen, members = summary[0], summary[1]
    return {"id": saga.id, "name": saga.name, "ruleset_key": saga.ruleset_key, "is_archived": bool(saga.is_archived),
            "admins": _admins(db, saga.id), "member_count": members or 0, "last_login": _iso(seen),
            "created_at": _iso(saga.created_at)}


def list_sagas(db: Session, user: User, query: str = "", order: str = "last_login", status: str = "all",
               offset: int = 0, limit: int = 5) -> dict:
    """A page of Sagas: names with `query`, active or not, ordered by last login (the most recent first; never
    opened last), name, or when made."""
    _require_system_admin(user)
    if order not in ORDERS:
        raise BadRequest(f"order: one of {list(ORDERS)}")
    if status not in STATUSES:
        raise BadRequest(f"status: one of {list(STATUSES)}")
    summary = _members_summary(db)
    statement = select(Saga, summary.c.seen, summary.c.members).outerjoin(summary, summary.c.saga_id == Saga.id)
    query = (query or "").strip().lower()
    if query:
        statement = statement.where(func.lower(Saga.name).like(_like(query), escape="\\"))
    if status != "all":
        statement = statement.where(Saga.is_archived.is_(status == "inactive"))
    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    by = {
        "last_login": (summary.c.seen.desc().nulls_last(), func.lower(Saga.name)),
        "name": (func.lower(Saga.name), Saga.id),
        "newest": (Saga.created_at.desc(), Saga.id.desc()),
        "oldest": (Saga.created_at, Saga.id),
    }[order]
    limit = max(1, min(MAX_PAGE, int(limit)))
    offset = max(0, int(offset))
    rows = db.execute(statement.order_by(*by).offset(offset).limit(limit)).all()
    return {"total": total, "offset": offset, "limit": limit,
            "sagas": [saga_row(db, saga, seen, members) for saga, seen, members in rows]}


def _saga(db: Session, saga_id: int) -> Saga:
    saga = db.get(Saga, saga_id)
    if saga is None:
        raise NotFound("Saga not found")
    return saga


def _has_map_picture(data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    if data.get("images"):  # a map from before layers
        return True
    return any((layer or {}).get("images") for layer in (data.get("layers") or []) if isinstance(layer, dict))


def saga_stats(db: Session, saga: Saga) -> dict:
    """How much the Saga holds: people, characters (player characters, NPCs), items, documents, events, locations and
    maps (locations with a map picture), relationships, Stages; and its files per upload category."""
    from services.resources import ruleset_of
    from services.uploads import get_limits

    ruleset = ruleset_of(saga)
    player_types = {key for (kind, key), type_def in ruleset.types.items() if kind == "character" and type_def.player}
    counts = {"player_characters": 0, "npcs": 0, "items": 0, "documents": 0, "events": 0, "locations": 0}
    plural = {"item": "items", "document": "documents", "event": "events", "location": "locations"}
    for kind, type_key, n in db.execute(select(Resource.kind, Resource.type, func.count()).where(Resource.saga_id == saga.id)
                                        .group_by(Resource.kind, Resource.type)).all():
        if kind == "character":
            counts["player_characters" if type_key in player_types else "npcs"] += n
        elif kind in plural:
            counts[plural[kind]] += n
    maps = db.scalars(select(LocationMap.data).join(Resource, Resource.id == LocationMap.resource_id)
                      .where(Resource.saga_id == saga.id)).all()
    counts["maps"] = sum(1 for data in maps if _has_map_picture(data))
    counts["relationships"] = db.scalar(select(func.count()).select_from(Relationship).where(Relationship.saga_id == saga.id)) or 0
    counts["stages"] = db.scalar(select(func.count()).select_from(Stage).where(Stage.saga_id == saga.id)) or 0
    roles = dict(db.execute(select(SagaMember.role, func.count()).where(SagaMember.saga_id == saga.id)
                            .group_by(SagaMember.role)).all())
    counts.update({"dms": roles.get("admin", 0), "players": roles.get("player", 0), "viewers": roles.get("viewer", 0)})
    labels = {key: value.get("label", key) for key, value in get_limits(db)["categories"].items()}
    files = [{"category": category, "label": labels.get(category, category), "count": n, "size": int(size or 0)}
             for category, n, size in db.execute(select(StoredFile.category, func.count(), func.sum(StoredFile.size))
                                                 .where(StoredFile.saga_id == saga.id).group_by(StoredFile.category)).all()]
    files.sort(key=lambda f: -f["size"])
    return {"counts": counts, "files": files, "files_size": sum(f["size"] for f in files)}


def saga_detail(db: Session, user: User, saga_id: int) -> dict:
    _require_system_admin(user)
    saga = _saga(db, saga_id)
    members = db.scalars(select(SagaMember).where(SagaMember.saga_id == saga.id).order_by(SagaMember.id)).all()
    order = {"admin": 0, "player": 1, "viewer": 2}
    return {
        **saga_row(db, saga),
        **saga_stats(db, saga),
        "template": (saga.template or {}).get("name") or saga.ruleset_key,
        "members": [{"id": m.id, "user_id": m.user_id, "login": m.user.login, "display_name": member_name(m),
                     "role": m.role, "last_login": _iso(m.last_seen_at), "account_active": bool(m.user.is_active)}
                    for m in sorted(members, key=lambda m: (order.get(m.role, 3), member_name(m).lower()))],
    }


def set_active(db: Session, user: User, saga_id: int, active: bool) -> dict:
    """Turn a Saga on or off: off, its members can't open it (it leaves their list; its live link stops)."""
    require_permission(user, perms.SAGAS_MANAGE)
    if not isinstance(active, bool):
        raise BadRequest("active: true or false")
    saga = _saga(db, saga_id)
    saga.is_archived = not active
    db.commit()
    return saga_detail(db, user, saga_id)


def delete_saga(db: Session, user: User, saga_id: int, confirm: str) -> None:
    """Delete a Saga and everything in it (its members' accounts stay). The caller types its name to confirm."""
    require_permission(user, perms.SAGAS_MANAGE)
    saga = _saga(db, saga_id)
    if (confirm or "").strip() != saga.name.strip():
        raise BadRequest("Type the Saga's name to delete it")
    saga.live_stage_id = None
    db.flush()
    db.execute(delete(Saga).where(Saga.id == saga.id))  # every table of the Saga's goes with it (foreign keys)
    db.commit()
    db.expunge_all()


def add_dm(db: Session, user: User, saga_id: int, account: str | None, login: str, password: str | None,
           display_name: str) -> dict:
    """Make someone a DM of the Saga: an existing account (a member already: made DM) or a new one."""
    require_permission(user, perms.SAGA_ADMINS_ASSIGN)
    saga = _saga(db, saga_id)
    existing = db.scalar(select(SagaMember).join(User, User.id == SagaMember.user_id)
                         .where(SagaMember.saga_id == saga.id, User.login == (login or "").strip().lower()))
    if existing is not None and account != "new":
        existing.role = "admin"
        if (display_name or "").strip():
            existing.display_name = " ".join(display_name.split())[:120]
    else:
        _add_member(db, saga, login, password, display_name, "admin", account)
    db.commit()
    return saga_detail(db, user, saga_id)
