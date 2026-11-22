"""Events (a resource kind with an in-world date, maybe an end date), their resource sub-events, eras and the timeline.

- An event's date is its type's date variable (the Saga template's); new events default to "today in the story".
  An event may also end later (its date variable marked `ends`): a period on the timeline.
- Resource sub-events ("Old Bridge: discovered") are the DM's; what happened is free text, suggested from the
  resource type's sub-event list (Saga template). Relationship sub-events are relationships started at the event
  (services/relationships.py): one record shown in both places.
- Members see an event as any resource; a sub-event only when they also see its resource (or relationship).
- Eras: named periods (start, optional end), the DM's, with their own visibility.

See docs/concepts/events.md.
"""
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from domain.visibility import can_see
from models import Era, Relationship, Resource, SagaMember, SubEvent
from services.access import check_visibility, get_saga, require_admin, viewer_for
from services.errors import BadRequest, NotFound

MAX_SUB_EVENTS, MAX_ERAS = 100, 200
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _text(raw: Any, limit: int) -> str:
    return re.sub(r"\s+", " ", str(raw or "")).strip()[:limit]


def _event(db: Session, member: SagaMember, event_id: int):
    """The event (if the member sees it), with a Lens for its sub-events."""
    from services.relationships import Lens

    lens = Lens(db, member.saga_id, viewer_for(db, member))
    event = lens.resources.get(event_id)
    if event is None or event.kind != "event" or event_id not in lens.visible:
        raise NotFound("Event not found")
    return event, lens


def _sub_event_out(lens, sub: SubEvent) -> dict:
    return {"id": sub.id, "resource": lens.endpoint(sub.resource_id), "what": sub.what, "note": sub.note or "",
            "position": sub.position}


def _parts(db: Session, lens, event_ids: set[int]) -> tuple[dict[int, list[dict]], dict[int, list[dict]]]:
    """Per event: the resource sub-events and relationships this viewer sees."""
    subs: dict[int, list[dict]] = {}
    if event_ids:
        for sub in db.scalars(select(SubEvent).where(SubEvent.event_id.in_(event_ids))
                              .order_by(SubEvent.position, SubEvent.id)).all():
            if sub.resource_id in lens.visible:
                subs.setdefault(sub.event_id, []).append(_sub_event_out(lens, sub))
    rels: dict[int, list[dict]] = {}
    if event_ids and lens.readable:
        for rel in db.scalars(select(Relationship).where(Relationship.event_id.in_(event_ids),
                                                         Relationship.group_id.in_(lens.readable))
                              .order_by(Relationship.id)).all():
            rels.setdefault(rel.event_id, []).append(lens.out(rel))
    return subs, rels


def _event_out(db: Session, lens, event: Resource, subs: dict, rels: dict) -> dict:
    from services.relationships import event_date
    from services.resources import serialize

    data = serialize(lens.ruleset, lens.viewer, event)
    data["date"] = event_date(db, event)
    # Its end, if it has one and the viewer may see it (read from what they're sent)
    end_attr = lens.ruleset.type_def(event.kind, event.type).end_attr()
    end = data.get("attributes", {}).get(end_attr.key) if end_attr else None
    data["end"] = end if isinstance(end, int) and data["date"] is not None and end >= data["date"] else None
    data["created_by"] = event.created_by_member_id
    data["sub_events"] = subs.get(event.id, [])
    data["relationships"] = rels.get(event.id, [])
    return data


def event_view(db: Session, member: SagaMember, event_id: int) -> dict:
    event, lens = _event(db, member, event_id)
    subs, rels = _parts(db, lens, {event.id})
    return _event_out(db, lens, event, subs, rels)


def default_date(db: Session, saga_id: int) -> int:
    from services.calendars import story_date

    return story_date(get_saga(db, saga_id))


# -- resource sub-events -----------------------------------------------------------------


def add_sub_event(db: Session, member: SagaMember, event_id: int, data: dict) -> dict:
    require_admin(member)
    event, lens = _event(db, member, event_id)
    resource_id = data.get("resource_id")
    if not isinstance(resource_id, int) or resource_id not in lens.resources or resource_id == event.id:
        raise NotFound("Resource not found")
    what = _text(data.get("what"), 40)
    if not what:
        raise BadRequest("Say what happened (e.g. discovered, died)")
    existing = db.scalars(select(SubEvent).where(SubEvent.event_id == event.id)).all()
    if len(existing) >= MAX_SUB_EVENTS:
        raise BadRequest(f"At most {MAX_SUB_EVENTS} sub-events")
    db.add(SubEvent(saga_id=member.saga_id, event_id=event.id, resource_id=resource_id, what=what,
                    note=_text(data.get("note"), 300), position=max([s.position for s in existing], default=-1) + 1))
    db.commit()
    return event_view(db, member, event.id)


def _sub(db: Session, member: SagaMember, sub_id: int) -> SubEvent:
    require_admin(member)
    sub = db.get(SubEvent, sub_id)
    if sub is None or sub.saga_id != member.saga_id:
        raise NotFound("Sub-event not found")
    return sub


def update_sub_event(db: Session, member: SagaMember, sub_id: int, data: dict) -> dict:
    sub = _sub(db, member, sub_id)
    if "what" in data:
        what = _text(data["what"], 40)
        if not what:
            raise BadRequest("Say what happened")
        sub.what = what
    if "note" in data:
        sub.note = _text(data["note"], 300)
    if "move" in data:  # -1 earlier, +1 later
        subs = list(db.scalars(select(SubEvent).where(SubEvent.event_id == sub.event_id)
                               .order_by(SubEvent.position, SubEvent.id)).all())
        i = subs.index(sub)
        j = max(0, min(len(subs) - 1, i + (1 if data["move"] > 0 else -1)))
        subs.insert(j, subs.pop(i))
        for position, s in enumerate(subs):
            s.position = position
    db.commit()
    return event_view(db, member, sub.event_id)


def delete_sub_event(db: Session, member: SagaMember, sub_id: int) -> dict:
    sub = _sub(db, member, sub_id)
    event_id = sub.event_id
    db.delete(sub)
    db.commit()
    return event_view(db, member, event_id)


# -- eras ------------------------------------------------------------------------------


def _era_out(era: Era, admin: bool) -> dict:
    data = {"id": era.id, "name": era.name, "start": era.start_date, "end": era.end_date, "color": era.color,
            "note": era.note or ""}
    if admin:
        data["visibility"] = era.visibility or {"groups": [], "members": []}
    return data


def _era_fields(db: Session, member: SagaMember, era: Era, data: dict) -> None:
    from services.calendars import check_date

    if "name" in data:
        era.name = _text(data["name"], 80)
        if not era.name:
            raise BadRequest("Give the era a name")
    if "start" in data:
        if data["start"] is None:
            raise BadRequest("An era starts at a date")
        era.start_date = check_date(db, member.saga_id, data["start"], "Start")
    if "end" in data:
        era.end_date = check_date(db, member.saga_id, data["end"], "End")
    if era.end_date is not None and era.end_date < era.start_date:
        raise BadRequest("An era can't end before it starts")
    if "color" in data:
        if not _HEX.match(str(data["color"] or "")):
            raise BadRequest("Color must be like #a1b2c3")
        era.color = str(data["color"]).lower()
    if "note" in data:
        era.note = _text(data["note"], 300)
    if "visibility" in data:
        era.visibility = check_visibility(db, member.saga_id, data["visibility"])


def list_eras(db: Session, member: SagaMember) -> list[dict]:
    viewer = viewer_for(db, member)
    eras = db.scalars(select(Era).where(Era.saga_id == member.saga_id).order_by(Era.start_date, Era.id)).all()
    return [_era_out(e, viewer.is_admin) for e in eras if can_see(viewer, e.visibility)]


def create_era(db: Session, member: SagaMember, data: dict) -> dict:
    require_admin(member)
    if len(db.scalars(select(Era.id).where(Era.saga_id == member.saga_id)).all()) >= MAX_ERAS:
        raise BadRequest(f"At most {MAX_ERAS} eras")
    era = Era(saga_id=member.saga_id, name="", start_date=default_date(db, member.saga_id), color="#b08a3e", note="",
              visibility={"groups": [], "members": []})
    _era_fields(db, member, era, {"name": "New era", **data})
    db.add(era)
    db.commit()
    return _era_out(era, True)


def _get_era(db: Session, member: SagaMember, era_id: int) -> Era:
    require_admin(member)
    era = db.get(Era, era_id)
    if era is None or era.saga_id != member.saga_id:
        raise NotFound("Era not found")
    return era


def update_era(db: Session, member: SagaMember, era_id: int, data: dict) -> dict:
    era = _get_era(db, member, era_id)
    _era_fields(db, member, era, data)
    db.commit()
    return _era_out(era, True)


def delete_era(db: Session, member: SagaMember, era_id: int) -> None:
    db.delete(_get_era(db, member, era_id))
    db.commit()


# -- timeline -----------------------------------------------------------------------------


def timeline(db: Session, member: SagaMember) -> dict:
    """Every event this member sees, in date order, with what they see of each, and the eras."""
    from services.relationships import Lens

    lens = Lens(db, member.saga_id, viewer_for(db, member))
    events = [r for rid, r in lens.resources.items() if r.kind == "event" and rid in lens.visible]
    subs, rels = _parts(db, lens, {e.id for e in events})
    out = [_event_out(db, lens, e, subs, rels) for e in events]
    out.sort(key=lambda e: (e["date"] is None, e["date"] or 0, e["name"] or "", e["id"]))
    return {"events": out, "eras": list_eras(db, member)}
