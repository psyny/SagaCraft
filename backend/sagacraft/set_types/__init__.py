"""Registry of Set types. Register new types here (and in frontend/src/stage/sets/registry.ts)."""
from services.errors import BadRequest
from set_types.base import RenderContext, SetType
from set_types.creature_panel import CreaturePanel

SET_TYPES: dict[str, SetType] = {t.key: t for t in (CreaturePanel(),)}


def get_set_type(key: str) -> SetType:
    try:
        return SET_TYPES[key]
    except KeyError:
        raise BadRequest(f"Unknown Set type '{key}'") from None


__all__ = ["SET_TYPES", "RenderContext", "SetType", "get_set_type"]
