"""What a Saga template file carries besides its definitions (the "extras"): what a Saga made its own. Display
templates and fog presets (plan 11), and since plan 41 its EFX environments, its Stages (their Sets, each Set's place,
toolbars, who sees it and its settings) and its character groups (without their characters).

Exported from a Saga (services/saga_templates.export); added to a Saga made from a file or a built-in template, or
that imports a file, where it has none with the same name. Never the Saga's content: characters, items, documents,
locations, relationships, events, pictures, what was put on Sets (cards, Desktop pieces, map tokens, rolls), turns,
which Stage is live. Things a Set's settings point to (member groups, display templates, fog presets) go by name
(set_types/base.TemplateRefs); a Set type says which of its settings go (SetType.template_settings). See
docs/concepts/rulesets.md ("Saga templates").
"""
import copy
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from domain import efx
from domain.stage_layout import LAYOUTS, LayoutError, clean_screen, clean_toolbars
from domain.visibility import Viewer
from models import CharacterGroup, DisplayTemplate, Environment, FogPreset, Group, Saga, Stage, StageSet
from set_types import SET_TYPES, TemplateRefs

MAX_STAGES, MAX_SETS, MAX_ENVIRONMENTS, MAX_GROUPS = 40, 40, 100, 30
_HEX = "0123456789abcdef"


def refs_of(db: Session, saga_id: int) -> TemplateRefs:
    """The Saga's member groups (default ones by key), characters' display templates and fog presets, by id and by
    name (the first of a name wins)."""
    names: dict[str, dict[int, str]] = {
        "member_group": {g.id: g.key or g.name for g in db.scalars(select(Group).where(Group.saga_id == saga_id)).all()},
        "display_template": {t.id: t.name for t in db.scalars(select(DisplayTemplate).where(
            DisplayTemplate.saga_id == saga_id, DisplayTemplate.kind == "character")).all()},
        "fog_preset": {p.id: p.name for p in db.scalars(select(FogPreset).where(FogPreset.saga_id == saga_id)).all()},
    }
    ids: dict[str, dict[str, int]] = {}
    for kind, by_id in names.items():
        ids[kind] = {}
        for item_id in sorted(by_id, reverse=True):
            ids[kind][by_id[item_id]] = item_id
    return TemplateRefs(names=names, ids=ids)


# -- export ---------------------------------------------------------------------


def _without_pictures(layer: Any) -> dict:
    """An environment's layer with its uploaded pictures left out (uploads are the Saga's)."""
    out = copy.deepcopy(layer) if isinstance(layer, dict) else {"effects": []}
    for effect in out.get("effects") or []:
        for spec in efx.EFFECTS.get(effect.get("kind"), {}).get("params", []):
            if spec["type"] == "image" and isinstance(effect.get("params"), dict) and spec["key"] in effect["params"]:
                effect["params"][spec["key"]] = None
    return out


def export_extras(db: Session, saga: Saga) -> dict:
    """The Saga's EFX environments, Stages and character groups, as a file holds them."""
    from services.characters import saga_groups

    refs = refs_of(db, saga.id)
    environments = db.scalars(select(Environment).where(Environment.saga_id == saga.id).order_by(Environment.id)).all()
    env_names = {e.id: e.name for e in environments}
    stages = []
    for stage in db.scalars(select(Stage).where(Stage.saga_id == saga.id).order_by(Stage.sort_order, Stage.id)).all():
        sets = []
        for s in sorted(stage.sets, key=lambda s: (s.layer, s.id)):
            set_type = SET_TYPES.get(s.type)
            if set_type is None:
                continue
            sets.append({
                "type": s.type, "name": s.name, "x": s.x, "y": s.y, "width": s.width, "height": s.height,
                "layer": s.layer, "transparent": bool(s.transparent), "off": bool(s.off),
                "screen": copy.deepcopy(s.screen) if s.screen else None,
                "toolbars": copy.deepcopy(s.toolbars) if s.toolbars else None,
                "visibility": {"groups": refs.names_of("member_group", (s.visibility or {}).get("groups"))},
                "config": set_type.template_config(copy.deepcopy(s.config or {}), refs),
            })
        stages.append({"name": stage.name, "layout": stage.layout, "environment": env_names.get(stage.environment_id),
                       "controls": copy.deepcopy(stage.controls) if stage.controls else None, "sets": sets})
    groups = [{"name": g.name, "player_party": bool(g.player_party), "active": bool(g.active),
               "favorite": bool(g.favorite), "color": g.color} for g in saga_groups(db, saga.id)]
    return {
        "environments": [{"name": e.name, **{layer: _without_pictures(getattr(e, layer)) for layer in efx.LAYERS}}
                         for e in environments],
        "stages": stages,
        "groups": groups,
    }


# -- apply (a new Saga, an import) ------------------------------------------------


def _name(raw: Any, size: int) -> str:
    return " ".join(str(raw or "").split())[:size]


def _int(raw: Any, default: int, low: int, high: int) -> int:
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        return default
    return max(low, min(high, int(raw)))


def apply_environments(db: Session, saga: Saga, raw: dict) -> int:
    taken = {e.name.lower() for e in db.scalars(select(Environment).where(Environment.saga_id == saga.id)).all()}
    added = 0
    for item in (raw.get("environments") or [])[:MAX_ENVIRONMENTS]:
        name = _name(item.get("name"), 80) if isinstance(item, dict) else ""
        if not name or name.lower() in taken or len(taken) >= MAX_ENVIRONMENTS:
            continue
        try:
            layers = {layer: efx.clean_layer(layer, _without_pictures(item.get(layer))) for layer in efx.LAYERS}
        except efx.EfxError:
            continue
        db.add(Environment(saga_id=saga.id, name=name, **layers))
        taken.add(name.lower())
        added += 1
    db.flush()
    return added


def apply_groups(db: Session, saga: Saga, raw: dict) -> int:
    """The file's character groups (its starting groups) the Saga lacks: empty."""
    from domain.display import PALETTE

    existing = db.scalars(select(CharacterGroup).where(CharacterGroup.saga_id == saga.id)).all()
    taken = {g.name.lower() for g in existing}
    order = max((g.sort_order for g in existing), default=0)
    added = 0
    for item in ((raw.get("starting") or {}).get("groups") or [])[:MAX_GROUPS]:
        name = _name(item.get("name"), 120) if isinstance(item, dict) else ""
        if not name or name.lower() in taken:
            continue
        color = str(item.get("color") or "").lower()
        if len(color) != 7 or color[0] != "#" or any(c not in _HEX for c in color[1:]):
            color = PALETTE[(order + added) % len(PALETTE)]
        order += 1
        db.add(CharacterGroup(saga_id=saga.id, name=name, color=color, sort_order=order,
                              player_party=bool(item.get("player_party")), active=bool(item.get("active")),
                              favorite=bool(item.get("favorite"))))
        taken.add(name.lower())
        added += 1
    db.flush()
    return added


def apply_stages(db: Session, saga: Saga, raw: dict) -> int:
    """The file's Stages the Saga lacks (by name), after its others; each Set from its settings (SetType.
    config_from_template), with nothing on it."""
    from services.stages import CONTROLS, admin_context

    stages = raw.get("stages") if isinstance(raw.get("stages"), list) else []
    if not stages:
        return 0
    refs = refs_of(db, saga.id)
    ctx = admin_context(db, saga.id)
    environments = {e.name: e.id for e in db.scalars(select(Environment).where(Environment.saga_id == saga.id)
                                                     .order_by(Environment.id.desc())).all()}
    taken = {s.name.lower() for s in db.scalars(select(Stage).where(Stage.saga_id == saga.id)).all()}
    order = db.scalar(select(func.max(Stage.sort_order)).where(Stage.saga_id == saga.id)) or 0
    added = 0
    for item in stages[:MAX_STAGES]:
        name = _name(item.get("name"), 160) if isinstance(item, dict) else ""
        if not name or name.lower() in taken:
            continue
        controls = item.get("controls")
        if isinstance(controls, dict):
            controls = {k: v for k, v in controls.items() if k in CONTROLS and isinstance(v, bool)} or None
        else:
            controls = None
        order += 1
        stage = Stage(saga_id=saga.id, name=name, sort_order=order,
                      layout=item.get("layout") if item.get("layout") in LAYOUTS else "interface",
                      environment_id=environments.get(item.get("environment")), controls=controls)
        db.add(stage)
        db.flush()
        for raw_set in (item.get("sets") if isinstance(item.get("sets"), list) else [])[:MAX_SETS]:
            set_type = SET_TYPES.get(raw_set.get("type")) if isinstance(raw_set, dict) else None
            if set_type is None:
                continue
            try:
                screen = clean_screen(raw_set["screen"], None) if isinstance(raw_set.get("screen"), dict) else None
            except LayoutError:
                screen = None
            try:
                toolbars = clean_toolbars(raw_set["toolbars"], None) if isinstance(raw_set.get("toolbars"), dict) else None
            except LayoutError:
                toolbars = None
            visibility = raw_set.get("visibility") if isinstance(raw_set.get("visibility"), dict) else {}
            width, height = set_type.default_size
            db.add(StageSet(
                stage_id=stage.id, type=set_type.key, name=_name(raw_set.get("name"), 160) or set_type.name,
                x=_int(raw_set.get("x"), 0, -100000, 100000), y=_int(raw_set.get("y"), 0, -100000, 100000),
                width=_int(raw_set.get("width"), width, 120, 20000), height=_int(raw_set.get("height"), height, 120, 20000),
                layer=_int(raw_set.get("layer"), 0, -1000, 1000),
                transparent=bool(raw_set.get("transparent", set_type.default_transparent)), off=bool(raw_set.get("off")),
                screen=screen, toolbars=toolbars or None,
                visibility={"groups": refs.ids_of("member_group", visibility.get("groups")), "members": []},
                config=set_type.config_from_template(ctx, raw_set.get("config") or {}, refs),
            ))
        db.flush()
        taken.add(name.lower())
        added += 1
    return added
