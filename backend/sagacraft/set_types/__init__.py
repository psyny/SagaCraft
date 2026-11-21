"""Registry of Set types. Register new types here (and in frontend/src/stage/sets/registry.ts)."""
from services.errors import BadRequest
from set_types.actors_scene import ActorsScene
from set_types.base import CommandResult, RenderContext, SetType

SET_TYPES: dict[str, SetType] = {t.key: t for t in (ActorsScene(),)}


def get_set_type(key: str) -> SetType:
    try:
        return SET_TYPES[key]
    except KeyError:
        raise BadRequest(f"Unknown Set type '{key}'") from None


__all__ = ["SET_TYPES", "CommandResult", "RenderContext", "SetType", "get_set_type"]
