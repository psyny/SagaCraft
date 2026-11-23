"""Display templates (how characters are displayed), defaults per type, and character sheets."""
from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from api.deps import current_member
from db.session import get_db
from models import SagaMember
from schemas.requests import DisplayDefaultIn, TemplateIn, TemplateUpdate
from services import displays as svc
from services.realtime import hub

router = APIRouter(prefix="/api/sagas/{saga_id}")


def _notify(tasks: BackgroundTasks, db: Session, saga_id: int) -> None:
    """Cards on Stages follow templates: refresh the Stages that show them."""
    tasks.add_task(hub.notify, saga_id, svc.stages_with_cards(db, saga_id), False)


@router.get("/display-templates")
def list_templates(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.list_templates(db, member)


@router.post("/display-templates")
def create_template(body: TemplateIn, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.create_template(db, member, body.name, body.copy_from, body.kind)


@router.patch("/display-templates/{template_id}")
def update_template(saga_id: int, template_id: int, body: TemplateUpdate, tasks: BackgroundTasks,
                    member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    result = svc.update_template(db, member, template_id, body.name, body.modes, body.color, body.token_style)
    _notify(tasks, db, saga_id)
    return result


@router.delete("/display-templates/{template_id}")
def delete_template(saga_id: int, template_id: int, tasks: BackgroundTasks,
                    member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    svc.delete_template(db, member, template_id)
    _notify(tasks, db, saga_id)
    return {"ok": True}


@router.put("/display-defaults")
def set_default(saga_id: int, body: DisplayDefaultIn, tasks: BackgroundTasks,
                member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    result = svc.set_default(db, member, body.kind, body.type, body.template_id, body.category_id)
    _notify(tasks, db, saga_id)
    return result


@router.get("/display-templates/{template_id}/preview")
def preview(template_id: int, resource_id: int, member: SagaMember = Depends(current_member),
            db: Session = Depends(get_db)):
    return svc.preview(db, member, template_id, resource_id)


@router.get("/resources/{resource_id}/sheet")
def sheet(resource_id: int, set_id: int | None = None, actor_id: int | None = None,
          member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.sheet(db, member, resource_id, set_id, actor_id)
