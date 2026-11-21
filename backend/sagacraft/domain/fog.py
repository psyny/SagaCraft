"""Fog presets: how a map Set draws the fog of war for everyone (display, style, colours and the style's controls).
Pure rules (no database). The DM builds presets on the Locations page; map Sets pick one.
See docs/concepts/locations.md ("Fog presets") and frontend/src/maps/shader.ts.

A preset's look:
    {"display": flat|soft, "style", "colors": [c1, c2, c3], "size", "intensity", "motion", "edge", "known"}
"""
import re
from typing import Any

DISPLAYS = ("flat", "soft")
STYLES = ("mist", "smoke", "clouds", "ink", "parchment", "void", "nebula", "embers", "blizzard", "depths")
# Each style's three colours (their roles: FOG_COLOR_ROLES in the shader). Picking a style applies them.
PALETTES = {
    "mist": ["#2c3036", "#6b7382", "#b5bfcf"],       # shadow, veils, light
    "smoke": ["#141518", "#5e636c", "#a7adb7"],      # dark, smoke, wisps
    "clouds": ["#1f2430", "#8c96a8", "#e4e9f1"],     # sky, cloud shade, cloud
    "ink": ["#07080b", "#1b1f27", "#2b1c33"],        # ink, grain, stains
    "parchment": ["#4a3a22", "#75613f", "#a68f63"],  # stains, paper, light paper
    "void": ["#07060c", "#ffffff", "#9ec4ff"],       # sky, stars, tinted stars
    "nebula": ["#050510", "#5b3fb0", "#b0506e"],     # space, gas, second gas
    "embers": ["#0e0908", "#3b2c27", "#ff8a2a"],     # ash, smoke, embers
    "blizzard": ["#4f5a68", "#b9c5d3", "#ffffff"],   # shadow, snow haze, flakes
    "depths": ["#03121c", "#0c3b52", "#7fe3ff"],     # deep, water, light
}
RANGES = {"size": (0.25, 4.0), "intensity": (0.0, 1.0), "motion": (0.0, 2.0), "edge": (0.0, 1.0), "known": (0.0, 1.0)}
DEFAULT_NAME = "White mist"
# The preset every Saga starts with: a soft, bright mist drifting slowly
DEFAULT_LOOK = {"display": "soft", "style": "mist", "colors": ["#7d8590", "#d3d8df", "#ffffff"], "size": 1.0,
                "intensity": 0.45, "motion": 0.6, "edge": 0.5, "known": 0.5}
MAX_PRESETS = 40
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


class FogError(ValueError):
    pass


def normalize(look: dict | None) -> dict:
    """A stored look with every field (older or partial ones get the defaults)."""
    look = dict(look or {})
    result = {**DEFAULT_LOOK, **{k: v for k, v in look.items() if k in DEFAULT_LOOK}}
    if result["style"] not in STYLES:
        result["style"] = "mist"
    if "colors" not in look and "style" in look:
        result["colors"] = list(PALETTES[result["style"]])
    return result


def update(look: dict, changes: Any) -> dict:
    """Apply changes to a look. A new style brings its colours unless colours come with it."""
    if not isinstance(changes, dict):
        raise FogError("changes must be an object")
    result = normalize(look)
    for key, value in changes.items():
        if key == "display":
            if value not in DISPLAYS:
                raise FogError(f"Display must be one of {list(DISPLAYS)}")
            result[key] = value
        elif key == "style":
            if value not in STYLES:
                raise FogError(f"Style must be one of {list(STYLES)}")
            result[key] = value
            if "colors" not in changes:
                result["colors"] = list(PALETTES[value])
        elif key == "colors":
            if not isinstance(value, list) or len(value) != 3 or not all(isinstance(c, str) and _HEX.match(c) for c in value):
                raise FogError("Colors are three colors like #a1b2c3")
            result[key] = [c.lower() for c in value]
        elif key in RANGES:
            low, high = RANGES[key]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
                raise FogError(f"{key.capitalize()} is a number from {low:g} to {high:g}")
            result[key] = round(float(value), 3)
        else:
            raise FogError(f"Unknown fog setting '{key}'")
    return result
