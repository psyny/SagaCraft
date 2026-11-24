"""Saga templates: what a Saga is built on, as one JSON document (exported, shared, imported). Pure rules.

A template document:
    {"format": "sagacraft.saga_template", "format_version": 1, "key", "name", "version", "description",
     "kinds": {kind: {"attributes": [...shared variables], "types": {type: {"name", "plural", "attributes",
                                                                         "overrides", "stage_display"}}}},
     "group_attributes": [...variables every group of characters has],
     "archetype_categories": [{"key", "name"}], "archetypes": [{"key", "name", "category", "description", "max_level",
                                                               "variables": [...each with its "level"]}],
     "actions": [...rules: costs, gains, triggers (domain/actions.py)],
     "starting": {"categories", "groups", "turn_order", "actors_tabs", "dice_rolls"},
     # in exported files only (the Saga's own, applied when a Saga is made from the file):
     "display_templates": [{"name", "kind", "config", "for_types", "for_categories"}],
     "fog_presets": [{"name", "look"}]}

"Variables" are the ruleset's attributes: shared by a kind's resources, or a type's own (an item category's,
a character type's). The editing functions here change a document; the caller validates the result with
domain.ruleset.Ruleset. See docs/concepts/rulesets.md ("Saga templates").
"""
import copy
import re
from typing import Any

from domain.ruleset import GROUP_KEYS, KINDS, TAB_LAYOUTS, Ruleset, RulesetError

FORMAT = "sagacraft.saga_template"
FORMAT_VERSION = 1
# Kinds the Template page edits
EDITABLE_KINDS = ("character", "item", "document", "location", "event")
# The variables of groups of characters (no types): edited with the same commands, kind "group"
GROUP = "group"
# An archetype's variables: the same commands, kind "archetype" and the archetype as the type (domain/archetypes.py)
ARCHETYPE = "archetype"
# The variable types a DM adds (others, like pictures and references, come with the built-in templates)
NEW_TYPES = ("text", "rich_text", "number", "boolean", "choice", "counter", "date", "calculated")
# A new calculated variable's first calculation (always valid; the DM changes it)
FIRST_CALC = {"character": {"op": "count", "of": "inventory"}, "item": {"op": "formula", "formula": "0"},
              "group": {"op": "count", "of": "characters"}}
MAX_VARIABLES, MAX_TYPES, MAX_OPTIONS = 80, 40, 40
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


class TemplateError(ValueError):
    pass


def slug(name: str, taken: set[str], fallback: str = "value") -> str:
    base = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:40] or fallback
    if base[0].isdigit():
        base = f"{fallback}_{base}"
    key, n = base, 2
    while key in taken:
        key, n = f"{base}_{n}", n + 1
    return key


def definitions(doc: dict) -> dict:
    """The parts a Saga keeps as its template (without the exported extras)."""
    return {k: copy.deepcopy(v) for k, v in doc.items() if k not in ("display_templates", "fog_presets")}


def check(doc: dict) -> Ruleset:
    """Validate a document; returns its ruleset."""
    if not isinstance(doc, dict) or not isinstance(doc.get("kinds"), dict):
        raise TemplateError("Not a Saga template (no kinds)")
    if doc.get("format") not in (None, FORMAT):
        raise TemplateError("Not a Saga template file")
    try:
        return Ruleset({**doc, "key": str(doc.get("key") or "custom")[:80]})
    except (RulesetError, KeyError, TypeError, AttributeError) as exc:
        raise TemplateError(f"This template isn't valid: {exc}") from None


# -- variables ----------------------------------------------------------------


def _kind(doc: dict, kind: str) -> dict:
    if kind not in EDITABLE_KINDS:
        raise TemplateError(f"Kind must be one of {list(EDITABLE_KINDS)}")
    return doc["kinds"].setdefault(kind, {"attributes": [], "types": {}})


def _list(doc: dict, kind: str, type_key: str | None) -> list[dict]:
    """The shared variables (type_key None) or a type's own; or the groups' variables; or an archetype's."""
    if kind == ARCHETYPE:
        found = next((a for a in doc.get("archetypes") or [] if a["key"] == type_key), None)
        if found is None:
            raise TemplateError(f"Unknown archetype '{type_key}'")
        return found.setdefault("variables", [])
    if kind == GROUP:
        if type_key is not None:
            raise TemplateError("Groups have no types")
        return doc.setdefault("group_attributes", [])
    data = _kind(doc, kind)
    if type_key is None:
        return data.setdefault("attributes", [])
    types = data.setdefault("types", {})
    if type_key not in types:
        raise TemplateError(f"Unknown type '{type_key}'")
    return types[type_key].setdefault("attributes", [])


def _all_keys(doc: dict, kind: str) -> set[str]:
    if kind == GROUP:
        return {a["key"] for a in doc.get("group_attributes", [])}
    data = _kind(doc, "character" if kind == ARCHETYPE else kind)
    keys = {a["key"] for a in data.get("attributes", [])}
    for t in data.get("types", {}).values():
        keys |= {a["key"] for a in t.get("attributes", [])}
    if kind in ("character", ARCHETYPE):  # archetypes' variables are character variables: one key each
        keys |= {v["key"] for a in doc.get("archetypes") or [] for v in a.get("variables") or []}
    return keys


def _rules(raw: Any, label: str, kind: str) -> list[str]:
    if not isinstance(raw, list) or not set(raw) <= set(GROUP_KEYS):
        raise TemplateError(f"{label}: pick from {list(GROUP_KEYS)}")
    if "controllers" in raw and kind not in ("character", ARCHETYPE):
        raise TemplateError(f"{label}: only characters have controllers")
    return ["admins"] + [g for g in GROUP_KEYS[1:] if g in raw]  # admins always


def _default(attr: dict, value: Any) -> Any:
    if value is None:
        return None
    kind = attr["type"]
    if kind in ("text", "rich_text"):
        return str(value)[:200 if kind == "text" else 2000]
    if kind == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TemplateError("The default must be a number")
        return value
    if kind == "boolean":
        return bool(value)
    if kind == "choice":
        if value not in attr.get("options", []):
            raise TemplateError("The default must be one of the options")
        return value
    if kind == "counter":
        numbers = [value.get(k) for k in ("current", "max")] if isinstance(value, dict) else []
        if len(numbers) != 2 or any(isinstance(n, bool) or not isinstance(n, (int, float)) for n in numbers):
            raise TemplateError("A counter's default is {current, max}")
        return {"current": numbers[0], "max": numbers[1]}
    if kind == "date":
        from domain.calendar import CalendarError, check_shape

        try:
            return check_shape(value, "The default")
        except CalendarError as exc:
            raise TemplateError(str(exc)) from None
    return value


def _apply(attr: dict, changes: dict, kind: str) -> dict:
    """Name, who sees and edits, default, options, sortable (key and type stay)."""
    attr = copy.deepcopy(attr)
    for key, value in changes.items():
        if key == "name":
            name = str(value or "").strip()[:60]
            if not name:
                raise TemplateError("A variable needs a name")
            attr["name"] = name
        elif key in ("view", "edit"):
            attr[key] = _rules(value, "Who sees" if key == "view" else "Who edits", kind)
        elif key == "options":
            if attr["type"] != "choice":
                raise TemplateError("Only choices have options")
            options = [str(o).strip()[:60] for o in (value or []) if str(o).strip()]
            options = list(dict.fromkeys(options))
            if not options or len(options) > MAX_OPTIONS:
                raise TemplateError(f"A choice has 1 to {MAX_OPTIONS} options")
            attr["options"] = options
            if attr.get("default") not in options:
                attr["default"] = None
        elif key == "default":
            attr["default"] = _default(attr, value)
        elif key == "calc":
            if attr["type"] != "calculated":
                raise TemplateError("Only calculated variables have a calculation")
            if not isinstance(value, dict):
                raise TemplateError("A calculation is an object")
            attr["calc"] = value  # checked with the whole template (domain/calculated.py)
        elif key == "level":
            if "level" not in attr:
                raise TemplateError("Only an archetype's variables come at a level")
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise TemplateError("A level is a whole number from 1")
            attr["level"] = value  # (at most the archetype's levels: checked with the whole template)
        elif key == "by_level":
            if "level" not in attr:
                raise TemplateError("Only an archetype's variables change by level")
            if not isinstance(value, list) or not all(isinstance(x, dict) and "level" in x for x in value):
                raise TemplateError("Changes by level: a list of {level, value}")
            attr["by_level"] = sorted(({"level": x["level"], "value": x.get("value")} for x in value),  # checked with the template
                                      key=lambda x: x["level"] if isinstance(x["level"], int) else 0)
        elif key == "sortable":
            if attr["type"] not in ("number", "counter", "calculated"):
                raise TemplateError("Only numbers and counters sort lists")
            attr["sortable"] = bool(value)
        else:
            raise TemplateError(f"Unknown variable setting '{key}'")
    return attr


def locked(attr: dict) -> bool:
    """Variables the app needs (the name, who controls a character, a location's parent, an event's end): never
    deleted."""
    return bool(attr.get("required") or attr.get("controllers") or attr.get("parent") or attr.get("ends"))


def add_variable(doc: dict, kind: str, type_key: str | None, raw: dict) -> dict:
    doc = copy.deepcopy(doc)
    target = _list(doc, kind, type_key)
    if len(_all_keys(doc, kind)) >= MAX_VARIABLES:
        raise TemplateError(f"At most {MAX_VARIABLES} variables per kind")
    var_type = (raw or {}).get("type")
    from domain.archetypes import TYPES as ARCHETYPE_TYPES

    allowed = ARCHETYPE_TYPES if kind == ARCHETYPE else NEW_TYPES
    if var_type not in allowed:
        raise TemplateError(f"Type must be one of {list(allowed)}")
    name = str((raw or {}).get("name") or "").strip()
    attr = {"key": slug(name, _all_keys(doc, kind)), "name": name or "Value", "type": var_type,
            "view": ["admins", "players", "viewers"], "edit": ["admins"]}
    if var_type == "choice":
        attr["options"] = ["Option 1"]
    if var_type == "counter":
        attr["default"] = {"current": 0, "max": 0}
    if var_type == "calculated":
        attr["calc"] = dict(FIRST_CALC.get(kind if kind in FIRST_CALC else "character", FIRST_CALC["character"]))
        attr["edit"] = ["admins"]
    if kind == ARCHETYPE:
        attr["level"] = 1
    changes = {k: v for k, v in (raw or {}).items() if k not in ("type",)}
    target.append(_apply(attr, changes, kind))
    return doc


def update_variable(doc: dict, kind: str, type_key: str | None, key: str, changes: dict) -> dict:
    doc = copy.deepcopy(doc)
    target = _list(doc, kind, type_key)
    index = next((i for i, a in enumerate(target) if a["key"] == key), None)
    if index is None:
        raise TemplateError(f"Unknown variable '{key}'")
    target[index] = _apply(target[index], changes or {}, kind)
    return doc


def delete_variable(doc: dict, kind: str, type_key: str | None, key: str) -> dict:
    """Values already saved stay on the resources (unseen) and come back if a variable with the key returns."""
    doc = copy.deepcopy(doc)
    target = _list(doc, kind, type_key)
    attr = next((a for a in target if a["key"] == key), None)
    if attr is None:
        raise TemplateError(f"Unknown variable '{key}'")
    if locked(attr):
        raise TemplateError(f"'{attr['name']}' is needed by the app and can't be deleted")
    used_by = [x["name"] for x in doc.get("actions") or []
               if any(line.get("variable") == key for part in ("costs", "gains") for line in x.get(part) or [])]
    if used_by:
        raise TemplateError(f"'{attr['name']}' is used by the actions {', '.join(used_by)}: change them first")
    target.remove(attr)
    if kind in (GROUP, ARCHETYPE):
        return doc
    if type_key is None:  # the types' overrides and Stage defaults of it go too
        for t in _kind(doc, kind).get("types", {}).values():
            (t.get("overrides") or {}).pop(key, None)
            (t.get("stage_display") or {}).pop(key, None)
    else:
        (_kind(doc, kind)["types"][type_key].get("stage_display") or {}).pop(key, None)
    starting = doc.get("starting") or {}
    if kind == "character" and starting.get("turn_order") == key:
        starting["turn_order"] = None
    return doc


def move_variable(doc: dict, kind: str, type_key: str | None, key: str, delta: int) -> dict:
    doc = copy.deepcopy(doc)
    target = _list(doc, kind, type_key)
    index = next((i for i, a in enumerate(target) if a["key"] == key), None)
    if index is None:
        raise TemplateError(f"Unknown variable '{key}'")
    new = max(0, min(len(target) - 1, index + int(delta)))
    target.insert(new, target.pop(index))
    return doc


def set_override(doc: dict, kind: str, type_key: str, key: str, view: list[str] | None) -> dict:
    """Who sees a shared variable, for one type (None: like every type)."""
    doc = copy.deepcopy(doc)
    data = _kind(doc, kind)
    if type_key not in data.get("types", {}):
        raise TemplateError(f"Unknown type '{type_key}'")
    if not any(a["key"] == key for a in data.get("attributes", [])):
        raise TemplateError(f"'{key}' isn't shared by every type")
    overrides = data["types"][type_key].setdefault("overrides", {})
    if view is None:
        overrides.pop(key, None)
    else:
        overrides[key] = {**overrides.get(key, {}), "view": _rules(view, "Who sees", kind)}
    return doc


# -- types (item categories, character types...) -----------------------------


def add_type(doc: dict, kind: str, name: str) -> dict:
    doc = copy.deepcopy(doc)
    types = _kind(doc, kind).setdefault("types", {})
    if len(types) >= MAX_TYPES:
        raise TemplateError(f"At most {MAX_TYPES} types per kind")
    name = str(name or "").strip()[:60] or "New type"
    types[slug(name, set(types), "type")] = {"name": name, "plural": name, "attributes": []}
    return doc


def update_type(doc: dict, kind: str, type_key: str, changes: dict) -> dict:
    doc = copy.deepcopy(doc)
    types = _kind(doc, kind).get("types", {})
    if type_key not in types:
        raise TemplateError(f"Unknown type '{type_key}'")
    for key in ("name", "plural"):
        if key in (changes or {}):
            value = str(changes[key] or "").strip()[:60]
            if not value:
                raise TemplateError("A type needs a name")
            types[type_key][key] = value
    if "sub_events" in (changes or {}):  # what can happen to a resource of this type in an event
        from domain.ruleset import clean_sub_events

        names = clean_sub_events(changes["sub_events"])
        if names is None:
            raise TemplateError("Sub-events are a list of names")
        types[type_key]["sub_events"] = names
    return doc


def delete_type(doc: dict, kind: str, type_key: str, used: int) -> dict:
    doc = copy.deepcopy(doc)
    types = _kind(doc, kind).get("types", {})
    if type_key not in types:
        raise TemplateError(f"Unknown type '{type_key}'")
    if used:
        raise TemplateError(f"{used} resources are of this type: move or delete them first")
    if len(types) == 1:
        raise TemplateError("A kind keeps at least one type")
    if kind == "character" and any(c.get("type") == type_key for c in (doc.get("starting") or {}).get("categories", [])):
        raise TemplateError("A starting category is based on this type")
    del types[type_key]
    return doc


# -- actions --------------------------------------------------------------------


def _actions(doc: dict) -> list[dict]:
    return doc.setdefault("actions", [])


def add_action(doc: dict, name: Any, on: Any) -> dict:
    from domain.actions import ON, new_action

    doc = copy.deepcopy(doc)
    if on not in ON:
        raise TemplateError(f"An action is on one of {list(ON)}")
    _actions(doc).append(new_action(_actions(doc), str(name or ""), on))
    return doc


def update_action(doc: dict, key: str, changes: dict) -> dict:
    """Name, description, types, who, costs, gains, triggers (each list replaced whole); checked with the template."""
    doc = copy.deepcopy(doc)
    action = next((a for a in _actions(doc) if a["key"] == key), None)
    if action is None:
        raise TemplateError(f"Unknown action '{key}'")
    for field, value in (changes or {}).items():
        if field not in ("name", "description", "types", "who", "notify", "costs", "gains", "triggers"):
            raise TemplateError(f"Unknown action setting '{field}'")
        action[field] = value
    return doc


def delete_action(doc: dict, key: str) -> dict:
    doc = copy.deepcopy(doc)
    actions = _actions(doc)
    action = next((a for a in actions if a["key"] == key), None)
    if action is None:
        raise TemplateError(f"Unknown action '{key}'")
    using = [a["name"] for a in actions if any(t.get("action") == key for t in a.get("triggers") or [])]
    if using:
        raise TemplateError(f"'{action['name']}' is triggered by {', '.join(using)}: change them first")
    actions.remove(action)
    return doc


# -- starting content ---------------------------------------------------------


# -- archetypes ----------------------------------------------------------------


def _categories(doc: dict) -> list[dict]:
    return doc.setdefault("archetype_categories", [])


def _archetypes(doc: dict) -> list[dict]:
    return doc.setdefault("archetypes", [])


def add_category(doc: dict, name: Any) -> dict:
    doc = copy.deepcopy(doc)
    name = str(name or "").strip()[:40]
    if not name:
        raise TemplateError("A category needs a name")
    _categories(doc).append({"key": slug(name, {c["key"] for c in _categories(doc)}, "category"), "name": name})
    return doc


def update_category(doc: dict, key: str, changes: dict) -> dict:
    doc = copy.deepcopy(doc)
    found = next((c for c in _categories(doc) if c["key"] == key), None)
    if found is None:
        raise TemplateError(f"Unknown category '{key}'")
    if "name" in changes:
        name = str(changes["name"] or "").strip()[:40]
        if not name:
            raise TemplateError("A category needs a name")
        found["name"] = name
    return doc


def delete_category(doc: dict, key: str) -> dict:
    doc = copy.deepcopy(doc)
    if any(a.get("category") == key for a in _archetypes(doc)):
        raise TemplateError("Archetypes are in this category: move or delete them first")
    doc["archetype_categories"] = [c for c in _categories(doc) if c["key"] != key]
    return doc


def add_archetype(doc: dict, name: Any, category: Any) -> dict:
    doc = copy.deepcopy(doc)
    name = str(name or "").strip()[:60]
    if not name:
        raise TemplateError("An archetype needs a name")
    if not any(c["key"] == category for c in _categories(doc)):
        raise TemplateError("Pick a category for it")
    _archetypes(doc).append({"key": slug(name, {a["key"] for a in _archetypes(doc)}, "archetype"), "name": name,
                             "category": category, "description": "", "max_level": 1, "variables": []})
    return doc


def update_archetype(doc: dict, key: str, changes: dict) -> dict:
    """Name, category, description, levels (never below a variable's level)."""
    doc = copy.deepcopy(doc)
    found = next((a for a in _archetypes(doc) if a["key"] == key), None)
    if found is None:
        raise TemplateError(f"Unknown archetype '{key}'")
    for field_key, value in (changes or {}).items():
        if field_key == "name":
            name = str(value or "").strip()[:60]
            if not name:
                raise TemplateError("An archetype needs a name")
            found["name"] = name
        elif field_key == "category":
            if not any(c["key"] == value for c in _categories(doc)):
                raise TemplateError("Unknown category")
            found["category"] = value
        elif field_key == "description":
            found["description"] = str(value or "").strip()[:500]
        elif field_key == "max_level":
            from domain.archetypes import MAX_LEVEL

            if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= MAX_LEVEL:
                raise TemplateError(f"Levels: 1 to {MAX_LEVEL}")
            highest = max((max([v.get("level", 1), *(c.get("level", 1) for c in v.get("by_level") or [])])
                           for v in found.get("variables") or []), default=1)
            if value < highest:
                raise TemplateError(f"A variable comes or changes at level {highest}: keep at least {highest} levels")
            found["max_level"] = value
        else:
            raise TemplateError(f"Unknown archetype setting '{field_key}'")
    return doc


def delete_archetype(doc: dict, key: str, used: int) -> dict:
    doc = copy.deepcopy(doc)
    found = next((a for a in _archetypes(doc) if a["key"] == key), None)
    if found is None:
        raise TemplateError(f"Unknown archetype '{key}'")
    if used:
        raise TemplateError(f"{used} character{'s have' if used > 1 else ' has'} {found['name']}: take it off them first")
    own = {v["key"] for v in found.get("variables") or []}
    used_by = [x["name"] for x in doc.get("actions") or []
               if any(line.get("variable") in own for part in ("costs", "gains") for line in x.get(part) or [])]
    if used_by:
        raise TemplateError(f"The actions {', '.join(used_by)} use its variables: change them first")
    doc["archetypes"] = [a for a in _archetypes(doc) if a["key"] != key]
    return doc


def set_starting(doc: dict, changes: dict) -> dict:
    """What a Saga made from this template starts with: character groups, Actors Scene tabs, turn order, dice rolls."""
    doc = copy.deepcopy(doc)
    starting = doc.setdefault("starting", {})
    for key, value in (changes or {}).items():
        if key == "groups":
            if not isinstance(value, list) or len(value) > 30:
                raise TemplateError("At most 30 starting groups")
            groups = []
            for g in value:
                name = str((g or {}).get("name") or "").strip()[:120]
                if not name:
                    raise TemplateError("A group needs a name")
                color = str((g or {}).get("color") or "#6cc9e0")
                if not _HEX.match(color):
                    raise TemplateError("A group's color is like #a1b2c3")
                groups.append({"name": name, "color": color.lower(), "player_party": bool(g.get("player_party")),
                               "active": bool(g.get("active")), "favorite": bool(g.get("favorite"))})
            starting["groups"] = groups
        elif key == "actors_tabs":
            if not isinstance(value, list) or not 1 <= len(value) <= 12:
                raise TemplateError("1 to 12 starting tabs")
            tabs = []
            for t in value:
                name = str((t or {}).get("name") or "").strip()[:60]
                layout = (t or {}).get("layout", "grid")
                if not name or layout not in TAB_LAYOUTS:
                    raise TemplateError(f"A tab needs a name and a layout from {list(TAB_LAYOUTS)}")
                tabs.append({"name": name, "layout": layout, "turns": bool(t.get("turns"))})
            starting["actors_tabs"] = tabs
        elif key == "turn_order":
            starting["turn_order"] = value or None
        elif key == "dice_rolls":  # the Dice roller Sets' roll types (each Set starts with them)
            from domain.dice import DiceError, clean_roll_types

            try:
                starting["dice_rolls"] = clean_roll_types(value)
            except DiceError as exc:
                raise TemplateError(str(exc)) from None
        else:
            raise TemplateError(f"Unknown starting setting '{key}'")
    return doc


def set_info(doc: dict, changes: dict) -> dict:
    doc = copy.deepcopy(doc)
    for key in ("name", "description"):
        if key in (changes or {}):
            value = str(changes[key] or "").strip()[:80 if key == "name" else 500]
            if key == "name" and not value:
                raise TemplateError("A template needs a name")
            doc[key] = value
    return doc


def type_keys(doc: dict) -> dict[str, set[str]]:
    return {kind: set((data or {}).get("types", {})) for kind, data in doc.get("kinds", {}).items() if kind in KINDS}
