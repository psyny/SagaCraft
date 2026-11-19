"""Creature panel: creatures as cards. Each card has two sets of settings, one for the players' view and one
for the DM's: the name shown, whether the card shows, and for each value its style (bar, number, balls) and
where it shows (on the card, in the hover tray, or hidden).

Players only ever receive what they may see: hidden cards and values are left out, and discrete values
only carry the ball count. See docs/concepts/stages.md ("Creature panel").
"""
from domain import discrete
from domain.visibility import can_see, is_shared
from models import Resource, StageActor, StageSet
from services.errors import BadRequest
from services.security import signed_file_url
from set_types.base import RenderContext, SetType

SHAPES = ("grid", "row", "column", "circle", "free")
ORDERS = ("manual", "initiative")
# Before shapes and orders there was one "layout" setting
OLD_LAYOUTS = {"auto": ("grid", "manual"), "initiative": ("grid", "initiative"), "free": ("free", "manual")}
CARD_STYLES = ("face", "full", "none")
SHOWABLE_TYPES = ("counter", "number")
STYLES = ("bar", "number", "discrete")
DISPLAY_ON = ("card", "hover", "hidden")
VIEWS = ("player", "dm")
DEFAULT_SPACING = 14
MAX_SPACING = 300


def _choice(value, options, label):
    if value not in options:
        raise BadRequest(f"{label} must be one of {options}")
    return value


class CreaturePanel(SetType):
    key = "creature_panel"
    name = "Creature panel"
    default_size = (900, 420)
    uses_actors = True
    actor_kinds = ("character",)

    def default_config(self) -> dict:
        return {
            "shape": "grid",
            "order": "manual",
            "card_style": "face",
            "highlight_actor_id": None,
            "spotlight": False,
            "sort_key": "initiative",
            "spacing": DEFAULT_SPACING,
        }

    def validate_config(self, config: dict, current: dict | None = None) -> dict:
        current = dict(current or {})
        # Older panels: "picture" became "card_style"; cards are always compact now (no "card_size")
        current.pop("card_size", None)
        if "picture" in current:
            current.setdefault("card_style", current.pop("picture"))
        if "layout" in current:
            shape, order = OLD_LAYOUTS.get(current.pop("layout"), ("grid", "manual"))
            current.setdefault("shape", shape)
            current.setdefault("order", order)
        result = {**self.default_config(), **current}
        for key, value in (config or {}).items():
            if key == "shape":
                result[key] = _choice(value, SHAPES, "Arrangement")
            elif key == "order":
                result[key] = _choice(value, ORDERS, "Order")
            elif key == "card_style":
                result[key] = _choice(value, CARD_STYLES, "Card style")
            elif key == "highlight_actor_id":
                result[key] = None if value is None else int(value)
            elif key == "spotlight":
                result[key] = bool(value)
            elif key == "sort_key":
                result[key] = str(value)[:80]
            elif key == "spacing":
                try:
                    result[key] = max(0, min(MAX_SPACING, int(value)))
                except (TypeError, ValueError):
                    raise BadRequest("Spacing must be a number") from None
            else:
                raise BadRequest(f"Unknown setting '{key}'")
        return result

    # -- actors ---------------------------------------------------------------

    def _showable(self, ctx: RenderContext, resource: Resource):
        type_def = ctx.ruleset.type_def(resource.kind, resource.type)
        return type_def, [a for a in type_def.attributes if a.type in SHOWABLE_TYPES]

    @staticmethod
    def default_style(attr_type: str) -> str:
        """Exact values by default: bars for counters, numbers otherwise."""
        return "bar" if attr_type == "counter" else "number"

    @staticmethod
    def _view_from_mode(mode: str | None, fallback_style: str) -> dict:
        """An old single display mode ("bar", "number", "discrete" or "hidden") as a style + where it shows."""
        if mode in STYLES:
            return {"style": mode, "display_on": "card"}
        return {"style": fallback_style, "display_on": "hidden" if mode == "hidden" else "card"}

    def new_actor_config(self, ctx: RenderContext, stage_set: StageSet, resource: Resource) -> dict:
        type_def, showable = self._showable(ctx, resource)
        attributes = [
            {"key": a.key,
             "player": self._view_from_mode(type_def.stage_display.get(a.key, "hidden"), self.default_style(a.type)),
             "dm": {"style": self.default_style(a.type), "display_on": "card"}}
            for a in showable
        ]
        return {"card_style": None, "player": {"name": None, "hide_name": False},
                "dm": {"name": None, "hide_name": False, "hidden": False}, "attributes": attributes}

    @staticmethod
    def _clean_view(value: dict, current: dict, dm: bool) -> dict:
        if not isinstance(value, dict):
            raise BadRequest("View settings must be an object")
        result = dict(current)
        for key, item in value.items():
            if key == "name":
                result[key] = (str(item).strip()[:120] or None) if item is not None else None
            elif key == "hide_name":
                result[key] = bool(item)
            elif key == "hidden" and dm:
                result[key] = bool(item)
            else:
                raise BadRequest(f"Unknown card setting '{key}'")
        return result

    @staticmethod
    def _clean_attr_view(value, fallback: dict) -> dict:
        value = value if isinstance(value, dict) else {}
        return {
            "style": _choice(value.get("style", fallback["style"]), STYLES, "Style"),
            "display_on": _choice(value.get("display_on", fallback["display_on"]), DISPLAY_ON, "Display on"),
        }

    def _upgrade_actor_config(self, current: dict) -> dict:
        """Cards saved before the player/DM split: one display name for players, one mode per value."""
        current = dict(current)
        if "picture" in current:
            current.setdefault("card_style", current.pop("picture"))
        display_name = current.pop("display_name", None)
        hide_name = bool(current.pop("hide_name", False))
        current.setdefault("player", {"name": display_name, "hide_name": hide_name})
        attributes = []
        for item in current.get("attributes") or []:
            if "player" in item:
                attributes.append(item)
                continue
            # The value's type isn't known here: "bar" is fine, numbers show as numbers when rendered
            attributes.append({
                "key": item["key"],
                "player": self._view_from_mode(item.get("mode"), "bar"),
                "dm": self._view_from_mode(item.get("dm_mode"), "bar"),
            })
        current["attributes"] = attributes
        return current

    def validate_actor_config(self, ctx: RenderContext, config: dict, current: dict | None = None) -> dict:
        current = self._upgrade_actor_config(current or {})
        result = {
            "card_style": None,
            **current,
            "player": {"name": None, "hide_name": False, **(current.get("player") or {})},
            "dm": {"name": None, "hide_name": False, "hidden": False, **(current.get("dm") or {})},
        }
        for key, value in (config or {}).items():
            if key == "card_style":
                result[key] = None if value is None else _choice(value, CARD_STYLES, "Card style")
            elif key in VIEWS:
                result[key] = self._clean_view(value, result[key], dm=key == "dm")
            elif key == "attributes":
                if not isinstance(value, list):
                    raise BadRequest("attributes must be a list")
                default = {"style": "bar", "display_on": "card"}
                result[key] = [
                    {"key": str(item["key"]),
                     "player": self._clean_attr_view(item.get("player"), {**default, "display_on": "hidden"}),
                     "dm": self._clean_attr_view(item.get("dm"), default)}
                    for item in value
                ]
            else:
                raise BadRequest(f"Unknown card setting '{key}'")
        return result

    # -- render ---------------------------------------------------------------

    def _attribute(self, ctx: RenderContext, attr, entry: dict, value, resource: Resource) -> dict | None:
        """One value for this viewer. Players get their view only; the DM gets the DM view, how players
        see it (player_style, player_display_on) and the real values."""
        viewer = ctx.viewer

        def fit(view: dict) -> dict:
            style = view["style"]
            if attr.type == "number" and style in ("bar", "discrete"):
                style = "number"
            return {"style": style, "display_on": view["display_on"]}

        player = fit(entry["player"])
        dm = fit(entry["dm"])
        if not viewer.is_admin and player["display_on"] == "hidden":
            return None
        mine = dm if viewer.is_admin else player
        item = {"key": attr.key, "label": attr.name, "type": attr.type, **mine}
        players_see_balls = player["style"] == "discrete" and player["display_on"] != "hidden"
        if attr.type == "counter":
            value = value or {"current": 0, "max": 0}
            if mine["style"] == "discrete" or (viewer.is_admin and players_see_balls):
                point_a, point_b = discrete.thresholds(ctx.secret, f"{resource.id}:{attr.key}")
                item["level"] = discrete.level(value["current"], value["max"], point_a, point_b)
                item["levels"] = discrete.LEVELS
            if mine["style"] in ("bar", "number") or viewer.is_admin:
                item["current"] = value["current"]
                item["max"] = value["max"]
        else:
            if mine["style"] == "number" or viewer.is_admin:
                item["value"] = value
        if viewer.is_admin:
            item["player_style"] = player["style"]
            item["player_display_on"] = player["display_on"]
        return item

    @staticmethod
    def _name(view: dict, resource: Resource) -> str | None:
        return None if view["hide_name"] else (view["name"] or resource.name)

    def render(self, ctx: RenderContext, stage_set: StageSet, actors: list[StageActor]) -> dict:
        viewer = ctx.viewer
        config = self.validate_config({}, stage_set.config)
        cards = []
        for actor in actors:
            resource = actor.resource
            if resource is None:
                continue
            if not can_see(viewer, actor.visibility):
                continue
            hidden = not is_shared(actor.visibility)
            type_def = ctx.ruleset.type_def(resource.kind, resource.type)
            attrs_by_key = {a.key: a for a in type_def.attributes}
            card_config = self.validate_actor_config(ctx, {}, actor.config)
            values = resource.attributes or {}

            attributes = []
            defeated = False
            for entry in card_config["attributes"]:
                attr = attrs_by_key.get(entry["key"])
                if attr is None or attr.type not in SHOWABLE_TYPES:
                    continue
                item = self._attribute(ctx, attr, entry, values.get(attr.key), resource)
                if item is None:
                    continue
                attributes.append(item)
                counter = values.get(attr.key) if attr.type == "counter" else None
                if counter and counter.get("max", 0) > 0 and counter.get("current", 1) <= 0:
                    defeated = True

            style = card_config["card_style"] or config["card_style"]
            picture = None
            portrait_attr = next((a for a in type_def.attributes if a.type == "image"), None)
            portrait = values.get(portrait_attr.key) if portrait_attr else None
            if style != "none" and portrait and portrait.get("file_id"):
                picture = {"url": signed_file_url(portrait["file_id"]), "face": portrait.get("face")}

            view = card_config["dm"] if viewer.is_admin else card_config["player"]
            card = {
                "id": actor.id,
                "resource_id": resource.id,
                "order": actor.sort_order,
                "position": actor.position or {},
                "name": self._name(view, resource),
                "type": resource.type,
                "style": style,
                "picture": picture,
                "attributes": attributes,
                "defeated": defeated,
                "sort_value": values.get(config["sort_key"]) if isinstance(values.get(config["sort_key"]), (int, float)) else None,
            }
            if viewer.is_admin:
                card.update({
                    "hidden": hidden,
                    "dm_hidden": bool(card_config["dm"]["hidden"]),
                    "real_name": resource.name,
                    "player_name": self._name(card_config["player"], resource),
                    "config": card_config,
                })
            cards.append(card)

        if config["order"] == "initiative":
            cards.sort(key=lambda c: (-(c["sort_value"] if c["sort_value"] is not None else float("-inf")), c["order"]))
        else:
            cards.sort(key=lambda c: (c["order"], c["id"]))
        if not viewer.is_admin:
            for card in cards:
                card.pop("sort_value", None)  # the order is enough; don't leak initiative values

        visible_ids = {c["id"] for c in cards}
        highlight = config["highlight_actor_id"] if config["highlight_actor_id"] in visible_ids else None
        return {
            "shape": config["shape"],
            "order": config["order"],
            "card_style": config["card_style"],
            "spacing": config["spacing"],
            "highlight_actor_id": highlight,
            "spotlight": bool(config["spotlight"] and highlight is not None),
            "cards": cards,
            **({"config": config} if viewer.is_admin else {}),
        }
