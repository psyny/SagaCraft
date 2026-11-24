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


def create_user(db: Session, login: str, password: str) -> User:
    """An account: a login (lowercase: logins aren't case sensitive) and a password. Its name is each Saga's."""
    login = _clean_login(login)
    _check_password(password)
    if db.scalar(select(User).where(User.login == login)):
        raise Conflict(f"Login '{login}' is already taken")
    user = User(login=login, password_hash=hash_password(password))
    db.add(user)
    db.flush()
    return user


def member_name(member: SagaMember) -> str:
    """A member's name in their Saga (plan 42): their display name there, else their login."""
    return member.display_name or member.user.login


def _clean_name(value) -> str:
    return " ".join(str(value or "").split())[:120]


def login(db: Session, login_name: str, password: str) -> str:
    user = db.scalar(select(User).where(User.login == (login_name or "").strip().lower()))
    if not user or not user.is_active or not verify_password(password or "", user.password_hash):
        raise Unauthorized("Wrong login or password")
    from models import utcnow

    user.last_login_at = utcnow()  # System → Users (plan 43)
    db.commit()
    return create_token(user.id)


def bootstrap_root_admin(db: Session, login_name: str, password: str) -> None:
    """Create the root system admin on an empty instance (settings ROOT_ADMIN_LOGIN/PASSWORD)."""
    if not login_name or not password:
        return
    if db.scalar(select(SystemAdmin).limit(1)):
        return
    user = db.scalar(select(User).where(User.login == login_name.strip().lower()))
    if user is None:
        user = create_user(db, login_name, password)
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
        "system_admin": None if admin is None else {
            "is_root": admin.is_root,
            "permissions": sorted(perms.effective_permissions(admin.is_root, admin.permissions or [])),
        },
        "sagas": [{"id": s.id, "name": s.name, "role": m.role, "member_id": m.id, "display_name": member_name(m)}
                  for m, s in rows],
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
            "user_id": a.user_id, "login": a.user.login, "is_root": a.is_root,
            "permissions": sorted(perms.effective_permissions(a.is_root, a.permissions or [])),
        }
        for a in admins
    ]


def create_system_admin(db: Session, granter: User, login_name: str, password: str, permissions: list[str]) -> dict:
    require_permission(granter, perms.SYSTEM_ADMINS_MANAGE)
    unknown = set(permissions) - set(perms.ALL_PERMISSIONS)
    if unknown:
        raise BadRequest(f"Unknown permissions: {sorted(unknown)}")
    if not perms.can_grant(system_permissions(granter), permissions):
        raise Forbidden("You can only grant permissions you hold")
    user = db.scalar(select(User).where(User.login == (login_name or "").strip().lower()))
    if user is None:
        user = create_user(db, login_name, password)
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


def search_logins(db: Session, user: User, query: str) -> list[dict]:
    """A system admin looking for an account to make a new Saga's DM (who may assign Saga admins or manage accounts):
    logins with what they typed (2 letters or more), active; at most 10."""
    if not system_permissions(user) & {perms.SAGA_ADMINS_ASSIGN, perms.USERS_MANAGE}:
        raise Forbidden("You don't have permission to do this")
    query = (query or "").strip().lower()
    if len(query) < 2:
        return []
    rows = db.scalars(select(User).where(User.login.like(_like(query), escape="\\"), User.is_active.is_(True))
                      .order_by(User.login).limit(10)).all()
    return [{"user_id": u.id, "login": u.login} for u in rows]


def remove_system_admin(db: Session, granter: User, user_id: int) -> None:
    """The account stops being a system admin (it stays an account, in its Sagas). Never the root admin, never
    yourself, and only one whose permissions you all hold."""
    require_permission(granter, perms.SYSTEM_ADMINS_MANAGE)
    admin = db.get(SystemAdmin, user_id)
    if admin is None:
        raise NotFound("System admin not found")
    if admin.is_root:
        raise BadRequest("The root admin stays a system admin")
    if admin.user_id == granter.id:
        raise BadRequest("You can't remove yourself as a system admin")
    if not perms.can_grant(system_permissions(granter), admin.permissions or []):
        raise Forbidden("You can only remove a system admin whose permissions you all hold")
    db.delete(admin)
    db.commit()


def create_saga(db: Session, creator: User, name: str, ruleset_key: str, admin_login: str,
                admin_password: str | None, admin_display_name: str = "", template: dict | None = None,
                admin_account: str | None = None) -> dict:
    """A new Saga from a built-in Saga template (ruleset_key) or a template file (`template`), with its first DM:
    an existing account or a new one (`admin_account`, as a DM adding a member: plan 42)."""
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
        from services.saga_templates import builtin

        get_ruleset(ruleset_key)  # raises if unknown
        template = builtin(ruleset_key)  # its own copy (plan 41): a later change to the file never changes the Saga
    saga = Saga(name=name[:160], ruleset_key=ruleset_key, template=tpl.definitions(template))
    db.add(saga)
    db.flush()
    for key, label in perms.DEFAULT_GROUPS.values():
        db.add(Group(saga_id=saga.id, key=key, name=label))
    _add_member(db, saga, admin_login, admin_password, admin_display_name, "admin", admin_account)
    db.commit()
    from services.characters import ensure_template
    from services.saga_templates import apply_extras

    # The file's display templates (and which types they're the default for), fog presets, EFX environments, groups
    # and Stages first; then a built-in display template for each character type still without a default
    apply_extras(db, saga, template)
    ensure_template(db, saga)
    from services.fog_presets import ensure_default

    ensure_default(db, saga.id)  # the default fog preset
    db.commit()
    from services.system_sagas import saga_row

    return saga_row(db, saga)


# -- accounts (System → Users, plan 42) -----------------------------------------


def _account_out(db: Session, user: User) -> dict:
    rows = db.execute(select(SagaMember, Saga).join(Saga, Saga.id == SagaMember.saga_id)
                      .where(SagaMember.user_id == user.id).order_by(Saga.name)).all()
    admin = user.system_admin
    return {
        "id": user.id, "login": user.login, "is_active": bool(user.is_active),
        "last_login": user.last_login_at.isoformat() if user.last_login_at else None,
        "system_admin": None if admin is None else {
            "is_root": admin.is_root, "permissions": sorted(perms.effective_permissions(admin.is_root, admin.permissions or []))},
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "sagas": [{"id": saga.id, "name": saga.name, "role": m.role, "display_name": member_name(m),
                   "is_archived": saga.is_archived} for m, saga in rows],
    }


def list_accounts(db: Session, user: User, query: str = "") -> list[dict]:
    """Every account (logins with `query`), for system admins who manage accounts."""
    require_permission(user, perms.USERS_MANAGE)
    statement = select(User).order_by(User.login)
    query = (query or "").strip().lower()
    if query:
        statement = statement.where(User.login.like(_like(query), escape="\\"))
    return [_account_out(db, u) for u in db.scalars(statement.limit(500)).all()]


def create_account(db: Session, user: User, login_name: str, password: str) -> dict:
    """An account in no Saga yet: a DM adds it, or System → Sagas makes it a Saga's DM."""
    require_permission(user, perms.USERS_MANAGE)
    made = create_user(db, login_name, password)
    db.commit()
    return _account_out(db, made)


def _account(db: Session, user_id: int) -> User:
    target = db.get(User, user_id)
    if target is None:
        raise NotFound("Account not found")
    return target


def update_account_as_admin(db: Session, user: User, user_id: int, changes: dict) -> dict:
    """A system admin changes an account: its login, whether it can sign in, its password (a new one, typed)."""
    require_permission(user, perms.USERS_MANAGE)
    target = _account(db, user_id)
    root = target.system_admin is not None and target.system_admin.is_root
    if root and target.id != user.id and ("login" in changes or changes.get("password") is not None):
        raise Forbidden("Only the root admin changes the root admin's login or password")
    if "login" in changes:
        login_name = _clean_login(changes["login"])
        if login_name != target.login:
            if db.scalar(select(User).where(User.login == login_name)):
                raise Conflict(f"Login '{login_name}' is already taken")
            target.login = login_name
    if "is_active" in changes:
        active = changes["is_active"]
        if not isinstance(active, bool):
            raise BadRequest("is_active: true or false")
        if not active and (target.id == user.id or root):
            raise BadRequest("You can't turn off your own account or the root admin's")
        target.is_active = active
    if changes.get("password") is not None:
        _check_password(str(changes["password"]))
        target.password_hash = hash_password(str(changes["password"]))
    db.commit()
    return _account_out(db, target)


def delete_account(db: Session, user: User, user_id: int) -> None:
    """An account goes: it leaves every Saga (what it made stays, without its name) and system administration.
    Never the root admin's, your own, or a Saga's only DM (make someone else DM first)."""
    require_permission(user, perms.USERS_MANAGE)
    target = _account(db, user_id)
    if target.id == user.id:
        raise BadRequest("You can't delete your own account")
    if target.system_admin is not None and target.system_admin.is_root:
        raise BadRequest("The root admin's account can't be deleted")
    for m in db.scalars(select(SagaMember).where(SagaMember.user_id == target.id, SagaMember.role == "admin")).all():
        if _admin_count(db, m.saga_id) <= 1:
            saga = db.get(Saga, m.saga_id)
            raise BadRequest(f"It's the only DM of {saga.name if saga else 'a Saga'}: make someone else DM there first")
    from sqlalchemy import update

    from models import SystemSetting

    db.execute(update(SystemAdmin).where(SystemAdmin.created_by_user_id == target.id).values(created_by_user_id=None))
    db.execute(update(SystemSetting).where(SystemSetting.updated_by_user_id == target.id).values(updated_by_user_id=None))
    for m in db.scalars(select(SagaMember).where(SagaMember.user_id == target.id)).all():
        db.execute(GroupMember.__table__.delete().where(GroupMember.member_id == m.id))
        db.delete(m)
    db.flush()
    # Straight to the tables: the ORM would try to blank the system admin row's key (its user) first
    db.execute(SystemAdmin.__table__.delete().where(SystemAdmin.user_id == target.id))
    db.execute(User.__table__.delete().where(User.id == target.id))
    db.commit()
    db.expunge_all()


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


# The Saga's settings (Saga → Settings) and their defaults. action_dice (plan 37): an action's dice are thrown on the
# live Stage's dice roller, in the dice of the character's player.
SAGA_SETTINGS = {"action_dice": True}


def saga_settings(saga: Saga) -> dict:
    """The Saga's settings: what it set, the rest at their defaults."""
    own = saga.settings if isinstance(saga.settings, dict) else {}
    return {key: own.get(key, default) for key, default in SAGA_SETTINGS.items()}


def update_settings(db: Session, member: SagaMember, changes: dict) -> dict:
    """Command: change some of the Saga's settings (its admins)."""
    require_admin(member)
    saga = get_saga(db, member.saga_id)
    settings = saga_settings(saga)
    for key, value in (changes or {}).items():
        if key not in SAGA_SETTINGS:
            raise BadRequest(f"Unknown setting '{key}'")
        if not isinstance(value, bool):
            raise BadRequest(f"{key}: on or off (true or false)")
        settings[key] = value
    saga.settings = settings
    db.commit()
    return settings


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


def _add_member(db: Session, saga: Saga, login_name: str, password: str | None, display_name: str, role: str,
                account: str | None = None) -> SagaMember:
    """Into the Saga, with a role and a display name there (its login until set). `account`: "new" makes the account
    (login and password), "existing" adds one that exists; None (older clients): new with a password, else existing."""
    if role not in perms.ROLES:
        raise BadRequest(f"Role must be one of {perms.ROLES}")
    if account not in (None, "new", "existing"):
        raise BadRequest('account: "new" or "existing"')
    user = db.scalar(select(User).where(User.login == (login_name or "").strip().lower()))
    if account == "existing" or (account is None and not password and user is not None):
        if user is None:
            raise NotFound(f"No account with the login '{(login_name or '').strip().lower()}'")
    elif user is not None:
        raise Conflict(f"Login '{user.login}' is already taken: add that account instead, or pick another login")
    elif not password:
        raise BadRequest("A new account needs a password")
    else:
        user = create_user(db, login_name, password)
    if db.scalar(select(SagaMember).where(SagaMember.saga_id == saga.id, SagaMember.user_id == user.id)):
        raise Conflict("This account is already in the Saga")
    member = SagaMember(saga_id=saga.id, user_id=user.id, role=role, display_name=_clean_name(display_name) or user.login)
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
    """The signed-in person's own account: their password (with the current one). Names are each Saga's (Saga → User)."""
    if "display_name" in data:
        raise BadRequest("A display name is each Saga's: change it on Saga → User")
    if data.get("new_password") is not None:
        if not verify_password(str(data.get("password") or ""), user.password_hash):
            raise BadRequest("The current password is wrong")
        _check_password(str(data["new_password"]))
        user.password_hash = hash_password(str(data["new_password"]))
    db.commit()
    return me(db, user)


def update_my_member(db: Session, member: SagaMember, data: dict) -> dict:
    """The member's own settings in this Saga: display name, colour, dice style, and how dice draw on their screen
    (still, simple)."""
    if "display_name" in data:
        name = _clean_name(data["display_name"])
        if not name:
            raise BadRequest("Give a display name")
        member.display_name = name
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
        **({"live_token": saga.live_token, "settings": saga_settings(saga)} if is_admin else {}),
        **_calendar(db, saga),
        "me": {"member_id": member.id, "role": member.role, "group_ids": sorted(viewer.group_ids),
               "color": member.color, "die_style": member.die_style or "minimal",
               "dice_still": bool(member.dice_still), "dice_simple": bool(member.dice_simple)},
        "members": [
            {"id": m.id, "user_id": m.user_id, "display_name": member_name(m), "role": m.role, "color": colors[m.id],
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


def add_member(db: Session, member: SagaMember, login_name: str, password: str | None, display_name: str, role: str,
               account: str | None = None) -> dict:
    require_admin(member)
    _add_member(db, get_saga(db, member.saga_id), login_name, password, display_name, role, account)
    db.commit()
    return saga_overview(db, member)


def _like(query: str) -> str:
    return "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def search_accounts(db: Session, member: SagaMember, query: str) -> list[dict]:
    """The DM looking for accounts to add (plan 42): logins with what they typed (2 letters or more), active, not in
    the Saga yet; at most 10."""
    require_admin(member)
    query = (query or "").strip().lower()
    if len(query) < 2:
        return []
    inside = select(SagaMember.user_id).where(SagaMember.saga_id == member.saga_id)
    rows = db.scalars(select(User).where(User.login.like(_like(query), escape="\\"), User.is_active.is_(True),
                                         User.id.not_in(inside)).order_by(User.login).limit(10)).all()
    return [{"user_id": u.id, "login": u.login} for u in rows]


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
