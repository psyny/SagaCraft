"""SQLAlchemy tables. Importing this package registers all of them on Base.metadata."""
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Accounts and system administration
# ---------------------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    login: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    system_admin: Mapped["SystemAdmin | None"] = relationship(
        back_populates="user", uselist=False, foreign_keys="SystemAdmin.user_id"
    )


class SystemAdmin(Base):
    __tablename__ = "system_admins"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    is_root: Mapped[bool] = mapped_column(Boolean, default=False)
    permissions: Mapped[list] = mapped_column(JSON, default=list)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="system_admin", foreign_keys=[user_id])


class SystemSetting(Base):
    """Instance-wide settings edited by system admins (e.g. upload limits). Value is JSON."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ---------------------------------------------------------------------------
# Sagas, members and groups
# ---------------------------------------------------------------------------


class Saga(Base):
    __tablename__ = "sagas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    ruleset_key: Mapped[str] = mapped_column(String(80))
    live_stage_id: Mapped[int | None] = mapped_column(
        ForeignKey("stages.id", ondelete="SET NULL", use_alter=True, name="fk_sagas_live_stage"), nullable=True
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    # Default display template per kind and type: {"character": {"pc": template_id, ...}}
    display_defaults: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # The Saga's own Saga template (variables, types, starting content), edited on the Template page. None: the
    # built-in one named by ruleset_key, until the first edit. template_version changes with every edit.
    template: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    template_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    # The Saga template's starting categories and groups were created (once: deleted defaults stay deleted)
    template_applied: Mapped[bool] = mapped_column(Boolean, default=False)
    # In-world calendar (domain/calendar.py; None: the Saga template's, else Twelve Moons) and "today in the story"
    calendar: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    story_date: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SagaMember(Base):
    __tablename__ = "saga_members"
    __table_args__ = (UniqueConstraint("saga_id", "user_id", name="uq_member_saga_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # admin | player | viewer
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship()


class Group(Base):
    """A member group (visibility). Groups of characters are CharacterGroup."""

    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    # Default groups have a key (admins, players, viewers); custom groups have none.
    key: Mapped[str | None] = mapped_column(String(20), nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class GroupMember(Base):
    """Membership of custom groups. Default groups follow the member's role and have no rows here."""

    __tablename__ = "group_members"

    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("saga_members.id", ondelete="CASCADE"), primary_key=True)


# ---------------------------------------------------------------------------
# Resources and files
# ---------------------------------------------------------------------------


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(40))  # document | character | location | item | event
    type: Mapped[str] = mapped_column(String(80))  # ruleset type key, e.g. pc, npc
    name: Mapped[str] = mapped_column(String(200))  # copy of the "name" attribute, for lists and search
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)
    visibility: Mapped[dict] = mapped_column(JSON, default=dict)
    # How non-admins see the name: {"alias": "Hooded figure" | None, "hide_name": bool}
    presentation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Characters: their category (picks the type) and whether Sets get instances of them
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("character_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    instanceable: Mapped[bool] = mapped_column(Boolean, default=False)
    # Documents: the folder they're filed in (one level, no sub-folders); None = not in a folder
    folder_id: Mapped[int | None] = mapped_column(
        ForeignKey("resource_folders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # The DM's tags (any kind; e.g. "dungeon", "capital"), seen by whoever sees the resource
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_by_member_id: Mapped[int | None] = mapped_column(
        ForeignKey("saga_members.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    map: Mapped["LocationMap | None"] = relationship(uselist=False, cascade="all, delete-orphan", passive_deletes=True)


class LocationMap(Base):
    """A location's map: pictures, grid, fog per member group, links on tiles, paths. See domain/maps.py."""

    __tablename__ = "location_maps"

    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)  # changes with every edit (players' composed picture)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ResourceFolder(Base):
    """A folder the DM files resources of one kind in (documents for now). One level: no sub-folders.
    Members see a folder's name only when it holds something they can see. See docs/concepts/rulesets.md."""

    __tablename__ = "resource_folders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(40))  # the resource kind it holds: document
    name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RelationshipType(Base):
    """A member group's own relationship type, on top of the app's predefined ones (domain/relationships.py)."""

    __tablename__ = "relationship_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(60))
    inverse: Mapped[str] = mapped_column(String(60), default="")  # "killed by": read from the other side
    directed: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Relationship(Base):
    """A typed link between two resources ("A killed B"), user data. It belongs to one member group: what that
    group knows. See docs/concepts/relationships.md."""

    __tablename__ = "relationships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), index=True)
    from_id: Mapped[int] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    to_id: Mapped[int] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    # A predefined type (its key) or the group's own (its id)
    type_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    type_id: Mapped[int | None] = mapped_column(ForeignKey("relationship_types.id"), nullable=True)
    note: Mapped[str] = mapped_column(String(300), default="")
    start_date: Mapped[int | None] = mapped_column(Integer, nullable=True)  # None: always
    end_date: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # The event it started at (its relationship sub-event); owns_event: the event was made for it
    event_id: Mapped[int | None] = mapped_column(ForeignKey("resources.id", ondelete="SET NULL"), nullable=True, index=True)
    owns_event: Mapped[bool] = mapped_column(Boolean, default=False)
    # A revealed copy: the relationship it was copied from
    source_id: Mapped[int | None] = mapped_column(ForeignKey("relationships.id", ondelete="SET NULL"), nullable=True)
    created_by_member_id: Mapped[int | None] = mapped_column(ForeignKey("saga_members.id", ondelete="SET NULL"), nullable=True)
    created_role: Mapped[str] = mapped_column(String(20), default="admin")  # admin | player
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class SubEvent(Base):
    """A resource sub-event: what happened to one resource in an event ("Old Bridge: discovered"). Relationship
    sub-events are relationships with event_id. See docs/concepts/events.md."""

    __tablename__ = "sub_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    what: Mapped[str] = mapped_column(String(40))
    note: Mapped[str] = mapped_column(String(300), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Era(Base):
    """A named in-world period ("The Long War"): a start date and an end date (None while it goes on)."""

    __tablename__ = "eras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    start_date: Mapped[int] = mapped_column(Integer)
    end_date: Mapped[int | None] = mapped_column(Integer, nullable=True)
    color: Mapped[str] = mapped_column(String(7), default="#b08a3e")
    note: Mapped[str] = mapped_column(String(300), default="")
    visibility: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FogPreset(Base):
    """How map Sets draw the fog of war (display, style, colours, controls), built by the DM. See domain/fog.py."""

    __tablename__ = "fog_presets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    look: Mapped[dict] = mapped_column(JSON, default=dict)


class CharacterCategory(Base):
    """How a Saga organizes its characters (Player, DM, NPC...). Based on a ruleset type. See docs/concepts/characters.md."""

    __tablename__ = "character_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    key: Mapped[str | None] = mapped_column(String(80), nullable=True)  # from the Saga template; None for the DM's own
    name: Mapped[str] = mapped_column(String(120))
    plural: Mapped[str] = mapped_column(String(120), default="")
    type: Mapped[str] = mapped_column(String(80))  # ruleset type key (kind character)
    player: Mapped[bool] = mapped_column(Boolean, default=False)  # player characters (never instanceable)
    instanceable: Mapped[bool] = mapped_column(Boolean, default=False)  # default for new characters
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CharacterGroup(Base):
    """A set of characters that go together (a party, an encounter). Not a member group (see Group)."""

    __tablename__ = "character_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    player_party: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    # Its cards' color (current-turn highlight, "group" colored values)
    color: Mapped[str] = mapped_column(String(9), default="#6cc9e0", server_default="#6cc9e0")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    members: Mapped[list["CharacterGroupMember"]] = relationship(
        cascade="all, delete-orphan", order_by="CharacterGroupMember.sort_order"
    )


class CharacterGroupMember(Base):
    __tablename__ = "character_group_members"

    group_id: Mapped[int] = mapped_column(ForeignKey("character_groups.id", ondelete="CASCADE"), primary_key=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=1)  # instanceable characters: how many instances
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class DisplayTemplate(Base):
    """How a kind's resources (characters for now) are displayed in each display mode. See domain/display.py."""

    __tablename__ = "display_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(40), default="character")
    name: Mapped[str] = mapped_column(String(120))
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class StoredFile(Base):
    """Uploaded file. v1 keeps the bytes in Postgres (Railway-safe); object storage comes later."""

    __tablename__ = "files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(40), default="character")
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_by_member_id: Mapped[int | None] = mapped_column(
        ForeignKey("saga_members.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------------------
# Stages
# ---------------------------------------------------------------------------


class Environment(Base):
    """An EFX environment, built by the DM: three layers of effects (far, near, fore) shown by a Stage's EFX Sets.
    See domain/efx.py and docs/concepts/efx.md."""

    __tablename__ = "environments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    far: Mapped[dict] = mapped_column(JSON, default=dict)
    near: Mapped[dict] = mapped_column(JSON, default=dict)
    fore: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Stage(Base):
    __tablename__ = "stages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    saga_id: Mapped[int] = mapped_column(ForeignKey("sagas.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # canvas: Sets on a pannable, zoomable world; interface: Sets fixed to the screen (anchors, % sizes)
    layout: Mapped[str] = mapped_column(String(20), default="canvas", server_default="canvas")
    # Its environment (EFX): what its EFX Sets (far, near, fore) show; switched live by the EFX Controls Set
    environment_id: Mapped[int | None] = mapped_column(ForeignKey("environments.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sets: Mapped[list["StageSet"]] = relationship(
        back_populates="stage", cascade="all, delete-orphan", order_by="StageSet.layer"
    )


class StageSet(Base):
    __tablename__ = "stage_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stage_id: Mapped[int] = mapped_column(ForeignKey("stages.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(60))
    name: Mapped[str] = mapped_column(String(160))
    x: Mapped[int] = mapped_column(Integer, default=0)
    y: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int] = mapped_column(Integer, default=800)
    height: Mapped[int] = mapped_column(Integer, default=500)
    layer: Mapped[int] = mapped_column(Integer, default=0)
    # No background, border or title bar for players: lets Sets sit over a background image
    transparent: Mapped[bool] = mapped_column(Boolean, default=False)
    # Put away for now (the eye on its toolbar): drawn for no one, players don't even get it; the DM keeps its main
    # toolbar to bring it back
    off: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Interface layout: where it sits on the screen {anchor, width, height, x, y} (% of the screen); see
    # domain/stage_layout.py
    screen: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Where its toolbars sit, what the DM changed from the Set type's defaults: {key: {anchor, vertical, x, y,
    # size, hidden, outside}}; see domain/stage_layout.py
    toolbars: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    visibility: Mapped[dict] = mapped_column(JSON, default=dict)
    config: Mapped[dict] = mapped_column(JSON, default=dict)

    stage: Mapped[Stage] = relationship(back_populates="sets")
    actors: Mapped[list["StageActor"]] = relationship(
        back_populates="stage_set", cascade="all, delete-orphan", order_by="StageActor.sort_order"
    )


class StageActor(Base):
    __tablename__ = "stage_actors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    set_id: Mapped[int] = mapped_column(ForeignKey("stage_sets.id", ondelete="CASCADE"), index=True)
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    position: Mapped[dict] = mapped_column(JSON, default=dict)  # {x, y} inside the Set (free layouts)
    visibility: Mapped[dict] = mapped_column(JSON, default=dict)
    config: Mapped[dict] = mapped_column(JSON, default=dict)

    stage_set: Mapped[StageSet] = relationship(back_populates="actors")
    resource: Mapped[Resource | None] = relationship()
