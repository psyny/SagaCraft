"""The map painter (plans 47 to 49): a map painted on its tiles in layers, bottom to top: terrain (grounds, water),
routes (roads and rivers joining tiles), boundaries (walls, cliffs: on painted areas' edges), scenery (forests,
mountains, settlements painted on tiles), environmental effects (fireflies, mist, embers... on tiles) and features
(unique things on a tile). Pure rules (no database, no HTTP).

What can be painted, and how each style draws it, is data: `map_painter/styles/<style>/` (style.json; terrain, routes,
scenery and features JSON; SVG sprites), see docs/concepts/map-painter-art.md. This module loads the default style's
types (the catalogue, checked on every command) and keeps the paintings.

A layer's painting (`layer["paint"]`):
    {"palette": [{"type", "colors": [a, b, c]}],        # at most 255 entries: a type in its three colours
     "tiles": RLE, "scenery": RLE,                       # per tile: its terrain's / scenery's palette index + 1
     "bounds": RLE, "effects": RLE,                      # per tile: its boundary's / effect's palette index + 1
     "roads": RLE, "road_kinds": RLE,                    # per tile: road connections (bits), its road's index + 1
     "rivers": RLE, "river_kinds": RLE, "river_out": RLE,  # rivers: connections, kind, the directions it flows out
     "features": [{"id", "type", "tile": [c, r], "size", "variant", "colors", "name", "hidden"}]}
A map's settings (`data["painter"]`): {"style", "kind": world|local, "animated"}. Plan 47's paintings ("objects",
forests and mountains as terrain) are read into this once (`normalize_paint`).

RLE: base64 of runs over the tiles, row by row (painted maps are big areas of one thing): the run's length - 1 in 7-bit
groups, low first (the high bit set on all but the last), then the value.
Connections: a bit per direction from the tile. Square grids, 8: E, SE, S, SW, W, NW, N, NE. Hex grids (odd rows
shifted right), 6: E, SE, SW, W, NW, NE. A connection is kept on both tiles; a river's "out" bit says it flows that way.
"""
from __future__ import annotations

import base64
import hashlib
import json
import random
import re
from pathlib import Path
from typing import Any

ASSETS = Path(__file__).resolve().parent.parent / "map_painter"
STYLES_DIR = ASSETS / "styles"
DEFAULT_STYLE = "storybook"
STYLES = tuple(sorted(d.name for d in STYLES_DIR.iterdir() if (d / "style.json").is_file()))
KINDS = ("world", "local")
DEFAULT_SETTINGS = {"style": DEFAULT_STYLE, "kind": "world", "animated": False}
MAX_PALETTE = 255
MAX_FEATURES = 300
MAX_FEATURE_SIZE = 4
LAYER_FILES = {"terrain": "terrain.json", "routes": "routes.json", "boundaries": "boundaries.json", "scenery": "scenery.json",
               "effects": "effects.json", "features": "features.json"}
# a painting layer painted on tiles: its channel, its types' kind
TILE_LAYERS = {"terrain": ("tiles", "terrain"), "scenery": ("scenery", "scenery"), "boundaries": ("bounds", "boundary"),
               "effects": ("effects", "effect")}
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


class PaintError(ValueError):
    pass


# -- the styles and the catalogue ---------------------------------------------------------------------------------


_PACKS: dict[str, tuple[float, dict]] = {}


def style_pack(style: str) -> dict:
    """A style as the browser gets it (one JSON): its settings, per layer its categories and types with their art, and
    its sprites (SVG text by name). Types: key, kind (terrain, road, river, scenery, feature), layer, category, name,
    the colours' roles and defaults, art. Read again when a file of the style changes (art can be edited live)."""
    if style not in STYLES:
        raise PaintError("Unknown map painting style")
    folder = STYLES_DIR / style
    stamp = max(f.stat().st_mtime for f in folder.rglob("*") if f.is_file())
    cached = _PACKS.get(style)
    if cached and cached[0] == stamp:
        return cached[1]
    pack = {"style": json.loads((folder / "style.json").read_text(encoding="utf-8")), "categories": [], "types": [], "sprites": {}}
    for layer, file in LAYER_FILES.items():
        data = json.loads((folder / file).read_text(encoding="utf-8"))
        pack["categories"] += [{**c, "layer": layer} for c in data["categories"]]
        default_kind = {"terrain": "terrain", "scenery": "scenery", "boundaries": "boundary", "effects": "effect",
                        "features": "feature"}.get(layer)
        for t in data["types"]:
            pack["types"].append({**t, "kind": t.get("kind", default_kind), "layer": layer})
    for svg in sorted((folder / "sprites").glob("*.svg")):
        pack["sprites"][svg.stem] = svg.read_text(encoding="utf-8")
    pack["version"] = hashlib.sha1(json.dumps(pack, sort_keys=True).encode("utf-8")).hexdigest()[:16]
    _PACKS[style] = (stamp, pack)
    return pack


def sprites_used(pack: dict) -> set[str]:
    """Every sprite a style's types name (their art: scenery layers, walls' towers and gates, features' parts)."""
    out: set[str] = set()
    for t in pack["types"]:
        art = t.get("art") or {}
        for layer in art.get("layers") or []:
            out.update(layer.get("sprites") or [])
        out.update((art.get(part) or {}).get("sprite") for part in ("corner", "gate") if (art.get(part) or {}).get("sprite"))
        for variant in art.get("variants") or []:
            for part in variant:
                out.add(part["sprite"])
                out.update(part.get("frames") or [])
    return out


def _catalogue() -> dict[str, dict]:
    out = {}
    for t in style_pack(DEFAULT_STYLE)["types"]:
        entry = {k: t[k] for k in ("key", "kind", "category", "name", "roles", "colors")}
        if t["kind"] == "feature":
            entry["size"] = int(t.get("size", 1))
            entry["variants"] = len(t["art"]["variants"])
        out[t["key"]] = entry
    return out


CATALOGUE: dict[str, dict] = _catalogue()


def catalogue() -> dict:
    """What can be painted (the default style's types, without their art)."""
    pack = style_pack(DEFAULT_STYLE)
    return {"categories": pack["categories"], "types": list(CATALOGUE.values())}


def _type(key: Any, kind: str | tuple[str, ...]) -> dict:
    entry = CATALOGUE.get(str(key))
    kinds = (kind,) if isinstance(kind, str) else kind
    if entry is None or entry["kind"] not in kinds:
        raise PaintError("Unknown painting type")
    return entry


def _colors(raw: Any, entry: dict) -> list[str]:
    """Three colours: the ones given (valid #rrggbb), else the type's own."""
    given = list(raw) if isinstance(raw, (list, tuple)) else []
    out = []
    for i in range(3):
        value = given[i] if i < len(given) else None
        if value is None:
            out.append(entry["colors"][i])
        elif isinstance(value, str) and _HEX.match(value):
            out.append(value.lower())
        else:
            raise PaintError("A colour is #rrggbb")
    return out


# -- RLE --------------------------------------------------------------------------------------------------------


def rle_encode(values: bytes | bytearray) -> str:
    out = bytearray()
    i, n = 0, len(values)
    while i < n:
        v = values[i]
        j = i + 1
        while j < n and values[j] == v:
            j += 1
        run = j - i - 1  # the run's length - 1, 7 bits a byte (high bit: more bytes follow), then the value
        while run >= 0x80:
            out.append((run & 0x7F) | 0x80)
            run >>= 7
        out += bytes((run, v))
        i = j
    # An all-zero channel is kept empty
    return "" if not any(values) else base64.b64encode(bytes(out)).decode("ascii")


def rle_decode(text: Any, count: int) -> bytearray:
    out = bytearray()
    if isinstance(text, str) and text:
        try:
            raw = base64.b64decode(text.encode("ascii"), validate=True)
        except (ValueError, UnicodeEncodeError):
            raise PaintError("A painting channel is broken") from None
        i = 0
        while i < len(raw) and len(out) < count:
            run, shift = 0, 0
            while i < len(raw) and raw[i] & 0x80:
                run |= (raw[i] & 0x7F) << shift
                shift += 7
                i += 1
            if i + 1 >= len(raw):
                break
            run |= raw[i] << shift
            out += bytes((raw[i + 1],)) * min(run + 1, count - len(out))
            i += 2
    out = out[:count]
    out += bytes(count - len(out))
    return out


CHANNELS = ("tiles", "scenery", "bounds", "effects", "roads", "road_kinds", "rivers", "river_kinds", "river_out")
ENTRY_CHANNELS = ("tiles", "scenery", "bounds", "effects", "road_kinds", "river_kinds")  # their values are palette entries


def default_paint() -> dict:
    return {"palette": [], **{c: "" for c in CHANNELS}, "features": []}


# Plan 47's landmarks: what they are now (settlements and ruins are scenery on their tiles; the rest features)
_OLD_OBJECTS = {"settlement.castle": "settlement.castle", "settlement.city": "settlement.city",
                "settlement.village": "settlement.village", "settlement.house": "settlement.farms",
                "landmark.ruins": "settlement.ruins", "settlement.tower": "feature.tower"}
# Plan 47's forests and mountains were terrain: their ground now (a ground type, its first colour from theirs or None)
_OLD_GROUNDS = {"trees": ("ground.grass", 2), "mountains.hills": ("ground.grass", 2), "mountains.mountain": ("ground.rock", 2),
                "mountains.peaks": ("ground.rock", None), "mountains.volcano": ("ground.ash", None)}


def _from_plan_47(raw: dict, paint: dict, grid: dict | None) -> None:
    """Plan 47's painting into this one's layers (once: it had "objects")."""
    cols, rows = (grid["cols"], grid["rows"]) if grid else (0, 0)
    count = cols * rows
    if not count:
        paint["tiles"] = ""
        return
    tiles = rle_decode(paint["tiles"], count)
    scenery = bytearray(count)
    moved: dict[int, tuple[int, int]] = {}  # old entry -> (its scenery entry, its ground entry)
    for i, v in enumerate(tiles):
        if not v or v - 1 >= len(paint["palette"]):
            continue
        old = paint["palette"][v - 1]
        info = CATALOGUE.get(old["type"])
        if not info or info["kind"] != "scenery":
            continue
        if v not in moved:
            ground_key, from_colour = _OLD_GROUNDS.get(old["type"]) or _OLD_GROUNDS.get(old["type"].split(".")[0]) or ("ground.grass", None)
            colors = list(CATALOGUE[ground_key]["colors"])
            if from_colour is not None and len(old["colors"]) > from_colour and _HEX.match(str(old["colors"][from_colour])):
                colors[0] = old["colors"][from_colour]
            if old["type"].startswith("trees."):  # their third colour was their ground, now their trunks
                old["colors"] = [*old["colors"][:2], CATALOGUE[old["type"]]["colors"][2]]
            moved[v] = (v, _entry(paint, ground_key, colors, count) + 1)
        scenery[i], tiles[i] = moved[v]
    features = []
    for o in raw.get("objects") or []:
        if not isinstance(o, dict) or not isinstance(o.get("tile"), (list, tuple)) or len(o["tile"]) != 2:
            continue
        key = _OLD_OBJECTS.get(str(o.get("type")), str(o.get("type")).replace("landmark.", "feature."))
        info = CATALOGUE.get(key)
        c, r = int(o["tile"][0]), int(o["tile"][1])
        if not info or not _in(grid, c, r):
            continue
        if info["kind"] == "scenery":
            index = _entry(paint, key, list(info["colors"]), count) + 1
            spots = [(c, r)] + ([(c + dc, r + dr) for dc, dr in directions(grid, r)] if int(o.get("size") or 1) > 1 else [])
            for cc, rr in spots:
                if _in(grid, cc, rr):
                    scenery[rr * cols + cc] = index
        elif info["kind"] == "feature":
            colors = o.get("colors") if isinstance(o.get("colors"), list) and all(_HEX.match(str(x)) for x in o["colors"][:3]) else info["colors"]
            features.append({"id": str(o.get("id") or f"f{len(features) + 1}"), "type": key, "tile": [c, r],
                             "size": max(1, min(MAX_FEATURE_SIZE, int(o.get("size") or info["size"]))),
                             "variant": int(o.get("variant") or 0) % info["variants"], "colors": list(colors[:3]),
                             "name": str(o.get("name") or info["name"])[:60], "hidden": bool(o.get("hidden"))})
    paint["tiles"], paint["scenery"] = rle_encode(tiles), rle_encode(scenery)
    paint["features"] = features[:MAX_FEATURES]
    prune(paint, count)


def normalize_paint(raw: Any, grid: dict | None = None) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    paint = default_paint()
    paint["palette"] = [{"type": str(e.get("type")), "colors": list(e.get("colors") or [])[:3]}
                        for e in (raw.get("palette") or []) if isinstance(e, dict)][:MAX_PALETTE]
    for c in CHANNELS:
        paint[c] = raw.get(c) if isinstance(raw.get(c), str) else ""
    if "objects" in raw and "features" not in raw:
        _from_plan_47(raw, paint, grid)
    else:
        paint["features"] = [dict(f) for f in (raw.get("features") or []) if isinstance(f, dict)][:MAX_FEATURES]
    if "bounds" not in raw and paint["scenery"] and grid:
        _walls_from_plan_48(paint, grid)
    return paint


# Plan 48's walled scenery drew its own walls; plan 49's walls are boundaries
_OLD_WALLS = {"settlement.castle": "wall.castle", "settlement.keep": "wall.castle", "settlement.ruins": "wall.ruined"}


def _walls_from_plan_48(paint: dict, grid: dict) -> None:
    count = grid["cols"] * grid["rows"]
    scenery = rle_decode(paint["scenery"], count)
    bounds = bytearray(count)
    walls: dict[int, int] = {}
    for i, v in enumerate(scenery):
        if not v or v - 1 >= len(paint["palette"]):
            continue
        key = _OLD_WALLS.get(paint["palette"][v - 1]["type"])
        if key is None or key not in CATALOGUE:
            continue
        if v not in walls:
            walls[v] = _entry(paint, key, list(CATALOGUE[key]["colors"]), count) + 1
        bounds[i] = walls[v]
    if walls:
        paint["bounds"] = rle_encode(bounds)


def normalize_settings(raw: Any) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    return {"style": raw.get("style") if raw.get("style") in STYLES else DEFAULT_STYLE,
            "kind": raw.get("kind") if raw.get("kind") in KINDS else "world",
            "animated": bool(raw.get("animated"))}


def set_settings(settings: dict, changes: Any) -> None:
    if not isinstance(changes, dict):
        raise PaintError("changes must be an object")
    for key, value in changes.items():
        if key == "style":
            if value not in STYLES:
                raise PaintError("Unknown map painting style")
            settings["style"] = value
        elif key == "kind":
            if value != "world":
                raise PaintError("Only world maps can be painted for now")
            settings["kind"] = value
        elif key == "animated":
            settings["animated"] = bool(value)
        else:
            raise PaintError(f"Unknown map painting setting '{key}'")


def is_empty(paint: dict) -> bool:
    return not paint.get("features") and not any(paint.get(c) for c in CHANNELS)


# -- the palette --------------------------------------------------------------------------------------------------


def _entry(paint: dict, type_key: str, colors: list[str], count: int) -> int:
    """The palette index of a type in these colours (added if new)."""
    for i, e in enumerate(paint["palette"]):
        if e["type"] == type_key and e["colors"] == colors:
            return i
    if len(paint["palette"]) >= MAX_PALETTE:
        prune(paint, count)
        if len(paint["palette"]) >= MAX_PALETTE:
            raise PaintError(f"At most {MAX_PALETTE} kinds of painting on a layer")
    paint["palette"].append({"type": type_key, "colors": colors})
    return len(paint["palette"]) - 1


def prune(paint: dict, count: int) -> None:
    """Drops the palette entries nothing uses (the channels' indexes follow)."""
    channels = {c: rle_decode(paint[c], count) for c in ENTRY_CHANNELS}
    used = {v for values in channels.values() for v in values if v}
    keep = [i for i in range(len(paint["palette"])) if i + 1 in used]
    if len(keep) == len(paint["palette"]):
        return
    remap = {old + 1: new + 1 for new, old in enumerate(keep)}
    paint["palette"] = [paint["palette"][i] for i in keep]
    for c, values in channels.items():
        paint[c] = rle_encode(bytes(remap.get(v, 0) for v in values))


# -- geometry: directions -----------------------------------------------------------------------------------------

SQUARE_DIRS = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]


def hex_dirs(row: int) -> list[tuple[int, int]]:
    s = row % 2  # odd rows sit half a tile right
    return [(1, 0), (s, 1), (s - 1, 1), (-1, 0), (s - 1, -1), (s, -1)]


def directions(grid: dict, row: int) -> list[tuple[int, int]]:
    return hex_dirs(row) if grid["type"] == "hex" else SQUARE_DIRS


def direction(grid: dict, a: tuple[int, int], b: tuple[int, int]) -> int | None:
    """The direction from tile a to its neighbour b (None: not neighbours)."""
    offset = (b[0] - a[0], b[1] - a[1])
    dirs = directions(grid, a[1])
    return dirs.index(offset) if offset in dirs else None


def _in(grid: dict, c: int, r: int) -> bool:
    return 0 <= c < grid["cols"] and 0 <= r < grid["rows"]


def _tiles(grid: dict, raw: Any, limit: int = 40000) -> list[tuple[int, int]]:
    if not isinstance(raw, list) or len(raw) > limit:
        raise PaintError("tiles must be a list")
    out = []
    for t in raw:
        if not isinstance(t, (list, tuple)) or len(t) != 2:
            raise PaintError("A tile is [column, row]")
        c, r = int(t[0]), int(t[1])
        if _in(grid, c, r):
            out.append((c, r))
    return out


# -- painting -----------------------------------------------------------------------------------------------------


def paint_tiles(paint: dict, grid: dict, type_key: Any, colors: Any, tiles: Any, layer: str = "terrain") -> None:
    """Terrain (or scenery, boundaries) on tiles; no type erases it."""
    if layer not in TILE_LAYERS:
        raise PaintError("Unknown painting layer")
    channel, kind = TILE_LAYERS[layer]
    count = grid["cols"] * grid["rows"]
    values = rle_decode(paint[channel], count)
    if type_key is None:
        index = 0
    else:
        entry = _type(type_key, kind)
        index = _entry(paint, entry["key"], _colors(colors, entry), count) + 1
    for c, r in _tiles(grid, tiles):
        values[r * grid["cols"] + c] = index
    paint[channel] = rle_encode(values)
    prune(paint, count)


def connect(paint: dict, grid: dict, channel: str, type_key: Any, colors: Any, steps: Any, erase: bool = False) -> None:
    """Roads or rivers along tiles in order: each step to a neighbouring tile joins (or, erasing, parts) the two.
    Erasing on one tile alone removes all its connections. A river flows the way it's drawn."""
    if channel not in ("road", "river"):
        raise PaintError("Unknown kind of way")
    count = grid["cols"] * grid["rows"]
    masks = rle_decode(paint[f"{channel}s"], count)
    kinds = rle_decode(paint[f"{channel}_kinds"], count)
    out = rle_decode(paint["river_out"], count) if channel == "river" else None
    tiles = _tiles(grid, steps, 2000)
    index = 0
    if not erase:
        entry = _type(type_key, channel)
        index = _entry(paint, entry["key"], _colors(colors, entry), count) + 1
    full = len(directions(grid, 0))
    opposite = lambda d: (d + full // 2) % full  # noqa: E731

    def cell(t: tuple[int, int]) -> int:
        return t[1] * grid["cols"] + t[0]

    if erase and len(tiles) == 1:
        i = cell(tiles[0])
        for d, (dc, dr) in enumerate(directions(grid, tiles[0][1])):  # its neighbours forget it too
            n = (tiles[0][0] + dc, tiles[0][1] + dr)
            if masks[i] & (1 << d) and _in(grid, *n):
                j = cell(n)
                masks[j] &= ~(1 << opposite(d)) & 0xFF
                if out is not None:
                    out[j] &= ~(1 << opposite(d)) & 0xFF
                if not masks[j]:
                    kinds[j] = 0
        masks[i], kinds[i] = 0, 0
        if out is not None:
            out[i] = 0
    for a, b in zip(tiles, tiles[1:]):
        d = direction(grid, a, b)
        if d is None:
            continue
        i, j = cell(a), cell(b)
        if erase:
            masks[i] &= ~(1 << d) & 0xFF
            masks[j] &= ~(1 << opposite(d)) & 0xFF
            if out is not None:
                out[i] &= ~(1 << d) & 0xFF
                out[j] &= ~(1 << opposite(d)) & 0xFF
            for k in (i, j):
                if not masks[k]:
                    kinds[k] = 0
        else:
            masks[i] |= 1 << d
            masks[j] |= 1 << opposite(d)
            kinds[i] = kinds[j] = index
            if out is not None:
                out[i] |= 1 << d
                out[j] &= ~(1 << opposite(d)) & 0xFF
    paint[f"{channel}s"] = rle_encode(masks)
    paint[f"{channel}_kinds"] = rle_encode(kinds)
    if out is not None:
        paint["river_out"] = rle_encode(out)
    prune(paint, count)


def clear_connections(paint: dict, count: int) -> None:
    """Directions mean another thing on another kind of grid: roads and rivers go."""
    for c in ("roads", "road_kinds", "rivers", "river_kinds", "river_out"):
        paint[c] = ""
    prune(paint, count)


def save_feature(paint: dict, grid: dict, raw: Any, new_id: str) -> dict:
    if not isinstance(raw, dict):
        raise PaintError("A feature is an object")
    features = paint["features"]
    existing = next((f for f in features if f["id"] == raw.get("id")), None) if raw.get("id") else None
    if existing is None and len(features) >= MAX_FEATURES:
        raise PaintError(f"At most {MAX_FEATURES} features on a layer")
    entry = _type(raw.get("type", existing["type"] if existing else None), "feature")
    base = existing or {"id": new_id, "type": entry["key"], "tile": [0, 0], "size": entry["size"],
                        "variant": random.randrange(entry["variants"]), "colors": list(entry["colors"]), "name": entry["name"]}
    tile = raw.get("tile", base["tile"])
    if not isinstance(tile, (list, tuple)) or len(tile) != 2 or not _in(grid, int(tile[0]), int(tile[1])):
        raise PaintError("That tile isn't on the grid")
    size = raw.get("size", base["size"])
    if isinstance(size, bool) or not isinstance(size, int) or not 1 <= size <= MAX_FEATURE_SIZE:
        raise PaintError(f"A feature covers 1 to {MAX_FEATURE_SIZE} tiles")
    variant = raw.get("variant", base["variant"])
    if isinstance(variant, bool) or not isinstance(variant, int):
        raise PaintError("A feature's look is a number")
    feature = {**base, "type": entry["key"], "tile": [int(tile[0]), int(tile[1])], "size": size,
               "variant": variant % entry["variants"], "colors": _colors(raw.get("colors", base["colors"]), entry),
               "name": str(raw.get("name", base["name"]) or entry["name"]).strip()[:60],
               "hidden": bool(raw.get("hidden", base.get("hidden", False)))}
    if existing is None:
        features.append(feature)
    else:
        features[features.index(existing)] = feature
    return feature


def delete_feature(paint: dict, feature_id: Any) -> None:
    paint["features"] = [f for f in paint["features"] if f["id"] != str(feature_id)]


# -- the grid changes ---------------------------------------------------------------------------------------------


def resize(paint: dict, old_cols: int, old_rows: int, cols: int, rows: int) -> None:
    """New columns and rows: every channel keeps its tiles from the top left (like the fog)."""
    old = old_cols * old_rows
    for c in CHANNELS:
        if not paint[c]:
            continue
        values = rle_decode(paint[c], old)
        paint[c] = rle_encode(bytes(values[r * old_cols + col] if col < old_cols and r < old_rows else 0
                                    for r in range(rows) for col in range(cols)))
    paint["features"] = [f for f in paint["features"] if f["tile"][0] < cols and f["tile"][1] < rows]
    prune(paint, cols * rows)


# -- per viewer ---------------------------------------------------------------------------------------------------


def merge(paints: list[dict], count: int) -> dict:
    """Layers' paintings seen together (bottom first): where an upper layer painted a tile (terrain, scenery, a road,
    a river), it wins; their palettes join; every layer's features show."""
    if len(paints) == 1:
        return paints[0]
    out = default_paint()
    merged = {c: bytearray(count) for c in CHANNELS}
    for paint in paints:
        if is_empty(paint):
            continue
        remap = {i + 1: _entry(out, e["type"], e["colors"], count) + 1 for i, e in enumerate(paint["palette"])}
        values = {c: rle_decode(paint[c], count) for c in CHANNELS}
        for i in range(count):
            for c in ("tiles", "scenery", "bounds", "effects"):
                if values[c][i]:
                    merged[c][i] = remap.get(values[c][i], 0)
            if values["roads"][i]:
                merged["roads"][i], merged["road_kinds"][i] = values["roads"][i], remap.get(values["road_kinds"][i], 0)
            if values["rivers"][i]:
                merged["rivers"][i], merged["river_kinds"][i] = values["rivers"][i], remap.get(values["river_kinds"][i], 0)
                merged["river_out"][i] = values["river_out"][i]
        out["features"] += paint["features"]
    for c in CHANNELS:
        out[c] = rle_encode(merged[c])
    return out


def render(paint: dict, grid: dict, shown: set[int] | None, admin: bool = True) -> dict | None:
    """A layer's painting as a viewer gets it (None: nothing painted). `shown`: the tiles a player may see (None: all).
    Hidden features and features' names are the DM's."""
    if is_empty(paint):
        return None
    count = grid["cols"] * grid["rows"]
    out: dict = {"palette": [dict(e) for e in paint["palette"]]}
    for c in CHANNELS:
        if shown is None or not paint[c]:
            out[c] = paint[c]
        else:
            values = rle_decode(paint[c], count)
            out[c] = rle_encode(bytes(v if i in shown else 0 for i, v in enumerate(values)))
    cols = grid["cols"]
    out["features"] = [
        {k: v for k, v in f.items() if admin or k != "name"}
        for f in paint["features"]
        if (admin or not f.get("hidden")) and (shown is None or f["tile"][1] * cols + f["tile"][0] in shown)
    ]
    return out
