"""A Saga's own Saga template (the Template page): its variables and types, its starting content, export and
import. Rules in domain/saga_template.py; parsing in domain/ruleset.py. Every Saga has its own copy, made when the
Saga is (plan 41: before, a Saga read its built-in file until its first edit). What a file carries besides
(display templates, fog presets, EFX environments, Stages, groups): services/template_extras.py. See
docs/concepts/rulesets.md ("Saga templates").
"""
import copy
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from domain import display, fog
from domain import saga_template as tpl
from domain.ruleset import available_rulesets, get_ruleset
from models import CharacterGroup, DisplayTemplate, Environment, FogPreset, Resource, Saga, SagaMember, Stage
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
    """Kinds and variables the app added after a template was copied or written (events, then their end date):
    taken from the built-in template, so older copies and files get them without a migration."""
    kinds = doc.get("kinds") or {}
    source = builtin(ruleset_key) if ruleset_key in {r.key for r in available_rulesets()} else builtin("dnd_lite")
    builtin_event = (source.get("kinds") or {}).get("event") or builtin("dnd_lite")["kinds"]["event"]
    if "event" not in kinds:
        return {**doc, "kinds": {**kinds, "event": copy.deepcopy(builtin_event)}}
    event = kinds["event"]
    shared = event.get("attributes") or []
    own = [a for t in (event.get("types") or {}).values() for a in (t.get("attributes") or [])]
    if any(a.get("ends") for a in shared + own):
        return doc
    end = next((a for a in builtin_event.get("attributes") or [] if a.get("ends")), None)
    if end is None or any(a.get("key") == end["key"] for a in shared + own):
        return doc
    # Right after the date
    at = next((i + 1 for i, a in enumerate(shared) if a.get("type") == "date" and a.get("required")), len(shared))
    attributes = [*shared[:at], copy.deepcopy(end), *shared[at:]]
    return {**doc, "kinds": {**kinds, "event": {**event, "attributes": attributes}}}


def document(saga: Saga) -> dict:
    doc = with_app_kinds(copy.deepcopy(saga.template), saga.ruleset_key) if saga.template is not None else tpl.definitions(builtin(saga.ruleset_key))
    if isinstance(doc.get("actions"), list):  # written before plan 37: gains are changes (saved so on its next change)
        from domain.actions import upgrade

        doc["actions"] = [upgrade(a) for a in doc["actions"]]
    return doc


def _usage(db: Session, saga_id: int) -> dict[str, dict[str, int]]:
    rows = db.execute(select(Resource.kind, Resource.type, func.count()).where(Resource.saga_id == saga_id)
                      .group_by(Resource.kind, Resource.type)).all()
    result: dict[str, dict[str, int]] = {}
    for kind, type_key, count in rows:
        result.setdefault(kind, {})[type_key] = count
    return result


def _archetype_counts(db: Session, saga_id: int) -> dict[str, int]:
    """How many characters have each archetype."""
    counts: dict[str, int] = {}
    for c in db.scalars(select(Resource).where(Resource.saga_id == saga_id, Resource.kind == "character",
                                               Resource.archetypes.is_not(None))).all():
        for picked in c.archetypes or []:
            key = (picked or {}).get("key")
            counts[key] = counts.get(key, 0) + 1
    return counts


def _archetype_usage(db: Session, saga_id: int, key: str) -> int:
    return _archetype_counts(db, saga_id).get(key, 0)


def get(db: Session, member: SagaMember) -> dict:
    require_admin(member)
    saga = get_saga(db, member.saga_id)
    return {
        "template": document(saga),
        "own_copy": saga.template is not None,
        "usage": _usage(db, saga.id),
        "archetype_usage": _archetype_counts(db, saga.id),
        "kinds": list(tpl.EDITABLE_KINDS),
        "new_types": list(tpl.NEW_TYPES),
        "display_templates": db.scalar(select(func.count()).select_from(DisplayTemplate)
                                       .where(DisplayTemplate.saga_id == saga.id)) or 0,
        "fog_presets": db.scalar(select(func.count()).select_from(FogPreset).where(FogPreset.saga_id == saga.id)) or 0,
        # What else goes with an export (plan 41)
        "environments": db.scalar(select(func.count()).select_from(Environment).where(Environment.saga_id == saga.id)) or 0,
        "stages": db.scalar(select(func.count()).select_from(Stage).where(Stage.saga_id == saga.id)) or 0,
        "groups": db.scalar(select(func.count()).select_from(CharacterGroup).where(CharacterGroup.saga_id == saga.id)) or 0,
    }


def _save(db: Session, saga: Saga, doc: dict) -> None:
    ruleset = tpl.check(doc)
    if doc.get("actions") is not None:
        doc["actions"] = ruleset.actions  # kept as checked (keys, defaults)
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
            doc = tpl.delete_type(doc, kind, str(type_key), used)
        elif name == "action.add":
            doc = tpl.add_action(doc, args.get("name"), args.get("on"))
        elif name == "action.update":
            doc = tpl.update_action(doc, str(args.get("key")), args.get("changes") or {})
        elif name == "action.delete":
            doc = tpl.delete_action(doc, str(args.get("key")))
        elif name == "archetype_category.add":
            doc = tpl.add_category(doc, args.get("name"))
        elif name == "archetype_category.update":
            doc = tpl.update_category(doc, str(args.get("key")), args.get("changes") or {})
        elif name == "archetype_category.delete":
            doc = tpl.delete_category(doc, str(args.get("key")))
        elif name == "archetype.add":
            doc = tpl.add_archetype(doc, args.get("name"), args.get("category"))
        elif name == "archetype.update":
            doc = tpl.update_archetype(doc, str(args.get("key")), args.get("changes") or {})
        elif name == "archetype.delete":
            doc = tpl.delete_archetype(doc, str(args.get("key")), _archetype_usage(db, saga.id, str(args.get("key"))))
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
    """The Saga's template as a file: its definitions (character types with their player and instanceable flags),
    plus what the Saga made its own (display templates and which types they're the default for, fog presets; plan 41:
    EFX environments, Stages with their Sets' settings, character groups as the starting groups), so a Saga made
    from the file starts the same, without the Saga's content."""
    require_admin(member)
    from services.fog_presets import _all as all_presets

    saga = get_saga(db, member.saga_id)
    doc = tpl.definitions(document(saga))
    doc["format"], doc["format_version"] = tpl.FORMAT, tpl.FORMAT_VERSION
    starting = doc.setdefault("starting", {})
    defaults = saga.display_defaults or {}
    templates = db.scalars(select(DisplayTemplate).where(DisplayTemplate.saga_id == saga.id).order_by(DisplayTemplate.id)).all()
    doc["display_templates"] = [{
        "name": t.name, "kind": t.kind, "config": display.upgrade(t.config),
        "for_types": sorted(k for k, v in (defaults.get(t.kind) or {}).items() if v == t.id),
    } for t in templates]
    doc["fog_presets"] = [{"name": p.name, "look": fog.normalize(p.look)} for p in all_presets(db, saga.id)]
    from services.calendars import calendar_of

    starting["calendar"] = calendar_of(db, saga)  # a Saga made from the file counts days the same way
    from services.template_extras import export_extras

    extras = export_extras(db, saga)
    starting["groups"] = extras.pop("groups")  # the Saga's groups, without their characters
    doc.update(extras)
    return doc


def parse_file(raw: Any) -> dict:
    """A template file, checked (for a new Saga or an import). A file from before plan 40 has character categories:
    they become types (and its display templates' categories, those types)."""
    raw, mapping = tpl.merge_categories(raw)
    if mapping and isinstance(raw, dict):
        for item in raw.get("display_templates") or []:
            if isinstance(item, dict) and item.get("for_categories"):
                item["for_types"] = sorted({*(item.get("for_types") or []), *(mapping[k] for k in item["for_categories"] if k in mapping)})
                item.pop("for_categories")
    try:
        tpl.check(raw)
    except tpl.TemplateError as exc:
        raise BadRequest(str(exc)) from None
    return raw


def import_into(db: Session, member: SagaMember, raw: Any) -> dict:
    """Replace the Saga's definitions with a file's; add the file's display templates, fog presets, EFX
    environments, Stages and groups the Saga doesn't have yet (by name). Types still used by the Saga's resources
    must stay."""
    require_admin(member)
    raw = parse_file(raw)
    saga = get_saga(db, member.saga_id)
    new_types = tpl.type_keys(raw)
    for kind, types in _usage(db, saga.id).items():
        missing = [t for t in types if t not in new_types.get(kind, set())]
        if missing:
            raise BadRequest(f"The file has no {kind} type {missing[0]!r}, used in this Saga")
    doc = tpl.definitions(raw)
    doc["key"] = saga.ruleset_key  # keeps the Saga's origin
    _save(db, saga, doc)
    db.flush()
    added = apply_extras(db, saga, raw)
    db.commit()
    return {**get(db, member), "added": added}


def apply_extras(db: Session, saga: Saga, raw: dict) -> dict:
    """Display templates, fog presets, EFX environments, character groups and Stages from a file (or a built-in
    template), those the Saga lacks (by name); a template becomes the default of the types the file says. Stages
    come last: their Sets point to the rest by name."""
    from services.template_extras import apply_environments, apply_groups, apply_stages

    ruleset = ruleset_for(db, saga.id)
    added = {"display_templates": 0, "fog_presets": 0, "environments": 0, "groups": 0, "stages": 0}
    names = {(t.kind, t.name.lower()) for t in db.scalars(select(DisplayTemplate).where(DisplayTemplate.saga_id == saga.id)).all()}
    defaults = dict(saga.display_defaults or {})
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
        kind_defaults = dict(defaults.get(item["kind"]) or {})
        for type_key in item.get("for_types") or []:
            if (item["kind"], type_key) in ruleset.types:
                kind_defaults[type_key] = made.id
        defaults[item["kind"]] = kind_defaults
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
    db.flush()
    added["environments"] = apply_environments(db, saga, raw)
    added["groups"] = apply_groups(db, saga, raw)
    added["stages"] = apply_stages(db, saga, raw)
    return added

