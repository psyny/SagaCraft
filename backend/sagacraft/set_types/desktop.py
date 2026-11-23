"""Desktop Set: a desk where the DM lays pieces to show the players: characters (a card or a sheet, in the template
picked), items (an item card), documents (on the page the DM turns to) and pictures (uploaded on the spot, deleted
with their piece: actor.config["temp_file_id"], see services/stages.py). See docs/concepts/stages.md ("Desktop Set").

- config: {layout: auto | free, gap}. Auto packs the pieces in rows to use the desk (the frontend computes it); free
  keeps each piece's place.
- actor.config: {kind, mode, template_id, page, caption, shown}; actor.position: {x, y, w, rot, z} in fractions of the
  Set (w: of its width), so the desk fits any size of screen.
Showing a piece shows it to whoever sees the Set (like revealing a card): a character or document they can't open
elsewhere still shows here.
"""
import copy

from domain import display
from models import Resource, StageActor, StageSet
from services.errors import BadRequest
from services.resources import player_name
from services.security import signed_file_url
from set_types.base import RenderContext, SetType

LAYOUTS = ("auto", "free")
KINDS = ("character", "item", "document")
CHARACTER_MODES = display.CARD_MODES + display.SHEET_MODES  # face, full, none (cards); immersive, informative (sheets)
MAX_PIECES = 60
MAX_GAP = 80


def _float(value, label: str, low: float, high: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise BadRequest(f"{label} must be a number")
    return round(max(low, min(high, float(value))), 4)


class Desktop(SetType):
    key = "desktop"
    name = "Desktop"
    default_size = (1000, 620)
    uses_actors = True
    actor_kinds = KINDS

    def default_config(self) -> dict:
        return {"layout": "auto", "gap": 16, "next_z": 1, "background": 78}

    def normalize(self, config: dict | None) -> dict:
        return {**self.default_config(), **copy.deepcopy(config or {})}

    def validate_config(self, config: dict, current: dict | None = None) -> dict:
        result = self.normalize(current)
        for key, value in (config or {}).items():
            if key == "layout":
                if value not in LAYOUTS:
                    raise BadRequest(f"layout: one of {list(LAYOUTS)}")
                result[key] = value
            elif key == "gap":
                result[key] = int(_float(value, "gap", 0, MAX_GAP))
            elif key == "background":  # the desk's panel opacity, %
                result[key] = int(_float(value, "background", 0, 100))
            else:
                raise BadRequest(f"Unknown setting '{key}'")
        return result

    # -- pieces -----------------------------------------------------------------

    @staticmethod
    def _new_config(kind: str) -> dict:
        return {"kind": kind, "mode": "full" if kind == "character" else None, "template_id": None, "page": 0,
                "caption": "", "shown": True}

    def place_actors(self, ctx: RenderContext, stage_set: StageSet, resources: list[Resource],
                     options: dict) -> list[StageActor]:
        if len(stage_set.actors) + len(resources) > MAX_PIECES:
            raise BadRequest(f"At most {MAX_PIECES} pieces on a desk")
        return [StageActor(resource_id=r.id, resource=r, position={}, config=self._new_config(r.kind),
                           visibility={"groups": [], "members": []}) for r in resources]

    def after_change(self, ctx: RenderContext, stage_set: StageSet) -> None:
        """A piece's visibility follows its eye: shown to whoever sees the Set, or the DM's only."""
        for actor in stage_set.actors:
            wanted = dict(ctx.everyone) if (actor.config or {}).get("shown", True) else {"groups": [], "members": []}
            if actor.visibility != wanted:
                actor.visibility = wanted

    def _actor(self, stage_set: StageSet, raw) -> StageActor:
        actor = next((a for a in stage_set.actors if a.id == raw), None) if isinstance(raw, int) else None
        if actor is None:
            raise BadRequest("That piece isn't on this desk")
        return actor

    def command(self, ctx: RenderContext, stage_set: StageSet, name: str, args: dict):
        config = self.normalize(stage_set.config)
        if name == "pieces.place":  # {positions: {actor id: {x, y, w, rot}}}: one moved, or all when going Free
            positions = args.get("positions")
            if not isinstance(positions, dict) or not positions:
                raise BadRequest("positions: {piece: {x, y, w, rot}}")
            for raw_id, place in positions.items():
                actor = self._actor(stage_set, int(raw_id) if str(raw_id).isdigit() else None)
                if not isinstance(place, dict):
                    raise BadRequest("A place is {x, y, w, rot}")
                old = actor.position or {}
                actor.position = {
                    "x": _float(place.get("x", old.get("x", 0)), "x", -0.5, 1.5),
                    "y": _float(place.get("y", old.get("y", 0)), "y", -0.5, 1.5),
                    "w": _float(place.get("w", old.get("w", 0.25)), "w", 0.03, 1.5),
                    "rot": _float(place.get("rot", old.get("rot", 0)), "rot", -180, 180),
                    "z": config["next_z"] if len(positions) == 1 else old.get("z", 0),
                }
            front = args.get("front")  # going Free by moving one: that one comes to the front
            if len(positions) > 1 and isinstance(front, int):
                actor = self._actor(stage_set, front)
                actor.position = {**(actor.position or {}), "z": config["next_z"]}
            if len(positions) == 1 or isinstance(front, int):
                config["next_z"] += 1  # the piece moved comes to the front
            if args.get("layout") in LAYOUTS:
                config["layout"] = args["layout"]
        elif name == "piece.set":
            actor = self._actor(stage_set, args.get("actor_id"))
            piece = dict(actor.config or {})
            kind = piece.get("kind")
            if "shown" in args:
                piece["shown"] = bool(args["shown"])
            if "mode" in args:
                if kind != "character" or args["mode"] not in CHARACTER_MODES:
                    raise BadRequest(f"A character shows as one of {list(CHARACTER_MODES)}")
                piece["mode"] = args["mode"]
            if "template_id" in args:
                if kind not in ("character", "item"):
                    raise BadRequest("Only characters and items have display templates")
                value = args["template_id"]
                if value is not None and (isinstance(value, bool) or not isinstance(value, int)
                                          or value not in ctx.displays.templates
                                          or ctx.displays.templates[value].kind != kind):
                    raise BadRequest("Pick a template of this kind")
                piece["template_id"] = value
            if "page" in args:
                if kind != "document":
                    raise BadRequest("Only documents have pages")
                pages = self._pages(ctx, actor.resource)
                piece["page"] = int(_float(args["page"], "page", 0, max(0, len(pages) - 1)))
            if "caption" in args:
                piece["caption"] = str(args["caption"] or "").strip()[:120]
            actor.config = piece
        elif name == "image.add":
            if len(stage_set.actors) >= MAX_PIECES:
                raise BadRequest(f"At most {MAX_PIECES} pieces on a desk")
            file = ctx.files.get(args.get("file_id"), "desk")
            if file is None:
                raise BadRequest("Upload the picture first (Desktop pictures)")
            if any((a.config or {}).get("temp_file_id") == file.id for a in stage_set.actors):
                raise BadRequest("That picture is already on the desk")
            stage_set.actors.append(StageActor(
                resource_id=None, position={}, visibility={"groups": [], "members": []},
                config={**self._new_config("image"), "temp_file_id": file.id, "ratio": round((file.width or 1) / (file.height or 1), 4),
                        "caption": str(args.get("caption") or "").strip()[:120]},
                sort_order=max((a.sort_order for a in stage_set.actors), default=0) + 1))
        else:
            raise BadRequest(f"Unknown command '{name}'")
        stage_set.config = config
        return None

    # -- render -----------------------------------------------------------------

    @staticmethod
    def _pages(ctx: RenderContext, resource: Resource | None) -> list:
        if resource is None:
            return []
        type_def = ctx.ruleset.def_for(resource)
        attr = next((a for a in type_def.attributes if a.type == "pages"), None)
        pages = (resource.attributes or {}).get(attr.key) if attr else None
        return pages if isinstance(pages, list) else []

    def _piece(self, ctx: RenderContext, actor: StageActor) -> dict | None:
        piece = actor.config or {}
        kind = piece.get("kind")
        out = {"id": actor.id, "kind": kind, "position": actor.position or {}, "caption": piece.get("caption") or ""}
        if ctx.viewer.is_admin:
            out["shown"] = piece.get("shown", True)
        if kind == "image":
            file_id = piece.get("temp_file_id")
            if not isinstance(file_id, int):
                return None
            out.update({"url": signed_file_url(file_id), "ratio": piece.get("ratio") or 1})
            return out
        resource = actor.resource
        if resource is None:
            return None
        book = ctx.displays
        if kind == "character":
            from set_types.actors_scene import ActorsScene, actor_values

            mode = piece.get("mode") or "full"
            out["mode"] = mode
            if mode in display.CARD_MODES:
                template = book.template_for_id(resource, piece.get("template_id"))
                out["card"] = {"id": actor.id, "position": {}, **ActorsScene()._card(ctx, resource, actor_values(actor), template, mode)}
            else:
                out["sheet"] = book.sheet(ctx.viewer, resource, piece.get("template_id"))
        elif kind == "item":
            sheet = book.sheet(ctx.viewer, resource, piece.get("template_id"))
            out["sheet"] = sheet
            out["tier"] = self._tier(ctx, resource)
            type_def = ctx.ruleset.def_for(resource)
            icon_attr = type_def.icon()
            icon = (resource.attributes or {}).get(icon_attr.key) if icon_attr else None
            out["icon"] = {"url": signed_file_url(icon["file_id"])} if isinstance(icon, dict) and icon.get("file_id") else None
        elif kind == "document":
            pages = self._pages(ctx, resource)
            index = min(int(piece.get("page") or 0), max(0, len(pages) - 1))
            page = pages[index] if pages else None
            if isinstance(page, dict) and page.get("kind") == "image" and (page.get("image") or {}).get("file_id"):
                page = {**page, "image": {**page["image"], "url": signed_file_url(page["image"]["file_id"])}}
            out.update({"title": resource.name if ctx.viewer.is_admin else player_name(resource), "page": index,
                        "count": len(pages), "current": page})
        if ctx.viewer.is_admin:
            out["resource_id"] = resource.id
            out["template_id"] = piece.get("template_id")
        return out

    @staticmethod
    def _tier(ctx: RenderContext, resource: Resource) -> dict | None:
        """An item's tier: its first choice variable's value and its place in the options (DnD Lite: rarity). Data,
        not code: no option is named here."""
        type_def = ctx.ruleset.def_for(resource)
        attr = next((a for a in type_def.attributes if a.type == "choice" and a.options), None)
        value = (resource.attributes or {}).get(attr.key) if attr else None
        if attr is None or value not in attr.options:
            return None
        return {"key": attr.key, "label": value, "name": attr.name, "index": attr.options.index(value), "of": len(attr.options)}

    def render(self, ctx: RenderContext, stage_set: StageSet, actors: list[StageActor]) -> dict:
        config = self.normalize(stage_set.config)
        admin = ctx.viewer.is_admin
        ordered = sorted(actors, key=lambda a: (a.sort_order, a.id))
        pieces = [p for p in (self._piece(ctx, a) for a in ordered if admin or (a.config or {}).get("shown", True)) if p]
        content = {"layout": config["layout"], "gap": config["gap"], "background": config["background"], "pieces": pieces}
        if admin:
            content["config"] = config
            content["templates"] = {"character": ctx.displays.template_choices("character"),
                                    "item": ctx.displays.template_choices("item")}
        return content
