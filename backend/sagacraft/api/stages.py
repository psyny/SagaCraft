"""Stages, Sets, cards, the live Stage and grab attention. Every change is pushed in real time."""
from fastapi import APIRouter, BackgroundTasks, Body, Depends
from sqlalchemy.orm import Session

from api.deps import current_member
from db.session import get_db
from models import SagaMember
from schemas.requests import (
    ActorsIn,
    ActorValues,
    AttentionIn,
    CounterChange,
    LiveIn,
    SetCommand,
    SetIn,
    SetUpdate,
    LayersIn,
    StageIn,
    StageUpdate,
)
from services import stages as svc
from services.realtime import hub
from set_types import SET_TYPES

router = APIRouter(prefix="/api/sagas/{saga_id}")


def _push(tasks: BackgroundTasks, saga_id: int, *stage_ids: int) -> None:
    tasks.add_task(hub.notify, saga_id, set(stage_ids), False)


@router.get("/set-types")
def set_types(member: SagaMember = Depends(current_member)):
    return [{"key": t.key, "name": t.name, "uses_actors": t.uses_actors, "actor_kinds": list(t.actor_kinds),
             "default_config": t.default_config()} for t in SET_TYPES.values()]


@router.get("/live")
def live(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return {"stage": svc.live_view(db, member)}


@router.put("/live")
def set_live(saga_id: int, body: LiveIn, tasks: BackgroundTasks, member: SagaMember = Depends(current_member),
             db: Session = Depends(get_db)):
    """Command: set_live_stage (or stop showing with stage_id null)."""
    svc.set_live(db, member, body.stage_id)
    tasks.add_task(hub.notify, saga_id, {body.stage_id} if body.stage_id else set(), True)
    return {"live_stage_id": body.stage_id}


@router.post("/attention")
async def attention(saga_id: int, body: AttentionIn, member: SagaMember = Depends(current_member),
                    db: Session = Depends(get_db)):
    """Command: grab_attention on a Set (or one card) of the live Stage."""
    message = svc.attention(db, member, body.set_id, body.actor_id, body.target)
    await hub.attention(saga_id, message)
    return {"ok": True}


@router.post("/sets/{set_id}/act")
def act(saga_id: int, set_id: int, tasks: BackgroundTasks, body: dict = Body(...), member: SagaMember = Depends(current_member),
        db: Session = Depends(get_db)):
    """A member acting on a Set of the live Stage (the dice tray: add dice, roll; a token moved). Everyone sees it live."""
    stage_set = svc.act(db, member, set_id, str(body.get("name") or ""), body.get("args") or {})
    _push(tasks, saga_id, stage_set.stage_id)
    if stage_set.type == "world_map":  # a token moved: the location's map changed (other Stages, its page)
        location_id = svc.shown_location(stage_set)
        if location_id is not None:
            tasks.add_task(hub.notify, saga_id, svc.stages_showing_resource(db, saga_id, location_id), False)
            tasks.add_task(hub.broadcast, saga_id, {"type": "location_updated", "id": location_id})
    return {"ok": True}


@router.post("/sets/{set_id}/ping")
async def ping(saga_id: int, set_id: int, body: dict = Body(...), member: SagaMember = Depends(current_member),
               db: Session = Depends(get_db)):
    """Command: ping a tile of a map Set on the live Stage (players and the DM)."""
    message = svc.ping(db, member, set_id, body.get("tile"))
    await hub.ping(saga_id, message)
    return {"ok": True}


@router.post("/sets/{set_id}/token-drag")
async def token_drag(saga_id: int, set_id: int, body: dict = Body(...), member: SagaMember = Depends(current_member),
                     db: Session = Depends(get_db)):
    """The DM dragging a token on a map Set of the live Stage: others see it go, live (plan 39). Nothing is saved."""
    message = svc.token_drag(db, member, set_id, body.get("token"), body.get("tile"), bool(body.get("dropped")))
    if message is not None:
        await hub.token_drag(saga_id, message)
    return {"ok": True}


@router.get("/stages")
def list_stages(member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.list_stages(db, member)


@router.post("/stages")
def create_stage(body: StageIn, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    stage = svc.create_stage(db, member, body.name)
    return svc.stage_view(db, member, stage.id)


@router.get("/stages/{stage_id}")
def get_stage(stage_id: int, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    return svc.stage_view(db, member, stage_id)


@router.get("/stages/{stage_id}/as-players")
def get_stage_as_players(stage_id: int, member_id: int | None = None, member: SagaMember = Depends(current_member),
                         db: Session = Depends(get_db)):
    """The DM's player view (plan 59): the Stage as every player sees it, or as one player (member_id)."""
    return svc.stage_as_players(db, member, stage_id, member_id)


@router.patch("/stages/{stage_id}")
def update_stage(saga_id: int, stage_id: int, body: StageUpdate, tasks: BackgroundTasks,
                 member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Rename, or switch the layout (canvas: a world to pan; interface: Sets fixed to the screen)."""
    extra = {"environment_id": body.environment_id} if "environment_id" in body.model_fields_set else {}
    if body.controls is not None:
        extra["controls"] = body.controls
    if body.paused is not None:
        extra["paused"] = body.paused
    svc.update_stage(db, member, stage_id, body.name, body.layout, **extra)
    _push(tasks, saga_id, stage_id)
    return svc.stage_view(db, member, stage_id)


@router.put("/stages/{stage_id}/layers")
def order_layers(saga_id: int, stage_id: int, body: LayersIn, tasks: BackgroundTasks,
                 member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Command: put the Sets in this order, bottom to top."""
    svc.order_layers(db, member, stage_id, body.set_ids)
    _push(tasks, saga_id, stage_id)
    return svc.stage_view(db, member, stage_id)


@router.post("/stages/{stage_id}/duplicate")
def duplicate_stage(stage_id: int, member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    stage = svc.duplicate_stage(db, member, stage_id)
    return svc.stage_view(db, member, stage.id)


@router.delete("/stages/{stage_id}")
def delete_stage(saga_id: int, stage_id: int, tasks: BackgroundTasks, member: SagaMember = Depends(current_member),
                 db: Session = Depends(get_db)):
    svc.delete_stage(db, member, stage_id)
    tasks.add_task(hub.notify, saga_id, {stage_id}, True)
    return {"ok": True}


@router.post("/stages/{stage_id}/sets")
def add_set(saga_id: int, stage_id: int, body: SetIn, tasks: BackgroundTasks,
            member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    svc.add_set(db, member, stage_id, body.type, body.name, body.x, body.y, body.config)
    _push(tasks, saga_id, stage_id)
    return svc.stage_view(db, member, stage_id)


@router.patch("/sets/{set_id}")
def update_set(saga_id: int, set_id: int, body: SetUpdate, tasks: BackgroundTasks,
               member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    changes = body.model_dump(exclude_unset=True)
    if body.visibility is not None:
        changes["visibility"] = body.visibility.model_dump()
    stage_set = svc.update_set(db, member, set_id, changes)
    _push(tasks, saga_id, stage_set.stage_id)
    return svc.stage_view(db, member, stage_set.stage_id)


@router.delete("/sets/{set_id}")
def delete_set(saga_id: int, set_id: int, tasks: BackgroundTasks, member: SagaMember = Depends(current_member),
               db: Session = Depends(get_db)):
    stage_id = svc.delete_set(db, member, set_id)
    _push(tasks, saga_id, stage_id)
    return svc.stage_view(db, member, stage_id)


@router.post("/sets/{set_id}/actors")
def add_actors(saga_id: int, set_id: int, body: ActorsIn, tasks: BackgroundTasks,
               member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Command: add_creatures (characters and/or groups) to a Set (an Actors Scene: to one tab)."""
    stage_set = svc.add_actors(db, member, set_id, body.resource_ids, body.hidden, body.group_ids, body.tab_id)
    _push(tasks, saga_id, stage_set.stage_id)
    return svc.stage_view(db, member, stage_set.stage_id)


@router.post("/sets/{set_id}/command")
def set_command(saga_id: int, set_id: int, body: SetCommand, tasks: BackgroundTasks,
                member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """A Set type's named command, e.g. {"name": "turn", "args": {"action": "next"}}."""
    stage_set = svc.run_command(db, member, set_id, body.name, body.args)
    _push(tasks, saga_id, stage_set.stage_id)
    return svc.stage_view(db, member, stage_set.stage_id)


@router.post("/actors/{actor_id}/counter")
def change_actor_counter(saga_id: int, actor_id: int, body: CounterChange, tasks: BackgroundTasks,
                         member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Command: change_counter on a card (an instance keeps its own value; others change the character)."""
    actor = svc.change_actor_counter(db, member, actor_id, body.key, body.delta, body.current)
    stage_id = actor.stage_set.stage_id
    _push(tasks, saga_id, *svc.actor_changed_stages(db, member, actor))
    return svc.stage_view(db, member, stage_id)


@router.patch("/actors/{actor_id}/values")
def update_actor_values(saga_id: int, actor_id: int, body: ActorValues, tasks: BackgroundTasks,
                        member: SagaMember = Depends(current_member), db: Session = Depends(get_db)):
    """Values typed on a card (e.g. initiative in the order tray)."""
    actor = svc.update_actor_values(db, member, actor_id, body.attributes)
    stage_id = actor.stage_set.stage_id
    _push(tasks, saga_id, *svc.actor_changed_stages(db, member, actor))
    return svc.stage_view(db, member, stage_id)


@router.delete("/actors/{actor_id}")
def delete_actor(saga_id: int, actor_id: int, tasks: BackgroundTasks, member: SagaMember = Depends(current_member),
                 db: Session = Depends(get_db)):
    stage_id = svc.delete_actor(db, member, actor_id)
    _push(tasks, saga_id, stage_id)
    return svc.stage_view(db, member, stage_id)
