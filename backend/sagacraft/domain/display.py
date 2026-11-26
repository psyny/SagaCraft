"""Display templates: how a resource is shown in each display mode, for players and for the DM.

Pure rules (no database, no HTTP). A template config (version 3; plan 57) is
    {"version": 3, "color": "#rrggbb",
     "modes": {mode: {view: {region: [element, ...]}}}}
Each region is an ordered list of elements; an element is a value (an attribute key) or a system element
(@name, @category, @group; @archetypes, or @archetypes:<category> for one archetype category's, e.g. "Warrior 4")
with its value style and view style. What isn't in a view's lists isn't shown.
See docs/concepts/stages.md ("Display templates") and docs/implementation/06-template-lists-and-colors.md.
"""
import copy
import re
from typing import Any, Callable

from domain import discrete
from domain.ruleset import AttributeDef, TypeDef

VERSION = 3
CARD_MODES = ("face", "full", "none")
SHEET_MODES = ("immersive", "informative")
TOKEN_MODES = ("token",)  # a character's token on maps: values on it, and in trays around it on hover
MODES = CARD_MODES + SHEET_MODES + TOKEN_MODES
SMALL_MODES = CARD_MODES + TOKEN_MODES  # counters and numbers only
VIEWS = ("player", "dm")

CARD_REGIONS = ("top", "bottom", "hover_left", "hover_right", "hover_bottom")
REGIONS = {
    "face": CARD_REGIONS,
    "full": CARD_REGIONS,
    "none": CARD_REGIONS,
    "immersive": ("top_left", "top_center", "top_right", "bottom_center", "bottom_panel", "hover_left", "hover_right"),
    "informative": ("header", "body"),
    # hover_over (plan 37): over the token itself, while the pointer is on it
    "token": ("token", "hover_over", "hover_left", "hover_right", "hover_top", "hover_bottom"),
}
# The token's border (the template's): its colour follows its players (see services/resources.token_of)
TOKEN_STYLES = ("gradient", "simple", "chip")
# How many elements a region holds (others: any number)
REGION_LIMITS = {"top": 1, "top_left": 1, "top_center": 1, "top_right": 1, "header": 4}
MAX_HEADER = REGION_LIMITS["header"]
MAX_ELEMENTS = 40

# Value styles. Counters: bar, number, discrete; numbers: number; anything else: text.
STYLES = ("bar", "number", "discrete")
VALUE_STYLES = STYLES + ("text",)
# Plan 57: round (was "rounded"), rounded (was "flat": its corners are rounded), flat (square corners)
BAR_SHAPES = ("round", "rounded", "flat")
OLD_BAR_SHAPES = {"rounded": "round", "flat": "rounded"}  # version 2's names
ICONS = ("balls", "hearts", "diamonds", "squares", "stars", "bars")
# What a bar, or a counter's number, writes: nothing, "23 / 31", "74%"
VALUE_SHOWN = ("none", "current_max", "percent")
MIN_GAP, MAX_GAP = 0, 50  # px between discrete icons
COLORS = ("theme", "group", "template", "player")  # player: the token colour (its player's; several: white; none: black)
NUMBER_COLORS = ("contrast", "theme", "black", "white")
ELEMENT_DEFAULTS = {"bar": "round", "gradient": False, "value_shown": "current_max", "icon": "balls",
                    "icons": discrete.DEFAULT_ICONS, "icon_gap": 5, "logic": discrete.DEFAULT_LOGIC, "hide_full": False,
                    "color": "theme", "number_color": "theme", "show_label": True}

SYSTEM = {"@name": "Name", "@category": "Type", "@group": "Group", "@archetypes": "Archetypes"}  # "@category": its type (plan 40)
NAME = "@name"
ARCHETYPES = "@archetypes"  # and "@archetypes:<category key>": one category's


def is_system(key: str) -> bool:
    return key in SYSTEM or key.startswith(f"{ARCHETYPES}:")


def system_label(key: str, labels: dict[str, str] | None = None) -> str:
    """A system element's label: its own, or for one archetype category's, the category's name."""
    return (labels or {}).get(key) or SYSTEM.get(key) or (key.split(":", 1)[1].replace("_", " ").title() if ":" in key else key)
CARD_TYPES = ("counter", "number", "calculated")
# On sheets every value can show except the picture (the background / face) and the name attribute (@name is the name)
SHEET_SKIP_TYPES = ("image",)
NAME_KEY = "name"

DEFAULT_COLOR = "#b48cf2"
PALETTE = ("#6cc9e0", "#e2604f", "#52c06e", "#e2b742", "#b48cf2", "#f08cc0", "#f0a35e", "#8fa3b8")
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


class TemplateError(ValueError):
    pass


def clean_color(value: Any, label: str = "Color") -> str:
    if not isinstance(value, str) or not _HEX.match(value):
        raise TemplateError(f"{label} must be a color like #a1b2c3")
    return value.lower()


def applies(mode: str, attr: AttributeDef) -> bool:
    """Can this value show in this mode?"""
    if mode in SMALL_MODES:
        return attr.type in CARD_TYPES
    return attr.type not in SHEET_SKIP_TYPES and attr.key != NAME_KEY


def styles_for(attr: AttributeDef | None) -> tuple[str, ...]:
    if attr is None:
        return ("text",)
    if attr.type == "counter":
        return STYLES
    if attr.type in ("number", "calculated"):
        return ("number",)
    return ("text",)


def default_style(attr: AttributeDef | None) -> str:
    return styles_for(attr)[0]


def element(key: str, style: str, **view) -> dict:
    return {"key": key, "style": style, **ELEMENT_DEFAULTS, **view}


def empty_view(mode: str) -> dict:
    return {region: [] for region in REGIONS[mode]}


def _top(mode: str) -> str | None:
    return {"immersive": "top_center", "token": "hover_top"}.get(mode, "top" if mode in CARD_MODES else None)


def names_only(color: str = DEFAULT_COLOR) -> dict:
    """A template with only the names (each view's top)."""
    modes = {}
    for mode in MODES:
        modes[mode] = {}
        for view in VIEWS:
            regions = empty_view(mode)
            top = _top(mode)
            if top:
                regions[top] = [element(NAME, "text")]
            modes[mode][view] = regions
    return {"version": VERSION, "color": color, "token_style": "gradient", "modes": modes}


def builtin_config(type_def: TypeDef, color: str = DEFAULT_COLOR) -> dict:
    """The template built from a ruleset type. Players: on cards the ruleset's Stage defaults, on sheets its
    view rules. The DM: everything (on cards, values without a Stage default go to the hover tray). At most
    MAX_HEADER values in the informative header, in ruleset order."""
    config = names_only(color)
    for mode in MODES:
        for attr in type_def.attributes:
            if not applies(mode, attr):
                continue
            stage = type_def.stage_display.get(attr.key)
            players_may_view = bool({"players", "viewers"} & set(attr.view))
            if stage in STYLES and attr.type == "counter" or stage == "number":
                player_style = stage
            elif stage == "hidden" or not players_may_view or mode in SMALL_MODES:
                player_style = None
            else:
                player_style = default_style(attr)
            for view, style in (("player", player_style), ("dm", default_style(attr))):
                if style is None:
                    continue
                regions = config["modes"][mode][view]
                if mode in TOKEN_MODES:
                    region = "hover_bottom"  # the token stays clean: values in the tray under it
                elif mode in CARD_MODES:
                    region = "hover_bottom" if view == "dm" and stage is None else "bottom"
                elif mode == "immersive":
                    region = "bottom_panel"
                else:
                    region = "header" if attr.type in CARD_TYPES and len(regions["header"]) < MAX_HEADER else "body"
                regions[region].append(element(attr.key, style))
    return config


def blank_config(attributes: list[AttributeDef], color: str = DEFAULT_COLOR) -> dict:
    """A new template: the DM view shows every value, players only the names, until the DM adds them."""
    config = names_only(color)
    for mode in MODES:
        dm = config["modes"][mode]["dm"]
        for attr in attributes:
            if not applies(mode, attr):
                continue
            if mode in TOKEN_MODES:
                region = "hover_bottom"
            elif mode in CARD_MODES:
                region = "bottom"
            elif mode == "immersive":
                region = "bottom_panel"
            else:
                region = "header" if attr.type in CARD_TYPES and len(dm["header"]) < MAX_HEADER else "body"
            dm[region].append(element(attr.key, default_style(attr)))
    return config


# -- older configs ------------------------------------------------------------

_OLD_PLACES = {"card": "bottom", "hover": "hover_bottom", "shown": "bottom_panel", "highlight": "header", "body": "body"}


def upgrade(config: dict | None) -> dict:
    """Older configs, read as version 3: version 2's bars renamed (plan 57) and its elements' new settings at their
    defaults; version 1's ({"modes": {mode: {key: {view: {style, display_on}}}}}) become lists, in the order the values
    were stored, the name on top."""
    config = config or {}
    if config.get("version") == VERSION:
        return config
    if config.get("version") == 2:
        return _from_version_2(config)
    result = names_only(config.get("color") or DEFAULT_COLOR)
    for mode, entries in (config.get("modes") or {}).items():
        if mode not in MODES or not isinstance(entries, dict):
            continue
        for key, views in entries.items():
            for view, item in (views or {}).items():
                if view not in VIEWS or not isinstance(item, dict):
                    continue
                region = _OLD_PLACES.get(item.get("display_on"))
                if region is None or region not in REGIONS[mode]:
                    continue
                target = result["modes"][mode][view][region]
                if region in REGION_LIMITS and len(target) >= REGION_LIMITS[region]:
                    region = "body" if mode == "informative" else region
                    target = result["modes"][mode][view].get(region, target)
                style = item.get("style") if item.get("style") in STYLES else "number"
                target.append(element(str(key), style))
    return result


def _from_version_2(config: dict) -> dict:
    result = copy.deepcopy(config)
    result["version"] = VERSION
    for views in (result.get("modes") or {}).values():
        for regions in (views or {}).values():
            for elements in (regions or {}).values():
                for e in elements or []:
                    bar = e.get("bar")
                    e["bar"] = OLD_BAR_SHAPES.get(bar) or (bar if bar in BAR_SHAPES else "round")
                    for field, value in ELEMENT_DEFAULTS.items():
                        e.setdefault(field, value)
    return result


# -- editing ------------------------------------------------------------------


def _clean_element(mode: str, raw: Any, attributes: dict[str, AttributeDef]) -> dict:
    if not isinstance(raw, dict) or not isinstance(raw.get("key"), str):
        raise TemplateError("Each element needs a key")
    key = raw["key"]
    attr = attributes.get(key)
    if not is_system(key) and (attr is None or not applies(mode, attr)):
        raise TemplateError(f"'{key}' can't show in {mode}")
    allowed = styles_for(attr)
    result = element(key, default_style(attr))
    for field, value in raw.items():
        if field == "key":
            continue
        if field == "style":
            if value not in allowed:
                raise TemplateError(f"{system_label(key) if attr is None else attr.name}: value style must be one of {allowed}")
        elif field == "bar":
            value = _one_of(value, BAR_SHAPES, "Bar shape")
        elif field == "value_shown":
            value = _one_of(value, VALUE_SHOWN, "Value")
        elif field == "icon":
            value = _one_of(value, ICONS, "Icon")
        elif field == "icons":
            value = _whole(value, discrete.MIN_ICONS, discrete.MAX_ICONS, "Number of icons")
        elif field == "icon_gap":
            value = _whole(value, MIN_GAP, MAX_GAP, "Icon spacing")
        elif field == "logic":
            value = _one_of(value, discrete.LOGICS, "Icon logic")
        elif field == "color":
            value = _one_of(value, COLORS, "Color")
        elif field == "number_color":
            value = _one_of(value, NUMBER_COLORS, "Number color")
        elif field in ("gradient", "show_label", "hide_full"):
            value = bool(value)
        else:
            raise TemplateError(f"Unknown element setting '{field}'")
        result[field] = value
    return result


def _one_of(value: Any, options: tuple, label: str):
    if value not in options:
        raise TemplateError(f"{label} must be one of {options}")
    return value


def _whole(value: Any, low: int, high: int, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != int(value) or not low <= value <= high:
        raise TemplateError(f"{label} must be a whole number from {low} to {high}")
    return int(value)


def merge_config(current: dict | None, changes: dict | None, attributes: dict[str, AttributeDef]) -> dict:
    """Apply changes ({"color"?, "modes": {mode: {view: {region: [elements]}}}}: each region given replaces its
    list) and validate the result."""
    result = copy.deepcopy(upgrade(current))
    changes = changes or {}
    if "color" in changes:
        result["color"] = clean_color(changes["color"])
    if "token_style" in changes:
        result["token_style"] = _one_of(changes["token_style"], TOKEN_STYLES, "Token border")
    for mode, views in (changes.get("modes") or {}).items():
        if mode not in MODES:
            raise TemplateError(f"Unknown display mode '{mode}'")
        if not isinstance(views, dict):
            raise TemplateError("A mode's views must be an object")
        for view, regions in views.items():
            if view not in VIEWS:
                raise TemplateError(f"Unknown view '{view}'")
            if not isinstance(regions, dict):
                raise TemplateError("A view's regions must be an object")
            target = result["modes"].setdefault(mode, _defaults(mode)).setdefault(view, empty_view(mode))
            for region, elements in regions.items():
                if region not in REGIONS[mode]:
                    raise TemplateError(f"In {mode}, regions are {REGIONS[mode]}")
                if not isinstance(elements, list):
                    raise TemplateError("A region is a list of elements")
                target[region] = [_clean_element(mode, e, attributes) for e in elements]
    for mode in MODES:
        for view in VIEWS:
            regions = result["modes"].setdefault(mode, _defaults(mode)).setdefault(view, empty_view(mode))
            seen: set[str] = set()
            for region, elements in regions.items():
                limit = REGION_LIMITS.get(region)
                if limit is not None and len(elements) > limit:
                    raise TemplateError(f"{region.replace('_', ' ').capitalize()} holds at most {limit}")
                for e in elements:
                    if e["key"] in seen:
                        raise TemplateError(f"'{e['key']}' is already in this view")
                    seen.add(e["key"])
            if len(seen) > MAX_ELEMENTS:
                raise TemplateError(f"At most {MAX_ELEMENTS} elements per view")
    return result


# -- reading ------------------------------------------------------------------


def _defaults(mode: str) -> dict:
    """A mode a template made before it existed (the token): the name only."""
    return copy.deepcopy(names_only()["modes"][mode])


def view_regions(config: dict, mode: str, view: str) -> dict[str, list[dict]]:
    modes = upgrade(config).get("modes") or {}
    regions = (modes.get(mode) or _defaults(mode)).get(view) or {}
    return {region: list(regions.get(region) or []) for region in REGIONS[mode]}


def token_style(config: dict | None) -> str:
    style = (config or {}).get("token_style")
    return style if style in TOKEN_STYLES else "gradient"


def placed(config: dict, mode: str, view: str) -> dict[str, tuple[str, dict]]:
    """key -> (region, element) for one view."""
    return {e["key"]: (region, e) for region, elements in view_regions(config, mode, view).items() for e in elements}


def with_extras(config: dict, mode: str, extra_keys: set[str]) -> dict[str, list[dict]]:
    """The players' regions plus some DM-view elements (a character's controllers: what the ruleset lets them
    see), in the DM's region, where there's room."""
    regions = view_regions(config, mode, "player")
    present = {e["key"] for elements in regions.values() for e in elements}
    for region, elements in view_regions(config, mode, "dm").items():
        for e in elements:
            if e["key"] in extra_keys and e["key"] not in present:
                limit = REGION_LIMITS.get(region)
                if limit is None or len(regions[region]) < limit:
                    regions[region].append(e)
                    present.add(e["key"])
    return regions


def render_element(e: dict, region: str, attr: AttributeDef | None, value: Any, player: tuple[str, dict] | None, *,
                   admin: bool, secret: str, seed: str, colors: dict[str, str | None],
                   describe: Callable[[AttributeDef, Any], Any] | None = None, labels: dict[str, str] | None = None) -> dict | None:
    """One element for a viewer (None: not shown now: discrete hidden while full). `player` (DM only): where and how
    players get it (None: they don't). Players get exact values only when their style shows them (a bar or number
    with Current / Max); a percentage or nothing: only the percentage; discrete: only the level."""
    style = e["style"] if e["style"] in styles_for(attr) else default_style(attr)
    item = {
        "key": e["key"],
        "label": attr.name if attr is not None else system_label(e["key"], labels),
        "type": attr.type if attr is not None else "system",
        "region": region,
        "style": style,
        "bar": e.get("bar", "round"),
        "gradient": bool(e.get("gradient")),
        "value_shown": e.get("value_shown", "current_max"),
        "icon": e.get("icon", "balls"),
        "icon_gap": e.get("icon_gap", ELEMENT_DEFAULTS["icon_gap"]),
        "color": colors.get(e.get("color", "theme")),
        "number_color": e.get("number_color", "theme"),
        "show_label": e.get("show_label", True),
    }
    if attr is not None and attr.type == "counter":
        value = value or {"current": 0, "max": 0}
        current, maximum, minimum = value.get("current", 0), value.get("max", 0), value.get("min") or 0
        if style == "discrete" and e.get("hide_full") and current >= maximum:
            return None
        # The icons: this element's, or (the DM) the players' when they see icons
        icons_of = e if style == "discrete" else player[1] if admin and player and player[1].get("style") == "discrete" else None
        if icons_of is not None:
            count = icons_of.get("icons", discrete.DEFAULT_ICONS)
            item["level"] = discrete.level_for(current, minimum, maximum, count, icons_of.get("logic", discrete.DEFAULT_LOGIC), secret, seed)
            item["levels"] = count
        if style in ("bar", "number"):
            item["percent"] = discrete.percent(current, minimum, maximum)
        if admin or (style in ("bar", "number") and item["value_shown"] == "current_max"):
            item["current"] = current
            item["max"] = maximum
            if minimum:
                item["min"] = minimum  # its own min (plan 40; else 0)
    elif attr is not None and describe is not None:
        item["value"] = describe(attr, value)
    else:
        item["value"] = value
    if admin:
        item["player_style"] = player[1].get("style") if player else None
        item["player_region"] = player[0] if player else "hidden"
    return item
