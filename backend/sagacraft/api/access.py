"""Login, system administration, Sagas, members and groups."""
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Body, Depends
from sqlalchemy.orm import Session

from api.deps import current_member, current_user
from db.session import get_db
from domain.permissions import ALL_PERMISSIONS
from models import SagaMember, User
from schemas.requests import (
    AccountIn,
    AccountUpdate,
    GroupIn,
    SagaActive,
    SagaDmIn,
    LoginIn,
    MemberIn,
    MemberUpdate,
    SagaIn,
    SystemAdminIn,
    SystemAdminUpdate,
    UploadLimitsIn,
)
from services import access, system_sagas, uploads
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
    """Command: change my password ({password, new_password}). Display names are each Saga's (/sagas/{id}/me)."""
    return access.update_account(db, user, body)


@router.patch("/sagas/{saga_id}/me")
def update_my_member(saga_id: int, tasks: BackgroundTasks, body: dict[str, Any] = Body(...),
                     member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Command: my display name, colour and dice options in this Saga."""
    result = access.update_my_member(db, member, body)
    tasks.add_task(hub.notify, saga_id, set(), True)  # others see the name; token borders follow the colour
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
    return access.create_system_admin(db, user, body.login, body.password, body.permissions)


@router.patch("/system/admins/{user_id}")
def update_system_admin(user_id: int, body: SystemAdminUpdate, user: User = Depends(current_user),
                        db: Session = Depends(get_db)):
    return access.update_system_admin(db, user, user_id, body.permissions)


@router.delete("/system/admins/{user_id}", status_code=204)
def remove_system_admin(user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access.remove_system_admin(db, user, user_id)


@router.get("/system/logins")
def search_logins(q: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Accounts to pick as a new Saga's DM (logins only)."""
    return access.search_logins(db, user, q)


@router.get("/system/users")
def accounts(q: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    return access.list_accounts(db, user, q)


@router.post("/system/users")
def create_account(body: AccountIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return access.create_account(db, user, body.login, body.password)


@router.patch("/system/users/{user_id}")
def update_account(user_id: int, body: AccountUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return access.update_account_as_admin(db, user, user_id, body.model_dump(exclude_unset=True))


@router.delete("/system/users/{user_id}", status_code=204)
def delete_account(user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access.delete_account(db, user, user_id)


@router.get("/system/sagas")
def all_sagas(q: str = "", order: str = "last_login", status: str = "all", offset: int = 0, limit: int = 5,
              user: User = Depends(current_user), db: Session = Depends(get_db)):
    """A page of Sagas (plan 43): names with `q`, active or not, ordered by last login, name, newest or oldest."""
    return system_sagas.list_sagas(db, user, q, order, status, offset, limit)


@router.get("/system/sagas/{saga_id}")
def saga_detail(saga_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """One Saga's page: its numbers, members and files (never its content)."""
    return system_sagas.saga_detail(db, user, saga_id)


@router.patch("/system/sagas/{saga_id}")
def set_saga_active(saga_id: int, body: SagaActive, tasks: BackgroundTasks, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    result = system_sagas.set_active(db, user, saga_id, body.active)
    tasks.add_task(hub.notify, saga_id, None, True)  # open screens find it closed (or open again)
    return result


@router.delete("/system/sagas/{saga_id}", status_code=204)
def delete_saga(saga_id: int, confirm: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Delete a Saga and everything in it; `confirm` is its name, typed."""
    system_sagas.delete_saga(db, user, saga_id, confirm)


@router.post("/system/sagas/{saga_id}/admins")
def add_saga_dm(saga_id: int, body: SagaDmIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return system_sagas.add_dm(db, user, saga_id, body.account, body.login, body.password, body.display_name)


@router.post("/system/sagas")
def create_saga(body: SagaIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return access.create_saga(db, user, body.name, body.ruleset_key, body.admin_login, body.admin_password,
                              body.admin_display_name, body.template, body.admin_account)


# -- one Saga -----------------------------------------------------------------


@router.get("/sagas/{saga_id}")
def saga(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    system_sagas.touch_member(db, member)  # the Saga's last login (System → Sagas)
    return access.saga_overview(db, member)


@router.get("/sagas/{saga_id}/ruleset")
def saga_ruleset(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return ruleset_for(db, member.saga_id).to_dict()


@router.get("/sagas/{saga_id}/accounts")
def search_accounts(q: str = "", member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """The DM looking up accounts to add to the Saga (logins only)."""
    return access.search_accounts(db, member, q)


@router.post("/sagas/{saga_id}/members")
def add_member(saga_id: int, body: MemberIn, tasks: BackgroundTasks, member: SagaMember = Depends(current_member),
               db: Session = Depends(get_db)):
    result = access.add_member(db, member, body.login, body.password, body.display_name, body.role, body.account)
    tasks.add_task(hub.notify, saga_id, None, True)
    return result


@router.patch("/sagas/{saga_id}/settings")
def update_settings(saga_id: int, tasks: BackgroundTasks, body: dict = Body(...),
                    member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Command: change the Saga's settings (its admins): {action_dice: bool}."""
    result = access.update_settings(db, member, body)
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
