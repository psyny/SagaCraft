"""Panels (plan 60): visual panels that divide or frame the Stage: rectangles and lines the DM draws in Build.

Live, a Panels Set is only shown or hidden (the Set bar's eye). In Build the DM draws, moves, styles and deletes its
shapes through commands (`shape.save`, `shape.delete`, `shape.order`); they are its settings (a Saga template carries
them). Coordinates are px inside the Set.
- rectangle: x, y, w, h, its corners' radius, a fill (colour, flat or gradient with a second colour and an angle,
  opacity, an effect: none, blur what's under it, frosted glass, glow, inner shadow; the effect's size) and a border
  (thickness, 0 for none; colour);
- line: its points (a polyline), colour, thickness, style (solid, dashed, dotted), rounded corners, opacity.
"""
import copy
import re
from typing import Any

from models import StageSet
from services.errors import BadRequest
from set_types.base import RenderContext, SetType

MAX_SHAPES, MAX_POINTS, SPAN = 200, 200, 20000
FILL_STYLES = ("flat", "linear", "radial")
FILL_EFFECTS = ("none", "blur", "frost", "glow", "inset")
LINE_STYLES = ("solid", "dashed", "dotted")
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _number(value: Any, label: str, low: float, high: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise BadRequest(f"{label}: a number")
    return round(max(low, min(high, float(value))), 2)


def _color(value: Any, label: str) -> str:
    if not isinstance(value, str) or not _HEX.match(value):
        raise BadRequest(f"{label}: a colour like #a1b2c3")
    return value.lower()


def _choice(value: Any, options: tuple, label: str) -> str:
    if value not in options:
        raise BadRequest(f"{label}: one of {options}")
    return value


RECT_DEFAULTS = {"x": 0, "y": 0, "w": 200, "h": 120, "radius": 12,
                 "fill": {"color": "#1b1722", "style": "flat", "color2": "#3a3045", "angle": 135, "opacity": 0.6,
                          "effect": "none", "effect_size": 8},
                 "border": {"width": 1, "color": "#d6a84e"}}
LINE_DEFAULTS = {"points": [[0, 0], [200, 0]], "color": "#d6a84e", "width": 3, "style": "solid", "radius": 0, "opacity": 1}


def clean_shape(raw: Any, base: dict | None = None) -> dict:
    """A shape from what the DM sent, over what it was (`base`); checked field by field."""
    if not isinstance(raw, dict):
        raise BadRequest("A shape is an object")
    kind = (base or {}).get("kind") or raw.get("kind")
    if kind not in ("rect", "line"):
        raise BadRequest("A shape is a rect or a line")
    shape = copy.deepcopy(base) if base else {"kind": kind, **copy.deepcopy(RECT_DEFAULTS if kind == "rect" else LINE_DEFAULTS)}
    if kind == "rect":
        for key in ("x", "y"):
            if key in raw:
                shape[key] = _number(raw[key], key, -SPAN, SPAN)
        for key in ("w", "h"):
            if key in raw:
                shape[key] = _number(raw[key], key, 4, SPAN)
        if "radius" in raw:
            shape["radius"] = _number(raw["radius"], "Corner radius", 0, 1000)
        fill = raw.get("fill")
        if fill is not None:
            if not isinstance(fill, dict):
                raise BadRequest("fill: an object")
            for key, value in fill.items():
                if key in ("color", "color2"):
                    shape["fill"][key] = _color(value, "Fill colour")
                elif key == "style":
                    shape["fill"][key] = _choice(value, FILL_STYLES, "Fill style")
                elif key == "angle":
                    shape["fill"][key] = _number(value, "Gradient angle", 0, 360)
                elif key == "opacity":
                    shape["fill"][key] = _number(value, "Fill opacity", 0, 1)
                elif key == "effect":
                    shape["fill"][key] = _choice(value, FILL_EFFECTS, "Fill effect")
                elif key == "effect_size":
                    shape["fill"][key] = _number(value, "Effect size", 0, 60)
                else:
                    raise BadRequest(f"Unknown fill setting '{key}'")
        border = raw.get("border")
        if border is not None:
            if not isinstance(border, dict):
                raise BadRequest("border: an object")
            for key, value in border.items():
                if key == "width":
                    shape["border"][key] = _number(value, "Border thickness", 0, 60)
                elif key == "color":
                    shape["border"][key] = _color(value, "Border colour")
                else:
                    raise BadRequest(f"Unknown border setting '{key}'")
    else:
        if "points" in raw:
            points = raw["points"]
            if not isinstance(points, list) or not 2 <= len(points) <= MAX_POINTS \
                    or not all(isinstance(p, (list, tuple)) and len(p) == 2 for p in points):
                raise BadRequest(f"A line has 2 to {MAX_POINTS} points, each [x, y]")
            shape["points"] = [[_number(p[0], "x", -SPAN, SPAN), _number(p[1], "y", -SPAN, SPAN)] for p in points]
        if "color" in raw:
            shape["color"] = _color(raw["color"], "Line colour")
        if "width" in raw:
            shape["width"] = _number(raw["width"], "Line thickness", 0.5, 60)
        if "style" in raw:
            shape["style"] = _choice(raw["style"], LINE_STYLES, "Line style")
        if "radius" in raw:
            shape["radius"] = _number(raw["radius"], "Rounded corners", 0, 1000)
        if "opacity" in raw:
            shape["opacity"] = _number(raw["opacity"], "Opacity", 0, 1)
    return shape


class Panels(SetType):
    key = "panels"
    name = "Panels"
    default_size = (900, 520)
    depth = 1  # under most Sets: it frames and divides them
    default_transparent = True
    template_settings = ("shapes", "next_id")

    def default_config(self) -> dict:
        return {"shapes": [], "next_id": 1}

    def normalize(self, config: dict | None) -> dict:
        result = {**self.default_config(), **copy.deepcopy(config or {})}
        shapes = []
        for raw in result.get("shapes") or []:
            try:
                shape = clean_shape(raw, None) if isinstance(raw, dict) else None
            except BadRequest:
                shape = None
            if shape is not None and isinstance(raw.get("id"), int):
                shapes.append({"id": raw["id"], **{k: v for k, v in shape.items() if k != "id"}})
        result["shapes"] = shapes[:MAX_SHAPES]
        result["next_id"] = max([int(result.get("next_id") or 1)] + [s["id"] + 1 for s in shapes])
        return result

    def validate_config(self, config: dict, current: dict | None = None) -> dict:
        result = self.normalize(current)
        for key in config or {}:
            if key in ("shapes", "next_id"):  # whole lists (a Saga template, a copy): checked shape by shape
                result[key] = (config or {})[key]
            else:
                raise BadRequest(f"Unknown setting '{key}': shapes change through commands")
        return self.normalize(result)

    def command(self, ctx: RenderContext, stage_set: StageSet, name: str, args: dict):
        config = self.normalize(stage_set.config)
        shapes = config["shapes"]
        find = lambda: next((s for s in shapes if s["id"] == args.get("id")), None)  # noqa: E731
        if name == "shape.save":  # a new shape (no id) or changes to one
            raw = args.get("shape") or {}
            current = next((s for s in shapes if s["id"] == raw.get("id")), None) if isinstance(raw, dict) and raw.get("id") else None
            if current is None and isinstance(raw, dict) and raw.get("id"):
                raise BadRequest("That shape isn't on this Set")
            if current is None and len(shapes) >= MAX_SHAPES:
                raise BadRequest(f"At most {MAX_SHAPES} shapes on a Set")
            shape = clean_shape(raw, current)
            if current is None:
                shapes.append({"id": config["next_id"], **shape})
                config["next_id"] += 1
            else:
                shapes[shapes.index(current)] = {"id": current["id"], **{k: v for k, v in shape.items() if k != "id"}}
        elif name == "shape.delete":
            if find() is None:
                raise BadRequest("That shape isn't on this Set")
            config["shapes"] = [s for s in shapes if s["id"] != args.get("id")]
        elif name == "shape.order":  # bring forward (by 1) or back (-1): drawn in list order
            shape = find()
            if shape is None:
                raise BadRequest("That shape isn't on this Set")
            index = shapes.index(shape)
            to = max(0, min(len(shapes) - 1, index + (1 if args.get("by", 1) > 0 else -1)))
            shapes.insert(to, shapes.pop(index))
        else:
            raise BadRequest(f"Unknown command '{name}'")
        stage_set.config = config
        return None

    def render(self, ctx: RenderContext, stage_set: StageSet, actors) -> dict:
        return {"shapes": self.normalize(stage_set.config)["shapes"]}
