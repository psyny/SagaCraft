"""Actors Scene: characters as cards, in tabs (Exploration, Dialog, Combat...). The main Set for showing
characters; it replaced the first version's Creature panel. See docs/concepts/stages.md ("Actors Scene").

- The scene holds the card style, the templates per category, its creatures (the cast: the same in every tab)
  and the active tab (what players see).
- Each tab holds, per creature, whether players see it there and its free position
  (actor.config["tabs"][tab_id] = {"shown", "position"}; missing: hidden), and its layout, order, turn and
  highlight.
- actor.config["group_id"]: the group a creature was added with (its color, the Group element).
- Actors of instanceable characters are instances: actor.config["instance"] = {"number", "values"}, the
  values changed on the Stage (the rest follows the character).

Players only ever receive the active tab: its shown cards, in order, with values filtered by the display
templates (balls carry only the level), no sort values, no other tab.
"""
import copy

from domain import display
from domain.ruleset import TypeDef
from domain.visibility import normalize
from models import Resource, StageActor, StageSet
from services.errors import BadRequest
from services.resources import player_name
from services.security import signed_file_url
from set_types.base import CommandResult, RenderContext, SetType

SHAPES = ("grid", "row", "column", "circle", "bar", "boundary", "free")
FLOWS = ("static", "rotate")
FLOW_SHAPES = ("grid", "row", "column", "circle")
TURN_ACTIONS = ("start", "next", "previous", "end")
CARD_STYLES = display.CARD_MODES
DEFAULT_SPACING = 14
MAX_SPACING = 300
DEFAULT_TOP = 16  # distance from the scene's top to the first cards
MAX_TOP = 600
MAX_SCATTER = 80  # boundary: each card's random shift, up to this many px each way
OLD_SCATTER = 12  # what "scatter on" (a yes/no before) becomes
MAX_NEUTRAL = 80  # boundary: % of the width, in the middle, with no cards
MAX_TABS = 12
CUSTOM = "custom"


def new_tab(tab_id: int, name: str, **settings) -> dict:
    tab = {
        "id": tab_id, "name": name, "shape": "grid", "flow": "static", "scatter": 0, "neutral": 0,
        # spacing: between cards (grid, row, turn bar: horizontal); spacing_y: vertical (grid, turn bar)
        "spacing": DEFAULT_SPACING, "spacing_y": DEFAULT_SPACING, "top": DEFAULT_TOP,
        "order_by": CUSTOM, "order": [], "turn_controls": False, "turn": {"actor_id": None, "round": 0},
        "highlight_actor_id": None, "spotlight": False,
    }
    tab.update(settings)
    return tab


def _choice(value, options, label):
    if value not in options:
        raise BadRequest(f"{label} must be one of {list(options)}")
    return value


def _int(value, label: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise BadRequest(f"{label} must be a number") from None


def is_defeated(type_def: TypeDef, values: dict) -> bool:
    for attr in type_def.attributes:
        counter = values.get(attr.key) if attr.type == "counter" else None
        if isinstance(counter, dict) and counter.get("max", 0) > 0 and counter.get("current", 1) <= 0:
            return True
    return False


def actor_values(actor: StageActor) -> dict:
    """The values a card shows: the character's, with an instance's own changes on top."""
    instance = (actor.config or {}).get("instance") or {}
    return {**((actor.resource.attributes if actor.resource else None) or {}), **(instance.get("values") or {})}


class ActorsScene(SetType):
    key = "actors_scene"
    name = "Actors Scene"
    default_size = (1000, 520)
    uses_actors = True
    actor_kinds = ("character",)

    # -- config ---------------------------------------------------------------

    def default_config(self) -> dict:
        return {
            "card_style": "face",
            "templates": {},
            "active_tab": 1,
            "next_tab": 4,
            "tabs": [
                new_tab(1, "Exploration"),
                new_tab(2, "Dialog", shape="boundary", neutral=20),
                new_tab(3, "Combat", shape="bar", turn_controls=True),
            ],
        }

    def initial_config(self, ctx: RenderContext) -> dict:
        config = self.default_config()
        turn_order = ctx.ruleset.saga_template.get("turn_order")
        if turn_order:
            config["tabs"][2]["order_by"] = turn_order  # Combat: by initiative (the Saga template says which value)
        return config

    def normalize(self, config: dict | None) -> dict:
        result = {**self.default_config(), **copy.deepcopy(config or {})}
        tabs = [new_tab(int(t.get("id", i + 1)), str(t.get("name") or "Tab"), **{
            k: v for k, v in t.items() if k not in ("id", "name")}) for i, t in enumerate(result.get("tabs") or [])]
        if not tabs:
            tabs = [new_tab(1, "Scene")]
        for tab in tabs:
            if isinstance(tab.get("scatter"), bool):
                tab["scatter"] = OLD_SCATTER if tab["scatter"] else 0
            tab["turn"] = {"actor_id": None, "round": 0, **(tab.get("turn") or {})}
            tab["order"] = [int(a) for a in tab.get("order") or []]
        result["tabs"] = tabs
        ids = [t["id"] for t in tabs]
        if result.get("active_tab") not in ids:
            result["active_tab"] = ids[0]
        result["next_tab"] = max(int(result.get("next_tab") or 0), max(ids) + 1)
        return result

    def validate_config(self, config: dict, current: dict | None = None) -> dict:
        result = self.normalize(current)
        for key, value in (config or {}).items():
            if key == "card_style":
                result[key] = _choice(value, CARD_STYLES, "Card style")
            elif key == "templates":
                # Per category id: a template id, or null for the category's default. Partial updates merge.
                if not isinstance(value, dict):
                    raise BadRequest("templates must be an object")
                templates = dict(result.get("templates") or {})
                for category_key, template_id in value.items():
                    if template_id is None:
                        templates.pop(str(category_key), None)
                    else:
                        templates[str(category_key)] = _int(template_id, "A template id")
                result[key] = templates
            else:
                raise BadRequest(f"Unknown setting '{key}': tab settings change through the scene's commands")
        return result

    def _tab(self, config: dict, tab_id) -> dict:
        tab_id = config["active_tab"] if tab_id is None else _int(tab_id, "tab_id")
        tab = next((t for t in config["tabs"] if t["id"] == tab_id), None)
        if tab is None:
            raise BadRequest("Unknown tab")
        return tab

    def _sort_keys(self, ctx: RenderContext) -> dict[str, str]:
        """The values a tab can be ordered by: the ruleset's sortable character numbers."""
        keys: dict[str, str] = {}
        for (kind, _), type_def in ctx.ruleset.types.items():
            if kind == "character":
                for attr in type_def.attributes:
                    if attr.sortable and attr.type == "number":
                        keys.setdefault(attr.key, attr.name)
        return keys

    def _set_tab(self, ctx: RenderContext, tab: dict, changes: dict) -> None:
        for key, value in changes.items():
            if key == "name":
                tab["name"] = str(value or "").strip()[:60] or tab["name"]
            elif key == "shape":
                tab["shape"] = _choice(value, SHAPES, "Layout")
            elif key == "flow":
                tab["flow"] = _choice(value, FLOWS, "Initiative flow")
            elif key == "scatter":
                tab["scatter"] = max(0, min(MAX_SCATTER, _int(value, "Scatter")))
            elif key == "neutral":
                tab["neutral"] = max(0, min(MAX_NEUTRAL, _int(value, "Neutral zone")))
            elif key in ("spacing", "spacing_y"):
                tab[key] = max(0, min(MAX_SPACING, _int(value, "Spacing")))
            elif key == "top":
                tab["top"] = max(0, min(MAX_TOP, _int(value, "Distance to top")))
            elif key == "turn_controls":
                tab["turn_controls"] = bool(value)
            elif key == "order_by":
                if value != CUSTOM and value not in self._sort_keys(ctx):
                    raise BadRequest("Order by your order or a sortable value")
                tab["order_by"] = value
            else:
                raise BadRequest(f"Unknown tab setting '{key}'")

    # -- actors ---------------------------------------------------------------

    @staticmethod
    def _tabs_of(actor: StageActor) -> dict:
        return dict((actor.config or {}).get("tabs") or {})

    def _shown(self, actor: StageActor, tab_id: int) -> bool:
        return bool((self._tabs_of(actor).get(str(tab_id)) or {}).get("shown"))

    @staticmethod
    def _put(actor: StageActor, tab_id: int, **changes) -> None:
        config = copy.deepcopy(actor.config or {})
        tabs = config.setdefault("tabs", {})
        tabs[str(tab_id)] = {**(tabs.get(str(tab_id)) or {}), **changes}
        actor.config = config

    @staticmethod
    def _leave(actor: StageActor, tab_id: int) -> None:
        config = copy.deepcopy(actor.config or {})
        (config.get("tabs") or {}).pop(str(tab_id), None)
        actor.config = config

    def place_actors(self, ctx: RenderContext, stage_set: StageSet, resources: list[Resource],
                     options: dict) -> list[StageActor]:
        """Into the scene (every tab), revealed only in the tab they're added from ("Add and reveal"). Instanceable
        characters always become a new instance; others are at most once in the scene."""
        config = self.normalize(stage_set.config)
        tab = self._tab(config, options.get("tab_id"))
        shown = not options.get("hidden", True)
        sources = list(options.get("sources") or [])
        existing = list(stage_set.actors)
        numbers: dict[int, int] = {}
        for actor in existing:
            instance = (actor.config or {}).get("instance")
            if instance and actor.resource_id is not None:
                numbers[actor.resource_id] = max(numbers.get(actor.resource_id, 0), int(instance.get("number") or 0))
        created: list[StageActor] = []
        for index, resource in enumerate(resources):
            source = sources[index] if index < len(sources) else None
            base: dict = {"tabs": {str(tab["id"]): {"shown": shown}}}
            if source is not None:
                base["group_id"] = source
            if resource.instanceable:
                numbers[resource.id] = numbers.get(resource.id, 0) + 1
                created.append(StageActor(resource_id=resource.id, resource=resource, position={}, visibility={}, config={
                    **base, "instance": {"number": numbers[resource.id], "values": {}},
                }))
                continue
            same = next((a for a in existing + created
                         if a.resource_id == resource.id and not (a.config or {}).get("instance")), None)
            if same is None:
                created.append(StageActor(resource_id=resource.id, resource=resource, position={}, visibility={},
                                          config=base))
            elif shown:
                self._put(same, tab["id"], shown=True)  # already in the scene: "Add and reveal" reveals it here
        return created

    def validate_actor_config(self, ctx: RenderContext, config: dict, current: dict | None = None) -> dict:
        if config:
            raise BadRequest("Cards have no settings of their own: use the scene's commands or the display templates")
        return dict(current or {})

    def after_change(self, ctx: RenderContext, stage_set: StageSet) -> None:
        """Players see a card when it's shown in the active tab. The actor's visibility mirrors that, so the rest
        of the app (grab attention, opening a sheet from the live Stage) keeps one rule."""
        config = self.normalize(stage_set.config)
        active = config["active_tab"]
        hidden = {"groups": [], "members": []}
        for actor in stage_set.actors:
            wanted = dict(ctx.everyone) if self._shown(actor, active) else hidden
            if normalize(actor.visibility) != normalize(wanted):
                actor.visibility = wanted

    def forget_actor(self, config: dict, actor_id: int) -> dict:
        config = self.normalize(config)
        for tab in config["tabs"]:
            tab["order"] = [a for a in tab["order"] if a != actor_id]
            if tab["turn"]["actor_id"] == actor_id:
                tab["turn"] = {**tab["turn"], "actor_id": None}
            if tab["highlight_actor_id"] == actor_id:
                tab["highlight_actor_id"], tab["spotlight"] = None, False
        return config

    def copy_config(self, config: dict, id_map: dict[int, int]) -> dict:
        config = self.normalize(config)
        for tab in config["tabs"]:
            tab["order"] = [id_map[a] for a in tab["order"] if a in id_map]
            tab["turn"] = {"actor_id": id_map.get(tab["turn"]["actor_id"]), "round": tab["turn"]["round"]}
            if tab["turn"]["actor_id"] is None:
                tab["turn"]["round"] = 0
            tab["highlight_actor_id"] = id_map.get(tab["highlight_actor_id"])
            tab["spotlight"] = tab["spotlight"] and tab["highlight_actor_id"] is not None
        return config

    # -- order and turns ------------------------------------------------------

    def _cast(self, stage_set: StageSet, tab: dict | None = None) -> list[StageActor]:
        """The scene's creatures: the same in every tab."""
        return [a for a in stage_set.actors if a.resource is not None]

    def ordered(self, actors: list[StageActor], tab: dict) -> list[StageActor]:
        """Custom order (new cards last), or by a value, highest first, ties in the custom order."""
        custom = {actor_id: i for i, actor_id in enumerate(tab["order"])}
        result = sorted(actors, key=lambda a: (custom.get(a.id, len(custom)), a.sort_order, a.id))
        if tab["order_by"] != CUSTOM:
            key = tab["order_by"]

            def value(actor: StageActor):
                v = actor_values(actor).get(key)
                return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

            result.sort(key=lambda a: (value(a) is None, -(value(a) or 0)))
        return result

    def _defeated(self, ctx: RenderContext, actor: StageActor) -> bool:
        resource = actor.resource
        return is_defeated(ctx.ruleset.type_def(resource.kind, resource.type), actor_values(actor))

    def _turn(self, ctx: RenderContext, stage_set: StageSet, tab: dict, action: str) -> None:
        _choice(action, TURN_ACTIONS, "Turn action")
        actors = self.ordered(self._cast(stage_set, tab), tab)
        ids = [a.id for a in actors]
        alive = {a.id for a in actors if not self._defeated(ctx, a)}
        turn = tab["turn"]
        if action == "end" or not alive:
            tab["turn"] = {"actor_id": None, "round": 0}
            return
        if action == "start" or turn["actor_id"] not in ids:
            tab["turn"] = {"actor_id": next(i for i in ids if i in alive), "round": 1}
            return
        step = 1 if action == "next" else -1
        index, round_ = ids.index(turn["actor_id"]), max(1, int(turn["round"] or 1))
        for _ in range(len(ids)):
            index += step
            if index >= len(ids):
                index, round_ = 0, round_ + 1
            elif index < 0:
                index, round_ = len(ids) - 1, max(1, round_ - 1)
            if ids[index] in alive:
                break
        tab["turn"] = {"actor_id": ids[index], "round": round_}

    # -- commands -------------------------------------------------------------

    def command(self, ctx: RenderContext, stage_set: StageSet, name: str, args: dict) -> CommandResult | None:
        config = self.normalize(stage_set.config)
        result = CommandResult()
        actors = {a.id: a for a in stage_set.actors}

        def actor_arg() -> StageActor:
            actor = actors.get(_int(args.get("actor_id"), "actor_id"))
            if actor is None:
                raise BadRequest("Card not found")
            return actor

        if name == "tab.switch":
            config["active_tab"] = self._tab(config, args.get("tab_id"))["id"]
        elif name == "tab.add":
            if len(config["tabs"]) >= MAX_TABS:
                raise BadRequest(f"At most {MAX_TABS} tabs")
            tab = new_tab(config["next_tab"], str(args.get("name") or "").strip()[:60] or f"Tab {len(config['tabs']) + 1}")
            config["next_tab"] += 1
            config["tabs"].append(tab)
        elif name == "tab.rename":
            self._set_tab(ctx, self._tab(config, args.get("tab_id")), {"name": args.get("name")})
        elif name == "tab.move":
            tab = self._tab(config, args.get("tab_id"))
            config["tabs"].remove(tab)
            to = max(0, min(len(config["tabs"]), _int(args.get("to"), "to")))
            config["tabs"].insert(to, tab)
        elif name == "tab.delete":
            tab = self._tab(config, args.get("tab_id"))
            if len(config["tabs"]) == 1:
                raise BadRequest("A scene keeps at least one tab")
            config["tabs"].remove(tab)
            if config["active_tab"] == tab["id"]:
                config["active_tab"] = config["tabs"][0]["id"]
            for actor in stage_set.actors:
                self._leave(actor, tab["id"])  # the creatures stay in the scene
        elif name == "tab.set":
            changes = args.get("changes")
            if not isinstance(changes, dict):
                raise BadRequest("changes must be an object")
            self._set_tab(ctx, self._tab(config, args.get("tab_id")), changes)
        elif name == "card.show":
            tab = self._tab(config, args.get("tab_id"))
            self._put(actor_arg(), tab["id"], shown=bool(args.get("shown", True)))
        elif name == "cards.show_all":
            tab = self._tab(config, args.get("tab_id"))
            for actor in self._cast(stage_set, tab):
                self._put(actor, tab["id"], shown=bool(args.get("shown", True)))
        elif name == "card.position":
            tab = self._tab(config, args.get("tab_id"))
            actor = actor_arg()
            self._put(actor, tab["id"], position={"x": _int(args.get("x"), "x"), "y": _int(args.get("y"), "y")})
        elif name == "order.set":
            tab = self._tab(config, args.get("tab_id"))
            if args.get("actor_ids") is not None:
                cast = {a.id for a in self._cast(stage_set, tab)}
                wanted = [_int(a, "actor id") for a in args["actor_ids"]]
                if set(wanted) != cast or len(wanted) != len(cast):
                    raise BadRequest("The order must list every card of the scene")
                tab["order"], tab["order_by"] = wanted, CUSTOM
            if args.get("by") is not None:
                self._set_tab(ctx, tab, {"order_by": args["by"]})
        elif name == "order.move":
            # Moving a card keeps the order the DM sees (even when sorted by a value) and makes it custom
            tab = self._tab(config, args.get("tab_id"))
            ids = [a.id for a in self.ordered(self._cast(stage_set, tab), tab)]
            actor = actor_arg()
            index = ids.index(actor.id)
            to = max(0, min(len(ids) - 1, index + _int(args.get("by", 1), "by")))
            ids.insert(to, ids.pop(index))
            tab["order"], tab["order_by"] = ids, CUSTOM
        elif name == "turn":
            self._turn(ctx, stage_set, self._tab(config, args.get("tab_id")), str(args.get("action")))
        elif name == "highlight":
            tab = self._tab(config, args.get("tab_id"))
            actor_id = args.get("actor_id")
            if actor_id is not None:
                actor_id = actor_arg().id
            tab["highlight_actor_id"] = actor_id
            tab["spotlight"] = bool(args.get("spotlight", False)) and actor_id is not None
        else:
            raise BadRequest(f"Unknown command '{name}'")
        stage_set.config = config
        return result

    # -- render ---------------------------------------------------------------

    def _card(self, ctx: RenderContext, resource: Resource, values: dict, template: tuple, style: str,
              number: int | None = None, seed: str | None = None, source_group: int | None = None) -> dict:
        template_id, template_name, config = template
        type_def = ctx.ruleset.type_def(resource.kind, resource.type)
        picture = None
        portrait_attr = next((a for a in type_def.attributes if a.type == "image"), None)
        portrait = (resource.attributes or {}).get(portrait_attr.key) if portrait_attr else None
        if style != "none" and portrait and portrait.get("file_id"):
            picture = {"url": signed_file_url(portrait["file_id"]), "face": portrait.get("face")}
        numbered = (lambda n: f"{n} {number}" if n and number else n)
        # On the Stage, a character's name is what the table sees: the alias, even for its controllers
        name = numbered(resource.name if ctx.viewer.is_admin else player_name(resource))
        book = ctx.displays
        category = book.category(resource)
        group = book.group(resource, source_group)
        card = {
            "resource_id": resource.id,
            "instance": number,
            "name": name,
            "type": resource.type,
            "category_id": resource.category_id,
            "side": "player" if category is not None and category.player else "other",
            "style": style,
            "picture": picture,
            "color": group.color if group is not None else None,
            "attributes": book.render(ctx.viewer, resource, values, config, style, seed or str(resource.id),
                                      name=name, group=group),
            "defeated": is_defeated(type_def, values),
        }
        if ctx.viewer.is_admin:
            card.update({"real_name": numbered(resource.name), "player_name": numbered(player_name(resource)),
                         "template": {"id": template_id, "name": template_name},
                         "group": {"id": group.id, "name": group.name} if group is not None else None})
        return card

    def preview_card(self, ctx: RenderContext, resource: Resource, config: dict, style: str) -> dict:
        """A card for the template editor's preview (no scene, no actor)."""
        return {"id": 0, "position": {}, **self._card(ctx, resource, resource.attributes or {}, (None, "", config), style)}

    def _tab_out(self, ctx: RenderContext, stage_set: StageSet, tab: dict, admin: bool) -> dict:
        cast = self.ordered(self._cast(stage_set, tab), tab)
        if not admin:
            cast = [a for a in cast if self._shown(a, tab["id"])]
        ids = [a.id for a in cast]
        sequence = list(ids)  # in order, before rotating: who goes first
        turn = dict(tab["turn"])
        if turn["actor_id"] not in ids:
            turn["actor_id"] = None  # players don't learn that a hidden creature is acting
        if tab["flow"] == "rotate" and tab["shape"] in FLOW_SHAPES and turn["actor_id"] in ids:
            start = ids.index(turn["actor_id"])
            ids = ids[start:] + ids[:start]  # the creature whose turn it is comes first
        highlight = tab["highlight_actor_id"] if tab["highlight_actor_id"] in ids else None
        out = {
            "id": tab["id"], "name": tab["name"], "shape": tab["shape"], "flow": tab["flow"], "scatter": tab["scatter"],
            "neutral": tab["neutral"], "spacing": tab["spacing"], "spacing_y": tab["spacing_y"], "top": tab["top"],
            "order_by": tab["order_by"], "turn": turn, "highlight_actor_id": highlight,
            "spotlight": bool(tab["spotlight"] and highlight is not None), "card_ids": ids,
        }
        if admin:
            out.update({"order": tab["order"], "sequence": sequence, "turn_controls": tab["turn_controls"]})
        return out

    def render(self, ctx: RenderContext, stage_set: StageSet, actors: list[StageActor]) -> dict:
        admin = ctx.viewer.is_admin
        config = self.normalize(stage_set.config)
        active = self._tab(config, None)
        sort_keys = self._sort_keys(ctx)
        tab = self._tab_out(ctx, stage_set, active, admin)
        wanted = [a for a in actors if a.resource is not None] if admin else \
            [a for a in actors if a.id in set(tab["card_ids"])]
        cards = []
        for actor in wanted:
            resource = actor.resource
            instance = (actor.config or {}).get("instance") or {}
            values = actor_values(actor)
            seed = f"{resource.id}:{actor.id}" if instance else str(resource.id)
            card = {
                "id": actor.id,
                "position": (self._tabs_of(actor).get(str(active["id"])) or {}).get("position") or {},
                **self._card(ctx, resource, values, ctx.displays.template_for(resource, config["templates"]),
                             config["card_style"], instance.get("number"), seed, (actor.config or {}).get("group_id")),
            }
            if admin:
                own = self._tabs_of(actor)
                card["tabs"] = {t["id"]: {"shown": bool((own.get(str(t["id"])) or {}).get("shown")),
                                          "position": (own.get(str(t["id"])) or {}).get("position") or {}}
                                for t in config["tabs"]}
                card["hidden"] = not self._shown(actor, active["id"])
                card["instanceable"] = bool(resource.instanceable)
                card["sort_values"] = {k: values.get(k) for k in sort_keys
                                       if isinstance(values.get(k), (int, float)) and not isinstance(values.get(k), bool)}
            cards.append(card)
        if not admin:
            order = {actor_id: i for i, actor_id in enumerate(tab["card_ids"])}
            cards.sort(key=lambda c: order[c["id"]])
        content = {"card_style": config["card_style"], "active_tab": active["id"], "tab": tab, "cards": cards}
        if admin:
            content.update({
                "tabs": [self._tab_out(ctx, stage_set, t, True) for t in config["tabs"]],
                "sort_keys": [[k, v] for k, v in sort_keys.items()],
                "turn_order": ctx.ruleset.saga_template.get("turn_order"),  # the value typed in the order tray
                "config": config,
            })
        return content
