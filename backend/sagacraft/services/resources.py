"""Saga resources (characters, items, ...) shaped by the Saga's ruleset, and uploaded files."""
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from domain.ruleset import AttributeDef, AttributeValueError, Ruleset, default_value, get_ruleset, validate_block
from domain.visibility import Viewer, can_see, rule_allows
from models import Resource, SagaMember, StoredFile
from services.access import check_visibility, get_saga, require_admin, viewer_for
from services.errors import BadRequest, Forbidden, NotFound
from services.folders import folder_for
from services.security import signed_file_url

_SAGA_RULESETS: dict[tuple, Ruleset] = {}


def ruleset_for(db: Session, saga_id: int) -> Ruleset:
    """The Saga's ruleset: its own Saga template (parsed once per version), else the built-in one."""
    saga = get_saga(db, saga_id)
    if saga.template is None:
        return get_ruleset(saga.ruleset_key)
    key = (saga.id, str(saga.created_at), saga.template_version or 1)  # created_at: a reset database reuses ids
    ruleset = _SAGA_RULESETS.get(key)
    if ruleset is None:
        from services.saga_templates import with_app_kinds

        ruleset = Ruleset(with_app_kinds(saga.template, saga.ruleset_key))
        if len(_SAGA_RULESETS) > 200:
            _SAGA_RULESETS.clear()
        _SAGA_RULESETS[key] = ruleset
    return ruleset


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


def presentation(resource: Resource) -> dict:
    return {"alias": None, "hide_name": False, **(resource.presentation or {})}


def shown_name(viewer: Viewer, resource: Resource, controllers: set[int] | None = None) -> str | None:
    """The name this viewer sees: admins and the character's controllers see the real name; others see the
    alias ("Hooded figure"), or nothing (None, shown as ???) when the name is hidden."""
    if viewer.is_admin or (controllers is not None and viewer.member_id in controllers):
        return resource.name
    return player_name(resource)


def player_name(resource: Resource) -> str | None:
    """The name players (not controlling it) see."""
    shown = presentation(resource)
    if shown["hide_name"]:
        return None
    return shown["alias"] or resource.name


def clean_presentation(raw: Any) -> dict:
    if not isinstance(raw, dict):
        raise BadRequest("presentation must be an object")
    result = {"alias": None, "hide_name": False}
    alias = raw.get("alias")
    result["alias"] = (str(alias).strip()[:120] or None) if alias is not None else None
    result["hide_name"] = bool(raw.get("hide_name", False))
    return result


MAX_TAGS, TAG_LENGTH = 20, 40


def clean_tags(raw: Any) -> list[str]:
    """The DM's tags: trimmed, at most MAX_TAGS, each once (case doesn't count)."""
    if not isinstance(raw, list):
        raise BadRequest("tags must be a list")
    result: list[str] = []
    for item in raw:
        tag = " ".join(str(item or "").split())[:TAG_LENGTH]
        if tag and tag.lower() not in {t.lower() for t in result}:
            result.append(tag)
    if len(result) > MAX_TAGS:
        raise BadRequest(f"At most {MAX_TAGS} tags")
    return result


def public_value(attr: AttributeDef, value: Any) -> Any:
    """Value as sent to a client allowed to see it (adds signed URLs for images)."""
    if attr.type == "image" and isinstance(value, dict) and value.get("file_id"):
        return {**value, "url": signed_file_url(value["file_id"])}
    if attr.type == "image" and isinstance(value, list):
        return [{**v, "url": signed_file_url(v["file_id"])} for v in value if isinstance(v, dict) and v.get("file_id")]
    if attr.type == "pages" and isinstance(value, list):  # a document's picture pages
        return [{**p, "image": {**p["image"], "url": signed_file_url(p["image"]["file_id"])}}
                if isinstance(p, dict) and (p.get("image") or {}).get("file_id") else p for p in value]
    return value


def serialize(ruleset: Ruleset, viewer: Viewer, resource: Resource, group_ids: list[int] | None = None) -> dict:
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
    name = shown_name(viewer, resource, controllers)
    if "name" in attributes:
        attributes["name"] = name
    data = {
        "id": resource.id,
        "kind": resource.kind,
        "type": resource.type,
        "name": name,
        "attributes": attributes,
        "editable": editable,
        "category_id": resource.category_id,
        "folder_id": resource.folder_id,
        "tags": list(resource.tags or []),
        "created_at": resource.created_at.isoformat() if resource.created_at else None,
        "updated_at": resource.updated_at.isoformat() if resource.updated_at else None,
    }
    if viewer.is_admin:
        data["visibility"] = resource.visibility or {"groups": [], "members": []}
        data["presentation"] = presentation(resource)
        data["instanceable"] = bool(resource.instanceable)
        if group_ids is not None:
            data["group_ids"] = group_ids
    return data


def serialize_for(db: Session, viewer: Viewer, resource: Resource) -> dict:
    """serialize, with the character's groups for admins."""
    from services.characters import resource_group_ids

    groups = resource_group_ids(db, resource.id) if viewer.is_admin and resource.kind == "character" else None
    return serialize(ruleset_for(db, resource.saga_id), viewer, resource, groups)


def _validate_refs(db: Session, saga_id: int, attr: AttributeDef, value: Any) -> None:
    if value is None:
        return
    if attr.type == "date":
        from services.calendars import check_date

        check_date(db, saga_id, value, attr.name)
    if attr.type == "member_ref":
        ids = value if isinstance(value, list) else [value]
        found = set(db.scalars(select(SagaMember.id).where(SagaMember.saga_id == saga_id, SagaMember.id.in_(ids))).all())
        if found != set(ids):
            raise BadRequest(f"{attr.name}: unknown member")
    if attr.type == "pages":
        from services.uploads import get_limits

        pictures = [p["image"] for p in value if p.get("image")]
        limit = get_limits(db)["categories"]["document"]["max_count"]
        if len(pictures) > limit:
            raise BadRequest(f"{attr.name}: at most {limit} picture pages")
        ids = {p["file_id"] for p in pictures}
        if ids and set(db.scalars(select(StoredFile.id).where(StoredFile.saga_id == saga_id, StoredFile.id.in_(ids))).all()) != ids:
            raise BadRequest(f"{attr.name}: unknown file")
    if attr.type == "image":
        pictures = value if isinstance(value, list) else [value]
        if attr.many:
            from services.uploads import get_limits

            limit = get_limits(db)["categories"][attr.category or "character"]["max_count"]
            if len(pictures) > limit:
                raise BadRequest(f"{attr.name}: at most {limit} pictures")
        ids = {p["file_id"] for p in pictures}
        found = set(db.scalars(select(StoredFile.id).where(StoredFile.saga_id == saga_id, StoredFile.id.in_(ids))).all())
        if found != ids:
            raise BadRequest(f"{attr.name}: unknown file")
    refs: list[int] = []
    kind = None
    if attr.type == "resource_ref":
        refs, kind = (value if isinstance(value, list) else [value]), attr.ref_kind
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


def _check_parent(db: Session, ruleset: Ruleset, resource: Resource) -> None:
    """A resource can't be inside itself (a Location part of its own sub-location)."""
    attr = ruleset.type_def(resource.kind, resource.type).parent_attr()
    if attr is None:
        return
    seen = {resource.id}
    parent_id = (resource.attributes or {}).get(attr.key)
    while parent_id is not None:
        if parent_id in seen:
            raise BadRequest(f"{attr.name}: a {resource.kind} can't be inside itself")
        seen.add(parent_id)
        parent = db.get(Resource, parent_id)
        if parent is None or parent.saga_id != resource.saga_id or parent.kind != resource.kind:
            raise BadRequest(f"{attr.name}: unknown {resource.kind}")
        parent_id = (parent.attributes or {}).get(attr.key)


def _get(db: Session, saga_id: int, resource_id: int) -> Resource:
    resource = db.get(Resource, resource_id)
    if resource is None or resource.saga_id != saga_id:
        raise NotFound("Resource not found")
    return resource


def list_resources(db: Session, member: SagaMember, kind: str | None = None) -> list[dict]:
    ruleset = ruleset_for(db, member.saga_id)
    viewer = viewer_for(db, member)
    if kind in (None, "character"):
        from services.characters import ensure_template

        ensure_template(db, get_saga(db, member.saga_id))
    query = select(Resource).where(Resource.saga_id == member.saga_id).order_by(Resource.name)
    if kind:
        query = query.where(Resource.kind == kind)
    groups: dict[int, list[int]] = {}
    if viewer.is_admin:
        from models import CharacterGroup, CharacterGroupMember

        rows = db.execute(select(CharacterGroupMember.resource_id, CharacterGroupMember.group_id)
                          .join(CharacterGroup, CharacterGroup.id == CharacterGroupMember.group_id)
                          .where(CharacterGroup.saga_id == member.saga_id)).all()
        for rid, gid in rows:
            groups.setdefault(rid, []).append(gid)
    visible = [r for r in db.scalars(query).all() if can_see_resource(viewer, ruleset, r)]
    result = [serialize(ruleset, viewer, r, sorted(groups.get(r.id, [])) if viewer.is_admin and r.kind == "character" else None)
              for r in visible]
    if not viewer.is_admin:
        # A parent they can't see: for them the resource is at the top level (they don't learn the parent exists).
        # Parents are of the same kind, so they'd be in this list.
        shown = {r.id for r in visible}
        for item, resource in zip(result, visible):
            attr = ruleset.type_def(resource.kind, resource.type).parent_attr()
            if attr is not None and item["attributes"].get(attr.key) not in shown:
                item["attributes"][attr.key] = None
    return result


def get_resource(db: Session, member: SagaMember, resource_id: int) -> dict:
    ruleset = ruleset_for(db, member.saga_id)
    viewer = viewer_for(db, member)
    resource = _get(db, member.saga_id, resource_id)
    if not can_see_resource(viewer, ruleset, resource):
        raise NotFound("Resource not found")
    data = serialize_for(db, viewer, resource)
    attr = ruleset.type_def(resource.kind, resource.type).parent_attr()
    parent_id = data["attributes"].get(attr.key) if attr is not None else None
    if parent_id is not None and not viewer.is_admin:
        parent = db.get(Resource, parent_id)
        if parent is None or not can_see_resource(viewer, ruleset, parent):
            data["attributes"][attr.key] = None
    return data


def _character_setup(db: Session, saga_id: int, type_key: str | None, category_id: int | None):
    """The category of a new character (it picks the type). Without one: the type's first category."""
    from services.characters import category_of, saga_categories

    if category_id is not None:
        category = category_of(db, saga_id, category_id)
        if type_key and type_key != category.type:
            raise BadRequest("This category is based on another type")
        return category
    category = next((c for c in saga_categories(db, saga_id) if c.type == type_key), None)
    if category is None:
        raise BadRequest("Pick a category")
    return category


def create_resource(db: Session, member: SagaMember, kind: str, type_key: str | None, attributes: dict,
                    visibility: dict | None, shown: dict | None = None, category_id: int | None = None,
                    instanceable: bool | None = None, group_ids: list[int] | None = None,
                    tags: list[str] | None = None, folder_id: int | None = None) -> Resource:
    require_admin(member)
    ruleset = ruleset_for(db, member.saga_id)
    category = None
    if kind == "character":
        category = _character_setup(db, member.saga_id, type_key, category_id)
        type_key = category.type
    try:
        type_def = ruleset.type_def(kind, type_key or "")
    except AttributeValueError as exc:
        raise BadRequest(str(exc)) from None
    base = {a.key: default_value(a) for a in type_def.attributes}
    date_attr = type_def.date_attr() if kind == "event" else None
    if date_attr is not None and (attributes or {}).get(date_attr.key) is None:
        from services.events import default_date

        attributes = {**(attributes or {}), date_attr.key: default_date(db, member.saga_id)}  # today in the story
    values = _apply(db, member.saga_id, type_def.attributes, base, attributes or {})
    resource = Resource(
        saga_id=member.saga_id, kind=kind, type=type_key, name=str(values.get("name") or "")[:200],
        attributes=values, visibility=check_visibility(db, member.saga_id, visibility),
        presentation=clean_presentation(shown) if shown is not None else None,
        tags=clean_tags(tags) if tags is not None else None,
        folder_id=folder_for(db, member.saga_id, kind, folder_id),
        created_by_member_id=member.id,
    )
    if category is not None:
        resource.category_id = category.id
        # Player characters are never instanceable; others follow the category unless told
        resource.instanceable = False if category.player else (
            category.instanceable if instanceable is None else bool(instanceable))
    db.add(resource)
    db.flush()
    _check_parent(db, ruleset, resource)
    if category is not None:
        from services.characters import active_party_ids, set_resource_groups

        if group_ids is None and category.player:
            group_ids = active_party_ids(db, member.saga_id)  # new player characters join the active parties
        if group_ids:
            set_resource_groups(db, member.saga_id, resource, group_ids)
    db.commit()
    return resource


def update_resource(db: Session, member: SagaMember, resource_id: int, attributes: dict | None,
                    visibility: dict | None, shown: dict | None = None, category_id: int | None = None,
                    instanceable: bool | None = None, group_ids: list[int] | None = None,
                    tags: list[str] | None = None, folder_id: int | None = None) -> Resource:
    """folder_id: None leaves the folder as it is; 0 takes the resource out of its folder."""
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
    _check_parent(db, ruleset, resource)
    if resource.kind == "event":
        from services.relationships import sync_event_date

        sync_event_date(db, resource)  # relationships started at it start then
    if tags is not None:
        require_admin(member)
        resource.tags = clean_tags(tags)
    if folder_id is not None:
        require_admin(member)
        resource.folder_id = folder_for(db, member.saga_id, resource.kind, folder_id)
    if visibility is not None:
        require_admin(member)
        resource.visibility = check_visibility(db, member.saga_id, visibility)
    if shown is not None:
        require_admin(member)
        resource.presentation = clean_presentation(shown)
    if resource.kind == "character" and (category_id is not None or instanceable is not None or group_ids is not None):
        require_admin(member)
        from services.characters import category_of, set_resource_groups

        if category_id is not None and category_id != resource.category_id:
            category = category_of(db, member.saga_id, category_id)
            if category.type != resource.type:
                raise BadRequest("A character can only move to a category based on the same type")
            resource.category_id = category.id
        if instanceable is not None:
            resource.instanceable = bool(instanceable)
        if group_ids is not None:
            set_resource_groups(db, member.saga_id, resource, group_ids)
        category = category_of(db, member.saga_id, resource.category_id) if resource.category_id else None
        if category is not None and category.player:
            resource.instanceable = False
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
    from services.relationships import before_resource_delete

    resource = _get(db, member.saga_id, resource_id)
    before_resource_delete(db, resource)
    db.delete(resource)
    db.commit()


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------


def get_file(db: Session, file_id: int) -> StoredFile:
    file = db.get(StoredFile, file_id)
    if file is None:
        raise NotFound("File not found")
    return file
