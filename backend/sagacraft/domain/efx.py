"""EFX (environment effects): environments built by the DM and shown on Stages. Pure rules.

An **environment** has three layers, back to front: **far** (the sky, space, colours, an opaque picture), **near**
(landscapes, abstract light, a transparent picture; often empty) and **fore** (weather and the like, drawn over the
Stage without catching clicks). Each layer holds up to MAX_EFFECTS **effects**, drawn in order. An effect is one
of the catalog's kinds with its settings, and for the animated ones an **intensity range** (0..100) and how often
it **varies** (seconds; 0: steady): every `vary` seconds the intensity eases to a new value inside the range, the
same on every screen (it follows the clock).

The catalog is the single source of the kinds, their settings and limits: the frontend builds its editor from it,
and the server checks every change against it. See docs/concepts/efx.md.
"""
import copy
import re
import uuid
from typing import Any

LAYERS = ("far", "near", "fore")
MAX_EFFECTS = 4
MAX_VARY = 600
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


class EfxError(ValueError):
    pass


def _num(key, label, lo, hi, default, step=1):
    return {"key": key, "label": label, "type": "number", "min": lo, "max": hi, "step": step, "default": default}


def _color(key, label, default):
    return {"key": key, "label": label, "type": "color", "default": default}


def _choice(key, label, options, default):
    return {"key": key, "label": label, "type": "choice", "options": options, "default": default}


def _bool(key, label, default):
    return {"key": key, "label": label, "type": "bool", "default": default}


def _image(key, label):
    return {"key": key, "label": label, "type": "image", "default": None}


ABSTRACT_STYLES = [["bokeh", "Bokeh"], ["aurora", "Aurora"], ["flow", "Silk"], ["rays", "Light rays"], ["dust", "Dust motes"]]
WEATHER = [["rain", "Rain"], ["storm", "Storm"], ["snow", "Snow"], ["hail", "Hail"], ["sandstorm", "Sandstorm"],
           ["leaves", "Leaves"], ["wind", "Wind"], ["embers", "Embers"], ["ash", "Dark motes"], ["fireflies", "Fireflies"]]

# kind -> name, what its intensity drives (None: not animated that way), its settings
EFFECTS: dict[str, dict] = {
    "gradient": {"name": "Colours", "intensity": None, "params": [
        _choice("style", "Style", [["plain", "Plain"], ["vertical", "Top to bottom"], ["radial", "From the middle"]], "vertical"),
        _color("top", "Top (or middle)", "#141a33"), _color("bottom", "Bottom (or edges)", "#3d2a4f")]},
    "sky": {"name": "Sky", "intensity": "Clouds", "params": [
        _choice("time", "Time of day", [["dawn", "Dawn"], ["day", "Day"], ["dusk", "Dusk"], ["night", "Night"]], "dusk"),
        _bool("sun", "Sun", True), _bool("moon", "Moon", True), _num("height", "Sun or moon height", 0, 100, 35),
        _num("stars", "Stars", 0, 100, 60), _color("clouds", "Cloud colour", "#ffffff"), _num("wind", "Wind", 0, 100, 20)]},
    "space": {"name": "Space", "intensity": "Nebula glow", "params": [
        _color("nebula_a", "Nebula", "#6a2c91"), _color("nebula_b", "Nebula (second)", "#1d6f8f"),
        _num("stars", "Stars", 0, 100, 70), _bool("planet", "A planet", True), _color("planet_color", "Planet colour", "#c98a4b"),
        _num("planet_size", "Planet size", 5, 100, 35), _num("drift", "Drift", 0, 100, 15)]},
    "abstract": {"name": "Abstract", "intensity": "Amount", "params": [
        _choice("style", "Style", ABSTRACT_STYLES, "bokeh"), _color("color_a", "Colour", "#f2c46d"),
        _color("color_b", "Second colour", "#7a5cff"), _num("size", "Size", 0, 100, 50), _num("speed", "Speed", 0, 100, 30)]},
    "image": {"name": "Picture", "intensity": None, "params": [
        _image("file", "Picture"), _choice("fit", "Fit", [["cover", "Fill"], ["contain", "Whole picture"]], "cover"),
        _choice("align", "Align", [["center", "Middle"], ["bottom", "Bottom"]], "center"), _bool("drift", "Slow drift", False)]},
    "landscape": {"name": "Landscape", "intensity": "Wind", "params": [
        _bool("mountains", "Mountains", True), _bool("hills", "Hills", False), _bool("forest", "Forest", True),
        _bool("water", "Water", False), _bool("buildings", "Buildings", False), _color("color", "Silhouettes", "#151826"),
        _color("haze", "Haze (far away)", "#55618a"), _num("height", "Height", 10, 90, 45), _num("seed", "Variation", 1, 999, 7)]},
    "weather": {"name": "Weather", "intensity": "Amount", "params": [
        _choice("kind", "Weather", WEATHER, "rain"), _num("wind", "Wind", -100, 100, 15), _num("size", "Size", 50, 200, 100),
        _num("chaos", "Chaos (gusts, swirls)", 0, 100, 30), _num("length", "Length (streaks)", 0, 100, 50),
        _color("color", "Colour", "#cfd8ea")]},
    "fog": {"name": "Fog", "intensity": "Density", "params": [
        _num("speed", "Speed (← left, right →)", -100, 100, 25), _num("size", "Size of the banks", 0, 100, 50),
        _num("opacity", "Opacity", 0, 100, 65), _num("ground", "Lies low", 0, 100, 40), _color("color", "Colour", "#d9dee8")]},
    "vignette": {"name": "Vignette", "intensity": "Darkness", "params": [
        _color("color", "Colour", "#000000"), _num("size", "Size", 0, 100, 50)]},
}

LAYER_EFFECTS: dict[str, tuple[str, ...]] = {
    "far": ("gradient", "sky", "space", "abstract", "image"),
    "near": ("landscape", "fog", "abstract", "image"),
    "fore": ("weather", "fog", "abstract", "vignette"),
}
LAYER_NAMES = {"far": "Far background", "near": "Near background", "fore": "Foreground"}


def catalog() -> dict:
    return {"layers": {k: list(v) for k, v in LAYER_EFFECTS.items()}, "layer_names": LAYER_NAMES,
            "effects": copy.deepcopy(EFFECTS), "max_effects": MAX_EFFECTS, "max_vary": MAX_VARY}


def default_params(kind: str) -> dict:
    return {p["key"]: p["default"] for p in EFFECTS[kind]["params"]}


def new_effect(kind: str, /, **params) -> dict:
    animated = EFFECTS[kind]["intensity"] is not None
    return {"id": uuid.uuid4().hex[:8], "kind": kind, "params": {**default_params(kind), **params},
            "intensity": [40, 60] if animated else [50, 50], "vary": 60 if animated else 0}


def empty_layers() -> dict:
    return {layer: {"effects": []} for layer in LAYERS}


def _param(spec: dict, value: Any) -> Any:
    label = spec["label"]
    kind = spec["type"]
    if kind == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise EfxError(f"{label}: a number")
        return max(spec["min"], min(spec["max"], round(float(value), 2)))
    if kind == "color":
        if not isinstance(value, str) or not _HEX.match(value):
            raise EfxError(f"{label}: a colour like #a1b2c3")
        return value.lower()
    if kind == "choice":
        if value not in [o[0] for o in spec["options"]]:
            raise EfxError(f"{label}: one of {[o[0] for o in spec['options']]}")
        return value
    if kind == "bool":
        return bool(value)
    if kind == "image":
        if value is not None and (isinstance(value, bool) or not isinstance(value, int)):
            raise EfxError(f"{label}: an uploaded picture")
        return value
    raise EfxError(f"Unknown setting type {kind}")


def clean_effect(layer: str, raw: Any) -> dict:
    if not isinstance(raw, dict):
        raise EfxError("An effect is {kind, params, intensity, vary}")
    kind = raw.get("kind")
    if kind not in LAYER_EFFECTS[layer]:
        raise EfxError(f"{LAYER_NAMES[layer]}: effects are {list(LAYER_EFFECTS[layer])}")
    specs = {p["key"]: p for p in EFFECTS[kind]["params"]}
    params = default_params(kind)
    for key, value in (raw.get("params") or {}).items():
        if key not in specs:
            raise EfxError(f"Unknown setting '{key}' for {EFFECTS[kind]['name']}")
        params[key] = _param(specs[key], value)
    span = raw.get("intensity", [50, 50])
    if (not isinstance(span, list) or len(span) != 2
            or any(isinstance(v, bool) or not isinstance(v, (int, float)) for v in span)):
        raise EfxError("intensity: [from, to], 0 to 100")
    lo, hi = sorted(max(0.0, min(100.0, float(v))) for v in span)
    vary = raw.get("vary", 0)
    if isinstance(vary, bool) or not isinstance(vary, (int, float)) or not 0 <= vary <= MAX_VARY:
        raise EfxError(f"vary: 0 to {MAX_VARY} seconds")
    effect_id = raw.get("id")
    if not isinstance(effect_id, str) or not re.match(r"^[a-z0-9]{1,16}$", effect_id):
        effect_id = uuid.uuid4().hex[:8]
    return {"id": effect_id, "kind": kind, "params": params, "intensity": [round(lo, 1), round(hi, 1)], "vary": round(float(vary), 1)}


def clean_layer(layer: str, raw: Any) -> dict:
    if layer not in LAYERS:
        raise EfxError(f"Layers are {list(LAYERS)}")
    effects = (raw or {}).get("effects") if isinstance(raw, dict) else None
    if not isinstance(effects, list):
        raise EfxError(f"{LAYER_NAMES[layer]}: {{effects: [...]}}")
    if len(effects) > MAX_EFFECTS:
        raise EfxError(f"At most {MAX_EFFECTS} effects per layer")
    cleaned = [clean_effect(layer, e) for e in effects]
    if len({e["id"] for e in cleaned}) != len(cleaned):
        for e in cleaned:
            e["id"] = uuid.uuid4().hex[:8]
    return {"effects": cleaned}


def files_in(layers: dict) -> set[int]:
    """Uploaded pictures an environment uses."""
    out = set()
    for layer in LAYERS:
        for effect in (layers.get(layer) or {}).get("effects", []):
            for spec in EFFECTS.get(effect.get("kind"), {}).get("params", []):
                value = effect.get("params", {}).get(spec["key"])
                if spec["type"] == "image" and isinstance(value, int):
                    out.add(value)
    return out


def _fx(kind, intensity=(40, 60), vary=60, /, **params):
    effect = new_effect(kind, **params)
    effect["intensity"] = list(intensity)
    effect["vary"] = vary if EFFECTS[kind]["intensity"] else 0
    return effect


def examples() -> dict[str, dict]:
    """Starting points the DM can add in one click (our own, no copied content)."""
    return {
        "starry_night": {"name": "Starry night", "far": [_fx("sky", (15, 30), 90, time="night", stars=85, height=60)],
                         "near": [_fx("landscape", (5, 20), 60, mountains=True, forest=True, color="#0b0d18", haze="#2b3560", seed=12)],
                         "fore": [_fx("weather", (20, 35), 60, kind="fireflies", color="#ffe9a3")]},
        "stormy_coast": {"name": "Stormy coast", "far": [_fx("sky", (70, 95), 45, time="night", stars=0, moon=False, clouds="#9aa3b5", wind=60)],
                         "near": [_fx("landscape", (40, 80), 45, mountains=False, hills=True, forest=False, water=True, color="#0d1118", haze="#3a4659", seed=31),
                                  _fx("fog", (30, 55), 60, speed=-35, size=60, opacity=45, ground=70, color="#8d97a8")],
                         "fore": [_fx("weather", (50, 85), 40, kind="storm", wind=-35), _fx("vignette", (45, 60), 30, size=55)]},
        "deep_space": {"name": "Deep space", "far": [_fx("space", (55, 80), 120, drift=10)], "near": [],
                       "fore": [_fx("abstract", (15, 25), 90, style="dust", color_a="#c8d6ff", size=20, speed=10)]},
        "autumn_forest": {"name": "Autumn forest", "far": [_fx("sky", (30, 50), 90, time="day", height=70, stars=0)],
                          "near": [_fx("landscape", (20, 45), 60, mountains=True, hills=True, forest=True, color="#2a1d1a", haze="#9a8f86", seed=44)],
                          "fore": [_fx("weather", (25, 55), 60, kind="leaves", wind=30)]},
        "desert_noon": {"name": "Desert noon", "far": [_fx("sky", (0, 15), 120, time="day", height=85, stars=0, moon=False)],
                        "near": [_fx("landscape", (10, 30), 60, mountains=False, hills=True, forest=False, color="#8a5a32", haze="#e0b583", seed=5)],
                        "fore": [_fx("weather", (10, 60), 90, kind="sandstorm", wind=60, color="#e2b47a")]},
        "ember_cave": {"name": "Ember cave", "far": [_fx("gradient", style="radial", top="#3a1208", bottom="#050203")],
                       "near": [_fx("abstract", (30, 50), 60, style="bokeh", color_a="#ff8a3d", color_b="#ff3d1f", size=35, speed=15)],
                       "fore": [_fx("weather", (40, 70), 45, kind="embers", wind=10, chaos=55, length=45), _fx("vignette", (55, 70), 20, size=60)]},
        "dreamscape": {"name": "Dreamscape", "far": [_fx("gradient", style="vertical", top="#0f0c29", bottom="#302b63"),
                                                     _fx("abstract", (50, 70), 90, style="aurora", color_a="#4ef2c6", color_b="#a35cff", speed=25)],
                       "near": [_fx("abstract", (25, 45), 60, style="bokeh", color_a="#ffd1f0", color_b="#8fd3ff", size=25, speed=20)],
                       "fore": [_fx("abstract", (15, 30), 60, style="bokeh", color_a="#ffffff", color_b="#ffd1f0", size=85, speed=35)]},
    }


KINDS = ("stage", "weather")


def weather_presets() -> dict[str, dict]:
    """A Saga's first map weathers (plan 48): effects over a map (a map weather uses only the foreground)."""
    return {
        "clear": {"name": "Clear", "fore": [_fx("abstract", (12, 22), 90, style="dust", color_a="#fff6dc", color_b="#ffffff", size=18, speed=12)]},
        "light_rain": {"name": "Light rain", "fore": [_fx("weather", (18, 32), 60, kind="rain", wind=12, length=45)]},
        "heavy_rain": {"name": "Heavy rain", "fore": [_fx("weather", (60, 85), 45, kind="rain", wind=22, length=70),
                                                       _fx("fog", (15, 30), 60, speed=20, size=55, opacity=30, ground=40, color="#9aa6b8")]},
        "thunderstorm": {"name": "Thunderstorm", "fore": [_fx("weather", (70, 95), 40, kind="storm", wind=-35),
                                                           _fx("vignette", (35, 50), 30, size=55)]},
        "light_snow": {"name": "Light snow", "fore": [_fx("weather", (15, 30), 60, kind="snow", wind=8, chaos=35)]},
        "heavy_snow": {"name": "Heavy snow", "fore": [_fx("weather", (55, 80), 45, kind="snow", wind=15, chaos=45, size=120)]},
        "snowstorm": {"name": "Snowstorm", "fore": [_fx("weather", (80, 100), 30, kind="snow", wind=75, chaos=70, size=110),
                                                     _fx("fog", (35, 60), 40, speed=70, size=45, opacity=45, ground=30, color="#e8eef6")]},
        "sandy_wind": {"name": "Sandy wind", "fore": [_fx("weather", (15, 35), 60, kind="sandstorm", wind=55, color="#e2c48e")]},
        "sandstorm": {"name": "Sandstorm", "fore": [_fx("weather", (70, 95), 40, kind="sandstorm", wind=80, color="#d9a866"),
                                                     _fx("fog", (45, 70), 40, speed=80, size=50, opacity=55, ground=20, color="#c99a5e")]},
        "mist": {"name": "Mist", "fore": [_fx("fog", (35, 60), 90, speed=12, size=65, opacity=45, ground=55, color="#dfe5ec")]},
        "falling_leaves": {"name": "Falling leaves", "fore": [_fx("weather", (20, 45), 60, kind="leaves", wind=30)]},
        "emberfall": {"name": "Emberfall", "fore": [_fx("weather", (35, 65), 45, kind="embers", wind=10, chaos=55, length=45)]},
        "ashfall": {"name": "Ashfall", "fore": [_fx("weather", (30, 55), 60, kind="ash", wind=12, chaos=40)]},
    }
