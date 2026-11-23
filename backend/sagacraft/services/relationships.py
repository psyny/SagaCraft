"""Relationships: typed links between two resources, each belonging to one member group (what that group knows).

- Members read the relationships of their member groups (the DM: every group; the DM's truth is `admins`).
- Players and the DM add, edit and remove relationships and relationship types in groups they're in (the DM:
  any group). Viewers only read.
- An endpoint the viewer can't see comes back masked (no id, no name): a revealed "??? killed the duke" stays a
  mystery.
- A start date ties the relationship to an event (its relationship sub-event): the one picked, or a new event made
  for it (`owns_event`), visible to the relationship's group. The event's date is the start date: one record.
- The DM reveals a relationship to a group by copying it there.
- Graphs are built here on demand from a query, already filtered for the viewer.

See docs/concepts/relationships.md and docs/concepts/events.md.
"""
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from domain import relationships as rel_rules
from domain.relationships import PREDEFINED, RelationshipError
from domain.visibility import Viewer, rule_allows
from models import Group, Relationship, RelationshipType, Resource, SagaMember, SubEvent
from services.access import get_saga, require_admin, viewer_for
from services.errors import BadRequest, Forbidden, NotFound

MAX_PER_SAGA = 20000


# -- groups and types -----------------------------------------------------------


def readable_group_ids(db: Session, saga_id: int, viewer: Viewer) -> set[int]:
    if viewer.is_admin:
        return set(db.scalars(select(Group.id).where(Group.saga_id == saga_id)).all())
    return set(viewer.group_ids)


def _writable_group(db: Session, member: SagaMember, viewer: Viewer, group_id: Any) -> Group:
    if member.role not in ("admin", "player"):
        raise Forbidden("Viewers only read relationships")
    group = db.get(Group, group_id) if isinstance(group_id, int) else None
    if group is None or group.saga_id != member.saga_id:
        raise NotFound("Group not found")
    if not viewer.is_admin and group.id not in viewer.group_ids:
        raise Forbidden("You can only add relationships to your own groups")
    return group


def _admins_group(db: Session, saga_id: int) -> Group:
    return db.scalars(select(Group).where(Group.saga_id == saga_id, Group.key == "admins")).one()


def type_ref(rel: Relationship) -> str:
    return rel.type_key if rel.type_key else f"c{rel.type_id}"


def _custom_out(t: RelationshipType) -> dict:
    return {"ref": f"c{t.id}", "id": t.id, "group_id": t.group_id, "label": t.label, "inverse": t.inverse,
            "directed": t.directed, "from_kinds": [], "to_kinds": [], "predefined": False}


def _predefined_out(key: str) -> dict:
    return {"ref": key, "id": None, "group_id": None, **PREDEFINED[key]}


def list_types(db: Session, member: SagaMember) -> list[dict]:
    """The predefined types, then each readable group's own."""
    viewer = viewer_for(db, member)
    groups = readable_group_ids(db, member.saga_id, viewer)
    custom = db.scalars(select(RelationshipType).where(RelationshipType.saga_id == member.saga_id,
                                                       RelationshipType.group_id.in_(groups))
                        .order_by(RelationshipType.label)).all()
    return [_predefined_out(k) for k in PREDEFINED] + [_custom_out(t) for t in custom]


def _clean_type(raw: dict) -> dict:
    try:
        label = rel_rules.clean_label(raw.get("label"))
        directed = bool(raw.get("directed", True))
        inverse = rel_rules.clean_label(raw.get("inverse"), "") if directed and raw.get("inverse") else ""
    except RelationshipError as exc:
        raise BadRequest(str(exc)) from None
    return {"label": label, "inverse": inverse, "directed": directed}


def _type_in_group(db: Session, saga_id: int, group_id: int, raw: dict) -> RelationshipType | str:
    """A type for a relationship in this group: a predefined one with that label, the group's own with that label,
    or a new one of the group's."""
    clean = _clean_type(raw)
    label = clean["label"].lower()
    for key, t in PREDEFINED.items():
        if t["label"].lower() == label:
            return key
    existing = db.scalars(select(RelationshipType).where(RelationshipType.saga_id == saga_id,
                                                         RelationshipType.group_id == group_id)).all()
    same = next((t for t in existing if t.label.lower() == label), None)
    if same is not None:
        return same
    if len(existing) >= rel_rules.MAX_GROUP_TYPES:
        raise BadRequest(f"At most {rel_rules.MAX_GROUP_TYPES} types per group")
    made = RelationshipType(saga_id=saga_id, group_id=group_id, **clean)
    db.add(made)
    db.flush()
    return made


def create_type(db: Session, member: SagaMember, group_id: Any, raw: dict) -> dict:
    viewer = viewer_for(db, member)
    group = _writable_group(db, member, viewer, group_id)
    made = _type_in_group(db, member.saga_id, group.id, raw)
    if isinstance(made, str):
        raise BadRequest(f"“{PREDEFINED[made]['label']}” is already a type")
    db.commit()
    return _custom_out(made)


def _own_type(db: Session, member: SagaMember, type_id: int) -> RelationshipType:
    found = db.get(RelationshipType, type_id)
    if found is None or found.saga_id != member.saga_id:
        raise NotFound("Type not found")
    _writable_group(db, member, viewer_for(db, member), found.group_id)
    return found


def update_type(db: Session, member: SagaMember, type_id: int, raw: dict) -> dict:
    found = _own_type(db, member, type_id)
    clean = _clean_type({**_custom_out(found), **raw})
    for key, value in clean.items():
        setattr(found, key, value)
    db.commit()
    return _custom_out(found)


def delete_type(db: Session, member: SagaMember, type_id: int) -> None:
    found = _own_type(db, member, type_id)
    used = len(db.scalars(select(Relationship.id).where(Relationship.type_id == found.id)).all())
    if used:
        raise BadRequest(f"{used} relationship{'s use' if used > 1 else ' uses'} this type: change or delete them first")
    db.delete(found)
    db.commit()


# -- reading --------------------------------------------------------------------


class Lens:
    """Everything needed to show relationships to one viewer: the Saga's resources (and which they see), types,
    groups, members, calendar."""

    def __init__(self, db: Session, saga_id: int, viewer: Viewer):
        from services.resources import can_see_resource, ruleset_for

        self.db, self.saga_id, self.viewer = db, saga_id, viewer
        self.ruleset = ruleset_for(db, saga_id)
        self.resources = {r.id: r for r in db.scalars(select(Resource).where(Resource.saga_id == saga_id)).all()}
        self.visible = {rid for rid, r in self.resources.items() if can_see_resource(viewer, self.ruleset, r)}
        self.custom = {t.id: t for t in db.scalars(select(RelationshipType).where(RelationshipType.saga_id == saga_id)).all()}
        self.groups = {g.id: g for g in db.scalars(select(Group).where(Group.saga_id == saga_id)).all()}
        self.readable = readable_group_ids(db, saga_id, viewer)

    def type_of(self, rel: Relationship) -> dict:
        if rel.type_key:
            return _predefined_out(rel.type_key) if rel.type_key in PREDEFINED else {
                "ref": rel.type_key, "label": rel.type_key, "inverse": "", "directed": True, "predefined": True}
        return _custom_out(self.custom[rel.type_id])

    def name(self, resource_id: int) -> str | None:
        from services.resources import controller_ids, shown_name

        resource = self.resources.get(resource_id)
        if resource is None:
            return None
        return shown_name(self.viewer, resource, controller_ids(self.ruleset, resource, self.viewer))

    def icon(self, resource: Resource) -> dict | None:
        """{url, face}: its icon, else its picture's face crop (what this viewer may see)."""
        from services.locations import resource_icon

        return resource_icon(self.ruleset, self.viewer, resource)

    def endpoint(self, resource_id: int) -> dict:
        resource = self.resources.get(resource_id)
        if resource is None or resource_id not in self.visible:
            return {"id": None, "hidden": True, "kind": resource.kind if resource else None, "type": None, "name": None,
                    "icon": None, "face": None}
        picture = self.icon(resource)
        return {"id": resource.id, "hidden": False, "kind": resource.kind, "type": resource.type,
                "name": self.name(resource.id), "icon": picture["url"] if picture else None,
                "face": picture["face"] if picture else None}

    def can_edit(self, rel: Relationship) -> bool:
        if self.viewer.is_admin:
            return True
        return self.viewer.role == "player" and rel.group_id in self.viewer.group_ids

    def out(self, rel: Relationship) -> dict:
        group = self.groups.get(rel.group_id)
        data = {
            "id": rel.id, "group_id": rel.group_id, "group_name": group.name if group else None,
            "from": self.endpoint(rel.from_id), "to": self.endpoint(rel.to_id), "type": self.type_of(rel),
            "note": rel.note or "", "start": rel.start_date, "end": rel.end_date,
            "event_id": rel.event_id if rel.event_id in self.visible else None,
            "created_by": {"member_id": rel.created_by_member_id, "role": rel.created_role},
            "created_at": rel.created_at.isoformat() if rel.created_at else None,
            "editable": self.can_edit(rel),
        }
        if self.viewer.is_admin:
            data["source_id"] = rel.source_id
            data["owns_event"] = bool(rel.owns_event and rel.event_id)
        return data


def _readable(db: Session, saga_id: int, group_ids: set[int]) -> list[Relationship]:
    if not group_ids:
        return []
    return list(db.scalars(select(Relationship).where(Relationship.saga_id == saga_id, Relationship.group_id.in_(group_ids))
                           .order_by(Relationship.start_date.is_(None).desc(), Relationship.start_date, Relationship.id)).all())


def list_relationships(db: Session, member: SagaMember, resource_id: int | None = None, group_id: int | None = None,
                       event_id: int | None = None) -> list[dict]:
    """The relationships this member may read; only those touching a resource the member sees, when asked."""
    viewer = viewer_for(db, member)
    lens = Lens(db, member.saga_id, viewer)
    groups = lens.readable & ({group_id} if group_id else lens.readable)
    rels = _readable(db, member.saga_id, groups)
    if resource_id is not None:
        if resource_id not in lens.visible:
            raise NotFound("Resource not found")
        rels = [r for r in rels if resource_id in (r.from_id, r.to_id)]
    if event_id is not None:
        rels = [r for r in rels if r.event_id == event_id]
    return [lens.out(r) for r in rels]


def _get(db: Session, member: SagaMember, rel_id: int, viewer: Viewer, write: bool) -> Relationship:
    rel = db.get(Relationship, rel_id)
    if rel is None or rel.saga_id != member.saga_id or rel.group_id not in readable_group_ids(db, member.saga_id, viewer):
        raise NotFound("Relationship not found")
    if write:
        _writable_group(db, member, viewer, rel.group_id)
    return rel


def get_relationship(db: Session, member: SagaMember, rel_id: int) -> dict:
    viewer = viewer_for(db, member)
    rel = _get(db, member, rel_id, viewer, write=False)
    return Lens(db, member.saga_id, viewer).out(rel)


# -- events ----------------------------------------------------------------------


def event_date(db: Session, event: Resource) -> int | None:
    from services.resources import ruleset_for

    attr = ruleset_for(db, event.saga_id).type_def(event.kind, event.type).date_attr()
    return (event.attributes or {}).get(attr.key) if attr else None


def _event_is_empty(db: Session, event_id: int, keep: int | None = None) -> bool:
    """Nothing else is in the event: no other relationship, no resource sub-event."""
    others = db.scalars(select(Relationship.id).where(Relationship.event_id == event_id)).all()
    if [i for i in others if i != keep]:
        return False
    return not db.scalars(select(SubEvent.id).where(SubEvent.event_id == event_id)).first()


def _drop_owned_event(db: Session, rel: Relationship) -> None:
    """The relationship leaves the event made for it: the event goes when nothing else is in it."""
    if rel.event_id and rel.owns_event and _event_is_empty(db, rel.event_id, keep=rel.id):
        event = db.get(Resource, rel.event_id)
        rel.event_id = None
        db.flush()
        if event is not None:
            db.delete(event)
    rel.event_id = None
    rel.owns_event = False


def _make_event(db: Session, member: SagaMember, viewer: Viewer, rel: Relationship) -> Resource | None:
    """An event for a dated relationship ("Aldric killed Bram", at its start date), seen by the relationship's group
    (the DM's own: admins only). Names as the creator sees them, so nothing hidden leaks into the title."""
    from domain.ruleset import default_value
    from services.resources import ruleset_for

    ruleset = ruleset_for(db, member.saga_id)
    event_types = [d for (k, _), d in ruleset.types.items() if k == "event"]
    if not event_types:
        return None
    type_def = event_types[0]
    date_attr = type_def.date_attr()
    lens = Lens(db, member.saga_id, viewer)
    label = lens.type_of(rel)["label"]
    title = f"{lens.name(rel.from_id) or '???'} {label} {lens.name(rel.to_id) or '???'}"[:200]
    values = {a.key: default_value(a) for a in type_def.attributes}
    values.update({"name": title, date_attr.key: rel.start_date})
    group = lens.groups.get(rel.group_id)
    visibility = {"groups": [], "members": []} if group is None or group.key == "admins" else {"groups": [rel.group_id], "members": []}
    event = Resource(saga_id=member.saga_id, kind="event", type=type_def.key, name=title, attributes=values,
                     visibility=visibility, created_by_member_id=member.id)
    db.add(event)
    db.flush()
    return event


def _join_event(db: Session, viewer: Viewer, saga_id: int, event_id: Any) -> Resource:
    from services.resources import can_see_resource, ruleset_for

    event = db.get(Resource, event_id) if isinstance(event_id, int) else None
    if event is None or event.saga_id != saga_id or event.kind != "event" \
            or not can_see_resource(viewer, ruleset_for(db, saga_id), event):
        raise NotFound("Event not found")
    if event_date(db, event) is None:
        raise BadRequest("That event has no date")
    return event


def sync_event_date(db: Session, event: Resource) -> None:
    """An event's date changed: the relationships that started at it start then (one record)."""
    date = event_date(db, event)
    for rel in db.scalars(select(Relationship).where(Relationship.event_id == event.id)).all():
        rel.start_date = date
        if rel.end_date is not None and date is not None and rel.end_date < date:
            rel.end_date = date


def before_resource_delete(db: Session, resource: Resource) -> None:
    """A resource is being deleted: its relationships go with it (and the events made only for them); an event's
    relationships keep their start date."""
    if resource.kind == "event":
        for rel in db.scalars(select(Relationship).where(Relationship.event_id == resource.id)).all():
            rel.event_id, rel.owns_event = None, False
    for rel in db.scalars(select(Relationship).where(or_(Relationship.from_id == resource.id,
                                                         Relationship.to_id == resource.id))).all():
        if rel.event_id != resource.id:
            _drop_owned_event(db, rel)
        db.delete(rel)
    db.flush()


# -- writing ----------------------------------------------------------------------


def _endpoint_ids(db: Session, member: SagaMember, viewer: Viewer, from_id: Any, to_id: Any) -> tuple[int, int]:
    from services.resources import can_see_resource, ruleset_for

    ruleset = ruleset_for(db, member.saga_id)
    ids = []
    for raw in (from_id, to_id):
        resource = db.get(Resource, raw) if isinstance(raw, int) and not isinstance(raw, bool) else None
        if resource is None or resource.saga_id != member.saga_id or not can_see_resource(viewer, ruleset, resource):
            raise NotFound("Resource not found")
        ids.append(resource.id)
    if ids[0] == ids[1]:
        raise BadRequest("A relationship links two different resources")
    return ids[0], ids[1]


def _set_type(db: Session, member: SagaMember, rel: Relationship, data: dict) -> None:
    raw = data.get("type")
    if isinstance(raw, dict):  # a new type: {label, inverse, directed}
        made = _type_in_group(db, member.saga_id, rel.group_id, raw)
    elif isinstance(raw, str) and raw in PREDEFINED:
        made = raw
    elif isinstance(raw, str) and raw.startswith("c") and raw[1:].isdigit():
        found = db.get(RelationshipType, int(raw[1:]))
        if found is None or found.saga_id != member.saga_id:
            raise NotFound("Type not found")
        made = found if found.group_id == rel.group_id else _type_in_group(db, member.saga_id, rel.group_id, _custom_out(found))
    else:
        raise BadRequest("Pick a type")
    if isinstance(made, str):
        rel.type_key, rel.type_id = made, None
    else:
        rel.type_key, rel.type_id = None, made.id


def _set_dates(db: Session, member: SagaMember, viewer: Viewer, rel: Relationship, data: dict) -> None:
    from services.calendars import check_date

    if "event_id" in data and data["event_id"] is not None:  # start at an existing event
        event = _join_event(db, viewer, member.saga_id, data["event_id"])
        if rel.event_id != event.id:
            _drop_owned_event(db, rel)
            rel.event_id, rel.owns_event = event.id, False
        rel.start_date = event_date(db, event)
    elif "start" in data:
        start = check_date(db, member.saga_id, data["start"], "Start")
        if start != rel.start_date:
            if rel.event_id and rel.owns_event and start is not None and _event_is_empty(db, rel.event_id, keep=rel.id):
                event = db.get(Resource, rel.event_id)
                from services.resources import ruleset_for

                attr = ruleset_for(db, member.saga_id).type_def(event.kind, event.type).date_attr()
                event.attributes = {**(event.attributes or {}), attr.key: start}
                rel.start_date = start
            else:
                if rel.event_id and not rel.owns_event and start is None:
                    rel.event_id = None
                else:
                    _drop_owned_event(db, rel)
                rel.start_date = start
                if start is not None and rel.event_id is None:
                    db.flush()
                    event = _make_event(db, member, viewer, rel)
                    if event is not None:
                        rel.event_id, rel.owns_event = event.id, True
    if "end" in data:
        rel.end_date = check_date(db, member.saga_id, data["end"], "End")
    try:
        rel_rules.check_dates(rel.start_date, rel.end_date)
    except RelationshipError as exc:
        raise BadRequest(str(exc)) from None


def create_relationship(db: Session, member: SagaMember, data: dict) -> dict:
    """data: group_id, from_id, to_id, type ("killed", "c12" or a new {label, inverse, directed}), note, start,
    end (dates or None: always), event_id (start at that event)."""
    viewer = viewer_for(db, member)
    group_id = data.get("group_id")
    if group_id is None and viewer.is_admin:
        group_id = _admins_group(db, member.saga_id).id  # the DM's truth
    group = _writable_group(db, member, viewer, group_id)
    from_id, to_id = _endpoint_ids(db, member, viewer, data.get("from_id"), data.get("to_id"))
    count = len(db.scalars(select(Relationship.id).where(Relationship.saga_id == member.saga_id)).all())
    if count >= MAX_PER_SAGA:
        raise BadRequest("This Saga has too many relationships")
    rel = Relationship(saga_id=member.saga_id, group_id=group.id, from_id=from_id, to_id=to_id,
                       note=rel_rules.clean_note(data.get("note")), created_by_member_id=member.id,
                       created_role="admin" if viewer.is_admin else "player", owns_event=False)
    _set_type(db, member, rel, data)
    db.add(rel)
    db.flush()
    _set_dates(db, member, viewer, rel, {"start": None, **{k: v for k, v in data.items() if k in ("start", "end", "event_id")}})
    db.commit()
    return Lens(db, member.saga_id, viewer).out(rel)


def update_relationship(db: Session, member: SagaMember, rel_id: int, data: dict) -> dict:
    """Only the keys given change. Moving to another group keeps the type (copied there if it's the group's own)."""
    viewer = viewer_for(db, member)
    rel = _get(db, member, rel_id, viewer, write=True)
    if "group_id" in data and data["group_id"] != rel.group_id:
        group = _writable_group(db, member, viewer, data["group_id"])
        rel.group_id = group.id
        if rel.type_id is not None and "type" not in data:
            data = {**data, "type": f"c{rel.type_id}"}
    if "from_id" in data or "to_id" in data:
        rel.from_id, rel.to_id = _endpoint_ids(db, member, viewer, data.get("from_id", rel.from_id), data.get("to_id", rel.to_id))
    if "type" in data:
        _set_type(db, member, rel, data)
    if "note" in data:
        rel.note = rel_rules.clean_note(data["note"])
    _set_dates(db, member, viewer, rel, {k: v for k, v in data.items() if k in ("start", "end", "event_id")})
    db.commit()
    return Lens(db, member.saga_id, viewer).out(rel)


def delete_relationship(db: Session, member: SagaMember, rel_id: int) -> None:
    viewer = viewer_for(db, member)
    rel = _get(db, member, rel_id, viewer, write=True)
    _drop_owned_event(db, rel)
    db.delete(rel)
    db.commit()


def reveal(db: Session, member: SagaMember, rel_id: int, group_id: Any) -> dict:
    """The DM copies a relationship into a group (what they now know). The copy is the group's: they can change it.
    An event made for the relationship becomes visible to the group too; another event only if they see it."""
    require_admin(member)
    viewer = viewer_for(db, member)
    source = _get(db, member, rel_id, viewer, write=False)
    group = _writable_group(db, member, viewer, group_id)
    if group.id == source.group_id:
        raise BadRequest("It's already in that group")
    existing = db.scalars(select(Relationship).where(Relationship.source_id == source.id, Relationship.group_id == group.id)).first()
    if existing is not None:
        return Lens(db, member.saga_id, viewer).out(existing)
    copy = Relationship(saga_id=member.saga_id, group_id=group.id, from_id=source.from_id, to_id=source.to_id,
                        note=source.note, start_date=source.start_date, end_date=source.end_date, source_id=source.id,
                        created_by_member_id=member.id, created_role="admin", owns_event=False)
    _set_type(db, member, copy, {"type": type_ref(source)})
    if source.event_id:
        event = db.get(Resource, source.event_id)
        visibility = dict(event.visibility or {"groups": [], "members": []})
        if source.owns_event and group.key != "admins" and group.id not in visibility.get("groups", []):
            event.visibility = {**visibility, "groups": [*visibility.get("groups", []), group.id]}
        if group.key == "admins" or group.id in (event.visibility or {}).get("groups", []):
            copy.event_id = event.id
    db.add(copy)
    db.commit()
    return Lens(db, member.saga_id, viewer).out(copy)


# -- graphs ------------------------------------------------------------------------


def _ref_edges(lens: Lens, resource_ids: set[int]) -> list[dict]:
    """Ruleset references (a location's parent, an inventory, an event's involved) as edges, where the viewer
    sees the attribute and both resources."""
    from services.resources import controller_ids

    edges = []
    for rid in resource_ids:
        resource = lens.resources[rid]
        type_def = lens.ruleset.def_for(resource)
        controllers = controller_ids(lens.ruleset, resource, lens.viewer)
        for attr in type_def.attributes:
            many = attr.type == "list" and (attr.of or {}).get("type") == "resource_ref"
            if attr.type != "resource_ref" and not many:
                continue
            if not rule_allows(lens.viewer, attr.view, controllers):
                continue
            value = (resource.attributes or {}).get(attr.key)
            targets = value if isinstance(value, list) else [value] if value is not None else []
            for target in targets:
                if isinstance(target, int) and target in lens.visible and target != rid:
                    edges.append({"id": f"ref{rid}-{attr.key}-{target}", "relationship_id": None, "from": f"r{rid}",
                                  "to": f"r{target}", "label": attr.name, "inverse": "", "directed": True,
                                  "reference": True, "group_id": None, "created_role": None, "note": "",
                                  "start": None, "end": None, "type_ref": None})
    return edges


def build_graph(lens: Lens, rels: list[Relationship], query: dict) -> dict:
    """Nodes and edges for a query, for lens.viewer. query: mode (all | characters | around | set), ids, hops,
    kinds, types (type refs), creator ("admins" | "players" | a member id), at (date), references."""
    mode = query.get("mode") or "all"
    at = query.get("at")
    kinds = set(query.get("kinds") or [])
    types = set(query.get("types") or [])
    creator = query.get("creator")
    hops = max(0, min(int(query.get("hops") or 0), rel_rules.MAX_HOPS))
    ids = {i for i in (query.get("ids") or []) if isinstance(i, int) and i in lens.visible}

    def keep(rel: Relationship) -> bool:
        if types and type_ref(rel) not in types:
            return False
        if creator == "admins" and rel.created_role != "admin" or creator == "players" and rel.created_role != "player":
            return False
        if isinstance(creator, int) and rel.created_by_member_id != creator:
            return False
        return rel_rules.active_at(rel.start_date, rel.end_date, at)

    def node_key(rel: Relationship, side: str) -> str:
        rid = rel.from_id if side == "from" else rel.to_id
        return f"r{rid}" if rid in lens.visible else f"h{rel.id}{side[0]}"

    def kind_ok(rid: int) -> bool:
        resource = lens.resources.get(rid)
        return not kinds or (resource is not None and resource.kind in kinds)

    edges: list[dict] = []
    for rel in rels:
        if not keep(rel) or not (kind_ok(rel.from_id) and kind_ok(rel.to_id)):
            continue
        t = lens.type_of(rel)
        edges.append({"id": f"rel{rel.id}", "relationship_id": rel.id, "from": node_key(rel, "from"),
                      "to": node_key(rel, "to"), "label": t["label"], "inverse": t.get("inverse") or "",
                      "directed": bool(t.get("directed")), "reference": False, "group_id": rel.group_id,
                      "created_role": rel.created_role, "note": rel.note or "", "start": rel.start_date,
                      "end": rel.end_date, "type_ref": type_ref(rel), "_rel": rel})
    if query.get("references"):
        pool = {rid for rid in lens.visible if kind_ok(rid)}
        if mode == "characters":
            pool = {rid for rid in pool if lens.resources[rid].kind == "character"}
        edges += [e for e in _ref_edges(lens, pool) if int(e["to"][1:]) in pool]

    if mode == "characters":
        chars = {f"r{rid}" for rid in lens.visible if lens.resources[rid].kind == "character"}
        edges = [e for e in edges if e["from"] in chars and e["to"] in chars]
        nodes = set(chars)
    elif mode in ("around", "set"):
        start = {f"r{i}" for i in ids}
        reached = rel_rules.neighbours([(e["from"], e["to"]) for e in edges], start, hops)
        edges = [e for e in edges if e["from"] in reached and e["to"] in reached]
        nodes = reached
    else:
        nodes = {e["from"] for e in edges} | {e["to"] for e in edges}

    rel_by_hidden = {}
    for e in edges:
        rel = e.pop("_rel", None)
        if rel is not None:
            rel_by_hidden[f"h{rel.id}f"] = lens.resources.get(rel.from_id)
            rel_by_hidden[f"h{rel.id}t"] = lens.resources.get(rel.to_id)
    out_nodes = []
    for key in sorted(nodes):
        if key.startswith("r"):
            ep = lens.endpoint(int(key[1:]))
            out_nodes.append({"id": key, "resource_id": ep["id"], "kind": ep["kind"], "type": ep["type"], "name": ep["name"],
                              "icon": ep["icon"], "face": ep["face"], "hidden": False, "start": int(key[1:]) in ids})
        else:
            hidden = rel_by_hidden.get(key)
            out_nodes.append({"id": key, "resource_id": None, "kind": hidden.kind if hidden else None, "type": None,
                              "name": None, "icon": None, "face": None, "hidden": True, "start": False})
    return {"nodes": out_nodes, "edges": edges}


def graph(db: Session, member: SagaMember, query: dict) -> dict:
    """The graph screen: the relationships of the groups asked (default: the DM's truth for the DM, every own group
    for players), shaped by the query."""
    viewer = viewer_for(db, member)
    lens = Lens(db, member.saga_id, viewer)
    asked = {g for g in (query.get("groups") or []) if isinstance(g, int)}
    if asked:
        groups = asked & lens.readable
    elif viewer.is_admin:
        groups = {_admins_group(db, member.saga_id).id}
    else:
        groups = lens.readable
    return {**build_graph(lens, _readable(db, member.saga_id, groups), query), "groups": sorted(groups)}


class RelationshipBook:
    """For Set types (RenderContext.relationships): graphs of the groups a Set shows, for each viewer."""

    def __init__(self, db: Session, saga_id: int):
        self.db, self.saga_id = db, saga_id

    def graph(self, viewer: Viewer, group_ids: list[int], query: dict) -> dict:
        lens = Lens(self.db, self.saga_id, viewer)
        groups = {g for g in group_ids if g in lens.groups} or {_admins_group(self.db, self.saga_id).id}
        return build_graph(lens, _readable(self.db, self.saga_id, groups), query)

    def groups(self) -> list[dict]:
        saga = get_saga(self.db, self.saga_id)
        return [{"id": g.id, "name": g.name, "key": g.key}
                for g in self.db.scalars(select(Group).where(Group.saga_id == saga.id).order_by(Group.id)).all()]


def stages_with_graphs(db: Session, saga_id: int) -> set[int]:
    """Stages a relationship or event change shows on (they have relationship graph or Timeline Sets)."""
    from models import Stage, StageSet

    return set(db.scalars(select(StageSet.stage_id).join(Stage, Stage.id == StageSet.stage_id)
                          .where(Stage.saga_id == saga_id, StageSet.type.in_(("relationship_graph", "timeline")))).all())
