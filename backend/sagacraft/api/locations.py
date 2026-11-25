"""Locations' maps (the map for a viewer, the DM's map commands), tags, players' composed map picture, and the
fog presets map Sets draw the fog with (built on the Locations page)."""
from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import current_member
from db.session import get_db
from models import SagaMember
from schemas.requests import FogPresetIn, FogPresetUpdate, MapCommand
from domain import map_paint
from services import fog_presets
from services import locations as svc
from services.errors import NotFound
from services.security import cache_headers
from services.realtime import hub
from services.stages import stages_showing_resource

router = APIRouter(prefix="/api")


@router.get("/sagas/{saga_id}/locations/graph")
def location_graph(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """The location map: how the locations this member sees link to each other, and which are part of which."""
    return svc.location_graph(db, member)


@router.get("/map-painter")
def map_painter_styles():
    """The map painting styles (the Details tab's menu): every folder in map_painter/styles."""
    return {"styles": [{k: map_paint.style_pack(s)["style"].get(k, "") for k in ("key", "name", "description")} for s in map_paint.STYLES]}


@router.get("/map-painter/{style}")
def map_painter_style(request: Request, style: str):
    """A map painting style (plan 48): its types, how each is drawn, its sprites. Not secret and needed by every viewer
    of a painted map (the live link too): no sign-in; cached."""
    try:
        pack = map_paint.style_pack(style)
    except map_paint.PaintError:
        raise NotFound("No such map painting style") from None
    headers = {"Cache-Control": "public, max-age=600", "ETag": f'"mp-{pack["version"]}"'}
    if request.headers.get("if-none-match") == headers["ETag"]:
        return Response(status_code=304, headers=headers)
    return JSONResponse(pack, headers=headers)


@router.get("/sagas/{saga_id}/locations/{resource_id}/map")
def get_map(resource_id: int, layer: str | None = None, member: SagaMember = Depends(current_member),
            db: Session = Depends(get_db)):
    return svc.get_map(db, member, resource_id, layer)


@router.post("/sagas/{saga_id}/locations/{resource_id}/map/command")
def map_command(saga_id: int, resource_id: int, body: MapCommand, tasks: BackgroundTasks,
                member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """A map command (paint fog, link a resource, save a path...). The location page's tools and the map Sets'
    send the same. Stages showing the location and open location pages update live."""
    result = svc.run_command(db, member, resource_id, body.name, body.args)
    tasks.add_task(hub.notify, saga_id, stages_showing_resource(db, saga_id, resource_id), False)
    tasks.add_task(hub.broadcast, saga_id, {"type": "location_updated", "id": resource_id})
    return result


@router.get("/sagas/{saga_id}/fog-presets")
def list_fog_presets(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return fog_presets.list_presets(db, member)


def _fog_changed(tasks: BackgroundTasks, db: Session, saga_id: int) -> None:
    """Map Sets draw the fog with presets: their Stages update live."""
    tasks.add_task(hub.notify, saga_id, fog_presets.stages_with_map_sets(db, saga_id), False)


@router.post("/sagas/{saga_id}/fog-presets")
def create_fog_preset(saga_id: int, body: FogPresetIn, tasks: BackgroundTasks,
                      member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    result = fog_presets.create(db, member, body.name, body.look, body.copy_of)
    _fog_changed(tasks, db, saga_id)
    return result


@router.patch("/sagas/{saga_id}/fog-presets/{preset_id}")
def update_fog_preset(saga_id: int, preset_id: int, body: FogPresetUpdate, tasks: BackgroundTasks,
                      member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    result = fog_presets.update(db, member, preset_id, body.name, body.changes)
    _fog_changed(tasks, db, saga_id)
    return result


@router.delete("/sagas/{saga_id}/fog-presets/{preset_id}", status_code=204)
def delete_fog_preset(saga_id: int, preset_id: int, tasks: BackgroundTasks,
                      member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    fog_presets.delete(db, member, preset_id)
    _fog_changed(tasks, db, saga_id)


@router.get("/sagas/{saga_id}/tags")
def tags(kind: str | None = None, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.tags(db, member, kind)


@router.get("/maps/{resource_id}")
def composed_map(request: Request, resource_id: int, g: str = "", e: int = 0, s: str = "", v: int = 0, l: str = "",  # noqa: E741
                 db: Session = Depends(get_db)):
    """A location's composed picture of one layer for one fog (signed URL, handed out by the map's render). Its URL
    names the map's version (every change but tokens makes a new one), so it's cached like a file."""
    if not svc.verify_map_signature(resource_id, g, e, s, l):
        raise NotFound("Map not found")
    headers = cache_headers(e, f'"m{resource_id}-{v}-{g}-{l}"')
    if request.headers.get("if-none-match") == headers["ETag"]:
        return Response(status_code=304, headers=headers)
    groups = [int(x) for x in g.split(",") if x.strip().isdigit()]
    return Response(content=svc.compose(db, resource_id, groups, l or None), media_type="image/webp", headers=headers)
