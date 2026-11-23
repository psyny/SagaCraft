"""Accounts, system admins, Sagas, members and groups."""
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from domain import permissions as perms
from domain.ruleset import available_rulesets, get_ruleset
from domain.visibility import Viewer
from models import Group, GroupMember, Saga, SagaMember, SystemAdmin, User
from services.errors import BadRequest, Conflict, Forbidden, NotFound, Unauthorized
from services.security import create_token, hash_password, verify_password

# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------


def _clean_login(login: str) -> str:
    login = (login or "").strip().lower()
    if not (2 <= len(login) <= 80) or any(c.isspace() for c in login):
        raise BadRequest("Login must be 2-80 characters, without spaces")
    return login


def _check_password(password: str) -> None:
    if len(password or "") < 6:
        raise BadRequest("Password must have at least 6 characters")


def create_user(db: Session, login: str, password: str, display_name: str = "") -> User:
    login = _clean_login(login)
    _check_password(password)
    if db.scalar(select(User).where(User.login == login)):
        raise Conflict(f"Login '{login}' is already taken")
    user = User(login=login, display_name=(display_name or login).strip()[:120], password_hash=hash_password(password))
    db.add(user)
    db.flush()
    return user


def login(db: Session, login_name: str, password: str) -> str:
    user = db.scalar(select(User).where(User.login == (login_name or "").strip().lower()))
    if not user or not user.is_active or not verify_password(password or "", user.password_hash):
        raise Unauthorized("Wrong login or password")
    return create_token(user.id)


def bootstrap_root_admin(db: Session, login_name: str, password: str) -> None:
    """Create the root system admin on an empty instance (settings ROOT_ADMIN_LOGIN/PASSWORD)."""
    if not login_name or not password:
        return
    if db.scalar(select(SystemAdmin).limit(1)):
        return
    user = db.scalar(select(User).where(User.login == login_name.strip().lower()))
    if user is None:
        user = create_user(db, login_name, password, "Root admin")
    db.add(SystemAdmin(user_id=user.id, is_root=True, permissions=[]))
    db.commit()


def me(db: Session, user: User) -> dict:
    admin = user.system_admin
    rows = db.execute(
        select(SagaMember, Saga).join(Saga, Saga.id == SagaMember.saga_id)
        .where(SagaMember.user_id == user.id, Saga.is_archived.is_(False)).order_by(Saga.name)
    ).all()
    return {
        "id": user.id,
        "login": user.login,
        "display_name": user.display_name,
        "system_admin": None if admin is None else {
            "is_root": admin.is_root,
            "permissions": sorted(perms.effective_permissions(admin.is_root, admin.permissions or [])),
        },
        "sagas": [{"id": s.id, "name": s.name, "role": m.role, "member_id": m.id} for m, s in rows],
    }


# ---------------------------------------------------------------------------
# System administration
# ---------------------------------------------------------------------------


def system_permissions(user: User) -> set[str]:
    admin = user.system_admin
    if admin is None:
        return set()
    return perms.effective_permissions(admin.is_root, admin.permissions or [])


def require_permission(user: User, permission: str) -> None:
    if permission not in system_permissions(user):
        raise Forbidden("You don't have permission to do this")


def list_system_admins(db: Session, user: User) -> list[dict]:
    if not system_permissions(user):
        raise Forbidden("Only system admins can see this")
    admins = db.scalars(select(SystemAdmin)).all()
    return [
        {
            "user_id": a.user_id, "login": a.user.login, "display_name": a.user.display_name, "is_root": a.is_root,
            "permissions": sorted(perms.effective_permissions(a.is_root, a.permissions or [])),
        }
        for a in admins
    ]


def create_system_admin(db: Session, granter: User, login_name: str, password: str, display_name: str,
                        permissions: list[str]) -> dict:
    require_permission(granter, perms.SYSTEM_ADMINS_MANAGE)
    unknown = set(permissions) - set(perms.ALL_PERMISSIONS)
    if unknown:
        raise BadRequest(f"Unknown permissions: {sorted(unknown)}")
    if not perms.can_grant(system_permissions(granter), permissions):
        raise Forbidden("You can only grant permissions you hold")
    user = db.scalar(select(User).where(User.login == (login_name or "").strip().lower()))
    if user is None:
        user = create_user(db, login_name, password, display_name)
    elif user.system_admin is not None:
        raise Conflict("This account is already a system admin")
    db.add(SystemAdmin(user_id=user.id, is_root=False, permissions=sorted(set(permissions)),
                       created_by_user_id=granter.id))
    db.commit()
    db.refresh(user)
    return next(a for a in list_system_admins(db, granter) if a["user_id"] == user.id)


def update_system_admin(db: Session, granter: User, user_id: int, permissions: list[str]) -> dict:
    require_permission(granter, perms.SYSTEM_ADMINS_MANAGE)
    admin = db.get(SystemAdmin, user_id)
    if admin is None:
        raise NotFound("System admin not found")
    if admin.is_root:
        raise BadRequest("The root admin always has every permission")
    granter_perms = system_permissions(granter)
    # You can't add or remove permissions you don't hold yourself
    changed = set(permissions) ^ set(admin.permissions or [])
    if not changed <= granter_perms:
        raise Forbidden("You can only change permissions you hold")
    admin.permissions = sorted(set(permissions) & set(perms.ALL_PERMISSIONS))
    db.commit()
    return next(a for a in list_system_admins(db, granter) if a["user_id"] == user_id)


def list_all_sagas(db: Session, user: User) -> list[dict]:
    if not system_permissions(user):
        raise Forbidden("Only system admins can see this")
    sagas = db.scalars(select(Saga).order_by(Saga.created_at.desc())).all()
    result = []
    for saga in sagas:
        admins = db.execute(
            select(User.login).join(SagaMember, SagaMember.user_id == User.id)
            .where(SagaMember.saga_id == saga.id, SagaMember.role == "admin")
        ).scalars().all()
        result.append({"id": saga.id, "name": saga.name, "ruleset_key": saga.ruleset_key,
                       "is_archived": saga.is_archived, "admins": list(admins)})
    return result


def create_saga(db: Session, creator: User, name: str, ruleset_key: str, admin_login: str,
                admin_password: str | None, admin_display_name: str = "", template: dict | None = None) -> dict:
    """A new Saga from a built-in Saga template (ruleset_key) or a template file (`template`)."""
    from domain import saga_template as tpl

    require_permission(creator, perms.SAGAS_CREATE)
    require_permission(creator, perms.SAGA_ADMINS_ASSIGN)
    name = (name or "").strip()
    if not name:
        raise BadRequest("The Saga needs a name")
    if template is not None:
        from services.saga_templates import parse_file

        template = parse_file(template)
        ruleset_key = str(template.get("key") or "custom")[:80]
    else:
        get_ruleset(ruleset_key)  # raises if unknown
    saga = Saga(name=name[:160], ruleset_key=ruleset_key,
                template=tpl.definitions(template) if template is not None else None)
    db.add(saga)
    db.flush()
    for key, label in perms.DEFAULT_GROUPS.values():
        db.add(Group(saga_id=saga.id, key=key, name=label))
    _add_member(db, saga, admin_login, admin_password, admin_display_name, "admin")
    db.commit()
    from services.characters import ensure_template

    ensure_template(db, saga)  # the Saga template's starting categories and groups
    if template is not None:
        from services.saga_templates import apply_extras, prune_builtin_templates

        apply_extras(db, saga, template)  # the file's display templates and fog presets
        if template.get("display_templates"):
            prune_builtin_templates(db, saga)
    from services.fog_presets import ensure_default

    ensure_default(db, saga.id)  # the default fog preset
    db.commit()
    return next(s for s in list_all_sagas(db, creator) if s["id"] == saga.id)


def rulesets() -> list[dict]:
    return [{"key": r.key, "name": r.name, "version": r.version} for r in available_rulesets()]


# ---------------------------------------------------------------------------
# Saga membership
# ---------------------------------------------------------------------------


def get_saga(db: Session, saga_id: int) -> Saga:
    saga = db.get(Saga, saga_id)
    if saga is None or saga.is_archived:
        raise NotFound("Saga not found")
    return saga


def get_member(db: Session, saga_id: int, user: User) -> SagaMember:
    """The caller's membership. Non-members get 404, so Sagas don't leak (Saga isolation)."""
    get_saga(db, saga_id)
    member = db.scalar(select(SagaMember).where(SagaMember.saga_id == saga_id, SagaMember.user_id == user.id))
    if member is None:
        raise NotFound("Saga not found")
    return member


def require_admin(member: SagaMember) -> None:
    if member.role != "admin":
        raise Forbidden("Only the Saga's admins can do this")


def default_group_ids(db: Session, saga_id: int) -> dict[str, int]:
    rows = db.execute(select(Group.key, Group.id).where(Group.saga_id == saga_id, Group.key.is_not(None))).all()
    return {key: gid for key, gid in rows}


def viewer_for(db: Session, member: SagaMember) -> Viewer:
    defaults = default_group_ids(db, member.saga_id)
    role_group = defaults.get(perms.DEFAULT_GROUPS[member.role][0])
    custom = db.scalars(select(GroupMember.group_id).where(GroupMember.member_id == member.id)).all()
    ids = set(custom)
    if role_group is not None:
        ids.add(role_group)
    if member.role == "viewer" and defaults.get("players") is not None:
        ids.add(defaults["players"])  # viewers see what players see
    return Viewer(member_id=member.id, role=member.role, group_ids=frozenset(ids))


def guest_viewer(db: Session, saga_id: int) -> Viewer:
    """Whoever opens the Saga's live link: a viewer who is no member (sees what players see)."""
    defaults = default_group_ids(db, saga_id)
    ids = {defaults[k] for k in ("viewers", "players") if defaults.get(k) is not None}
    return Viewer(member_id=0, role="viewer", group_ids=frozenset(ids))


def _add_member(db: Session, saga: Saga, login_name: str, password: str | None, display_name: str, role: str) -> SagaMember:
    if role not in perms.ROLES:
        raise BadRequest(f"Role must be one of {perms.ROLES}")
    user = db.scalar(select(User).where(User.login == (login_name or "").strip().lower()))
    if user is None:
        if not password:
            raise BadRequest("New accounts need a password")
        user = create_user(db, login_name, password, display_name)
    elif password:
        raise Conflict(f"Login '{user.login}' already exists: leave the password empty to add that account")
    if db.scalar(select(SagaMember).where(SagaMember.saga_id == saga.id, SagaMember.user_id == user.id)):
        raise Conflict("This account is already in the Saga")
    member = SagaMember(saga_id=saga.id, user_id=user.id, role=role)
    db.add(member)
    db.flush()
    return member


# Members' colours until they pick their own (Saga → User): distinct, readable on the dark theme
PALETTE = ("#e2604f", "#5bb98c", "#6fa8e0", "#d6a84a", "#b07fd6", "#4fc1c9", "#e08c4f", "#c9c34f", "#e27fb0", "#8fd16a")
DIE_STYLES = ("minimal", "ember", "hellish", "fire", "aristocrat", "guild", "metal_matte", "metal_satin", "metal_polished", "metal_hammered", "metal", "metal_rusted",
              "carbon", "raw_wood", "polished_wood", "noble", "elven", "dwarven", "orcish", "nature", "neon", "marble", "granite",
              "agate", "charoite", "amber", "crystal", "hex", "glass", "iridescent", "gnomish", "jelly", "cosmic", "bone")
_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def member_colors(db: Session, saga_id: int) -> dict[int, str]:
    """Each member's colour: their own, else one from the palette (by when they joined)."""
    members = db.scalars(select(SagaMember).where(SagaMember.saga_id == saga_id).order_by(SagaMember.id)).all()
    return {m.id: m.color or PALETTE[i % len(PALETTE)] for i, m in enumerate(members)}


def update_account(db: Session, user: User, data: dict) -> dict:
    """The signed-in person's own account: display name, and password (with the current one)."""
    if "display_name" in data:
        name = " ".join(str(data["display_name"] or "").split())[:120]
        if not name:
            raise BadRequest("Give a display name")
        user.display_name = name
    if data.get("new_password") is not None:
        if not verify_password(str(data.get("password") or ""), user.password_hash):
            raise BadRequest("The current password is wrong")
        _check_password(str(data["new_password"]))
        user.password_hash = hash_password(str(data["new_password"]))
    db.commit()
    return me(db, user)


def update_my_member(db: Session, member: SagaMember, data: dict) -> dict:
    """The member's own settings in this Saga: colour, dice style, and how dice draw on their screen (still, simple)."""
    if "color" in data:
        color = data["color"]
        if color is not None and not _HEX_COLOR.match(str(color)):
            raise BadRequest("Colour must be like #a1b2c3")
        member.color = str(color).lower() if color else None
    if "die_style" in data:
        if data["die_style"] not in DIE_STYLES:
            raise BadRequest(f"Dice styles: {list(DIE_STYLES)}")
        member.die_style = data["die_style"]
    for flag in ("dice_still", "dice_simple"):
        if flag in data:
            if not isinstance(data[flag], bool):
                raise BadRequest(f"{flag}: true or false")
            setattr(member, flag, data[flag])
    db.commit()
    return saga_overview(db, member)


def saga_overview(db: Session, member: SagaMember) -> dict:
    saga = get_saga(db, member.saga_id)
    members = db.scalars(select(SagaMember).where(SagaMember.saga_id == saga.id).order_by(SagaMember.id)).all()
    groups = db.scalars(select(Group).where(Group.saga_id == saga.id).order_by(Group.id)).all()
    custom_rows = db.execute(
        select(GroupMember.group_id, GroupMember.member_id).join(Group, Group.id == GroupMember.group_id)
        .where(Group.saga_id == saga.id)
    ).all()
    custom_members: dict[int, list[int]] = {}
    for gid, mid in custom_rows:
        custom_members.setdefault(gid, []).append(mid)
    role_key = {v[0]: k for k, v in perms.DEFAULT_GROUPS.items()}  # admins -> admin
    is_admin = member.role == "admin"

    def group_members(group: Group) -> list[int]:
        if group.key:
            return [m.id for m in members if m.role == role_key[group.key]]
        return sorted(custom_members.get(group.id, []))

    viewer = viewer_for(db, member)
    colors = member_colors(db, saga.id)
    visible_groups = [g for g in groups if is_admin or g.id in viewer.group_ids or g.key]
    return {
        "id": saga.id,
        "name": saga.name,
        "ruleset_key": saga.ruleset_key,
        "live_stage_id": saga.live_stage_id,
        **({"live_token": saga.live_token} if is_admin else {}),
        **_calendar(db, saga),
        "me": {"member_id": member.id, "role": member.role, "group_ids": sorted(viewer.group_ids),
               "color": member.color, "die_style": member.die_style or "minimal",
               "dice_still": bool(member.dice_still), "dice_simple": bool(member.dice_simple)},
        "members": [
            {"id": m.id, "user_id": m.user_id, "display_name": m.user.display_name, "role": m.role, "color": colors[m.id],
             "die_style": m.die_style or "minimal",
             **({"login": m.user.login} if is_admin else {})}
            for m in members
        ],
        "groups": [
            {"id": g.id, "key": g.key, "name": g.name, "is_default": g.key is not None,
             "member_ids": group_members(g) if (is_admin or g.key is None) else []}
            for g in visible_groups
        ],
    }


def _calendar(db: Session, saga: Saga) -> dict:
    """The in-world calendar and today in the story: every member formats dates with them."""
    from services.calendars import calendar_of, story_date

    return {"calendar": calendar_of(db, saga), "story_date": story_date(saga)}


def add_member(db: Session, member: SagaMember, login_name: str, password: str | None, display_name: str, role: str) -> dict:
    require_admin(member)
    _add_member(db, get_saga(db, member.saga_id), login_name, password, display_name, role)
    db.commit()
    return saga_overview(db, member)


def update_member(db: Session, member: SagaMember, target_id: int, role: str) -> dict:
    require_admin(member)
    target = db.get(SagaMember, target_id)
    if target is None or target.saga_id != member.saga_id:
        raise NotFound("Member not found")
    if role not in perms.ROLES:
        raise BadRequest(f"Role must be one of {perms.ROLES}")
    if target.role == "admin" and role != "admin" and _admin_count(db, member.saga_id) <= 1:
        raise BadRequest("A Saga needs at least one admin")
    target.role = role
    db.commit()
    return saga_overview(db, member)


def remove_member(db: Session, member: SagaMember, target_id: int) -> dict:
    require_admin(member)
    target = db.get(SagaMember, target_id)
    if target is None or target.saga_id != member.saga_id:
        raise NotFound("Member not found")
    if target.role == "admin" and _admin_count(db, member.saga_id) <= 1:
        raise BadRequest("A Saga needs at least one admin")
    db.delete(target)
    db.commit()
    return saga_overview(db, member)


def _admin_count(db: Session, saga_id: int) -> int:
    return len(db.scalars(select(SagaMember.id).where(SagaMember.saga_id == saga_id, SagaMember.role == "admin")).all())


def _member_ids_in_saga(db: Session, saga_id: int, ids: list[int]) -> list[int]:
    ids = sorted({int(i) for i in ids})
    found = set(db.scalars(select(SagaMember.id).where(SagaMember.saga_id == saga_id, SagaMember.id.in_(ids))).all())
    if found != set(ids):
        raise BadRequest("Some members are not in this Saga")
    return ids


def save_group(db: Session, member: SagaMember, group_id: int | None, name: str, member_ids: list[int]) -> dict:
    require_admin(member)
    name = (name or "").strip()
    if not name:
        raise BadRequest("The group needs a name")
    ids = _member_ids_in_saga(db, member.saga_id, member_ids)
    if group_id is None:
        group = Group(saga_id=member.saga_id, key=None, name=name[:120])
        db.add(group)
        db.flush()
    else:
        group = db.get(Group, group_id)
        if group is None or group.saga_id != member.saga_id:
            raise NotFound("Group not found")
        group.name = name[:120]
        if group.key is None:
            for row in db.scalars(select(GroupMember).where(GroupMember.group_id == group.id)).all():
                db.delete(row)
            db.flush()
    if group.key is None:
        for mid in ids:
            db.add(GroupMember(group_id=group.id, member_id=mid))
    db.commit()
    return saga_overview(db, member)


def delete_group(db: Session, member: SagaMember, group_id: int) -> dict:
    require_admin(member)
    group = db.get(Group, group_id)
    if group is None or group.saga_id != member.saga_id:
        raise NotFound("Group not found")
    if group.key is not None:
        raise BadRequest("Default groups can't be deleted")
    db.delete(group)
    db.commit()
    return saga_overview(db, member)


def check_visibility(db: Session, saga_id: int, visibility: dict | None, owner: bool = False) -> dict:
    """Validate that a visibility only names this Saga's groups and members (owner: it may name the owner, on
    resources and folders)."""
    from domain.visibility import normalize

    visibility = normalize(visibility, owner)
    if visibility["groups"]:
        found = set(db.scalars(select(Group.id).where(Group.saga_id == saga_id, Group.id.in_(visibility["groups"]))).all())
        if found != set(visibility["groups"]):
            raise BadRequest("Unknown group in visibility")
    if visibility["members"]:
        _member_ids_in_saga(db, saga_id, visibility["members"])
    return visibility
