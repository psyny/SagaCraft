"""Display templates (how characters are displayed), each type's default template, and character sheets.

The rules live in domain/display.py; this module loads and saves templates and renders sheets and previews.
See docs/implementation/04-display-templates.md.
"""
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from infrastructure.config.settings import settings
from domain import display
from domain.ruleset import AttributeDef, Ruleset, TypeDef
from domain.visibility import Viewer, rule_allows
from models import DisplayTemplate, Resource, Saga, SagaMember, StageSet
from services.access import get_saga, require_admin, viewer_for
from services.errors import BadRequest, NotFound
from services.resources import _get as get_resource_row
from services.resources import can_see_resource, controller_ids, player_name, ruleset_for, shown_name
from services.security import signed_file_url

KIND = "character"  # the only kind with templates for now


def _ensure(db: Session, saga: Saga, ruleset: Ruleset, kind: str = KIND) -> None:
    """First use: one built-in template per type of the kind, set as that type's default."""
    defaults = dict(saga.display_defaults or {})
    kind_defaults = dict(defaults.get(kind) or {})
    existing = {t.id for t in db.scalars(select(DisplayTemplate).where(DisplayTemplate.saga_id == saga.id)).all()}
    changed = False
    for (type_kind, type_key), type_def in ruleset.types.items():
        if type_kind != kind or kind_defaults.get(type_key) in existing:
            continue
        template = DisplayTemplate(saga_id=saga.id, kind=kind, name=type_def.name,
                                   config=display.builtin_config(type_def))
        db.add(template)
        db.flush()
        existing.add(template.id)
        kind_defaults[type_key] = template.id
        changed = True
    if changed:
        defaults[kind] = kind_defaults
        saga.display_defaults = defaults
        db.commit()


class DisplayBook:
    """A Saga's templates, loaded once per render (Stages render many cards)."""

    def __init__(self, db: Session, saga_id: int, ruleset: Ruleset):
        saga = get_saga(db, saga_id)
        _ensure(db, saga, ruleset)
        self.ruleset = ruleset
        self.templates = {t.id: t for t in db.scalars(select(DisplayTemplate).where(DisplayTemplate.saga_id == saga_id)).all()}
        self.defaults: dict = dict(saga.display_defaults or {})

    def template_for(self, resource: Resource, override: dict | None = None) -> tuple[int | None, str, dict]:
        """(id, name, config) of the template for a resource: the Set's choice for its type, else the default."""
        for template_id in ((override or {}).get(resource.type), (self.defaults.get(resource.kind) or {}).get(resource.type)):
            template = self.templates.get(template_id) if template_id is not None else None
            if template is not None and template.kind == resource.kind:
                return template.id, template.name, template.config or {}
        type_def = self.ruleset.type_def(resource.kind, resource.type)
        return None, type_def.name, display.builtin_config(type_def)


# -- templates ----------------------------------------------------------------


def _out(template: DisplayTemplate, defaults: dict) -> dict:
    default_for = sorted(t for t, tid in (defaults.get(template.kind) or {}).items() if tid == template.id)
    return {"id": template.id, "kind": template.kind, "name": template.name, "config": template.config or {"modes": {}},
            "default_for": default_for,
            "created_at": template.created_at.isoformat() if template.created_at else None}


def _template(db: Session, member: SagaMember, template_id: int) -> DisplayTemplate:
    template = db.get(DisplayTemplate, template_id)
    if template is None or template.saga_id != member.saga_id:
        raise NotFound("Template not found")
    return template


def list_templates(db: Session, member: SagaMember) -> dict:
    require_admin(member)
    saga = get_saga(db, member.saga_id)
    _ensure(db, saga, ruleset_for(db, member.saga_id))
    templates = db.scalars(select(DisplayTemplate).where(DisplayTemplate.saga_id == saga.id)
                           .order_by(DisplayTemplate.name)).all()
    defaults = saga.display_defaults or {}
    return {
        "templates": [_out(t, defaults) for t in templates],
        "defaults": defaults,
        "limits": {"max_highlight": display.MAX_HIGHLIGHT},
    }


def create_template(db: Session, member: SagaMember, name: str, copy_from: int | None) -> dict:
    require_admin(member)
    name = (name or "").strip()[:120] or "New template"
    if copy_from is not None:
        config = dict(_template(db, member, copy_from).config or {})
    else:
        config = {"modes": {}}  # blank: the DM sees everything, players nothing, until set
    template = DisplayTemplate(saga_id=member.saga_id, kind=KIND, name=name, config=config)
    db.add(template)
    db.commit()
    return _out(template, get_saga(db, member.saga_id).display_defaults or {})


def update_template(db: Session, member: SagaMember, template_id: int, name: str | None, modes: dict | None) -> dict:
    require_admin(member)
    template = _template(db, member, template_id)
    if name is not None:
        if not name.strip():
            raise BadRequest("A template needs a name")
        template.name = name.strip()[:120]
    if modes is not None:
        try:
            template.config = display.merge_config(template.config, {"modes": modes})
        except display.TemplateError as exc:
            raise BadRequest(str(exc)) from None
    db.commit()
    return _out(template, get_saga(db, member.saga_id).display_defaults or {})


def delete_template(db: Session, member: SagaMember, template_id: int) -> None:
    require_admin(member)
    template = _template(db, member, template_id)
    defaults = get_saga(db, member.saga_id).display_defaults or {}
    if template.id in (defaults.get(template.kind) or {}).values():
        raise BadRequest("This template is a default: pick another default first")
    db.delete(template)  # Sets that used it fall back to the default
    db.commit()


def set_default(db: Session, member: SagaMember, kind: str, type_key: str, template_id: int) -> dict:
    require_admin(member)
    ruleset = ruleset_for(db, member.saga_id)
    if (kind, type_key) not in ruleset.types:
        raise BadRequest(f"Unknown type {kind}/{type_key}")
    template = _template(db, member, template_id)
    if template.kind != kind:
        raise BadRequest("This template is for another kind")
    saga = get_saga(db, member.saga_id)
    defaults = dict(saga.display_defaults or {})
    defaults[kind] = {**(defaults.get(kind) or {}), type_key: template.id}
    saga.display_defaults = defaults
    db.commit()
    return defaults


def stages_with_cards(db: Session, saga_id: int) -> set[int]:
    """Stages that show characters through templates (for real-time updates after a template change)."""
    from models import Stage

    rows = db.scalars(select(StageSet.stage_id).join(Stage, Stage.id == StageSet.stage_id)
                      .where(Stage.saga_id == saga_id, StageSet.type == "creature_panel")).all()
    return set(rows)


# -- sheets -------------------------------------------------------------------


def _describer(db: Session, viewer: Viewer, ruleset: Ruleset, saga_id: int):
    """Turns references into names the viewer may see (members, items...)."""
    from models import User

    def names_of_resources(ids: list[int]) -> list[str]:
        rows = db.scalars(select(Resource).where(Resource.saga_id == saga_id, Resource.id.in_(ids))).all()
        return [shown_name(viewer, r, controller_ids(ruleset, r)) or "???"
                for r in rows if can_see_resource(viewer, ruleset, r)]

    def names_of_members(ids: list[int]) -> list[str]:
        rows = db.execute(select(User.display_name).join(SagaMember, SagaMember.user_id == User.id)
                          .where(SagaMember.saga_id == saga_id, SagaMember.id.in_(ids))).all()
        return [r[0] for r in rows]

    def describe(attr: AttributeDef, value: Any) -> Any:
        if value is None:
            return None
        if attr.type == "member_ref":
            return names_of_members(value if isinstance(value, list) else [value])
        if attr.type == "resource_ref":
            return names_of_resources(value if isinstance(value, list) else [value])
        if attr.type == "list":
            if (attr.of or {}).get("type") == "resource_ref":
                return names_of_resources([int(v) for v in value])
            if (attr.of or {}).get("type") == "member_ref":
                return names_of_members([int(v) for v in value])
            return [str(v) for v in value]
        return value

    return describe


def _picture(type_def: TypeDef, values: dict) -> dict | None:
    portrait_attr = next((a for a in type_def.attributes if a.type == "image"), None)
    portrait = values.get(portrait_attr.key) if portrait_attr else None
    if portrait and portrait.get("file_id"):
        return {"url": signed_file_url(portrait["file_id"]), "face": portrait.get("face")}
    return None


def render_sheet(db: Session, viewer: Viewer, ruleset: Ruleset, book: DisplayBook, resource: Resource,
                 override: dict | None = None, config: dict | None = None) -> dict:
    """A character's sheet for one viewer, in both sheet modes (the client switches between them)."""
    type_def = ruleset.type_def(resource.kind, resource.type)
    template_id, template_name, template_config = book.template_for(resource, override)
    if config is not None:
        template_config = config
    values = resource.attributes or {}
    controllers = controller_ids(ruleset, resource)
    controls = viewer.member_id in controllers
    describe = _describer(db, viewer, ruleset, resource.saga_id)

    def items(mode: str) -> list[dict]:
        result = []
        for attr in type_def.attributes:
            if not display.applies(mode, attr):
                continue
            dm = display.value_view(template_config, mode, attr, "dm")
            player = display.value_view(template_config, mode, attr, "player")
            if viewer.is_admin:
                mine = dm
            elif player["display_on"] == "hidden" and controls and rule_allows(viewer, attr.view, controllers):
                mine = dm  # their own character: what the ruleset lets them see, even if players' view hides it
            else:
                mine = player
            if mine["display_on"] == "hidden" and not viewer.is_admin:
                continue
            result.append(display.render_value(
                attr, values.get(attr.key), mine, player if viewer.is_admin else None, admin=viewer.is_admin,
                secret=settings.jwt_secret_key, seed=f"{resource.id}:{attr.key}", describe=describe))
        return result

    informative = items("informative")
    sheet = {
        "resource_id": resource.id,
        "name": shown_name(viewer, resource, controllers),
        "type": resource.type,
        "type_name": type_def.name,
        "picture": _picture(type_def, values),
        "template": {"id": template_id, "name": template_name},
        "immersive": items("immersive"),
        "informative": {
            "highlight": [i for i in informative if i["display_on"] == "highlight"],
            "body": [i for i in informative if i["display_on"] != "highlight"],
        },
    }
    if viewer.is_admin:
        sheet["real_name"] = resource.name
        sheet["player_name"] = player_name(resource)
    return sheet


def sheet(db: Session, member: SagaMember, resource_id: int, set_id: int | None) -> dict:
    ruleset = ruleset_for(db, member.saga_id)
    viewer = viewer_for(db, member)
    resource = get_resource_row(db, member.saga_id, resource_id)
    if not can_see_resource(viewer, ruleset, resource):
        # A character revealed on the live Stage can be opened from its card even if its page isn't shared
        if not _shown_on_live_stage(db, member, viewer, resource.id):
            raise NotFound("Resource not found")
    override = None
    if set_id is not None:
        stage_set = db.get(StageSet, set_id)
        if stage_set is not None and stage_set.stage.saga_id == member.saga_id:
            override = (stage_set.config or {}).get("templates")
    return render_sheet(db, viewer, ruleset, DisplayBook(db, member.saga_id, ruleset), resource, override)


def _shown_on_live_stage(db: Session, member: SagaMember, viewer: Viewer, resource_id: int) -> bool:
    from domain.visibility import can_see

    saga = get_saga(db, member.saga_id)
    if saga.live_stage_id is None:
        return False
    sets = db.scalars(select(StageSet).where(StageSet.stage_id == saga.live_stage_id)).all()
    return any(can_see(viewer, s.visibility) and any(a.resource_id == resource_id and can_see(viewer, a.visibility)
                                                     for a in s.actors) for s in sets)


# -- preview ------------------------------------------------------------------


def preview(db: Session, member: SagaMember, template_id: int, resource_id: int) -> dict:
    """What a character looks like with this template, for the DM and for a plain player (no custom groups)."""
    require_admin(member)
    from services.access import default_group_ids
    from set_types import RenderContext, get_set_type

    template = _template(db, member, template_id)
    resource = get_resource_row(db, member.saga_id, resource_id)
    if resource.kind != template.kind:
        raise BadRequest("This template is for another kind")
    ruleset = ruleset_for(db, member.saga_id)
    book = DisplayBook(db, member.saga_id, ruleset)
    players_group = default_group_ids(db, member.saga_id).get("players")
    viewers = {
        "dm": viewer_for(db, member),
        "player": Viewer(member_id=0, role="player", group_ids=frozenset({players_group} if players_group else set())),
    }
    panel = get_set_type("creature_panel")
    result: dict = {"cards": {}, "sheet": {}}
    for view, viewer in viewers.items():
        ctx = RenderContext(viewer=viewer, ruleset=ruleset, secret=settings.jwt_secret_key, displays=book)
        result["cards"][view] = {
            style: panel.preview_card(ctx, resource, template.config or {}, style) for style in display.CARD_MODES
        }
        result["sheet"][view] = render_sheet(db, viewer, ruleset, book, resource, config=template.config or {})
    return result
