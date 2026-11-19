"""System admin permissions (see docs/concepts/sagas-and-access.md)."""

SYSTEM_ADMINS_MANAGE = "system_admins.manage"
SAGAS_CREATE = "sagas.create"
SAGAS_MANAGE = "sagas.manage"
SAGA_ADMINS_ASSIGN = "saga_admins.assign"
USERS_MANAGE = "users.manage"
RULESETS_MANAGE = "rulesets.manage"
SYSTEM_SETTINGS_MANAGE = "system_settings.manage"

ALL_PERMISSIONS: dict[str, str] = {
    SYSTEM_ADMINS_MANAGE: "Create and edit system admins (only with permissions you hold)",
    SAGAS_CREATE: "Create Sagas",
    SAGAS_MANAGE: "Edit, archive and delete any Saga",
    SAGA_ADMINS_ASSIGN: "Assign a Saga's admins",
    USERS_MANAGE: "Disable accounts and reset passwords",
    RULESETS_MANAGE: "Install or remove rulesets",
    SYSTEM_SETTINGS_MANAGE: "Change instance settings (upload limits)",
}

ROLES = ("admin", "player", "viewer")
DEFAULT_GROUPS = {"admin": ("admins", "Admins"), "player": ("players", "Players"), "viewer": ("viewers", "Viewers")}


def effective_permissions(is_root: bool, permissions: list[str]) -> set[str]:
    """The root system admin holds every permission."""
    if is_root:
        return set(ALL_PERMISSIONS)
    return {p for p in permissions if p in ALL_PERMISSIONS}


def can_grant(granter: set[str], requested: list[str]) -> bool:
    """A system admin can only grant permissions they hold themselves."""
    return set(requested) <= granter
