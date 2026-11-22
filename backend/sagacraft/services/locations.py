"""Locations' maps: editing (the DM's map commands), the map as each viewer may see it, and players' composed
picture. The rules are in domain/maps.py. See docs/concepts/locations.md.

Visibility stays on the server: players never receive the map's pictures. They get one composed picture, made
for their fog, where everything outside the tiles they know (and the unknown tiles touching them, where the
fog's soft edge is drawn) is black; plus their fog states, the links they may see on tiles they know, and the
paths and regions shared with them.
"""
import hashlib
import hmac
import io
import math
import threading
import time
from collections import OrderedDict
from typing import Any

from PIL import Image, ImageDraw
from sqlalchemy import select
from sqlalchemy.orm import Session

from domain import maps
from domain.ruleset import Ruleset
from domain.visibility import Viewer, can_see, rule_allows
from infrastructure.config.settings import settings
from models import Group, LocationMap, Resource, SagaMember, StoredFile
from services.access import check_visibility, require_admin, viewer_for
from services.errors import BadRequest, NotFound
from services.resources import _get as get_resource_row
from services.resources import can_see_resource, controller_ids, ruleset_for, shown_name
from services.security import signed_file_url

KIND = "location"
COMPOSED_MAX_PX = 4096  # the players' picture's longest side
FIT_TILES = 1.04  # revealed tiles are drawn a little bigger in the mask: no seams between them


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------


def _location(db: Session, saga_id: int, resource_id: int) -> Resource:
    resource = get_resource_row(db, saga_id, resource_id)
    if resource.kind != KIND:
        raise NotFound("Location not found")
    return resource


def map_row(db: Session, resource: Resource) -> LocationMap:
    row = resource.map
    if row is None:
        row = LocationMap(resource_id=resource.id, data=maps.default_map(), version=1)
        db.add(row)
        db.flush()
        resource.map = row
    return row


def _may_view(db: Session, member: SagaMember, viewer: Viewer, resource: Resource) -> bool:
    if can_see_resource(viewer, ruleset_for(db, member.saga_id), resource):
        return True
    from services.displays import _shown_on_live_stage

    return _shown_on_live_stage(db, member, viewer, resource.id)  # the map a live map Set shows


# ---------------------------------------------------------------------------
# Rendering for a viewer
# ---------------------------------------------------------------------------


def resource_icon(ruleset: Ruleset, viewer: Viewer, resource: Resource) -> dict | None:
    """A resource's icon for a viewer: its icon, else its picture's face crop."""
    type_def = ruleset.type_def(resource.kind, resource.type)
    controllers = controller_ids(ruleset, resource)
    for attr in (type_def.icon(), type_def.picture()):
        if attr is None or not rule_allows(viewer, attr.view, controllers):
            continue
        value = (resource.attributes or {}).get(attr.key)
        if isinstance(value, dict) and value.get("file_id"):
            return {"url": signed_file_url(value["file_id"]), "face": None if attr.category == "icon" else value.get("face")}
    return None


def _map_signature(resource_id: int, groups: str, expires: int) -> str:
    message = f"map:{resource_id}:{groups}:{expires}".encode()
    return hmac.new(settings.jwt_secret_key.encode(), message, hashlib.sha256).hexdigest()[:32]


def signed_map_url(resource_id: int, version: int, groups: list[int]) -> str:
    """The composed picture for members whose fog comes from these groups."""
    step = 600
    expires = (int(time.time()) // step + 1) * step + settings.file_url_minutes * 60
    key = ",".join(str(g) for g in groups)
    return f"/api/maps/{resource_id}?v={version}&g={key}&e={expires}&s={_map_signature(resource_id, key, expires)}"


def verify_map_signature(resource_id: int, groups: str, expires: int, signature: str) -> bool:
    if expires < time.time():
        return False
    return hmac.compare_digest(_map_signature(resource_id, groups, expires), signature)


def member_groups(db: Session, saga_id: int) -> list[dict]:
    rows = db.scalars(select(Group).where(Group.saga_id == saga_id).order_by(Group.id)).all()
    return [{"id": g.id, "key": g.key, "name": g.name} for g in rows if g.key != "admins"]


def render(db: Session, viewer: Viewer, ruleset: Ruleset, resource: Resource, *, highlight: list | None = None) -> dict:
    """A location's map for one viewer (the location page, the resource view, map Sets)."""
    row = map_row(db, resource)
    data = maps.normalize(row.data)
    width, height = maps.world_size(data)
    admin = viewer.is_admin
    out: dict[str, Any] = {
        "location": {"id": resource.id, "name": shown_name(viewer, resource)},
        "version": row.version,
        "size": [width, height],
        "grid": data["grid"],
        "highlight": highlight,
    }
    fog = None
    if admin:
        out["images"] = [{**img, "url": signed_file_url(img["file_id"])} for img in data["images"]]
        out["fog"] = {"enabled": data["fog"]["enabled"], "layers": data["fog"]["layers"]}
        out["groups"] = member_groups(db, resource.saga_id)
    else:
        groups = maps.fog_key(data, viewer.group_ids)
        out["image"] = {"url": signed_map_url(resource.id, row.version, groups)} if data["images"] else None
        fog = maps.effective_fog(data, viewer.group_ids)
        out["fog"] = {"enabled": fog is not None, "states": fog}
    ids = {link["resource_id"] for link in data["links"]}
    linked = {r.id: r for r in db.scalars(select(Resource).where(Resource.saga_id == resource.saga_id,
                                                                 Resource.id.in_(ids))).all()} if ids else {}
    links = []
    for link in data["links"]:
        target = linked.get(link["resource_id"])
        if target is None:
            continue
        if not admin and (not can_see_resource(viewer, ruleset, target)
                          or maps.state_at(fog, data["grid"], tuple(link["tile"])) == maps.UNKNOWN):
            continue
        links.append({"tile": link["tile"], "resource_id": target.id, "kind": target.kind,
                      "name": shown_name(viewer, target, controller_ids(ruleset, target)),
                      "icon": resource_icon(ruleset, viewer, target)})
    out["links"] = links
    for key in ("paths", "regions"):
        out[key] = [item if admin else {k: v for k, v in item.items() if k != "visibility"}
                    for item in data[key] if admin or can_see(viewer, item.get("visibility"))]
    # Labels: shared with them, on a place they know (a pin in the dark would give it away)
    out["labels"] = [label if admin else {k: v for k, v in label.items() if k != "visibility"}
                     for label in data.get("labels", [])
                     if admin or (can_see(viewer, label.get("visibility"))
                                  and maps.state_at(fog, data["grid"], maps.tile_at(data["grid"], *label["point"])) != maps.UNKNOWN)]
    return out


def get_map(db: Session, member: SagaMember, resource_id: int) -> dict:
    viewer = viewer_for(db, member)
    resource = _location(db, member.saga_id, resource_id)
    if not _may_view(db, member, viewer, resource):
        raise NotFound("Location not found")
    result = render(db, viewer, ruleset_for(db, member.saga_id), resource)
    db.commit()  # a map row made on first view
    return result


class MapBook:
    """Renders locations' maps for Sets (RenderContext.maps): the Set types don't touch the database."""

    def __init__(self, db: Session, ruleset: Ruleset, saga_id: int):
        from services.fog_presets import FogBook

        self.db = db
        self.ruleset = ruleset
        self.fog = FogBook(db, saga_id)  # the Saga's fog presets

    def render(self, viewer: Viewer, resource: Resource, highlight: list | None = None) -> dict:
        return render(self.db, viewer, self.ruleset, resource, highlight=highlight)

    def grid(self, resource: Resource) -> dict:
        return maps.normalize(map_row(self.db, resource).data)["grid"]


# ---------------------------------------------------------------------------
# Map commands (the DM): the location page's tools and the map Sets' tools send the same
# ---------------------------------------------------------------------------


def _group_ids(db: Session, saga_id: int, raw: Any) -> list[int]:
    if not isinstance(raw, list) or not raw:
        raise BadRequest("Pick the member groups to paint the fog for")
    valid = {g["id"] for g in member_groups(db, saga_id)}
    ids = [int(g) for g in raw]
    if not set(ids) <= valid:
        raise BadRequest("Unknown member group")
    return ids


def _files(db: Session, saga_id: int, raw: Any) -> dict[int, tuple[int, int]]:
    from services.uploads import get_limits

    ids = {int(i.get("file_id", 0)) for i in raw if isinstance(i, dict)} if isinstance(raw, list) else set()
    limit = get_limits(db)["categories"]["map"]["max_count"]
    if isinstance(raw, list) and len(raw) > limit:
        raise BadRequest(f"A map has at most {limit} pictures")
    rows = db.scalars(select(StoredFile).where(StoredFile.saga_id == saga_id, StoredFile.id.in_(ids))).all()
    return {f.id: (f.width or 1, f.height or 1) for f in rows}


def run_command(db: Session, member: SagaMember, resource_id: int, name: str, args: dict) -> dict:
    require_admin(member)
    resource = _location(db, member.saga_id, resource_id)
    row = map_row(db, resource)
    data = maps.normalize(row.data)
    args = args or {}
    try:
        if name == "images.set":
            maps.set_images(data, args.get("images"), _files(db, member.saga_id, args.get("images")))
        elif name == "grid.set":
            maps.set_grid(data, args.get("changes") or {})
            if args.get("fit"):
                data["grid"]["auto"] = True
                maps.resize(data, *maps.fit_size(data["grid"], *maps.images_bounds(data["images"])))
        elif name == "fog.set":
            data["fog"]["enabled"] = bool(args.get("enabled"))
        elif name == "fog.paint":
            maps.paint(data, _group_ids(db, member.saga_id, args.get("group_ids")), args.get("state"), args.get("tiles") or [])
        elif name == "fog.fill":
            maps.fill(data, _group_ids(db, member.saga_id, args.get("group_ids")), args.get("state"))
        elif name == "links.add":
            ids = [int(i) for i in args.get("resource_ids") or []]
            found = set(db.scalars(select(Resource.id).where(Resource.saga_id == member.saga_id, Resource.id.in_(ids))).all())
            if set(ids) != found:
                raise BadRequest("Unknown resource")
            maps.add_links(data, args.get("tile"), ids)
        elif name == "links.remove":
            rid = args.get("resource_id")
            maps.remove_link(data, args.get("tile"), int(rid) if rid is not None else None)
        elif name == "paths.save":
            raw = args.get("path") or {}
            current = next((p for p in data["paths"] if p["id"] == raw.get("id")), None)
            visibility = raw.get("visibility", current.get("visibility") if current else None)
            maps.save_path(data, raw, check_visibility(db, member.saga_id, visibility))
        elif name == "paths.delete":
            maps.delete_path(data, str(args.get("id")))
        elif name == "regions.save":
            raw = args.get("region") or {}
            current = next((r for r in data["regions"] if r["id"] == raw.get("id")), None)
            visibility = raw.get("visibility", current.get("visibility") if current else None)
            maps.save_region(data, raw, check_visibility(db, member.saga_id, visibility))
        elif name == "regions.delete":
            maps.delete_region(data, str(args.get("id")))
        elif name == "labels.save":
            raw = args.get("label") or {}
            current = next((l for l in data.get("labels", []) if l["id"] == raw.get("id")), None)
            visibility = raw.get("visibility", current.get("visibility") if current else None)
            maps.save_label(data, raw, check_visibility(db, member.saga_id, visibility))
        elif name == "labels.delete":
            maps.delete_label(data, str(args.get("id")))
        else:
            raise BadRequest(f"Unknown map command '{name}'")
    except maps.MapError as exc:
        raise BadRequest(str(exc)) from None
    row.data = data
    row.version = (row.version or 1) + 1
    db.commit()
    return render(db, viewer_for(db, member), ruleset_for(db, member.saga_id), resource)


# ---------------------------------------------------------------------------
# Players' composed picture
# ---------------------------------------------------------------------------

_cache: "OrderedDict[tuple, bytes]" = OrderedDict()
_cache_lock = threading.Lock()
CACHE_SIZE = 24


def _scaled(points: list[tuple[float, float]], factor: float, grow: float) -> list[tuple[float, float]]:
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    return [((cx + (x - cx) * grow) * factor, (cy + (y - cy) * grow) * factor) for x, y in points]


def compose(db: Session, resource_id: int, groups: list[int]) -> bytes:
    """The map's pictures in one picture, black outside the tiles these groups' fog knows and the unknown tiles
    touching them (the fog's soft edge is drawn there)."""
    row = db.get(LocationMap, resource_id)
    if row is None:
        raise NotFound("Map not found")
    key = (resource_id, row.version, tuple(groups))
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    data = maps.normalize(row.data)
    width, height = maps.world_size(data)
    factor = min(1.0, COMPOSED_MAX_PX / max(width, height))
    canvas = Image.new("RGB", (max(1, math.ceil(width * factor)), max(1, math.ceil(height * factor))), (14, 12, 17))
    for image in data["images"]:
        file = db.get(StoredFile, image["file_id"])
        if file is None:
            continue
        with Image.open(io.BytesIO(file.data)) as source:
            picture = source.convert("RGBA")
        size = (max(1, round(image["w"] * image["scale"] * factor)), max(1, round(image["h"] * image["scale"] * factor)))
        picture = picture.resize(size, Image.LANCZOS)
        canvas.paste(picture, (round(image["x"] * factor), round(image["y"] * factor)), picture)
    fog = maps.effective_fog(data, groups)
    if fog is not None:
        grid = data["grid"]
        mask = Image.new("L", canvas.size, 0)
        draw = ImageDraw.Draw(mask)
        for index in maps.shown_tiles(fog, grid):
            polygon = maps.tile_polygon(grid, index % grid["cols"], index // grid["cols"])
            draw.polygon(_scaled(polygon, factor, FIT_TILES), fill=255)
        canvas = Image.composite(canvas, Image.new("RGB", canvas.size, (0, 0, 0)), mask)
    buffer = io.BytesIO()
    canvas.save(buffer, "WEBP", quality=82)
    result = buffer.getvalue()
    with _cache_lock:
        _cache[key] = result
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    return result


def tags(db: Session, member: SagaMember, kind: str | None) -> list[str]:
    """The tags in use on the resources this member sees (the DM's vocabulary)."""
    viewer = viewer_for(db, member)
    ruleset = ruleset_for(db, member.saga_id)
    query = select(Resource).where(Resource.saga_id == member.saga_id)
    if kind:
        query = query.where(Resource.kind == kind)
    seen: dict[str, str] = {}
    for resource in db.scalars(query).all():
        if can_see_resource(viewer, ruleset, resource):
            for tag in resource.tags or []:
                seen.setdefault(tag.lower(), tag)
    return sorted(seen.values(), key=str.lower)


# ---------------------------------------------------------------------------
# The location map: how locations connect
# ---------------------------------------------------------------------------


def location_graph(db: Session, member: SagaMember) -> dict:
    """The locations this member sees as a graph (the relationship graph's shape): links between them on their maps
    (what the member would see on each map: not on tiles unknown to them), and "part of" between a location and
    its parent; each node's group is its parent, so the screen can cluster places that belong together."""
    viewer = viewer_for(db, member)
    ruleset = ruleset_for(db, member.saga_id)
    rows = db.scalars(select(Resource).where(Resource.saga_id == member.saga_id, Resource.kind == "location")
                      .order_by(Resource.id)).all()
    places = {r.id: r for r in rows if can_see_resource(viewer, ruleset, r)}
    node_id = lambda rid: f"r{rid}"  # noqa: E731

    def parent_of(resource: Resource) -> int | None:
        attr = ruleset.type_def(resource.kind, resource.type).parent_attr()
        value = (resource.attributes or {}).get(attr.key) if attr else None
        return value if isinstance(value, int) and value in places and value != resource.id else None

    nodes, edges = [], []
    for r in places.values():
        icon = resource_icon(ruleset, viewer, r)
        parent = parent_of(r)
        nodes.append({"id": node_id(r.id), "resource_id": r.id, "kind": "location", "type": r.type,
                      "name": shown_name(viewer, r), "icon": icon["url"] if icon else None,
                      "face": icon["face"] if icon else None, "hidden": False, "start": False,
                      "group": node_id(parent) if parent else None})
        if parent:
            edges.append(_edge(f"p{r.id}", node_id(r.id), node_id(parent), "part of", directed=True, reference=True))
    # Links between places, as each map shows them to this member
    seen: dict[tuple[int, int], bool] = {}
    maps_rows = db.scalars(select(LocationMap).where(LocationMap.resource_id.in_(places))).all() if places else []
    for row in maps_rows:
        data = maps.normalize(row.data)
        fog = None if viewer.is_admin else maps.effective_fog(data, viewer.group_ids)
        for link in data["links"]:
            target = link["resource_id"]
            if target not in places or target == row.resource_id:
                continue
            if fog is not None and maps.state_at(fog, data["grid"], tuple(link["tile"])) == maps.UNKNOWN:
                continue
            seen[(row.resource_id, target)] = True
    done: set[tuple[int, int]] = set()
    for a, b in sorted(seen):
        if (b, a) in done:
            continue
        both = (b, a) in seen
        done.add((a, b))
        edges.append(_edge(f"l{a}-{b}", node_id(a), node_id(b), "", directed=not both, reference=False))
    return {"nodes": nodes, "edges": edges}


def _edge(edge_id: str, a: str, b: str, label: str, *, directed: bool, reference: bool) -> dict:
    return {"id": edge_id, "relationship_id": None, "from": a, "to": b, "label": label, "inverse": label,
            "directed": directed, "reference": reference, "group_id": None, "created_role": None, "note": "",
            "start": None, "end": None, "type_ref": None}
