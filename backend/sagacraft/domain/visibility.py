"""Who can see what inside a Saga. Pure rules: no database, no HTTP.

A visibility is {"groups": [group ids], "members": [member ids], "owner": bool}. Admins always see everything;
"owner" shows a resource to its owners (services/resources.owner_ids). Viewers see what players see (their Viewer
holds the players group: services/access.viewer_for) and never edit.
Ruleset attribute rules use group *keys* instead: admins, players, viewers, controllers.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Viewer:
    member_id: int
    role: str  # admin | player | viewer
    group_ids: frozenset[int] = field(default_factory=frozenset)  # default group + custom groups

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def empty_visibility() -> dict:
    return {"groups": [], "members": []}


def normalize(visibility: dict | None, owner: bool = False) -> dict:
    """owner: whether this visibility may name the owner (resources and folders; not Sets or map items)."""
    visibility = visibility or {}
    out = {
        "groups": sorted({int(g) for g in visibility.get("groups", [])}),
        "members": sorted({int(m) for m in visibility.get("members", [])}),
    }
    if owner and visibility.get("owner"):
        out["owner"] = True
    return out


def can_see(viewer: Viewer, visibility: dict | None, owners: set[int] | frozenset[int] = frozenset()) -> bool:
    if viewer.is_admin:
        return True
    visibility = visibility or {}
    if viewer.member_id in set(visibility.get("members", [])):
        return True
    if visibility.get("owner") and viewer.member_id in owners:
        return True
    return bool(viewer.group_ids & set(visibility.get("groups", [])))


def is_shared(visibility: dict | None) -> bool:
    """True when anyone besides admins may see it. Admin views mark unshared items as hidden."""
    visibility = visibility or {}
    return bool(visibility.get("groups") or visibility.get("members") or visibility.get("owner"))


ROLE_KEYS = {"admin": "admins", "player": "players", "viewer": "viewers"}


def rule_allows(viewer: Viewer, keys: list[str], controller_ids: set[int], edit: bool = False) -> bool:
    """Check a ruleset rule (list of group keys) for a viewer on one resource. Viewers see what players see and
    never edit."""
    if viewer.is_admin:
        return True
    if viewer.role == "viewer":
        return not edit and bool({"viewers", "players"} & set(keys))
    if ROLE_KEYS.get(viewer.role) in keys:
        return True
    return "controllers" in keys and viewer.member_id in controller_ids
