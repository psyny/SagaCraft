"""The contract every Set type implements. The Stage core only talks to Sets through it.

Adding a Set type = one module here + one folder in frontend/src/stage/sets/, registered in both
registries. See docs/concepts/stages.md.
"""
from dataclasses import dataclass, field
from typing import Any

from domain.ruleset import Ruleset
from domain.visibility import Viewer
from models import Resource, StageActor, StageSet
from services.errors import BadRequest


@dataclass
class RenderContext:
    viewer: Viewer
    ruleset: Ruleset
    secret: str
    # The Saga's display templates and categories (services.displays.DisplayBook): how characters are displayed
    displays: Any = None
    # The visibility "all players" in this Saga (viewers see what players see) (for types that show things to everyone or nobody)
    everyone: dict = field(default_factory=lambda: {"groups": [], "members": []})
    # Locations' maps for this viewer (services.locations.MapBook)
    maps: Any = None
    # Relationship graphs (services.relationships.RelationshipBook)
    relationships: Any = None
    # EFX environments (services.environments.EfxBook)
    efx: Any = None
    # Timelines as known by member groups, the calendar (services.events.EventBook)
    events: Any = None
    # The Saga's uploads (services.stages.FileBook): a picture added on the spot (actor.config["temp_file_id"]: the
    # Stage core deletes it with its actor, Set or Stage)
    files: Any = None
    # The Saga's members: name, colour and dice style (services.stages.MemberBook)
    members: Any = None


@dataclass
class CommandResult:
    """What a command asks the Stage core to do beyond changing the Set (the core owns the database)."""
    delete_actor_ids: list[int] = field(default_factory=list)


class SetType:
    key: str = ""
    name: str = ""
    default_size: tuple[int, int] = (800, 500)
    uses_actors: bool = False
    actor_kinds: tuple[str, ...] = ()
    # Where a new Set goes among the layers: below the Sets of a higher depth (backgrounds 0-1, most Sets 2,
    # foregrounds 3, overlays 4)
    depth: int = 2
    # A backdrop covers the other Sets on a canvas Stage when added
    backdrop: bool = False
    default_transparent: bool = False
    # Its place on an interface Stage when added (None: the default)
    default_screen: dict | None = None
    # Admins only when added (the DM's tools)
    private: bool = False

    def default_config(self) -> dict:
        return {}

    def initial_config(self, ctx: RenderContext) -> dict:
        """Config of a new Set (may follow the Saga's ruleset)."""
        return self.default_config()

    def validate_config(self, config: dict, current: dict | None = None) -> dict:
        """Merge a (partial) config into the current one and return a valid config."""
        return {**self.default_config(), **(current or {})}

    def place_actors(self, ctx: RenderContext, stage_set: StageSet, resources: list[Resource],
                     options: dict) -> list[StageActor]:
        """New actors for these resources (not yet added). May also change existing actors (e.g. reveal them).
        options: hidden, tab_id, sources (per resource: the group it was added with, or None)."""
        hidden = options.get("hidden", True)
        return [StageActor(resource_id=r.id, position={}, config={},
                           visibility={"groups": [], "members": []} if hidden else dict(ctx.everyone))
                for r in resources]

    def validate_actor_config(self, ctx: RenderContext, config: dict, current: dict | None = None) -> dict:
        return {**(current or {})}

    def command(self, ctx: RenderContext, stage_set: StageSet, name: str, args: dict) -> CommandResult | None:
        """A named action on the Set (UX-6: buttons, shortcuts and later voice/AI send the same)."""
        raise BadRequest(f"Unknown command '{name}'")

    def act(self, ctx: RenderContext, stage_set: StageSet, member_id: int, name: str, args: dict) -> None:
        """What members (players and the DM, not viewers) do on a Set of the live Stage (the dice tray). The DM's
        own changes go through `command`. ctx.viewer is the member acting."""
        raise BadRequest("Nothing to do on this Set")

    def attention_target(self, ctx: RenderContext, stage_set: StageSet, target: dict) -> dict:
        """Grab attention on something of the Set's own (e.g. map tiles). Returns the cleaned target, which the
        frontend's targetRect turns into a place to centre on."""
        raise BadRequest("This Set has no attention targets")

    def after_change(self, ctx: RenderContext, stage_set: StageSet) -> None:
        """Called after actors were added or a command ran (e.g. keep derived actor visibility in sync)."""

    def action_rolled(self, ctx: RenderContext, stage_set: StageSet, roll: dict) -> bool:
        """An action's dice, rolled when it ran (plan 37), for a Set on the live Stage that shows rolls (the dice
        roller; the Saga's settings say whether actions roll there). roll: {"member_id" (whose dice they are),
        "action" (its name), "formulas": [{"formula", "value", "dice": [{"sides", "value"}]}]}. True: the Set changed."""
        return False

    def forget_actor(self, config: dict, actor_id: int) -> dict:
        """The Set's config once an actor is removed (drop references to it)."""
        return config

    def copy_config(self, config: dict, id_map: dict[int, int]) -> dict:
        """The config for a copy of the Set, where actor ids changed (old id -> new id)."""
        return config

    def render(self, ctx: RenderContext, stage_set: StageSet, actors: list[StageActor]) -> dict:
        """The Set's content for this viewer. Must never include what the viewer can't see."""
        return {}
