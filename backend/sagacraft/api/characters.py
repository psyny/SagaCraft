"""Groups (of characters). Characters are organized by their type (plan 40). See docs/concepts/characters.md."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.deps import current_member
from db.session import get_db
from models import SagaMember
from schemas.requests import CharacterGroupIn
from services import characters as svc

router = APIRouter(prefix="/api/sagas/{saga_id}")


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
