"""Resources (characters, items...) and files."""
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Response, UploadFile
from sqlalchemy.orm import Session

from api.deps import current_member
from db.session import get_db
from models import SagaMember
from schemas.requests import CounterChange, FileIn, FolderIn, FolderRename, ResourceIn, ResourceUpdate
from services import resources as svc
from services import folders, uploads
from services.access import viewer_for
from services.errors import NotFound
from services.realtime import hub
from services.security import verify_file_signature
from services.stages import stages_showing_resource

router = APIRouter(prefix="/api")


def _notify(tasks: BackgroundTasks, db: Session, saga_id: int, resource_id: int) -> None:
    tasks.add_task(hub.notify, saga_id, stages_showing_resource(db, saga_id, resource_id), False)


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
                                   body.category_id, body.instanceable, body.group_ids, body.tags, body.folder_id)
    return _out(db, member, resource)


@router.get("/sagas/{saga_id}/resources/{resource_id}")
def get_resource(resource_id: int, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.get_resource(db, member, resource_id)


@router.patch("/sagas/{saga_id}/resources/{resource_id}")
def update_resource(saga_id: int, resource_id: int, body: ResourceUpdate, tasks: BackgroundTasks,
                    member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    visibility = body.visibility.model_dump() if body.visibility else None
    resource = svc.update_resource(db, member, resource_id, body.attributes, visibility, body.presentation,
                                   body.category_id, body.instanceable, body.group_ids, body.tags, body.folder_id)
    _notify(tasks, db, saga_id, resource_id)
    return _out(db, member, resource)


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
    return {"id": folder.id, "kind": folder.kind, "name": folder.name}


@router.get("/sagas/{saga_id}/folders")
def list_folders(kind: str = "document", member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """The folders this member may see (the DM: all; others: those holding something they see)."""
    return folders.list_folders(db, member, kind)


@router.post("/sagas/{saga_id}/folders")
def create_folder(body: FolderIn, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return _folder_out(folders.create_folder(db, member, body.kind, body.name))


@router.patch("/sagas/{saga_id}/folders/{folder_id}")
def rename_folder(folder_id: int, body: FolderRename, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    folder = folders.rename_folder(db, member, folder_id, body.name)
    return _folder_out(folder)


@router.delete("/sagas/{saga_id}/folders/{folder_id}", status_code=204)
def delete_folder(folder_id: int, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """The folder goes; its documents stay, out of any folder."""
    folders.delete_folder(db, member, folder_id)
    return Response(status_code=204)


@router.post("/sagas/{saga_id}/folders/file")
def file_resources(body: FileIn, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Command: file documents in a folder (dragging cards onto a folder)."""
    moved = folders.file_resources(db, member, body.folder_id, body.resource_ids)
    return {"moved": moved}


@router.post("/sagas/{saga_id}/files")
async def upload_file(file: UploadFile = File(...), category: str = Form("character"),
                      member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    data = await file.read()
    return uploads.upload_file(db, member, category, file.content_type or "", data)


@router.get("/files/{file_id}")
def get_file(file_id: int, e: int = 0, s: str = "", db: Session = Depends(get_db)):
    if not verify_file_signature(file_id, e, s):
        raise NotFound("File not found")
    file = svc.get_file(db, file_id)
    return Response(content=file.data, media_type=file.content_type,
                    headers={"Cache-Control": "private, max-age=3600"})
