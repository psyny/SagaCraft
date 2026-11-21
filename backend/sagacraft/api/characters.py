"""Character categories and groups (of characters). See docs/concepts/characters.md."""
from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from api.deps import current_member
from db.session import get_db
from models import SagaMember
from schemas.requests import CategoryIn, CharacterGroupIn
from services import characters as svc
from services.realtime import hub

router = APIRouter(prefix="/api/sagas/{saga_id}")


def _changed(tasks: BackgroundTasks, saga_id: int) -> None:
    # Categories are the Characters tab's sections: every member refetches
    tasks.add_task(hub.notify, saga_id, set(), True)


@router.get("/categories")
def list_categories(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.list_categories(db, member)


@router.post("/categories")
def create_category(saga_id: int, body: CategoryIn, tasks: BackgroundTasks,
                    member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    result = svc.create_category(db, member, body.model_dump())
    _changed(tasks, saga_id)
    return result


@router.patch("/categories/{category_id}")
def update_category(saga_id: int, category_id: int, body: CategoryIn, tasks: BackgroundTasks,
                    member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    result = svc.update_category(db, member, category_id, body.model_dump(exclude_unset=True))
    _changed(tasks, saga_id)
    return result


@router.delete("/categories/{category_id}")
def delete_category(saga_id: int, category_id: int, tasks: BackgroundTasks,
                    member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    svc.delete_category(db, member, category_id)
    _changed(tasks, saga_id)
    return {"ok": True}


@router.get("/character-groups")
def list_groups(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.list_groups(db, member)


@router.post("/character-groups")
def create_group(body: CharacterGroupIn, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.create_group(db, member, body.model_dump(exclude_unset=True))


@router.patch("/character-groups/{group_id}")
def update_group(group_id: int, body: CharacterGroupIn, member: SagaMember = Depends(current_member),
                 db: Session = Depends(get_db)):
    return svc.update_group(db, member, group_id, body.model_dump(exclude_unset=True))


@router.delete("/character-groups/{group_id}")
def delete_group(group_id: int, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    svc.delete_group(db, member, group_id)
    return {"ok": True}
