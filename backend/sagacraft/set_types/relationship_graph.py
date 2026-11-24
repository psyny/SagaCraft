"""Relationship graph Set: a relationship graph on a Stage, for the players to see. See docs/concepts/stages.md
("Relationship graph Set") and docs/concepts/relationships.md.

The DM picks whose knowledge it shows (member groups: by default the players' group) and the query (everything,
characters, around resources, a set of resources with hops; kinds, references, a moment in the story). Showing
the Set shows those relationships to whoever sees the Set: it's the DM's choice, like revealing. Each viewer still
gets endpoints they can't see masked (RenderContext.relationships: services/relationships.py). The DM drags nodes
into place in Build; everyone sees that layout.
"""
import copy

from domain.calendar import CalendarError, check_shape
from domain.relationships import MAX_HOPS
from services.errors import BadRequest
from set_types.base import RenderContext, SetType, TemplateRefs

MODES = ("all", "characters", "around", "set")
KINDS = ("character", "location", "item", "document", "event")
MAX_IDS, MAX_POSITIONS = 60, 400


class RelationshipGraph(SetType):
    key = "relationship_graph"
    template_settings = ("groups", "mode", "hops", "kinds", "references", "labels", "at")
    name = "Relationship graph"
    default_size = (900, 600)

    def default_config(self) -> dict:
        return {"groups": [], "mode": "characters", "ids": [], "hops": 1, "kinds": [], "references": False,
                "at": None, "labels": True, "positions": {}}

    def initial_config(self, ctx: RenderContext) -> dict:
        players = next((g["id"] for g in ctx.relationships.groups() if g["key"] == "players"), None)
        return {**self.default_config(), "groups": [players] if players else []}

    def normalize(self, config: dict | None) -> dict:
        return {**self.default_config(), **copy.deepcopy(config or {})}

    # -- Saga templates (plan 41): its settings, the member groups by key or name ----------------------------

    def template_config(self, config: dict, refs: TemplateRefs) -> dict:
        out = super().template_config(config, refs)
        if "groups" in out:
            out["groups"] = refs.names_of("member_group", out["groups"])
        return out

    def config_from_template(self, ctx: RenderContext, settings: dict, refs: TemplateRefs) -> dict:
        settings = dict(settings) if isinstance(settings, dict) else {}
        if "groups" in settings:
            settings["groups"] = refs.ids_of("member_group", settings["groups"])
        return super().config_from_template(ctx, settings, refs)

    def validate_config(self, config: dict, current: dict | None = None) -> dict:
        result = self.normalize(current)
        for key, value in (config or {}).items():
            if key in ("groups", "ids"):
                if not isinstance(value, list) or any(isinstance(v, bool) or not isinstance(v, int) for v in value):
                    raise BadRequest(f"{key}: a list of ids")
                result[key] = list(dict.fromkeys(value))[:MAX_IDS]
            elif key == "mode":
                if value not in MODES:
                    raise BadRequest(f"mode: one of {list(MODES)}")
                result[key] = value
            elif key == "hops":
                if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= MAX_HOPS:
                    raise BadRequest(f"hops: 0 to {MAX_HOPS}")
                result[key] = value
            elif key == "kinds":
                if not isinstance(value, list) or not set(value) <= set(KINDS):
                    raise BadRequest(f"kinds: from {list(KINDS)}")
                result[key] = list(dict.fromkeys(value))
            elif key in ("references", "labels"):
                result[key] = bool(value)
            elif key == "at":
                try:
                    result[key] = None if value is None else check_shape(value, "at")
                except CalendarError as exc:
                    raise BadRequest(str(exc)) from None
            else:
                raise BadRequest(f"Unknown setting '{key}': node positions change through commands")
        return result

    def command(self, ctx: RenderContext, stage_set, name: str, args: dict):
        config = self.normalize(stage_set.config)
        if name == "nodes.place":  # {positions: {node id: [x, y]}} in the Set's own units (0..1 of its size)
            positions = args.get("positions")
            if not isinstance(positions, dict):
                raise BadRequest("positions: {node: [x, y]}")
            merged = dict(config["positions"])
            for node, point in positions.items():
                if not (isinstance(node, str) and node.startswith("r") and node[1:].isdigit()):
                    raise BadRequest("Only resources' nodes keep a place")
                if point is None:
                    merged.pop(node, None)
                    continue
                if not (isinstance(point, list) and len(point) == 2
                        and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in point)):
                    raise BadRequest("A place is [x, y]")
                merged[node] = [round(max(0.0, min(1.0, float(v))), 4) for v in point]
            if len(merged) > MAX_POSITIONS:
                raise BadRequest(f"At most {MAX_POSITIONS} placed nodes")
            config["positions"] = merged
        elif name == "nodes.reset":
            config["positions"] = {}
        else:
            raise BadRequest(f"Unknown command '{name}'")
        stage_set.config = config
        return None

    def render(self, ctx: RenderContext, stage_set, actors) -> dict:
        config = self.normalize(stage_set.config)
        query = {k: config[k] for k in ("mode", "ids", "hops", "kinds", "references", "at")}
        graph = ctx.relationships.graph(ctx.viewer, config["groups"], query)
        content = {"graph": graph, "labels": config["labels"], "positions": config["positions"], "at": config["at"]}
        if ctx.viewer.is_admin:
            content["config"] = config
            content["groups"] = ctx.relationships.groups()
        return content
