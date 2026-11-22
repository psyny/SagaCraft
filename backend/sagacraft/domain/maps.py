"""Location maps: pictures, grid, fog of war, links on tiles, paths and regions. Pure rules (no database, no HTTP).

A map's data:
    {"images": [{"id", "file_id", "x", "y", "w", "h", "scale"}],      # in map px; w, h: the file's size
     "grid": {"type": none|square|hex, "size", "x", "y", "cols", "rows", "auto",
              "unit_size", "unit", "color", "opacity", "mode": color|contrast|inverse, "line"},
     "fog": {"enabled", "layers": {member_group_id: "0120..."}},     # one char per tile: 0 unknown, 1 known, 2 visible
     "links": [{"tile": [col, row], "resource_id"}],
     "paths": [{"id", "name", "tiles": [[col, row], ...], "color", "width", "body", "head", "tail", "render",
                "visibility"}],
     "regions": [{"id", "name", "tiles": [[col, row], ...], "show": fill|border|both, "color" (border), "fill",
                  "opacity" (fill), "width", "line": solid|dashed|dotted, "render": poly|spline, "label",
                  "visibility"}],
     "next_id": int}

Tiles are counted from the grid's top left corner (the origin): column, row. Resizing the grid adds or drops
tiles at the last columns and rows, so everything on a tile (fog, links, paths, regions) stays on it. Hex grids are
pointy-top, odd rows shifted right by half a tile ("odd-r"); a hex's size is its width.
See docs/concepts/locations.md.
"""
import copy
import math
import re
from typing import Any, Iterable

GRID_TYPES = ("none", "square", "hex")
GRID_MODES = ("color", "contrast", "inverse")
UNKNOWN, KNOWN, VISIBLE = "0", "1", "2"
FOG_STATES = (UNKNOWN, KNOWN, VISIBLE)
PATH_BODIES = ("solid", "dashed", "dotted", "arrows", "arrowheads")
PATH_ENDS = ("none", "arrow", "circle")
PATH_RENDERS = ("poly", "spline")
REGION_SHOWS = ("fill", "border", "both")
REGION_LINES = ("solid", "dashed", "dotted")
MAX_TILES = 40000
MAX_SIDE = 400
MAX_LINKS_PER_TILE = 12
MAX_PATHS = 60
MAX_PATH_TILES = 600
MAX_REGIONS = 60
LABEL_PINS = ("pin", "dot", "star", "flag", "diamond", "none")
LABEL_SIDES = ("above", "left", "right")
LABEL_SIZES = ("small", "medium", "large")
MAX_LABELS = 200
MAX_REGION_TILES = 10000
MIN_SIZE, MAX_SIZE = 8, 1024
SQRT3 = math.sqrt(3)
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

Tile = tuple[int, int]


class MapError(ValueError):
    pass


def default_grid() -> dict:
    return {"type": "square", "size": 64, "x": 0, "y": 0, "cols": 16, "rows": 12, "auto": True,
            "unit_size": 5, "unit": "ft", "color": "#ffffff", "opacity": 0.35, "mode": "color", "line": 1}


def default_map() -> dict:
    return {"images": [], "grid": default_grid(), "fog": {"enabled": False, "layers": {}}, "links": [], "paths": [],
            "regions": [], "labels": [], "next_id": 1}


def normalize(data: dict | None) -> dict:
    result = default_map()
    data = copy.deepcopy(data or {})
    result.update({k: v for k, v in data.items() if k in result})
    result["grid"] = {**default_grid(), **(data.get("grid") or {})}
    result["fog"] = {"enabled": bool((data.get("fog") or {}).get("enabled")), "layers": dict((data.get("fog") or {}).get("layers") or {})}
    n = tile_count(result["grid"])
    for key, layer in list(result["fog"]["layers"].items()):
        result["fog"]["layers"][key] = (str(layer) + UNKNOWN * n)[:n]
    return result


# -- geometry -----------------------------------------------------------------


def hex_radius(grid: dict) -> float:
    return grid["size"] / SQRT3


def tile_count(grid: dict) -> int:
    return int(grid["cols"]) * int(grid["rows"])


def in_grid(grid: dict, tile: Tile) -> bool:
    return 0 <= tile[0] < grid["cols"] and 0 <= tile[1] < grid["rows"]


def tile_center(grid: dict, col: int, row: int) -> tuple[float, float]:
    size = grid["size"]
    if grid["type"] == "hex":
        r = hex_radius(grid)
        return grid["x"] + size * (col + 0.5 + (0.5 if row % 2 else 0)), grid["y"] + r + row * 1.5 * r
    return grid["x"] + size * (col + 0.5), grid["y"] + size * (row + 0.5)


def tile_polygon(grid: dict, col: int, row: int) -> list[tuple[float, float]]:
    cx, cy = tile_center(grid, col, row)
    if grid["type"] == "hex":
        r = hex_radius(grid)
        return [(cx + r * math.cos(math.radians(60 * i - 30)), cy + r * math.sin(math.radians(60 * i - 30))) for i in range(6)]
    h = grid["size"] / 2
    return [(cx - h, cy - h), (cx + h, cy - h), (cx + h, cy + h), (cx - h, cy + h)]


def neighbours(grid: dict, col: int, row: int) -> list[Tile]:
    """The tiles touching one (square: eight, corners included; hex: six), on the grid."""
    if grid["type"] == "hex":
        shift = row % 2  # odd rows sit half a tile right
        around = [(-1, 0), (1, 0), (shift - 1, -1), (shift, -1), (shift - 1, 1), (shift, 1)]
    else:
        around = [(dc, dr) for dr in (-1, 0, 1) for dc in (-1, 0, 1) if dc or dr]
    return [(col + dc, row + dr) for dc, dr in around if in_grid(grid, (col + dc, row + dr))]


def shown_tiles(fog: str, grid: dict) -> set[int]:
    """Tiles whose picture a member gets: the ones they know (known or visible) and the unknown tiles touching
    them (the immersive fog's soft edge is drawn there, so what they know stays fully shown)."""
    cols = grid["cols"]
    known = {i for i, state in enumerate(fog) if state != UNKNOWN}
    ring = {r * cols + c for i in known for c, r in neighbours(grid, i % cols, i // cols)}
    return known | ring


def grid_extent(grid: dict) -> tuple[float, float]:
    """Width and height the grid covers, from its origin."""
    size, cols, rows = grid["size"], grid["cols"], grid["rows"]
    if grid["type"] == "hex":
        r = hex_radius(grid)
        return size * cols + (size / 2 if rows > 1 else 0), 2 * r + 1.5 * r * (rows - 1)
    return size * cols, size * rows


def images_bounds(images: list[dict]) -> tuple[float, float]:
    right = max((i["x"] + i["w"] * i["scale"] for i in images), default=0)
    bottom = max((i["y"] + i["h"] * i["scale"] for i in images), default=0)
    return right, bottom


def world_size(data: dict) -> tuple[int, int]:
    """The map's size in px: its pictures and its grid (at least 256)."""
    right, bottom = images_bounds(data["images"])
    grid = data["grid"]
    if grid["type"] != "none":
        w, h = grid_extent(grid)
        right, bottom = max(right, grid["x"] + w), max(bottom, grid["y"] + h)
    return max(256, math.ceil(right)), max(256, math.ceil(bottom))


def fit_size(grid: dict, right: float, bottom: float) -> tuple[int, int]:
    """Columns and rows covering the area up to (right, bottom) from the grid's origin."""
    size = grid["size"]
    width, height = max(size, right - grid["x"]), max(size, bottom - grid["y"])
    if grid["type"] == "hex":
        r = hex_radius(grid)
        cols = math.ceil((width - size / 2) / size)
        rows = math.ceil(max(0.0, height - 2 * r) / (1.5 * r)) + 1
    else:
        cols, rows = math.ceil(width / size), math.ceil(height / size)
    cols, rows = max(1, min(MAX_SIDE, cols)), max(1, min(MAX_SIDE, rows))
    while cols * rows > MAX_TILES:
        cols, rows = max(1, cols - 1), max(1, rows - 1)
    return cols, rows


# -- editing ------------------------------------------------------------------


def _tile(value: Any) -> Tile:
    try:
        col, row = int(value[0]), int(value[1])
    except (TypeError, ValueError, IndexError, KeyError):
        raise MapError("A tile is [column, row]") from None
    return col, row


def _int(value: Any, label: str, low: int, high: int) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        raise MapError(f"{label} must be a number") from None
    return max(low, min(high, number))


def _float(value: Any, label: str, low: float, high: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise MapError(f"{label} must be a number") from None
    if math.isnan(number):
        raise MapError(f"{label} must be a number")
    return max(low, min(high, number))


def _color(value: Any, label: str) -> str:
    if not isinstance(value, str) or not _HEX.match(value):
        raise MapError(f"{label} must be a color like #a1b2c3")
    return value.lower()


def _choice(value: Any, options: tuple, label: str):
    if value not in options:
        raise MapError(f"{label} must be one of {options}")
    return value


def new_id(data: dict, prefix: str) -> str:
    data["next_id"] = int(data.get("next_id") or 1) + 1
    return f"{prefix}{data['next_id'] - 1}"


def set_images(data: dict, raw: Any, files: dict[int, tuple[int, int]]) -> None:
    """The map's pictures, in drawing order. `files`: the allowed file ids with their (width, height)."""
    if not isinstance(raw, list):
        raise MapError("images must be a list")
    images = []
    for item in raw:
        if not isinstance(item, dict):
            raise MapError("Each picture is an object")
        file_id = _int(item.get("file_id"), "file_id", 0, 2**31)
        if file_id not in files:
            raise MapError("Unknown map picture")
        w, h = files[file_id]
        images.append({
            "id": str(item.get("id") or new_id(data, "img"))[:20],
            "file_id": file_id,
            "x": _int(item.get("x", 0), "x", -20000, 40000),
            "y": _int(item.get("y", 0), "y", -20000, 40000),
            "w": w, "h": h,
            "scale": round(_float(item.get("scale", 1), "Scale", 0.05, 8), 4),
        })
    data["images"] = images
    if data["grid"].get("auto") and images:
        resize(data, *fit_size(data["grid"], *images_bounds(images)))


def resize(data: dict, cols: int, rows: int) -> None:
    """New columns and rows: tiles keep their place from the top left; the last ones are added or dropped."""
    grid = data["grid"]
    cols, rows = max(1, min(MAX_SIDE, int(cols))), max(1, min(MAX_SIDE, int(rows)))
    if cols * rows > MAX_TILES:
        raise MapError(f"At most {MAX_TILES} tiles")
    old_cols, old_rows = grid["cols"], grid["rows"]
    if (cols, rows) == (old_cols, old_rows):
        return
    for key, layer in data["fog"]["layers"].items():
        cells = []
        for row in range(rows):
            for col in range(cols):
                inside = col < old_cols and row < old_rows
                cells.append(layer[row * old_cols + col] if inside else UNKNOWN)
        data["fog"]["layers"][key] = "".join(cells)
    grid["cols"], grid["rows"] = cols, rows
    data["links"] = [link for link in data["links"] if in_grid(grid, tuple(link["tile"]))]
    for item in data["paths"] + data["regions"]:
        item["tiles"] = [t for t in item["tiles"] if in_grid(grid, tuple(t))]


def set_grid(data: dict, changes: Any) -> None:
    if not isinstance(changes, dict):
        raise MapError("changes must be an object")
    grid = data["grid"]
    cols, rows = grid["cols"], grid["rows"]
    for key, value in changes.items():
        if key == "type":
            grid["type"] = _choice(value, GRID_TYPES, "Grid")
        elif key == "size":
            grid["size"] = _int(value, "Tile size", MIN_SIZE, MAX_SIZE)
        elif key in ("x", "y"):
            grid[key] = _int(value, key, -MAX_SIZE * 4, MAX_SIZE * 4)
        elif key == "cols":
            cols, grid["auto"] = _int(value, "Columns", 1, MAX_SIDE), False
        elif key == "rows":
            rows, grid["auto"] = _int(value, "Rows", 1, MAX_SIDE), False
        elif key == "auto":
            grid["auto"] = bool(value)
        elif key == "unit_size":
            grid["unit_size"] = round(_float(value, "Tile's physical size", 0, 100000), 3)
        elif key == "unit":
            grid["unit"] = str(value or "").strip()[:12]
        elif key == "color":
            grid["color"] = _color(value, "Grid color")
        elif key == "opacity":
            grid["opacity"] = round(_float(value, "Opacity", 0, 1), 3)
        elif key == "mode":
            grid["mode"] = _choice(value, GRID_MODES, "Grid color mode")
        elif key == "line":
            grid["line"] = round(_float(value, "Line width", 0.5, 8), 2)
        else:
            raise MapError(f"Unknown grid setting '{key}'")
    if grid["auto"]:
        cols, rows = fit_size(grid, *images_bounds(data["images"])) if data["images"] else (cols, rows)
    resize(data, cols, rows)


def layer(data: dict, group_id: int | str) -> str:
    return data["fog"]["layers"].get(str(group_id)) or UNKNOWN * tile_count(data["grid"])


def paint(data: dict, group_ids: Iterable[int], state: str, tiles: Iterable[Any]) -> None:
    state = _choice(str(state), FOG_STATES, "Fog state")
    grid = data["grid"]
    indexes = set()
    for raw in tiles:
        col, row = _tile(raw)
        if in_grid(grid, (col, row)):
            indexes.add(row * grid["cols"] + col)
    for group_id in group_ids:
        cells = list(layer(data, group_id))
        for i in indexes:
            cells[i] = state
        data["fog"]["layers"][str(group_id)] = "".join(cells)


def fill(data: dict, group_ids: Iterable[int], state: str) -> None:
    state = _choice(str(state), FOG_STATES, "Fog state")
    for group_id in group_ids:
        data["fog"]["layers"][str(group_id)] = state * tile_count(data["grid"])


def effective_fog(data: dict, group_ids: Iterable[int]) -> str | None:
    """What a member sees: per tile, the best state over their groups' layers (no layer: unknown).
    None when the fog is off (everything visible)."""
    if not data["fog"]["enabled"]:
        return None
    n = tile_count(data["grid"])
    layers = [layer(data, g) for g in group_ids if str(g) in data["fog"]["layers"]]
    if not layers:
        return UNKNOWN * n
    return "".join(max(cells) for cells in zip(*layers))


def fog_key(data: dict, group_ids: Iterable[int]) -> list[int]:
    """The groups whose layers make a member's fog (members with the same ones see the same map)."""
    if not data["fog"]["enabled"]:
        return []
    return sorted(int(g) for g in group_ids if str(g) in data["fog"]["layers"])


def state_at(fog: str | None, grid: dict, tile: Tile) -> str:
    if fog is None:
        return VISIBLE
    if not in_grid(grid, tile):
        return UNKNOWN
    return fog[tile[1] * grid["cols"] + tile[0]]


def add_links(data: dict, tile: Any, resource_ids: Iterable[int]) -> None:
    col, row = _tile(tile)
    if not in_grid(data["grid"], (col, row)):
        raise MapError("That tile isn't on the grid")
    here = [l for l in data["links"] if tuple(l["tile"]) == (col, row)]
    for rid in resource_ids:
        if any(l["resource_id"] == rid for l in here):
            continue
        if len(here) >= MAX_LINKS_PER_TILE:
            raise MapError(f"At most {MAX_LINKS_PER_TILE} resources on a tile")
        link = {"tile": [col, row], "resource_id": int(rid)}
        here.append(link)
        data["links"].append(link)


def remove_link(data: dict, tile: Any, resource_id: int | None) -> None:
    col, row = _tile(tile)
    data["links"] = [l for l in data["links"] if not (tuple(l["tile"]) == (col, row)
                                                      and (resource_id is None or l["resource_id"] == resource_id))]


def save_path(data: dict, raw: Any, visibility: dict) -> dict:
    if not isinstance(raw, dict):
        raise MapError("A path is an object")
    existing = next((p for p in data["paths"] if p["id"] == raw.get("id")), None) if raw.get("id") else None
    if existing is None and len(data["paths"]) >= MAX_PATHS:
        raise MapError(f"At most {MAX_PATHS} paths")
    tiles = raw.get("tiles", existing["tiles"] if existing else [])
    if not isinstance(tiles, list) or len(tiles) > MAX_PATH_TILES:
        raise MapError(f"A path has at most {MAX_PATH_TILES} tiles")
    cleaned = [list(_tile(t)) for t in tiles]
    if any(not in_grid(data["grid"], tuple(t)) for t in cleaned):
        raise MapError("A path's tiles must be on the grid")
    base = existing or {"id": new_id(data, "path"), "name": "Path", "color": "#e2b742", "width": 4, "body": "dashed",
                        "head": "arrow", "tail": "circle", "render": "spline"}
    path = {
        **base,
        "name": str(raw.get("name", base["name"]) or "Path").strip()[:80],
        "tiles": cleaned,
        "color": _color(raw.get("color", base["color"]), "Path color"),
        "width": _int(raw.get("width", base["width"]), "Width", 1, 24),
        "body": _choice(raw.get("body", base["body"]), PATH_BODIES, "Line"),
        "head": _choice(raw.get("head", base["head"]), PATH_ENDS, "Head"),
        "tail": _choice(raw.get("tail", base["tail"]), PATH_ENDS, "Tail"),
        "render": _choice(raw.get("render", base["render"]), PATH_RENDERS, "Line shape"),
        "visibility": visibility,
    }
    if existing is None:
        data["paths"].append(path)
    else:
        data["paths"][data["paths"].index(existing)] = path
    return path


def delete_path(data: dict, path_id: str) -> None:
    data["paths"] = [p for p in data["paths"] if p["id"] != path_id]


def save_region(data: dict, raw: Any, visibility: dict) -> dict:
    """A named set of tiles (a kingdom, a forest, a district): filled, outlined or both."""
    if not isinstance(raw, dict):
        raise MapError("A region is an object")
    existing = next((r for r in data["regions"] if r["id"] == raw.get("id")), None) if raw.get("id") else None
    if existing is None and len(data["regions"]) >= MAX_REGIONS:
        raise MapError(f"At most {MAX_REGIONS} regions")
    tiles = raw.get("tiles", existing["tiles"] if existing else [])
    if not isinstance(tiles, list) or len(tiles) > MAX_REGION_TILES:
        raise MapError(f"A region has at most {MAX_REGION_TILES} tiles")
    cleaned, seen = [], set()
    for raw_tile in tiles:
        tile = _tile(raw_tile)
        if not in_grid(data["grid"], tile):
            raise MapError("A region's tiles must be on the grid")
        if tile not in seen:
            seen.add(tile)
            cleaned.append(list(tile))
    base = existing or {"id": new_id(data, "region"), "name": "Region", "show": "both", "color": "#6cc9e0",
                        "fill": "#6cc9e0", "opacity": 0.25, "width": 4, "line": "solid", "render": "spline",
                        "label": True}
    region = {
        **base,
        "name": str(raw.get("name", base["name"]) or "Region").strip()[:80],
        "tiles": cleaned,
        "show": _choice(raw.get("show", base["show"]), REGION_SHOWS, "Show"),
        "color": _color(raw.get("color", base["color"]), "Border color"),
        "fill": _color(raw.get("fill", base["fill"]), "Fill color"),
        "opacity": round(_float(raw.get("opacity", base["opacity"]), "Fill opacity", 0.05, 1), 3),
        "width": _int(raw.get("width", base["width"]), "Border width", 1, 24),
        "line": _choice(raw.get("line", base["line"]), REGION_LINES, "Border line"),
        "render": _choice(raw.get("render", base["render"]), PATH_RENDERS, "Border shape"),
        "label": bool(raw.get("label", base["label"])),
        "visibility": visibility,
    }
    if existing is None:
        data["regions"].append(region)
    else:
        data["regions"][data["regions"].index(existing)] = region
    return region


def tile_at(grid: dict, x: float, y: float) -> Tile:
    """The tile under a point in map px (may be off the grid)."""
    size = grid["size"]
    if grid["type"] != "hex":
        return math.floor((x - grid["x"]) / size), math.floor((y - grid["y"]) / size)
    r = hex_radius(grid)
    row = round((y - grid["y"] - r) / (1.5 * r))
    best, best_d = (0, 0), float("inf")
    for rr in (row - 1, row, row + 1):
        col = round((x - grid["x"]) / size - 0.5 - (0.5 if rr % 2 else 0))
        for cc in (col - 1, col, col + 1):
            cx, cy = tile_center(grid, cc, rr)
            d = (cx - x) ** 2 + (cy - y) ** 2
            if d < best_d:
                best, best_d = (cc, rr), d
    return best


def save_label(data: dict, raw: Any, visibility: dict) -> dict:
    """A marker on the map: a pin (or none) and a text beside or above it, optionally shown only on click. The DM
    marks places without editing the picture."""
    if not isinstance(raw, dict):
        raise MapError("A label is an object")
    labels = data.setdefault("labels", [])
    existing = next((l for l in labels if l["id"] == raw.get("id")), None) if raw.get("id") else None
    if existing is None and len(labels) >= MAX_LABELS:
        raise MapError(f"At most {MAX_LABELS} labels")
    base = existing or {"id": new_id(data, "label"), "text": "Label", "point": [0, 0], "pin": "pin", "side": "above",
                        "size": "medium", "color": "#e0b25a", "on_click": False}
    point = raw.get("point", base["point"])
    w, h = world_size(data)
    if not (isinstance(point, list) and len(point) == 2):
        raise MapError("A label's place is [x, y]")
    label = {
        **base,
        "text": str(raw.get("text", base["text"]) or "").strip()[:80],
        "point": [round(_float(point[0], "x", 0, w), 1), round(_float(point[1], "y", 0, h), 1)],
        "pin": _choice(raw.get("pin", base["pin"]), LABEL_PINS, "Pin"),
        "side": _choice(raw.get("side", base["side"]), LABEL_SIDES, "Text side"),
        "size": _choice(raw.get("size", base["size"]), LABEL_SIZES, "Size"),
        "color": _color(raw.get("color", base["color"]), "Pin color"),
        "on_click": bool(raw.get("on_click", base["on_click"])),
        "visibility": visibility,
    }
    if not label["text"] and label["pin"] == "none":
        raise MapError("A label needs a text or a pin")
    if existing is None:
        labels.append(label)
    else:
        labels[labels.index(existing)] = label
    return label


def delete_label(data: dict, label_id: str) -> None:
    data["labels"] = [l for l in data.get("labels", []) if l["id"] != label_id]


def delete_region(data: dict, region_id: str) -> None:
    data["regions"] = [r for r in data["regions"] if r["id"] != region_id]


def clean_tiles(grid: dict, raw: Any, limit: int = 400) -> list[list[int]]:
    """A list of tiles on the grid (highlight, attention)."""
    if not isinstance(raw, list) or not raw or len(raw) > limit:
        raise MapError(f"Pick between 1 and {limit} tiles")
    tiles = [list(_tile(t)) for t in raw]
    if any(not in_grid(grid, tuple(t)) for t in tiles):
        raise MapError("Those tiles aren't on the grid")
    return tiles


def tiles_rect(grid: dict, tiles: list[list[int]]) -> tuple[float, float, float, float]:
    """Bounding box (x, y, w, h) in map px of some tiles."""
    points = [p for t in tiles for p in tile_polygon(grid, t[0], t[1])]
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
