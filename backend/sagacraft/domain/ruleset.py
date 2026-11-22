"""Rulesets are data, loaded and validated here: the built-in Saga templates (backend/sagacraft/rulesets/*.json)
and each Saga's own copy (sagas.template, edited on the Template page: services/saga_templates.py).

A ruleset defines, per resource kind, the shared attributes ("variables") and the types (subtypes: item
categories, character types) with their own attributes, overrides of inherited view/edit rules, and Stage display
defaults; plus the Saga template's starting content (`starting`: categories, groups, Actors Scene tabs). See
docs/concepts/rulesets.md. Nothing outside this module and the ruleset files knows "HP" or "NPC".
"""
import copy
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

KINDS = ("document", "character", "location", "item", "event")
BLOCKS = ("text", "rich_text", "number", "boolean", "choice", "counter", "resource_ref", "member_ref", "list", "image",
          "pages", "date")
# Actors Scene tab layouts a template's starting tabs may name (set_types/actors_scene.py SHAPES)
TAB_LAYOUTS = ("grid", "row", "column", "circle", "bar", "boundary", "free")
MAX_PAGES, PAGE_TEXT = 200, 20000
MAX_SUB_EVENTS, SUB_EVENT_LENGTH = 30, 40
DISPLAY_MODES = ("bar", "number", "discrete", "hidden")
GROUP_KEYS = ("admins", "players", "viewers", "controllers")

RULESET_DIR = Path(__file__).resolve().parent.parent / "rulesets"


class RulesetError(ValueError):
    pass


class AttributeValueError(ValueError):
    pass


@dataclass
class AttributeDef:
    key: str
    name: str
    type: str
    view: list[str]
    edit: list[str]
    required: bool = False
    default: Any = None
    many: bool = False
    controllers: bool = False
    of: dict | None = None
    options: list[str] = field(default_factory=list)
    sortable: bool = False  # offered as a sort option in lists (e.g. Level)
    category: str | None = None  # images: the upload category (sizes, how many per resource)
    parent: bool = False  # resource_ref to the same kind: the structural hierarchy (a Location's "part of")
    ends: bool = False  # an optional date: when an event ends (events with one are periods on the timeline)

    def to_dict(self) -> dict:
        return {
            "key": self.key, "name": self.name, "type": self.type, "view": self.view, "edit": self.edit,
            "required": self.required, "default": self.default, "many": self.many,
            "controllers": self.controllers, "of": self.of, "options": self.options,
            "sortable": self.sortable, "category": self.category, "parent": self.parent, "ends": self.ends,
        }

    @property
    def ref_kind(self) -> str | None:
        """resource_ref (and lists of them): the kind they point to, if the ruleset says."""
        return (self.of or {}).get("kind")


@dataclass
class TypeDef:
    key: str
    name: str
    attributes: list[AttributeDef]
    stage_display: dict[str, str]
    plural: str = ""  # "NPCs": list section titles
    # What can happen to a resource of this type in an event ("born", "died"; a Location: "discovered")
    sub_events: list[str] = field(default_factory=list)

    def picture(self) -> AttributeDef | None:
        """The main picture: the first single image that isn't an icon."""
        return next((a for a in self.attributes if a.type == "image" and not a.many and a.category != "icon"), None)

    def icon(self) -> AttributeDef | None:
        return next((a for a in self.attributes if a.type == "image" and not a.many and a.category == "icon"), None)

    def parent_attr(self) -> AttributeDef | None:
        return next((a for a in self.attributes if a.parent), None)

    def date_attr(self) -> AttributeDef | None:
        """An event's date: its required date variable (the one the app keeps), else its first."""
        dates = [a for a in self.attributes if a.type == "date"]
        return next((a for a in dates if a.required), dates[0] if dates else None)

    def end_attr(self) -> AttributeDef | None:
        """An event's end (optional): its date variable marked `ends`."""
        return next((a for a in self.attributes if a.type == "date" and a.ends), None)


class Ruleset:
    def __init__(self, data: dict):
        self.data = data
        self.key: str = data["key"]
        self.name: str = data.get("name", self.key)
        self.version: str = data.get("version", "0")
        self.types: dict[tuple[str, str], TypeDef] = {}
        self._build()
        self.saga_template = self._saga_template(data.get("starting") or data.get("saga_template") or {})

    def _saga_template(self, raw: dict) -> dict:
        """The Saga template's starting categories and groups (see docs/concepts/characters.md). Without one,
        each character type becomes a category."""
        categories = raw.get("categories")
        if categories is None:
            categories = [{"key": t, "name": d.name, "plural": d.plural, "type": t}
                          for (k, t), d in self.types.items() if k == "character"]
        cleaned = []
        for c in categories:
            if ("character", c.get("type")) not in self.types:
                raise RulesetError(f"{self.key}: category {c.get('key')!r} is based on unknown type {c.get('type')!r}")
            player = bool(c.get("player", False))
            cleaned.append({"key": c.get("key"), "name": c.get("name") or c["type"], "plural": c.get("plural") or "",
                            "type": c["type"], "player": player,
                            "instanceable": bool(c.get("instanceable", False)) and not player})
        groups = []
        for g in raw.get("groups") or []:
            group = {"name": g.get("name") or "Group", "player_party": bool(g.get("player_party", False)),
                     "active": bool(g.get("active", False)), "favorite": bool(g.get("favorite", False))}
            if g.get("color"):
                if not re.match(r"^#[0-9a-fA-F]{6}$", str(g["color"])):
                    raise RulesetError(f"{self.key}: group {group['name']!r} color must be like #a1b2c3")
                group["color"] = str(g["color"]).lower()
            groups.append(group)
        turn_order = raw.get("turn_order")
        if turn_order is not None and not any(
            a.key == turn_order and a.type == "number" for (k, _), d in self.types.items() if k == "character" for a in d.attributes
        ):
            raise RulesetError(f"{self.key}: turn_order {turn_order!r} is not a character number attribute")
        tabs = []
        for t in raw.get("actors_tabs") or []:
            name = str((t or {}).get("name") or "").strip()[:60]
            layout = (t or {}).get("layout", "grid")
            if not name or layout not in TAB_LAYOUTS:
                raise RulesetError(f"{self.key}: an Actors Scene tab needs a name and a layout from {TAB_LAYOUTS}")
            tabs.append({"name": name, "layout": layout, "turns": bool((t or {}).get("turns", False))})
        calendar = None
        if raw.get("calendar") is not None:
            from domain.calendar import CalendarError, normalize

            try:
                calendar = normalize(raw["calendar"])
            except CalendarError as exc:
                raise RulesetError(f"{self.key}: calendar: {exc}") from None
        return {"name": raw.get("name") or self.name, "categories": cleaned, "groups": groups, "turn_order": turn_order,
                "actors_tabs": tabs, "calendar": calendar}

    def _build(self) -> None:
        kinds = self.data.get("kinds") or {}
        if not kinds:
            raise RulesetError(f"{self.key}: no kinds")
        for kind, kind_data in kinds.items():
            if kind not in KINDS:
                raise RulesetError(f"{self.key}: unknown kind {kind!r}")
            shared = [_attribute(self.key, a) for a in kind_data.get("attributes", [])]
            types = kind_data.get("types") or {}
            if not types:
                raise RulesetError(f"{self.key}: kind {kind!r} has no types")
            for type_key, type_data in types.items():
                attrs = [copy.deepcopy(a) for a in shared]
                for attr_key, override in (type_data.get("overrides") or {}).items():
                    target = next((a for a in attrs if a.key == attr_key), None)
                    if target is None:
                        raise RulesetError(f"{self.key}: override of unknown attribute {attr_key!r}")
                    # Only view/edit rules can be overridden for now (see open points in rulesets.md)
                    for rule in ("view", "edit"):
                        if rule in override:
                            setattr(target, rule, _keys(self.key, override[rule]))
                attrs += [_attribute(self.key, a) for a in type_data.get("attributes", [])]
                keys = [a.key for a in attrs]
                if len(keys) != len(set(keys)):
                    raise RulesetError(f"{self.key}: duplicate attribute in {kind}/{type_key}")
                display = type_data.get("stage_display") or {}
                for attr_key, mode in display.items():
                    if mode not in DISPLAY_MODES or attr_key not in keys:
                        raise RulesetError(f"{self.key}: bad stage_display {attr_key}={mode}")
                name = type_data.get("name", type_key)
                sub_events = clean_sub_events(type_data.get("sub_events"))
                if sub_events is None:
                    raise RulesetError(f"{self.key}: {kind}/{type_key} sub_events must be a list of names")
                if kind == "event" and not any(a.type == "date" for a in attrs):
                    raise RulesetError(f"{self.key}: event type {type_key!r} needs a date variable")
                self.types[(kind, type_key)] = TypeDef(type_key, name, attrs, display, type_data.get("plural") or name,
                                                       sub_events)

    def type_def(self, kind: str, type_key: str) -> TypeDef:
        try:
            return self.types[(kind, type_key)]
        except KeyError:
            raise AttributeValueError(f"Unknown type {kind}/{type_key} in ruleset {self.key}") from None

    def to_dict(self) -> dict:
        kinds: dict[str, dict] = {}
        for (kind, type_key), type_def in self.types.items():
            kinds.setdefault(kind, {"types": {}})["types"][type_key] = {
                "name": type_def.name,
                "plural": type_def.plural,
                "attributes": [a.to_dict() for a in type_def.attributes],
                "stage_display": type_def.stage_display,
                "sub_events": type_def.sub_events,
            }
        return {"key": self.key, "name": self.name, "version": self.version, "kinds": kinds,
                "saga_template": {"name": self.saga_template["name"], "turn_order": self.saga_template["turn_order"]}}


def clean_sub_events(raw: Any) -> list[str] | None:
    """A type's sub-event names: trimmed, each once, at most MAX_SUB_EVENTS. None when it's not a list."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        return None
    names: list[str] = []
    for item in raw:
        name = re.sub(r"\s+", " ", str(item or "")).strip()[:SUB_EVENT_LENGTH]
        if name and name.lower() not in [n.lower() for n in names]:
            names.append(name)
    return names[:MAX_SUB_EVENTS]


def _keys(ruleset_key: str, keys: list[str]) -> list[str]:
    for k in keys:
        if k not in GROUP_KEYS:
            raise RulesetError(f"{ruleset_key}: unknown group key {k!r}")
    return list(keys)


def _attribute(ruleset_key: str, raw: dict) -> AttributeDef:
    if raw.get("type") not in BLOCKS:
        raise RulesetError(f"{ruleset_key}: attribute {raw.get('key')!r} has unknown type {raw.get('type')!r}")
    if raw["type"] == "list" and (raw.get("of") or {}).get("type") not in BLOCKS:
        raise RulesetError(f"{ruleset_key}: list attribute {raw['key']!r} needs 'of'")
    from domain.uploads import CATEGORIES

    category = raw.get("category")
    if raw["type"] == "image" and category is not None and category not in CATEGORIES:
        raise RulesetError(f"{ruleset_key}: image {raw['key']!r} has unknown upload category {category!r}")
    if raw["type"] == "choice" and not raw.get("options"):
        raise RulesetError(f"{ruleset_key}: choice {raw['key']!r} needs options")
    if raw.get("parent") and (raw["type"] != "resource_ref" or raw.get("many")):
        raise RulesetError(f"{ruleset_key}: parent attribute {raw['key']!r} must be a single resource_ref")
    if raw.get("ends") and (raw["type"] != "date" or raw.get("required")):
        raise RulesetError(f"{ruleset_key}: end date {raw['key']!r} must be an optional date")
    return AttributeDef(
        key=raw["key"],
        name=raw.get("name", raw["key"]),
        type=raw["type"],
        view=_keys(ruleset_key, raw.get("view", ["admins"])),
        edit=_keys(ruleset_key, raw.get("edit", ["admins"])),
        required=bool(raw.get("required", False)),
        default=raw.get("default"),
        many=bool(raw.get("many", False)),
        controllers=bool(raw.get("controllers", False)),
        of=raw.get("of"),
        options=list(raw.get("options", [])),
        sortable=bool(raw.get("sortable", False)),
        category=category,
        parent=bool(raw.get("parent", False)),
        ends=bool(raw.get("ends", False)),
    )


# ---------------------------------------------------------------------------
# Value validation (one function per building block)
# ---------------------------------------------------------------------------


def _number(value: Any, label: str) -> float | int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise AttributeValueError(f"{label} must be a number")
    return value


def validate_block(block: dict | AttributeDef, value: Any, label: str) -> Any:
    kind = block.type if isinstance(block, AttributeDef) else block.get("type")
    many = block.many if isinstance(block, AttributeDef) else block.get("many", False)
    if value is None:
        return None
    if kind in ("text", "rich_text"):
        if not isinstance(value, str):
            raise AttributeValueError(f"{label} must be text")
        limit = 200 if kind == "text" else 20000
        return value.strip()[:limit]
    if kind == "number":
        return _number(value, label)
    if kind == "boolean":
        if not isinstance(value, bool):
            raise AttributeValueError(f"{label} must be true or false")
        return value
    if kind == "choice":
        options = block.options if isinstance(block, AttributeDef) else block.get("options", [])
        if value not in options:
            raise AttributeValueError(f"{label} must be one of {options}")
        return value
    if kind == "counter":
        if not isinstance(value, dict):
            raise AttributeValueError(f"{label} must have current and max")
        current = _number(value.get("current"), f"{label} current")
        maximum = _number(value.get("max"), f"{label} max")
        if maximum < 0:
            raise AttributeValueError(f"{label} max can't be negative")
        return {"current": current, "max": maximum}
    if kind in ("resource_ref", "member_ref"):
        if many:
            if not isinstance(value, list):
                raise AttributeValueError(f"{label} must be a list")
            return sorted({int(_number(v, label)) for v in value})
        return int(_number(value, label))
    if kind == "list":
        if not isinstance(value, list):
            raise AttributeValueError(f"{label} must be a list")
        of = block.of if isinstance(block, AttributeDef) else block.get("of")
        return [validate_block(of, v, label) for v in value]
    if kind == "pages":
        return _pages(value, label)
    if kind == "date":
        from domain.calendar import CalendarError, check_shape

        try:
            return check_shape(value, label)
        except CalendarError as exc:
            raise AttributeValueError(str(exc)) from None
    if kind == "image" and many:
        if not isinstance(value, list):
            raise AttributeValueError(f"{label} must be a list of pictures")
        single = {"type": "image"}
        seen, pictures = set(), []
        for item in value:
            picture = validate_block(single, item, label)
            if picture["file_id"] not in seen:  # the same picture once
                seen.add(picture["file_id"])
                pictures.append(picture)
        return pictures
    if kind == "image":
        if not isinstance(value, dict) or "file_id" not in value:
            raise AttributeValueError(f"{label} must have a file")
        face = value.get("face") or {}
        clamp = lambda v, d: max(0.0, min(1.0, float(v if isinstance(v, (int, float)) else d)))  # noqa: E731
        return {
            "file_id": int(_number(value["file_id"], label)),
            "face": {"x": clamp(face.get("x"), 0.5), "y": clamp(face.get("y"), 0.3), "size": clamp(face.get("size"), 0.4)},
        }
    raise AttributeValueError(f"{label}: unsupported type {kind}")


def _pages(value: Any, label: str) -> list[dict]:
    """A document's pages, in order: each a text (a title and its text) or a picture (and a caption)."""
    if not isinstance(value, list) or len(value) > MAX_PAGES:
        raise AttributeValueError(f"{label}: at most {MAX_PAGES} pages")
    pages, ids = [], set()
    for raw in value:
        if not isinstance(raw, dict) or raw.get("kind") not in ("text", "image"):
            raise AttributeValueError(f"{label}: each page is a text or a picture")
        page_id = str(raw.get("id") or "")[:24] or f"p{len(pages) + 1}"
        while page_id in ids:
            page_id += "x"
        ids.add(page_id)
        page = {"id": page_id, "kind": raw["kind"], "title": str(raw.get("title") or "").strip()[:120]}
        if raw["kind"] == "text":
            text = raw.get("text") or ""
            if not isinstance(text, str):
                raise AttributeValueError(f"{label}: a page's text must be text")
            page["text"] = text[:PAGE_TEXT]
        else:
            page["image"] = validate_block({"type": "image"}, raw.get("image"), f"{label} picture")
            if page["image"] is None:
                raise AttributeValueError(f"{label}: a picture page needs a picture")
        pages.append(page)
    return pages


def default_value(attr: AttributeDef) -> Any:
    if attr.default is not None:
        return copy.deepcopy(attr.default)
    if attr.type in ("member_ref", "image") and attr.many or attr.type == "pages":
        return []
    return None


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

_RULESETS: dict[str, Ruleset] = {}


def load_rulesets(directory: Path = RULESET_DIR) -> dict[str, Ruleset]:
    _RULESETS.clear()
    for path in sorted(directory.glob("*.json")):
        ruleset = Ruleset(json.loads(path.read_text(encoding="utf-8")))
        _RULESETS[ruleset.key] = ruleset
    return _RULESETS


def get_ruleset(key: str) -> Ruleset:
    if not _RULESETS:
        load_rulesets()
    try:
        return _RULESETS[key]
    except KeyError:
        raise RulesetError(f"Unknown ruleset {key!r}") from None


def available_rulesets() -> list[Ruleset]:
    if not _RULESETS:
        load_rulesets()
    return list(_RULESETS.values())
