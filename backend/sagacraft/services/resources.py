"""Saga resources (characters, items, ...) shaped by the Saga's ruleset, and uploaded files."""
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from domain.ruleset import AttributeDef, AttributeValueError, Ruleset, default_value, get_ruleset, validate_block
from domain.visibility import Viewer, can_see, rule_allows
from models import Resource, SagaMember, StoredFile
from services.access import check_visibility, get_saga, require_admin, viewer_for
from services.errors import BadRequest, Forbidden, NotFound
from services.security import signed_file_url

def ruleset_for(db: Session, saga_id: int) -> Ruleset:
    return get_ruleset(get_saga(db, saga_id).ruleset_key)


def controller_ids(ruleset: Ruleset, resource: Resource) -> set[int]:
    type_def = ruleset.type_def(resource.kind, resource.type)
    ids: set[int] = set()
    for attr in type_def.attributes:
        if attr.controllers:
            value = (resource.attributes or {}).get(attr.key)
            if isinstance(value, list):
                ids.update(int(v) for v in value)
            elif isinstance(value, int):
                ids.add(value)
    return ids


def can_see_resource(viewer: Viewer, ruleset: Ruleset, resource: Resource) -> bool:
    return can_see(viewer, resource.visibility) or viewer.member_id in controller_ids(ruleset, resource)


def public_value(attr: AttributeDef, value: Any) -> Any:
    """Value as sent to a client allowed to see it (adds signed URLs for images)."""
    if attr.type == "image" and isinstance(value, dict) and value.get("file_id"):
        return {**value, "url": signed_file_url(value["file_id"])}
    return value


def serialize(ruleset: Ruleset, viewer: Viewer, resource: Resource) -> dict:
    type_def = ruleset.type_def(resource.kind, resource.type)
    controllers = controller_ids(ruleset, resource)
    values = resource.attributes or {}
    attributes = {}
    editable = []
    for attr in type_def.attributes:
        if rule_allows(viewer, attr.view, controllers):
            attributes[attr.key] = public_value(attr, values.get(attr.key))
        if rule_allows(viewer, attr.edit, controllers):
            editable.append(attr.key)
    data = {
        "id": resource.id,
        "kind": resource.kind,
        "type": resource.type,
        "name": resource.name,
        "attributes": attributes,
        "editable": editable,
        "updated_at": resource.updated_at.isoformat() if resource.updated_at else None,
    }
    if viewer.is_admin:
        data["visibility"] = resource.visibility or {"groups": [], "members": []}
    return data


def _validate_refs(db: Session, saga_id: int, attr: AttributeDef, value: Any) -> None:
    if value is None:
        return
    if attr.type == "member_ref":
        ids = value if isinstance(value, list) else [value]
        found = set(db.scalars(select(SagaMember.id).where(SagaMember.saga_id == saga_id, SagaMember.id.in_(ids))).all())
        if found != set(ids):
            raise BadRequest(f"{attr.name}: unknown member")
    if attr.type == "image":
        file = db.get(StoredFile, value["file_id"])
        if file is None or file.saga_id != saga_id:
            raise BadRequest(f"{attr.name}: unknown file")
    refs: list[int] = []
    kind = None
    if attr.type == "resource_ref":
        refs = value if isinstance(value, list) else [value]
    elif attr.type == "list" and (attr.of or {}).get("type") == "resource_ref":
        refs, kind = list(value), attr.of.get("kind")
    if refs:
        query = select(Resource.id).where(Resource.saga_id == saga_id, Resource.id.in_(refs))
        if kind:
            query = query.where(Resource.kind == kind)
        if set(db.scalars(query).all()) != set(refs):
            raise BadRequest(f"{attr.name}: unknown resource")


def _apply(db: Session, saga_id: int, type_attrs: list[AttributeDef], current: dict, changes: dict) -> dict:
    by_key = {a.key: a for a in type_attrs}
    result = dict(current)
    for key, raw in changes.items():
        attr = by_key.get(key)
        if attr is None:
            raise BadRequest(f"Unknown attribute '{key}'")
        try:
            value = validate_block(attr, raw, attr.name)
        except AttributeValueError as exc:
            raise BadRequest(str(exc)) from None
        _validate_refs(db, saga_id, attr, value)
        result[key] = value
    for attr in type_attrs:
        if attr.required and not result.get(attr.key):
            raise BadRequest(f"{attr.name} is required")
    return result


def _get(db: Session, saga_id: int, resource_id: int) -> Resource:
    resource = db.get(Resource, resource_id)
    if resource is None or resource.saga_id != saga_id:
        raise NotFound("Resource not found")
    return resource


def list_resources(db: Session, member: SagaMember, kind: str | None = None) -> list[dict]:
    ruleset = ruleset_for(db, member.saga_id)
    viewer = viewer_for(db, member)
    query = select(Resource).where(Resource.saga_id == member.saga_id).order_by(Resource.name)
    if kind:
        query = query.where(Resource.kind == kind)
    return [serialize(ruleset, viewer, r) for r in db.scalars(query).all() if can_see_resource(viewer, ruleset, r)]


def get_resource(db: Session, member: SagaMember, resource_id: int) -> dict:
    ruleset = ruleset_for(db, member.saga_id)
    viewer = viewer_for(db, member)
    resource = _get(db, member.saga_id, resource_id)
    if not can_see_resource(viewer, ruleset, resource):
        raise NotFound("Resource not found")
    return serialize(ruleset, viewer, resource)


def create_resource(db: Session, member: SagaMember, kind: str, type_key: str, attributes: dict,
                    visibility: dict | None) -> Resource:
    require_admin(member)
    ruleset = ruleset_for(db, member.saga_id)
    try:
        type_def = ruleset.type_def(kind, type_key)
    except AttributeValueError as exc:
        raise BadRequest(str(exc)) from None
    base = {a.key: default_value(a) for a in type_def.attributes}
    values = _apply(db, member.saga_id, type_def.attributes, base, attributes or {})
    resource = Resource(
        saga_id=member.saga_id, kind=kind, type=type_key, name=str(values.get("name") or "")[:200],
        attributes=values, visibility=check_visibility(db, member.saga_id, visibility),
        created_by_member_id=member.id,
    )
    db.add(resource)
    db.commit()
    return resource


def update_resource(db: Session, member: SagaMember, resource_id: int, attributes: dict | None,
                    visibility: dict | None) -> Resource:
    ruleset = ruleset_for(db, member.saga_id)
    viewer = viewer_for(db, member)
    resource = _get(db, member.saga_id, resource_id)
    if not can_see_resource(viewer, ruleset, resource):
        raise NotFound("Resource not found")
    type_def = ruleset.type_def(resource.kind, resource.type)
    controllers = controller_ids(ruleset, resource)
    attributes = attributes or {}
    for key in attributes:
        attr = next((a for a in type_def.attributes if a.key == key), None)
        if attr is not None and not rule_allows(viewer, attr.edit, controllers):
            raise Forbidden(f"You can't change {attr.name}")
    resource.attributes = _apply(db, member.saga_id, type_def.attributes, resource.attributes or {}, attributes)
    resource.name = str(resource.attributes.get("name") or "")[:200]
    if visibility is not None:
        require_admin(member)
        resource.visibility = check_visibility(db, member.saga_id, visibility)
    db.commit()
    return resource


def change_counter(db: Session, member: SagaMember, resource_id: int, key: str, delta: float | None,
                   current: float | None) -> Resource:
    """Quick command: add delta to a counter's current value (or set it), e.g. HP -7."""
    resource = _get(db, member.saga_id, resource_id)
    value = dict((resource.attributes or {}).get(key) or {})
    if "current" not in value:
        raise BadRequest(f"'{key}' is not a counter")
    if current is not None:
        value["current"] = current
    elif delta is not None:
        value["current"] = value["current"] + delta
    else:
        raise BadRequest("Give a delta or a current value")
    return update_resource(db, member, resource_id, {key: value}, None)


def delete_resource(db: Session, member: SagaMember, resource_id: int) -> None:
    require_admin(member)
    db.delete(_get(db, member.saga_id, resource_id))
    db.commit()


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------


def get_file(db: Session, file_id: int) -> StoredFile:
    file = db.get(StoredFile, file_id)
    if file is None:
        raise NotFound("File not found")
    return file
