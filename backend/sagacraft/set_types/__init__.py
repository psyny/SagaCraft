"""Registry of Set types. Register new types here (and in frontend/src/stage/sets/registry.ts)."""
from services.errors import BadRequest
from set_types.actors_scene import ActorsScene
from set_types.base import CommandResult, RenderContext, SetType
from set_types.desktop import Desktop
from set_types.dice import DiceRoller
from set_types.efx import EfxControls, EfxFar, EfxFore, EfxNear
from set_types.maps import WorldMap
from set_types.relationship_graph import RelationshipGraph
from set_types.timeline import Timeline

SET_TYPES: dict[str, SetType] = {t.key: t for t in (ActorsScene(), WorldMap(), RelationshipGraph(), Timeline(), Desktop(), DiceRoller(),
                                                    EfxFar(), EfxNear(), EfxFore(), EfxControls())}


def get_set_type(key: str) -> SetType:
    try:
        return SET_TYPES[key]
    except KeyError:
        raise BadRequest(f"Unknown Set type '{key}'") from None


__all__ = ["SET_TYPES", "CommandResult", "RenderContext", "SetType", "get_set_type"]
