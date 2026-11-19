"""Stages, their Sets and actors, the live Stage, and grab attention.

The Stage core knows nothing about Set types beyond the contract in set_types/base.py.
"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from domain.visibility import Viewer, can_see, is_shared
from infrastructure.config.settings import settings
from models import Resource, Saga, SagaMember, Stage, StageActor, StageSet
from services.access import check_visibility, default_group_ids, get_saga, require_admin, viewer_for
from services.errors import BadRequest, NotFound
from services.resources import ruleset_for
from set_types import SET_TYPES, RenderContext, get_set_type


def everyone(db: Session, saga_id: int) -> dict:
    """Visibility for 'all players and viewers' (admins always see everything)."""
    groups = default_group_ids(db, saga_id)
    return {"groups": sorted(g for k, g in groups.items() if k in ("players", "viewers")), "members": []}


# ---------------------------------------------------------------------------
# Lookups (always scoped to the caller's Saga)
# ---------------------------------------------------------------------------


def _stage(db: Session, member: SagaMember, stage_id: int) -> Stage:
    stage = db.get(Stage, stage_id)
    if stage is None or stage.saga_id != member.saga_id:
        raise NotFound("Stage not found")
    return stage


def _set(db: Session, member: SagaMember, set_id: int) -> StageSet:
    stage_set = db.get(StageSet, set_id)
    if stage_set is None or stage_set.stage.saga_id != member.saga_id:
        raise NotFound("Set not found")
    return stage_set


def _actor(db: Session, member: SagaMember, actor_id: int) -> StageActor:
    actor = db.get(StageActor, actor_id)
    if actor is None or actor.stage_set.stage.saga_id != member.saga_id:
        raise NotFound("Card not found")
    return actor


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def render_stage(db: Session, stage: Stage, viewer: Viewer, live_stage_id: int | None) -> dict:
    ctx = RenderContext(viewer=viewer, ruleset=ruleset_for(db, stage.saga_id), secret=settings.jwt_secret_key)
    sets = []
    for stage_set in sorted(stage.sets, key=lambda s: (s.layer, s.id)):
        if not can_see(viewer, stage_set.visibility):
            continue
        hidden = not is_shared(stage_set.visibility)
        set_type = SET_TYPES.get(stage_set.type)
        if set_type is None:
            continue
        item = {
            "id": stage_set.id, "type": stage_set.type, "name": stage_set.name,
            "x": stage_set.x, "y": stage_set.y, "width": stage_set.width, "height": stage_set.height,
            "layer": stage_set.layer,
            "transparent": bool(stage_set.transparent),
            "content": set_type.render(ctx, stage_set, list(stage_set.actors)),
        }
        if viewer.is_admin:
            item["hidden"] = hidden
            item["visibility"] = stage_set.visibility or {"groups": [], "members": []}
        sets.append(item)
    return {"id": stage.id, "name": stage.name, "is_live": stage.id == live_stage_id, "sets": sets}


def live_view(db: Session, member: SagaMember) -> dict | None:
    saga = get_saga(db, member.saga_id)
    if saga.live_stage_id is None:
        return None
    stage = db.get(Stage, saga.live_stage_id)
    if stage is None:
        return None
    return render_stage(db, stage, viewer_for(db, member), saga.live_stage_id)


def stage_view(db: Session, member: SagaMember, stage_id: int) -> dict:
    require_admin(member)
    stage = _stage(db, member, stage_id)
    return render_stage(db, stage, viewer_for(db, member), get_saga(db, member.saga_id).live_stage_id)


# ---------------------------------------------------------------------------
# Stages
# ---------------------------------------------------------------------------


def list_stages(db: Session, member: SagaMember) -> list[dict]:
    require_admin(member)
    live = get_saga(db, member.saga_id).live_stage_id
    stages = db.scalars(select(Stage).where(Stage.saga_id == member.saga_id).order_by(Stage.sort_order, Stage.id)).all()
    return [{"id": s.id, "name": s.name, "is_live": s.id == live, "set_count": len(s.sets)} for s in stages]


def create_stage(db: Session, member: SagaMember, name: str) -> Stage:
    require_admin(member)
    name = (name or "").strip() or "New stage"
    last = db.scalar(select(func.max(Stage.sort_order)).where(Stage.saga_id == member.saga_id)) or 0
    stage = Stage(saga_id=member.saga_id, name=name[:160], sort_order=last + 1)
    db.add(stage)
    db.commit()
    return stage


def rename_stage(db: Session, member: SagaMember, stage_id: int, name: str) -> Stage:
    require_admin(member)
    stage = _stage(db, member, stage_id)
    if not (name or "").strip():
        raise BadRequest("The stage needs a name")
    stage.name = name.strip()[:160]
    db.commit()
    return stage


def duplicate_stage(db: Session, member: SagaMember, stage_id: int) -> Stage:
    require_admin(member)
    source = _stage(db, member, stage_id)
    copy = create_stage(db, member, f"{source.name} (copy)")
    for s in source.sets:
        new_set = StageSet(stage_id=copy.id, type=s.type, name=s.name, x=s.x, y=s.y, width=s.width,
                           height=s.height, layer=s.layer, transparent=s.transparent, visibility=dict(s.visibility or {}), config=dict(s.config or {}))
        db.add(new_set)
        db.flush()
        for a in s.actors:
            db.add(StageActor(set_id=new_set.id, resource_id=a.resource_id, sort_order=a.sort_order,
                              position=dict(a.position or {}), visibility=dict(a.visibility or {}),
                              config=dict(a.config or {})))
        new_config = dict(new_set.config)
        new_config["highlight_actor_id"] = None
        new_set.config = new_config
    db.commit()
    return copy


def delete_stage(db: Session, member: SagaMember, stage_id: int) -> None:
    require_admin(member)
    stage = _stage(db, member, stage_id)
    saga = get_saga(db, member.saga_id)
    if saga.live_stage_id == stage.id:
        saga.live_stage_id = None
    db.delete(stage)
    db.commit()


def set_live(db: Session, member: SagaMember, stage_id: int | None) -> Saga:
    require_admin(member)
    saga = get_saga(db, member.saga_id)
    if stage_id is not None:
        _stage(db, member, stage_id)
    saga.live_stage_id = stage_id
    db.commit()
    return saga


# ---------------------------------------------------------------------------
# Sets
# ---------------------------------------------------------------------------


def add_set(db: Session, member: SagaMember, stage_id: int, type_key: str, name: str | None,
            x: int | None, y: int | None, config: dict | None) -> StageSet:
    require_admin(member)
    stage = _stage(db, member, stage_id)
    set_type = get_set_type(type_key)
    width, height = set_type.default_size
    if x is None or y is None:
        # Place below the lowest Set so new Sets don't cover existing ones
        bottom = max((s.y + s.height for s in stage.sets), default=-40)
        x, y = 0, bottom + 40
    layer = max((s.layer for s in stage.sets), default=0) + 1
    stage_set = StageSet(
        stage_id=stage.id, type=set_type.key, name=(name or set_type.name).strip()[:160],
        x=int(x), y=int(y), width=width, height=height, layer=layer,
        visibility=everyone(db, member.saga_id), config=set_type.validate_config(config or {}),
    )
    db.add(stage_set)
    db.commit()
    return stage_set


def update_set(db: Session, member: SagaMember, set_id: int, changes: dict) -> StageSet:
    require_admin(member)
    stage_set = _set(db, member, set_id)
    set_type = get_set_type(stage_set.type)
    for key, value in changes.items():
        if value is None and key != "config":
            continue
        if key == "name":
            stage_set.name = str(value).strip()[:160] or stage_set.name
        elif key == "transparent":
            stage_set.transparent = bool(value)
        elif key in ("x", "y", "layer"):
            setattr(stage_set, key, int(value))
        elif key in ("width", "height"):
            setattr(stage_set, key, max(120, min(20000, int(value))))
        elif key == "visibility":
            stage_set.visibility = check_visibility(db, member.saga_id, value)
        elif key == "config" and value is not None:
            stage_set.config = set_type.validate_config(value, stage_set.config)
    db.commit()
    return stage_set


def delete_set(db: Session, member: SagaMember, set_id: int) -> int:
    require_admin(member)
    stage_set = _set(db, member, set_id)
    stage_id = stage_set.stage_id
    db.delete(stage_set)
    db.commit()
    return stage_id


# ---------------------------------------------------------------------------
# Actors (cards)
# ---------------------------------------------------------------------------


def _ctx(db: Session, member: SagaMember) -> RenderContext:
    return RenderContext(viewer=viewer_for(db, member), ruleset=ruleset_for(db, member.saga_id),
                         secret=settings.jwt_secret_key)


def add_actors(db: Session, member: SagaMember, set_id: int, resource_ids: list[int], hidden: bool = True) -> StageSet:
    require_admin(member)
    stage_set = _set(db, member, set_id)
    set_type = get_set_type(stage_set.type)
    if not set_type.uses_actors:
        raise BadRequest("This Set has no cards")
    ctx = _ctx(db, member)
    order = max((a.sort_order for a in stage_set.actors), default=0)
    for resource_id in resource_ids:
        resource = db.get(Resource, resource_id)
        if resource is None or resource.saga_id != member.saga_id or resource.kind not in set_type.actor_kinds:
            raise BadRequest("Unknown creature")
        order += 1
        db.add(StageActor(
            set_id=stage_set.id, resource_id=resource.id, sort_order=order, position={},
            # New cards start hidden: nothing reaches players by accident (UX-4)
            visibility={"groups": [], "members": []} if hidden else everyone(db, member.saga_id),
            config=set_type.new_actor_config(ctx, stage_set, resource),
        ))
    db.commit()
    db.refresh(stage_set)
    return stage_set


def update_actor(db: Session, member: SagaMember, actor_id: int, changes: dict) -> StageActor:
    require_admin(member)
    actor = _actor(db, member, actor_id)
    set_type = get_set_type(actor.stage_set.type)
    if changes.get("config") is not None:
        actor.config = set_type.validate_actor_config(_ctx(db, member), changes["config"], actor.config)
    if changes.get("position") is not None:
        pos = changes["position"]
        actor.position = {"x": int(pos.get("x", 0)), "y": int(pos.get("y", 0))}
    if changes.get("visibility") is not None:
        actor.visibility = check_visibility(db, member.saga_id, changes["visibility"])
    if changes.get("revealed") is not None:
        actor.visibility = everyone(db, member.saga_id) if changes["revealed"] else {"groups": [], "members": []}
    db.commit()
    return actor


def reveal_all(db: Session, member: SagaMember, set_id: int, revealed: bool) -> StageSet:
    require_admin(member)
    stage_set = _set(db, member, set_id)
    vis = everyone(db, member.saga_id) if revealed else {"groups": [], "members": []}
    for actor in stage_set.actors:
        actor.visibility = dict(vis)
    db.commit()
    return stage_set


def reorder_actors(db: Session, member: SagaMember, set_id: int, actor_ids: list[int]) -> StageSet:
    require_admin(member)
    stage_set = _set(db, member, set_id)
    by_id = {a.id: a for a in stage_set.actors}
    if set(actor_ids) != set(by_id):
        raise BadRequest("The order must list every card of the Set")
    for index, actor_id in enumerate(actor_ids, start=1):
        by_id[actor_id].sort_order = index
    db.commit()
    return stage_set


def delete_actor(db: Session, member: SagaMember, actor_id: int) -> int:
    require_admin(member)
    actor = _actor(db, member, actor_id)
    stage_set = actor.stage_set
    config = dict(stage_set.config or {})
    if config.get("highlight_actor_id") == actor.id:
        config["highlight_actor_id"] = None
        stage_set.config = config
    stage_id = stage_set.stage_id
    db.delete(actor)
    db.commit()
    return stage_id


def actor_stage_id(db: Session, member: SagaMember, actor_id: int) -> int:
    return _actor(db, member, actor_id).stage_set.stage_id


def stages_showing_resource(db: Session, saga_id: int, resource_id: int) -> set[int]:
    rows = db.scalars(
        select(StageSet.stage_id).join(StageActor, StageActor.set_id == StageSet.id)
        .join(Stage, Stage.id == StageSet.stage_id)
        .where(Stage.saga_id == saga_id, StageActor.resource_id == resource_id)
    ).all()
    return set(rows)


# ---------------------------------------------------------------------------
# Grab attention
# ---------------------------------------------------------------------------


def attention(db: Session, member: SagaMember, set_id: int, actor_id: int | None) -> dict:
    """Validate a grab-attention target on the live Stage. Returns the message for the members."""
    require_admin(member)
    saga = get_saga(db, member.saga_id)
    stage_set = _set(db, member, set_id)
    if stage_set.stage_id != saga.live_stage_id:
        raise BadRequest("Grab attention works on the live Stage: make this Stage live first")
    if actor_id is not None and actor_id not in {a.id for a in stage_set.actors}:
        raise NotFound("Card not found")
    return {"type": "attention", "stage_id": stage_set.stage_id, "set_id": stage_set.id, "actor_id": actor_id,
            "set_visibility": stage_set.visibility, "actor_visibility":
                next((a.visibility for a in stage_set.actors if a.id == actor_id), None)}
