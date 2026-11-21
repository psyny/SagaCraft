"""A Saga's own Saga template (the Template page): variables, types, starting content, export and import.
Changes reach everyone at once (forms, sheets and Stages read the template)."""
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Body, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.deps import current_member
from db.session import get_db
from models import SagaMember, Stage
from schemas.requests import MapCommand
from services import saga_templates as svc
from services.realtime import hub

router = APIRouter(prefix="/api/sagas/{saga_id}/template")


def _changed(tasks: BackgroundTasks, db: Session, saga_id: int) -> None:
    stage_ids = set(db.scalars(select(Stage.id).where(Stage.saga_id == saga_id)).all())
    tasks.add_task(hub.notify, saga_id, stage_ids, True)


@router.get("")
def get_template(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.get(db, member)


@router.post("/command")
def template_command(saga_id: int, body: MapCommand, tasks: BackgroundTasks,
                     member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Commands: variable.add/update/delete/move, override.set, type.add/update/delete, starting.set, info.set."""
    result = svc.command(db, member, body.name, body.args)
    _changed(tasks, db, saga_id)
    return result


@router.get("/export")
def export_template(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.export(db, member)


@router.post("/import")
def import_template(saga_id: int, tasks: BackgroundTasks, body: dict[str, Any] = Body(...),
                    member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    result = svc.import_into(db, member, body)
    _changed(tasks, db, saga_id)
    return result
