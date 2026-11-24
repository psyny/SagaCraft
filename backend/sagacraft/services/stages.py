"""Stages, their Sets and actors, the live Stage, and grab attention.

The Stage core knows nothing about Set types beyond the contract in set_types/base.py.
"""
import copy as copy_module
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from domain.visibility import Viewer, can_see, is_shared
from infrastructure.config.settings import settings
from models import Resource, Saga, SagaMember, Stage, StageActor, StageSet
from services.access import check_visibility, default_group_ids, get_saga, member_name, require_admin, viewer_for
from services.errors import BadRequest, Forbidden, NotFound
from services.displays import DisplayBook
from services.resources import ruleset_for
from set_types import SET_TYPES, RenderContext, get_set_type
from domain.stage_layout import LAYOUTS, LayoutError, clean_screen, clean_toolbars


def everyone(db: Session, saga_id: int) -> dict:
    """Visibility for 'all players' (viewers see what players see; admins always see everything)."""
    groups = default_group_ids(db, saga_id)
    return {"groups": sorted(g for k, g in groups.items() if k == "players"), "members": []}


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


class FileBook:
    """For Set types (RenderContext.files): the Saga's uploads (a picture added on the spot)."""

    def __init__(self, db: Session, saga_id: int):
        self.db, self.saga_id = db, saga_id

    def get(self, file_id, category: str):
        from models import StoredFile

        file = self.db.get(StoredFile, file_id) if isinstance(file_id, int) and not isinstance(file_id, bool) else None
        return file if file is not None and file.saga_id == self.saga_id and file.category == category else None


class MemberBook:
    """For Set types (RenderContext.members): each member's name, colour and dice style."""

    def __init__(self, db: Session, saga_id: int):
        self.db, self.saga_id = db, saga_id
        self._all: dict[int, dict] | None = None

    def get(self, member_id: int | None) -> dict:
        if self._all is None:
            from services.access import member_colors

            colors = member_colors(self.db, self.saga_id)
            rows = self.db.scalars(select(SagaMember).where(SagaMember.saga_id == self.saga_id)).all()
            self._all = {m.id: {"name": member_name(m), "color": colors[m.id], "style": m.die_style or "minimal",
                                "role": m.role} for m in rows}
        return self._all.get(member_id or 0) or {"name": "Someone", "color": "#9b92a4", "style": "minimal", "role": None}


def _context(db: Session, saga_id: int, viewer: Viewer) -> RenderContext:
    ruleset = ruleset_for(db, saga_id)
    from services.environments import EfxBook
    from services.events import EventBook
    from services.locations import MapBook
    from services.relationships import RelationshipBook

    return RenderContext(viewer=viewer, ruleset=ruleset, secret=settings.jwt_secret_key,
                         displays=DisplayBook(db, saga_id, ruleset), everyone=everyone(db, saga_id),
                         maps=MapBook(db, ruleset, saga_id), relationships=RelationshipBook(db, saga_id),
                         efx=EfxBook(db, saga_id), events=EventBook(db, saga_id), files=FileBook(db, saga_id),
                         members=MemberBook(db, saga_id))


def admin_context(db: Session, saga_id: int) -> RenderContext:
    """A render context as the DM, with no member (a Saga being made from a template: its Stages' Sets)."""
    return _context(db, saga_id, Viewer(member_id=0, role="admin"))


CONTROLS = ("efx", "actions", "stages")
EFX_LAYERS = ("efx_far", "efx_near", "efx_fore")


def controls_of(stage: Stage) -> dict[str, bool]:
    """The Stage's own controls (plan 33): EFX (the DM switches the environment), Actions (the DM and players run
    the template's actions) and Stages (the DM makes any Stage live); on unless turned off."""
    saved = stage.controls or {}
    return {key: bool(saved.get(key, True)) for key in CONTROLS}


def render_stage(db: Session, stage: Stage, viewer: Viewer, live_stage_id: int | None) -> dict:
    ctx = _context(db, stage.saga_id, viewer)
    sets = []
    for stage_set in sorted(stage.sets, key=lambda s: (s.layer, s.id)):
        if not can_see(viewer, stage_set.visibility) or (stage_set.off and not viewer.is_admin):
            continue
        hidden = not is_shared(stage_set.visibility)
        set_type = SET_TYPES.get(stage_set.type)
        if set_type is None:
            continue
        item = {
            "id": stage_set.id, "type": stage_set.type, "name": stage_set.name,
            "x": stage_set.x, "y": stage_set.y, "width": stage_set.width, "height": stage_set.height,
            "layer": stage_set.layer,
            "screen": clean_screen({}, stage_set.screen),
            "toolbars": stage_set.toolbars or {},
            "transparent": bool(stage_set.transparent),
            "content": set_type.render(ctx, stage_set, list(stage_set.actors)),
        }
        if viewer.is_admin:
            item["off"] = bool(stage_set.off)
            item["hidden"] = hidden
            item["visibility"] = stage_set.visibility or {"groups": [], "members": []}
        sets.append(item)
    controls = controls_of(stage)
    out = {"id": stage.id, "name": stage.name, "is_live": stage.id == live_stage_id, "layout": stage.layout or "canvas",
           "environment_id": stage.environment_id if viewer.is_admin else None, "sets": sets,
           "controls": {"actions": controls["actions"]} if not viewer.is_admin else controls}
    # The DM's EFX control: the environments to switch to (shown when the Stage has an EFX layer Set)
    if viewer.is_admin and controls["efx"] and any(s.type in EFX_LAYERS for s in stage.sets):
        out["efx"] = {"current": stage.environment_id, "environments": ctx.efx.choices()}
    return out


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
    """A new Stage: interface layout (Sets fixed to the screen) until the DM picks canvas; duplicates keep theirs."""
    require_admin(member)
    name = (name or "").strip() or "New stage"
    last = db.scalar(select(func.max(Stage.sort_order)).where(Stage.saga_id == member.saga_id)) or 0
    stage = Stage(saga_id=member.saga_id, name=name[:160], sort_order=last + 1, layout="interface")
    db.add(stage)
    db.commit()
    return stage


def update_stage(db: Session, member: SagaMember, stage_id: int, name: str | None, layout: str | None = None,
                 **changes) -> Stage:
    """Rename a Stage, switch its layout (canvas or interface), pick its environment (EFX; None: none), turn its
    controls on or off ({"efx": bool, "actions": bool})."""
    require_admin(member)
    stage = _stage(db, member, stage_id)
    if changes.get("controls") is not None:
        raw = changes["controls"]
        if not isinstance(raw, dict) or not set(raw) <= set(CONTROLS) or not all(isinstance(v, bool) for v in raw.values()):
            raise BadRequest(f"controls: {{{', '.join(CONTROLS)}: true or false}}")
        stage.controls = {**controls_of(stage), **raw}
    if "environment_id" in changes:
        from services.environments import check_environment

        stage.environment_id = check_environment(db, member.saga_id, changes["environment_id"])
    if name is not None:
        if not name.strip():
            raise BadRequest("The stage needs a name")
        stage.name = name.strip()[:160]
    if layout is not None:
        if layout not in LAYOUTS:
            raise BadRequest(f"layout: one of {list(LAYOUTS)}")
        stage.layout = layout
    db.commit()
    return stage


def order_layers(db: Session, member: SagaMember, stage_id: int, set_ids: list[int]) -> Stage:
    """Command: the Sets from the bottom layer to the top (every Set of the Stage, once)."""
    require_admin(member)
    stage = _stage(db, member, stage_id)
    if sorted(set_ids) != sorted(s.id for s in stage.sets):
        raise BadRequest("Give every Set of the Stage once")
    by_id = {s.id: s for s in stage.sets}
    for layer, set_id in enumerate(set_ids, start=1):
        by_id[set_id].layer = layer
    db.commit()
    return stage


# Temporary files: an actor holding an upload of its own (actor.config["temp_file_id"], e.g. a picture on a Desktop)
# owns it. Deleting the actor, its Set or its Stage deletes the file; duplicating a Stage copies it.


def drop_temp_files(db: Session, actors) -> None:
    from models import StoredFile

    for actor in actors:
        file_id = (actor.config or {}).get("temp_file_id")
        file = db.get(StoredFile, file_id) if isinstance(file_id, int) else None
        if file is not None:
            db.delete(file)


def _copy_temp_file(db: Session, config: dict) -> dict:
    from models import StoredFile

    file_id = config.get("temp_file_id")
    file = db.get(StoredFile, file_id) if isinstance(file_id, int) else None
    if file is None:
        return config
    copy = StoredFile(saga_id=file.saga_id, category=file.category, content_type=file.content_type, size=file.size,
                      width=file.width, height=file.height, data=file.data, created_by_member_id=file.created_by_member_id)
    db.add(copy)
    db.flush()
    return {**config, "temp_file_id": copy.id}


def duplicate_stage(db: Session, member: SagaMember, stage_id: int) -> Stage:
    require_admin(member)
    source = _stage(db, member, stage_id)
    copy = create_stage(db, member, f"{source.name} (copy)")
    copy.layout, copy.environment_id, copy.controls = source.layout, source.environment_id, source.controls
    for s in source.sets:
        new_set = StageSet(stage_id=copy.id, type=s.type, name=s.name, x=s.x, y=s.y, width=s.width,
                           height=s.height, layer=s.layer, transparent=s.transparent, off=bool(s.off), screen=dict(s.screen) if s.screen else None, toolbars=dict(s.toolbars) if s.toolbars else None, visibility=dict(s.visibility or {}), config=dict(s.config or {}))
        db.add(new_set)
        db.flush()
        id_map: dict[int, int] = {}
        for a in s.actors:
            new_actor = StageActor(set_id=new_set.id, resource_id=a.resource_id, sort_order=a.sort_order,
                                   position=dict(a.position or {}), visibility=dict(a.visibility or {}),
                                   config=_copy_temp_file(db, copy_module.deepcopy(a.config or {})))
            db.add(new_actor)
            db.flush()
            id_map[a.id] = new_actor.id
        set_type = SET_TYPES.get(s.type)
        if set_type is not None:
            new_set.config = set_type.copy_config(dict(new_set.config), id_map)  # actor ids changed
    db.commit()
    return copy


def delete_stage(db: Session, member: SagaMember, stage_id: int) -> None:
    require_admin(member)
    stage = _stage(db, member, stage_id)
    saga = get_saga(db, member.saga_id)
    if saga.live_stage_id == stage.id:
        saga.live_stage_id = None
    drop_temp_files(db, [a for s in stage.sets for a in s.actors])
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
    if set_type.backdrop and stage.sets:
        # Behind the other Sets on a canvas: cover them, with a margin
        x0, y0 = min(s.x for s in stage.sets) - 80, min(s.y for s in stage.sets) - 80
        width = max(width, max(s.x + s.width for s in stage.sets) + 80 - x0)
        height = max(height, max(s.y + s.height for s in stage.sets) + 80 - y0)
        x, y = x0, y0
    # Its layer by depth: under every Set of a higher depth (an EFX far background goes to the back)
    depth_of = lambda s: getattr(SET_TYPES.get(s.type), "depth", 2)  # noqa: E731
    above = [s for s in stage.sets if depth_of(s) > set_type.depth]
    if above:
        layer = min(s.layer for s in above)
        for s in above:
            s.layer += 1
    else:
        layer = max((s.layer for s in stage.sets), default=0) + 1
    initial = set_type.initial_config(_ctx(db, member))
    stage_set = StageSet(
        stage_id=stage.id, type=set_type.key, name=(name or set_type.name).strip()[:160],
        x=int(x), y=int(y), width=width, height=height, layer=layer, transparent=set_type.default_transparent,
        screen=clean_screen(set_type.default_screen, None) if set_type.default_screen else None,
        visibility={"groups": [], "members": []} if set_type.private else everyone(db, member.saga_id),
        config=set_type.validate_config(config or {}, initial),
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
        elif key == "off":
            stage_set.off = bool(value)
        elif key in ("x", "y", "layer"):
            setattr(stage_set, key, int(value))
        elif key in ("width", "height"):
            setattr(stage_set, key, max(120, min(20000, int(value))))
        elif key == "visibility":
            stage_set.visibility = check_visibility(db, member.saga_id, value)
        elif key == "screen":
            try:
                stage_set.screen = clean_screen(value, stage_set.screen)
            except LayoutError as exc:
                raise BadRequest(str(exc)) from None
        elif key == "toolbars":
            try:
                stage_set.toolbars = clean_toolbars(value, stage_set.toolbars)
            except LayoutError as exc:
                raise BadRequest(str(exc)) from None
        elif key == "config" and value is not None:
            stage_set.config = set_type.validate_config(value, stage_set.config)
    db.commit()
    return stage_set


def delete_set(db: Session, member: SagaMember, set_id: int) -> int:
    require_admin(member)
    stage_set = _set(db, member, set_id)
    stage_id = stage_set.stage_id
    drop_temp_files(db, stage_set.actors)
    db.delete(stage_set)
    db.commit()
    return stage_id


# ---------------------------------------------------------------------------
# Actors (cards)
# ---------------------------------------------------------------------------


def _ctx(db: Session, member: SagaMember) -> RenderContext:
    return _context(db, member.saga_id, viewer_for(db, member))


def add_actors(db: Session, member: SagaMember, set_id: int, resource_ids: list[int], hidden: bool = True,
               group_ids: list[int] | None = None, tab_id: int | None = None) -> StageSet:
    """Put characters on a Set. Groups are a shortcut: their creatures are added as if picked one by one
    (instanceable ones as many times as their count). Where they go (a tab, instances) is up to the Set type."""
    require_admin(member)
    stage_set = _set(db, member, set_id)
    set_type = get_set_type(stage_set.type)
    if not set_type.uses_actors:
        raise BadRequest("This Set has no cards")
    from services.characters import expand_groups

    picked = [(rid, None) for rid in resource_ids or []] + expand_groups(db, member.saga_id, group_ids or [])
    resources, sources = [], []
    for resource_id, source in picked:
        resource = db.get(Resource, resource_id)
        if resource is None or resource.saga_id != member.saga_id or resource.kind not in set_type.actor_kinds:
            raise BadRequest("Unknown creature")
        resources.append(resource)
        sources.append(source)
    ctx = _ctx(db, member)
    order = max((a.sort_order for a in stage_set.actors), default=0)
    options = {"hidden": hidden, "tab_id": tab_id, "sources": sources}
    for actor in set_type.place_actors(ctx, stage_set, resources, options):
        order += 1
        actor.sort_order = order
        stage_set.actors.append(actor)
    set_type.after_change(ctx, stage_set)
    db.commit()
    db.refresh(stage_set)
    return stage_set


def run_command(db: Session, member: SagaMember, set_id: int, name: str, args: dict) -> StageSet:
    """A Set type's named action (switch tab, next turn...)."""
    require_admin(member)
    stage_set = _set(db, member, set_id)
    set_type = get_set_type(stage_set.type)
    ctx = _ctx(db, member)
    result = set_type.command(ctx, stage_set, name, args or {})
    for actor_id in (result.delete_actor_ids if result else []):
        actor = next((a for a in stage_set.actors if a.id == actor_id), None)
        if actor is not None:
            stage_set.config = set_type.forget_actor(dict(stage_set.config or {}), actor_id)
            drop_temp_files(db, [actor])
            stage_set.actors.remove(actor)
    set_type.after_change(ctx, stage_set)
    db.commit()
    db.refresh(stage_set)
    return stage_set


# -- values on cards: an instance keeps its own; any other card changes the character ----------------


def _instance(actor: StageActor) -> dict | None:
    return (actor.config or {}).get("instance")


def _save_instance_values(db: Session, member: SagaMember, actor: StageActor, changes: dict) -> None:
    from domain.ruleset import AttributeValueError, validate_block

    resource = actor.resource
    type_def = ruleset_for(db, member.saga_id).def_for(resource)
    by_key = {a.key: a for a in type_def.attributes}
    config = copy_module.deepcopy(actor.config or {})
    values = config.setdefault("instance", {}).setdefault("values", {})
    for key, raw in changes.items():
        attr = by_key.get(key)
        # An instance has its own current values; who it is (name, picture, links) stays the character's
        if attr is None or attr.type not in ("number", "counter", "boolean", "choice", "text", "rich_text"):
            raise BadRequest(f"'{key}' can't change on an instance")
        if key == "name":
            raise BadRequest("An instance keeps its character's name")
        try:
            values[key] = validate_block(attr, raw, attr.name)
        except AttributeValueError as exc:
            raise BadRequest(str(exc)) from None
    actor.config = config
    db.commit()


def change_actor_counter(db: Session, member: SagaMember, actor_id: int, key: str, delta: float | None,
                         current: float | None) -> StageActor:
    """Command: change_counter on a card (e.g. HP -7): the instance's own value, or the character's."""
    require_admin(member)
    actor = _actor(db, member, actor_id)
    if actor.resource is None:
        raise BadRequest("This card has no character")
    if not _instance(actor):
        from services.resources import change_counter

        change_counter(db, member, actor.resource_id, key, delta, current)
        return actor
    from set_types.actors_scene import actor_values

    value = dict(actor_values(actor).get(key) or {})
    if "current" not in value:
        raise BadRequest(f"'{key}' is not a counter")
    if current is not None:
        value["current"] = current
    elif delta is not None:
        value["current"] = value["current"] + delta
    else:
        raise BadRequest("Give a delta or a current value")
    _save_instance_values(db, member, actor, {key: value})
    return actor


def update_actor_values(db: Session, member: SagaMember, actor_id: int, attributes: dict) -> StageActor:
    """Values typed on a card (e.g. initiative in the order tray): the instance's own, or the character's."""
    require_admin(member)
    actor = _actor(db, member, actor_id)
    if actor.resource is None:
        raise BadRequest("This card has no character")
    if _instance(actor):
        _save_instance_values(db, member, actor, attributes or {})
    else:
        from services.resources import update_resource

        update_resource(db, member, actor.resource_id, attributes or {}, None)
    return actor


def actor_changed_stages(db: Session, member: SagaMember, actor: StageActor) -> set[int]:
    """Stages to refresh after a card's values changed: the instance's Stage, or every Stage showing the character."""
    if _instance(actor):
        return {actor.stage_set.stage_id}
    return stages_showing_resource(db, member.saga_id, actor.resource_id)


def delete_actor(db: Session, member: SagaMember, actor_id: int) -> int:
    require_admin(member)
    actor = _actor(db, member, actor_id)
    stage_set = actor.stage_set
    set_type = SET_TYPES.get(stage_set.type)
    if set_type is not None:
        stage_set.config = set_type.forget_actor(dict(stage_set.config or {}), actor.id)
    stage_id = stage_set.stage_id
    drop_temp_files(db, [actor])
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


def attention(db: Session, member: SagaMember, set_id: int, actor_id: int | None, target: dict | None = None) -> dict:
    """Validate a grab-attention target on the live Stage: the Set, one of its actors, or a target of the Set
    type's own (map tiles). Returns the message for the members."""
    require_admin(member)
    saga = get_saga(db, member.saga_id)
    stage_set = _set(db, member, set_id)
    if stage_set.stage_id != saga.live_stage_id:
        raise BadRequest("Grab attention works on the live Stage: make this Stage live first")
    if actor_id is not None and actor_id not in {a.id for a in stage_set.actors}:
        raise NotFound("Card not found")
    if target is not None:
        target = get_set_type(stage_set.type).attention_target(_ctx(db, member), stage_set, target)
    return {"type": "attention", "stage_id": stage_set.stage_id, "set_id": stage_set.id, "actor_id": actor_id,
            "target": target,
            "set_visibility": stage_set.visibility, "actor_visibility":
                next((a.visibility for a in stage_set.actors if a.id == actor_id), None)}


# Pings: a member points at a tile of a map Set on the live Stage (live only, nothing stored)
def token_drag(db: Session, member: SagaMember, set_id: int, token_id: Any, tile: Any, dropped: bool = False) -> dict | None:
    """The DM dragging a token on a map Set (plan 39): the tile it would land on now (None: the drag ended), for
    whoever would see that token there (services/realtime.Hub.token_drag decides, per member). Nothing is saved: the
    drop is the map's `tokens.move`. Off the live Stage (the DM rehearsing) nobody else sees it: None."""
    from domain import maps as map_rules
    from services.locations import map_row

    if member.role != "admin":
        raise Forbidden("The DM moves tokens")
    saga = get_saga(db, member.saga_id)
    stage_set = _set(db, member, set_id)
    if stage_set.type != "world_map":
        raise BadRequest("Tokens are on maps")
    if stage_set.stage_id != saga.live_stage_id:
        return None
    config = stage_set.config or {}
    locations = [a for a in stage_set.actors if a.resource is not None]
    current = next((a for a in locations if a.resource_id == config.get("current")), locations[0] if locations else None)
    if current is None:
        raise BadRequest("No location on this map")
    whole = map_rules.normalize(map_row(db, current.resource).data)
    token = next((t for layer in whole["layers"] for t in layer["tokens"] if t["id"] == str(token_id)), None)
    if token is None:
        raise BadRequest("That token isn't on this map")
    cell = None
    if tile is not None:
        try:
            cell = list(map_rules._tile(tile))
        except map_rules.MapError as exc:
            raise BadRequest(str(exc)) from None
        if not map_rules.in_grid(whole["grid"], tuple(cell)):
            raise BadRequest("That tile isn't on the map")
    return {"type": "token_drag", "stage_id": stage_set.stage_id, "set_id": stage_set.id, "location_id": current.resource_id,
            "token": token["id"], "tile": cell, "origin": list(token["tile"]), "member_id": member.id,
            "dropped": bool(dropped) and cell is None,  # the end of a drag that moved it (else: put back, or a cancel)
            "set_visibility": stage_set.visibility}


PING_EVERY = 0.5  # seconds between one member's pings
_last_ping: dict[tuple[int, int], float] = {}


def ping(db: Session, member: SagaMember, set_id: int, tile: Any) -> dict:
    """Validate a ping (players and the DM, not viewers; a map Set of the live Stage they see; a tile of the shown
    location). Returns the message for whoever sees the Set."""
    import time

    from domain import maps as map_rules
    from services.access import member_colors

    if member.role not in ("admin", "player"):
        raise Forbidden("Viewers don't ping")
    saga = get_saga(db, member.saga_id)
    stage_set = _set(db, member, set_id)
    viewer = viewer_for(db, member)
    if stage_set.stage_id != saga.live_stage_id or not can_see(viewer, stage_set.visibility) or (stage_set.off and not viewer.is_admin):
        raise NotFound("Set not found")
    if stage_set.type != "world_map":
        raise BadRequest("Pings go on maps")
    config = stage_set.config or {}
    locations = [a for a in stage_set.actors if a.resource is not None]
    current = next((a for a in locations if a.resource_id == config.get("current")), locations[0] if locations else None)
    if current is None:
        raise BadRequest("No location on this map")
    from services.locations import map_row

    grid = map_rules.normalize(map_row(db, current.resource).data)["grid"]
    try:
        cell = list(map_rules._tile(tile))
    except map_rules.MapError as exc:
        raise BadRequest(str(exc)) from None
    if not map_rules.in_grid(grid, tuple(cell)):
        raise BadRequest("That tile isn't on the map")
    now = time.monotonic()
    key = (member.saga_id, member.id)
    if now - _last_ping.get(key, 0) < PING_EVERY:
        raise BadRequest("One ping at a time")
    _last_ping[key] = now
    return {"type": "ping", "stage_id": stage_set.stage_id, "set_id": stage_set.id, "location_id": current.resource_id,
            "tile": cell, "member_id": member.id, "name": member_name(member),
            "color": member_colors(db, member.saga_id)[member.id], "set_visibility": stage_set.visibility}


def act(db: Session, member: SagaMember, set_id: int, name: str, args: dict) -> StageSet:
    """A member acting on a Set (the dice tray): players and the DM (not viewers); players on the live Stage's Sets
    they see; the DM anywhere (rehearsing in Play)."""
    if member.role not in ("admin", "player"):
        raise Forbidden("Viewers watch")
    stage_set = _set(db, member, set_id)
    viewer = viewer_for(db, member)
    if not viewer.is_admin:
        saga = get_saga(db, member.saga_id)
        if stage_set.stage_id != saga.live_stage_id or not can_see(viewer, stage_set.visibility) or stage_set.off:
            raise NotFound("Set not found")
    ctx = _context(db, member.saga_id, viewer)
    get_set_type(stage_set.type).act(ctx, stage_set, member.id, name, args or {})
    db.commit()
    db.refresh(stage_set)
    return stage_set
