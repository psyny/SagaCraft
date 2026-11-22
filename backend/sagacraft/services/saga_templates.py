"""A Saga's own Saga template (the Template page): its variables and types, its starting content, export and
import. Rules in domain/saga_template.py; parsing in domain/ruleset.py. A Saga reads its built-in template
(ruleset_key) until the first edit makes its own copy. See docs/concepts/rulesets.md ("Saga templates").
"""
import copy
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from domain import display, fog
from domain import saga_template as tpl
from domain.ruleset import available_rulesets, get_ruleset
from models import CharacterCategory, DisplayTemplate, FogPreset, Resource, Saga, SagaMember
from services.access import get_saga, require_admin
from services.errors import BadRequest
from services.resources import ruleset_for


def builtin(key: str) -> dict:
    """A built-in template file's document."""
    return copy.deepcopy(get_ruleset(key).data)


def builtins() -> list[dict]:
    return [{"key": r.key, "name": r.name, "version": r.version, "description": r.data.get("description", "")}
            for r in available_rulesets()]


def with_app_kinds(doc: dict, ruleset_key: str) -> dict:
    """Kinds the app added after a template was copied or written (events): taken from the built-in template, so
    older copies and files get them without a migration."""
    kinds = doc.get("kinds") or {}
    if "event" in kinds:
        return doc
    source = builtin(ruleset_key) if ruleset_key in {r.key for r in available_rulesets()} else builtin("dnd_lite")
    event = (source.get("kinds") or {}).get("event") or builtin("dnd_lite")["kinds"]["event"]
    return {**doc, "kinds": {**kinds, "event": copy.deepcopy(event)}}


def document(saga: Saga) -> dict:
    return with_app_kinds(copy.deepcopy(saga.template), saga.ruleset_key) if saga.template is not None else builtin(saga.ruleset_key)


def _usage(db: Session, saga_id: int) -> dict[str, dict[str, int]]:
    rows = db.execute(select(Resource.kind, Resource.type, func.count()).where(Resource.saga_id == saga_id)
                      .group_by(Resource.kind, Resource.type)).all()
    result: dict[str, dict[str, int]] = {}
    for kind, type_key, count in rows:
        result.setdefault(kind, {})[type_key] = count
    return result


def get(db: Session, member: SagaMember) -> dict:
    require_admin(member)
    saga = get_saga(db, member.saga_id)
    from services.characters import saga_categories

    categories = saga_categories(db, saga.id)
    return {
        "template": document(saga),
        "own_copy": saga.template is not None,
        "usage": _usage(db, saga.id),
        "kinds": list(tpl.EDITABLE_KINDS),
        "new_types": list(tpl.NEW_TYPES),
        "categories": [{"id": c.id, "name": c.name, "type": c.type} for c in categories],
        "display_templates": db.scalar(select(func.count()).select_from(DisplayTemplate)
                                       .where(DisplayTemplate.saga_id == saga.id)) or 0,
        "fog_presets": db.scalar(select(func.count()).select_from(FogPreset).where(FogPreset.saga_id == saga.id)) or 0,
    }


def _save(db: Session, saga: Saga, doc: dict) -> None:
    tpl.check(doc)
    saga.template = doc
    saga.template_version = (saga.template_version or 1) + 1


def command(db: Session, member: SagaMember, name: str, args: dict) -> dict:
    """One change to the Saga's template (the Template page's commands)."""
    require_admin(member)
    saga = get_saga(db, member.saga_id)
    doc = document(saga)
    args = args or {}
    kind, type_key = args.get("kind"), args.get("type")
    try:
        if name == "variable.add":
            doc = tpl.add_variable(doc, kind, type_key, args.get("variable") or {})
        elif name == "variable.update":
            doc = tpl.update_variable(doc, kind, type_key, str(args.get("key")), args.get("changes") or {})
        elif name == "variable.delete":
            doc = tpl.delete_variable(doc, kind, type_key, str(args.get("key")))
        elif name == "variable.move":
            doc = tpl.move_variable(doc, kind, type_key, str(args.get("key")), int(args.get("delta") or 0))
        elif name == "override.set":
            doc = tpl.set_override(doc, kind, str(type_key), str(args.get("key")), args.get("view"))
        elif name == "type.add":
            doc = tpl.add_type(doc, kind, str(args.get("name") or ""))
        elif name == "type.update":
            doc = tpl.update_type(doc, kind, str(type_key), args.get("changes") or {})
        elif name == "type.delete":
            used = _usage(db, saga.id).get(kind, {}).get(type_key, 0)
            if kind == "character" and db.scalar(select(func.count()).select_from(CharacterCategory).where(
                    CharacterCategory.saga_id == saga.id, CharacterCategory.type == type_key)):
                raise BadRequest("A character category is based on this type: change or delete it first")
            doc = tpl.delete_type(doc, kind, str(type_key), used)
        elif name == "starting.set":
            doc = tpl.set_starting(doc, args.get("changes") or {})
        elif name == "info.set":
            doc = tpl.set_info(doc, args.get("changes") or {})
        else:
            raise BadRequest(f"Unknown template command '{name}'")
        _save(db, saga, doc)
    except tpl.TemplateError as exc:
        raise BadRequest(str(exc)) from None
    db.commit()
    return get(db, member)


# -- export and import --------------------------------------------------------


def export(db: Session, member: SagaMember) -> dict:
    """The Saga's template as a file: its definitions, plus what the Saga made its own (categories, display
    templates, fog presets), so a Saga made from the file starts the same."""
    require_admin(member)
    from services.characters import saga_categories
    from services.fog_presets import _all as all_presets

    saga = get_saga(db, member.saga_id)
    doc = tpl.definitions(document(saga))
    doc["format"], doc["format_version"] = tpl.FORMAT, tpl.FORMAT_VERSION
    categories = saga_categories(db, saga.id)
    keys: dict[int, str] = {}
    for category in categories:
        keys[category.id] = category.key or tpl.slug(category.name, set(keys.values()), "category")
    starting = doc.setdefault("starting", {})
    starting["categories"] = [{"key": keys[c.id], "name": c.name, "plural": c.plural, "type": c.type,
                               "player": c.player, "instanceable": c.instanceable} for c in categories]
    defaults = saga.display_defaults or {}
    own = defaults.get("categories") or {}
    templates = db.scalars(select(DisplayTemplate).where(DisplayTemplate.saga_id == saga.id).order_by(DisplayTemplate.id)).all()
    doc["display_templates"] = [{
        "name": t.name, "kind": t.kind, "config": display.upgrade(t.config),
        "for_categories": [keys[c.id] for c in categories if own.get(str(c.id)) == t.id],
        "for_types": sorted(k for k, v in (defaults.get(t.kind) or {}).items() if v == t.id),
    } for t in templates]
    doc["fog_presets"] = [{"name": p.name, "look": fog.normalize(p.look)} for p in all_presets(db, saga.id)]
    from services.calendars import calendar_of

    starting["calendar"] = calendar_of(db, saga)  # a Saga made from the file counts days the same way
    return doc


def parse_file(raw: Any) -> dict:
    """A template file, checked (for a new Saga or an import)."""
    try:
        tpl.check(raw)
    except tpl.TemplateError as exc:
        raise BadRequest(str(exc)) from None
    return raw


def import_into(db: Session, member: SagaMember, raw: Any) -> dict:
    """Replace the Saga's definitions with a file's; add the file's categories, display templates and fog presets
    the Saga doesn't have yet (by name). Types still used by the Saga's resources or categories must stay."""
    require_admin(member)
    raw = parse_file(raw)
    saga = get_saga(db, member.saga_id)
    from services.characters import saga_categories

    new_types = tpl.type_keys(raw)
    for kind, types in _usage(db, saga.id).items():
        missing = [t for t in types if t not in new_types.get(kind, set())]
        if missing:
            raise BadRequest(f"The file has no {kind} type {missing[0]!r}, used in this Saga")
    categories = saga_categories(db, saga.id)
    for category in categories:
        if category.type not in new_types.get("character", set()):
            raise BadRequest(f"The file has no character type {category.type!r} (category {category.name!r})")
    doc = tpl.definitions(raw)
    doc["key"] = saga.ruleset_key  # keeps the Saga's origin
    _save(db, saga, doc)
    db.flush()
    added = apply_extras(db, saga, raw)
    db.commit()
    return {**get(db, member), "added": added}


def apply_extras(db: Session, saga: Saga, raw: dict) -> dict:
    """Categories, display templates and fog presets from a file, those the Saga lacks (by name)."""
    from services.characters import saga_categories

    ruleset = ruleset_for(db, saga.id)
    added = {"categories": 0, "display_templates": 0, "fog_presets": 0}
    have = {c.name.lower(): c for c in saga_categories(db, saga.id)}
    by_key: dict[str, CharacterCategory] = {c.key: c for c in have.values() if c.key}
    order = len(have)
    for raw_category in ruleset.saga_template["categories"]:
        if raw_category["name"].lower() in have:
            by_key.setdefault(raw_category["key"], have[raw_category["name"].lower()])
            continue
        order += 1
        category = CharacterCategory(saga_id=saga.id, sort_order=order, **raw_category)
        db.add(category)
        db.flush()
        have[category.name.lower()] = category
        by_key[raw_category["key"]] = category
        added["categories"] += 1
    names = {(t.kind, t.name.lower()) for t in db.scalars(select(DisplayTemplate).where(DisplayTemplate.saga_id == saga.id)).all()}
    defaults = dict(saga.display_defaults or {})
    own = dict(defaults.get("categories") or {})
    for item in raw.get("display_templates") or []:
        if not isinstance(item, dict) or item.get("kind") not in ("character", "item") or not isinstance(item.get("config"), dict):
            continue
        name = str(item.get("name") or "Template").strip()[:120]
        if (item["kind"], name.lower()) in names:
            continue
        made = DisplayTemplate(saga_id=saga.id, kind=item["kind"], name=name, config=display.upgrade(item["config"]))
        db.add(made)
        db.flush()
        names.add((item["kind"], name.lower()))
        added["display_templates"] += 1
        for key in item.get("for_categories") or []:
            if key in by_key:
                own[str(by_key[key].id)] = made.id
        kind_defaults = dict(defaults.get(item["kind"]) or {})
        for type_key in item.get("for_types") or []:
            if (item["kind"], type_key) in ruleset.types:
                kind_defaults[type_key] = made.id
        defaults[item["kind"]] = kind_defaults
    defaults["categories"] = own
    saga.display_defaults = defaults
    preset_names = {p.name.lower() for p in db.scalars(select(FogPreset).where(FogPreset.saga_id == saga.id)).all()}
    for item in raw.get("fog_presets") or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()[:80]
        if not name or name.lower() in preset_names:
            continue
        try:
            look = fog.update(fog.DEFAULT_LOOK, item.get("look") or {})
        except fog.FogError:
            continue
        db.add(FogPreset(saga_id=saga.id, name=name, look=look))
        preset_names.add(name.lower())
        added["fog_presets"] += 1
    return added


def prune_builtin_templates(db: Session, saga: Saga) -> None:
    """A new Saga from a file: built-in display templates that ended up default for nothing go."""
    defaults = saga.display_defaults or {}
    used = set((defaults.get("categories") or {}).values())
    for kind in ("character", "item"):
        used |= set((defaults.get(kind) or {}).values())
    for template in db.scalars(select(DisplayTemplate).where(DisplayTemplate.saga_id == saga.id)).all():
        if template.id not in used:
            db.delete(template)
