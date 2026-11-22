"""Timeline Set: the Saga's timeline on a Stage ("what happened so far"). See docs/concepts/stages.md ("Timeline
Set") and docs/concepts/events.md.

The DM picks whose knowledge it shows (member groups: by default the players' group; none: the DM's own, all of
it), the dates (from, to), the event types, and whether events start expanded. Like the relationship graph Set,
showing the Set shows that knowledge to whoever sees the Set: it's the DM's choice. Players pan and zoom it.
"""
import copy

from domain.calendar import CalendarError, check_shape
from services.errors import BadRequest
from set_types.base import RenderContext, SetType

MAX_IDS = 60


class Timeline(SetType):
    key = "timeline"
    name = "Timeline"
    default_size = (1000, 420)

    def default_config(self) -> dict:
        return {"groups": [], "from": None, "to": None, "types": [], "expanded": False}

    def initial_config(self, ctx: RenderContext) -> dict:
        players = next((g["id"] for g in ctx.relationships.groups() if g["key"] == "players"), None)
        return {**self.default_config(), "groups": [players] if players else []}

    def normalize(self, config: dict | None) -> dict:
        return {**self.default_config(), **copy.deepcopy(config or {})}

    def validate_config(self, config: dict, current: dict | None = None) -> dict:
        result = self.normalize(current)
        for key, value in (config or {}).items():
            if key == "groups":
                if not isinstance(value, list) or any(isinstance(v, bool) or not isinstance(v, int) for v in value):
                    raise BadRequest("groups: a list of ids")
                result[key] = list(dict.fromkeys(value))[:MAX_IDS]
            elif key == "types":
                if not isinstance(value, list) or any(not isinstance(v, str) for v in value):
                    raise BadRequest("types: a list of event types")
                result[key] = list(dict.fromkeys(v[:80] for v in value))[:MAX_IDS]
            elif key in ("from", "to"):
                try:
                    result[key] = None if value is None else check_shape(value, key)
                except CalendarError as exc:
                    raise BadRequest(str(exc)) from None
            elif key == "expanded":
                result[key] = bool(value)
            else:
                raise BadRequest(f"Unknown setting '{key}'")
        if result["from"] is not None and result["to"] is not None and result["to"] < result["from"]:
            raise BadRequest("The timeline can't end before it starts")
        return result

    def render(self, ctx: RenderContext, stage_set, actors) -> dict:
        config = self.normalize(stage_set.config)
        known = {g["id"] for g in ctx.relationships.groups()}
        data = ctx.events.timeline([g for g in config["groups"] if g in known])
        start, end = config["from"], config["to"]

        def inside(first: int, last: int | None) -> bool:  # touches from..to (None: no limit)
            return (end is None or first <= end) and (start is None or last is None or last >= start)

        events = [e for e in data["events"] if e["date"] is not None
                  and inside(e["date"], e.get("end") or e["date"])
                  and (not config["types"] or e["type"] in config["types"])]
        eras = [e for e in data["eras"] if inside(e["start"], e["end"])]
        # The event types in the template's order (their colours), each with its description variable
        types = [{"key": key, "name": t.name, "text": next((a.key for a in t.attributes if a.type == "rich_text"), None)}
                 for (kind, key), t in ctx.ruleset.types.items() if kind == "event"]
        content = {"events": events, "eras": eras, **ctx.events.calendar(), "from": start, "to": end,
                   "expanded": config["expanded"], "types": types}
        if ctx.viewer.is_admin:
            content["config"] = config
            content["groups"] = ctx.relationships.groups()
        return content
