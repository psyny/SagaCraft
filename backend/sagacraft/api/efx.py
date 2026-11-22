"""EFX (environment effects): the effects catalog, and the DM's environments (Stages using one update live)."""
from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from api.deps import current_member
from db.session import get_db
from domain import efx
from models import SagaMember
from services import environments as svc
from services.access import require_admin
from services.realtime import hub

router = APIRouter(prefix="/api/sagas/{saga_id}")


@router.get("/efx/catalog")
def catalog(member: SagaMember = Depends(current_member)):
    """Effect kinds per layer, their settings and limits (the editor is built from it); the examples."""
    require_admin(member)
    return {**efx.catalog(), "examples": [{"key": k, "name": v["name"]} for k, v in efx.examples().items()]}


@router.get("/environments")
def list_environments(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.list_environments(db, member)


@router.post("/environments")
def create_environment(body: dict, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """{name?, copy_of?, example?, far?, near?, fore?}"""
    return svc.create(db, member, body or {})


@router.patch("/environments/{env_id}")
def update_environment(saga_id: int, env_id: int, body: dict, tasks: BackgroundTasks,
                       member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """{name?, far?, near?, fore?}: a layer is replaced whole. Stages showing it update live."""
    result = svc.update(db, member, env_id, body or {})
    tasks.add_task(hub.notify, saga_id, svc.stages_using(db, member.saga_id, env_id), False)
    return result


@router.delete("/environments/{env_id}", status_code=204)
def delete_environment(saga_id: int, env_id: int, tasks: BackgroundTasks,
                       member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    tasks.add_task(hub.notify, saga_id, svc.delete(db, member, env_id), False)
