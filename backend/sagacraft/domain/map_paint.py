"""The map painter (plan 47): terrain painted on a map's tiles, roads and rivers joining tiles, landmarks on tiles.
Pure rules (no database, no HTTP). The art lives in the frontend's shaders (frontend/src/maps/painter/); this module
is the single source of what can be painted (the catalogue) and of how a painting is kept.

A layer's painting (`layer["paint"]`):
    {"palette": [{"type", "colors": [a, b, c]}],        # at most 255 entries: a type in its three colours
     "tiles": RLE,                                       # per tile: its terrain's palette index + 1 (0: unpainted)
     "roads": RLE, "road_kinds": RLE,                    # per tile: road connections (bits), its road's index + 1
     "rivers": RLE, "river_kinds": RLE, "river_out": RLE,  # rivers: connections, kind, the directions it flows out
     "objects": [{"id", "type", "tile": [c, r], "size", "variant", "colors", "name", "hidden"}]}
A map's settings (`data["painter"]`): {"style": sketch|diorama, "kind": world|local, "animated"}.

RLE: base64 of runs over the tiles, row by row (painted maps are big areas of one thing): the run's length - 1 in 7-bit
groups, low first (the high bit set on all but the last), then the value.
Connections: a bit per direction from the tile. Square grids, 8: E, SE, S, SW, W, NW, N, NE. Hex grids (odd rows
shifted right), 6: E, SE, SW, W, NW, NE. A connection is kept on both tiles; a river's "out" bit says it flows that way.
"""
from __future__ import annotations

import base64
import random
import re
from typing import Any

STYLES = ("sketch", "diorama")
KINDS = ("world", "local")
DEFAULT_SETTINGS = {"style": "sketch", "kind": "world", "animated": False}
MAX_PALETTE = 255
MAX_OBJECTS = 300
MAX_OBJECT_SIZE = 4
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


class PaintError(ValueError):
    pass


# -- the catalogue ------------------------------------------------------------------------------------------------
# key: (kind, category, name, material, colour roles, default colours[, object size, variants])
# kind: terrain | road | river | object. material: the shader's number for it (frontend/src/maps/painter/).

CATEGORIES = {
    "ground": "Ground", "grass": "Grass", "trees": "Trees", "mountains": "Mountains", "water": "Water",
    "roads": "Roads", "rivers": "Rivers", "settlements": "Settlements", "landmarks": "Landmarks",
}

_TERRAIN = [
    ("ground.grass", "ground", "Grassland", 1, ("Ground", "Strokes", "Light"), ("#cdc98d", "#8f9a58", "#e6dfb0")),
    ("ground.sand", "ground", "Sand", 2, ("Sand", "Dots", "Light"), ("#e8d49a", "#b8985a", "#f6eac4")),
    ("ground.dirt", "ground", "Cracked dirt", 3, ("Dirt", "Cracks", "Light"), ("#c49a68", "#6e4a2c", "#dcb98e")),
    ("ground.rock", "ground", "Rock", 4, ("Rock", "Cracks", "Light"), ("#aaa497", "#5f5a52", "#d2cdc2")),
    ("ground.snow", "ground", "Snow", 5, ("Snow", "Shadow", "Sparkle"), ("#eef1f5", "#b4c3d4", "#ffffff")),
    ("ground.marsh", "ground", "Marsh", 6, ("Ground", "Water", "Reeds"), ("#9ea36c", "#6f8f88", "#4f5c2e")),
    ("ground.fields", "ground", "Farmland", 7, ("Crops", "Furrows", "Hedges"), ("#d9c274", "#a28b3e", "#6d7a3a")),
    ("grass.low", "grass", "Low grass", 10, ("Ground", "Tufts", "Light"), ("#bcc57f", "#6f8a3e", "#e0e4ab")),
    ("grass.tall", "grass", "Tall grass", 11, ("Ground", "Tufts", "Light"), ("#a6b368", "#55702e", "#cfd894")),
    ("trees.pine", "trees", "Pine forest", 20, ("Needles", "Shade", "Ground"), ("#56744a", "#2c4230", "#a7b27c")),
    ("trees.broadleaf", "trees", "Broadleaf forest", 21, ("Leaves", "Shade", "Ground"), ("#76964e", "#3f5c2c", "#adb97f")),
    ("trees.redwood", "trees", "Redwood forest", 22, ("Needles", "Trunks", "Ground"), ("#41603d", "#8a4a2a", "#97a06e")),
    ("trees.dead", "trees", "Dead trees", 23, ("Branches", "Shade", "Ground"), ("#6b5a48", "#3e342a", "#bfae8c")),
    ("trees.palm", "trees", "Palms", 24, ("Fronds", "Shade", "Ground"), ("#62a04c", "#356b2c", "#e6d59c")),
    ("mountains.hills", "mountains", "Hills", 30, ("Light side", "Shade", "Grass"), ("#cdb98d", "#8f7a58", "#aab37b")),
    ("mountains.mountain", "mountains", "Mountains", 31, ("Light side", "Shade", "Foot"), ("#bab8b2", "#6e6b69", "#aaa49a")),
    ("mountains.peaks", "mountains", "Snowy peaks", 32, ("Light side", "Shade", "Snow"), ("#c8ccd2", "#7f838e", "#ffffff")),
    ("mountains.volcano", "mountains", "Volcano", 33, ("Rock", "Shade", "Lava"), ("#7a6a60", "#3e3430", "#e8542a")),
    ("water.ocean", "water", "Ocean", 40, ("Water", "Deep", "Foam"), ("#76a3bb", "#4a7894", "#dcf0f6")),
    ("water.lake", "water", "Lake", 41, ("Water", "Deep", "Shore"), ("#93c2d1", "#5f93a8", "#e4f3f7")),
]
_WAYS = [
    ("road.dirt", "road", "roads", "Dirt road", 50, ("Road", "Edge", "Ruts"), ("#c8a676", "#6b4e2e", "#9c7a4e")),
    ("road.paved", "road", "roads", "Paved road", 51, ("Stones", "Edge", "Joints"), ("#c2bcae", "#5f5a52", "#8e887c")),
    ("road.trail", "road", "roads", "Trail", 52, ("Trail", "Edge", "Dust"), ("#8a6a44", "#4a3a26", "#c8b088")),
    ("river.river", "river", "rivers", "River", 60, ("Water", "Bank", "Light"), ("#86b8cc", "#3f6f86", "#e2f2f7")),
    ("river.stream", "river", "rivers", "Stream", 61, ("Water", "Bank", "Light"), ("#93c3d4", "#4a7a90", "#e8f5f9")),
]
_OBJECTS = [
    ("settlement.castle", "settlements", "Castle", 100, ("Walls", "Roofs", "Banners"), ("#b9b2a5", "#58627a", "#b23a3a"), 2, 3),
    ("settlement.city", "settlements", "City", 101, ("Walls", "Roofs", "Towers"), ("#d2c3a2", "#a5533c", "#6c5d4b"), 2, 3),
    ("settlement.village", "settlements", "Village", 102, ("Walls", "Roofs", "Fields"), ("#dccca6", "#8c5a3a", "#8a9a4a"), 1, 3),
    ("settlement.house", "settlements", "Farm", 103, ("Walls", "Roof", "Fence"), ("#dccca6", "#9a4e34", "#7a5a3a"), 1, 2),
    ("settlement.tower", "settlements", "Tower", 104, ("Stone", "Roof", "Light"), ("#aaa295", "#4a5568", "#e0b84a"), 1, 3),
    ("landmark.mine", "landmarks", "Mine", 110, ("Rock", "Timber", "Dark"), ("#9a907e", "#6b4e2e", "#1e1a16"), 1, 2),
    ("landmark.ruins", "landmarks", "Ruins", 111, ("Stone", "Shade", "Moss"), ("#b0a898", "#77705f", "#6d8a4a"), 1, 3),
    ("landmark.temple", "landmarks", "Temple", 112, ("Stone", "Roof", "Gold"), ("#e2dacb", "#b39a6a", "#d8aa3a"), 1, 2),
    ("landmark.stones", "landmarks", "Standing stones", 113, ("Stone", "Shade", "Moss"), ("#a29d92", "#666158", "#6d8a4a"), 1, 2),
    ("landmark.windmill", "landmarks", "Windmill", 114, ("Walls", "Sails", "Roof"), ("#e2d3b4", "#8a6a4a", "#7a4a3a"), 1, 2),
    ("landmark.lighthouse", "landmarks", "Lighthouse", 115, ("Walls", "Stripes", "Light"), ("#ece5d6", "#b23a3a", "#ffd86a"), 1, 2),
    ("landmark.camp", "landmarks", "Camp", 116, ("Tents", "Shade", "Fire"), ("#cfae80", "#8a5a3a", "#e8702a"), 1, 2),
    ("landmark.cave", "landmarks", "Cave", 117, ("Rock", "Shade", "Dark"), ("#9a907e", "#5a5248", "#1a1612"), 1, 2),
    ("landmark.portal", "landmarks", "Portal", 118, ("Stone", "Shade", "Glow"), ("#a8a3b5", "#5e5a6e", "#8a6aff"), 1, 2),
]

CATALOGUE: dict[str, dict] = {}
for key, category, name, material, roles, colors in _TERRAIN:
    CATALOGUE[key] = {"key": key, "kind": "terrain", "category": category, "name": name, "material": material,
                      "roles": list(roles), "colors": list(colors)}
for key, kind, category, name, material, roles, colors in _WAYS:
    CATALOGUE[key] = {"key": key, "kind": kind, "category": category, "name": name, "material": material,
                      "roles": list(roles), "colors": list(colors)}
for key, category, name, material, roles, colors, size, variants in _OBJECTS:
    CATALOGUE[key] = {"key": key, "kind": "object", "category": category, "name": name, "material": material,
                      "roles": list(roles), "colors": list(colors), "size": size, "variants": variants}


def catalogue() -> dict:
    """What the editor offers: the categories and every type (the order is the menus')."""
    return {"categories": [{"key": k, "name": v} for k, v in CATEGORIES.items()], "types": list(CATALOGUE.values())}


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


CHANNELS = ("tiles", "roads", "road_kinds", "rivers", "river_kinds", "river_out")


def default_paint() -> dict:
    return {"palette": [], **{c: "" for c in CHANNELS}, "objects": []}


def normalize_paint(raw: Any) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    paint = default_paint()
    paint["palette"] = [{"type": str(e.get("type")), "colors": list(e.get("colors") or [])[:3]}
                        for e in (raw.get("palette") or []) if isinstance(e, dict)][:MAX_PALETTE]
    for c in CHANNELS:
        paint[c] = raw.get(c) if isinstance(raw.get(c), str) else ""
    paint["objects"] = [dict(o) for o in (raw.get("objects") or []) if isinstance(o, dict)][:MAX_OBJECTS]
    return paint


def normalize_settings(raw: Any) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    return {"style": raw.get("style") if raw.get("style") in STYLES else "sketch",
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
    return not paint.get("objects") and not any(paint.get(c) for c in CHANNELS)


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
    channels = {c: rle_decode(paint[c], count) for c in ("tiles", "road_kinds", "river_kinds")}
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


def paint_tiles(paint: dict, grid: dict, type_key: Any, colors: Any, tiles: Any) -> None:
    """Terrain on tiles; no type erases it."""
    count = grid["cols"] * grid["rows"]
    values = rle_decode(paint["tiles"], count)
    if type_key is None:
        index = 0
    else:
        entry = _type(type_key, "terrain")
        index = _entry(paint, entry["key"], _colors(colors, entry), count) + 1
    for c, r in _tiles(grid, tiles):
        values[r * grid["cols"] + c] = index
    paint["tiles"] = rle_encode(values)
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


def save_object(paint: dict, grid: dict, raw: Any, new_id: str) -> dict:
    if not isinstance(raw, dict):
        raise PaintError("An object is an object")
    objects = paint["objects"]
    existing = next((o for o in objects if o["id"] == raw.get("id")), None) if raw.get("id") else None
    if existing is None and len(objects) >= MAX_OBJECTS:
        raise PaintError(f"At most {MAX_OBJECTS} landmarks on a layer")
    entry = _type(raw.get("type", existing["type"] if existing else None), "object")
    base = existing or {"id": new_id, "type": entry["key"], "tile": [0, 0], "size": entry["size"],
                        "variant": random.randrange(entry["variants"]), "colors": list(entry["colors"]), "name": entry["name"]}
    tile = raw.get("tile", base["tile"])
    if not isinstance(tile, (list, tuple)) or len(tile) != 2 or not _in(grid, int(tile[0]), int(tile[1])):
        raise PaintError("That tile isn't on the grid")
    size = raw.get("size", base["size"])
    if isinstance(size, bool) or not isinstance(size, int) or not 1 <= size <= MAX_OBJECT_SIZE:
        raise PaintError(f"A landmark covers 1 to {MAX_OBJECT_SIZE} tiles")
    variant = raw.get("variant", base["variant"])
    if isinstance(variant, bool) or not isinstance(variant, int):
        raise PaintError("A landmark's look is a number")
    obj = {**base, "type": entry["key"], "tile": [int(tile[0]), int(tile[1])], "size": size,
           "variant": variant % entry["variants"], "colors": _colors(raw.get("colors", base["colors"]), entry),
           "name": str(raw.get("name", base["name"]) or entry["name"]).strip()[:60],
           "hidden": bool(raw.get("hidden", base.get("hidden", False)))}
    if existing is None:
        objects.append(obj)
    else:
        objects[objects.index(existing)] = obj
    return obj


def delete_object(paint: dict, object_id: Any) -> None:
    paint["objects"] = [o for o in paint["objects"] if o["id"] != str(object_id)]


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
    paint["objects"] = [o for o in paint["objects"] if o["tile"][0] < cols and o["tile"][1] < rows]
    prune(paint, cols * rows)


# -- per viewer ---------------------------------------------------------------------------------------------------


def merge(paints: list[dict], count: int) -> dict:
    """Layers' paintings seen together (bottom first): where an upper layer painted a tile (terrain, a road, a river),
    it wins; their palettes join; every layer's landmarks show."""
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
            if values["tiles"][i]:
                merged["tiles"][i] = remap.get(values["tiles"][i], 0)
            if values["roads"][i]:
                merged["roads"][i], merged["road_kinds"][i] = values["roads"][i], remap.get(values["road_kinds"][i], 0)
            if values["rivers"][i]:
                merged["rivers"][i], merged["river_kinds"][i] = values["rivers"][i], remap.get(values["river_kinds"][i], 0)
                merged["river_out"][i] = values["river_out"][i]
        out["objects"] += paint["objects"]
    for c in CHANNELS:
        out[c] = rle_encode(merged[c])
    return out



def render(paint: dict, grid: dict, shown: set[int] | None, admin: bool = True) -> dict | None:
    """A layer's painting as a viewer gets it (None: nothing painted). `shown`: the tiles a player may see (None: all).
    Palette entries carry their shader material, so viewers need no catalogue; landmarks' names are the DM's."""
    if is_empty(paint):
        return None
    count = grid["cols"] * grid["rows"]
    # (a type gone from the catalogue: material 0, drawn as nothing)
    out: dict = {"palette": [{**e, "material": CATALOGUE.get(e["type"], {}).get("material", 0)} for e in paint["palette"]]}
    for c in CHANNELS:
        if shown is None or not paint[c]:
            out[c] = paint[c]
        else:
            values = rle_decode(paint[c], count)
            out[c] = rle_encode(bytes(v if i in shown else 0 for i, v in enumerate(values)))
    cols = grid["cols"]
    out["objects"] = [
        {k: v for k, v in o.items() if admin or k != "name"} | {"material": CATALOGUE.get(o["type"], {}).get("material", 0)}
        for o in paint["objects"]
        if (admin or not o.get("hidden")) and (shown is None or o["tile"][1] * cols + o["tile"][0] in shown)
    ]
    return out
