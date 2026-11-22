"""How a Stage lays its Sets out. Pure rules.

- canvas: Sets sit on a world the viewer pans and zooms (x, y, width, height in px).
- interface: Sets are fixed to the screen, whatever its size: each has an anchor (a corner, an edge's middle or
  the centre), a width and a height in % of the screen, and an offset in % from its anchor. A World map can fill
  the screen with an Actors Scene over its bottom, or take the left half with the scene on the right.

Layers (higher on top) work the same in both. See docs/concepts/stages.md ("Layouts").

A Set's controls come in toolbars (each Set type names its own: the Actors Scene's "main" and "turns"...). Each
toolbar has a place: an anchor (a corner or an edge's middle), horizontal or vertical, a distance from the anchor
(px), a size, shown or hidden, and on a canvas Stage inside or outside the Set. On a canvas Stage the anchor is the
Set's; on an interface Stage, the screen's. The Set type's frontend has the defaults; a Set keeps only what the DM
changed. See docs/concepts/stages.md ("Set controls").
"""
import re
from typing import Any

LAYOUTS = ("canvas", "interface")
ANCHORS = ("top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right")
# Where the Set sits in the room left over: 0 = against the left/top edge, 1 = against the right/bottom
ANCHOR_FRACTIONS = {
    "top-left": (0, 0), "top": (0.5, 0), "top-right": (1, 0),
    "left": (0, 0.5), "center": (0.5, 0.5), "right": (1, 0.5),
    "bottom-left": (0, 1), "bottom": (0.5, 1), "bottom-right": (1, 1),
}


TOOLBAR_ANCHORS = ("top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right")
TOOLBAR_SIZES = ("small", "medium", "large")
MAX_TOOLBARS = 12
_TOOLBAR_KEY = re.compile(r"^[a-z][a-z0-9_]{0,29}$")


class LayoutError(ValueError):
    pass


def default_screen() -> dict:
    return {"anchor": "center", "width": 60, "height": 60, "x": 0, "y": 0}


def _number(value: Any, label: str, low: float, high: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
        raise LayoutError(f"{label}: {low:g} to {high:g}")
    return round(float(value), 2)


def clean_screen(raw: Any, current: dict | None = None) -> dict:
    """A Set's place in the interface layout (a partial change merged into the current one)."""
    if not isinstance(raw, dict):
        raise LayoutError("screen: {anchor, width, height, x, y}")
    result = {**default_screen(), **(current or {})}
    for key, value in raw.items():
        if key == "anchor":
            if value not in ANCHORS:
                raise LayoutError(f"anchor: one of {list(ANCHORS)}")
            result[key] = value
        elif key in ("width", "height"):
            result[key] = _number(value, key, 5, 100)
        elif key in ("x", "y"):
            result[key] = _number(value, f"offset {key}", -100, 100)
        else:
            raise LayoutError(f"Unknown screen setting '{key}'")
    return result


def screen_rect(screen: dict, width: float, height: float) -> tuple[float, float, float, float]:
    """Where a Set sits on a screen of this size: x, y, w, h in px (the frontend draws the same)."""
    s = {**default_screen(), **(screen or {})}
    w, h = width * s["width"] / 100, height * s["height"] / 100
    fx, fy = ANCHOR_FRACTIONS[s["anchor"]]
    x = (width - w) * fx + width * s["x"] / 100
    y = (height - h) * fy + height * s["y"] / 100
    return x, y, w, h


def clean_toolbars(raw: Any, current: dict | None = None) -> dict:
    """A Set's toolbar places: {key: {anchor, vertical, x, y, size, hidden, outside}}, a partial change merged into
    the current ones; a key set to None goes back to the Set type's default."""
    if not isinstance(raw, dict):
        raise LayoutError("toolbars: {key: {anchor, vertical, x, y, size, hidden, outside} or null}")
    result = {key: dict(place) for key, place in (current or {}).items() if isinstance(place, dict)}
    for key, value in raw.items():
        if not isinstance(key, str) or not _TOOLBAR_KEY.match(key):
            raise LayoutError(f"Unknown toolbar '{key}'")
        if value is None:
            result.pop(key, None)
            continue
        if not isinstance(value, dict):
            raise LayoutError(f"toolbar {key}: {{anchor, vertical, x, y, size, hidden, outside}}")
        place = result.get(key, {})
        for field, v in value.items():
            if field == "anchor":
                if v not in TOOLBAR_ANCHORS:
                    raise LayoutError(f"toolbar anchor: one of {list(TOOLBAR_ANCHORS)}")
            elif field in ("vertical", "hidden", "outside"):
                if not isinstance(v, bool):
                    raise LayoutError(f"toolbar {field}: true or false")
            elif field in ("x", "y"):
                v = round(_number(v, f"toolbar distance {field}", -2000, 2000))
            elif field == "size":
                if v not in TOOLBAR_SIZES:
                    raise LayoutError(f"toolbar size: one of {list(TOOLBAR_SIZES)}")
            else:
                raise LayoutError(f"Unknown toolbar setting '{field}'")
            place[field] = v
        result[key] = place
    if len(result) > MAX_TOOLBARS:
        raise LayoutError(f"At most {MAX_TOOLBARS} toolbars")
    return result
