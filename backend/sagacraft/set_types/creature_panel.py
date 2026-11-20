"""Creature panel: characters as cards. How each card is displayed comes from display templates (the
character type's default, or the template the panel picks for that type); see domain/display.py.

Players only ever receive what they may see: hidden cards and values are left out, and balls carry only
the level. See docs/concepts/stages.md ("Creature panel").
"""
from domain import display
from domain.visibility import can_see, is_shared
from models import Resource, StageActor, StageSet
from services.errors import BadRequest
from services.resources import player_name
from services.security import signed_file_url
from set_types.base import RenderContext, SetType

SHAPES = ("grid", "row", "column", "circle", "free")
ORDERS = ("manual", "initiative")
# Before shapes and orders there was one "layout" setting
OLD_LAYOUTS = {"auto": ("grid", "manual"), "initiative": ("grid", "initiative"), "free": ("free", "manual")}
CARD_STYLES = display.CARD_MODES
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
            "templates": {},
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
            elif key == "templates":
                # Per character type: a template id, or null for the type's default. Partial updates merge.
                if not isinstance(value, dict):
                    raise BadRequest("templates must be an object")
                templates = dict(result.get("templates") or {})
                for type_key, template_id in value.items():
                    if template_id is None:
                        templates.pop(str(type_key), None)
                    else:
                        try:
                            templates[str(type_key)] = int(template_id)
                        except (TypeError, ValueError):
                            raise BadRequest("A template id must be a number") from None
                result[key] = templates
            else:
                raise BadRequest(f"Unknown setting '{key}'")
        return result

    # -- actors: no display settings of their own (templates decide) ----------

    def new_actor_config(self, ctx: RenderContext, stage_set: StageSet, resource: Resource) -> dict:
        return {}

    def validate_actor_config(self, ctx: RenderContext, config: dict, current: dict | None = None) -> dict:
        if config:
            raise BadRequest("Cards have no settings of their own: change the display template instead")
        return {}

    # -- render ---------------------------------------------------------------

    def _card_values(self, ctx: RenderContext, resource: Resource, config: dict, style: str) -> tuple[list, bool]:
        viewer = ctx.viewer
        type_def = ctx.ruleset.type_def(resource.kind, resource.type)
        values = resource.attributes or {}
        attributes = []
        defeated = False
        for attr in type_def.attributes:
            if not display.applies(style, attr):
                continue
            player = display.value_view(config, style, attr, "player")
            dm = display.value_view(config, style, attr, "dm")
            if not viewer.is_admin and player["display_on"] == "hidden":
                continue
            mine = dm if viewer.is_admin else player
            attributes.append(display.render_value(
                attr, values.get(attr.key), mine, player if viewer.is_admin else None, admin=viewer.is_admin,
                secret=ctx.secret, seed=f"{resource.id}:{attr.key}"))
            counter = values.get(attr.key) if attr.type == "counter" else None
            if counter and counter.get("max", 0) > 0 and counter.get("current", 1) <= 0:
                defeated = True
        return attributes, defeated

    def _card(self, ctx: RenderContext, resource: Resource, template: tuple, style: str) -> dict:
        template_id, template_name, config = template
        attributes, defeated = self._card_values(ctx, resource, config, style)
        type_def = ctx.ruleset.type_def(resource.kind, resource.type)
        values = resource.attributes or {}
        picture = None
        portrait_attr = next((a for a in type_def.attributes if a.type == "image"), None)
        portrait = values.get(portrait_attr.key) if portrait_attr else None
        if style != "none" and portrait and portrait.get("file_id"):
            picture = {"url": signed_file_url(portrait["file_id"]), "face": portrait.get("face")}
        # On the Stage, a character's name is what the table sees: the alias, even for its controllers
        name = resource.name if ctx.viewer.is_admin else player_name(resource)
        card = {
            "resource_id": resource.id,
            "name": name,
            "type": resource.type,
            "style": style,
            "picture": picture,
            "attributes": attributes,
            "defeated": defeated,
        }
        if ctx.viewer.is_admin:
            card.update({"real_name": resource.name, "player_name": player_name(resource),
                         "template": {"id": template_id, "name": template_name}})
        return card

    def preview_card(self, ctx: RenderContext, resource: Resource, config: dict, style: str) -> dict:
        """A card for the template editor's preview (no panel, no actor)."""
        return {"id": 0, "order": 0, "position": {}, **self._card(ctx, resource, (None, "", config), style)}

    def render(self, ctx: RenderContext, stage_set: StageSet, actors: list[StageActor]) -> dict:
        viewer = ctx.viewer
        config = self.validate_config({}, stage_set.config)
        cards = []
        for actor in actors:
            resource = actor.resource
            if resource is None or not can_see(viewer, actor.visibility):
                continue
            template = ctx.displays.template_for(resource, config["templates"])
            values = resource.attributes or {}
            sort_value = values.get(config["sort_key"])
            card = {
                "id": actor.id,
                "order": actor.sort_order,
                "position": actor.position or {},
                **self._card(ctx, resource, template, config["card_style"]),
                "sort_value": sort_value if isinstance(sort_value, (int, float)) else None,
            }
            if viewer.is_admin:
                card["hidden"] = not is_shared(actor.visibility)
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
