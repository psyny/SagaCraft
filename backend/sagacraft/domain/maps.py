"""Location maps: pictures, grid, fog of war, links on tiles, paths and regions, in layers. Pure rules (no database,
no HTTP).

A map's data (the grid, the fog and the no-map colour are the whole map's; the rest is each layer's):
    {"grid": {"type": none|square|hex, "size", "x", "y", "cols", "rows", "auto" (always false now),
              "unit_size", "unit", "color", "opacity", "mode": color|contrast|inverse, "line"},
     "fog": {"enabled", "layers": {member_group_id: "0120..."}},     # one char per tile: 0 unknown, 1 known, 2 visible
     "background": "#rrggbb",                                        # where no picture covers the map
     "layers": [{"id", "name", "see_through", ...the layer's content}],   # bottom first
     "next_id": int}

A layer's content (the commands' `data` is a view of one layer: layer_view):
    {"images": [{"id", "file_id", "x", "y", "w", "h", "scale", "rotation", "flip_x", "flip_y"}],  # map px; w, h: the file's size
     "links": [{"tile": [col, row], "resource_id", "hidden" (only the DM sees it; missing: false)}],
     "paths": [{"id", "name", "tiles": [[col, row], ...], "color", "width", "body", "head", "tail", "render",
                "shown" (0-100: how much of it is drawn, from its start), "visibility"}],
     "regions": [{"id", "name", "tiles": [[col, row], ...], "show": fill|border|both, "color" (border), "fill",
                  "opacity" (fill), "width", "line": solid|dashed|dotted, "render": poly|spline, "label",
                  "visibility"}],
     "labels": [...], "tokens": [...]}

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
MAX_LAYERS = 12
LAYER_KEYS = ("images", "links", "paths", "regions", "labels", "tokens")
DEFAULT_BACKGROUND = "#000000"
MIN_SIZE, MAX_SIZE = 8, 1024
SQRT3 = math.sqrt(3)
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

Tile = tuple[int, int]


class MapError(ValueError):
    pass


def default_grid() -> dict:
    """Maps are grid first (plan 46): the DM sets the tiles, and places and sizes the pictures on them. "auto" (the grid
    following the pictures) is gone: always false. Lines in contrast (black or white against the map), thin."""
    return {"type": "square", "size": 100, "x": 0, "y": 0, "cols": 16, "rows": 12, "auto": False,
            "unit_size": 5, "unit": "ft", "color": "#ffffff", "opacity": 0.5, "mode": "contrast", "line": 0.5}


def default_layer(layer_id: str = "layer1", name: str = "Map") -> dict:
    return {"id": layer_id, "name": name, "see_through": False, **{k: [] for k in LAYER_KEYS}}


def default_map() -> dict:
    return {"grid": default_grid(), "fog": {"enabled": False, "layers": {}}, "background": DEFAULT_BACKGROUND,
            "layers": [default_layer()], "next_id": 1}


def normalize(data: dict | None) -> dict:
    result = default_map()
    data = copy.deepcopy(data or {})
    result["next_id"] = int(data.get("next_id") or 1)
    result["background"] = data.get("background") if _HEX.match(str(data.get("background") or "")) else DEFAULT_BACKGROUND
    if data.get("layers"):
        result["layers"] = [{**default_layer(str(l.get("id") or f"layer{i + 1}"), str(l.get("name") or "Layer")),
                             "see_through": bool(l.get("see_through")),
                             **{k: list(l.get(k) or []) for k in LAYER_KEYS}} for i, l in enumerate(data["layers"])]
    else:  # from before layers: everything was one layer
        result["layers"] = [{**default_layer(), **{k: list(data.get(k) or []) for k in LAYER_KEYS}}]
    result["grid"] = {**default_grid(), **(data.get("grid") or {}), "auto": False}  # grids no longer follow the pictures
    result["fog"] = {"enabled": bool((data.get("fog") or {}).get("enabled")), "layers": dict((data.get("fog") or {}).get("layers") or {})}
    n = tile_count(result["grid"])
    for key, layer in list(result["fog"]["layers"].items()):
        result["fog"]["layers"][key] = (str(layer) + UNKNOWN * n)[:n]
    return result


# -- layers -------------------------------------------------------------------


def get_layer(data: dict, layer_id: Any = None) -> dict:
    """A layer by id; without one, the first (the bottom one)."""
    if layer_id is None:
        return data["layers"][0]
    found = next((l for l in data["layers"] if l["id"] == layer_id), None)
    if found is None:
        raise MapError("That layer isn't on this map")
    return found


def layer_view(data: dict, layer: dict) -> dict:
    """One layer's content with the map's grid and fog: what the per-layer rules work on (commit it back)."""
    return {**{k: layer[k] for k in LAYER_KEYS}, "grid": data["grid"], "fog": data["fog"], "next_id": data["next_id"],
            "layers": data["layers"]}  # (read only: the map's size)


def commit(data: dict, layer: dict, view: dict) -> None:
    for k in LAYER_KEYS:
        layer[k] = view[k]
    data["next_id"] = view["next_id"]


def shown_layers(data: dict, layer: dict) -> list[dict]:
    """What viewing a layer shows: it, and where it's see-through the layers under it (down to one that isn't);
    bottom first."""
    index = data["layers"].index(layer)
    stack = [layer]
    while stack[-1]["see_through"] and index > 0:
        index -= 1
        stack.append(data["layers"][index])
    return list(reversed(stack))


def all_images(data: dict) -> list[dict]:
    return [img for l in data["layers"] for img in l["images"]]


def find_token_layer(data: dict, token_id: str) -> dict | None:
    return next((l for l in data["layers"] if any(t["id"] == token_id for t in l["tokens"])), None)


def add_layer(data: dict, name: Any) -> dict:
    if len(data["layers"]) >= MAX_LAYERS:
        raise MapError(f"At most {MAX_LAYERS} layers")
    layer = default_layer(new_id(data, "layer"), str(name or "").strip()[:60] or f"Layer {len(data['layers']) + 1}")
    data["layers"].append(layer)  # on top
    return layer


def update_layer(data: dict, layer_id: Any, changes: Any) -> dict:
    layer = get_layer(data, layer_id)
    if not isinstance(changes, dict):
        raise MapError("changes must be an object")
    for key, value in changes.items():
        if key == "name":
            name = str(value or "").strip()[:60]
            if not name:
                raise MapError("A layer needs a name")
            layer["name"] = name
        elif key == "see_through":
            layer["see_through"] = bool(value)
        else:
            raise MapError(f"Unknown layer setting '{key}'")
    return layer


def move_layer(data: dict, layer_id: Any, delta: Any) -> None:
    layer = get_layer(data, layer_id)
    layers = data["layers"]
    index = layers.index(layer)
    new = max(0, min(len(layers) - 1, index + int(delta or 0)))
    layers.insert(new, layers.pop(index))


def delete_layer(data: dict, layer_id: Any) -> dict:
    """Removes a layer with its content (not the last one); returns it."""
    layer = get_layer(data, layer_id)
    if len(data["layers"]) < 2:
        raise MapError("A map keeps at least one layer")
    data["layers"].remove(layer)
    return layer


def move_token_to_layer(data: dict, token_id: str, layer_id: Any) -> dict:
    source = find_token_layer(data, token_id)
    target = get_layer(data, layer_id)
    if source is None:
        raise MapError("Token not found")
    token = next(t for t in source["tokens"] if t["id"] == token_id)
    if target is not source:
        if len(target["tokens"]) >= MAX_TOKENS:
            raise MapError(f"At most {MAX_TOKENS} tokens on a layer")
        source["tokens"] = [t for t in source["tokens"] if t["id"] != token_id]
        target["tokens"].append(token)
    return token


def set_background(data: dict, value: Any) -> None:
    data["background"] = _color(value, "The no-map colour")


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
    boxes = [image_box(i) for i in images]
    return max((b[2] for b in boxes), default=0), max((b[3] for b in boxes), default=0)


def world_size(data: dict) -> tuple[int, int]:
    """The map's size in px: its pictures (every layer's) and its grid (at least 256)."""
    right, bottom = images_bounds(all_images(data))
    grid = data["grid"]
    if grid["type"] != "none":
        w, h = grid_extent(grid)
        right, bottom = max(right, grid["x"] + w), max(bottom, grid["y"] + h)
    return max(256, math.ceil(right)), max(256, math.ceil(bottom))


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
        rotation = _float(item.get("rotation", 0), "Rotation", -3600, 3600)
        images.append({
            "id": str(item.get("id") or new_id(data, "img"))[:20],
            "file_id": file_id,
            "x": _int(item.get("x", 0), "x", -20000, 40000),
            "y": _int(item.get("y", 0), "y", -20000, 40000),
            "w": w, "h": h,
            "scale": round(_float(item.get("scale", 1), "Scale", 0.05, 8), 4),
            # Turned around its middle (degrees, clockwise), and mirrored (flipped before it's turned)
            "rotation": round(((rotation + 180) % 360) - 180, 2),
            "flip_x": bool(item.get("flip_x")),
            "flip_y": bool(item.get("flip_y")),
        })
    data["images"] = images


def image_box(image: dict) -> tuple[float, float, float, float]:
    """The box a picture covers on the map (left, top, right, bottom), turned as it is drawn."""
    w, h = image["w"] * image["scale"], image["h"] * image["scale"]
    cx, cy = image["x"] + w / 2, image["y"] + h / 2
    a = math.radians(image.get("rotation") or 0)
    half_w = (abs(math.cos(a)) * w + abs(math.sin(a)) * h) / 2
    half_h = (abs(math.sin(a)) * w + abs(math.cos(a)) * h) / 2
    return cx - half_w, cy - half_h, cx + half_w, cy + half_h


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
    for layer in data["layers"]:  # every layer's tiles
        layer["links"] = [link for link in layer["links"] if in_grid(grid, tuple(link["tile"]))]
        layer["tokens"] = [t for t in layer["tokens"] if in_grid(grid, tuple(t["tile"]))]
        for item in layer["paths"] + layer["regions"]:
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
            cols = _int(value, "Tiles X", 1, MAX_SIDE)
        elif key == "rows":
            rows = _int(value, "Tiles Y", 1, MAX_SIDE)
        elif key == "auto":
            pass  # grids no longer follow the pictures (older clients may still send it)
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
    grid["auto"] = False
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


def _link(data: dict, tile: Any, resource_id: Any) -> dict:
    col, row = _tile(tile)
    link = next((l for l in data["links"] if tuple(l["tile"]) == (col, row) and l["resource_id"] == resource_id), None)
    if link is None:
        raise MapError("That link isn't on the map")
    return link


def hide_link(data: dict, tile: Any, resource_id: Any, hidden: bool) -> None:
    """A link only the DM sees (hidden) or that players see (when they may see its resource)."""
    link = _link(data, tile, resource_id)
    if hidden:
        link["hidden"] = True
    else:
        link.pop("hidden", None)


def move_link(data: dict, tile: Any, resource_id: Any, to: Any) -> None:
    """A link to another tile (dropped if that tile already has it)."""
    link = _link(data, tile, resource_id)
    col, row = _tile(to)
    if not in_grid(data["grid"], (col, row)):
        raise MapError("That tile isn't on the grid")
    here = [l for l in data["links"] if tuple(l["tile"]) == (col, row)]
    if any(l["resource_id"] == resource_id for l in here):
        data["links"].remove(link)
        return
    if len(here) >= MAX_LINKS_PER_TILE:
        raise MapError(f"At most {MAX_LINKS_PER_TILE} resources on a tile")
    link["tile"] = [col, row]


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
    base = existing or {"id": new_id(data, "path"), "name": "Path", "color": "#e2b742", "width": 7, "body": "dashed",
                        "head": "arrow", "tail": "circle", "render": "spline", "shown": 100}
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
        "shown": _int(raw.get("shown", base.get("shown", 100)), "Shown", 0, 100),
        "visibility": visibility,
    }
    if existing is None:
        data["paths"].append(path)
    else:
        data["paths"][data["paths"].index(existing)] = path
    return path


def path_cut(path: dict) -> float | None:
    """How far along a partly shown path is drawn, in tiles from the first tile's centre (0 to tiles - 1); None: all
    of it. Progress counts tiles, not lengths, so the server and every screen cut at the same place without geometry."""
    n = len(path["tiles"])
    shown = path.get("shown", 100)
    return None if shown >= 100 or n < 2 else shown / 100 * (n - 1)


def cut_piece(cut: float, n: int, render: str) -> int:
    """The piece of the line the cut falls in. Poly: piece i joins tile i to tile i + 1. Spline: n pieces, the first and
    last half a tile (centre to edge), the others edge to edge (piece i ends on the edge after tile i)."""
    if render == "poly":
        return min(int(cut), n - 2)
    if cut < 0.5:
        return 0
    if cut >= n - 1.5:
        return n - 1
    return int(cut - 0.5) + 1


def shown_part(path: dict) -> dict:
    """A path for players: only the tiles its shown part needs (never the route ahead) and where it's cut."""
    out = {k: v for k, v in path.items() if k not in ("visibility", "shown")}
    cut = path_cut(path)
    if cut is not None:
        out["tiles"] = path["tiles"][: cut_piece(cut, len(path["tiles"]), path["render"]) + 2]
        out["cut"] = cut
    return out


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


TOKEN_KINDS = ("character", "item", "group", "custom")
MAX_TOKENS, MAX_TOKEN_SIZE = 100, 10  # size: n×n tiles on a square grid; hexes 1, 3, 7, 12, 19 and on


def save_token(data: dict, raw: Any, visibility: dict) -> dict:
    """A mobile token on a tile: a character, an item, a group of characters, or a custom one (a name and a
    picture). It covers `size` tiles around its tile. The service checks `ref` and `file_id` belong to the Saga."""
    if not isinstance(raw, dict):
        raise MapError("A token is an object")
    tokens = data.setdefault("tokens", [])
    existing = next((t for t in tokens if t["id"] == raw.get("id")), None) if raw.get("id") else None
    if existing is None and len(tokens) >= MAX_TOKENS:
        raise MapError(f"At most {MAX_TOKENS} tokens on a map")
    base = existing or {"id": new_id(data, "token"), "kind": raw.get("kind"), "ref": None, "name": "", "file_id": None,
                        "tile": [0, 0], "size": 1}
    kind = _choice(base["kind"], TOKEN_KINDS, "Token kind")
    tile = list(_tile(raw.get("tile", base["tile"])))
    if not in_grid(data["grid"], tuple(tile)):
        raise MapError("That tile isn't on the grid")
    size = raw.get("size", base["size"])
    if isinstance(size, bool) or not isinstance(size, int) or not 1 <= size <= MAX_TOKEN_SIZE:
        raise MapError(f"A token covers 1 to {MAX_TOKEN_SIZE} tiles")
    token = {**base, "kind": kind, "tile": tile, "size": size, "visibility": visibility}
    if kind == "custom":
        token["name"] = str(raw.get("name", base["name"]) or "").strip()[:40]
        token["file_id"] = raw.get("file_id", base["file_id"])
        if not token["name"] and token["file_id"] is None:
            raise MapError("A custom token needs a name or a picture")
        token["ref"] = None
    else:
        ref = raw.get("ref", base["ref"])
        if isinstance(ref, bool) or not isinstance(ref, int):
            raise MapError(f"Pick the {kind}")
        token.update({"ref": ref, "name": "", "file_id": None})
    if existing is None:
        tokens.append(token)
    else:
        tokens[tokens.index(existing)] = token
    return token


def move_token(data: dict, token_id: str, raw_tile: Any) -> dict:
    token = next((t for t in data.get("tokens", []) if t["id"] == token_id), None)
    if token is None:
        raise MapError("Token not found")
    tile = list(_tile(raw_tile))
    if not in_grid(data["grid"], tuple(tile)):
        raise MapError("That tile isn't on the grid")
    token["tile"] = tile
    return token


def delete_token(data: dict, token_id: str) -> dict | None:
    """Removes it; returns it (its custom picture goes too: the service deletes the file)."""
    token = next((t for t in data.get("tokens", []) if t["id"] == token_id), None)
    data["tokens"] = [t for t in data.get("tokens", []) if t["id"] != token_id]
    return token


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
