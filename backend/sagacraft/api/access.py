"""Login, system administration, Sagas, members and groups."""
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Body, Depends
from sqlalchemy.orm import Session

from api.deps import current_member, current_user
from db.session import get_db
from domain.permissions import ALL_PERMISSIONS
from models import SagaMember, User
from schemas.requests import (
    GroupIn,
    LoginIn,
    MemberIn,
    MemberUpdate,
    SagaIn,
    SystemAdminIn,
    SystemAdminUpdate,
    UploadLimitsIn,
)
from services import access, uploads
from services.realtime import hub
from services.resources import ruleset_for

router = APIRouter(prefix="/api")


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    return {"token": access.login(db, body.login, body.password)}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return access.me(db, user)


@router.patch("/me")
def update_me(tasks: BackgroundTasks, body: dict[str, Any] = Body(...), user: User = Depends(current_user),
              db: Session = Depends(get_db)):
    """Command: change my display name, or my password ({password, new_password})."""
    result = access.update_account(db, user, body)
    if "display_name" in body:
        for saga in result["sagas"]:
            tasks.add_task(hub.notify, saga["id"], set(), True)  # others see the new name
    return result


@router.patch("/sagas/{saga_id}/me")
def update_my_member(saga_id: int, tasks: BackgroundTasks, body: dict[str, Any] = Body(...),
                     member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Command: my colour and dice style in this Saga."""
    result = access.update_my_member(db, member, body)
    tasks.add_task(hub.notify, saga_id, set(), True)  # token borders follow the colour
    return result


@router.get("/upload-limits")
def upload_limits(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Picture limits per category, shown before choosing a file and used to resize in the browser."""
    return uploads.get_limits(db)


# -- system administration ----------------------------------------------------


@router.put("/system/settings/upload-limits")
def update_upload_limits(body: UploadLimitsIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return uploads.update_limits(db, user, body.categories)



@router.get("/system/permissions")
def permissions(user: User = Depends(current_user)):
    return [{"key": k, "description": v} for k, v in ALL_PERMISSIONS.items()]


@router.get("/system/rulesets")
def rulesets(user: User = Depends(current_user)):
    return access.rulesets()


@router.get("/system/admins")
def system_admins(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return access.list_system_admins(db, user)


@router.post("/system/admins")
def create_system_admin(body: SystemAdminIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return access.create_system_admin(db, user, body.login, body.password, body.display_name, body.permissions)


@router.patch("/system/admins/{user_id}")
def update_system_admin(user_id: int, body: SystemAdminUpdate, user: User = Depends(current_user),
                        db: Session = Depends(get_db)):
    return access.update_system_admin(db, user, user_id, body.permissions)


@router.get("/system/sagas")
def all_sagas(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return access.list_all_sagas(db, user)


@router.post("/system/sagas")
def create_saga(body: SagaIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return access.create_saga(db, user, body.name, body.ruleset_key, body.admin_login, body.admin_password,
                              body.admin_display_name, body.template)


# -- one Saga -----------------------------------------------------------------


@router.get("/sagas/{saga_id}")
def saga(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return access.saga_overview(db, member)


@router.get("/sagas/{saga_id}/ruleset")
def saga_ruleset(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return ruleset_for(db, member.saga_id).to_dict()


@router.post("/sagas/{saga_id}/members")
def add_member(saga_id: int, body: MemberIn, tasks: BackgroundTasks, member: SagaMember = Depends(current_member),
               db: Session = Depends(get_db)):
    result = access.add_member(db, member, body.login, body.password, body.display_name, body.role)
    tasks.add_task(hub.notify, saga_id, None, True)
    return result


@router.patch("/sagas/{saga_id}/members/{member_id}")
def update_member(saga_id: int, member_id: int, body: MemberUpdate, tasks: BackgroundTasks,
                  member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    result = access.update_member(db, member, member_id, body.role)
    tasks.add_task(hub.notify, saga_id, None, True)
    return result


@router.delete("/sagas/{saga_id}/members/{member_id}")
def remove_member(saga_id: int, member_id: int, tasks: BackgroundTasks,
                  member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    result = access.remove_member(db, member, member_id)
    tasks.add_task(hub.notify, saga_id, None, True)
    return result


@router.post("/sagas/{saga_id}/groups")
def create_group(saga_id: int, body: GroupIn, tasks: BackgroundTasks, member: SagaMember = Depends(current_member),
                 db: Session = Depends(get_db)):
    result = access.save_group(db, member, None, body.name, body.member_ids)
    tasks.add_task(hub.notify, saga_id, None, True)
    return result


@router.put("/sagas/{saga_id}/groups/{group_id}")
def update_group(saga_id: int, group_id: int, body: GroupIn, tasks: BackgroundTasks,
                 member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    result = access.save_group(db, member, group_id, body.name, body.member_ids)
    tasks.add_task(hub.notify, saga_id, None, True)
    return result


@router.delete("/sagas/{saga_id}/groups/{group_id}")
def delete_group(saga_id: int, group_id: int, tasks: BackgroundTasks,
                 member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    result = access.delete_group(db, member, group_id)
    tasks.add_task(hub.notify, saga_id, None, True)
    return result
