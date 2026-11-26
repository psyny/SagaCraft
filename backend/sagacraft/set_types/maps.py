"""The Map Set: a location's map on a Stage. See docs/concepts/stages.md ("Map Set") and docs/concepts/locations.md.

The DM adds locations (the Set's actors) and shows one at a time; members whose role is interactive click resources
on the map to open them; the fog is drawn with one of the Saga's fog presets (services/fog_presets.py,
RenderContext.maps.fog); tiles can be highlighted; grab attention puts every view at the DM's (zoom and centre);
players and the DM ping tiles (api/stages.py, live only). Mobile tokens are the map's own (domain/maps.py).
(The Local map Set was merged into it: migration e5b9c3d7a281.)

The maps themselves come from RenderContext.maps (services/locations.py: MapBook), filtered per viewer: players
never get the map's pictures, only their composed picture and what their fog shows.
"""
import copy

from domain import fog, maps
from models import Resource, StageActor, StageSet
from services.errors import BadRequest
from set_types.base import RenderContext, SetType, TemplateRefs

ROLES = ("players", "viewers")
MAX_ZOOM = 8  # the map's own zoom inside the Set (frontend MAX_INNER)
ROLE_OF = {"player": "players", "viewer": "viewers"}


class WorldMap(SetType):
    key = "world_map"  # kept from when there was a Local map too (placements and toolbars stay)
    template_settings = ("interactive", "show_grid", "fog_preset")
    name = "Map"
    default_size = (1000, 640)
    uses_actors = True
    actor_kinds = ("location",)
    viewer_acts = ("token.move",)  # a token the DM lets anyone move (plan 58)

    # -- config ---------------------------------------------------------------

    def default_config(self) -> dict:
        # fog_preset: the Saga's fog preset drawing the fog (None or a deleted one: the Saga's first)
        # layers: the layer shown of each location's map ({location id: layer id}; else its first)
        return {"current": None, "interactive": {"players": True, "viewers": False}, "fog_preset": None,
                "show_grid": True, "highlight": None, "highlight_on": True, "layers": {}}

    def normalize(self, config: dict | None) -> dict:
        result = {**self.default_config(), **copy.deepcopy(config or {})}
        for old in ("fog_display", "fog_style", "fog_color", "fog_colors", "fog_size", "fog_intensity", "fog_contrast"):
            result.pop(old, None)  # the fog's look lives in presets now
        result["interactive"] = {role: bool((result.get("interactive") or {}).get(role)) for role in ROLES}
        return result

    # -- Saga templates (plan 41): no location (the Saga's content); the fog preset by name --------------------

    def template_config(self, config: dict, refs: TemplateRefs) -> dict:
        out = super().template_config(config, refs)
        if "fog_preset" in out:
            out["fog_preset"] = refs.name("fog_preset", out["fog_preset"])
        return out

    def config_from_template(self, ctx: RenderContext, settings: dict, refs: TemplateRefs) -> dict:
        settings = dict(settings) if isinstance(settings, dict) else {}
        if "fog_preset" in settings:
            settings["fog_preset"] = refs.id("fog_preset", settings["fog_preset"])
        return super().config_from_template(ctx, settings, refs)

    def validate_config(self, config: dict, current: dict | None = None) -> dict:
        result = self.normalize(current)
        for key, value in (config or {}).items():
            if key == "show_grid":
                result[key] = bool(value)
            elif key == "interactive":
                if not isinstance(value, dict) or not set(value) <= set(ROLES):
                    raise BadRequest(f"interactive: true or false for {list(ROLES)}")
                result[key] = {**result[key], **{k: bool(v) for k, v in value.items()}}
            elif key == "fog_preset":
                if value is not None and (isinstance(value, bool) or not isinstance(value, int)):
                    raise BadRequest("fog_preset is a fog preset's id")
                result[key] = value
            else:
                raise BadRequest(f"Unknown setting '{key}': the shown location and highlight change through commands")
        return self.normalize(result)

    # -- locations (actors) ---------------------------------------------------

    @staticmethod
    def _locations(stage_set: StageSet) -> list[StageActor]:
        return [a for a in stage_set.actors if a.resource is not None]

    def _current(self, stage_set: StageSet, config: dict) -> StageActor | None:
        actors = self._locations(stage_set)
        return next((a for a in actors if a.resource_id == config.get("current")), actors[0] if actors else None)

    def place_actors(self, ctx: RenderContext, stage_set: StageSet, resources: list[Resource],
                     options: dict) -> list[StageActor]:
        """Each location once; the first one added is shown."""
        have = {a.resource_id for a in stage_set.actors}
        created = []
        for resource in resources:
            if resource.id in have:
                continue
            have.add(resource.id)
            created.append(StageActor(resource_id=resource.id, resource=resource, position={}, config={},
                                      visibility={"groups": [], "members": []}))
        if created and (stage_set.config or {}).get("current") is None:
            config = self.normalize(stage_set.config)
            config["current"], config["highlight"] = created[0].resource_id, None
            stage_set.config = config
        return created

    def after_change(self, ctx: RenderContext, stage_set: StageSet) -> None:
        """Players see the shown location's actor (the rest of the app, e.g. opening its page from the live Stage,
        follows actor visibility)."""
        config = self.normalize(stage_set.config)
        current = self._current(stage_set, config)
        for actor in stage_set.actors:
            wanted = dict(ctx.everyone) if actor is current else {"groups": [], "members": []}
            if actor.visibility != wanted:
                actor.visibility = wanted

    def forget_actor(self, config: dict, actor_id: int) -> dict:
        return self.normalize(config)  # the shown location falls back to the first one left

    # -- commands -------------------------------------------------------------

    def command(self, ctx: RenderContext, stage_set: StageSet, name: str, args: dict):
        config = self.normalize(stage_set.config)
        if name == "location.show":
            target = next((a for a in self._locations(stage_set) if a.resource_id == args.get("location_id")), None)
            if target is None:
                raise BadRequest("That location isn't on this map")
            config["current"], config["highlight"] = target.resource_id, None
        elif name == "layer.show":  # the shown location's layer, for everyone
            current = self._current(stage_set, config)
            if current is None:
                raise BadRequest("No location on this map")
            layer_id = args.get("layer_id")
            if layer_id not in ctx.maps.layer_ids(current.resource):
                raise BadRequest("That layer isn't on this map")
            config["layers"] = {**config.get("layers", {}), str(current.resource_id): layer_id}
        elif name == "highlight":
            # tiles: the highlighted tiles (null clears them); on: shown to everyone or kept for later
            current = self._current(stage_set, config)
            if "tiles" in args:
                if args.get("tiles") is None or current is None:
                    config["highlight"] = None
                else:
                    try:
                        config["highlight"] = maps.clean_tiles(ctx.maps.grid(current.resource), args.get("tiles"),
                                                               maps.MAX_REGION_TILES)
                    except maps.MapError as exc:
                        raise BadRequest(str(exc)) from None
            if "on" in args:
                config["highlight_on"] = bool(args.get("on"))
        else:
            raise BadRequest(f"Unknown command '{name}'")
        stage_set.config = config
        return None

    def act(self, ctx: RenderContext, stage_set: StageSet, member_id: int, name: str, args: dict) -> None:
        """Members move tokens the DM lets them move (plan 58: who, when), on the shown location's shown layer, onto
        tiles they know (services/locations.move_token_as checks it all)."""
        if name != "token.move":
            raise BadRequest(f"Unknown action '{name}'")
        config = self.normalize(stage_set.config)
        current = self._current(stage_set, config)
        if current is None:
            raise BadRequest("No location on this map")
        ctx.maps.move_token(ctx.viewer, current.resource, (config.get("layers") or {}).get(str(current.resource_id)),
                            args.get("id"), args.get("tile"), stage_set, args.get("path"))

    def attention_target(self, ctx: RenderContext, stage_set: StageSet, target: dict) -> dict:
        """Grab attention: every view takes the DM's view of the shown location ({view: {k, cx, cy}}: the zoom, 1
        to 8, and the centre, 0..1 of the map), or centres on tiles."""
        current = self._current(stage_set, self.normalize(stage_set.config))
        if current is None:
            raise BadRequest("No location on this map")
        view = (target or {}).get("view")
        if view is not None:
            try:
                k, cx, cy = (float(view[key]) for key in ("k", "cx", "cy"))
            except (KeyError, TypeError, ValueError):
                raise BadRequest("view: {k, cx, cy}") from None
            if not (1 <= k <= MAX_ZOOM and 0 <= cx <= 1 and 0 <= cy <= 1):
                raise BadRequest(f"view: zoom 1 to {MAX_ZOOM}, centre 0 to 1")
            return {"location_id": current.resource_id, "view": {"k": round(k, 3), "cx": round(cx, 4), "cy": round(cy, 4)}}
        try:
            tiles = maps.clean_tiles(ctx.maps.grid(current.resource), (target or {}).get("tiles"), maps.MAX_REGION_TILES)
        except maps.MapError as exc:
            raise BadRequest(str(exc)) from None
        return {"location_id": current.resource_id, "tiles": tiles}

    # -- render ---------------------------------------------------------------

    def render(self, ctx: RenderContext, stage_set: StageSet, actors: list[StageActor]) -> dict:
        config = self.normalize(stage_set.config)
        viewer = ctx.viewer
        current = self._current(stage_set, config)
        content = {
            "fog": self._fog(ctx, config),
            "show_grid": config["show_grid"],
            "interactive": True if viewer.is_admin else bool(config["interactive"].get(ROLE_OF.get(viewer.role, ""))),
            "map": ctx.maps.render(viewer, current.resource, config["highlight"] if config["highlight_on"] else None,
                                   (config.get("layers") or {}).get(str(current.resource_id)),
                                   moves=ctx.maps.moves_for(viewer, stage_set))
            if current is not None else None,
        }
        if viewer.is_admin:
            content["locations"] = [{"actor_id": a.id, "id": a.resource_id, "name": a.resource.name}
                                    for a in self._locations(stage_set)]
            content["current"] = current.resource_id if current is not None else None
            content["config"] = config
            content["fog_presets"] = ctx.maps.fog.choices()
            content["fog_preset"] = ctx.maps.fog.resolve(config["fog_preset"]).id
        return content

    def _fog(self, ctx: RenderContext, config: dict) -> dict:
        """The look the fog is drawn with: the Set's preset."""
        return fog.normalize(ctx.maps.fog.resolve(config["fog_preset"]).look)
