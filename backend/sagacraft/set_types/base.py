"""The contract every Set type implements. The Stage core only talks to Sets through it.

Adding a Set type = one module here + one folder in frontend/src/stage/sets/, registered in both
registries. See docs/concepts/stages.md.
"""
from dataclasses import dataclass

from domain.ruleset import Ruleset
from domain.visibility import Viewer
from models import Resource, StageActor, StageSet


@dataclass
class RenderContext:
    viewer: Viewer
    ruleset: Ruleset
    secret: str


class SetType:
    key: str = ""
    name: str = ""
    default_size: tuple[int, int] = (800, 500)
    uses_actors: bool = False
    actor_kinds: tuple[str, ...] = ()

    def default_config(self) -> dict:
        return {}

    def validate_config(self, config: dict, current: dict | None = None) -> dict:
        """Merge a (partial) config into the current one and return a valid config."""
        return {**self.default_config(), **(current or {})}

    def new_actor_config(self, ctx: RenderContext, stage_set: StageSet, resource: Resource) -> dict:
        return {}

    def validate_actor_config(self, ctx: RenderContext, config: dict, current: dict | None = None) -> dict:
        return {**(current or {})}

    def render(self, ctx: RenderContext, stage_set: StageSet, actors: list[StageActor]) -> dict:
        """The Set's content for this viewer. Must never include what the viewer can't see."""
        return {}
