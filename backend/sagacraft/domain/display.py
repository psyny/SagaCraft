"""Display templates: how a resource's values are shown in each display mode, for players and for the DM.

Pure rules (no database, no HTTP). A template config is
    {"modes": {mode: {attr_key: {"player": {"style", "display_on"}, "dm": {"style", "display_on"}}}}}
Missing entries fall back to defaults (players: hidden; DM: shown). See docs/implementation/04-display-templates.md.
"""
import copy
from typing import Any, Callable

from domain import discrete
from domain.ruleset import AttributeDef, TypeDef

CARD_MODES = ("face", "full", "none")
SHEET_MODES = ("immersive", "informative")
MODES = CARD_MODES + SHEET_MODES
STYLES = ("bar", "number", "discrete")
VIEWS = ("player", "dm")
PLACES = {
    "face": ("card", "hover", "hidden"),
    "full": ("card", "hover", "hidden"),
    "none": ("card", "hover", "hidden"),
    "immersive": ("shown", "hidden"),
    "informative": ("highlight", "body", "hidden"),
}
MAX_HIGHLIGHT = 4
CARD_TYPES = ("counter", "number")
# On sheets every value shows except the picture (background / face) and the name (the header)
SHEET_SKIP_TYPES = ("image",)
NAME_KEY = "name"


class TemplateError(ValueError):
    pass


def applies(mode: str, attr: AttributeDef) -> bool:
    """Can this value show in this mode?"""
    if mode in CARD_MODES:
        return attr.type in CARD_TYPES
    return attr.type not in SHEET_SKIP_TYPES and attr.key != NAME_KEY


def default_style(attr: AttributeDef) -> str:
    return "bar" if attr.type == "counter" else "number"


def _shown_place(mode: str, attr: AttributeDef) -> str:
    if mode in CARD_MODES:
        return "card"
    if mode == "immersive":
        return "shown"
    return "highlight" if attr.type in CARD_TYPES else "body"


def fallback_view(mode: str, attr: AttributeDef, view: str) -> dict:
    """Used when a template has no entry for a value (e.g. the ruleset gained an attribute)."""
    if view == "dm":
        return {"style": default_style(attr), "display_on": _shown_place(mode, attr)}
    return {"style": default_style(attr), "display_on": "hidden"}


def builtin_config(type_def: TypeDef) -> dict:
    """The template built from a ruleset type: the ruleset's Stage defaults and view rules for players,
    everything for the DM. At most MAX_HIGHLIGHT highlighted values, in ruleset order."""
    modes: dict[str, dict] = {}
    for mode in MODES:
        entries: dict[str, dict] = {}
        highlights = {"player": 0, "dm": 0}
        for attr in type_def.attributes:
            if not applies(mode, attr):
                continue
            stage = type_def.stage_display.get(attr.key)
            players_may_view = bool({"players", "viewers"} & set(attr.view))
            # Cards follow the ruleset's Stage defaults; sheets, its view rules
            if stage in STYLES:
                player = {"style": stage, "display_on": _shown_place(mode, attr)}
            elif stage == "hidden" or not players_may_view or mode in CARD_MODES:
                player = {"style": default_style(attr), "display_on": "hidden"}
            else:
                player = {"style": default_style(attr), "display_on": _shown_place(mode, attr)}
            dm = {"style": default_style(attr), "display_on": _shown_place(mode, attr)}
            if mode in CARD_MODES and stage is None:
                dm["display_on"] = "hover"  # the DM keeps the card compact: extra numbers on hover
            for view, item in (("player", player), ("dm", dm)):
                if item["display_on"] == "highlight":
                    if highlights[view] >= MAX_HIGHLIGHT:
                        item["display_on"] = "body"
                    else:
                        highlights[view] += 1
            entries[attr.key] = {"player": player, "dm": dm}
        modes[mode] = entries
    return {"modes": modes}


def _clean_view(mode: str, raw: Any, current: dict | None) -> dict:
    if not isinstance(raw, dict):
        raise TemplateError("A view must be an object")
    result = dict(current or {"style": "number", "display_on": "hidden"})
    for key, value in raw.items():
        if key == "style":
            if value not in STYLES:
                raise TemplateError(f"Style must be one of {STYLES}")
            result["style"] = value
        elif key == "display_on":
            if value not in PLACES[mode]:
                raise TemplateError(f"In {mode}, a value shows on one of {PLACES[mode]}")
            result["display_on"] = value
        else:
            raise TemplateError(f"Unknown view setting '{key}'")
    return result


def merge_config(current: dict | None, changes: dict | None) -> dict:
    """Deep-merge a partial template config ({"modes": {mode: {key: {view: {...}}}}}) and validate it."""
    result = copy.deepcopy(current or {"modes": {}})
    result.setdefault("modes", {})
    for mode, entries in ((changes or {}).get("modes") or {}).items():
        if mode not in MODES:
            raise TemplateError(f"Unknown display mode '{mode}'")
        if not isinstance(entries, dict):
            raise TemplateError("A mode's values must be an object")
        target = result["modes"].setdefault(mode, {})
        for key, views in entries.items():
            if not isinstance(views, dict):
                raise TemplateError("A value's settings must be an object")
            entry = target.setdefault(str(key), {})
            for view, raw in views.items():
                if view not in VIEWS:
                    raise TemplateError(f"Unknown view '{view}'")
                entry[view] = _clean_view(mode, raw, entry.get(view))
    for mode, entries in result["modes"].items():
        for view in VIEWS:
            count = sum(1 for e in entries.values() if (e.get(view) or {}).get("display_on") == "highlight")
            if count > MAX_HIGHLIGHT:
                raise TemplateError(f"At most {MAX_HIGHLIGHT} highlighted values")
    return result


def value_view(config: dict, mode: str, attr: AttributeDef, view: str) -> dict:
    """How a value shows in a mode, for one view; numbers can't be bars or balls."""
    stored = (((config or {}).get("modes") or {}).get(mode) or {}).get(attr.key, {}).get(view)
    result = dict(stored) if stored else fallback_view(mode, attr, view)
    if attr.type != "counter" and result["style"] in ("bar", "discrete"):
        result["style"] = "number"
    return result


def render_value(attr: AttributeDef, value: Any, mine: dict, player: dict | None, *, admin: bool,
                 secret: str, seed: str, describe: Callable[[AttributeDef, Any], Any] | None = None) -> dict:
    """One value for a viewer: `mine` is the view they get, `player` (DM only) how players see it.
    Players get exact values only when their style shows them; balls carry only the level."""
    item = {"key": attr.key, "label": attr.name, "type": attr.type, **mine}
    players_see_balls = bool(player and player["style"] == "discrete" and player["display_on"] != "hidden")
    if attr.type == "counter":
        value = value or {"current": 0, "max": 0}
        if mine["style"] == "discrete" or (admin and players_see_balls):
            point_a, point_b = discrete.thresholds(secret, seed)
            item["level"] = discrete.level(value.get("current", 0), value.get("max", 0), point_a, point_b)
            item["levels"] = discrete.LEVELS
        if mine["style"] in ("bar", "number") or admin:
            item["current"] = value.get("current", 0)
            item["max"] = value.get("max", 0)
    elif describe is not None:
        item["value"] = describe(attr, value)
    else:
        item["value"] = value
    if admin and player is not None:
        item["player_style"] = player["style"]
        item["player_display_on"] = player["display_on"]
    return item
