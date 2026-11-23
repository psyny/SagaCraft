"""Resources (characters, items...) and files."""
from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, Form, Request, Response, UploadFile
from sqlalchemy.orm import Session

from api.deps import current_member
from db.session import get_db
from models import SagaMember
from schemas.requests import CounterChange, FileIn, FolderIn, FolderRename, ResourceIn, ResourceUpdate
from services import resources as svc
from services import folders, uploads
from services.access import viewer_for
from services.errors import BadRequest, NotFound
from services.realtime import hub
from services import files as file_service
from services.security import cache_headers, verify_file_signature
from services.stages import stages_showing_resource

router = APIRouter(prefix="/api")


def _notify(tasks: BackgroundTasks, db: Session, saga_id: int, resource_id: int) -> None:
    from services.relationships import stages_with_graphs

    stage_ids = stages_showing_resource(db, saga_id, resource_id) | stages_with_graphs(db, saga_id)
    tasks.add_task(hub.notify, saga_id, stage_ids, False)


def _out(db: Session, member: SagaMember, resource) -> dict:
    return svc.serialize_for(db, viewer_for(db, member), resource)


@router.get("/sagas/{saga_id}/resources")
def list_resources(kind: str | None = None, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.list_resources(db, member, kind)


@router.post("/sagas/{saga_id}/resources")
def create_resource(saga_id: int, body: ResourceIn, member: SagaMember = Depends(current_member),
                    db: Session = Depends(get_db)):
    visibility = body.visibility.model_dump() if body.visibility else None
    resource = svc.create_resource(db, member, body.kind, body.type, body.attributes, visibility, body.presentation,
                                   body.category_id, body.instanceable, body.group_ids, body.tags, body.folder_id,
                                   body.owners, body.editors.model_dump() if body.editors else None, body.active)
    return _out(db, member, resource)


@router.get("/sagas/{saga_id}/resources/{resource_id}")
def get_resource(resource_id: int, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.get_resource(db, member, resource_id)


@router.patch("/sagas/{saga_id}/resources/{resource_id}")
def update_resource(saga_id: int, resource_id: int, body: ResourceUpdate, tasks: BackgroundTasks,
                    member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    visibility = body.visibility.model_dump() if body.visibility else None
    resource = svc.update_resource(db, member, resource_id, body.attributes, visibility, body.presentation,
                                   body.category_id, body.instanceable, body.group_ids, body.tags, body.folder_id,
                                   body.owners, body.editors.model_dump() if body.editors else None, body.active)
    _notify(tasks, db, saga_id, resource_id)
    return _out(db, member, resource)


@router.post("/sagas/{saga_id}/resources/{resource_id}/use-item")
def use_item(saga_id: int, resource_id: int, tasks: BackgroundTasks, body: dict = Body(...),
             member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Command: use an item from this character's inventory (one less on its counter: uses, charges)."""
    item_id = body.get("item_id")
    if isinstance(item_id, bool) or not isinstance(item_id, int):
        raise BadRequest("item_id: an item")
    item = svc.use_item(db, member, resource_id, item_id, body.get("key"))
    _notify(tasks, db, saga_id, item.id)
    return _out(db, member, item)


@router.post("/sagas/{saga_id}/resources/{resource_id}/counter")
def change_counter(saga_id: int, resource_id: int, body: CounterChange, tasks: BackgroundTasks,
                   member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Command: change_counter (e.g. HP -7). Same action a button, shortcut or voice command will use."""
    resource = svc.change_counter(db, member, resource_id, body.key, body.delta, body.current)
    _notify(tasks, db, saga_id, resource_id)
    return _out(db, member, resource)


@router.delete("/sagas/{saga_id}/resources/{resource_id}")
def delete_resource(saga_id: int, resource_id: int, tasks: BackgroundTasks,
                    member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    stage_ids = stages_showing_resource(db, saga_id, resource_id)
    svc.delete_resource(db, member, resource_id)
    tasks.add_task(hub.notify, saga_id, stage_ids, False)
    return {"ok": True}


def _folder_out(folder) -> dict:
    return folders.folder_out(folder, 0, True)


@router.get("/sagas/{saga_id}/folders")
def list_folders(kind: str = "document", member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """The folders this member may see (the DM: all; others: those holding something they see)."""
    return folders.list_folders(db, member, kind)


@router.post("/sagas/{saga_id}/folders")
def create_folder(body: FolderIn, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return _folder_out(folders.create_folder(db, member, body.kind, body.name))


@router.patch("/sagas/{saga_id}/folders/{folder_id}")
def update_folder(saga_id: int, folder_id: int, body: FolderRename, tasks: BackgroundTasks,
                  member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Rename it, or set who sees it (inherit, or a visibility overriding its resources')."""
    folder = folders.update_folder(db, member, folder_id, body.name, body.inherit,
                                   body.visibility.model_dump() if body.visibility else None)
    tasks.add_task(hub.notify, saga_id, set(), False)  # what players see may have changed
    return _folder_out(folder)


@router.delete("/sagas/{saga_id}/folders/{folder_id}", status_code=204)
def delete_folder(saga_id: int, folder_id: int, tasks: BackgroundTasks, member: SagaMember = Depends(current_member),
                  db: Session = Depends(get_db)):
    """The folder goes; its resources stay, out of any folder (with their own visibility)."""
    folders.delete_folder(db, member, folder_id)
    tasks.add_task(hub.notify, saga_id, set(), False)
    return Response(status_code=204)


@router.post("/sagas/{saga_id}/folders/file")
def file_resources(saga_id: int, body: FileIn, tasks: BackgroundTasks, member: SagaMember = Depends(current_member),
                   db: Session = Depends(get_db)):
    """Command: file resources in a folder (dragging cards onto a folder)."""
    moved = folders.file_resources(db, member, body.folder_id, body.resource_ids)
    tasks.add_task(hub.notify, saga_id, set(), False)
    return {"moved": moved}


@router.post("/sagas/{saga_id}/files")
async def upload_file(file: UploadFile = File(...), category: str = Form("character"),
                      member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    data = await file.read()
    return uploads.upload_file(db, member, category, file.content_type or "", data)


@router.get("/files/{file_id}")
def get_file(request: Request, file_id: int, e: int = 0, s: str = "", w: int = 0, db: Session = Depends(get_db)):
    """A picture (signed URL); `w`: the width it shows at, for a smaller copy (cards, lists). Cacheable by anyone
    until the URL stops working: browsers and a CDN keep it (a file never changes)."""
    if not verify_file_signature(file_id, e, s):
        raise NotFound("File not found")
    file = svc.get_file(db, file_id)
    width = file_service.variant_width(file, w)
    headers = cache_headers(e, f'"f{file_id}-{width or 0}"')
    if request.headers.get("if-none-match") == headers["ETag"]:
        return Response(status_code=304, headers=headers)
    if width:
        made = file_service.variant(db, file, width)
        return Response(content=made.data, media_type=made.content_type, headers=headers)
    return Response(content=file.data, media_type=file.content_type, headers=headers)


@router.get("/sagas/{saga_id}/resources/{resource_id}/actions")
def resource_actions(saga_id: int, resource_id: int, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """The Saga template's actions on this character or item (and its party's, for a character), and which this member
    may run."""
    from services import actions

    return actions.resource_actions(db, member, resource_id)


@router.post("/sagas/{saga_id}/resources/{resource_id}/actions/{key}")
def run_resource_action(saga_id: int, resource_id: int, key: str, tasks: BackgroundTasks,
                        member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Command: run an action on this character or item (all its changes at once, or none)."""
    from services import actions

    result = actions.run_on_resource(db, member, resource_id, key)
    for changed in result.pop("resource_ids"):  # every changed one (some this member may not see)
        _notify(tasks, db, saga_id, changed)
    return result


@router.get("/sagas/{saga_id}/character-groups/{group_id}/actions")
def group_actions(saga_id: int, group_id: int, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    from services import actions

    return actions.group_actions(db, member, group_id)


@router.post("/sagas/{saga_id}/character-groups/{group_id}/actions/{key}")
def run_group_action(saga_id: int, group_id: int, key: str, tasks: BackgroundTasks,
                     member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Command: run an action on a group (the DM; or a player it lets run it, from their character's party)."""
    from services import actions

    result = actions.run_on_group(db, member, group_id, key)
    for changed in result.pop("resource_ids"):  # every changed one (some this member may not see)
        _notify(tasks, db, saga_id, changed)
    return result
