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

from domain import map_paint, maps
from domain.ruleset import Ruleset
from domain.visibility import Viewer, can_see, rule_allows
from infrastructure.config.settings import settings
from models import Group, LocationMap, Resource, SagaMember, StoredFile
from services.access import check_visibility, guest_viewer, require_admin, viewer_for
from services import environments
from services.errors import BadRequest, Forbidden, NotFound
from services.resources import _get as get_resource_row
from services.resources import can_see_resource, controller_ids, ruleset_for, shown_name
from services.security import signed_file_url, url_expiry

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
    type_def = ruleset.def_for(resource)
    controllers = controller_ids(ruleset, resource, viewer)
    for attr in (type_def.icon(), type_def.picture()):
        if attr is None or not rule_allows(viewer, attr.view, controllers):
            continue
        value = (resource.attributes or {}).get(attr.key)
        if isinstance(value, dict) and value.get("file_id"):
            return {"url": signed_file_url(value["file_id"]), "face": None if attr.category == "icon" else value.get("face")}
    return None


def _map_signature(resource_id: int, groups: str, expires: int, layer: str = "") -> str:
    message = f"map:{resource_id}:{groups}:{expires}:{layer}".encode()
    return hmac.new(settings.jwt_secret_key.encode(), message, hashlib.sha256).hexdigest()[:32]


def signed_map_url(resource_id: int, version: int, groups: list[int], layer: str) -> str:
    """The composed picture of a layer for members whose fog comes from these groups."""
    expires = url_expiry()
    key = ",".join(str(g) for g in groups)
    return (f"/api/maps/{resource_id}?v={version}&g={key}&l={layer}&e={expires}"
            f"&s={_map_signature(resource_id, key, expires, layer)}")


def verify_map_signature(resource_id: int, groups: str, expires: int, signature: str, layer: str = "") -> bool:
    if expires < time.time():
        return False
    return hmac.compare_digest(_map_signature(resource_id, groups, expires, layer), signature)


def member_groups(db: Session, saga_id: int) -> list[dict]:
    rows = db.scalars(select(Group).where(Group.saga_id == saga_id).order_by(Group.id)).all()
    return [{"id": g.id, "key": g.key, "name": g.name} for g in rows if g.key != "admins"]


def _weather_id(db: Session, saga_id: int, raw: Any) -> int | None:
    """A map weather of this Saga (None: no weather)."""
    if raw is None:
        return None
    env = environments.map_weather(db, saga_id, raw)
    if env is None:
        raise BadRequest("A weather is one of the Saga's map weathers")
    return env.id


def _ambience(db: Session, saga_id: int, ambience: dict) -> dict:
    """The map's hour, and its weather with the effects to draw (everyone sees the weather; a deleted one: none)."""
    env = environments.map_weather(db, saga_id, ambience.get("weather"))
    return {"hour": ambience["hour"], "weather": environments.weather_view(env) if env else None}


def render(db: Session, viewer: Viewer, ruleset: Ruleset, resource: Resource, *, highlight: list | None = None,
           layer_id: str | None = None, without_fog: bool = False, moves: dict | None = None) -> dict:
    """A location's map for one viewer (the location page, the resource view, map Sets), as one layer shows it: its
    pictures and those of the layers showing through it, and its own tokens, links, paths, regions and labels.
    `moves` (a map Set of the live Stage, not paused: {"turn": character ids whose turn it is}): players' tokens say
    whether they may move them (plan 58).
    `without_fog` (the DM's download, plan 54): a viewer's map as if the fog were off (their pictures not hidden, all
    of the painting, what's shared with them anywhere)."""
    row = map_row(db, resource)
    whole = maps.normalize(row.data)
    width, height = maps.world_size(whole)
    admin = viewer.is_admin
    try:
        layer = maps.get_layer(whole, layer_id)
    except maps.MapError:
        layer = maps.get_layer(whole)  # a layer that's gone: the first
    shown = maps.shown_layers(whole, layer)
    data = maps.layer_view(whole, layer)
    out: dict[str, Any] = {
        "location": {"id": resource.id, "name": shown_name(viewer, resource)},
        "version": row.version,
        "size": [width, height],
        "grid": data["grid"],
        "highlight": highlight,
        "background": whole["background"],
        "layers": [{"id": l["id"], "name": l["name"], "see_through": l["see_through"]} for l in whole["layers"]],
        "layer": layer["id"],
        "painter": whole["painter"],
        "ambience": _ambience(db, resource.saga_id, whole["ambience"]),
    }
    fog = None
    if admin:
        out["images"] = [{**img, "url": signed_file_url(img["file_id"])} for l in shown for img in l["images"]]
        out["fog"] = {"enabled": data["fog"]["enabled"], "layers": data["fog"]["layers"]}
        out["groups"] = member_groups(db, resource.saga_id)
    elif without_fog:
        out["images"] = [{**img, "url": signed_file_url(img["file_id"])} for l in shown for img in l["images"] if not img.get("hidden")]
        out["fog"] = {"enabled": False, "states": None}
    else:
        groups = maps.fog_key(whole, viewer.group_ids)
        has_pictures = any(not img.get("hidden") for l in shown for img in l["images"])
        out["image"] = {"url": signed_map_url(resource.id, row.version, groups, layer["id"])} if has_pictures else None
        fog = maps.effective_fog(whole, viewer.group_ids)
        out["fog"] = {"enabled": fog is not None, "states": fog}
    # The painting (plan 47): the layers showing through, the top one's tiles first; players only on their tiles
    seen = None if admin or fog is None else maps.shown_tiles(fog, data["grid"])
    out["paint"] = map_paint.render(map_paint.merge([l["paint"] for l in shown], maps.tile_count(data["grid"])), data["grid"], seen, admin)
    ids = {link["resource_id"] for link in data["links"]}
    linked = {r.id: r for r in db.scalars(select(Resource).where(Resource.saga_id == resource.saga_id,
                                                                 Resource.id.in_(ids))).all()} if ids else {}
    links = []
    book = None
    for link in data["links"]:
        target = linked.get(link["resource_id"])
        if target is None:
            continue
        if not admin and (link.get("hidden") or not can_see_resource(viewer, ruleset, target)
                          or maps.state_at(fog, data["grid"], tuple(link["tile"])) == maps.UNKNOWN):
            continue
        out_link = {"tile": link["tile"], "resource_id": target.id, "kind": target.kind,
                    "name": shown_name(viewer, target, controller_ids(ruleset, target, viewer)),
                    "icon": resource_icon(ruleset, viewer, target)}
        if admin:
            out_link["hidden"] = bool(link.get("hidden"))
        if target.kind == "character":  # its token, as its display template draws it (style, colour, values)
            if book is None:
                from services.displays import DisplayBook

                book = DisplayBook(db, resource.saga_id, ruleset)
            out_link["token"] = book.token(viewer, target, out_link["name"])
        links.append(out_link)
    out["links"] = links
    out["tokens"] = _tokens_out(db, viewer, ruleset, resource.saga_id, data, fog, book, moves)
    # What tiles cost to move into (plan 59): the DM all; others only on tiles they know
    out["moves"] = {key: cost for key, cost in (layer.get("moves") or {}).items()
                    if admin or maps.state_at(fog, data["grid"], tuple(int(v) for v in key.split(","))) != maps.UNKNOWN}
    # Players get a partly shown path cut short: the route ahead isn't sent
    out["paths"] = [item if admin else maps.shown_part(item)
                    for item in data["paths"] if admin or can_see(viewer, item.get("visibility"))]
    out["regions"] = [item if admin else {k: v for k, v in item.items() if k != "visibility"}
                      for item in data["regions"] if admin or can_see(viewer, item.get("visibility"))]
    # Labels: shared with them, on a place they know (a pin in the dark would give it away)
    out["labels"] = [label if admin else {k: v for k, v in label.items() if k != "visibility"}
                     for label in data.get("labels", [])
                     if admin or (can_see(viewer, label.get("visibility"))
                                  and maps.state_at(fog, data["grid"], maps.tile_at(data["grid"], *label["point"])) != maps.UNKNOWN)]
    return out


def get_map(db: Session, member: SagaMember, resource_id: int, layer: str | None = None) -> dict:
    viewer = viewer_for(db, member)
    resource = _location(db, member.saga_id, resource_id)
    if not _may_view(db, member, viewer, resource):
        raise NotFound("Location not found")
    result = render(db, viewer, ruleset_for(db, member.saga_id), resource, layer_id=layer)
    db.commit()  # a map row made on first view
    return result


def get_map_as_players(db: Session, member: SagaMember, resource_id: int, layer: str | None = None, fog: bool = True) -> dict:
    """The map as the players see it (plan 52: the DM downloads it): the live link's guest, who sees what players see
    (their fog, their composed picture, the painting of their tiles, what's shared with them); without the fog (plan
    54), what's shared with them anywhere. The DM's only."""
    require_admin(member)
    resource = _location(db, member.saga_id, resource_id)
    result = render(db, guest_viewer(db, member.saga_id), ruleset_for(db, member.saga_id), resource, layer_id=layer,
                    without_fog=not fog)
    db.commit()
    return result


class MapBook:
    """Renders locations' maps for Sets (RenderContext.maps): the Set types don't touch the database."""

    def __init__(self, db: Session, ruleset: Ruleset, saga_id: int):
        from services.fog_presets import FogBook

        self.db = db
        self.ruleset = ruleset
        self.fog = FogBook(db, saga_id)  # the Saga's fog presets

    def render(self, viewer: Viewer, resource: Resource, highlight: list | None = None, layer: str | None = None,
               moves: dict | None = None) -> dict:
        return render(self.db, viewer, self.ruleset, resource, highlight=highlight, layer_id=layer, moves=moves)

    def moves_for(self, viewer: Viewer, stage_set) -> dict | None:
        """Members may move tokens on a map Set of the live Stage that isn't paused (plan 58): whose turn it is there.
        None: no moves (the DM moves through map commands; not live; paused)."""
        from models import Saga

        stage = stage_set.stage
        saga = self.db.get(Saga, stage.saga_id) if stage is not None else None
        if viewer.is_admin or saga is None or saga.live_stage_id != stage.id or stage.paused:
            return None
        return {"turn": turn_characters(stage)}

    def move_token(self, viewer: Viewer, resource: Resource, layer: str | None, token_id: Any, tile: Any, stage_set,
                   path: Any = None) -> tuple[list[int], list | None]:
        """(where it was, its route: None without one)."""
        moves = self.moves_for(viewer, stage_set)
        if moves is None and not viewer.is_admin:
            raise Forbidden("Tokens move on the live Stage (not paused)")
        return move_token_as(self.db, viewer, self.ruleset, resource, layer, token_id, tile, moves or {"turn": set()}, path)

    def layer_ids(self, resource: Resource) -> list[str]:
        return [l["id"] for l in maps.normalize(map_row(self.db, resource).data)["layers"]]

    def grid(self, resource: Resource) -> dict:
        return maps.normalize(map_row(self.db, resource).data)["grid"]


# ---------------------------------------------------------------------------
# Mobile tokens (domain/maps.py: tokens): a character, an item, a group of characters or a custom one
# ---------------------------------------------------------------------------

NO_PLAYER = "#000000"


def _tokens_out(db: Session, viewer: Viewer, ruleset: Ruleset, saga_id: int, data: dict, fog: str | None,
                book=None, moves: dict | None = None) -> list[dict]:
    """The tokens this viewer sees (shared with them, not on a tile their fog hides), each drawn for them: a
    character or item they can't see shows as "?" (no name, no picture). The DM gets who may move each (plan 58);
    the others, with `moves`, whether they may (`movable`), and a character's `ref` when they can see it (its sheet)."""
    from models import CharacterGroup
    from services.displays import DisplayBook

    tokens = [t for t in data.get("tokens", []) if viewer.is_admin or (
        can_see(viewer, t.get("visibility")) and maps.state_at(fog, data["grid"], tuple(t["tile"])) != maps.UNKNOWN)]
    if not tokens:
        return []
    book = book or DisplayBook(db, saga_id, ruleset)
    refs = {t["ref"] for t in tokens if t["kind"] in ("character", "item")}
    resources = {r.id: r for r in db.scalars(select(Resource).where(Resource.saga_id == saga_id, Resource.id.in_(refs))).all()} if refs else {}
    groups = {g.id: g for g in db.scalars(select(CharacterGroup).where(CharacterGroup.saga_id == saga_id)).all()} \
        if any(t["kind"] == "group" for t in tokens) else {}
    out = []
    for t in tokens:
        item = {"id": t["id"], "kind": t["kind"], "tile": t["tile"], "size": t["size"], "name": None, "icon": None,
                "color": NO_PLAYER, "style": "gradient", "values": []}
        if viewer.is_admin:
            item.update({"ref": t["ref"], "visibility": t.get("visibility"), "file_id": t.get("file_id"),
                         "move_by": t.get("move_by", "dm"), "move_when": t.get("move_when", "always")})
        elif moves is not None:
            target = resources.get(t["ref"]) if t["kind"] in ("character", "item") else None
            item["movable"] = _may_move(ruleset, viewer, t, target, moves)
        if t["kind"] in ("character", "item"):
            target = resources.get(t["ref"])
            if target is not None and can_see_resource(viewer, ruleset, target):
                if not viewer.is_admin and t["kind"] == "character":
                    item["ref"] = target.id  # its sheet
                item["name"] = shown_name(viewer, target, controller_ids(ruleset, target, viewer))
                item["icon"] = resource_icon(ruleset, viewer, target)
                if t["kind"] == "character":  # as its display template draws it
                    token = book.token(viewer, target, item["name"])
                    item.update({"color": token["color"], "style": token["style"], "border": token["border"], "values": token["values"]})
                else:
                    item["color"] = book.frame(target)
        elif t["kind"] == "group":
            group = groups.get(t["ref"])
            if group is not None:
                item["name"], item["color"] = group.name, group.color[:7]
        else:
            item["name"] = t.get("name") or None
            if t.get("file_id"):
                item["icon"] = {"url": signed_file_url(t["file_id"]), "face": None}
        out.append(item)
    return out


def _may_move(ruleset: Ruleset, viewer: Viewer, token: dict, target: Resource | None, moves: dict) -> bool:
    """May a member (not the DM) move this token now (domain/maps.may_move: who, and when)?"""
    owns = target is not None and viewer.member_id in controller_ids(ruleset, target, viewer)
    on_turn = token["kind"] == "character" and token.get("ref") in moves.get("turn", set())
    return maps.may_move(token, viewer.role, owns, on_turn)


def turn_characters(stage) -> set[int]:
    """The characters whose turn it is on a Stage (plan 58): the current creature of each Actors Scene's shown tab
    with its turns running (round 1 or later)."""
    from set_types import SET_TYPES

    scene = SET_TYPES.get("actors_scene")
    found: set[int] = set()
    for stage_set in stage.sets if scene is not None else []:
        if stage_set.type != "actors_scene":
            continue
        config = scene.normalize(stage_set.config)
        tab = next((t for t in config["tabs"] if t["id"] == config["active_tab"]), None)
        turn = (tab or {}).get("turn") or {}
        if turn.get("actor_id") is None or int(turn.get("round") or 0) < 1:
            continue
        actor = next((a for a in stage_set.actors if a.id == turn["actor_id"]), None)
        if actor is not None and actor.resource_id is not None:
            found.add(actor.resource_id)
    return found


def move_token_as(db: Session, viewer: Viewer, ruleset: Ruleset, resource: Resource, layer_id: str | None,
                  token_id: Any, raw_tile: Any, moves: dict, path: Any = None) -> tuple[list[int], list | None]:
    """A member moving a token on a map Set of the live Stage (plan 58), on the layer it shows: a token shared with
    them and not under their fog, they may move (who, when), onto a tile they know. Plan 59: members move along a
    planned route (`path`: each step to a touching tile, none blocked nor unknown to them); the DM may give one too,
    or just the tile (any token, any tile)."""
    row = map_row(db, resource)
    whole = maps.normalize(row.data)
    try:
        layer = maps.get_layer(whole, layer_id)
    except maps.MapError:
        layer = maps.get_layer(whole)
    grid = whole["grid"]
    token = next((t for t in layer["tokens"] if t["id"] == str(token_id)), None)
    fog = None if viewer.is_admin else maps.effective_fog(whole, viewer.group_ids)
    if token is None or not viewer.is_admin and (
            not can_see(viewer, token.get("visibility")) or maps.state_at(fog, grid, tuple(token["tile"])) == maps.UNKNOWN):
        raise NotFound("Token not found")
    if not viewer.is_admin:
        target = db.get(Resource, token["ref"]) if token["kind"] in ("character", "item") and token.get("ref") else None
        if target is not None and target.saga_id != resource.saga_id:
            target = None
        if not _may_move(ruleset, viewer, token, target, moves):
            raise Forbidden("You can't move this token now")
    if path is None and not viewer.is_admin:
        raise BadRequest("Plan the move: its route, tile by tile")
    route = None
    try:
        if path is not None:
            route, _ = maps.route_cost(grid, layer.get("moves") or {}, tuple(token["tile"]), path,
                                       None if viewer.is_admin else lambda t: maps.state_at(fog, grid, t) != maps.UNKNOWN)
            tile = route[-1]
        else:
            tile = list(maps._tile(raw_tile))
    except maps.MapError as exc:
        raise BadRequest(str(exc)) from None
    if not maps.in_grid(grid, tuple(tile)):
        raise BadRequest("That tile isn't on the map")
    if maps.state_at(fog, grid, tuple(tile)) == maps.UNKNOWN:
        raise BadRequest("Only onto tiles you know")
    origin = list(token["tile"])
    token["tile"] = tile
    row.data = whole
    return origin, (route if path is not None else None)


def may_drag(db: Session, viewer: Viewer, ruleset: Ruleset, token: dict, saga_id: int, moves: dict) -> bool:
    """A member's drag of a token, seen by the others (the drop is checked by move_token_as)."""
    if viewer.is_admin:
        return True
    target = db.get(Resource, token["ref"]) if token["kind"] in ("character", "item") and token.get("ref") else None
    return _may_move(ruleset, viewer, token, target if target is not None and target.saga_id == saga_id else None, moves)


def _check_token(db: Session, saga_id: int, raw: Any) -> None:
    """A token's character, item, group or custom picture is this Saga's."""
    from models import CharacterGroup

    if not isinstance(raw, dict):
        return
    kind, ref = raw.get("kind"), raw.get("ref")
    if kind in ("character", "item") and ref is not None:
        target = db.get(Resource, ref) if isinstance(ref, int) and not isinstance(ref, bool) else None
        if target is None or target.saga_id != saga_id or target.kind != kind:
            raise BadRequest(f"Unknown {kind}")
    if kind == "group" and ref is not None:
        group = db.get(CharacterGroup, ref) if isinstance(ref, int) and not isinstance(ref, bool) else None
        if group is None or group.saga_id != saga_id:
            raise BadRequest("Unknown group")
    if raw.get("file_id") is not None:
        file = db.get(StoredFile, raw["file_id"]) if isinstance(raw["file_id"], int) else None
        if file is None or file.saga_id != saga_id or file.category != "token":
            raise BadRequest("Upload the token's picture first")


def _drop_picture(db: Session, file_id: Any, data: dict) -> None:
    """A custom token's picture is temporary: it goes with its token (unless another token, on any layer, still uses
    it). `data`: the whole map."""
    if not isinstance(file_id, int) or any(t.get("file_id") == file_id for l in data["layers"] for t in l["tokens"]):
        return
    file = db.get(StoredFile, file_id)
    if file is not None and file.category == "token":
        db.delete(file)


def drop_token_pictures(db: Session, resource: Resource) -> None:
    """A location being deleted: its custom tokens' pictures go too."""
    row = db.get(LocationMap, resource.id)
    for token in [t for l in maps.normalize(row.data)["layers"] for t in l["tokens"]] if row else []:
        file = db.get(StoredFile, token["file_id"]) if isinstance(token.get("file_id"), int) else None
        if file is not None and file.category == "token":
            db.delete(file)


# ---------------------------------------------------------------------------
# Map commands (the DM): the location page's tools and the map Sets' tools send the same
# ---------------------------------------------------------------------------


def everyone_visibility(db: Session, saga_id: int) -> dict:
    from services.stages import everyone

    return everyone(db, saga_id)


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
    whole = maps.normalize(row.data)
    args = args or {}
    try:
        # Per-layer commands work on the layer asked for (`layer`; the first without one); a token's own commands find
        # its layer
        layer_id = args.get("layer")
        if name in ("tokens.move", "tokens.delete") or (name == "tokens.save" and (args.get("token") or {}).get("id")):
            token_id = str(args.get("id") or (args.get("token") or {}).get("id"))
            layer_id = (maps.find_token_layer(whole, token_id) or {}).get("id", layer_id)
        layer = maps.get_layer(whole, layer_id)
        data = maps.layer_view(whole, layer)
        painted_before = not map_paint.is_empty(layer["paint"])
        if name == "images.set":
            maps.set_images(data, args.get("images"), _files(db, member.saga_id, args.get("images")))
            maps.commit(whole, layer, data)
        elif name == "grid.set":
            maps.set_grid(whole, args.get("changes") or {})
        elif name == "background.set":
            maps.set_background(whole, args.get("color"))
        elif name == "layers.add":
            maps.add_layer(whole, args.get("name"))
        elif name == "layers.update":
            maps.update_layer(whole, args.get("id"), args.get("changes") or {})
        elif name == "layers.move":
            maps.move_layer(whole, args.get("id"), args.get("delta"))
        elif name == "layers.delete":
            gone = maps.delete_layer(whole, args.get("id"))
            for token in gone["tokens"]:
                _drop_picture(db, token.get("file_id"), whole)
        elif name == "moves.paint":  # what tiles cost to move into (plan 59): 1, 2, 3, or "x" (blocked)
            maps.paint_moves(whole["grid"], layer, args.get("tiles"), args.get("cost"))
        elif name == "tokens.layer":  # a token to another layer, on the same tile
            maps.move_token_to_layer(whole, str(args.get("id")), args.get("to"))
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
        elif name == "links.hide":
            maps.hide_link(data, args.get("tile"), int(args.get("resource_id") or 0), bool(args.get("hidden")))
        elif name == "links.move":
            maps.move_link(data, args.get("tile"), int(args.get("resource_id") or 0), args.get("to"))
        elif name == "paths.save":
            raw = args.get("path") or {}
            current = next((p for p in data["paths"] if p["id"] == raw.get("id")), None)
            visibility = raw.get("visibility", current.get("visibility") if current else everyone_visibility(db, member.saga_id))
            maps.save_path(data, raw, check_visibility(db, member.saga_id, visibility))
        elif name == "paths.delete":
            maps.delete_path(data, str(args.get("id")))
        elif name == "regions.save":
            raw = args.get("region") or {}
            current = next((r for r in data["regions"] if r["id"] == raw.get("id")), None)
            visibility = raw.get("visibility", current.get("visibility") if current else everyone_visibility(db, member.saga_id))
            maps.save_region(data, raw, check_visibility(db, member.saga_id, visibility))
        elif name == "regions.delete":
            maps.delete_region(data, str(args.get("id")))
        elif name == "labels.save":
            raw = args.get("label") or {}
            current = next((l for l in data.get("labels", []) if l["id"] == raw.get("id")), None)
            visibility = raw.get("visibility", current.get("visibility") if current else everyone_visibility(db, member.saga_id))
            maps.save_label(data, raw, check_visibility(db, member.saga_id, visibility))
        elif name == "labels.delete":
            maps.delete_label(data, str(args.get("id")))
        elif name == "tokens.save":
            raw = args.get("token") or {}
            current = next((t for t in data.get("tokens", []) if t["id"] == raw.get("id")), None)
            _check_token(db, member.saga_id, {**(current or {}), **raw} if isinstance(raw, dict) else raw)
            visibility = raw.get("visibility", current.get("visibility") if current else everyone_visibility(db, member.saga_id))
            old_file = current.get("file_id") if current else None
            token = maps.save_token(data, raw, check_visibility(db, member.saga_id, visibility))
            maps.commit(whole, layer, data)
            if old_file is not None and old_file != token.get("file_id"):
                _drop_picture(db, old_file, whole)  # its old picture was replaced
        elif name == "tokens.move":
            maps.move_token(data, str(args.get("id")), args.get("tile"))
        elif name == "tokens.delete":
            gone = maps.delete_token(data, str(args.get("id")))
            maps.commit(whole, layer, data)
            if gone:
                _drop_picture(db, gone.get("file_id"), whole)
        # The map painter (plan 47): the map's settings, and the layer's painting
        elif name == "painter.set":
            map_paint.set_settings(whole["painter"], args.get("changes") or {})
        # The daytime and weather over the map (plan 48): the editor's and the Stage's, shown live to players
        elif name == "ambience.set":
            changes = args.get("changes") or {}
            if not isinstance(changes, dict) or not set(changes) <= {"hour", "weather"}:
                raise BadRequest("The ambience is an hour and a weather")
            if "hour" in changes:
                maps.set_hour(whole["ambience"], changes["hour"])
            if "weather" in changes:
                whole["ambience"]["weather"] = _weather_id(db, member.saga_id, changes["weather"])
        elif name == "paint.tiles":
            map_paint.paint_tiles(data["paint"], data["grid"], args.get("type"), args.get("colors"), args.get("tiles") or [])
        elif name == "paint.scenery":
            map_paint.paint_tiles(data["paint"], data["grid"], args.get("type"), args.get("colors"), args.get("tiles") or [], "scenery",
                                  args.get("per_tile"))
        elif name == "paint.boundaries":
            map_paint.paint_edges(data["paint"], data["grid"], args.get("type"), args.get("colors"), args.get("edges") or [])
        elif name == "paint.boundaries.turn":
            map_paint.turn_edges(data["paint"], data["grid"], args.get("edges") or [])
        elif name == "paint.effects":
            map_paint.paint_tiles(data["paint"], data["grid"], args.get("type"), args.get("colors"), args.get("tiles") or [], "effects")
        elif name == "paint.connect":
            map_paint.connect(data["paint"], data["grid"], str(args.get("channel")), args.get("type"), args.get("colors"),
                              args.get("tiles") or [], erase=bool(args.get("erase")), flow=str(args.get("flow") or "join"),
                              width=args.get("width"))
        elif name == "paint.features.save":
            map_paint.save_feature(data["paint"], data["grid"], args.get("feature") or {}, maps.new_id(data, "ft"))
        elif name == "paint.features.delete":
            map_paint.delete_feature(data["paint"], args.get("id"))
        else:
            raise BadRequest(f"Unknown map command '{name}'")
        if name.split(".")[0] in ("links", "paths", "regions", "labels", "tokens", "paint") and name != "tokens.layer":
            maps.commit(whole, layer, data)  # the layer's content back into the map
    except (maps.MapError, map_paint.PaintError) as exc:
        raise BadRequest(str(exc)) from None
    row.data = whole
    # Tokens and the painting are drawn over or under players' composed picture by their browser: it stays cached,
    # unless the layer just got (or lost) its painting (the picture is then transparent where no picture lies)
    painted_now = not map_paint.is_empty(layer["paint"])
    if not name.startswith(("tokens.", "paint.", "painter.", "ambience.", "moves.")) or painted_now != painted_before:
        row.version = (row.version or 1) + 1
    db.commit()
    return render(db, viewer_for(db, member), ruleset_for(db, member.saga_id), resource, layer_id=args.get("layer"))


# ---------------------------------------------------------------------------
# Players' composed picture
# ---------------------------------------------------------------------------

_cache: "OrderedDict[tuple, bytes]" = OrderedDict()
_cache_lock = threading.Lock()
CACHE_SIZE = 24
# The layer's pictures composed at the players' size, before the fog: a fog change only redraws the mask over it,
# instead of decoding and scaling every picture again (each brush stroke makes a new map version)
_base_cache: "OrderedDict[tuple, Image.Image]" = OrderedDict()
BASE_CACHE_SIZE = 4  # up to 4096 px a side, RGB: at most ~50 MB each
# At most this many pictures composed at once. Fog painting asks for a new picture per stroke: unbounded, they
# decoded full-size pictures side by side and ran the API out of memory (Docker killed it).
COMPOSE_SLOTS = 2
_compose_slots = threading.BoundedSemaphore(COMPOSE_SLOTS)


def _scaled(points: list[tuple[float, float]], factor: float, grow: float) -> list[tuple[float, float]]:
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    return [((cx + (x - cx) * grow) * factor, (cy + (y - cy) * grow) * factor) for x, y in points]


def _has_alpha(picture: Image.Image) -> bool:
    return picture.mode in ("RGBA", "LA", "PA") or (picture.mode == "P" and "transparency" in picture.info)


def _picture(file: StoredFile, size: tuple[int, int]) -> Image.Image:
    """An uploaded picture at the size it's drawn: JPEGs are decoded already reduced (draft mode), and only
    pictures with transparency get an alpha channel."""
    with Image.open(io.BytesIO(file.data)) as source:
        if source.format == "JPEG":
            source.draft("RGB", size)
        picture = source.convert("RGBA" if _has_alpha(source) else "RGB")
    return picture.resize(size, Image.LANCZOS, reducing_gap=3.0)


def _base(db: Session, data: dict, layer: dict, size: tuple[int, int], factor: float, painted: bool = False) -> Image.Image:
    """The pictures of a layer (and those showing through it) over the no-map colour, at the players' size; on a
    painted map over nothing (transparent: the painting shows there, drawn by the players' browser). Hidden pictures
    aren't in it. Cached by what's in it, so it outlives fog changes. Never changed once made (callers make new images)."""
    images = [img for l in maps.shown_layers(data, layer) for img in l["images"] if not img.get("hidden")]
    key = (data["background"], painted, size, factor, tuple((i["file_id"], i["x"], i["y"], i["w"], i["h"], i["scale"], i.get("rotation") or 0,
                                                    bool(i.get("flip_x")), bool(i.get("flip_y"))) for i in images))
    with _cache_lock:
        if key in _base_cache:
            _base_cache.move_to_end(key)
            return _base_cache[key]
    background = tuple(int(data["background"][i:i + 2], 16) for i in (1, 3, 5))
    canvas = Image.new("RGBA", size, (0, 0, 0, 0)) if painted else Image.new("RGB", size, background)
    for image in images:
        file = db.get(StoredFile, image["file_id"])
        if file is None:
            continue
        drawn = (max(1, round(image["w"] * image["scale"] * factor)), max(1, round(image["h"] * image["scale"] * factor)))
        picture = _picture(file, drawn)
        at = (round(image["x"] * factor), round(image["y"] * factor))
        # Mirrored, then turned around its middle (clockwise on the map: PIL turns the other way)
        if image.get("flip_x"):
            picture = picture.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if image.get("flip_y"):
            picture = picture.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        if image.get("rotation"):
            picture = picture.convert("RGBA").rotate(-image["rotation"], resample=Image.BICUBIC, expand=True)
            cx, cy = (image["x"] + image["w"] * image["scale"] / 2) * factor, (image["y"] + image["h"] * image["scale"] / 2) * factor
            at = (round(cx - picture.width / 2), round(cy - picture.height / 2))
        if painted and picture.mode == "RGBA":
            canvas.alpha_composite(picture, (max(0, at[0]), max(0, at[1])), (max(0, -at[0]), max(0, -at[1])))
        else:
            canvas.paste(picture, at, picture if picture.mode == "RGBA" else None)
    with _cache_lock:
        _base_cache[key] = canvas
        while len(_base_cache) > BASE_CACHE_SIZE:
            _base_cache.popitem(last=False)
    return canvas


def compose(db: Session, resource_id: int, groups: list[int], layer_id: str | None = None) -> bytes:
    """A layer's pictures (and those of the layers showing through it) in one picture over the no-map colour, black
    outside the tiles these groups' fog knows and the unknown tiles touching them (the fog's soft edge is drawn there)."""
    row = db.get(LocationMap, resource_id)
    if row is None:
        raise NotFound("Map not found")
    key = (resource_id, row.version, tuple(groups), layer_id)
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    with _compose_slots:
        with _cache_lock:  # made while this one waited for a slot (the same version asked twice)
            if key in _cache:
                _cache.move_to_end(key)
                return _cache[key]
        data = maps.normalize(row.data)
        width, height = maps.world_size(data)
        factor = min(1.0, COMPOSED_MAX_PX / max(width, height))
        try:
            layer = maps.get_layer(data, layer_id or None)
        except maps.MapError:
            raise NotFound("Map not found") from None
        size = (max(1, math.ceil(width * factor)), max(1, math.ceil(height * factor)))
        painted = any(not map_paint.is_empty(l["paint"]) for l in maps.shown_layers(data, layer))
        canvas = _base(db, data, layer, size, factor, painted)
        fog = maps.effective_fog(data, groups)
        if fog is not None:
            grid = data["grid"]
            mask = Image.new("L", canvas.size, 0)
            draw = ImageDraw.Draw(mask)
            for index in maps.shown_tiles(fog, grid):
                polygon = maps.tile_polygon(grid, index % grid["cols"], index // grid["cols"])
                draw.polygon(_scaled(polygon, factor, FIT_TILES), fill=255)
            canvas = Image.composite(canvas, Image.new(canvas.mode, canvas.size, (0, 0, 0, 255) if painted else (0, 0, 0)), mask)
        buffer = io.BytesIO()
        canvas.save(buffer, "WEBP", quality=82)  # (with alpha on a painted map)
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
        for link in [link for layer in data["layers"] for link in layer["links"]]:  # every layer's
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
