"""Display templates (how characters and items are displayed), each type's default template, and sheets.
Items use the informative sheet only (their page and view).

The rules live in domain/display.py; this module loads and saves templates and renders sheets and previews.
See docs/implementation/04-display-templates.md.
"""
import copy
from typing import Any

from sqlalchemy import func, select
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

KIND = "character"
KINDS = ("character", "item")  # kinds with display templates


def _ensure(db: Session, saga: Saga, ruleset: Ruleset, kind: str = KIND) -> None:
    """First use: the Saga template's categories (each with its built-in template), then one built-in template
    per type still without a default."""
    from services.characters import ensure_template

    ensure_template(db, saga)
    defaults = dict(saga.display_defaults or {})
    kind_defaults = dict(defaults.get(kind) or {})
    existing = {t.id for t in db.scalars(select(DisplayTemplate).where(DisplayTemplate.saga_id == saga.id)).all()}
    changed = False
    for (type_kind, type_key), type_def in ruleset.types.items():
        if type_kind != kind or kind_defaults.get(type_key) in existing:
            continue
        template = DisplayTemplate(saga_id=saga.id, kind=kind, name=type_def.name,
                                   config=display.builtin_config(type_def, display.PALETTE[len(existing) % len(display.PALETTE)]))
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
    """A Saga's templates, categories and groups, loaded once per render (Stages render many cards)."""

    def __init__(self, db: Session, saga_id: int, ruleset: Ruleset):
        from services.characters import saga_categories, saga_groups

        saga = get_saga(db, saga_id)
        for kind in KINDS:
            _ensure(db, saga, ruleset, kind)
        self.ruleset = ruleset
        self.templates = {t.id: t for t in db.scalars(select(DisplayTemplate).where(DisplayTemplate.saga_id == saga_id)).all()}
        self.defaults: dict = dict(saga.display_defaults or {})
        self.categories = {c.id: c for c in saga_categories(db, saga_id)}
        self.groups = saga_groups(db, saga_id)
        self.groups_by_id = {g.id: g for g in self.groups}
        self.groups_of: dict[int, list] = {}
        # Player parties first, then favorites and the DM's order: a character's "first group"
        for group in sorted(self.groups, key=lambda g: not g.player_party):
            for link in group.members:
                self.groups_of.setdefault(link.resource_id, []).append(group)

    def category(self, resource: Resource):
        return self.categories.get(resource.category_id) if resource.category_id is not None else None

    def group(self, resource: Resource, source_id: int | None = None):
        """A card's group: the one it was added with (if it still holds the character), else its first."""
        groups = self.groups_of.get(resource.id) or []
        source = self.groups_by_id.get(source_id) if source_id is not None else None
        if source is not None and source in groups:
            return source
        return groups[0] if groups else None

    def render(self, viewer: Viewer, resource: Resource, values: dict, config: dict, mode: str, seed: str, *,
               name: str | None, group=None, extra_keys: set[str] | None = None, describe=None) -> list[dict]:
        """A character's elements in one display mode, for one viewer, every region in order. Players get only
        their view's lists (plus `extra_keys` from the DM's, for a character's controllers)."""
        type_def = self.ruleset.type_def(resource.kind, resource.type)
        attributes = {a.key: a for a in type_def.attributes}
        category = self.category(resource)
        config = display.upgrade(config)
        colors = {"theme": None, "template": config.get("color") or display.DEFAULT_COLOR,
                  "group": group.color if group is not None else None}
        system = {"@name": name, "@category": category.name if category is not None else type_def.name,
                  "@group": group.name if group is not None else None}
        if viewer.is_admin:
            regions = display.view_regions(config, mode, "dm")
            players = display.placed(config, mode, "player")
        elif extra_keys:
            regions, players = display.with_extras(config, mode, extra_keys), {}
        else:
            regions, players = display.view_regions(config, mode, "player"), {}
        items = []
        for region, elements in regions.items():
            for e in elements:
                attr = attributes.get(e["key"])
                if attr is None and e["key"] not in display.SYSTEM:
                    continue  # a value of another type (templates are shared by types)
                if attr is not None and not display.applies(mode, attr):
                    continue
                value = values.get(attr.key) if attr is not None else system[e["key"]]
                items.append(display.render_element(
                    e, region, attr, value, players.get(e["key"]), admin=viewer.is_admin, secret=settings.jwt_secret_key,
                    seed=f"{seed}:{e['key']}", colors=colors, describe=describe))
        return items

    def template_for(self, resource: Resource, override: dict | None = None) -> tuple[int | None, str, dict]:
        """(id, name, config) of the template for a resource: the Set's choice for its category (older Sets: its
        type), else the category's default, else the type's."""
        override = override or {}
        category_key = str(resource.category_id) if resource.category_id is not None else None
        candidates = (
            override.get(category_key) if category_key else None,
            override.get(resource.type),
            (self.defaults.get("categories") or {}).get(category_key) if category_key else None,
            (self.defaults.get(resource.kind) or {}).get(resource.type),
        )
        for template_id in candidates:
            template = self.templates.get(template_id) if template_id is not None else None
            if template is not None and template.kind == resource.kind:
                return template.id, template.name, template.config or {}
        type_def = self.ruleset.type_def(resource.kind, resource.type)
        return None, type_def.name, display.builtin_config(type_def)

    def template_color(self, template_id: int | None) -> str:
        template = self.templates.get(template_id) if template_id is not None else None
        return display.upgrade(template.config if template else None).get("color") or display.DEFAULT_COLOR


# -- templates ----------------------------------------------------------------


def _category_defaults(db: Session, saga: Saga) -> dict[int, int | None]:
    """The template each category uses by default: its own, else its type's built-in default."""
    from services.characters import saga_categories

    defaults = saga.display_defaults or {}
    own = defaults.get("categories") or {}
    by_type = defaults.get(KIND) or {}
    return {c.id: own.get(str(c.id), by_type.get(c.type)) for c in saga_categories(db, saga.id)}


def _out(template: DisplayTemplate, category_defaults: dict[int, int | None]) -> dict:
    default_for = sorted(cid for cid, tid in category_defaults.items() if tid == template.id)
    return {"id": template.id, "kind": template.kind, "name": template.name, "config": display.upgrade(template.config),
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
    for kind in KINDS:
        _ensure(db, saga, ruleset_for(db, member.saga_id), kind)
    templates = db.scalars(select(DisplayTemplate).where(DisplayTemplate.saga_id == saga.id)
                           .order_by(DisplayTemplate.name)).all()
    defaults = saga.display_defaults or {}
    category_defaults = _category_defaults(db, saga)
    return {
        "templates": [_out(t, category_defaults) for t in templates],
        "defaults": defaults,
        "category_defaults": {str(k): v for k, v in category_defaults.items()},
        "limits": {"max_header": display.MAX_HEADER, "region_limits": display.REGION_LIMITS},
    }


def create_template(db: Session, member: SagaMember, name: str, copy_from: int | None, kind: str = KIND) -> dict:
    require_admin(member)
    if kind not in KINDS:
        raise BadRequest(f"Templates are for {list(KINDS)}")
    name = (name or "").strip()[:120] or "New template"
    count = db.scalar(select(func.count()).select_from(DisplayTemplate).where(DisplayTemplate.saga_id == member.saga_id)) or 0
    if copy_from is not None:
        source = _template(db, member, copy_from)
        kind = source.kind
        config = copy.deepcopy(display.upgrade(source.config))
    else:
        # Blank: the DM sees every value, players only the names, until the DM adds them
        config = display.blank_config(_kind_attributes(ruleset_for(db, member.saga_id), kind),
                                      display.PALETTE[count % len(display.PALETTE)])
    template = DisplayTemplate(saga_id=member.saga_id, kind=kind, name=name, config=config)
    db.add(template)
    db.commit()
    return _out(template, _category_defaults(db, get_saga(db, member.saga_id)))


def _kind_attributes(ruleset: Ruleset, kind: str = KIND) -> list[AttributeDef]:
    """Every attribute of the kind's types, once each, in ruleset order (a template serves every type)."""
    seen: dict[str, AttributeDef] = {}
    for (type_kind, _), type_def in ruleset.types.items():
        if type_kind == kind:
            for attr in type_def.attributes:
                seen.setdefault(attr.key, attr)
    return list(seen.values())


def update_template(db: Session, member: SagaMember, template_id: int, name: str | None, modes: dict | None,
                    color: str | None = None) -> dict:
    require_admin(member)
    template = _template(db, member, template_id)
    if name is not None:
        if not name.strip():
            raise BadRequest("A template needs a name")
        template.name = name.strip()[:120]
    if modes is not None or color is not None:
        changes: dict = {}
        if modes is not None:
            changes["modes"] = modes
        if color is not None:
            changes["color"] = color
        attributes = {a.key: a for a in _kind_attributes(ruleset_for(db, member.saga_id), template.kind)}
        try:
            template.config = display.merge_config(template.config, changes, attributes)
        except display.TemplateError as exc:
            raise BadRequest(str(exc)) from None
    db.commit()
    return _out(template, _category_defaults(db, get_saga(db, member.saga_id)))


def delete_template(db: Session, member: SagaMember, template_id: int) -> None:
    require_admin(member)
    template = _template(db, member, template_id)
    saga = get_saga(db, member.saga_id)
    defaults = saga.display_defaults or {}
    if template.id in (defaults.get(template.kind) or {}).values() or template.id in _category_defaults(db, saga).values():
        raise BadRequest("This template is a default: pick another default first")
    db.delete(template)  # Sets that used it fall back to the default
    db.commit()


def set_default(db: Session, member: SagaMember, kind: str, type_key: str | None, template_id: int | None,
                category_id: int | None = None) -> dict:
    """A category's default template (what the DM picks; null: follow its type's), or a type's built-in one."""
    require_admin(member)
    saga = get_saga(db, member.saga_id)
    defaults = dict(saga.display_defaults or {})
    template = _template(db, member, template_id) if template_id is not None else None
    if template is not None and template.kind != kind:
        raise BadRequest("This template is for another kind")
    if category_id is not None:
        from services.characters import category_of

        category = category_of(db, member.saga_id, category_id)
        own = dict(defaults.get("categories") or {})
        if template is None:
            own.pop(str(category.id), None)
        else:
            own[str(category.id)] = template.id
        defaults["categories"] = own
    else:
        ruleset = ruleset_for(db, member.saga_id)
        if (kind, type_key) not in ruleset.types:
            raise BadRequest(f"Unknown type {kind}/{type_key}")
        if template is None:
            raise BadRequest("Pick a template")
        defaults[kind] = {**(defaults.get(kind) or {}), type_key: template.id}
    saga.display_defaults = defaults
    db.commit()
    return defaults


def stages_with_cards(db: Session, saga_id: int) -> set[int]:
    """Stages that show characters through templates (for real-time updates after a template change)."""
    from models import Stage

    rows = db.scalars(select(StageSet.stage_id).join(Stage, Stage.id == StageSet.stage_id)
                      .where(Stage.saga_id == saga_id, StageSet.type == "actors_scene")).all()
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
    portrait_attr = type_def.picture()
    portrait = values.get(portrait_attr.key) if portrait_attr else None
    if portrait and portrait.get("file_id"):
        return {"url": signed_file_url(portrait["file_id"]), "face": portrait.get("face")}
    return None


def render_sheet(db: Session, viewer: Viewer, ruleset: Ruleset, book: DisplayBook, resource: Resource,
                 override: dict | None = None, config: dict | None = None, instance: dict | None = None,
                 actor_id: int | None = None, source_group: int | None = None) -> dict:
    """A character's sheet for one viewer, in both sheet modes (the client switches between them).
    For an instance (a Stage actor of an instanceable character), its own values and number."""
    type_def = ruleset.type_def(resource.kind, resource.type)
    template_id, template_name, template_config = book.template_for(resource, override)
    if config is not None:
        template_config = config
    values = {**(resource.attributes or {}), **((instance or {}).get("values") or {})}
    seed_base = f"{resource.id}:{actor_id}" if instance else f"{resource.id}"
    controllers = controller_ids(ruleset, resource)
    describe = _describer(db, viewer, ruleset, resource.saga_id)
    # Their own character: what the ruleset lets them see, even where the players' view leaves it out
    extra = None
    if not viewer.is_admin and viewer.member_id in controllers:
        extra = {a.key for a in type_def.attributes if rule_allows(viewer, a.view, controllers)}
    name = shown_name(viewer, resource, controllers)
    number = (instance or {}).get("number")
    shown = f"{name} {number}" if number and name else name
    group = book.group(resource, source_group)
    category = book.category(resource)

    def items(mode: str) -> list[dict]:
        return book.render(viewer, resource, values, template_config, mode, seed_base, name=shown, group=group,
                           extra_keys=extra, describe=describe)

    sheet = {
        "resource_id": resource.id,
        "name": shown,
        "instance": number,
        "type": resource.type,
        "type_name": type_def.name,
        "category_name": category.name if category is not None else type_def.name,
        "picture": _picture(type_def, values),
        "template": {"id": template_id, "name": template_name},
        "color": group.color if group is not None else None,
        "immersive": items("immersive"),
        "informative": items("informative"),
    }
    if viewer.is_admin:
        sheet["real_name"] = f"{resource.name} {number}" if number else resource.name
        sheet["player_name"] = player_name(resource)
    return sheet


def sheet(db: Session, member: SagaMember, resource_id: int, set_id: int | None, actor_id: int | None = None) -> dict:
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
    instance, source_group = None, None
    if actor_id is not None:
        from models import StageActor

        actor = db.get(StageActor, actor_id)
        if actor is not None and actor.resource_id == resource.id and actor.stage_set.stage.saga_id == member.saga_id:
            instance = (actor.config or {}).get("instance")
            source_group = (actor.config or {}).get("group_id")
    return render_sheet(db, viewer, ruleset, DisplayBook(db, member.saga_id, ruleset), resource, override,
                        instance=instance, actor_id=actor_id if instance else None, source_group=source_group)


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
    panel = get_set_type("actors_scene")
    result: dict = {"cards": {}, "sheet": {}}
    for view, viewer in viewers.items():
        ctx = RenderContext(viewer=viewer, ruleset=ruleset, secret=settings.jwt_secret_key, displays=book)
        result["cards"][view] = {  # items have no cards (yet)
            style: panel.preview_card(ctx, resource, template.config or {}, style) for style in display.CARD_MODES
        } if resource.kind == KIND else {}
        result["sheet"][view] = render_sheet(db, viewer, ruleset, book, resource, config=template.config or {})
    return result
