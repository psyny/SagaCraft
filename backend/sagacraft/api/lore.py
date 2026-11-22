"""Lore: the in-world calendar, relationships (and their types, graphs), events' sub-events, eras, the timeline.
Each route is one named command (UX-6). See docs/concepts/relationships.md and docs/concepts/events.md."""
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Response
from sqlalchemy.orm import Session

from api.deps import current_member
from db.session import get_db
from models import SagaMember
from services import calendars, events
from services import relationships as rels
from services.access import get_saga
from services.realtime import hub

router = APIRouter(prefix="/api/sagas/{saga_id}")


def _graphs_changed(tasks: BackgroundTasks, db: Session, saga_id: int) -> None:
    """Relationship graph Sets update live."""
    stage_ids = rels.stages_with_graphs(db, saga_id)
    if stage_ids:
        tasks.add_task(hub.notify, saga_id, stage_ids, False)


# -- calendar -------------------------------------------------------------------------------


@router.get("/calendar")
def get_calendar(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return calendars.view(db, get_saga(db, member.saga_id))


@router.put("/calendar")
def set_calendar(saga_id: int, tasks: BackgroundTasks, body: dict[str, Any] = Body(...),
                 member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """A preset ({"preset": "gregorian"}) or the DM's own ({name, months: [{name, days}], year_label})."""
    out = calendars.set_calendar(db, member, body)
    tasks.add_task(hub.notify, saga_id, None, True)
    return out


@router.put("/calendar/today")
def set_story_date(saga_id: int, tasks: BackgroundTasks, body: dict[str, Any] = Body(...),
                   member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    out = calendars.set_story_date(db, member, body.get("date"))
    tasks.add_task(hub.notify, saga_id, None, True)
    return out


# -- relationship types -------------------------------------------------------------------------


@router.get("/relationship-types")
def list_types(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return rels.list_types(db, member)


@router.post("/relationship-types")
def create_type(body: dict[str, Any] = Body(...), member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return rels.create_type(db, member, body.get("group_id"), body)


@router.patch("/relationship-types/{type_id}")
def update_type(type_id: int, body: dict[str, Any] = Body(...), member: SagaMember = Depends(current_member),
                db: Session = Depends(get_db)):
    return rels.update_type(db, member, type_id, body)


@router.delete("/relationship-types/{type_id}", status_code=204)
def delete_type(type_id: int, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    rels.delete_type(db, member, type_id)
    return Response(status_code=204)


# -- relationships -----------------------------------------------------------------------------


@router.get("/relationships")
def list_relationships(resource_id: int | None = None, group_id: int | None = None, event_id: int | None = None,
                       member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return rels.list_relationships(db, member, resource_id, group_id, event_id)


@router.post("/relationships/graph")
def graph(body: dict[str, Any] = Body(...), member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """query: mode (all | characters | around | set), ids, hops, groups, kinds, types, creator, at, references."""
    return rels.graph(db, member, body)


@router.post("/relationships")
def create_relationship(saga_id: int, tasks: BackgroundTasks, body: dict[str, Any] = Body(...),
                        member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    out = rels.create_relationship(db, member, body)
    _graphs_changed(tasks, db, saga_id)
    return out


@router.get("/relationships/{rel_id}")
def get_relationship(rel_id: int, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return rels.get_relationship(db, member, rel_id)


@router.patch("/relationships/{rel_id}")
def update_relationship(saga_id: int, rel_id: int, tasks: BackgroundTasks, body: dict[str, Any] = Body(...),
                        member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    out = rels.update_relationship(db, member, rel_id, body)
    _graphs_changed(tasks, db, saga_id)
    return out


@router.delete("/relationships/{rel_id}", status_code=204)
def delete_relationship(saga_id: int, rel_id: int, tasks: BackgroundTasks, member: SagaMember = Depends(current_member),
                        db: Session = Depends(get_db)):
    rels.delete_relationship(db, member, rel_id)
    _graphs_changed(tasks, db, saga_id)
    return Response(status_code=204)


@router.post("/relationships/{rel_id}/reveal")
def reveal(saga_id: int, rel_id: int, tasks: BackgroundTasks, body: dict[str, Any] = Body(...),
           member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Command: reveal a relationship to a group (a copy in that group)."""
    out = rels.reveal(db, member, rel_id, body.get("group_id"))
    _graphs_changed(tasks, db, saga_id)
    return out


# -- events, sub-events, eras, timeline ------------------------------------------------------------


@router.get("/timeline")
def timeline(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return events.timeline(db, member)


@router.get("/events/{event_id}")
def event_view(event_id: int, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return events.event_view(db, member, event_id)


@router.post("/events/{event_id}/sub-events")
def add_sub_event(event_id: int, body: dict[str, Any] = Body(...), member: SagaMember = Depends(current_member),
                  db: Session = Depends(get_db)):
    return events.add_sub_event(db, member, event_id, body)


@router.patch("/sub-events/{sub_id}")
def update_sub_event(sub_id: int, body: dict[str, Any] = Body(...), member: SagaMember = Depends(current_member),
                     db: Session = Depends(get_db)):
    return events.update_sub_event(db, member, sub_id, body)


@router.delete("/sub-events/{sub_id}")
def delete_sub_event(sub_id: int, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return events.delete_sub_event(db, member, sub_id)


@router.get("/eras")
def list_eras(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return events.list_eras(db, member)


@router.post("/eras")
def create_era(body: dict[str, Any] = Body(...), member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return events.create_era(db, member, body)


@router.patch("/eras/{era_id}")
def update_era(era_id: int, body: dict[str, Any] = Body(...), member: SagaMember = Depends(current_member),
               db: Session = Depends(get_db)):
    return events.update_era(db, member, era_id, body)


@router.delete("/eras/{era_id}", status_code=204)
def delete_era(era_id: int, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    events.delete_era(db, member, era_id)
    return Response(status_code=204)
