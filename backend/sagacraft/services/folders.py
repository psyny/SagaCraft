"""Folders the DM files resources in: documents for now, one level (no sub-folders).

The DM sees every folder of the kind; other members see a folder (its name) only when it holds a resource
they can see, so an empty or secret folder never shows. A resource's folder is `Resource.folder_id`.
See docs/concepts/rulesets.md ("Documents").
"""
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Resource, ResourceFolder, SagaMember
from services.access import require_admin, viewer_for
from services.errors import BadRequest, Conflict, NotFound

KINDS = ("document",)
MAX_FOLDERS = 200
NAME_LENGTH = 80


def _natural(name: str) -> list:
    """Sort key: "Chapter 2" before "Chapter 10", case ignored."""
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", name.lower())]


def _kind(kind: str) -> str:
    if kind not in KINDS:
        raise BadRequest("Only documents go in folders")
    return kind


def _clean_name(raw) -> str:
    name = " ".join(str(raw or "").split())[:NAME_LENGTH]
    if not name:
        raise BadRequest("Give the folder a name")
    return name


def _folders(db: Session, saga_id: int, kind: str) -> list[ResourceFolder]:
    rows = db.scalars(select(ResourceFolder).where(ResourceFolder.saga_id == saga_id, ResourceFolder.kind == kind)).all()
    return sorted(rows, key=lambda f: _natural(f.name))


def _get(db: Session, saga_id: int, folder_id: int) -> ResourceFolder:
    folder = db.get(ResourceFolder, folder_id)
    if folder is None or folder.saga_id != saga_id:
        raise NotFound("Folder not found")
    return folder


def _check_unique(db: Session, saga_id: int, kind: str, name: str, keep: int | None = None) -> None:
    if any(f.name.lower() == name.lower() and f.id != keep for f in _folders(db, saga_id, kind)):
        raise Conflict(f"There's already a folder called {name}")


def folder_for(db: Session, saga_id: int, kind: str, folder_id: int | None) -> int | None:
    """The folder a resource goes in: None or 0 means none; else it must be a folder of this kind in this Saga."""
    if not folder_id:
        return None
    if kind not in KINDS:
        raise BadRequest("Only documents go in folders")
    folder = _get(db, saga_id, folder_id)
    if folder.kind != kind:
        raise BadRequest("That folder holds another kind of resource")
    return folder.id


def list_folders(db: Session, member: SagaMember, kind: str) -> list[dict]:
    """The folders this member may see, in name order, each with how many of its resources they see."""
    from services.resources import can_see_resource, ruleset_for

    _kind(kind)
    viewer = viewer_for(db, member)
    ruleset = ruleset_for(db, member.saga_id)
    resources = db.scalars(select(Resource).where(Resource.saga_id == member.saga_id, Resource.kind == kind,
                                                  Resource.folder_id.is_not(None))).all()
    counts: dict[int, int] = {}
    for resource in resources:
        if viewer.is_admin or can_see_resource(viewer, ruleset, resource):
            counts[resource.folder_id] = counts.get(resource.folder_id, 0) + 1
    return [{"id": f.id, "kind": f.kind, "name": f.name, "count": counts.get(f.id, 0)}
            for f in _folders(db, member.saga_id, kind) if viewer.is_admin or counts.get(f.id)]


def create_folder(db: Session, member: SagaMember, kind: str, name) -> ResourceFolder:
    require_admin(member)
    _kind(kind)
    name = _clean_name(name)
    if len(_folders(db, member.saga_id, kind)) >= MAX_FOLDERS:
        raise BadRequest(f"At most {MAX_FOLDERS} folders")
    _check_unique(db, member.saga_id, kind, name)
    folder = ResourceFolder(saga_id=member.saga_id, kind=kind, name=name)
    db.add(folder)
    db.commit()
    return folder


def rename_folder(db: Session, member: SagaMember, folder_id: int, name) -> ResourceFolder:
    require_admin(member)
    folder = _get(db, member.saga_id, folder_id)
    name = _clean_name(name)
    _check_unique(db, member.saga_id, folder.kind, name, keep=folder.id)
    folder.name = name
    db.commit()
    return folder


def delete_folder(db: Session, member: SagaMember, folder_id: int) -> None:
    """Deletes the folder only: its resources stay, out of any folder."""
    require_admin(member)
    folder = _get(db, member.saga_id, folder_id)
    for resource in db.scalars(select(Resource).where(Resource.folder_id == folder.id)).all():
        resource.folder_id = None
    db.delete(folder)
    db.commit()


def file_resources(db: Session, member: SagaMember, folder_id: int | None, resource_ids: list[int]) -> int:
    """Command: move resources into a folder (None/0: out of folders). Returns how many moved."""
    require_admin(member)
    if not resource_ids:
        return 0
    resources = db.scalars(select(Resource).where(Resource.saga_id == member.saga_id, Resource.id.in_(resource_ids))).all()
    if len(resources) != len(set(resource_ids)):
        raise NotFound("Resource not found")
    for resource in resources:
        resource.folder_id = folder_for(db, member.saga_id, resource.kind, folder_id)
    db.commit()
    return len(resources)
